# mobile-pending-operations Specification

## Purpose

Define el diario local de la app móvil que conserva una mutación enviada sin confirmar, para reconciliarla con el mismo UUID tras perder la respuesta o reiniciar la app, sin crear acciones sin conexión.

## Requirements

### Requirement: Guardar antes de enviar
Antes de enviar una mutación, la app SHALL guardar de forma durable su UUID, tipo y payload; al recibir la confirmación SHALL borrarla.

#### Scenario: Cierre de la app tras enviar
- **WHEN** la app se cierra después de enviar y antes de la respuesta
- **THEN** al volver a abrir conserva el pendiente y lo reenvía con el mismo UUID

### Requirement: Cola de mensajes y exclusión de otras mutaciones
La app SHALL permitir hasta 20 mensajes (`messages.send`) pendientes en una cola ordenada, enviados de uno en uno en el orden de creación. Cualquier otra mutación MUST NOT empezar mientras haya pendientes, y MUST NOT encolarse un mensaje mientras otra mutación esté pendiente.

#### Scenario: Segundo envío
- **WHEN** hay un mensaje pendiente de confirmación y el usuario envía otro
- **THEN** el segundo se encola y se envía después del primero

#### Scenario: Cola llena
- **WHEN** hay 20 mensajes en cola y el usuario intenta enviar otro
- **THEN** la app lo impide e indica que espere confirmaciones

#### Scenario: Asistencia con mensajes en cola
- **WHEN** hay mensajes en cola y el usuario intenta registrar asistencia
- **THEN** la app lo impide hasta que la cola se vacíe

### Requirement: Sin acciones sin conexión
La app MUST NOT crear mutaciones nuevas sin conexión; los borradores de mensajes y la selección de un grupo en curso se conservan.

#### Scenario: Escribir sin red
- **WHEN** el usuario intenta enviar un mensaje sin conexión
- **THEN** el envío se bloquea y el borrador se conserva

### Requirement: Pendiente ligado a servidor y usuario
El pendiente SHALL estar ligado al servidor y al usuario; MUST NOT reenviarse a otro servidor ni con otra identidad. Cerrar sesión o iniciar sesión con otra cuenta lo descarta; volver a entrar con la misma cuenta tras `UNAUTHENTICATED` lo conserva.

#### Scenario: Otra cuenta
- **WHEN** inicia sesión un usuario distinto en el mismo teléfono
- **THEN** el pendiente del anterior se descarta sin enviarse

#### Scenario: Misma cuenta tras sesión vencida
- **WHEN** la sesión vence y el mismo usuario vuelve a entrar
- **THEN** el pendiente se reconcilia con su UUID original

### Requirement: Aviso al cerrar sesión con pendiente
Si hay operaciones pendientes, la app SHALL advertir antes de cerrar sesión cuántas se descartarán y que no se sabrá desde la app si el servidor las registró.

#### Scenario: Cerrar sesión con pendiente
- **WHEN** el usuario pide cerrar sesión con 3 mensajes sin confirmar
- **THEN** ve la advertencia con el número 3 y puede cancelar

### Requirement: Orden y errores en la cola
Cada mensaje SHALL conservar su UUID durante los reintentos. Ante un error que conserva el pendiente, la cola SHALL detenerse sin descartar nada; ante un error definitivo, SHALL descartar solo ese mensaje, marcarlo como no enviado y continuar con el siguiente.

#### Scenario: Servidor no disponible
- **WHEN** el primer mensaje de la cola recibe `UNAVAILABLE`
- **THEN** ningún mensaje se descarta y la cola se reanuda al reconectar en el mismo orden

#### Scenario: Retirado del grupo con mensajes en cola
- **WHEN** un mensaje de la cola recibe `FORBIDDEN`
- **THEN** ese mensaje queda como no enviado y los mensajes a otras conversaciones siguen enviándose

### Requirement: Migración del diario anterior
Al actualizar la app, un pendiente guardado con el formato anterior de una sola operación SHALL convertirse en el primer elemento del diario nuevo, conservando su UUID.

#### Scenario: Actualización con pendiente
- **WHEN** la app se actualiza con un mensaje pendiente en el formato anterior
- **THEN** al reconectar se reconcilia con su UUID original
