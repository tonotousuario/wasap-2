# request-errors Specification

## Purpose

Define cómo el servidor reporta los fallos de procesamiento y cómo el cliente móvil decide si una operación pendiente se conserva para reintentar o se descarta.

## Requirements

### Requirement: Fallos de base de datos
El servidor SHALL responder `UNAVAILABLE` únicamente cuando un fallo de base de datos sea transitorio: conexión (SQLSTATE clase `08`), recursos insuficientes (`53`), intervención del operador o cancelación (`57`), fallo de serialización o deadlock (`40`), o imposibilidad de obtener conexión del pool. El mensaje no incluye detalles de la base de datos.

#### Scenario: Base caída
- **WHEN** PostgreSQL no acepta conexiones durante un `messages.send`
- **THEN** la respuesta es `UNAVAILABLE`

#### Scenario: Timeout de consulta
- **WHEN** una consulta se cancela por exceder su tiempo límite
- **THEN** la respuesta es `UNAVAILABLE`

### Requirement: Fallos inesperados
Cualquier otro fallo no previsto SHALL responder `INTERNAL` sin revelar detalles, y el servidor registra solo el tipo de excepción.

#### Scenario: Error de programación
- **WHEN** una operación lanza una excepción no prevista
- **THEN** la respuesta es `INTERNAL` y la conexión sigue abierta

### Requirement: Diario de pendientes ante errores
La app SHALL conservar una operación pendiente solo ante `UNAVAILABLE` o `UNAUTHENTICATED`, o fallos sin respuesta del servidor; ante cualquier otro código de error del servidor, incluido `INTERNAL`, SHALL descartarla y mostrar el error.

#### Scenario: Respuesta INTERNAL
- **WHEN** el servidor responde `INTERNAL` a una mutación pendiente
- **THEN** la app descarta el pendiente y permite crear nuevas acciones

#### Scenario: Respuesta UNAVAILABLE
- **WHEN** el servidor responde `UNAVAILABLE`
- **THEN** la app conserva el pendiente y lo reintenta con el mismo UUID al reconectar

#### Scenario: Respuesta CONFLICT
- **WHEN** el servidor responde `CONFLICT` a un registro de asistencia
- **THEN** la app descarta el pendiente y vuelve a consultar el estado

#### Scenario: Conexión perdida sin respuesta
- **WHEN** la conexión se cierra antes de recibir respuesta
- **THEN** la app conserva el pendiente

### Requirement: INTERNAL para fallos deterministas de base de datos
Cualquier fallo de base de datos no transitorio (violaciones de constraint, datos inválidos, errores de sintaxis) SHALL responder `INTERNAL`, sin revelar detalles de la base de datos; el servidor registra solo la clase SQLSTATE.

#### Scenario: Payload con carácter nulo
- **WHEN** una mutación incluye un campo adicional con `\u0000` que la base rechaza al guardar
- **THEN** la respuesta es `INTERNAL` y el mensaje no incluye texto de PostgreSQL
