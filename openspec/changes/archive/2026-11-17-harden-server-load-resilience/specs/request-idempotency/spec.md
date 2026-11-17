# Spec Delta

## ADDED Requirements

### Requirement: Retención de solicitudes procesadas
El servidor SHALL registrar la fecha de cada solicitud procesada y eliminar periódicamente las que superen el periodo de retención, configurable con `PROCESSED_REQUEST_RETENTION_DAYS` (30 días por defecto, mínimo 1).

#### Scenario: Solicitud antigua
- **WHEN** una solicitud procesada tiene más días que el periodo de retención y se ejecuta la purga
- **THEN** su registro se elimina

#### Scenario: Solicitud reciente
- **WHEN** una solicitud procesada está dentro del periodo de retención
- **THEN** un reintento con el mismo UUID devuelve el resultado original

#### Scenario: Valor de retención inválido
- **WHEN** `PROCESSED_REQUEST_RETENTION_DAYS` no es un entero mayor o igual a 1
- **THEN** el servidor no arranca e informa el error de configuración
