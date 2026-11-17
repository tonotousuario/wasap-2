# request-idempotency Specification

## Purpose

Garantiza que reintentar una mutación con el mismo UUID de solicitud no duplique sus efectos, aunque se pierda la confirmación o el cliente se reinicie.

## Requirements

### Requirement: Mutaciones idempotentes
Para `attendance.mark`, `conversations.direct`, `groups.create`, `groups.add`, `groups.remove` y `messages.send`, el UUID de la solicitud SHALL ser una clave durable por usuario. El payload y el resultado se guardan en la misma transacción que el efecto.

#### Scenario: Confirmación perdida
- **WHEN** un usuario reenvía `messages.send` con el mismo UUID y payload tras perder la respuesta
- **THEN** recibe el mismo mensaje original y no se crea un segundo mensaje

#### Scenario: Asistencia reintentada
- **WHEN** se reenvía `attendance.mark` con el mismo UUID
- **THEN** se devuelve el mismo movimiento y no se crea otro

### Requirement: UUID reutilizado con otro contenido
Reutilizar un UUID con otra operación o con otro payload MUST responder `REQUEST_ID_REUSED`.

#### Scenario: Mismo UUID, otro texto
- **WHEN** se envía `messages.send` con un UUID ya usado y un texto distinto
- **THEN** la respuesta es `REQUEST_ID_REUSED`

### Requirement: Reintento sin recuperar acceso revocado
Al repetir una mutación de grupo (salvo `groups.create`) o un `messages.send`, el servidor SHALL volver a comprobar el acceso a la conversación; un resultado guardado MUST NOT devolver acceso a quien fue retirado.

#### Scenario: Reintento tras ser retirado
- **WHEN** un integrante retirado reintenta un `messages.send` ya confirmado
- **THEN** recibe `FORBIDDEN`

### Requirement: Alcance por usuario
Las claves de idempotencia SHALL ser por usuario: el mismo UUID usado por dos usuarios distintos son solicitudes independientes.

#### Scenario: Mismo UUID, otro usuario
- **WHEN** dos usuarios envían mensajes con el mismo UUID
- **THEN** ambos mensajes se crean

### Requirement: Retención de solicitudes procesadas
El servidor SHALL registrar la fecha de cada solicitud procesada y eliminar periódicamente las que superen el periodo de retención, configurable con `PROCESSED_REQUEST_RETENTION_DAYS` (30 días por defecto, mínimo 1).

#### Scenario: Solicitud antigua
- **WHEN** una solicitud procesada tiene más días que el periodo de retención y se ejecuta la purga
- **THEN** su registro se elimina

#### Scenario: Solicitud reciente
- **WHEN** una solicitud procesada está dentro del periodo de retención
- **THEN** un reintento con el mismo UUID devuelve el resultado original

#### Scenario: Valor de retención inválido
- **WHEN** `PROCESSED_REQUEST_RETENTION_DAYS` no es un entero mayor o igual a 1
- **THEN** el servidor no arranca e informa el error de configuración
