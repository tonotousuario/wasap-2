# Tasks

## 1. Diario con cola

- [ ] 1.1 Reemplazar `PendingMutation` por un diario ordenado (`outbox:<scope>`) con `enqueue`, `peek`, `remove`, `count` y migración desde `pending:<scope>`; pruebas en `tests/state.test.ts` para orden, límite de 20, exclusión de otros tipos y migración; verificar con `npm test`
- [ ] 1.2 Implementar el vaciado secuencial en `engine.ts` (`enqueueMessage`, `drain`, reconciliación al reconectar) con la clasificación de errores; pruebas en `tests/engine.test.ts`: dos mensajes en orden, `UNAVAILABLE` detiene sin descartar, `FORBIDDEN` descarta solo uno y continúa, reinicio con cola reanuda con los mismos UUID

## 2. Interfaz

- [ ] 2.1 `Thread.tsx`: burbujas pendientes derivadas del diario, mensajes no enviados con motivo y acciones copiar/descartar, compositor que se limpia al encolar y bloqueo con cola llena; verificar con `npx tsc --noEmit`
- [ ] 2.2 Avisos en `App.tsx`, `Attendance.tsx` y `Settings.tsx` con el número de pendientes y el bloqueo de asistencia mientras haya cola; verificar con `npx tsc --noEmit`
- [ ] 2.3 Actualizar `mobile/README.md` y `docs/protocol.md` (sección del cliente) con la cola de salida

## 3. Verificación integrada

- [ ] 3.1 En el AVD contra el servidor local, con el servidor pausado (`docker compose pause server`): enviar 3 mensajes, verificar que la app los deja pendientes; reanudar y verificar que llegan en orden sin duplicados a otro usuario
