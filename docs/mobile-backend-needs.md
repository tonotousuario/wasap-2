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
| 4 | Saber si el directorio quedó truncado (hoy la app lo infiere cuando llegan exactamente 100). | `users.list` → `{users, hasMore:boolean}`. | Campo opcional. | Requiere sesión; conservar el tope de 100 y la prueba de tamaño de trama. |
| 5 | Mostrar cuántas personas tiene un grupo en la lista y en la cabecera sin pedir todos los integrantes. | `Conversation.memberCount?:number` en GROUP. | Campo opcional. | Solo para integrantes actuales; actualizarlo en altas y bajas dentro de la misma transacción. |
| 6 | Mensajes sin leer y confirmación de lectura. **No existen datos**, por eso la app no muestra contadores ni doble palomita. | `conversations.read {conversationId, seq}` + `Conversation.unreadCount`; evento `conversations.changed` al variar. | Operación y campo nuevos; decidir antes si la lectura es privada o visible para el remitente. | Idempotente por UUID como las demás mutaciones; un usuario solo marca su propia lectura; pruebas de reintento sin duplicar. |
| 7 | Presencia («en línea»). **No existen datos**; la app no la muestra. | Evento `presence.changed` o campo en `users.list`. | Nuevo; valorar el coste en privacidad antes de implementarlo. | Solo usuarios autenticados; no revelar presencia a quien no comparte conversación. |

Los puntos pendientes 2, 4, 5, 6 y 7 no bloquean la entrega actual. No se han
añadido datos simulados de lectura o presencia.
