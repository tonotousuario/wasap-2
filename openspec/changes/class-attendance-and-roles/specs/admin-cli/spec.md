# Spec Delta

## ADDED Requirements

### Requirement: Asignar roles
`admin users role MATRICULA admin|teacher|student` SHALL cambiar el rol del usuario.

#### Scenario: Nombrar profesor
- **WHEN** el administrador ejecuta `admin users role 20260001 teacher`
- **THEN** el usuario pasa a ser profesor y el comando confirma el cambio

### Requirement: Asistencia por clase en consola
`admin attendance` SHALL aceptar `--class <id>` para limitar la consulta a una clase y `--csv` para imprimir en CSV con matrícula, nombre, clase, tipo e instante local.

#### Scenario: Exportar una clase
- **WHEN** se ejecuta `admin attendance '*' 2026-11-01 2026-11-30 --class <id> --csv`
- **THEN** se imprime un CSV con los movimientos de noviembre de esa clase
