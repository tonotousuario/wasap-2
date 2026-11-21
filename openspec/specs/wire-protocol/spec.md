# wire-protocol Specification

## Purpose

Define el protocolo propio de WASAP sobre TCP+TLS: formato de tramas, sobres de solicitud, respuesta y evento, versión, límites de conexión y tiempos de espera. Es el contrato común entre el servidor y cualquier cliente.

## Requirements

### Requirement: Formato de trama
Cada trama SHALL ser `uint32 big-endian con la longitud en bytes` seguido de un objeto JSON en UTF-8, con longitud entre 1 y 65536 bytes. El UTF-8 MUST decodificarse solo después de reunir la trama completa.

#### Scenario: Trama válida
- **WHEN** un cliente envía 4 bytes de longitud N (1 ≤ N ≤ 65536) seguidos de N bytes de un objeto JSON UTF-8
- **THEN** el servidor la procesa como una solicitud

#### Scenario: Longitud fuera de rango
- **WHEN** un cliente envía una longitud 0 o mayor que 65536
- **THEN** el servidor cierra el socket sin responder

#### Scenario: UTF-8 inválido
- **WHEN** el cuerpo de una trama contiene bytes UTF-8 mal formados o no es un objeto JSON
- **THEN** el receptor cierra la conexión

### Requirement: Sobre de solicitud
Una solicitud SHALL tener la forma `{v:1, kind:"request", id:UUID, type:string, payload:object}`. El `id` MUST ser un UUID en minúsculas. Si falta `id`, el servidor SHALL cerrar la conexión.

#### Scenario: Versión no soportada
- **WHEN** una solicitud trae `v` distinto de 1
- **THEN** el servidor responde un error `UNSUPPORTED_VERSION` con el mismo `id`

#### Scenario: Payload que no es objeto
- **WHEN** `payload` es un arreglo o falta
- **THEN** el servidor responde `VALIDATION`

#### Scenario: Operación desconocida
- **WHEN** `type` no corresponde a ninguna operación
- **THEN** el servidor responde `VALIDATION`

### Requirement: Sobre de respuesta
Cada respuesta SHALL reutilizar el `id` de la solicitud, con `kind:"response"` y `type:"success"` y el resultado en `payload`, o `type:"error"` con `payload:{code,message}`. Los mensajes de error MUST estar en español y no incluir detalles internos.

#### Scenario: Éxito
- **WHEN** una solicitud se procesa correctamente
- **THEN** la respuesta tiene el mismo `id`, `type:"success"` y el resultado en `payload`

#### Scenario: Error semántico
- **WHEN** una solicitud bien formada falla una validación
- **THEN** la respuesta tiene `type:"error"` y la conexión sigue abierta

### Requirement: Sobre de evento
Los eventos SHALL tener `kind:"event"`, un `id` UUID nuevo, `type` igual a `message.created`, `conversations.changed` o `attendance.changed`, y su `payload`. Los eventos son avisos; MUST NOT ser el único registro de una operación confirmada.

#### Scenario: Cliente recibe un evento
- **WHEN** el servidor emite un evento
- **THEN** el `id` del evento no coincide con el de ninguna solicitud pendiente del cliente

### Requirement: Códigos de error
El conjunto de códigos de error SHALL ser: `VALIDATION`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `REQUEST_ID_REUSED`, `INTERNAL`, `UNAVAILABLE`, `UNSUPPORTED_VERSION`, `INVITATION_INVALID`, `PENDING_APPROVAL`.

#### Scenario: Código conocido
- **WHEN** el servidor responde un error
- **THEN** `payload.code` es uno de los códigos listados

### Requirement: Comprobación de disponibilidad
La operación `ping` SHALL responder `{ready:true}` cuando la base de datos responde, sin requerir sesión.

#### Scenario: Ping sin sesión
- **WHEN** un socket sin autenticar envía `ping`
- **THEN** recibe `{ready:true}` si la base de datos está disponible

### Requirement: Límites de conexión y tiempos de espera
El servidor SHALL aceptar como máximo 256 conexiones simultáneas, cerrar un socket que no se autentique en 15 segundos y cerrar uno sin actividad durante 15 segundos antes de autenticarse o 90 segundos después.

#### Scenario: Capacidad agotada
- **WHEN** hay 256 conexiones abiertas y llega otra
- **THEN** el servidor la cierra inmediatamente

#### Scenario: Sin autenticación a tiempo
- **WHEN** un socket envía solo `ping` durante más de 15 segundos sin iniciar sesión
- **THEN** el servidor cierra la conexión

#### Scenario: Sesión inactiva
- **WHEN** un socket autenticado no envía nada durante 90 segundos
- **THEN** el servidor cierra la conexión

### Requirement: Cola de salida por conexión
Cada conexión SHALL tener una cola de salida de 128 tramas; si se llena, el servidor SHALL cerrar esa conexión.

#### Scenario: Cliente que no lee
- **WHEN** se acumulan más de 128 tramas pendientes para un socket
- **THEN** el servidor cierra ese socket

### Requirement: Números de secuencia y fechas
Los valores de secuencia SHALL viajar como cadenas decimales y los instantes como cadenas ISO-8601 en UTC.

#### Scenario: Secuencia grande
- **WHEN** un mensaje tiene una secuencia mayor que 2^53
- **THEN** el cliente la recibe como cadena sin pérdida de precisión

### Requirement: Identidad del servidor
La operación `server.hello` SHALL responder sin sesión `{serverId, name, protocolVersions, caFingerprint}`: un UUID que no cambia entre reinicios, el nombre configurado, las versiones de protocolo aceptadas y la huella SHA-256 (hex) del certificado de la CA.

#### Scenario: Mismo ID tras reiniciar
- **WHEN** un cliente pide `server.hello` antes y después de reiniciar el servidor
- **THEN** recibe el mismo `serverId` y la misma `caFingerprint`

#### Scenario: Sin sesión
- **WHEN** un socket sin autenticar envía `server.hello`
- **THEN** recibe la identidad del servidor y no cuenta como intento de login

### Requirement: Versiones de protocolo anunciadas
El servidor SHALL aceptar solicitudes cuyo `v` esté en `protocolVersions` y responder `UNSUPPORTED_VERSION` con `payload.supportedVersions` para cualquier otra.

#### Scenario: Versión futura
- **WHEN** un cliente envía una solicitud con `v:2` a un servidor que solo acepta 1
- **THEN** recibe `UNSUPPORTED_VERSION` con `supportedVersions:[1]`
