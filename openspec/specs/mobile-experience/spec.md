# mobile-experience Specification

## Purpose

Define el comportamiento visible de la app: pantallas, estados que siempre se contemplan, datos que nunca se simulan y requisitos de accesibilidad e idioma comunes a Android e iPhone.

## Requirements

### Requirement: Navegación principal
Con sesión, la app SHALL mostrar tres pestañas: Asistencia, Chats y Ajustes. Sin sesión SHALL mostrar el acceso con matrícula y PIN (solo dígitos, máximo 12) y el servidor al que se conectará.

#### Scenario: Usuario sin sesión
- **WHEN** se abre la app sin sesión
- **THEN** se muestra la pantalla de acceso con el servidor configurado

### Requirement: Asistencia
La pestaña de asistencia SHALL mostrar el estado actual (dentro, fuera o sin registros) con la hora del servidor, un botón para registrar el siguiente movimiento, y el historial agrupado por día con filtros Todo, Hoy, 7 días, Este mes y un rango personalizado `dd/mm/aaaa`, calculados con la fecha y zona del servidor.

#### Scenario: Filtro Hoy después de medianoche
- **WHEN** el usuario elige Hoy después de la medianoche del servidor
- **THEN** el filtro usa la fecha actual del servidor aunque no haya nuevos movimientos

### Requirement: Chats
La pestaña de chats SHALL listar las conversaciones con filtro por tipo, titular los privados con el nombre de la otra persona y permitir abrir un privado o crear un grupo buscando personas por matrícula o nombre. El hilo SHALL limitar el mensaje a 4000 caracteres y cargar mensajes anteriores bajo demanda.

#### Scenario: Directorio truncado
- **WHEN** una búsqueda devuelve exactamente 100 personas
- **THEN** la app indica que son las primeras 100 y sugiere acotar la búsqueda

### Requirement: Integrantes de grupo
El creador SHALL poder ver los integrantes (`N de 100`), agregar y retirar personas con confirmación que explica que lo ya leído no se puede retirar. Los demás miembros solo ven la lista.

#### Scenario: Retirar a alguien
- **WHEN** el creador elige quitar a un integrante
- **THEN** la app pide confirmación antes de enviar `groups.remove`

### Requirement: Ajustes y diagnóstico
Ajustes SHALL mostrar el usuario, el estado de conexión, el servidor, una acción para sincronizar o reconectar, un diagnóstico técnico copiable y cerrar sesión.

#### Scenario: Diagnóstico
- **WHEN** el usuario abre Diagnóstico tras un error
- **THEN** ve el código y detalle técnico del último error

### Requirement: Sin confirmaciones falsas
La app MUST NOT mostrar una operación como confirmada antes de la respuesta del servidor; una operación enviada sin respuesta SHALL mostrarse como "pendiente de confirmación" con una acción para comprobarla.

#### Scenario: Respuesta pendiente
- **WHEN** se registra asistencia y se pierde la respuesta
- **THEN** la app muestra el aviso de pendiente, no una confirmación

### Requirement: Sin datos simulados
La app MUST NOT mostrar lectura, presencia, contadores de no leídos ni ningún dato que el servidor no entregue.

#### Scenario: Lista de chats
- **WHEN** se muestra la lista de conversaciones
- **THEN** no aparecen contadores de no leídos ni indicadores de en línea

### Requirement: Estados de cada pantalla
Cada pantalla SHALL contemplar vacío, carga, error, desconexión y sesión vencida, y ningún estado MUST depender solo del color.

#### Scenario: Sin conexión
- **WHEN** se pierde la conexión
- **THEN** se muestra una franja con texto e icono indicando que reintenta sola

### Requirement: Accesibilidad e idioma
La interfaz SHALL estar en español, respetar áreas seguras y el tamaño de fuente del sistema, tener etiquetas para lectores de pantalla y objetivos táctiles de al menos 44–48 puntos, y adaptar las convenciones visuales de Material en Android y de iOS en iPhone con el mismo contenido y flujos.

#### Scenario: Lector de pantalla
- **WHEN** un usuario con TalkBack o VoiceOver recorre las pestañas
- **THEN** cada pestaña anuncia su nombre y si está seleccionada

### Requirement: Datos al cambiar de cuenta
Al cerrar sesión o cambiar de cuenta, la app SHALL borrar de memoria y de pantalla todos los datos de la cuenta anterior.

#### Scenario: Cambio de cuenta
- **WHEN** inicia sesión otra cuenta
- **THEN** no se muestra ningún mensaje, conversación ni asistencia de la anterior

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

### Requirement: Mensajes en cola y no enviados en el hilo
El hilo SHALL mostrar al final los mensajes propios en cola con un indicador "pendiente" que no dependa solo del color, y los mensajes no enviados con el motivo y acciones para copiar el texto al compositor o descartarlo. Un mensaje no enviado MUST NOT reenviarse automáticamente.

#### Scenario: Mensaje en cola
- **WHEN** el usuario envía dos mensajes seguidos con la red lenta
- **THEN** ambos aparecen como pendientes en orden y cambian a confirmados al llegar cada respuesta

#### Scenario: Mensaje no enviado
- **WHEN** un mensaje en cola recibe un error definitivo
- **THEN** aparece como no enviado con el motivo y la opción de copiarlo al compositor
