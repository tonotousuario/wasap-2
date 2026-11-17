# Proposal

## Why

La v2 permite que una app hable con varios servidores (uno por profesor o salón) y que el administrador renueve certificados sin consola. Hoy un servidor no tiene identidad propia, el certificado cubre una sola IP y la clave de la CA debe vivir fuera del servidor, así que cambiar de red exige el script y reiniciar. Este cambio pone la base que usan el alta por QR, el panel y, en el futuro, la federación.

## What Changes

- Cada servidor tiene un **ID estable** (UUID) y un nombre, y los anuncia en una operación `server.hello` sin sesión, junto con la huella SHA-256 de su CA y las versiones de protocolo que acepta.
- La **clave de la CA vive en el servidor cifrada** con una frase del administrador; firmar exige la frase y la clave nunca se escribe en claro.
- El certificado del servidor cubre **varias direcciones** (todas sus IPs y nombres opcionales); el servidor detecta sus interfaces para proponerlas.
- Un certificado nuevo se aplica **sin reiniciar**: las conexiones nuevas lo usan y las existentes siguen.
- El comando `wasap-server certs` sustituye al script como vía principal (`init`, `import`, `issue`, `status`); el script queda como alternativa.
- Preparación para federación: ID de servidor y versiones de protocolo negociables, sin operaciones entre servidores todavía.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `wire-protocol`: nueva operación `server.hello` y anuncio de versiones aceptadas.
- `tls-certificates`: CA cifrada en el servidor, certificado con varias direcciones, recarga sin reinicio y emisión desde el propio servidor.

## Impact

- **Servidor:** `Tls.kt` (gestor de claves recargable, emisión con la CA), `Main.kt` (comando `certs`), `TcpServer.kt` (`server.hello`), nueva migración `V4` (identidad del servidor).
- **Despliegue:** el directorio de certificados del contenedor pasa a ser escribible por el servidor (volumen propio) para guardar certificados emitidos; `compose*.yaml`, `README.md`.
- **Dependencias:** BouncyCastle (`bcpkix`) para generar y firmar certificados X.509 desde la JVM.
- **Base de** `mobile-multi-server`, `onboarding-invitations`, `admin-web-panel` y `federation-design`.
