# Spec Delta

## MODIFIED Requirements

### Requirement: Búsqueda de usuarios
`users.list {query}` SHALL exigir `query` con al menos 3 caracteres después de recortar espacios y devolver hasta 100 usuarios cuya matrícula o nombre lo contenga sin distinguir mayúsculas, ordenados por matrícula, cada uno con solo `id`, `matricula` y `name`. `query` se recorta a 120 caracteres. Sin `query` o con menos de 3 caracteres MUST responder `VALIDATION`.

#### Scenario: Búsqueda por nombre
- **WHEN** un usuario autenticado busca "ana"
- **THEN** recibe hasta 100 usuarios cuyo nombre o matrícula contiene "ana"

#### Scenario: Sin autenticación
- **WHEN** un socket sin sesión envía `users.list`
- **THEN** recibe `UNAUTHENTICATED`

#### Scenario: Sin búsqueda
- **WHEN** un usuario autenticado envía `users.list` sin `query`
- **THEN** recibe `VALIDATION` y ningún usuario

#### Scenario: Búsqueda demasiado corta
- **WHEN** la búsqueda es "  an " (2 caracteres tras recortar)
- **THEN** recibe `VALIDATION`
