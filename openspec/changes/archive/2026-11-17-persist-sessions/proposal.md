# Proposal

## Why

Las sesiones viven solo en memoria del servidor: cada reinicio o despliegue obliga a todos los usuarios a volver a escribir matrícula y PIN, y el cambio de PIN depende de que el servidor consulte la versión de credenciales. Guardarlas en PostgreSQL permite reinicios transparentes y una revocación explícita.

## What Changes

- Las sesiones se guardan en PostgreSQL: solo el hash SHA-256 del token, usuario, versión de credenciales, creación y vencimiento. El token en claro nunca se almacena.
- **BREAKING (contrato documentado)**: las sesiones sobreviven al reinicio del servidor; `docs/protocol.md` deja de decir que "cesan al reiniciar".
- `admin users reset-pin` elimina las sesiones del usuario en la misma transacción.
- Se añade `admin users logout MATRICULA` para cerrar todas las sesiones de un usuario.
- Las sesiones vencidas se purgan periódicamente.
- El límite de 5 sesiones por cuenta y la duración de 24 h se conservan.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `session-auth`: sesiones persistentes y almacenamiento del token como hash; revocación explícita al restablecer el PIN.
- `admin-cli`: nuevo comando para cerrar las sesiones de un usuario.

## Impact

- **BD**: migración `V3__sessions.sql` (tabla `sessions`).
- **Servidor**: `Security.kt` (`Sessions` respaldado por BD con caché), `TcpServer.kt`, `Service.kt` (`resetPin`), `Main.kt` (comando admin y purga).
- **Depende de** `harden-server-load-resilience`: reutiliza su caché de validación de 5 s y su planificador de tareas.
- **Documentación**: `docs/protocol.md`, `docs/architecture.md`, `README.md`.
