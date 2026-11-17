# request-errors Specification

## Purpose

Define cómo el servidor reporta los fallos de procesamiento y cómo el cliente móvil decide si una operación pendiente se conserva para reintentar o se descarta.

## Requirements

### Requirement: Fallos de base de datos
Cualquier fallo de base de datos durante una solicitud SHALL responder `UNAVAILABLE` con un mensaje que indica conservar la solicitud para reintentar, sin detalles de la base de datos.

#### Scenario: Base caída
- **WHEN** PostgreSQL no acepta conexiones durante un `messages.send`
- **THEN** la respuesta es `UNAVAILABLE`

### Requirement: Fallos inesperados
Cualquier otro fallo no previsto SHALL responder `INTERNAL` sin revelar detalles, y el servidor registra solo el tipo de excepción.

#### Scenario: Error de programación
- **WHEN** una operación lanza una excepción no prevista
- **THEN** la respuesta es `INTERNAL` y la conexión sigue abierta

### Requirement: Diario de pendientes ante errores
La app SHALL conservar una operación pendiente ante `UNAVAILABLE`, `INTERNAL` o `UNAUTHENTICATED`, y ante fallos sin respuesta del servidor; ante cualquier otro código de error SHALL descartarla.

#### Scenario: Respuesta UNAVAILABLE
- **WHEN** el servidor responde `UNAVAILABLE`
- **THEN** la app conserva el pendiente y lo reintenta con el mismo UUID al reconectar

#### Scenario: Respuesta CONFLICT
- **WHEN** el servidor responde `CONFLICT` a un registro de asistencia
- **THEN** la app descarta el pendiente y vuelve a consultar el estado

#### Scenario: Conexión perdida sin respuesta
- **WHEN** la conexión se cierra antes de recibir respuesta
- **THEN** la app conserva el pendiente
