# Design

## Context

La línea base tenía un pool de 5 conexiones y un límite fijo de 256 sockets.
La sesión se revalida cada 5 s. Los mensajes de General se encolan para todos
los clientes autenticados. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** demostrar 2 000 conexiones en una instancia y eliminar los cuellos conocidos.

**Non-Goals:** varias instancias, balanceador o sharding (solo se prepara la interfaz de eventos).

## Decisions

### D1. Caché de membresía para la entrega
La migración V8 incrementa la revisión de la conversación en la misma transacción
que modifica su membresía. Cubre cambios desde la app, el panel, la consola y
otros procesos que escriben en PostgreSQL. El servidor consulta una revisión
por evento de chat privado o grupal y carga sus integrantes solo cuando cambia.
La revisión y los integrantes se leen en una sola consulta. Los 512 conjuntos
más recientes se conservan en memoria para seleccionar los sockets candidatos.

Cada writer vuelve a autorizar la entrega en PostgreSQL justo antes de escribir.
Así se mantiene la garantía de `event-delivery` aunque la membresía cambie
después de seleccionar destinatarios. Para General basta con la sesión
autenticada.

### D2. Pool y límites
`DB_POOL_SIZE` vale 20 por defecto y `MAX_CONNECTIONS`, 2 500. El pool y la
memoria disponible limitan cuántas operaciones pueden atenderse a la vez.

### D3. Interfaz `EventBus`
`publish(SocketEvent)` y `subscribe(handler)` conectan los eventos confirmados
con el enrutamiento a sockets locales. La implementación en memoria entrega
sincrónicamente al enrutador, y cada socket vacía su propia cola.

Una implementación futura de `PostgresEventBus` usaría una tabla de eventos
con ID, conversación, destinatarios y contenido. El productor persistiría el
evento cuando confirma la mutación y usaría `NOTIFY` con solo su ID. Cada
instancia escucharía el canal en una conexión dedicada, leería el evento por
ID y lo pasaría al enrutador local conservando la autorización al escribir.
Un cursor persistente por instancia permitiría recuperar avisos tras perder la
conexión. Los eventos mantendrían su ID al reintentarse para deduplicarlos.

### D4. Generador de carga
La tarea Gradle `loadTest` crea N usuarios en un esquema temporal, abre N
conexiones TLS y usa el reloj monotónico para medir confirmaciones y entregas.
Compara los recuentos en PostgreSQL después de reenviar una operación de cada
tipo con el mismo UUID.

## Risks / Trade-offs

- [Hardware de referencia distinto al de la escuela] → El informe registra la máquina usada; la prueba es parametrizable.
- [Caché de membresía desincronizada] → Invalidación en commit y prueba de integración de retirada con caché caliente.

## Migration Plan

V8 añade la revisión de membresía con valor inicial cero y activa el trigger
para las escrituras posteriores. Los grupos existentes se cargan al enviar su
primer mensaje. El pool y el límite de conexiones conservan valores por defecto.
