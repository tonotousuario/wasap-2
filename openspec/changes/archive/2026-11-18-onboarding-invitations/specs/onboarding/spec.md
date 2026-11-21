# Spec Delta

## Purpose

Define cómo un alumno obtiene su cuenta en un servidor sin que el administrador conozca su PIN: por invitación personal o por autorregistro aprobado por su profesor.

## ADDED Requirements

### Requirement: Invitación personal
Un `admin` (para cualquier matrícula) o un `teacher` (para sus clases) SHALL generar invitaciones de un solo uso con al menos 128 bits aleatorios, ligadas a una matrícula y nombre, opcionalmente a una clase, que caducan a los 7 días salvo que se indique otro plazo (1–30 días). Su QR SHALL ser `wasap://invite?v=1&...` con los datos del QR de servidor más el código.

#### Scenario: Invitación desde una lista
- **WHEN** un profesor importa un CSV con 30 matrículas y nombres para su clase
- **THEN** obtiene 30 invitaciones con su QR, listas para imprimir o compartir

### Requirement: Canje de invitación
`invites.redeem {code, pin}` sin sesión SHALL crear o activar la cuenta con el PIN elegido (6–12 dígitos), inscribirla en la clase indicada, marcar la invitación como usada e iniciar sesión. Una invitación usada, caducada o inexistente MUST responder `INVITATION_INVALID` sin indicar cuál de los tres casos es.

#### Scenario: Primer ingreso
- **WHEN** un alumno escanea su invitación y elige el PIN 482915
- **THEN** su cuenta queda activa en la clase y entra sin teclear la matrícula

#### Scenario: Invitación reutilizada
- **WHEN** alguien canjea una invitación ya usada
- **THEN** recibe `INVITATION_INVALID` y no se crea ni modifica ninguna cuenta

### Requirement: Autorregistro con código de clase
El responsable de una clase SHALL poder generar y renovar un código de autorregistro (QR y texto de 8 caracteres). `signup.request {classCode, matricula, name, pin}` sin sesión SHALL crear una solicitud pendiente; mientras esté pendiente, `auth.login` de esa matrícula MUST responder `PENDING_APPROVAL`.

#### Scenario: Solicitud pendiente
- **WHEN** un alumno se registra con el código de la clase e intenta entrar
- **THEN** recibe `PENDING_APPROVAL` hasta que el profesor lo apruebe

#### Scenario: Código renovado
- **WHEN** el profesor renueva el código y alguien usa el anterior
- **THEN** la solicitud se rechaza con `INVITATION_INVALID`

### Requirement: Aprobación de solicitudes
El responsable de la clase (o un `admin`) SHALL aprobar o rechazar solicitudes; aprobar activa la cuenta con el PIN que eligió el alumno y la inscribe en la clase, rechazar la elimina. Una matrícula que ya existe MUST NOT poder registrarse otra vez por esta vía.

#### Scenario: Aprobación
- **WHEN** el profesor aprueba la solicitud de un alumno
- **THEN** el alumno puede entrar con su PIN y ve la clase

### Requirement: Límites contra abuso
Las operaciones sin sesión de alta SHALL compartir el limitador por IP del login y limitarse a 20 solicitudes pendientes por clase.

#### Scenario: Clase saturada
- **WHEN** una clase tiene 20 solicitudes pendientes y llega otra
- **THEN** la nueva recibe `RATE_LIMITED`
