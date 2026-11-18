// Funciones puras de presentación: textos, fechas y orden. Sin React ni red,
// para poder probarlas con node:test.
import type {Conversation, Message} from './types.ts';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const pad = (value: number) => String(value).padStart(2, '0');

/** Fecha local del dispositivo como AAAA-MM-DD (formato que espera el servidor). */
export function isoDate(date: Date, timezone?: string) {
  if (timezone) {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (name: string) => parts.find(value => value.type === name)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function clock(instant: string, timezone?: string) {
  const date = new Date(instant);
  if (timezone)
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function dayKey(instant: string, timezone?: string) {
  return isoDate(new Date(instant), timezone);
}
const calendarDate = (calendar: Date | string) =>
  typeof calendar === 'string' ? new Date(`${calendar}T12:00:00`) : calendar;
function shiftDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
/** «Hoy», «Ayer» o «lunes 9 de noviembre» (con año si no es el actual). */
export function dayLabel(key: string, calendar: Date | string) {
  const now = calendarDate(calendar);
  if (key === isoDate(now)) return 'Hoy';
  if (key === isoDate(shiftDays(now, -1))) return 'Ayer';
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const label = `${DAYS[date.getDay()]} ${day} de ${MONTHS[month - 1]}`;
  return year === now.getFullYear() ? label : `${label} de ${year}`;
}
/** Hora si es de hoy, «Ayer», o fecha corta: para la lista de conversaciones. */
export function listTime(instant: string, now: Date) {
  const key = dayKey(instant);
  if (key === isoDate(now)) return clock(instant);
  if (key === isoDate(shiftDays(now, -1))) return 'Ayer';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year.slice(2)}`;
}
/** «hoy 07:02», «ayer 13:40» o «9 de noviembre, 13:40». */
export function momentLabel(instant: string, now: Date | string, timezone?: string) {
  const key = dayKey(instant, timezone);
  const label = dayLabel(key, now);
  if (label === 'Hoy' || label === 'Ayer') return `${label.toLowerCase()} ${clock(instant, timezone)}`;
  return `${label.replace(/^\S+ /, '')}, ${clock(instant, timezone)}`;
}
export function groupByDay<T>(items: T[], instant: (item: T) => string, timezone?: string) {
  const groups: {key: string; items: T[]}[] = [];
  for (const item of items) {
    const key = dayKey(instant(item), timezone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({key, items: [item]});
  }
  return groups;
}

export type RangePreset = 'all' | 'today' | 'week' | 'month';
export function presetRange(preset: RangePreset, calendar: Date | string): {from?: string; to?: string} {
  if (preset === 'all') return {};
  const now = calendarDate(calendar);
  const to = isoDate(now);
  if (preset === 'today') return {from: to, to};
  if (preset === 'week') return {from: isoDate(shiftDays(now, -6)), to};
  return {from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to};
}
/** Inserta las barras mientras se escribe: 13112026 → 13/11/2026. */
export function maskDate(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}
/** DD/MM/AAAA → AAAA-MM-DD, o null si no es una fecha real. */
export function parseDisplayDate(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
export function displayDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
/** Valida un rango escrito a mano. Devuelve filtros o el motivo del rechazo. */
export function customRange(
  fromText: string,
  toText: string,
): {filters: {from?: string; to?: string}} | {problem: string} {
  const from = fromText.trim() ? parseDisplayDate(fromText) : undefined;
  const to = toText.trim() ? parseDisplayDate(toText) : undefined;
  if (from === null) return {problem: 'La fecha «Desde» no existe. Usa día/mes/año, por ejemplo 03/11/2026.'};
  if (to === null) return {problem: 'La fecha «Hasta» no existe. Usa día/mes/año, por ejemplo 13/11/2026.'};
  if (!from && !to) return {problem: 'Escribe al menos una fecha.'};
  if (from && to && from > to) return {problem: '«Desde» debe ser anterior o igual a «Hasta».'};
  return {filters: {...(from ? {from} : {}), ...(to ? {to} : {})}};
}

/** First and last word that start with a letter, ignoring «(tú)»-style suffixes. */
export function initials(name: string) {
  const words = name
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(word => /^\p{L}/u.test(word));
  if (!words.length) return '?';
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : '';
  return (first + last).toLocaleUpperCase('es');
}

/**
 * El servidor identifica al destinatario. Los servidores anteriores pueden
 * resolverlo con los integrantes o los mensajes ya recibidos.
 */
export function conversationTitle(
  conversation: Conversation,
  peerName: string | undefined,
  messages: Message[],
  ownId: string | undefined,
) {
  if (conversation.kind !== 'DIRECT') return conversation.name;
  if (conversation.peer) return conversation.peer.name;
  if (peerName) return peerName;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].senderId !== ownId) return messages[index].senderName;
  }
  return 'Chat privado';
}
export function kindLabel(kind: Conversation['kind']) {
  return kind === 'GENERAL' ? 'Chat general' : kind === 'GROUP' ? 'Grupo' : 'Privado';
}
export function previewText(message: Message | undefined, kind: Conversation['kind'], ownId: string | undefined) {
  if (!message) return 'Sin mensajes todavía';
  const text = message.text.replace(/\s+/g, ' ');
  if (message.senderId === ownId) return `Tú: ${text}`;
  return kind === 'DIRECT' ? text : `${message.senderName.split(/\s+/)[0]}: ${text}`;
}
/** Más reciente primero; las conversaciones sin mensajes van al final. */
export function sortConversations(conversations: Conversation[], messages: Record<string, Message[]>) {
  const last = (id: string) => messages[id]?.[messages[id].length - 1]?.createdAt ?? '';
  return [...conversations].sort((a, b) => {
    const [x, y] = [last(a.id), last(b.id)];
    if (x !== y) return x > y ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'GENERAL' ? -1 : b.kind === 'GENERAL' ? 1 : 0;
    return a.name.localeCompare(b.name);
  });
}

export type Explained = {title: string; body: string};
/** Convierte un código de error en un mensaje con causa y siguiente paso. */
export function explainError(code: string, message: string): Explained {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return {title: 'Matrícula o PIN incorrectos', body: 'Revisa tus datos y vuelve a intentarlo.'};
    case 'RATE_LIMITED':
      return {title: 'Demasiados intentos', body: 'Espera un momento antes de intentarlo otra vez.'};
    case 'UNAUTHENTICATED':
      return {title: 'Tu sesión venció', body: 'Vuelve a entrar para continuar.'};
    case 'CONNECT_UNREACHABLE':
      return {title: 'No se pudo llegar al servidor', body: 'Revisa el Wi-Fi, la dirección y el puerto del servidor.'};
    case 'CONNECT_TLS':
      return {
        title: 'Conexión segura rechazada',
        body: 'El certificado del servidor no es válido para esta dirección. Avisa a quien lo administra.',
      };
    case 'CONNECT_CLOSED':
      return {title: 'Se perdió la conexión', body: 'Volveremos a intentarlo automáticamente.'};
    case 'CONNECT_OFFLINE':
      return {title: 'Sin conexión', body: 'Esta acción necesita conexión con el servidor.'};
    case 'CONNECT_CONFIG':
      return {title: 'Falta el servidor', body: 'Escanea el código QR del servidor para conectarte.'};
    case 'CONNECT_IDENTITY':
      return {
        title: 'Es otro servidor',
        body: 'En esa dirección responde un servidor distinto al guardado. Escanea de nuevo el código QR de tu servidor.',
      };
    case 'CONFLICT':
      return {
        title: 'Tu asistencia cambió en otro dispositivo',
        body: 'Ya actualizamos tu estado. Revísalo antes de registrar de nuevo.',
      };
    case 'FORBIDDEN':
      return {title: 'No tienes permiso', body: message || 'Esta acción no está disponible para tu cuenta.'};
    case 'NOT_FOUND':
      return {title: 'Ya no está disponible', body: message || 'Es posible que haya cambiado mientras lo veías.'};
    case 'VALIDATION':
      return {title: 'Revisa lo que escribiste', body: message || 'El servidor no aceptó ese dato.'};
    case 'UNAVAILABLE':
    case 'INTERNAL':
      return {title: 'El servidor no pudo responder', body: 'Inténtalo de nuevo en un momento.'};
    default:
      return {title: 'Algo salió mal', body: message || 'Inténtalo de nuevo.'};
  }
}

export type Link = 'connecting' | 'reconnecting' | 'syncing' | 'online' | 'offline';
/** Conexión, reconexión y sincronización son estados distintos para la persona. */
export function linkState(state: {online: boolean; busy: boolean; session: unknown; needsLogin: boolean}): Link {
  if (state.online) return state.busy ? 'syncing' : 'online';
  if (state.busy) return state.session && !state.needsLogin ? 'reconnecting' : 'connecting';
  return 'offline';
}
export const LINK_LABEL: Record<Link, string> = {
  connecting: 'Conectando…',
  reconnecting: 'Reconectando…',
  syncing: 'Sincronizando…',
  online: 'Conectado',
  offline: 'Sin conexión',
};
/** Mínimo de caracteres para consultar el directorio; el servidor exige lo mismo. */
export const DIRECTORY_MIN = 3;
export const DIRECTORY_HINT = 'Escribe al menos 3 letras o números';
/** Si un texto ya alcanza para buscar personas (caracteres reales, sin espacios de borde). */
export function canSearchDirectory(text: string) {
  return [...text.trim()].length >= DIRECTORY_MIN;
}
/** Resumen de lo que espera confirmación: «3 mensajes esperando confirmación». */
export function pendingLabel(count: number, type: string | null) {
  if (!count) return '';
  if (type === 'messages.send')
    return count === 1 ? '1 mensaje esperando confirmación' : `${count} mensajes esperando confirmación`;
  return 'Una operación esperando confirmación';
}
