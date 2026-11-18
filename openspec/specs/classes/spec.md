# classes Specification

## Purpose
Define las clases: grupos de chat con asistencia propia y un profesor responsable que administra integrantes y consulta la lista.

## Requirements

### Requirement: Creación de clases
Un usuario `teacher` o `admin` SHALL poder crear una clase con nombre (1–80 caracteres) e integrantes iniciales; la clase es un grupo con asistencia cuyo responsable es su creador. Un `student` MUST recibir `FORBIDDEN`.

#### Scenario: Profesor crea su clase
- **WHEN** un profesor crea «Redes 5.º A» con 30 matrículas
- **THEN** existe una conversación de grupo con asistencia, 31 integrantes y el profesor como responsable

#### Scenario: Alumno intenta crear una clase
- **WHEN** un alumno intenta crear una clase
- **THEN** recibe `FORBIDDEN`

### Requirement: Clases del usuario
`classes.list` SHALL devolver las clases de las que el usuario es integrante, indicando si es su responsable.

#### Scenario: Alumno en dos clases
- **WHEN** un alumno pertenece a dos clases
- **THEN** `classes.list` devuelve ambas con `isOwner:false`

### Requirement: Integrantes de una clase
Las reglas de integrantes de los grupos SHALL aplicarse a las clases (solo el responsable añade y retira, máximo 100); retirar a un alumno MUST conservar sus registros de asistencia pasados en esa clase.

#### Scenario: Alumno retirado
- **WHEN** el profesor retira a un alumno con registros en la clase
- **THEN** el alumno deja de ver la clase y sus registros siguen en la lista del profesor
