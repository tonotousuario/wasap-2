# mobile-connection Specification

## Purpose

Define cómo la app móvil configura el servidor, mantiene y recupera la conexión TLS, conserva la sesión entre arranques y sincroniza el historial tras reconectar.

## Requirements

### Requirement: Configuración del servidor
La app SHALL mantener una lista de hasta 10 servidores, añadidos por QR o a mano (a mano solo para el servidor de la CA de compilación, si existe), cada uno con nombre, direcciones (host y puerto 1–65535), CA y sesión propias. Cambiar el servidor activo MUST NOT cerrar la sesión de los demás; eliminar un servidor SHALL pedir confirmación y borrar su sesión, su cola y sus datos locales.

#### Scenario: Puerto inválido
- **WHEN** el usuario guarda a mano el puerto 70000
- **THEN** la app rechaza la configuración con un mensaje

#### Scenario: Cambio de servidor
- **WHEN** el usuario cambia del servidor A al B y vuelve a A
- **THEN** sigue con su sesión en A sin volver a escribir el PIN, y los datos de B no se muestran en A

### Requirement: Sesión persistente por servidor
El token SHALL guardarse en almacenamiento seguro del sistema accesible solo con el dispositivo desbloqueado y ligado al servidor configurado. Al arrancar, la app SHALL reanudar la sesión solo si corresponde al servidor actual.

#### Scenario: Arranque con sesión guardada
- **WHEN** la app arranca con una sesión del mismo servidor
- **THEN** reconecta y reanuda sin pedir matrícula ni PIN

#### Scenario: Sesión rechazada
- **WHEN** `auth.resume` responde `UNAUTHENTICATED`
- **THEN** la app borra el token y pide iniciar sesión

### Requirement: Reconexión automática
Sin conexión y con sesión, la app SHALL reintentar con espera exponencial de 1 s hasta 30 s, reconectar al volver a primer plano y enviar `ping` cada 30 s mientras está conectada.

#### Scenario: Servidor caído
- **WHEN** el servidor deja de responder
- **THEN** la app muestra que está sin conexión y reintenta con esperas crecientes hasta 30 s

#### Scenario: Volver a primer plano
- **WHEN** la app vuelve del segundo plano con sesión
- **THEN** reconecta y sincroniza

### Requirement: Tiempo de respuesta
Si una solicitud no recibe respuesta en 15 segundos, la app SHALL cerrar la conexión y tratar las solicitudes en curso como sin respuesta. Conectar tiene un plazo de 15 segundos.

#### Scenario: Respuesta perdida
- **WHEN** el servidor no responde una solicitud en 15 s
- **THEN** la conexión se cierra y el pendiente se conserva para reconciliar

### Requirement: Sincronización tras reconectar
Al autenticarse o reanudar, la app SHALL reconciliar el pendiente, consultar el estado e historial de asistencia y la lista de conversaciones, y recuperar los mensajes posteriores al último visto en cada una.

#### Scenario: Mensajes durante la desconexión
- **WHEN** llegan mensajes mientras el teléfono está desconectado
- **THEN** aparecen al reconectar sin duplicados

### Requirement: Deduplicación y orden de mensajes
La app SHALL combinar mensajes de eventos y consultas deduplicando por `id` y por `seq`, ordenarlos por `seq` con precisión arbitraria e ignorar los de conversaciones que no están en su lista.

#### Scenario: Evento y consulta del mismo mensaje
- **WHEN** un mensaje llega por evento y luego en `messages.list`
- **THEN** aparece una sola vez

### Requirement: Conversaciones revocadas
Si una consulta de conversación responde `FORBIDDEN` o `NOT_FOUND`, la app SHALL eliminar esa conversación y sus mensajes de la vista.

#### Scenario: Usuario retirado de un grupo
- **WHEN** el usuario es retirado y la app refresca
- **THEN** el grupo desaparece de su lista

### Requirement: Clasificación de fallos de conexión
La app SHALL clasificar los fallos de conexión como servidor inalcanzable, certificado inválido, conexión cerrada, sin conexión o configuración, mostrando un mensaje según el tipo y el texto técnico solo como diagnóstico.

#### Scenario: Certificado sin la IP
- **WHEN** el handshake falla por el SAN
- **THEN** se muestra que el servidor no presentó un certificado válido para esa dirección

### Requirement: Varias direcciones por servidor
La app SHALL probar las direcciones del servidor activo en orden, con un plazo de 5 segundos por dirección, empezar por la última que funcionó y recordarla.

#### Scenario: Cambio de red
- **WHEN** la primera dirección no responde y la segunda sí
- **THEN** la app se conecta por la segunda y la usa primero en la siguiente reconexión
