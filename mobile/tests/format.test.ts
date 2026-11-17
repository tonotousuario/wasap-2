import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyConnectFailure, ConnectError, errorCode} from '../src/errors.ts';
import {ProtocolError} from '../src/state.ts';
import {
  canSearchDirectory,
  clock,
  pendingLabel,
  conversationTitle,
  customRange,
  dayLabel,
  explainError,
  groupByDay,
  isoDate,
  linkState,
  maskDate,
  parseDisplayDate,
  presetRange,
  previewText,
  sortConversations,
} from '../src/format.ts';
import type {Conversation, Message} from '../src/types.ts';

const now = new Date(2026, 10, 13, 9, 30);
const at = (year: number, month: number, day: number, hour = 8) => new Date(year, month - 1, day, hour).toISOString();
const msg = (
  id: string,
  conversationId: string,
  senderId: string,
  senderName: string,
  createdAt: string,
  text = 'hola',
): Message => ({id, conversationId, seq: id, senderId, senderName, text, createdAt});
const conv = (id: string, kind: Conversation['kind'], name: string): Conversation => ({
  id,
  kind,
  name,
  ownerId: null,
  lastSeq: '0',
});

test('connection failures separate TLS rejection, unreachable server and closed sockets', () => {
  assert.equal(
    classifyConnectFailure(
      'java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.',
    ),
    'tls',
  );
  assert.equal(classifyConnectFailure('Hostname 10.0.0.9 not verified'), 'tls');
  assert.equal(classifyConnectFailure('failed to connect to /192.168.1.2 (port 5050): ECONNREFUSED'), 'unreachable');
  assert.equal(classifyConnectFailure('El servidor cerró la conexión'), 'closed');
  assert.equal(errorCode(new ConnectError('tls', 'x')), 'CONNECT_TLS');
  assert.equal(errorCode(new ProtocolError('INVALID_CREDENTIALS', 'x')), 'INVALID_CREDENTIALS');
  assert.equal(errorCode(new Error('x')), '');
});

test('login errors read differently for bad credentials, unreachable server and TLS', () => {
  const titles = ['INVALID_CREDENTIALS', 'CONNECT_UNREACHABLE', 'CONNECT_TLS'].map(
    code => explainError(code, 'detalle técnico').title,
  );
  assert.equal(new Set(titles).size, 3);
  for (const code of ['INVALID_CREDENTIALS', 'CONNECT_UNREACHABLE', 'CONNECT_TLS'])
    assert.doesNotMatch(explainError(code, 'SSLHandshakeException').body, /SSLHandshake/);
  assert.equal(explainError('', 'Texto del servidor').body, 'Texto del servidor');
});

test('connecting, reconnecting, syncing, online and offline are distinct link states', () => {
  assert.equal(linkState({online: false, busy: true, session: null, needsLogin: false}), 'connecting');
  assert.equal(linkState({online: false, busy: true, session: {}, needsLogin: false}), 'reconnecting');
  assert.equal(linkState({online: true, busy: true, session: {}, needsLogin: false}), 'syncing');
  assert.equal(linkState({online: true, busy: false, session: {}, needsLogin: false}), 'online');
  assert.equal(linkState({online: false, busy: false, session: {}, needsLogin: false}), 'offline');
});

test('date presets produce inclusive server ranges from the device date', () => {
  assert.deepEqual(presetRange('all', now), {});
  assert.deepEqual(presetRange('today', now), {from: '2026-11-13', to: '2026-11-13'});
  assert.deepEqual(presetRange('week', now), {from: '2026-11-07', to: '2026-11-13'});
  assert.deepEqual(presetRange('month', now), {from: '2026-11-01', to: '2026-11-13'});
  assert.deepEqual(presetRange('week', new Date(2026, 0, 3)), {from: '2025-12-28', to: '2026-01-03'});
});

test('date presets use the server calendar date across year and month boundaries', () => {
  assert.deepEqual(presetRange('today', '2026-01-01'), {from: '2026-01-01', to: '2026-01-01'});
  assert.deepEqual(presetRange('week', '2026-01-03'), {from: '2025-12-28', to: '2026-01-03'});
  assert.deepEqual(presetRange('month', '2026-01-01'), {from: '2026-01-01', to: '2026-01-01'});
});

test('hand-typed ranges accept day/month/year and reject impossible or inverted dates', () => {
  assert.equal(maskDate('13112026'), '13/11/2026');
  assert.equal(maskDate('1311'), '13/11');
  assert.equal(parseDisplayDate('13/11/2026'), '2026-11-13');
  assert.equal(parseDisplayDate('31/02/2026'), null);
  assert.equal(parseDisplayDate('2026-11-13'), null);
  assert.deepEqual(customRange('01/11/2026', ''), {filters: {from: '2026-11-01'}});
  assert.deepEqual(customRange('01/11/2026', '13/11/2026'), {filters: {from: '2026-11-01', to: '2026-11-13'}});
  assert.ok('problem' in customRange('14/11/2026', '13/11/2026'));
  assert.ok('problem' in customRange('31/02/2026', ''));
  assert.ok('problem' in customRange('', ''));
});

