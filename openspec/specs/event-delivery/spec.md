# event-delivery Specification

## Purpose

Define quién recibe cada respuesta y evento enviado por socket, cómo se autoriza su entrega y qué garantías de revocación ofrece el servidor.

## Requirements

### Requirement: Autorización de entrega de tramas sensibles
El servidor SHALL verificar, inmediatamente antes de escribir una trama ligada a una conversación (respuestas de `messages.list` y `groups.members`, eventos `message.created`), que el destinatario autenticado aún pertenece a ella. Si ya no pertenece, la trama SHALL descartarse sin escribirse. Una trama cuya verificación ocurra después del commit de una remoción MUST NOT entregarse a quien fue retirado.

#### Scenario: Integrante retirado
- **WHEN** un integrante es retirado de un grupo y la remoción hace commit antes de que el servidor verifique una trama `message.created` pendiente para ese integrante
- **THEN** la trama no se escribe en su socket

#### Scenario: Miembro vigente
- **WHEN** se envía un mensaje a un grupo y el destinatario sigue siendo miembro al verificar
- **THEN** recibe el evento `message.created`

### Requirement: Plazo de escritura
Cada escritura de trama SHALL tener un plazo de 10 segundos; si se excede, el servidor SHALL cerrar ese socket.

#### Scenario: Escritura bloqueada
- **WHEN** una escritura no termina en 10 segundos
- **THEN** el servidor cierra la conexión de ese cliente

### Requirement: Tramas ligadas a la identidad
Cada trama en cola SHALL quedar ligada al usuario autenticado; si la identidad del socket cambia (logout, otro login, revocación) antes de escribirla, la trama MUST descartarse.

#### Scenario: Logout con eventos en cola
- **WHEN** un usuario cierra sesión con eventos pendientes en la cola de su socket
- **THEN** esos eventos no se escriben

### Requirement: Evento message.created
Tras confirmar `messages.send`, el servidor SHALL emitir `message.created {message}` a los sockets autenticados con acceso a la conversación.

#### Scenario: Mensaje en grupo
- **WHEN** un miembro envía un mensaje al grupo
- **THEN** los sockets de los miembros reciben `message.created` y los de usuarios ajenos no

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

### Requirement: Destinatario de attendance.changed
Tras `attendance.mark`, el servidor SHALL emitir `attendance.changed` con el estado de asistencia actualizado solo a los sockets autenticados del mismo usuario.

#### Scenario: Registro de asistencia
- **WHEN** un usuario registra una entrada desde un teléfono
- **THEN** su otro dispositivo recibe `attendance.changed` y otros usuarios no

### Requirement: Los eventos no sustituyen la consulta
Un fallo al emitir eventos MUST NOT afectar la respuesta de la operación confirmada; los clientes SHALL consultar el historial tras reconectar.

#### Scenario: Fallo al emitir
- **WHEN** falla la preparación de un evento tras una mutación confirmada
- **THEN** el remitente recibe igualmente su confirmación

### Requirement: Sin recursos de base de datos durante la escritura al socket
El servidor MUST NOT mantener conexiones, transacciones ni locks de base de datos mientras escribe bytes a un socket de cliente. La verificación de permiso SHALL terminar antes de iniciar la escritura.

#### Scenario: Cliente que deja de leer
- **WHEN** un cliente autenticado miembro del chat General deja de leer y su escritura queda bloqueada hasta el plazo de 10 s
- **THEN** otros usuarios pueden enviar mensajes al chat General y el servidor sigue atendiendo requests sin errores `UNAVAILABLE` causados por ese bloqueo

#### Scenario: Varios clientes lentos simultáneos
- **WHEN** más clientes lentos que conexiones del pool de BD tienen escrituras bloqueadas
- **THEN** los demás clientes siguen obteniendo respuestas a `ping` con `ready:true`
