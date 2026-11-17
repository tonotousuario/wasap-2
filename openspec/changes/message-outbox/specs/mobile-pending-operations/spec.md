# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Una sola mutación pendiente`
- TO: `### Requirement: Cola de mensajes y exclusión de otras mutaciones`

## MODIFIED Requirements

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

### Requirement: Aviso al cerrar sesión con pendiente
Si hay operaciones pendientes, la app SHALL advertir antes de cerrar sesión cuántas se descartarán y que no se sabrá desde la app si el servidor las registró.

#### Scenario: Cerrar sesión con pendiente
- **WHEN** el usuario pide cerrar sesión con 3 mensajes sin confirmar
- **THEN** ve la advertencia con el número 3 y puede cancelar

## ADDED Requirements

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
