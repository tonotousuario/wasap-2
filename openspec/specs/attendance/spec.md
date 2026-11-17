# attendance Specification

## Purpose

Registra la asistencia de cada usuario como una secuencia alternada de entradas y salidas que continúa entre días, con la hora del servidor como fuente de verdad, y permite consultar el historial propio.

## Requirements

### Requirement: Movimientos alternados sin reinicio diario
`attendance.mark` SHALL registrar el tipo opuesto al último movimiento del usuario (el primero es `ENTRY`), sin límite diario ni reinicio a medianoche. La hora del registro SHALL ser la del servidor de base de datos.

#### Scenario: Primer registro
- **WHEN** un usuario sin movimientos registra asistencia
- **THEN** se crea un movimiento `ENTRY`

#### Scenario: Continuidad entre días
- **WHEN** el último movimiento fue una `ENTRY` de ayer
- **THEN** el siguiente registro es `EXIT`

### Requirement: Concurrencia optimista
`attendance.mark` SHALL exigir `expectedLastEventId` (UUID o `null`) y responder `CONFLICT` si no coincide con el último movimiento vigente. Los registros de un mismo usuario SHALL serializarse.

#### Scenario: Estado desactualizado
- **WHEN** el cliente envía un `expectedLastEventId` que ya no es el último
- **THEN** recibe `CONFLICT` y no se crea ningún movimiento

#### Scenario: Campo ausente
- **WHEN** el payload no incluye `expectedLastEventId`
- **THEN** recibe `VALIDATION`

#### Scenario: Dos dispositivos a la vez
- **WHEN** dos dispositivos del mismo usuario registran con el mismo `expectedLastEventId` simultáneamente
- **THEN** solo uno crea un movimiento y el otro recibe `CONFLICT`

### Requirement: Estado de asistencia
`attendance.state` SHALL devolver `{lastEvent, nextType, timezone, today}`, donde `timezone` es la zona IANA configurada (`APP_TIMEZONE`, por defecto America/Mexico_City) y `today` la fecha local actual del servidor.

#### Scenario: Usuario sin registros
- **WHEN** un usuario sin movimientos consulta su estado
- **THEN** recibe `lastEvent:null` y `nextType:"ENTRY"`

### Requirement: Historial propio paginado
`attendance.list` SHALL devolver solo los movimientos del usuario autenticado, del más reciente al más antiguo, con `limit` 1–100 (50 por defecto), cursor `before` exclusivo por secuencia y `nextCursor` cuando hay más.

#### Scenario: Paginación
- **WHEN** un usuario con 120 movimientos pide 50
- **THEN** recibe los 50 más recientes y un `nextCursor` para continuar

#### Scenario: Privacidad
- **WHEN** un usuario consulta su historial
- **THEN** no aparece ningún movimiento de otro usuario

### Requirement: Filtro por fechas locales
`attendance.list` SHALL aceptar `from` y `to` (`YYYY-MM-DD`, inclusivos) interpretados en `APP_TIMEZONE`. `from` posterior a `to` o fechas inválidas MUST responder `VALIDATION`.

#### Scenario: Movimiento cerca de medianoche
- **WHEN** un movimiento ocurre a las 23:59 hora local y se filtra por ese día
- **THEN** aparece en el resultado aunque en UTC sea del día siguiente

#### Scenario: Rango invertido
- **WHEN** `from` es posterior a `to`
- **THEN** la respuesta es `VALIDATION`
