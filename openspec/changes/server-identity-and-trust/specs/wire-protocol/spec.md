# Spec Delta

## ADDED Requirements

### Requirement: Identidad del servidor
La operación `server.hello` SHALL responder sin sesión `{serverId, name, protocolVersions, caFingerprint}`: un UUID que no cambia entre reinicios, el nombre configurado, las versiones de protocolo aceptadas y la huella SHA-256 (hex) del certificado de la CA.

#### Scenario: Mismo ID tras reiniciar
- **WHEN** un cliente pide `server.hello` antes y después de reiniciar el servidor
- **THEN** recibe el mismo `serverId` y la misma `caFingerprint`

#### Scenario: Sin sesión
- **WHEN** un socket sin autenticar envía `server.hello`
- **THEN** recibe la identidad del servidor y no cuenta como intento de login

### Requirement: Versiones de protocolo anunciadas
El servidor SHALL aceptar solicitudes cuyo `v` esté en `protocolVersions` y responder `UNSUPPORTED_VERSION` con `payload.supportedVersions` para cualquier otra.

#### Scenario: Versión futura
- **WHEN** un cliente envía una solicitud con `v:2` a un servidor que solo acepta 1
- **THEN** recibe `UNSUPPORTED_VERSION` con `supportedVersions:[1]`
