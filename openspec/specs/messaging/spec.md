# messaging Specification

## Purpose

Define el envío de mensajes de texto y la lectura paginada del historial de cada conversación, con un orden total por conversación que los clientes usan para deduplicar y recuperar mensajes tras desconectarse.

## Requirements

### Requirement: Envío de mensajes de texto
`messages.send {conversationId, text}` SHALL guardar un mensaje de 1 a 4000 unidades UTF-16 después de recortar espacios, sin el carácter nulo, y devolver `{message}`. Solo miembros (o cualquier usuario en General) pueden enviar.

#### Scenario: Mensaje válido
- **WHEN** un miembro envía "Hola" a un grupo
- **THEN** recibe el mensaje guardado con `id`, `seq`, `senderId`, `senderName` y `createdAt`

#### Scenario: Mensaje vacío
- **WHEN** el texto solo contiene espacios
- **THEN** recibe `VALIDATION`

#### Scenario: No miembro
- **WHEN** alguien ajeno envía a un grupo
- **THEN** recibe `FORBIDDEN`

### Requirement: Secuencia por conversación
Cada mensaje SHALL recibir una secuencia por conversación, estrictamente creciente y sin huecos, en el orden de commit.

#### Scenario: Envíos concurrentes
- **WHEN** dos usuarios envían al General al mismo tiempo
- **THEN** los mensajes reciben secuencias consecutivas distintas

### Requirement: Historial paginado
`messages.list {conversationId}` SHALL devolver mensajes en orden ascendente: sin cursor, la página más reciente; con `before`, la página anterior; con `after`, los primeros posteriores. Enviar ambos cursores MUST responder `VALIDATION`. `limit` es 1–100 (50 por defecto).

#### Scenario: Página más reciente
- **WHEN** se pide el historial sin cursor en una conversación con 200 mensajes
- **THEN** se reciben los 50 más recientes en orden ascendente y un `nextCursor` igual a la primera secuencia

#### Scenario: Recuperar lo no visto
- **WHEN** se pide con `after` igual a la última secuencia conocida
- **THEN** se reciben los mensajes posteriores en orden ascendente

### Requirement: Presupuesto de bytes por página
Las páginas de mensajes SHALL limitarse a unos 48000 bytes codificados para no exceder el tamaño de trama; los clientes MUST seguir `nextCursor` aunque la página tenga menos elementos que `limit`.

#### Scenario: Mensajes largos con Unicode
- **WHEN** 50 mensajes de 4000 caracteres con emojis exceden el presupuesto
- **THEN** la página trae menos mensajes y un `nextCursor`

### Requirement: Confirmación tras commit
El servidor SHALL responder éxito a `messages.send` solo después del commit; si la base de datos falla, MUST NOT confirmar.

#### Scenario: Base caída durante el envío
- **WHEN** PostgreSQL falla al guardar
- **THEN** el cliente recibe un error y no una confirmación
