# Design

## Context

Motivación en `proposal.md` (Why). Estado actual relevante:

- `TcpServer.Client` tiene un hilo virtual *writer* que toma tramas de una cola (`Pending(frame, userId, conversationId)`). Para cada trama llama a `authenticated()` (1 consulta de `credential_version`) y, si la trama está ligada a una conversación, `Service.withConversationAccess` abre una transacción con `FOR SHARE` y escribe **dentro** de ella.
- `notify` corre en el hilo del remitente y llama a `client.authenticated()` por cada cliente conectado (otra consulta por cliente).
- `Database` usa Hikari con `maximumPoolSize = 5`, `connectionTimeout = 10 s` y `queryTimeout = 15 s`.
- `reset-pin` corre como un **proceso separado** (CLI de admin) que solo modifica la BD; el servidor no tiene ningún canal para enterarse.
- Los requirements están en `specs/*/spec.md` de este cambio.

## Goals / Non-Goals

**Goals:**
- Que ningún recurso de BD dependa de la velocidad de lectura de un cliente.
- Que el costo en BD de un mensaje en General sea O(destinatarios) en el peor caso y casi O(1) en estado estable, no 3N transacciones.
- Que los errores deterministas no se reintenten.

**Non-Goals:**
- Escalar horizontalmente (varias instancias del servidor). Las sesiones siguen en memoria.
- Cambiar el formato de trama o el número de versión del protocolo (`v:1`).
- Cambiar el modelo de una sola mutación pendiente en el móvil.

## Decisions

### D1. Verificar y luego escribir, sin lock durante la escritura
El writer verifica la membresía con `Service.canAccess` (transacción corta, sin `FOR SHARE`), suelta la conexión y luego escribe con el plazo de 10 s.
- *Alternativa descartada:* mantener `FOR SHARE` y subir el pool. Solo mueve el umbral; un atacante abre más sockets.
- *Alternativa descartada:* caché de membresías en memoria invalidada por `groups.remove`. Más rápido, pero añade un segundo estado que puede divergir; se deja para cuando la latencia lo pida.
- Garantía resultante (documentada en `docs/protocol.md`): una trama cuya verificación ocurre después del commit de la remoción no se entrega. La ventana entre verificación y escritura existía ya en la práctica para bytes en buffers de TCP; ahora es explícita.

### D2. Caché de credenciales por sesión con revalidación cada 5 s
`Session` guarda `validatedAt` (monotónico). `authenticated()` consulta la BD solo si pasaron más de 5 s; si la versión cambió, elimina la sesión del registro y la marca revocada. Como las sesiones se comparten por token, la revalidación de una conexión beneficia a las demás conexiones con el mismo token.
- *Alternativa descartada:* `LISTEN/NOTIFY` de PostgreSQL desde `reset-pin`. Invalidación inmediata, pero requiere una conexión dedicada fuera del pool, reconexión y manejo de notificaciones perdidas. Para un CLI usado manualmente, 5 s de demora es aceptable.
- *Alternativa descartada:* seguir consultando por request pero no por trama. Reduce menos y deja el camino de `notify` pesado.
- En `notify`, la identidad del destinatario se lee del estado cacheado del cliente (sin BD); el writer vuelve a aplicar la revalidación con TTL antes de escribir.

### D3. Clasificación por SQLSTATE
Función `isTransient(SQLException)`: recorre la cadena de causas y `nextException`; transitorio si la clase de SQLSTATE es `08`, `40`, `53`, `57`, o si es `SQLTransientConnectionException` (timeout del pool de Hikari, sin SQLSTATE). Transitorio → `UNAVAILABLE`; resto → `INTERNAL` y se registra solo la clase SQLSTATE (nunca el mensaje, que puede contener datos).
- En el móvil, `PendingMutation.settle` deja de excluir `INTERNAL`: solo `UNAVAILABLE` y `UNAUTHENTICATED` conservan el pendiente. `engine.reconcile` aplica la misma lista.
- *Riesgo aceptado:* un `INTERNAL` por bug transitorio del servidor descarta el pendiente. Como la confirmación solo ocurre tras commit, `INTERNAL` implica que no hubo efecto, así que no hay duplicado ni pérdida silenciosa: el usuario ve el error y puede reintentar a mano.

