# user-roles Specification

## Purpose
Define los roles de usuario de un servidor Wasap (administrador, profesor y alumno) y qué puede hacer cada uno.

## Requirements

### Requirement: Roles de usuario
Cada usuario SHALL tener exactamente un rol: `admin`, `teacher` o `student`, con `student` por defecto. El rol SHALL viajar en `user.role` de `auth.login` y `auth.resume` y venir siempre del servidor.

#### Scenario: Alta por defecto
- **WHEN** se da de alta un usuario sin indicar rol
- **THEN** su rol es `student`

### Requirement: Cambio de rol
Solo un `admin` SHALL cambiar roles, por consola o panel; un cambio de rol SHALL aplicarse a las sesiones abiertas en un máximo de 5 segundos.

#### Scenario: Profesor nuevo
- **WHEN** el administrador asigna `teacher` a una matrícula con sesión abierta
- **THEN** en menos de 5 segundos esa sesión puede crear clases

#### Scenario: Alumno intenta cambiar roles
- **WHEN** un `student` intenta cambiar un rol
- **THEN** recibe `FORBIDDEN`
