# session-auth Specification

## Purpose

Gobierna el inicio de sesión con matrícula y PIN, las sesiones en memoria del servidor, su reanudación, cierre y revocación, y la limitación de intentos de login.

## Requirements

### Requirement: Inicio de sesión con matrícula y PIN
`auth.login {matricula,pin}` SHALL autenticar al usuario y devolver `{token,expiresAt,user:{id,matricula,name}}`. La matrícula se normaliza (recortada y en mayúsculas). Credenciales incorrectas o matrícula inexistente MUST responder `INVALID_CREDENTIALS` con el mismo mensaje.

#### Scenario: Credenciales correctas
- **WHEN** un usuario envía su matrícula en minúsculas y su PIN correcto
- **THEN** recibe un token y sus datos de usuario

#### Scenario: Matrícula inexistente
- **WHEN** se envía una matrícula que no existe
- **THEN** la respuesta es `INVALID_CREDENTIALS`, indistinguible de un PIN incorrecto

#### Scenario: Campos demasiado largos
- **WHEN** la matrícula supera 32 caracteres o el PIN 12
- **THEN** la respuesta es `VALIDATION`

### Requirement: Almacenamiento del PIN
Los PIN SHALL tener de 6 a 12 dígitos ASCII y guardarse como PBKDF2-HMAC-SHA256 con sal aleatoria de 16 bytes y 600000 iteraciones. Para matrículas inexistentes el servidor SHALL realizar un cálculo equivalente para no revelar su existencia por tiempo.

#### Scenario: PIN con letras
- **WHEN** se intenta crear un usuario con un PIN que no son solo dígitos
- **THEN** la operación falla con `VALIDATION`

### Requirement: Sesiones en memoria
Las sesiones SHALL durar 24 horas, vivir solo en memoria del servidor y perderse al reiniciarlo. Cada cuenta SHALL conservar como máximo 5 sesiones; al crear una sexta se elimina la que vence antes.

#### Scenario: Reinicio del servidor
- **WHEN** el servidor se reinicia
- **THEN** `auth.resume` con un token anterior responde `UNAUTHENTICATED`

#### Scenario: Sexta sesión
- **WHEN** una cuenta inicia sesión por sexta vez con sesiones vigentes
- **THEN** la sesión más próxima a vencer deja de ser válida

### Requirement: Reanudación y cierre de sesión
`auth.resume {token}` SHALL asociar al socket la sesión del token si sigue vigente. `auth.logout` SHALL eliminar la sesión actual. Un nuevo login en el mismo socket SHALL eliminar la sesión anterior de ese socket.

#### Scenario: Token vencido
- **WHEN** se reanuda con un token de más de 24 horas
- **THEN** la respuesta es `UNAUTHENTICATED`

#### Scenario: Logout
- **WHEN** un usuario cierra sesión y luego otro socket intenta reanudar con ese token
- **THEN** recibe `UNAUTHENTICATED`

### Requirement: Identidad desde la conexión
Toda operación distinta de `ping`, `auth.login` y `auth.resume` SHALL requerir una sesión en el socket y tomar la identidad de ella, nunca del payload.

#### Scenario: Operación sin sesión
- **WHEN** un socket sin sesión envía `attendance.state`
- **THEN** recibe `UNAUTHENTICATED`

### Requirement: Revocación por cambio de PIN
Restablecer el PIN SHALL incrementar la versión de credenciales del usuario; cualquier sesión creada con una versión anterior MUST dejar de autorizar requests y entregas, y el siguiente request SHALL responder `UNAUTHENTICATED`.

#### Scenario: Request tras restablecer el PIN
- **WHEN** un administrador restablece el PIN y el usuario envía un request con su sesión anterior
- **THEN** recibe `UNAUTHENTICATED` y su sesión se elimina

### Requirement: Límite de intentos por cuenta e IP
El servidor SHALL limitar los intentos de login a 5 por matrícula y 100 por IP en una ventana de 15 minutos, contando cada intento que llega a evaluarse, y responder `RATE_LIMITED` al excederse. La tabla de ventanas tiene capacidad de 10000 claves; con la tabla llena, las claves nuevas reciben `RATE_LIMITED`.

#### Scenario: Sexto intento
- **WHEN** una matrícula acumula 5 intentos en 15 minutos
- **THEN** el sexto recibe `RATE_LIMITED`

#### Scenario: Tabla llena
- **WHEN** la tabla tiene 10000 claves activas y llega una matrícula nueva
- **THEN** recibe `RATE_LIMITED`

### Requirement: Concurrencia de verificación de PIN
El servidor SHALL verificar como máximo 4 PIN simultáneamente; si no hay capacidad, SHALL responder `RATE_LIMITED`.

#### Scenario: Verificaciones saturadas
- **WHEN** llegan más de 4 logins simultáneos
- **THEN** los que no obtienen capacidad reciben `RATE_LIMITED`
