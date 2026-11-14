// Funciones puras de presentación: textos, fechas y orden. Sin React ni red,
// para poder probarlas con node:test.
import type {Conversation, Message} from './types.ts';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (value: number) => String(value).padStart(2, '0');

/** Fecha local del dispositivo como AAAA-MM-DD (formato que espera el servidor). */
export function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function clock(instant: string) {
  const date = new Date(instant);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function dayKey(instant: string) {
  return isoDate(new Date(instant));
}
function shiftDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
/** «Hoy», «Ayer» o «lunes 9 de noviembre» (con año si no es el actual). */
export function dayLabel(key: string, now: Date) {
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
export function momentLabel(instant: string, now: Date) {
  const key = dayKey(instant);
  const label = dayLabel(key, now);
  if (label === 'Hoy' || label === 'Ayer') return `${label.toLowerCase()} ${clock(instant)}`;
  return `${label.replace(/^\S+ /, '')}, ${clock(instant)}`;
}
export function groupByDay<T>(items: T[], instant: (item: T) => string) {
  const groups: {key: string; items: T[]}[] = [];
  for (const item of items) {
    const key = dayKey(instant(item));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({key, items: [item]});
  }
  return groups;
}

export type RangePreset = 'all' | 'today' | 'week' | 'month';
export function presetRange(preset: RangePreset, now: Date): {from?: string; to?: string} {
  if (preset === 'all') return {};
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
export function customRange(fromText: string, toText: string): {filters: {from?: string; to?: string}} | {problem: string} {
  const from = fromText.trim() ? parseDisplayDate(fromText) : undefined;
  const to = toText.trim() ? parseDisplayDate(toText) : undefined;
  if (from === null) return {problem: 'La fecha «Desde» no existe. Usa día/mes/año, por ejemplo 03/11/2026.'};
  if (to === null) return {problem: 'La fecha «Hasta» no existe. Usa día/mes/año, por ejemplo 13/11/2026.'};
  if (!from && !to) return {problem: 'Escribe al menos una fecha.'};
  if (from && to && from > to) return {problem: '«Desde» debe ser anterior o igual a «Hasta».'};
  return {filters: {...(from ? {from} : {}), ...(to ? {to} : {})}};
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/**
 * Nombre visible de una conversación. En un privado el servidor solo envía
 * «Privado»; usamos a la otra persona si la conocemos (integrantes o mensajes).
 */
export function conversationTitle(conversation: Conversation, peerName: string | undefined, messages: Message[], ownId: string | undefined) {
  if (conversation.kind !== 'DIRECT') return conversation.name;
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
    case 'INVALID_CREDENTIALS': return {title: 'Matrícula o PIN incorrectos', body: 'Revisa tus datos y vuelve a intentarlo.'};
    case 'RATE_LIMITED': return {title: 'Demasiados intentos', body: 'Espera un momento antes de intentarlo otra vez.'};
    case 'UNAUTHENTICATED': return {title: 'Tu sesión venció', body: 'Vuelve a entrar para continuar.'};
    case 'CONNECT_UNREACHABLE': return {title: 'No se pudo llegar al servidor', body: 'Revisa el Wi-Fi, la dirección y el puerto del servidor.'};
    case 'CONNECT_TLS': return {title: 'Conexión segura rechazada', body: 'El certificado del servidor no es válido para esta dirección. Avisa a quien lo administra.'};
    case 'CONNECT_CLOSED': return {title: 'Se perdió la conexión', body: 'Volveremos a intentarlo automáticamente.'};
    case 'CONNECT_OFFLINE': return {title: 'Sin conexión', body: 'Esta acción necesita conexión con el servidor.'};
    case 'CONNECT_CONFIG': return {title: 'Instalación incompleta', body: 'Esta copia de la app no incluye el certificado de instalación.'};
    case 'CONFLICT': return {title: 'Tu asistencia cambió en otro dispositivo', body: 'Ya actualizamos tu estado. Revísalo antes de registrar de nuevo.'};
    case 'FORBIDDEN': return {title: 'No tienes permiso', body: message || 'Esta acción no está disponible para tu cuenta.'};
    case 'NOT_FOUND': return {title: 'Ya no está disponible', body: message || 'Es posible que haya cambiado mientras lo veías.'};
    case 'VALIDATION': return {title: 'Revisa lo que escribiste', body: message || 'El servidor no aceptó ese dato.'};
    case 'UNAVAILABLE':
    case 'INTERNAL': return {title: 'El servidor no pudo responder', body: 'Inténtalo de nuevo en un momento.'};
    default: return {title: 'Algo salió mal', body: message || 'Inténtalo de nuevo.'};
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
