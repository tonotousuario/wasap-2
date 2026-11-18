# Design

## Context

`attendance_events(user_id, type, seq, recorded_at)` guarda una secuencia global por usuario; `attendance.mark` bloquea la fila del usuario y compara `expectedLastEventId`. Los grupos son `conversations(kind='GROUP', owner_id)` con `conversation_members`. No hay roles: el único «administrador» es la consola. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** asistencia por clase y rol de profesor, compatibles con la puerta general y con los clientes v1.

**Non-Goals:** horarios automáticos (la clase activa no se deduce de la hora en esta fase); geolocalización o prueba de presencia física.

## Decisions

### D1. La clase es un grupo con bandera
`conversations.is_class boolean` y el responsable es `owner_id`. Reutiliza membresía, chat, permisos y eventos existentes; una clase tiene chat propio sin trabajo extra.
- *Alternativa descartada:* tabla `classes` aparte con su propia membresía. Duplica reglas ya probadas (máximo 100, retirada, revocación de entrega).

### D2. Asistencia por par usuario–clase
`attendance_events.class_id uuid NULL` (NULL = puerta general). El último movimiento se busca por `(user_id, class_id)` con índice `(user_id, class_id, seq DESC)`; el bloqueo sigue siendo la fila del usuario (serializa todas sus marcas, lo cual basta a esta escala). `seq` sigue siendo global, sirve de cursor en todos los casos.

### D3. Roles en `users.role`
`text NOT NULL DEFAULT 'student' CHECK (role IN ('admin','teacher','student'))`. La sesión cachea el rol y lo revalida con el mismo TTL de 5 s que la versión de credenciales (una sola consulta), así un cambio de rol llega como una revocación.

### D4. Permisos
`groups.create {class:true}` exige `teacher|admin`; `attendance.classReport` exige ser `owner_id` de la clase o `admin`. La retirada de un alumno no borra sus eventos (no hay FK de membresía en `attendance_events`).

### D5. App
Asistencia gana un selector de chips «General · Redes · Cálculo…» alimentado por `classes.list`; el estado y el historial se piden con el `classId` elegido y la cola de mutaciones ya incluye el payload, así que los reintentos conservan la clase. Los profesores ven además «Lista de la clase» con filtro de fechas.

## Risks / Trade-offs

- [Una marca bloquea todas las del usuario] → A esta escala es irrelevante; documentado para federación/escala futura.
- [Un admin podría crear clases a nombre de nadie] → El responsable es siempre quien la crea; transferir responsable queda fuera de alcance.

## Migration Plan

`V5` añade columnas con valores por defecto: todos los usuarios quedan `student` y todos los eventos en la puerta general. El primer administrador se asigna por consola (`admin users role ... admin`).
