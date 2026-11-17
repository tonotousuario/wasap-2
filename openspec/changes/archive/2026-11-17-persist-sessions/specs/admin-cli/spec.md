# Spec Delta

## ADDED Requirements

### Requirement: Cerrar sesiones de un usuario
`admin users logout MATRICULA` SHALL eliminar todas las sesiones del usuario e indicar cuántas se cerraron; los sockets autenticados con ellas MUST dejar de autorizar requests en un máximo de 5 segundos.

#### Scenario: Teléfono perdido
- **WHEN** el administrador cierra las sesiones de un usuario
- **THEN** el siguiente request de ese usuario, pasados 5 segundos, recibe `UNAUTHENTICATED`

#### Scenario: Matrícula inexistente
- **WHEN** la matrícula no existe
- **THEN** el comando falla con `NOT_FOUND` y código de salida 1
