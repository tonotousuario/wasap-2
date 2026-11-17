# Proposal

## Why

El servidor usa PostgreSQL como fuente de verdad dentro del camino caliente de envío de tramas. El writer de cada socket abre una transacción con `FOR SHARE` y la mantiene mientras escribe por TLS (hasta 10 s), y `authenticated()` consulta `credential_version` en cada request, en cada trama saliente y por cada destinatario de un evento. Con un pool de 5 conexiones, cinco clientes autenticados que dejen de leer agotan la BD para todo el servidor, y un solo cliente lento frena el chat General. Además, cualquier `SQLException` se reporta como `UNAVAILABLE` (reintentable), lo que puede dejar en el móvil un pendiente que se reintenta para siempre y bloquea nuevas mutaciones; y el limitador de login permite bloquear el acceso de todos llenando su tabla. Conviene resolverlo antes de un despliegue con más usuarios.

## What Changes

- El writer verifica el permiso de entrega en una transacción corta y **no mantiene locks ni conexiones de BD mientras escribe al socket**. **BREAKING (contrato documentado)**: `docs/protocol.md` deja de prometer que el lock compartido se mantiene hasta terminar la escritura; la revocación se aplica a tramas cuya verificación ocurra después del commit de la remoción.
- La versión de credenciales se cachea en la sesión y se revalida contra la BD como máximo una vez cada pocos segundos por sesión (en lugar de por request/trama/destinatario). `reset-pin` sigue invalidando sesiones, con una demora acotada.
- Los errores SQL se clasifican por `sqlState`: solo los transitorios (conexión, recursos, cancelación, serialización/deadlock) devuelven `UNAVAILABLE`; los deterministas devuelven `INTERNAL`. El móvil descarta el pendiente al recibir `INTERNAL` en lugar de reintentarlo indefinidamente.
- El limitador de login expulsa la ventana más antigua cuando se llena, no cuenta los logins exitosos y no consume intentos cuando la verificación se rechaza por saturación (`pinWorkers`).
- `processed_requests` registra `created_at` y se purga periódicamente pasado un periodo de retención configurable.
- `conversations.changed` se entrega solo a los usuarios afectados (miembros de la conversación y el integrante retirado), no a todos los clientes.
- El servidor registra un aviso cuando el certificado TLS está próximo a vencer (al arrancar y periódicamente).
- Corrección interna sin cambio de comportamiento: `writer` como `@Volatile`. (El formateo y las compilaciones alpha van en el cambio `alpha-release`.)

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `event-delivery`: la verificación de entrega deja de mantener un lock durante la escritura (se elimina "Lock compartido durante la escritura"); `conversations.changed` solo a afectados.
- `session-auth`: revocación por cambio de PIN acotada a 5 s; validación cacheada; el límite de login cuenta solo intentos fallidos y expulsa la ventana más antigua al llenarse.
- `request-errors`: `UNAVAILABLE` solo para fallos transitorios de BD, `INTERNAL` para deterministas; el móvil descarta el pendiente ante `INTERNAL`.
- `request-idempotency`: retención configurable de solicitudes procesadas.
- `tls-certificates`: aviso de vencimiento próximo del certificado.

## Impact

- **Servidor** (`server/src/main/kotlin/wasap/`): `TcpServer.kt` (writer, `authenticated()`, `notify`, mapeo de errores), `Service.kt` (verificación de acceso sin lock durante escritura, miembros afectados, purga), `Security.kt` (`Sessions`, `LoginLimiter`), `Tls.kt`, `Main.kt` (tareas periódicas y nueva variable de entorno).
- **BD**: nueva migración `V2__processed_requests_created_at.sql`.
- **Móvil** (`mobile/src/state.ts`, `engine.ts`): tratamiento de `INTERNAL` en el diario de pendientes.
- **Documentación**: `docs/protocol.md`, `docs/architecture.md`, `README.md` (variable de retención), `.env.example`.
- **Pruebas**: nuevas pruebas unitarias en `ServiceTest`/`ProtocolTest` y en `mobile/tests/state.test.ts`.
