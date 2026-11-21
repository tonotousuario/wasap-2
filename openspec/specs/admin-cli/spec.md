# admin-cli Specification

## Purpose

Define la administración por consola del servidor: alta de usuarios, restablecimiento de PIN, listado de usuarios y consulta de asistencia de cualquier usuario, sin panel web.

## Requirements

### Requirement: Alta de usuarios
`admin users add MATRICULA 'Nombre'` SHALL crear el usuario e imprimir sus datos en JSON. El PIN MUST pedirse por la terminal sin mostrarlo y nunca aceptarse como argumento.

#### Scenario: Alta interactiva
- **WHEN** el administrador ejecuta el alta en una terminal
- **THEN** se le pide el PIN sin eco y se imprime el usuario creado

#### Scenario: Sin terminal
- **WHEN** no hay consola interactiva
- **THEN** el PIN se lee de la entrada estándar con un aviso de que no se oculta

### Requirement: Restablecer PIN
`admin users reset-pin MATRICULA` SHALL reemplazar el PIN e invalidar las sesiones anteriores del usuario.

#### Scenario: Matrícula inexistente
- **WHEN** se restablece el PIN de una matrícula que no existe
- **THEN** el comando falla con `NOT_FOUND` y código de salida 1

### Requirement: Listado de usuarios
`admin users list` SHALL imprimir todos los usuarios ordenados por matrícula en JSON, sin PIN ni hash.

#### Scenario: Listado
- **WHEN** el administrador lista usuarios
- **THEN** cada entrada tiene solo `id`, `matricula` y `name`

### Requirement: Consulta de asistencia
`admin attendance MATRICULA|* [DESDE] [HASTA] [CURSOR]` SHALL devolver hasta 100 movimientos con matrícula y nombre de cada dueño, con fechas inclusivas en `APP_TIMEZONE` y un `nextCursor` para continuar.

#### Scenario: Todos los usuarios
- **WHEN** se consulta con `*` y un rango de un mes
- **THEN** se reciben movimientos de todos los usuarios de ese mes, del más reciente al más antiguo

### Requirement: Errores sin secretos
Si un comando o el arranque fallan, el proceso SHALL terminar con código 1 e imprimir solo el código de error de la aplicación o el tipo de fallo, nunca URLs, credenciales ni mensajes de la base de datos.

#### Scenario: Base inaccesible
- **WHEN** la base de datos no responde al ejecutar un comando
- **THEN** se imprime un mensaje genérico de configuración o conectividad y el código de salida es 1

### Requirement: Cerrar sesiones de un usuario
`admin users logout MATRICULA` SHALL eliminar todas las sesiones del usuario e indicar cuántas se cerraron; los sockets autenticados con ellas MUST dejar de autorizar requests en un máximo de 5 segundos.

#### Scenario: Teléfono perdido
- **WHEN** el administrador cierra las sesiones de un usuario
- **THEN** el siguiente request de ese usuario, pasados 5 segundos, recibe `UNAUTHENTICATED`

#### Scenario: Matrícula inexistente
- **WHEN** la matrícula no existe
- **THEN** el comando falla con `NOT_FOUND` y código de salida 1

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
