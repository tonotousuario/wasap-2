# Proposal

## Why

En un mismo salón puede haber varios servidores (uno por profesor) y un alumno pertenece a varios. Hoy la app solo confía en la CA con la que se compiló y guarda un único servidor, así que cada escuela necesitaría su propio APK y cambiar de servidor cierra la sesión. Con un QR por servidor, un mismo APK sirve en cualquier lugar.

## What Changes

- La app guarda una **lista de servidores** (hasta 10), cada uno con nombre, direcciones, su propia CA y su propia sesión; cambiar de servidor activo no cierra las demás sesiones.
- **Alta por QR:** el QR del servidor (formato `wasap://server`) trae ID, nombre, direcciones y el certificado de la CA; la app lo guarda y confía solo en esa CA para ese servidor.
- **Varias direcciones:** la app prueba las direcciones del servidor en orden y recuerda la última que funcionó.
- La CA incorporada al compilar pasa a ser **opcional**: si existe, define un servidor «de instalación» que se puede configurar a mano como hoy.
- Selector de servidores en la app y corrección de las **iniciales del avatar** («U(» en Integrantes).

## Capabilities

### New Capabilities
- `server-enrollment`: formato del QR del servidor y reglas de confianza al escanearlo; lo comparten la app, la consola y el panel.

### Modified Capabilities
- `mobile-connection`: de un servidor configurable a una lista de servidores con sesión propia y varias direcciones.
- `tls-certificates`: la CA de compilación pasa a ser opcional y la validación usa la CA del servidor guardado.
- `mobile-experience`: selector de servidores y corrección de iniciales.

## Impact

- **Móvil:** `native.ts` (CA por servidor), `engine.ts` (servidor activo, sesiones por servidor), nueva pantalla de servidores con escáner (`expo-camera`), `format.ts` (iniciales), `app.config.ts` (CA opcional, permiso de cámara).
- **Servidor/consola:** `wasap-server certs qr` imprime el QR (texto y PNG); el panel lo mostrará en `admin-web-panel`.
- **Depende de** `server-identity-and-trust` (`serverId`, `server.hello`, certificados multi-dirección).
- Requiere nuevo build nativo (cámara).
