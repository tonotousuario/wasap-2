# Tasks

## 1. Datos y roles

- [x] 1.1 Migración `V5` (rol, `is_class`, `class_id` e índice); verificar con Flyway en `./gradlew integrationTest` que los datos existentes quedan en la puerta general
- [x] 1.2 Rol en la sesión con revalidación de 5 s y `admin users role`; pruebas de integración de cambio de rol en sesión abierta y `FORBIDDEN` para alumnos

## 2. Clases y asistencia

- [x] 2.1 Crear clases (`groups.create` con `class:true`) y `classes.list`; pruebas de permisos por rol
- [x] 2.2 `classId` en `attendance.state/mark/list` con estado independiente por clase y compatibilidad sin `classId`; pruebas de dos clases, clase ajena y cliente v1
- [x] 2.3 `attendance.classReport` paginado y `admin attendance --class --csv`; pruebas de permisos (responsable, admin, alumno) y del CSV
- [x] 2.4 Documentar operaciones y permisos en `docs/protocol.md`

## 3. App

- [x] 3.1 Selector de clase en Asistencia, creación de clases para profesores y «Lista de la clase»; pruebas del motor y `npx tsc --noEmit`
- [x] 3.2 Verificar en el AVD con un profesor y dos alumnos en dos clases; capturas en `docs/verification.md`
