# Design

## Context

Tras `harden-server-load-resilience`, cada trama ligada a una conversación verifica permiso con una transacción corta, y cada mensaje del General se encola para todos los clientes; la sesión se revalida cada 5 s. El pool de Hikari tiene 5 conexiones fijas. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** demostrar 2 000 conexiones en una instancia y eliminar los cuellos conocidos.

**Non-Goals:** varias instancias, balanceador o sharding (solo se prepara la interfaz de eventos).

## Decisions

### D1. Caché de membresía para la entrega
Mapa en memoria `conversationId -> miembros` invalidado en la misma transacción que `groups.add/remove` (callback tras commit). El writer consulta la caché; si falta la entrada, va a la base. La garantía de `event-delivery` se mantiene porque la invalidación ocurre antes de responder a la remoción. Para General no hay consulta: todos los autenticados acceden.

### D2. Pool y límites
`DB_POOL_SIZE` (por defecto 20) y `MAX_CONNECTIONS` (por defecto 2 500, hoy 256 fijo). Los hilos virtuales no limitan; lo hacen el pool y la memoria (≈ 64 KB de búfer por conexión).

### D3. Interfaz `EventBus`
`publish(event, audience)` / `subscribe(handler)`. La implementación actual es en memoria. Una implementación `PostgresEventBus` con `LISTEN/NOTIFY` (carga útil ≤ 8 KB, se manda solo el ID y se lee el resto) queda descrita aquí pero no se construye.

### D4. Generador de carga
Módulo de pruebas Kotlin (`loadTest`, tarea Gradle aparte) con hilos virtuales: crea N usuarios de prueba en un esquema temporal, abre N conexiones TLS, mide con HdrHistogram y comprueba en la base que cada UUID produjo un solo efecto.

## Risks / Trade-offs

- [Hardware de referencia distinto al de la escuela] → El informe registra la máquina usada; la prueba es parametrizable.
- [Caché de membresía desincronizada] → Invalidación en commit y prueba de integración de retirada con caché caliente.

## Migration Plan

Sin migraciones de datos salvo índices (`CREATE INDEX CONCURRENTLY` documentado si la base ya es grande). Variables nuevas con valores por defecto.
