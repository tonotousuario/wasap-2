# user-directory Specification

## Purpose

Define la búsqueda de usuarios que permite abrir privados y armar grupos, y qué datos de cada usuario son visibles para los demás.

## Requirements

### Requirement: Búsqueda de usuarios
`users.list {query?}` SHALL devolver hasta 100 usuarios cuya matrícula o nombre contenga `query` sin distinguir mayúsculas (todos si falta), ordenados por matrícula, cada uno con solo `id`, `matricula` y `name`. `query` se recorta a 120 caracteres.

#### Scenario: Búsqueda por nombre
- **WHEN** un usuario autenticado busca "ana"
- **THEN** recibe hasta 100 usuarios cuyo nombre o matrícula contiene "ana"

#### Scenario: Sin autenticación
- **WHEN** un socket sin sesión envía `users.list`
- **THEN** recibe `UNAUTHENTICATED`

### Requirement: Validación de datos de usuario
Las matrículas SHALL normalizarse a mayúsculas y cumplir `[A-Z0-9][A-Z0-9_.-]{0,31}`; los nombres tienen de 1 a 120 caracteres sin caracteres de control. Una matrícula duplicada MUST responder `CONFLICT`.

#### Scenario: Matrícula duplicada
- **WHEN** se da de alta una matrícula que ya existe con otras mayúsculas
- **THEN** la operación falla con `CONFLICT`
