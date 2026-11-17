# Spec Delta

## MODIFIED Requirements

### Requirement: Sesiones persistentes
Las sesiones SHALL durar 24 horas y persistir en la base de datos, de modo que sobreviven al reinicio del servidor. Cada cuenta SHALL conservar como máximo 5 sesiones; al crear una sexta se elimina la que vence antes.

#### Scenario: Reinicio del servidor
- **WHEN** el servidor se reinicia y un cliente reanuda con un token vigente
- **THEN** `auth.resume` responde con éxito sin pedir matrícula ni PIN

#### Scenario: Sexta sesión
- **WHEN** una cuenta inicia sesión por sexta vez con sesiones vigentes
- **THEN** la sesión más próxima a vencer deja de ser válida

## RENAMED Requirements

- FROM: `### Requirement: Sesiones en memoria`
- TO: `### Requirement: Sesiones persistentes`

## ADDED Requirements

### Requirement: Tokens almacenados como hash
El servidor MUST NOT almacenar el token de sesión en claro; SHALL guardar solo su hash SHA-256. Un token SHALL tener 256 bits aleatorios.

#### Scenario: Lectura de la base
- **WHEN** alguien con acceso de lectura a la base consulta la tabla de sesiones
- **THEN** no puede obtener ningún token utilizable

### Requirement: Revocación inmediata al restablecer el PIN
Restablecer el PIN SHALL eliminar todas las sesiones del usuario en la misma transacción; un `auth.resume` posterior con un token anterior MUST responder `UNAUTHENTICATED`.

#### Scenario: Reanudar tras restablecer el PIN
- **WHEN** un administrador restablece el PIN y el usuario intenta `auth.resume` con su token anterior
- **THEN** recibe `UNAUTHENTICATED`

### Requirement: Purga de sesiones vencidas
El servidor SHALL eliminar periódicamente, al menos cada hora, las sesiones vencidas.

#### Scenario: Sesión vencida
- **WHEN** una sesión lleva más de 24 horas creada y se ejecuta la purga
- **THEN** su registro se elimina
