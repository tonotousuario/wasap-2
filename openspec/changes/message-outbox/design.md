# Design

## Context

`PendingMutation` (`state.ts`) guarda una sola operación bajo la clave `pending:<scope>` y expone `run`/`replay`. `Engine.mutate` bloquea mientras `state.pending` sea verdadero. `Thread.tsx` guarda en memoria un único `unconfirmedSends` por conversación. El servidor ya es idempotente por UUID y asigna `seq` en orden de commit. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** escribir varios mensajes sin esperar; orden preservado; ningún duplicado ni pérdida silenciosa.

**Non-Goals:** encolar sin conexión; envío en paralelo; cola para asistencia o grupos.

## Decisions

### D1. Diario como lista ordenada en una sola clave
`outbox:<scope>` guarda un arreglo JSON `[{id,type,payload,createdAt}]`. Escribir el arreglo completo es atómico en AsyncStorage, lo que evita estados a medias entre varias claves. La clave anterior `pending:<scope>` se lee al iniciar, se convierte en el primer elemento y se borra (migración).

### D2. Envío secuencial con un solo vuelo
Un solo bucle de vaciado (`drain`) envía el primer elemento, espera respuesta y lo quita. Enviar en paralelo podría invertir el orden de commit en el servidor y, con él, el `seq`. En LAN el costo es mínimo.
- *Alternativa descartada:* paralelo con reordenamiento por `seq` en la UI. El orden mostrado no coincidiría con el orden en que se escribió.

### D3. Clasificación de errores
Usa la lista de `harden-server-load-resilience`: `UNAVAILABLE`/`UNAUTHENTICATED`/sin respuesta detienen el vaciado; cualquier otro código descarta el elemento y lo registra en `state.failed[conversationId]` (en memoria, con texto y motivo) para mostrarlo.

### D4. Exclusión de otras mutaciones
`mutate()` para tipos distintos de `messages.send` exige el diario vacío y escribe un solo elemento; `enqueueMessage()` exige que el diario no contenga otros tipos. `state.pending` pasa a `pendingCount` y `pendingType` describe el primer elemento.

### D5. UI
`Thread` deja de usar `unconfirmedSends` y deriva las burbujas pendientes del diario filtrado por conversación. El compositor se limpia al encolar (el texto ya es durable en el diario).

## Risks / Trade-offs

- [El texto de un mensaje no enviado vive solo en memoria] → Se ofrece copiarlo al compositor; al reiniciar la app se pierde el aviso, no el texto confirmado. Aceptado.
- [Asistencia bloqueada detrás de 20 mensajes] → En LAN la cola se vacía en milisegundos; el aviso explica la espera.
- [Diario grande en AsyncStorage] → 20 × 4000 caracteres ≈ 160 KB como máximo; aceptable.

## Migration Plan

La app migra el formato anterior al arrancar (D1). Sin cambios de servidor. Rollback: una versión anterior no lee `outbox:` y simplemente no ve esos pendientes; se documenta que no se debe volver atrás con mensajes en cola.
