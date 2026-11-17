# Spec Delta

## MODIFIED Requirements

### Requirement: Revocación por cambio de PIN
Restablecer el PIN SHALL incrementar la versión de credenciales del usuario; cualquier sesión creada con una versión anterior MUST dejar de autorizar requests y entregas en un máximo de 5 segundos, y el siguiente request posterior a ese plazo SHALL responder `UNAUTHENTICATED`.

#### Scenario: Request tras restablecer el PIN
- **WHEN** un administrador restablece el PIN y el usuario envía un request más de 5 segundos después con su sesión anterior
- **THEN** recibe `UNAUTHENTICATED` y su sesión se elimina

#### Scenario: Eventos tras el cambio de PIN
- **WHEN** han pasado más de 5 segundos desde el restablecimiento
- **THEN** el servidor no entrega eventos a los sockets autenticados con la sesión anterior

### Requirement: Límite de intentos por cuenta e IP
El servidor SHALL permitir como máximo 5 intentos fallidos de login por matrícula y 100 por IP en una ventana de 15 minutos y responder `RATE_LIMITED` al excederse. Cuando la tabla de ventanas (10000 claves) se llena, SHALL descartar la ventana más antigua en lugar de rechazar claves nuevas.

#### Scenario: Sexto intento
- **WHEN** una matrícula acumula 5 intentos fallidos en 15 minutos y se intenta de nuevo
- **THEN** la respuesta es `RATE_LIMITED`

#### Scenario: Tabla llena
- **WHEN** la tabla del limitador está llena y un usuario legítimo nunca visto intenta iniciar sesión
- **THEN** su intento se evalúa normalmente y no recibe `RATE_LIMITED` por capacidad

## ADDED Requirements

### Requirement: Costo de validación de sesión acotado
La validación de credenciales contra la base de datos SHALL ocurrir como máximo una vez por sesión cada 5 segundos, independientemente del número de requests, tramas o eventos.

#### Scenario: Ráfaga de mensajes en General
- **WHEN** se envían varios mensajes al chat General en menos de 5 segundos con N clientes conectados
- **THEN** el servidor no consulta la versión de credenciales más de una vez por sesión en ese intervalo

### Requirement: Logins exitosos no consumen intentos
Un login exitoso MUST NOT contar como intento en el límite por matrícula ni por IP.

#### Scenario: Logins exitosos repetidos
- **WHEN** un usuario inicia sesión correctamente 6 veces en 15 minutos
- **THEN** ninguno de esos logins recibe `RATE_LIMITED`

### Requirement: Rechazo por saturación no consume intentos
Si el servidor rechaza un login porque su capacidad de verificación de PIN está saturada, ese intento MUST NOT contarse en los límites.

#### Scenario: Servidor saturado
- **WHEN** un login se rechaza con `RATE_LIMITED` por saturación de verificación
- **THEN** el contador de intentos de esa matrícula e IP no aumenta
