# Proposal

## Why

Hoy el administrador crea cada cuenta por consola, teclea el PIN y se lo dicta al alumno: lento, y el administrador conoce todos los PIN. Con varias clases y servidores por salón, dar de alta a un grupo entero tiene que ser cuestión de escanear un QR.

## What Changes

- **Invitaciones personales:** un administrador o profesor genera una invitación por matrícula (una a una o desde una lista CSV), opcionalmente ligada a una clase. Su QR incluye el servidor y un código de un solo uso que caduca (7 días por defecto). Al escanearla, el alumno elige su propio PIN.
- **Autorregistro con código de clase:** el profesor publica un código de su clase (QR o texto corto, renovable); el alumno escribe matrícula, nombre y PIN, y queda pendiente hasta que el profesor lo aprueba o rechaza.
- El PIN siempre lo elige el alumno; el administrador nunca lo conoce.
- Nuevos códigos de error para invitaciones inválidas y registros pendientes.

## Capabilities

### New Capabilities
- `onboarding`: invitaciones personales, autorregistro con aprobación y elección del PIN por el alumno.

### Modified Capabilities
- `wire-protocol`: nuevos códigos de error `INVITATION_INVALID` y `PENDING_APPROVAL`.

## Impact

- **BD:** migración `V6` (`invitations`, `class_codes`, `signup_requests`, estado de cuenta).
- **Servidor:** operaciones sin sesión `invites.redeem` y `signup.request`, y con sesión para generar, listar y aprobar; consola `admin invites`.
- **Móvil:** escanear invitación o código de clase y pantalla para elegir PIN.
- **Depende de** `server-identity-and-trust` (QR de servidor), `mobile-multi-server` (escáner, lista de servidores) y `class-attendance-and-roles` (clases, rol de profesor).
