import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../src/engine.ts';
import {ProtocolError} from '../src/state.ts';
import type {Envelope} from '../src/protocol.ts';
import {createHash} from 'node:crypto';

export const sha256 = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const INSTALLATION_CA = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';

class Memory {
  values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}
const user = {id: 'u1', matricula: '123', name: 'Ana'};
const room = {id: 'r1', kind: 'GENERAL', name: 'General', ownerId: null, lastSeq: '0'};
const message = (seq: string) => ({
  id: 'm' + seq,
  seq,
  conversationId: 'r1',
  senderId: 'u1',
  senderName: 'Ana',
  text: seq,
  createdAt: '2026-11-12T00:00:00Z',
});
function setup() {
  const storage = new Memory(),
    secure = new Memory();
  let onEvent = (e: Envelope) => {};
  let onClose = (e: Error) => {};
  let id = 0;
  const calls: {type: string; payload: any; id: string}[] = [];
  let closes = 0;
  let handler = async (type: string, payload: any): Promise<any> => {
    if (type.startsWith('auth.')) return {token: 'session-secret', expiresAt: '2026-11-13T00:00:00Z', user};
    if (type === 'attendance.state') return {lastEvent: null, nextType: 'ENTRY'};
    if (type === 'attendance.list') return {events: [], nextCursor: null};
    if (type === 'conversations.list') return {conversations: [room]};
    if (type === 'messages.list') return {messages: [message('1')], nextCursor: null};
    return {};
  };
  const engine = new Engine({
    storage,
    secure,
    uuid: () => String(++id),
    sha256,
    installationCa: INSTALLATION_CA,
    connect: async (server, event, close) => {
      onEvent = event;
      onClose = close;
      return {
        closed: false,
        request: async (type, payload, id) => {
          calls.push({type, payload, id});
          return handler(type, payload);
        },
        close: error => {
          closes++;
          close(error ?? new Error('closed'));
        },
      };
    },
  });
  return {
    engine,
    storage,
    secure,
    calls,
    get closes() {
      return closes;
    },
    event: (event: Envelope) => onEvent(event),
    disconnect: () => onClose(new Error('lost')),
    setHandler: (fn: typeof handler) => {
      const prior = handler;
      handler = fn;
      return prior;
    },
  };
}
test('reconnect recovers using the last fetched cursor, never a live event that could skip a gap', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  t.event({v: 1, kind: 'event', id: 'e', type: 'message.created', payload: {message: message('4')}});
  t.disconnect();
  let pages = 0;
  const base = t.setHandler(async (type, payload) => {
    if (type === 'messages.list' && payload.after) {
      pages++;
      assert.equal(payload.after, pages === 1 ? '1' : '3');
      return pages === 1
        ? {messages: [message('2'), message('3')], nextCursor: '3'}
        : {messages: [message('4')], nextCursor: null};
    }
    return base(type, payload);
  });
  await t.engine.reconnect();
  assert.deepEqual(
    t.engine.state.messages.r1.map(m => m.seq),
    ['1', '2', '3', '4'],
  );
  assert.equal(pages, 2);
});
test('seen ticks come from the server and survive duplicate message responses', async () => {
  const t = setup();
  await t.engine.initialize();
  const base = t.setHandler(async (type, payload) => {
    if (type === 'server.hello') return {messageReceipts: true};
    if (type === 'messages.seen') return {seenIds: ['m1']};
    return base(type, payload);
  });
  await t.engine.login('123', '123456');
  assert.equal(t.engine.state.messages.r1[0].seen, undefined);
  await t.engine.confirmVisibleMessages('r1', ['m1']);
  assert.equal(t.engine.state.messages.r1[0].seen, true);
  t.event({v: 1, kind: 'event', id: 'e', type: 'message.created', payload: {message: message('2')}});
  t.event({v: 1, kind: 'event', id: 'e', type: 'message.seen', payload: {conversationId: 'r1', messageIds: ['m2']}});
  t.event({v: 1, kind: 'event', id: 'e', type: 'message.created', payload: {message: message('2')}});
  assert.equal(t.engine.state.messages.r1[1].seen, true);
  t.event({v: 1, kind: 'event', id: 'e', type: 'message.created', payload: {message: message('3')}});
  t.event({v: 1, kind: 'event', id: 'e', type: 'message.created', payload: {message: {...message('3'), seen: true}}});
  assert.equal(t.engine.state.messages.r1[2].seen, true);
});