test('history groups by local day with Hoy/Ayer labels and keeps server order', () => {
  const events = [at(2026, 11, 13, 9), at(2026, 11, 13, 7), at(2026, 11, 12, 14), at(2025, 12, 31, 10)];
  const groups = groupByDay(events, value => value);
  assert.deepEqual(
    groups.map(group => group.items.length),
    [2, 1, 1],
  );
  assert.deepEqual(
    groups.map(group => dayLabel(group.key, now)),
    ['Hoy', 'Ayer', 'miércoles 31 de diciembre de 2025'],
  );
  assert.equal(dayLabel(isoDate(new Date(2026, 10, 9)), now), 'lunes 9 de noviembre');
});

test('attendance times and day groups follow the server zone near midnight', () => {
  const events = ['2026-11-14T06:00:00Z', '2026-11-14T05:59:00Z'];
  const groups = groupByDay(events, value => value, 'America/Mexico_City');
  assert.deepEqual(
    groups.map(group => group.key),
    ['2026-11-14', '2026-11-13'],
  );
  assert.deepEqual(
    groupByDay(events, value => value, 'UTC').map(group => group.key),
    ['2026-11-14'],
  );
  assert.deepEqual(
    groups.map(group => dayLabel(group.key, '2026-11-14')),
    ['Hoy', 'Ayer'],
  );
  assert.equal(clock(events[1], 'America/Mexico_City'), '23:59');
});

test('a private chat is titled with the other person, never just "Privado" when they are known', () => {
  const direct = conv('d1', 'DIRECT', 'Privado');
  assert.equal(
    conversationTitle(
      {...direct, peer: {id: 'u2', matricula: 'B001', name: 'Nombre actual'}},
      'Nombre anterior',
      [],
      'me',
    ),
    'Nombre actual',
  );
  const history = [
    msg('1', 'd1', 'me', 'Ana', at(2026, 11, 12)),
    msg('2', 'd1', 'u2', 'Luis Pérez', at(2026, 11, 12, 9)),
  ];
  assert.equal(conversationTitle(direct, 'Luis Pérez Soto', [], 'me'), 'Luis Pérez Soto');
  assert.equal(conversationTitle(direct, undefined, history, 'me'), 'Luis Pérez');
  assert.equal(conversationTitle(direct, undefined, [history[0]], 'me'), 'Chat privado');
  assert.equal(conversationTitle(conv('g1', 'GROUP', 'Redes 5A'), 'x', history, 'me'), 'Redes 5A');
});

test('previews name the sender and conversations sort by latest message', () => {
  const own = msg('1', 'g', 'me', 'Ana', at(2026, 11, 12), 'voy\ntarde');
  const other = msg('2', 'g', 'u2', 'Luis Pérez', at(2026, 11, 13), 'ok');
  assert.equal(previewText(own, 'GROUP', 'me'), 'Tú: voy tarde');
  assert.equal(previewText(other, 'GROUP', 'me'), 'Luis: ok');
  assert.equal(previewText(other, 'DIRECT', 'me'), 'ok');
  assert.equal(previewText(undefined, 'GROUP', 'me'), 'Sin mensajes todavía');
  const sorted = sortConversations(
    [conv('empty', 'GROUP', 'Vacío'), conv('old', 'DIRECT', 'Privado'), conv('new', 'GENERAL', 'General')],
    {old: [own], new: [other]},
  );
  assert.deepEqual(
    sorted.map(c => c.id),
    ['new', 'old', 'empty'],
  );
});

test('directory search needs at least three characters after trimming', () => {
  assert.equal(canSearchDirectory(''), false);
  assert.equal(canSearchDirectory('  an  '), false);
  assert.equal(canSearchDirectory('😀😀'), false); // two characters, four UTF-16 units
  assert.equal(canSearchDirectory(' ana '), true);
  assert.equal(canSearchDirectory('A01'), true);
});

test('pending summary counts queued messages and names other operations', () => {
  assert.equal(pendingLabel(0, null), '');
  assert.equal(pendingLabel(1, 'messages.send'), '1 mensaje esperando confirmación');
  assert.equal(pendingLabel(3, 'messages.send'), '3 mensajes esperando confirmación');
  assert.equal(pendingLabel(1, 'attendance.mark'), 'Una operación esperando confirmación');
});
