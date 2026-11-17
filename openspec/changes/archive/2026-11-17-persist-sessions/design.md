# Design

## Context

Hoy `Sessions` es un `ConcurrentHashMap` en memoria y la revocación por PIN se detecta comparando `credential_version`. `harden-server-load-resilience` añade una caché de validación con TTL de 5 s y un planificador de tareas, que este cambio reutiliza. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** sobrevivir reinicios, revocar de forma explícita y no guardar tokens en claro.

**Non-Goals:** varias instancias del servidor detrás de un balanceador (posible después, no se valida aquí); tokens de refresco; cambiar la duración de 24 h.

## Decisions

### D1. Tabla `sessions` con hash del token
`sessions(token_hash bytea PK, user_id uuid FK ON DELETE CASCADE, credential_version int, created_at, expires_at)` con índice en `(user_id, expires_at)`. El hash es SHA-256 del token: sin sal, porque el token ya tiene 256 bits aleatorios y una búsqueda exacta necesita un hash determinista.
- *Alternativa descartada:* bcrypt/PBKDF2 del token. No aporta seguridad con 256 bits de entropía y haría imposible buscar por token.

### D2. Caché en memoria sobre la BD
`Sessions.get(token)` busca primero en una caché en memoria y solo va a la BD si no está ahí (por ejemplo, tras un reinicio). La revalidación con TTL de 5 s de `harden-server-load-resilience` comprueba ahora que la fila siga existiendo **y** que `credential_version` coincida, en una sola consulta.

### D3. Revocación
`resetPin` borra las filas `sessions` del usuario en su transacción. El CLI corre en otro proceso, así que el servidor vivo lo detecta en la siguiente revalidación (≤ 5 s). `auth.resume` siempre consulta la BD, de modo que reanudar tras el borrado falla de inmediato. `admin users logout` hace lo mismo sin cambiar el PIN.

### D4. Límite de 5 sesiones
Al crear una sesión, en la misma transacción se borran las vencidas del usuario y, si quedan 5 o más, las que vencen antes.

### D5. Purga
Tarea horaria en el planificador existente: `DELETE FROM sessions WHERE expires_at < now()`.

## Risks / Trade-offs

- [Robo de la BD + token en tránsito] → El token solo viaja por TLS y en la BD solo hay hashes.
- [Los clientes antiguos esperan perder la sesión al reiniciar] → No se rompe nada: simplemente no se les pide login.
- [Login escribe en la BD] → Una inserción por login; insignificante frente a PBKDF2.

## Migration Plan

1. Flyway aplica `V3` al arrancar. Las sesiones en memoria previas al despliegue se pierden una última vez.
2. Rollback: la imagen anterior ignora la tabla; los usuarios vuelven a iniciar sesión.