### D4. LoginLimiter
- `LinkedHashMap` en orden de inserción; al llegar a la capacidad, se expulsa la entrada más antigua.
- API en dos pasos: `check(key, max)` (solo lee y rechaza si ya llegó al máximo) y `fail(key)` (incrementa). `TcpServer` llama `check` para IP y cuenta, intenta adquirir `pinWorkers` (si falla, `RATE_LIMITED` sin incrementar), verifica y solo ante `INVALID_CREDENTIALS` llama `fail` para ambas claves.
- *Riesgo:* ráfagas concurrentes de la misma cuenta pueden pasar `check` antes de que se registre `fail`; está acotado por `pinWorkers = 4`, así que como máximo unos 4 intentos extra por ventana. Aceptable.

### D5. Retención de `processed_requests`
Migración `V2`: `ALTER TABLE processed_requests ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()` e índice sobre `created_at`. Las filas existentes reciben `now()` y se purgan al terminar la primera retención completa. Un `ScheduledExecutorService` del servidor ejecuta `DELETE ... WHERE created_at < now() - make_interval(days => ?)` al arrancar y cada hora, borrando en lotes de 10 000 filas para no mantener locks largos. Retención configurable con `PROCESSED_REQUEST_RETENTION_DAYS` (por defecto 30, mínimo 1).
- Supuesto: ningún pendiente móvil vive más de 30 días sin reconectar; si lo hiciera, su reintento podría duplicarse. Se documenta en `docs/protocol.md`.

### D6. Destinatarios de `conversations.changed`
`Service.affectedUsers(operation, payload, result)` devuelve los ids: miembros actuales de la conversación (`result.conversation.id` o `payload.conversationId`) más, en `groups.remove`, el id del integrante retirado (resuelto por matrícula). Se calcula en una transacción corta después del commit y `notify` envía solo a los clientes con esos ids (identidad desde caché, D2).

### D7. Aviso de vencimiento TLS
`Tls.serverContext` ya valida vigencia al arrancar. Se añade `Tls.earliestExpiry(keystore)` y una tarea programada (al arrancar y cada 24 h) que escribe en stderr si faltan menos de 30 días. Reusa el mismo planificador de D5.

### D8. Cambios internos
- `writer` pasa a `@Volatile`. El formateo y las compilaciones alpha se planifican en el cambio `alpha-release`.

### D9. Hallazgos durante la implementación
- **Cierre que no bloquea.** `SSLSocket.close()` espera el lock de registros TLS para enviar `close_notify`; si el writer está bloqueado escribiendo a un cliente que no lee, el cierre se colgaba en el hilo que lo pedía (por ejemplo, el remitente que desborda la cola de 128 tramas de otro cliente). Ahora `close()` interrumpe primero al writer (en hilos virtuales, interrumpir la E/S de socket cierra el socket) y cierra en un hilo virtual propio con interrupción de respaldo a los 2 s. Lo cubre la prueba de clientes lentos.
- **Una sola escritura por trama.** `Frames.write` escribía cabecera y cuerpo por separado, generando dos registros TLS y esperas de ~40 ms por Nagle + ACK retardado. Ahora se escribe en una sola llamada.

## Risks / Trade-offs

- [Ventana de revocación de hasta 5 s tras `reset-pin`] → Documentada; el administrador puede reiniciar el servidor si necesita revocación inmediata (las sesiones viven en memoria).
- [Trama verificada justo antes de una remoción se entrega] → Mismo límite físico que antes (bytes ya en el buffer TCP no se recuperan); documentado.
- [Purga borra el registro de un pendiente muy antiguo] → Retención configurable y documentada; 30 días por defecto.

## Migration Plan

1. Desplegar el servidor: Flyway aplica `V2` automáticamente al arrancar (solo añade una columna con default; no bloquea por mucho tiempo en tablas pequeñas).
2. Compatibilidad: el protocolo no cambia de forma; clientes antiguos siguen funcionando. Un cliente antiguo conserva el pendiente ante `INTERNAL` (comportamiento previo); los nuevos lo descartan.
3. Rollback: volver a la imagen anterior es seguro; la columna `created_at` queda sin usar y Flyway no exige revertirla.
