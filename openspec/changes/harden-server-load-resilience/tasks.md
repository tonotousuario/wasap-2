# Tasks

## 1. Clasificación de errores SQL (request-errors)

- [x] 1.1 Añadir `isTransient(SQLException)` (clases SQLSTATE 08/40/53/57 y `SQLTransientConnectionException`, recorriendo causas) y prueba unitaria en `ProtocolTest` que cubra cada clase, `23505`, `22P05` y una excepción sin SQLSTATE; verificar con `./gradlew test`
- [x] 1.2 En `TcpServer` mapear transitorio → `UNAVAILABLE` y el resto → `INTERNAL` registrando solo la clase SQLSTATE; verificar con prueba de integración que un payload con `\u0000` en un campo extra de `messages.send` devuelve `INTERNAL` (`./gradlew integrationTest`)
- [x] 1.3 En `mobile/src/state.ts` y `engine.ts` conservar el pendiente solo ante `UNAVAILABLE`/`UNAUTHENTICATED`; actualizar `tests/state.test.ts` con un caso `INTERNAL` que descarta y verificar con `npm test`
- [x] 1.4 Documentar en `docs/protocol.md` qué códigos son reintentables y verificar que la tabla de errores coincide con el código

## 2. Caché de credenciales de sesión (session-auth)

- [x] 2.1 Añadir a `Session` el estado de revalidación (instante monotónico y bandera de revocada) y en `Sessions` un método de revalidación con TTL de 5 s inyectable (reloj de prueba); prueba unitaria que confirme 1 consulta por ventana y revocación al cambiar la versión; verificar con `./gradlew test`
- [x] 2.2 Usar la revalidación con TTL en `authenticated()`, en el writer y leer la identidad cacheada (sin BD) en `notify`; verificar con prueba de integración que tras `resetPin` y avanzar el reloj más de 5 s el siguiente request da `UNAUTHENTICATED`
- [x] 2.3 Documentar en `docs/protocol.md` y `README.md` (sección Administración) la demora máxima de 5 s de revocación tras `reset-pin`

## 3. Limitador de login (session-auth)

- [x] 3.1 Reescribir `LoginLimiter` con `check`/`fail` separados y expulsión de la ventana más antigua al llegar a la capacidad; pruebas unitarias para: 6 logins exitosos sin bloqueo, sexto fallo bloqueado, tabla llena que admite una clave nueva; verificar con `./gradlew test`
- [x] 3.2 Integrar en `TcpServer.auth.login`: `check` → `pinWorkers` (rechazo sin contar) → verificar → `fail` solo ante `INVALID_CREDENTIALS`; verificar con `TlsServerTest` o prueba equivalente que un login exitoso no incrementa el contador

## 4. Entrega de tramas sin locks (event-delivery)

- [x] 4.1 Marcar `writer` como `@Volatile` y cambiar el writer para verificar acceso con `Service.canAccess` (transacción corta) antes de escribir, fuera de cualquier transacción; eliminar `withConversationAccess` si queda sin uso; verificar con `./gradlew test`
- [x] 4.2 Prueba de integración: un cliente TLS autenticado en General que no lee mientras otro usuario envía mensajes; los envíos y un `ping` de un tercer cliente responden en menos de 2 s; verificar con `./gradlew integrationTest`
- [x] 4.3 Prueba de integración: remoción de un integrante comprometida antes de la verificación impide entregarle `message.created`
- [x] 4.4 Implementar `Service.affectedUsers` y enviar `conversations.changed` solo a esos usuarios (incluido el retirado en `groups.remove`); pruebas de integración para agregar, retirar y abrir privado que confirmen que un usuario ajeno no recibe el evento
- [x] 4.5 Actualizar `docs/protocol.md` (sección Guarantees y eventos) con la nueva garantía de revocación y los destinatarios de `conversations.changed`; actualizar `docs/architecture.md` si describe el lock durante la escritura

## 5. Retención de solicitudes procesadas (request-idempotency)

- [x] 5.1 Crear `V2__processed_requests_created_at.sql` (columna `created_at` con default e índice); verificar que Flyway migra un esquema temporal en `./gradlew integrationTest`
- [x] 5.2 Implementar purga por lotes y su programación (al arrancar y cada hora) con `PROCESSED_REQUEST_RETENTION_DAYS` (default 30, mínimo 1, valor inválido impide arrancar); prueba de integración que purgue una fila antigua y conserve una reciente
- [x] 5.3 Documentar la variable en `README.md`, `.env.example`, `compose.yaml` y `docs/protocol.md` (supuesto de 30 días para pendientes móviles)

## 6. Aviso de vencimiento TLS (tls-certificates)

- [x] 6.1 Añadir cálculo del vencimiento más cercano del keystore y tarea diaria que avise en stderr si faltan menos de 30 días; prueba en `TlsServerTest` con certificados generados de 10 y 200 días que verifique el aviso solo en el primero
- [x] 6.2 Documentar el aviso y cómo renovar en `README.md` (sección de certificados)

## 7. Verificación integrada

- [x] 7.1 Ejecutar `./gradlew test integrationTest` con `compose.test.yaml`, `npm test` y `npx tsc --noEmit` en `mobile/`; todos deben pasar
- [x] 7.2 Levantar `compose.local.yaml`, iniciar el AVD `Medium_Phone_API_37.0` por CLI, instalar el build de desarrollo y verificar a mano: login, entrada/salida, chat General, privado, grupo con alta/baja y error de servidor caído con reconexión
- [x] 7.3 Ejecutar `node scripts/test-interop.mjs` con las variables que indique su cabecera y verificar que la interoperabilidad cliente/servidor sigue pasando

## Workflow follow-up

- Archivar el cambio con `openspec archive harden-server-load-resilience` cuando la revisión esté satisfecha, para crear las specs principales.
- El formateo masivo y las compilaciones alpha (APK e iOS) están en el cambio `alpha-release`, que se aplica al final.
