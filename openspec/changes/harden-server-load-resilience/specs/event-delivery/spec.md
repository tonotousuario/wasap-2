# Spec Delta

## MODIFIED Requirements

### Requirement: Autorización de entrega de tramas sensibles
El servidor SHALL verificar, inmediatamente antes de escribir una trama ligada a una conversación (respuestas de `messages.list` y `groups.members`, eventos `message.created`), que el destinatario autenticado aún pertenece a ella. Si ya no pertenece, la trama SHALL descartarse sin escribirse. Una trama cuya verificación ocurra después del commit de una remoción MUST NOT entregarse a quien fue retirado.

#### Scenario: Integrante retirado
- **WHEN** un integrante es retirado de un grupo y la remoción hace commit antes de que el servidor verifique una trama `message.created` pendiente para ese integrante
- **THEN** la trama no se escribe en su socket

#### Scenario: Miembro vigente
- **WHEN** se envía un mensaje a un grupo y el destinatario sigue siendo miembro al verificar
- **THEN** recibe el evento `message.created`

### Requirement: Destinatarios de conversations.changed
El evento `conversations.changed` SHALL entregarse solo a sockets autenticados de usuarios afectados: los miembros de la conversación tras la operación y, en `groups.remove`, el integrante retirado.

#### Scenario: Grupo creado
- **WHEN** un usuario crea un grupo
- **THEN** los integrantes del grupo reciben `conversations.changed` y los usuarios ajenos no

#### Scenario: Usuario ajeno a un grupo
- **WHEN** el creador agrega un integrante a un grupo
- **THEN** los miembros del grupo reciben `conversations.changed` y un usuario que no es miembro no lo recibe

#### Scenario: Integrante retirado del grupo
- **WHEN** el creador retira a un integrante
- **THEN** el integrante retirado recibe `conversations.changed`

#### Scenario: Privado nuevo
- **WHEN** un usuario abre un privado con otra matrícula
- **THEN** ambos participantes reciben `conversations.changed` y nadie más

## ADDED Requirements

### Requirement: Sin recursos de base de datos durante la escritura al socket
El servidor MUST NOT mantener conexiones, transacciones ni locks de base de datos mientras escribe bytes a un socket de cliente. La verificación de permiso SHALL terminar antes de iniciar la escritura.

#### Scenario: Cliente que deja de leer
- **WHEN** un cliente autenticado miembro del chat General deja de leer y su escritura queda bloqueada hasta el plazo de 10 s
- **THEN** otros usuarios pueden enviar mensajes al chat General y el servidor sigue atendiendo requests sin errores `UNAVAILABLE` causados por ese bloqueo

#### Scenario: Varios clientes lentos simultáneos
- **WHEN** más clientes lentos que conexiones del pool de BD tienen escrituras bloqueadas
- **THEN** los demás clientes siguen obteniendo respuestas a `ping` con `ready:true`

## REMOVED Requirements

### Requirement: Lock compartido durante la escritura
**Reason**: Mantener un lock y una conexión de BD mientras se escribe a un socket permite que clientes lentos agoten el pool y frenen el chat General.
**Migration**: La garantía pasa a ser la de "Autorización de entrega de tramas sensibles": una trama verificada después del commit de la remoción no se entrega. Una trama verificada antes puede escribirse, igual que los bytes ya en buffers TCP. `docs/protocol.md` se actualiza.
