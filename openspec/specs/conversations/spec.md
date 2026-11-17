# conversations Specification

## Purpose

Define los tres tipos de conversación (General, privados y grupos), quién pertenece a cada uno, cómo se crean y administran, y cómo se listan.

## Requirements

### Requirement: Chat General
SHALL existir exactamente una conversación `GENERAL`, accesible para todo usuario autenticado sin membresía explícita.

#### Scenario: Usuario nuevo
- **WHEN** se da de alta un usuario y consulta sus conversaciones
- **THEN** la conversación General aparece en su lista

### Requirement: Privados
`conversations.direct {matricula}` SHALL devolver la conversación `DIRECT` entre el usuario y esa matrícula, creándola si no existe. Debe haber como máximo un privado por pareja y sus dos integrantes son inmutables.

#### Scenario: Abrir dos veces
- **WHEN** un usuario abre un privado con la misma matrícula dos veces
- **THEN** recibe la misma conversación

#### Scenario: Consigo mismo
- **WHEN** un usuario intenta abrir un privado con su propia matrícula
- **THEN** recibe `VALIDATION`

#### Scenario: Matrícula inexistente
- **WHEN** la matrícula no existe
- **THEN** recibe `NOT_FOUND`

### Requirement: Identificación de la otra persona en privados
Toda conversación `DIRECT` devuelta por `conversations.list` o `conversations.direct` SHALL incluir `peer:{id,matricula,name}` con la otra persona desde la perspectiva de quien consulta.

#### Scenario: Perspectiva de cada integrante
- **WHEN** Ana y Beto consultan su privado
- **THEN** Ana ve a Beto como `peer` y Beto ve a Ana

### Requirement: Creación de grupos
`groups.create {name, matriculas}` SHALL crear un grupo cuyo creador es el usuario, siempre miembro e inmutable. El nombre tiene de 1 a 80 caracteres sin caracteres de control. El grupo MUST tener como máximo 100 integrantes contando al creador.

#### Scenario: Grupo válido
- **WHEN** un usuario crea un grupo con 3 matrículas existentes
- **THEN** el grupo tiene 4 integrantes y él es el creador

#### Scenario: Demasiados integrantes
- **WHEN** la lista produce más de 100 integrantes
- **THEN** recibe `VALIDATION`

#### Scenario: Matrícula inexistente en la lista
- **WHEN** alguna matrícula no existe
- **THEN** recibe `NOT_FOUND` y no se crea el grupo

### Requirement: Administración de integrantes
Solo el creador SHALL poder `groups.add` y `groups.remove`; el creador MUST NOT poder retirarse. Agregar a quien ya es miembro no cambia nada. Agregar con el grupo en 100 integrantes MUST responder `VALIDATION`.

#### Scenario: Integrante que no es creador
- **WHEN** un miembro que no creó el grupo intenta agregar a alguien
- **THEN** recibe `FORBIDDEN`

#### Scenario: Retirar al creador
- **WHEN** el creador intenta retirarse
- **THEN** recibe `VALIDATION`

#### Scenario: Operar sobre un privado
- **WHEN** se intenta `groups.add` en una conversación `DIRECT`
- **THEN** recibe `FORBIDDEN`

### Requirement: Consulta de integrantes
`groups.members {conversationId}` SHALL devolver los integrantes actuales ordenados por matrícula a cualquier miembro del grupo o del privado.

#### Scenario: No miembro
- **WHEN** alguien ajeno consulta los integrantes de un grupo
- **THEN** recibe `FORBIDDEN`

### Requirement: Efecto de retirar a un integrante
Al retirar a un integrante, toda consulta posterior suya a esa conversación MUST responder `FORBIDDEN` y deja de recibir nuevas entregas. Los miembros actuales ven todo el historial del grupo, incluido el anterior a su ingreso.

#### Scenario: Consulta tras ser retirado
- **WHEN** un integrante retirado pide `messages.list` del grupo
- **THEN** recibe `FORBIDDEN`

#### Scenario: Miembro nuevo
- **WHEN** alguien se agrega a un grupo con historial
- **THEN** puede leer los mensajes anteriores a su ingreso

### Requirement: Lista de conversaciones
`conversations.list` SHALL devolver la conversación General más aquellas de las que el usuario es miembro, ordenadas por id ascendente, con cursor `after`, `limit` 1–100 y páginas limitadas además a unos 48000 bytes.

#### Scenario: Paginación por bytes
- **WHEN** las conversaciones de una página superan el presupuesto de bytes
- **THEN** la página trae menos elementos que `limit` y un `nextCursor`

### Requirement: Sin funciones fuera de alcance
La versión 1 MUST NOT ofrecer transferencia de propiedad, eliminación de grupos, edición o borrado de mensajes ni adjuntos.

#### Scenario: Operación no soportada
- **WHEN** un cliente envía una operación de borrar grupo
- **THEN** recibe `VALIDATION` por operación desconocida
