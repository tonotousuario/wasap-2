# server-deployment Specification

## Purpose

Define cómo se configura, arranca y despliega el servidor: variables de entorno, secretos, migraciones, salud del contenedor y los entornos de Compose de producción, local y pruebas.

## Requirements

### Requirement: Secretos en archivos
La contraseña de PostgreSQL y la del keystore SHALL poder leerse de archivos (`*_FILE`) y MUST NOT incorporarse a la imagen ni al repositorio. `certs/` y `.env` SHALL estar ignorados por Git.

#### Scenario: Contraseña por archivo
- **WHEN** se define `DB_PASSWORD_FILE`
- **THEN** el servidor lee la contraseña de ese archivo

### Requirement: Conexión segura a PostgreSQL
El servidor MUST exigir `sslmode=verify-full` en `DB_URL`, salvo que `DB_ALLOW_INSECURE=true`, permitido solo para desarrollo y pruebas locales. La URL MUST ser JDBC de PostgreSQL.

#### Scenario: URL sin verify-full
- **WHEN** `DB_URL` no tiene `sslmode=verify-full` y no se permite modo inseguro
- **THEN** el servidor no arranca

### Requirement: Migraciones antes de escuchar
El servidor SHALL aplicar las migraciones de base de datos antes de aceptar conexiones y no arrancar si fallan.

#### Scenario: Base nueva
- **WHEN** el servidor arranca contra un esquema vacío
- **THEN** crea las tablas y la conversación General antes de escuchar

### Requirement: Comprobación de salud
`wasap-server healthcheck` SHALL conectarse por TLS al propio servidor validando el certificado con la CA, enviar `ping` y terminar con éxito solo si recibe `ready:true`.

#### Scenario: Base caída
- **WHEN** el servidor escucha pero la base no responde
- **THEN** el healthcheck falla

### Requirement: Contenedor con privilegios mínimos
El contenedor de producción SHALL ejecutarse sin root con el UID/GID del operador, sistema de archivos de solo lectura, sin capacidades y con `no-new-privileges`. Las pruebas unitarias SHALL ejecutarse durante la construcción de la imagen.

#### Scenario: Construcción con pruebas fallidas
- **WHEN** una prueba unitaria falla
- **THEN** la imagen no se construye

### Requirement: Configuración por entorno
El servidor SHALL configurarse con `SERVER_HOST`, `SERVER_PORT` (5050 por defecto), `APP_TIMEZONE`, `DB_URL`, `DB_USER`, `DB_SCHEMA`, `TLS_KEYSTORE` y `TLS_CA_FILE`; una variable requerida ausente MUST impedir el arranque.

#### Scenario: Falta DB_URL
- **WHEN** no se define `DB_URL`
- **THEN** el servidor termina con error de configuración

### Requirement: Entornos de Compose
SHALL existir: `compose.yaml` para producción con base externa; `compose.local.yaml` (y su variante Podman) con PostgreSQL persistente en un volumen externo y el servidor publicado solo en localhost; y `compose.test.yaml` con un PostgreSQL efímero solo en localhost para pruebas de integración.

#### Scenario: Entorno local
- **WHEN** se levanta `compose.local.yaml`
- **THEN** el puerto de la base no se publica al host y el servidor escucha en 127.0.0.1:5050

### Requirement: Apagado ordenado
Al recibir la señal de terminación, el servidor SHALL dejar de aceptar conexiones, cerrar las existentes y terminar en unos 5 segundos.

#### Scenario: docker stop
- **WHEN** se detiene el contenedor
- **THEN** el proceso cierra los sockets y sale antes del período de gracia

### Requirement: Configuración del panel
El servidor SHALL configurarse con `PANEL_ENABLED` (verdadero por defecto) y `PANEL_PORT` (5443 por defecto); `compose.yaml` SHALL publicar ese puerto y `compose.local.yaml` solo en `127.0.0.1`.

#### Scenario: Entorno local
- **WHEN** se levanta `compose.local.yaml`
- **THEN** el panel responde en `https://127.0.0.1:5443` y no en otras interfaces