test('older servers keep a single tick and receive no visibility requests', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  await t.engine.confirmVisibleMessages('r1', ['m1']);
  assert.equal(
    t.calls.some(call => call.type === 'messages.seen'),
    false,
  );
  assert.equal(t.engine.state.messages.r1[0].seen, undefined);
});

test('attendance conflict refreshes authoritative state and unlocks the pending action', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const base = t.setHandler(async (type, payload) => {
    if (type === 'attendance.mark') throw new ProtocolError('CONFLICT', 'actualizar');
    if (type === 'attendance.state')
      return {lastEvent: {id: 'e', seq: '1', type: 'ENTRY', recordedAt: '2026-11-12T00:00:00Z'}, nextType: 'EXIT'};
    return base(type, payload);
  });
  await assert.rejects(t.engine.markAttendance(), /actualizar/);
  assert.equal(t.engine.state.attendance?.nextType, 'EXIT');
  assert.equal(t.engine.state.pending, false);
});
test('logout clears token, pending operation, cached messages; new user/server cannot replay it', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const base = t.setHandler(async (type, payload) => {
    if (type === 'messages.send') throw new Error('lost');
    return base(type, payload);
  });
  await assert.rejects(t.engine.mutate('messages.send', {conversationId: 'r1', text: 'pendiente'}));
  assert.equal(t.engine.state.pending, true);
  await t.engine.logout();
  assert.equal(t.secure.values.size, 0);
  assert.equal(t.engine.state.session, null);
  assert.deepEqual(t.engine.state.messages, {});
  assert.equal(
    [...t.storage.values.keys()].some(k => k.startsWith('pending:') || k.startsWith('outbox:')),
    false,
  );
  await t.engine.configure({host: '192.168.1.9', port: 5050});
  assert.equal(t.engine.state.server.host, '192.168.1.9');
});
test('loads every conversation page before removing caches for revoked memberships', async () => {
  const t = setup();
  await t.engine.initialize();
  const base = t.setHandler(async (type, payload) => {
    if (type === 'conversations.list')
      return payload.after
        ? {conversations: [{...room, id: 'r2', name: 'Segundo'}], nextCursor: null}
        : {conversations: [room], nextCursor: 'r1'};
    if (type === 'messages.list') return {messages: [], nextCursor: null};
    return base(type, payload);
  });
  await t.engine.login('123', '123456');
  assert.deepEqual(
    t.engine.state.conversations.map(c => c.id),
    ['r1', 'r2'],
  );
  assert.equal(t.calls.filter(c => c.type === 'conversations.list').length, 2);
});
test('returns committed mutation success even when its follow-up read loses connectivity', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let committed = false;
  const event = {id: 'a1', seq: '1', type: 'ENTRY', recordedAt: '2026-11-12T00:00:00Z'};
  const base = t.setHandler(async (type, payload) => {
    if (type === 'attendance.mark') {
      committed = true;
      return {event, nextType: 'EXIT'};
    }
    if (committed && type === 'attendance.state') throw new Error('read connection lost');
    return base(type, payload);
  });
  const result = await t.engine.markAttendance();
  assert.equal(result.event.id, 'a1');
  assert.equal(t.engine.state.pending, false);
  assert.match(t.engine.state.error, /read connection lost/);
});
test('an awaited message send resolves once confirmed, with the message in its thread and the queue empty', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const base = t.setHandler(async (type, payload) =>
    type === 'messages.send' ? {message: message('2')} : base(type, payload),
  );
  const result = await t.engine.mutate('messages.send', {conversationId: 'r1', text: '2'});
  assert.equal(result.message.id, 'm2');
  assert.equal(t.engine.state.pending, false);
  assert.equal(t.engine.state.pendingCount, 0);
  assert.equal(t.engine.state.messages.r1.at(-1)?.id, 'm2');
});
test('a membership change during recovery queues a trailing authoritative refresh', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let listCalls = 0,
    release: () => void = () => {},
    entered: () => void = () => {};
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const base = t.setHandler(async (type, payload) => {
    if (type === 'conversations.list') {
      listCalls++;
      return {conversations: listCalls === 1 ? [room] : [room, {...room, id: 'r2', name: 'nuevo'}], nextCursor: null};
    }
    if (type === 'messages.list' && listCalls === 1) {
      entered();
      await blocked;
      return {messages: [], nextCursor: null};
    }
    if (type === 'messages.list') return {messages: [], nextCursor: null};
    return base(type, payload);
  });
  const refreshing = t.engine.refreshConversations();
  await started;
  t.event({v: 1, kind: 'event', id: 'membership', type: 'conversations.changed', payload: {}});
  release();
  await refreshing;
  assert.deepEqual(
    t.engine.state.conversations.map(c => c.id),
    ['r1', 'r2'],
  );
  assert.equal(listCalls, 2);
});
test('attendance events and delayed state responses cannot roll back a newer sequence', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const state = (seq: string, type: 'ENTRY' | 'EXIT') => ({
    lastEvent: {id: 'a' + seq, seq, type, recordedAt: '2026-11-12T00:00:00Z'},
    nextType: type === 'ENTRY' ? 'EXIT' : 'ENTRY',
  });
  let release: (value: any) => void = () => {};
  const stale = new Promise(resolve => {
    release = resolve;
  });
  const base = t.setHandler(async (type, payload) => (type === 'attendance.state' ? stale : base(type, payload)));
  const reading = t.engine.refreshAttendance();
  t.event({v: 1, kind: 'event', id: 'new', type: 'attendance.changed', payload: state('3', 'ENTRY')});
  t.event({v: 1, kind: 'event', id: 'old', type: 'attendance.changed', payload: state('1', 'ENTRY')});
  release(state('2', 'EXIT'));
  await reading;
  assert.equal(t.engine.state.attendance?.lastEvent?.seq, '3');
  assert.equal(t.engine.state.attendance?.nextType, 'EXIT');
});
test('attendance calendar refreshes without a new movement before choosing a date preset', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const event = {id: 'a1', seq: '1', type: 'ENTRY', recordedAt: '2026-11-13T15:00:00Z'};
  let today = '2026-11-13';
  const base = t.setHandler(async (type, payload) =>
    type === 'attendance.state'
      ? {lastEvent: event, nextType: 'EXIT', timezone: 'America/Mexico_City', today}
      : base(type, payload),
  );
  await t.engine.refreshAttendance();
  today = '2026-11-14';
  await t.engine.loadAttendancePreset('today');
  assert.equal(t.engine.state.attendance?.today, '2026-11-14');
  assert.equal(t.engine.state.attendance?.timezone, 'America/Mexico_City');
  assert.deepEqual(t.calls.filter(call => call.type === 'attendance.list').at(-1)?.payload, {
    limit: 50,
    from: '2026-11-14',
    to: '2026-11-14',
  });
});
test('a delayed calendar query cannot replace a newer custom attendance range', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let release: (state: any) => void = () => {};
  const delayed = new Promise(resolve => {
    release = resolve;
  });
  const base = t.setHandler(async (type, payload) => (type === 'attendance.state' ? delayed : base(type, payload)));
  const selecting = t.engine.loadAttendancePreset('today');
  await t.engine.loadAttendance(false, {from: '2026-10-01', to: '2026-10-31'});
  release({lastEvent: null, nextType: 'ENTRY', timezone: 'America/Mexico_City', today: '2026-11-14'});
  await selecting;
  assert.deepEqual(t.engine.state.attendanceFilters, {from: '2026-10-01', to: '2026-10-31'});
});
test('active socket auth expiry prompts login, deletes token, preserves same-user pending UUID for resume', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const base = t.setHandler(async (type, payload) => {
    if (type === 'messages.send') throw new ProtocolError('UNAUTHENTICATED', 'sesión vencida');
    return base(type, payload);
  });
  await assert.rejects(t.engine.mutate('messages.send', {conversationId: 'r1', text: '2'}), /sesión vencida/);
  assert.equal(t.engine.state.needsLogin, true);
  assert.equal(t.engine.state.online, false);
  assert.equal(t.secure.values.size, 0);
  const [pending] = JSON.parse([...t.storage.values.entries()].find(([key]) => key.startsWith('outbox:'))![1]);
  t.setHandler(async (type, payload) => (type === 'messages.send' ? {message: message('2')} : base(type, payload)));
  await t.engine.login('123', '123456');
  const attempts = t.calls.filter(c => c.type === 'messages.send');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].id, pending.id);
  assert.equal(t.engine.state.pending, false);
  assert.equal(t.engine.state.needsLogin, false);
});
test('background refresh and older pages retain the selected attendance dates and matching cursor', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const base = t.setHandler(async (type, payload) =>
    type === 'attendance.list' ? {events: [], nextCursor: payload.before ? null : '77'} : base(type, payload),
  );
  await t.engine.loadAttendance(false, {from: '2026-10-01', to: '2026-10-31'});
  await t.engine.refresh();
  await t.engine.loadAttendance(true);
  const requests = t.calls
    .filter(call => call.type === 'attendance.list')
    .slice(-3)
    .map(call => call.payload);
  assert.deepEqual(requests, [
    {limit: 50, from: '2026-10-01', to: '2026-10-31'},
    {limit: 50, from: '2026-10-01', to: '2026-10-31'},
    {limit: 50, from: '2026-10-01', to: '2026-10-31', before: '77'},
  ]);
});
test('late attendance pages from a superseded date range cannot mix into the active history', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let release: (result: any) => void = () => {};
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const base = t.setHandler(async (type, payload) => {
    if (type === 'attendance.list' && payload.from === '2026-10-01') return pending;
    if (type === 'attendance.list')
      return {events: [{id: 'new', seq: '2', type: 'EXIT', recordedAt: '2026-11-12T00:00:00Z'}], nextCursor: '2'};
    return base(type, payload);
  });
  const old = t.engine.loadAttendance(false, {from: '2026-10-01', to: '2026-10-31'});
  await t.engine.loadAttendance(false, {from: '2026-11-01'});
  release({events: [{id: 'old', seq: '1', type: 'ENTRY', recordedAt: '2026-10-12T00:00:00Z'}], nextCursor: '1'});
  await old;
  assert.deepEqual(
    t.engine.state.events.map(e => e.id),
    ['new'],
  );
  assert.equal(t.engine.state.attendanceCursor, '2');
});
test('read auth failures also prompt login and clear the invalid secure token', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const base = t.setHandler(async (type, payload) =>
    type === 'users.list' ? Promise.reject(new ProtocolError('UNAUTHENTICATED', 'caducó')) : base(type, payload),
  );
  await assert.rejects(t.engine.query('users.list'), /caducó/);
  assert.equal(t.engine.state.needsLogin, true);
  assert.equal(t.engine.state.online, false);
  assert.equal(t.secure.values.size, 0);
});
test('a new connection can refresh membership independently of an old blocked recovery generation', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let release: () => void = () => {},
    entered: () => void = () => {};
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  let block = true,
    listCalls = 0;
  const base = t.setHandler(async (type, payload) => {
    if (type === 'conversations.list') {
      listCalls++;
      return {conversations: listCalls === 1 ? [room] : [room, {...room, id: 'r2'}], nextCursor: null};
    }
    if (type === 'messages.list' && block) {
      block = false;
      entered();
      await blocked;
      return {messages: [], nextCursor: null};
    }
    if (type === 'messages.list') return {messages: [], nextCursor: null};
    return base(type, payload);
  });
  const old = t.engine.refreshConversations();
  const oldRejected = assert.rejects(old, /cancelada/);
  await started;
  t.disconnect();
  const reconnect = t.engine.reconnect();
  // Let resume and both attendance reads finish before releasing the old socket.
  await new Promise(resolve => setTimeout(resolve, 0));
  release();
  await oldRejected;
  await reconnect;
  assert.deepEqual(
    t.engine.state.conversations.map(c => c.id),
    ['r1', 'r2'],
  );
});
test('logout clears local identity immediately but lets server revocation finish before closing its old socket', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let release: () => void = () => {};
  const acknowledgement = new Promise<void>(resolve => {
    release = resolve;
  });
  const base = t.setHandler(async (type, payload) => (type === 'auth.logout' ? acknowledgement : base(type, payload)));
  await t.engine.logout();
  assert.equal(t.engine.state.session, null);
  assert.equal(t.secure.values.size, 0);
  assert.equal(t.closes, 0);
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(t.closes, 1);
});
test('a lost acknowledgement reports which operation is pending until reconnection settles it', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const prior = t.setHandler(async (type, payload) => {
    if (type === 'attendance.mark') throw new Error('lost');
    return prior(type, payload);
  });
  await assert.rejects(t.engine.markAttendance());
  assert.equal(t.engine.state.pending, true);
  assert.equal(t.engine.state.pendingType, 'attendance.mark');
  t.setHandler(async (type, payload) =>
    type === 'attendance.mark'
      ? {event: {id: 'e1', seq: '1', type: 'ENTRY', recordedAt: '2026-11-12T00:00:00Z'}, nextType: 'EXIT'}
      : prior(type, payload),
  );
  await t.engine.reconnect();
  assert.equal(t.engine.state.pending, false);
  assert.equal(t.engine.state.pendingType, null);
});
test('failures expose a stable code for the interface and can be dismissed', async () => {
  const t = setup();
  await t.engine.initialize();
  const prior = t.setHandler(async (type, payload) => {
    if (type === 'auth.login') throw new ProtocolError('INVALID_CREDENTIALS', 'Credenciales inválidas');
    return prior(type, payload);
  });
  await assert.rejects(t.engine.login('123', '000000'));
  assert.equal(t.engine.state.errorCode, 'INVALID_CREDENTIALS');
  assert.equal(t.engine.state.session, null);
  t.engine.clearError();
  assert.equal(t.engine.state.error, '');
  assert.equal(t.engine.state.errorCode, '');
  t.setHandler(prior);
  await t.engine.login('123', '123456');
  t.disconnect();
  await assert.rejects(t.engine.query('ping'));
  t.engine.report(await t.engine.query('ping').catch(error => error));
  assert.equal(t.engine.state.errorCode, 'CONNECT_OFFLINE');
});
const sent = (id: string, text: string, seq: string, conversationId = 'r1') => ({
  message: {...message(seq), id, text, conversationId},
});
test('queued messages are sent one at a time in the order they were written', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let release = () => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let seq = 1;
  let inFlight = 0,
    maxInFlight = 0;
  const base = t.setHandler(async (type, payload) => {
    if (type !== 'messages.send') return base(type, payload);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (payload.text === 'uno') await gate;
    inFlight--;
    return sent('m' + payload.text, payload.text, String(++seq));
  });
  await t.engine.enqueueMessage({conversationId: 'r1', text: 'uno'});
  await t.engine.enqueueMessage({conversationId: 'r1', text: 'dos'});
  assert.equal(t.engine.state.pendingCount, 2);
  assert.deepEqual(
    t.engine.state.outbox.map(op => op.payload.text),
    ['uno', 'dos'],
  );
  release();
  await t.engine.drain();
  assert.deepEqual(
    t.calls.filter(c => c.type === 'messages.send').map(c => c.payload.text),
    ['uno', 'dos'],
  );
  assert.equal(maxInFlight, 1, 'never two sends at once');
  assert.equal(t.engine.state.pendingCount, 0);
  assert.deepEqual(
    t.engine.state.messages.r1.slice(-2).map(m => m.text),
    ['uno', 'dos'],
  );
});
test('UNAVAILABLE stops the queue without discarding anything; reconnecting resumes with the same UUIDs', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  let down = true;
  let seq = 1;
  const base = t.setHandler(async (type, payload) => {
    if (type !== 'messages.send') return base(type, payload);
    if (down) throw new ProtocolError('UNAVAILABLE', 'base caída');
    return sent('m' + payload.text, payload.text, String(++seq));
  });
  await t.engine.enqueueMessage({conversationId: 'r1', text: 'uno'});
  await t.engine.enqueueMessage({conversationId: 'r1', text: 'dos'});
  await t.engine.drain();
  assert.equal(t.engine.state.pendingCount, 2);
  const ids = t.engine.state.outbox.map(op => op.id);
  down = false;
  t.disconnect();
  await t.engine.reconnect();
  assert.equal(t.engine.state.pendingCount, 0);
  const attempts = t.calls.filter(c => c.type === 'messages.send');
  assert.deepEqual(
    attempts.slice(-2).map(c => c.id),
    ids,
    'same UUIDs, same order',
  );
});
test('a FORBIDDEN message is marked unsent and the queue continues with other conversations', async () => {
  const t = setup();
  await t.engine.initialize();
  const base = t.setHandler(async (type, payload) => {
    if (type === 'conversations.list')
      return {conversations: [room, {...room, id: 'r2', kind: 'GROUP', name: 'Grupo'}], nextCursor: null};
    if (type === 'messages.list') return {messages: [], nextCursor: null};
    if (type === 'messages.send' && payload.conversationId === 'r2')
      throw new ProtocolError('FORBIDDEN', 'ya no perteneces');
    if (type === 'messages.send') return sent('ok', 'general', '5');
    return base(type, payload);
  });
  await t.engine.login('123', '123456');
  await t.engine.enqueueMessage({conversationId: 'r2', text: 'al grupo'});
  await t.engine.enqueueMessage({conversationId: 'r1', text: 'general'});
  await t.engine.drain();
  assert.equal(t.engine.state.pendingCount, 0);
  assert.deepEqual(
    t.engine.state.failed.r2?.map(f => [f.text, f.code]),
    [['al grupo', 'FORBIDDEN']],
  );
  assert.equal(t.engine.state.messages.r1.at(-1)?.text, 'general');
  t.engine.dismissFailed('r2', t.engine.state.failed.r2![0].id);
  assert.equal(t.engine.state.failed.r2, undefined);
});
test('a restarted app resumes its queue in order with the original UUIDs', async () => {
  const t = setup();
  await t.engine.initialize();
  await t.engine.login('123', '123456');
  const base = t.setHandler(async (type, payload) =>
    type === 'messages.send' ? Promise.reject(new Error('lost')) : base(type, payload),
  );
  await t.engine.enqueueMessage({conversationId: 'r1', text: 'uno'});
  await t.engine.enqueueMessage({conversationId: 'r1', text: 'dos'});
  await t.engine.drain();
  const ids = t.engine.state.outbox.map(op => op.id);
  assert.equal(ids.length, 2);
  // A second engine over the same storage simulates restarting the app.
  const calls: {type: string; id: string; payload: any}[] = [];
  let seq = 1;
  const restarted = new Engine({
    storage: t.storage,
    secure: t.secure,
    uuid: () => 'new-' + Math.random(),
    sha256,
    installationCa: INSTALLATION_CA,
    connect: async () => ({
      closed: false,
      close() {},
      request: async (type: string, payload: any, id: string) => {
        calls.push({type, id, payload});
        if (type === 'messages.send') return sent('m' + payload.text, payload.text, String(++seq));
        return base(type, payload);
      },
    }),
  });
  await restarted.initialize();
  assert.deepEqual(
    calls.filter(c => c.type === 'messages.send').map(c => c.id),
    ids,
  );
  assert.equal(restarted.state.pendingCount, 0);
});

