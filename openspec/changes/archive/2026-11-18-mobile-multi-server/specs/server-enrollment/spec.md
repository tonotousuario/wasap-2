# Spec Delta

## Purpose

Define el código QR con el que un servidor Wasap se da de alta en la app y las reglas de confianza que la app aplica al escanearlo.

## ADDED Requirements

### Requirement: Contenido del QR de servidor
El QR de servidor SHALL codificar `wasap://server?v=1&id=<serverId>&name=<nombre>&a=<host:puerto>[&a=...]&ca=<certificado CA en DER base64url>`, con entre 1 y 5 direcciones en orden de preferencia. La consola (`wasap-server certs qr`) y el panel SHALL generarlo con los datos actuales del servidor.

#### Scenario: Servidor en dos redes
- **WHEN** el servidor tiene dos direcciones en su certificado
- **THEN** su QR incluye ambas como parámetros `a`, en el orden configurado

#### Scenario: QR ajeno
- **WHEN** la app escanea un QR que no empieza por `wasap://server` o con `v` distinta de 1
- **THEN** lo rechaza explicando que no es un servidor Wasap compatible

### Requirement: Confianza al escanear
Al escanear, la app SHALL verificar que el certificado del QR es de CA, mostrar su huella SHA-256 abreviada y el nombre, y al confirmar guardarlo como única ancla de ese servidor. Un QR con el mismo `serverId` y otra CA MUST pedir confirmación explícita antes de reemplazarla.

#### Scenario: Alta normal
- **WHEN** el usuario escanea el QR de un servidor nuevo y confirma
- **THEN** el servidor aparece en la lista y la conexión valida contra esa CA

#### Scenario: CA cambiada
- **WHEN** se escanea un QR con un `serverId` ya guardado pero otra CA
- **THEN** la app advierte que la identidad del servidor cambió y no la reemplaza sin confirmación

### Requirement: Identidad verificada al conectar
Tras el handshake TLS, la app SHALL pedir `server.hello` y comprobar que `serverId` y `caFingerprint` coinciden con el servidor guardado; si no, MUST cerrar la conexión sin enviar credenciales.

#### Scenario: Otro servidor en la misma dirección
- **WHEN** en la dirección guardada responde un servidor con otro `serverId` aunque firmado por la misma CA
- **THEN** la app no inicia sesión y avisa que es otro servidor
