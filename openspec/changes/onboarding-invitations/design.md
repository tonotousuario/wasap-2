# Design

## Context

Las cuentas se crean con `admin users add` y el PIN se teclea en consola. `auth.login` devuelve `INVALID_CREDENTIALS` sin distinguir casos. El QR de servidor y el escáner llegan con `mobile-multi-server`; las clases y el rol de profesor con `class-attendance-and-roles`. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** altas masivas sin que el administrador conozca PIN, por invitación o autorregistro aprobado.

**Non-Goals:** recuperación de PIN por el propio alumno (sigue siendo `reset-pin` o una invitación nueva); correo o SMS.

## Decisions

### D1. Códigos guardados como hash
`invitations(code_hash, matricula, name, class_id, created_by, expires_at, used_at)`: como con los tokens de sesión, se guarda SHA-256 del código (128 bits aleatorios en base32 dentro del QR). Canjear es atómico (`UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`), así dos canjes simultáneos no crean dos cuentas.

### D2. Cuenta con estado
`users.status text DEFAULT 'active' CHECK (status IN ('active','pending'))`. Una invitación para una matrícula inexistente crea la cuenta al canjear; una para una matrícula existente sin PIN útil la activa. `signup.request` crea una cuenta `pending` con el PIN ya hasheado; aprobar la pasa a `active`, rechazar la borra. `auth.login` verifica el PIN primero y solo después revela `PENDING_APPROVAL`, para no filtrar el estado a quien no conoce el PIN.

### D3. Código de clase
`class_codes(class_id, code, created_at)`: 8 caracteres de un alfabeto sin ambiguos (sin 0/O/1/I), renovar reemplaza la fila. El QR es `wasap://signup?v=1&...` con los datos del servidor más el código.

### D4. QR en la app
El escáner de `mobile-multi-server` reconoce `wasap://server`, `wasap://invite` y `wasap://signup`; los dos últimos dan de alta el servidor si no existe y siguen al formulario correspondiente.

## Risks / Trade-offs

- [Una invitación fotografiada por otro] → Un solo uso y caducidad corta; el profesor ve en el panel qué invitaciones se canjearon y puede revocarlas.
- [Spam de autorregistro] → Requiere el código de la clase, límite por IP y tope de 20 pendientes por clase.

## Migration Plan

`V6` añade tablas y `users.status` con `active` por defecto; las cuentas existentes no cambian.