const redes = {id: 'c1', kind: 'GROUP', name: 'Redes', ownerId: 't1', lastSeq: '0', isClass: true, isOwner: false};
test('selecting a class sends its classId and ignores attendance events of other classes', async () => {
  const t = setup();
  await t.engine.initialize();
  const base = t.setHandler(async (type, payload) => {
    if (type === 'classes.list') return {classes: [redes]};
    if (type === 'attendance.state') return {lastEvent: null, nextType: 'ENTRY', classId: payload.classId ?? null};
    if (type === 'attendance.mark')
      return {
        event: {id: 'e1', seq: '9', type: 'ENTRY', recordedAt: '2026-11-18T15:00:00Z', classId: payload.classId},
        nextType: 'EXIT',
        classId: payload.classId,
      };
    return base(type, payload);
  });
  await t.engine.login('123', '123456');
  assert.deepEqual(
    t.engine.state.classes.map(c => c.id),
    ['c1'],
  );
  await t.engine.selectAttendanceClass('c1');
  assert.equal(t.engine.state.attendanceClassId, 'c1');
  assert.equal(t.calls.filter(c => c.type === 'attendance.state').at(-1)?.payload.classId, 'c1');
  assert.equal(t.calls.filter(c => c.type === 'attendance.list').at(-1)?.payload.classId, 'c1');
  await t.engine.markAttendance();
  assert.equal(t.calls.find(c => c.type === 'attendance.mark')?.payload.classId, 'c1');
  const state = t.engine.state.attendance;
  t.event({
    v: 1,
    kind: 'event',
    id: 'x',
    type: 'attendance.changed',
    payload: {
      lastEvent: {id: 'door', seq: '99', type: 'ENTRY', recordedAt: '2026-11-18T16:00:00Z'},
      nextType: 'EXIT',
      classId: null,
    },
  });
  assert.equal(t.engine.state.attendance, state, 'a general-door event does not touch the class view');
});
test('servers without classes simply show the general door', async () => {
  const t = setup();
  await t.engine.initialize();
  const base = t.setHandler(async (type, payload) => {
    if (type === 'classes.list') throw new ProtocolError('VALIDATION', 'Operación desconocida');
    return base(type, payload);
  });
  await t.engine.login('123', '123456');
  assert.deepEqual(t.engine.state.classes, []);
  assert.equal(t.engine.state.attendanceClassId, null);
  assert.equal(t.engine.state.attendance?.nextType, 'ENTRY');
});
test('being removed from the selected class returns to the general door', async () => {
  const t = setup();
  await t.engine.initialize();
  let member = true;
  const base = t.setHandler(async (type, payload) =>
    type === 'classes.list' ? {classes: member ? [redes] : []} : base(type, payload),
  );
  await t.engine.login('123', '123456');
  await t.engine.selectAttendanceClass('c1');
  member = false;
  await t.engine.refreshClasses();
  assert.equal(t.engine.state.attendanceClassId, null);
  assert.deepEqual(t.engine.state.events, []);
});
