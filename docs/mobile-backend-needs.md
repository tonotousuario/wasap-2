# Necesidades de backend detectadas en el rediseño móvil

La interfaz actual funciona completa sobre el contrato de `docs/protocol.md`; nada de
esto está simulado en la app. Cada punto es opcional y compatible con clientes
existentes (solo añade campos u operaciones). Pensado para delegarse a otro agente.

| # | Necesidad de la interfaz | Operación o campo | Cambio mínimo compatible | Permisos y pruebas que conservar |
|---|---|---|---|---|
| 1 | Titular un privado con la otra persona. Hoy el servidor envía `name:"Privado"` y la app consulta `groups.members` sobre la conversación DIRECT (funciona, pero el protocolo solo lo documenta para grupos). | `Conversation.peer?:{id,matricula,name}` en DIRECT; o documentar que `groups.members` vale para cualquier conversación propia. | Campo opcional nuevo en `conversations.list`, `conversations.direct` y eventos; los clientes antiguos lo ignoran. | Solo integrantes ven la conversación y su `peer`; conservar pruebas de membresía y de `FORBIDDEN` tras una baja. |
| 2 | Vista previa y orden por actividad sin descargar la última página de cada conversación al reconectar. | `Conversation.lastMessage?:{id,seq,senderId,senderName,text,createdAt}` (texto truncado, p. ej. 200 caracteres). | Campo opcional; respetar el límite de 64 KiB por trama al paginar. | Reautorizar membresía al escribir la trama, como hoy en `messages.list`; pruebas de presupuesto de bytes y de revocación. |
| 3 | Los filtros «Hoy / 7 días / Este mes» se calculan con la fecha del teléfono, pero el servidor filtra en `APP_TIMEZONE`. Cerca de medianoche o con otra zona horaria pueden no coincidir. | `timezone` (IANA) y `today` (`YYYY-MM-DD`) en la respuesta de `attendance.state`. | Campos opcionales nuevos. | Sin cambios de permisos; añadir prueba de límite de día en `attendance.list`. |
| 4 | Saber si el directorio quedó truncado (hoy la app lo infiere cuando llegan exactamente 100). | `users.list` → `{users, hasMore:boolean}`. | Campo opcional. | Requiere sesión; conservar el tope de 100 y la prueba de tamaño de trama. |
| 5 | Mostrar cuántas personas tiene un grupo en la lista y en la cabecera sin pedir todos los integrantes. | `Conversation.memberCount?:number` en GROUP. | Campo opcional. | Solo para integrantes actuales; actualizarlo en altas y bajas dentro de la misma transacción. |
| 6 | Mensajes sin leer y confirmación de lectura. **No existen datos**, por eso la app no muestra contadores ni doble palomita. | `conversations.read {conversationId, seq}` + `Conversation.unreadCount`; evento `conversations.changed` al variar. | Operación y campo nuevos; decidir antes si la lectura es privada o visible para el remitente. | Idempotente por UUID como las demás mutaciones; un usuario solo marca su propia lectura; pruebas de reintento sin duplicar. |
| 7 | Presencia («en línea»). **No existen datos**; la app no la muestra. | Evento `presence.changed` o campo en `users.list`. | Nuevo; valorar el coste en privacidad antes de implementarlo. | Solo usuarios autenticados; no revelar presencia a quien no comparte conversación. |

Ninguno bloquea la entrega actual. Los puntos 1 y 3 son los que más mejoran la
exactitud de lo que ya se muestra.
