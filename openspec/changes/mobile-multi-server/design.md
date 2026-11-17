# Design

## Context

`native.ts` toma la CA de `Constants.expoConfig.extra.installationCaPem` y la pasa como `ca` a `TcpSocket.connectTLS`; el parche nativo ya acepta cualquier CA PEM por conexión. `Engine` guarda un solo `server` y una sola sesión (`wasap.session` en SecureStore); el diario y las cachés ya se indexan por servidor y usuario. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** varios servidores con confianza separada, alta por QR y cambio rápido entre servidores.

**Non-Goals:** conexiones simultáneas a todos los servidores (solo el activo está conectado); notificaciones de servidores inactivos.

## Decisions

### D1. La CA viaja completa en el QR
El parche nativo necesita el certificado de la CA como ancla antes del handshake. Llevar solo la huella obligaría a un modo nativo nuevo («conectar, capturar cadena, comparar»), más código de seguridad sin probar. Una CA RSA 3072 en DER base64url ocupa ~1,3 KB: cabe en un QR de nivel de corrección M (versión ~27), legible desde una pantalla o impreso a 6 cm. La huella abreviada se muestra para verificación humana.
- *Alternativa descartada:* descargar la CA del servidor en el primer contacto (TOFU sin QR): un atacante en la LAN podría suplantar el primer contacto.

### D2. Modelo de datos en la app
`servers:<id>` en AsyncStorage (`{id, name, addresses[], lastAddress, caPem, addedAt}`) y `wasap.session:<serverId>` en SecureStore. El servidor de instalación (si hay CA de compilación) usa `id = "installation"` hasta que su `server.hello` revele el ID real, momento en que se migra. `Engine` recibe el servidor activo; cambiarlo cierra la conexión actual, limpia el estado en memoria y abre la del otro con su sesión.

### D3. Conexión por direcciones
`connect` prueba `[lastAddress, ...resto]` con `connectTimeout` de 5 s; ante error de red pasa a la siguiente, ante error de certificado se detiene (no es un problema de red). Tras el handshake verifica `server.hello` (D1 de `server-enrollment`).

### D4. Escáner
`expo-camera` con lectura de códigos de barras (QR); permiso de cámara solicitado solo al tocar «Escanear». Alternativa sin cámara: pegar el texto `wasap://server?...` (útil en emulador y pruebas).

## Risks / Trade-offs

- [QR denso] → Nivel de corrección M y tamaño mínimo documentado; la consola también imprime el enlace para compartirlo como texto.
- [Migración del servidor de instalación] → Probada con un pendiente en cola (debe conservar su UUID y su ámbito).
- [Más superficie en el almacenamiento seguro] → Un token por servidor; borrar el servidor borra su token.

## Migration Plan

Al actualizar, el servidor y la sesión actuales se convierten en el primer elemento de la lista («instalación») sin pedir PIN. Sin cambios de servidor más allá de `server-identity-and-trust`.
