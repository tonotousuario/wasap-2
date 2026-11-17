# Proposal

## Why

La app solo admite una mutación pendiente: no se puede escribir un segundo mensaje hasta que el servidor confirme el primero. En una conversación fluida eso se nota como un bloqueo del compositor, sobre todo si la red está lenta.

## What Changes

- La app mantiene una **cola de salida** durable y ordenada de hasta 20 mensajes (`messages.send`), que se envían uno a uno en el orden en que se escribieron.
- Los mensajes en cola se muestran en el hilo como "pendiente" y pasan a confirmados al recibir respuesta; un error definitivo marca solo ese mensaje como "no enviado" y la cola continúa.
- Las demás mutaciones (asistencia, privados, grupos) siguen siendo de una en una: no pueden empezar mientras haya algo en la cola, y no se pueden encolar mensajes mientras una de ellas está pendiente.
- Se conserva la regla de no crear acciones sin conexión.
- El aviso al cerrar sesión indica cuántas operaciones se descartarán.
- Sin cambios en el servidor ni en el protocolo: cada mensaje conserva su UUID y la idempotencia existente garantiza que no haya duplicados.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `mobile-pending-operations`: de una sola mutación pendiente a una cola de mensajes con exclusión para las demás mutaciones.
- `mobile-experience`: el hilo muestra mensajes en cola y no enviados.

## Impact

- **Móvil**: `src/state.ts` (`PendingMutation` → diario con cola), `src/engine.ts` (envío secuencial, reconciliación, `pendingType`/conteo), `src/screens/Thread.tsx` (burbujas pendientes y no enviadas, compositor), `src/App.tsx` y `Settings.tsx` (avisos), pruebas en `tests/state.test.ts` y `tests/engine.test.ts`.
- **Almacenamiento local**: formato nuevo del diario con migración del formato de un solo pendiente.
- **Depende de** `harden-server-load-resilience` (qué errores conservan el pendiente).
