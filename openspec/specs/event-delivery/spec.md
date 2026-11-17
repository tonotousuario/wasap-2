# event-delivery Specification

## Purpose

Define quién recibe cada respuesta y evento enviado por socket, cómo se autoriza su entrega y qué garantías de revocación ofrece el servidor.

## Requirements

### Requirement: Autorización de entrega de tramas sensibles
Las tramas ligadas a una conversación (respuestas de `messages.list` y `groups.members`, eventos `message.created`) SHALL entregarse solo si, al momento de escribirlas, el destinatario autenticado sigue perteneciendo a la conversación; si no, se descartan.

#### Scenario: Integrante retirado
- **WHEN** un integrante es retirado antes de que se escriba un `message.created` pendiente para él
- **THEN** la trama no se escribe en su socket

### Requirement: Lock compartido durante la escritura
La verificación de pertenencia SHALL mantener un lock compartido sobre la conversación hasta terminar la escritura de la trama; retirar integrantes toma el lock exclusivo, de modo que ninguna trama verificada se escribe después del commit de la remoción.

#### Scenario: Remoción durante una escritura
- **WHEN** una remoción se intenta mientras se escribe una trama verificada para ese integrante
- **THEN** la remoción espera a que termine la escritura

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
Tras `conversations.direct` y cualquier mutación de grupos, el servidor SHALL emitir `conversations.changed {}` a todos los sockets autenticados, que lo usan como señal para refrescar su lista.

#### Scenario: Grupo creado
- **WHEN** un usuario crea un grupo
- **THEN** todos los sockets autenticados reciben `conversations.changed`

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
