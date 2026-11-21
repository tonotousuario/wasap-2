# Necesidades de backend detectadas en el rediseño móvil

La interfaz actual funciona sobre el contrato de `docs/protocol.md`; nada de
esto está simulado en la app. Los puntos **1 y 3 están implementados y consumidos
por el móvil**. Los demás son mejoras pendientes y compatibles con clientes
existentes (solo añaden campos u operaciones).

| # | Necesidad de la interfaz | Operación o campo | Cambio mínimo compatible | Permisos y pruebas que conservar |
|---|---|---|---|---|
| 1 · Hecho | Titular un privado con la otra persona. El móvil usa `peer` sin consultar integrantes; conserva la consulta como compatibilidad con servidores anteriores. | `Conversation.peer?:{id,matricula,name}` en DIRECT. | Disponible en `conversations.list` y `conversations.direct`; `conversations.changed` sigue siendo una señal para refrescar. Páginas limitadas también por bytes. | Pruebas de perspectiva de cada integrante, privacidad del directorio, tramas Unicode y cursores UUID; membresía y bajas siguen protegidas. |
| 2 | Vista previa y orden por actividad sin descargar la última página de cada conversación al reconectar. | `Conversation.lastMessage?:{id,seq,senderId,senderName,text,createdAt}` (texto truncado, p. ej. 200 caracteres). | Campo opcional; respetar el límite de 64 KiB por trama al paginar. | Reautorizar membresía al escribir la trama, como hoy en `messages.list`; pruebas de presupuesto de bytes y de revocación. |
| 3 · Hecho | Los filtros «Hoy / 7 días / Este mes» refrescan la fecha del servidor. Las horas y la agrupación del historial usan su zona horaria. | `timezone` (IANA) y `today` (`YYYY-MM-DD`) en `attendance.state` y `attendance.changed`. | Campos opcionales; el móvil conserva compatibilidad con el calendario del teléfono si faltan. Una respuesta con la misma secuencia puede actualizar el calendario. | Prueba de límites inclusivos del día local, paginación y privacidad en `attendance.list`; pruebas móviles de medianoche, cambio de año y actualización sin nuevo movimiento. |
| 4 | Saber si una búsqueda quedó truncada (hoy la app lo infiere cuando llegan exactamente 100). `users.list` ya exige una búsqueda de al menos 3 caracteres: no existe listado completo del directorio. | `users.list` → `{users, hasMore:boolean}`. | Campo opcional. | Requiere sesión y búsqueda de ≥3 caracteres; conservar el tope de 100 y la prueba de tamaño de trama. |
| 5 | Mostrar cuántas personas tiene un grupo en la lista y en la cabecera sin pedir todos los integrantes. | `Conversation.memberCount?:number` en GROUP. | Campo opcional. | Solo para integrantes actuales; actualizarlo en altas y bajas dentro de la misma transacción. |
| 6 | Contador de mensajes sin leer. La doble palomita ya usa confirmaciones de visibilidad para el autor sin identificar al lector. | Reservar un registro por usuario si se añade el contador. | [Protocolo de confirmación actual](protocol.md#operations). | El contador requiere datos por usuario. |
| 7 | Presencia («en línea»). **No existen datos**; la app no la muestra. | Evento `presence.changed` o campo en `users.list`. | Nuevo; valorar el coste en privacidad antes de implementarlo. | Solo usuarios autenticados; no revelar presencia a quien no comparte conversación. |

Los puntos pendientes 2, 4, 5, 6 y 7 no bloquean la entrega actual. No se han
añadido datos simulados de lectura o presencia.
