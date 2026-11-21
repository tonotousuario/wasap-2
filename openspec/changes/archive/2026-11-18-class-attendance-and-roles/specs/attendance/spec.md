# Spec Delta

## ADDED Requirements

### Requirement: Asistencia por clase
`attendance.state`, `attendance.mark` y `attendance.list` SHALL aceptar un `classId` opcional; con él, el estado alternado, la concurrencia optimista y el historial se aplican por separado a cada par usuario–clase. Solo los integrantes de la clase MUST poder registrar en ella.

#### Scenario: Dos clases independientes
- **WHEN** un alumno registra entrada en Redes y luego consulta Cálculo
- **THEN** en Redes está Dentro y en Cálculo sigue Fuera

#### Scenario: Clase ajena
- **WHEN** un alumno registra asistencia en una clase de la que no es integrante
- **THEN** recibe `FORBIDDEN`

### Requirement: Puerta general
Sin `classId`, la asistencia SHALL comportarse exactamente como hasta ahora (una secuencia global por usuario), de modo que los clientes anteriores sigan funcionando.

#### Scenario: Cliente anterior
- **WHEN** una app sin soporte de clases registra asistencia
- **THEN** se registra en la puerta general y no afecta a ninguna clase

### Requirement: Lista de la clase
`attendance.classReport {classId, from, to, before?, limit?}` SHALL devolver al responsable de la clase (o a un `admin`) los movimientos de todos los integrantes en ese rango, con matrícula y nombre, paginados. Cualquier otro usuario MUST recibir `FORBIDDEN`.

#### Scenario: Profesor consulta su clase
- **WHEN** el profesor pide la lista de hoy de su clase
- **THEN** recibe los movimientos de hoy de todos sus alumnos en esa clase

#### Scenario: Alumno pide la lista
- **WHEN** un alumno pide la lista de su clase
- **THEN** recibe `FORBIDDEN`
