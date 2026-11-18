# Proposal

## Why

En una escuela cada profesor pasa lista de su clase y necesita ver solo a sus alumnos; hoy la asistencia es una sola secuencia global por servidor y nadie, salvo el administrador por consola, puede consultarla. Las clases y el rol de profesor convierten a Wasap en una herramienta útil para el aula sin perder la «puerta general» actual.

## What Changes

- **Roles** en el servidor: `admin`, `teacher` y `student` (por defecto). Solo el administrador cambia roles.
- **Clases:** un profesor crea clases; una clase es un grupo de chat con asistencia, cuyo creador es el profesor responsable. Los grupos normales siguen igual.
- **Asistencia por clase:** cada alumno tiene un estado Dentro/Fuera por clase, independiente del de las demás y de la puerta general.
- **Puerta general:** la asistencia sin clase sigue funcionando exactamente como hoy.
- **Lista de la clase:** el profesor consulta la asistencia de sus alumnos por fechas; los alumnos siguen viendo solo la suya.
- La app muestra un selector de clase en Asistencia (General + clases del alumno).

## Capabilities

### New Capabilities
- `user-roles`: roles de usuario y qué permite cada uno.
- `classes`: clases como grupos con asistencia y profesor responsable.

### Modified Capabilities
- `attendance`: asistencia por clase, puerta general y consulta del profesor.
- `admin-cli`: asignar roles y consultar asistencia por clase.

## Impact

- **BD:** migración `V5` (rol en `users`, `class_id` en `attendance_events`, marca de clase en `conversations`).
- **Servidor:** `Service.kt` (operaciones nuevas y permisos), `Main.kt` (consola).
- **Móvil:** selector de clase en Asistencia, creación de clases para profesores.
- **Protocolo:** campos opcionales `classId` y operaciones nuevas; los clientes v1 siguen usando la puerta general.
- Base de `onboarding-invitations` (inscribir en una clase) y `admin-web-panel` (reportes por clase).
