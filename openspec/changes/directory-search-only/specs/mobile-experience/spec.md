# Spec Delta

## MODIFIED Requirements

### Requirement: Chats
La pestaña de chats SHALL listar las conversaciones con filtro por tipo, titular los privados con el nombre de la otra persona y permitir abrir un privado o crear un grupo buscando personas por matrícula o nombre. El hilo SHALL limitar el mensaje a 4000 caracteres y cargar mensajes anteriores bajo demanda.

#### Scenario: Directorio truncado
- **WHEN** una búsqueda devuelve exactamente 100 personas
- **THEN** la app indica que son las primeras 100 y sugiere acotar la búsqueda

## ADDED Requirements

### Requirement: Selección de personas por búsqueda
Las pantallas Nuevo chat, Crear grupo y Añadir integrante SHALL empezar con un campo de búsqueda y sin lista; la app MUST NOT consultar el directorio hasta que haya al menos 3 caracteres, y mientras tanto SHALL indicar "Escribe al menos 3 letras o números".

#### Scenario: Abrir Nuevo chat
- **WHEN** el usuario abre Nuevo chat
- **THEN** ve el campo de búsqueda y la indicación, sin ninguna persona listada ni consulta al servidor

#### Scenario: Búsqueda válida
- **WHEN** escribe "beto"
- **THEN** la app consulta el directorio y muestra los resultados, sin incluirse a sí mismo

#### Scenario: Selección conservada en un grupo
- **WHEN** al crear un grupo el usuario elige personas de búsquedas distintas
- **THEN** las personas elegidas se conservan aunque cambie la búsqueda
