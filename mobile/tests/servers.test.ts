import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Engine, type ConnectTarget} from '../src/engine.ts';
import {ProtocolError} from '../src/state.ts';
import {ConnectError} from '../src/errors.ts';
import {derToPem} from '../src/enrollment.ts';

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
const sha256 = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const ca = new Uint8Array(readFileSync(`${import.meta.dirname}/fixtures/ca.der`));
const notACa = new Uint8Array(readFileSync(`${import.meta.dirname}/fixtures/plain.der`));
const caFingerprint = createHash('sha256').update(ca).digest('hex');
const link = (id: string, name: string, addresses: string[], der = ca) =>
  `wasap://server?v=1&id=${id}&name=${encodeURIComponent(name)}${addresses.map(a => `&a=${encodeURIComponent(a)}`).join('')}&ca=${Buffer.from(der).toString('base64url')}`;

type Host = {serverId?: string; down?: boolean; tls?: boolean; noHello?: boolean; fingerprint?: string};
/** A fake network: each address answers as one server; sessions are per server id. */
function setup(
  network: Record<string, Host>,
  installationCa: string | null = null,
  storage = new Memory(),
  secure = new Memory(),
) {
  const log: {address: string; type: string; payload: any; id: string}[] = [];
  const attempts: string[] = [];
  let handler = async (host: Host, type: string, payload: any): Promise<any> => {
    if (type === 'server.hello') {
      if (host.noHello) throw new ProtocolError('VALIDATION', 'Operación desconocida');
      return {
        serverId: host.serverId,
        name: 'Servidor ' + host.serverId,
        caFingerprint: host.fingerprint ?? caFingerprint,
      };
    }
    if (type === 'auth.login' || type === 'auth.resume' || type === 'invites.redeem')
      return {
        token: 'tok-' + host.serverId,
        expiresAt: '2027-01-01T00:00:00Z',
        user: {id: 'u-' + host.serverId, matricula: '123', name: 'Ana'},
      };
    if (type === 'attendance.state') return {lastEvent: null, nextType: 'ENTRY'};
    if (type === 'attendance.list') return {events: [], nextCursor: null};
    if (type === 'conversations.list')
      return {
        conversations: [{id: 'room-' + host.serverId, kind: 'GENERAL', name: 'General', ownerId: null, lastSeq: '0'}],
      };
    if (type === 'messages.list') return {messages: [], nextCursor: null};
    if (type === 'classes.list') return {classes: []};
    return {};
  };
  let id = 0;
  const engine = new Engine({
    storage,
    secure,
    uuid: () => 'id-' + ++id,
    sha256,
    installationCa,
    connect: async (target: ConnectTarget) => {
      const address = target.host.includes(':') ? `[${target.host}]:${target.port}` : `${target.host}:${target.port}`;
      attempts.push(address);
      const host = network[address];
      if (!host || host.down) throw new ConnectError('unreachable', 'No se pudo llegar', 'timeout');
      if (host.tls) throw new ConnectError('tls', 'Certificado inválido', 'trust anchor');
      return {
        closed: false,
        request: async (type: string, payload: any, rid: string) => {
          log.push({address, type, payload, id: rid});
          return handler(host, type, payload);
        },
        close() {},
      };
    },
  });
  return {
    engine,
    storage,
    secure,
    log,
    attempts,
    setHandler(fn: typeof handler) {
      const prior = handler;
      handler = fn;
      return prior;
    },
  };
}
async function enroll(engine: Engine, text: string, replace = false) {
  const preview = await engine.previewServer(text);
  assert.ok(preview.ok, (preview as {reason?: string}).reason);
  await engine.enrollServer(preview, replace);
  return preview;
}

test('A → B → A keeps each session without asking for the PIN again, and never mixes data', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A'}, '10.0.0.2:5050': {serverId: 'B'}});
  await t.engine.initialize();
  assert.deepEqual(t.engine.state.servers, []);
  await enroll(t.engine, link('A', 'Profe A', ['10.0.0.1:5050']));
  await t.engine.login('123', '123456');
  await enroll(t.engine, link('B', 'Profe B', ['10.0.0.2:5050']));
  assert.equal(t.engine.state.activeServerId, 'B');
  const view = () => t.engine.state;
  assert.equal(view().session, null, 'B has no session yet');
  assert.equal(view().conversations.length, 0);
  await t.engine.login('123', '123456');
  assert.deepEqual(
    view().conversations.map(c => c.id),
    ['room-B'],
  );
  const logins = t.log.filter(c => c.type === 'auth.login').length;
  await t.engine.selectServer('A');
  assert.equal(view().session?.token, 'tok-A');
  assert.equal(view().online, true);
  assert.deepEqual(
    view().conversations.map(c => c.id),
    ['room-A'],
  );
  await t.engine.selectServer('B');
  await t.engine.selectServer('A');
  assert.equal(t.log.filter(c => c.type === 'auth.login').length, logins, 'switching never logs in again');
  assert.deepEqual(new Set(t.engine.state.signedIn), new Set(['A', 'B']));
  // Credentials only ever went to the server they belong to.
  assert.ok(
    t.log
      .filter(c => c.type === 'auth.resume')
      .every(c => c.payload.token === 'tok-' + (c.address === '10.0.0.1:5050' ? 'A' : 'B')),
  );
});

test('removing a server deletes its session and queue; the others stay', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A'}, '10.0.0.2:5050': {serverId: 'B'}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050']));
  await t.engine.login('123', '123456');
  const prior = t.setHandler(async (host, type, payload) => {
    if (type === 'messages.send') throw new Error('lost');
    return prior(host, type, payload);
  });
  await t.engine.enqueueMessage({conversationId: 'room-A', text: 'en cola'}).catch(() => {});
  await t.engine.drain().catch(() => {});
  assert.ok([...t.storage.values.keys()].some(k => k.startsWith('outbox:') && k.includes('"A"')));
  await enroll(t.engine, link('B', 'B', ['10.0.0.2:5050']));
  await t.engine.login('123', '123456');
  await t.engine.removeServer('A');
  assert.deepEqual(
    t.engine.state.servers.map(s => s.id),
    ['B'],
  );
  assert.equal(t.secure.values.has('wasap.session.A'), false);
  assert.equal(t.secure.values.has('wasap.session.B'), true);
  assert.equal(
    [...t.storage.values.keys()].some(k => k.startsWith('outbox:') && k.includes('"A"')),
    false,
  );
  assert.equal(t.engine.state.session?.token, 'tok-B', 'the active server is untouched');
  await t.engine.removeServer('B');
  assert.equal(t.engine.state.activeServerId, null);
  assert.equal(t.engine.state.session, null);
});

test('another server at the saved address gets no credentials', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'IMPOSTOR'}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050']));
  await assert.rejects(t.engine.login('123', '123456'));
  assert.equal(t.engine.state.errorCode, 'CONNECT_IDENTITY');
  assert.equal(
    t.log.some(c => c.type.startsWith('auth.')),
    false,
  );
});

test('a different CA fingerprint in server.hello is also another server', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A', fingerprint: 'f'.repeat(64)}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050']));
  await assert.rejects(t.engine.login('123', '123456'));
  assert.equal(t.engine.state.errorCode, 'CONNECT_IDENTITY');
  assert.equal(
    t.log.some(c => c.type.startsWith('auth.')),
    false,
  );
});

test('a QR server that cannot say who it is is rejected', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A', noHello: true}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050']));
  await assert.rejects(t.engine.login('123', '123456'));
  assert.equal(
    t.log.some(c => c.type.startsWith('auth.')),
    false,
  );
});

test('a dead first address falls through to the next, which is then tried first', async () => {
  const network: Record<string, Host> = {
    '10.0.0.1:5050': {serverId: 'A', down: true},
    '192.168.1.9:5050': {serverId: 'A'},
  };
  const t = setup(network);
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050', '192.168.1.9:5050']));
  await t.engine.login('123', '123456');
  assert.deepEqual(t.attempts, ['10.0.0.1:5050', '192.168.1.9:5050']);
  assert.equal(t.engine.state.servers[0].lastAddress, '192.168.1.9:5050');
  assert.deepEqual(t.engine.state.server, {host: '192.168.1.9', port: 5050});
  t.attempts.length = 0;
  await t.engine.reconnect();
  assert.deepEqual(t.attempts, ['192.168.1.9:5050'], 'the last good address goes first');
  // Back on the first network: the remembered one fails, the first one answers.
  network['192.168.1.9:5050'].down = true;
  network['10.0.0.1:5050'].down = false;
  t.attempts.length = 0;
  await t.engine.reconnect();
  assert.deepEqual(t.attempts, ['192.168.1.9:5050', '10.0.0.1:5050']);
  assert.equal(t.engine.state.servers[0].lastAddress, '10.0.0.1:5050');
});

test('a certificate error stops the address list', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A', tls: true}, '10.0.0.2:5050': {serverId: 'A'}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050', '10.0.0.2:5050']));
  await assert.rejects(t.engine.login('123', '123456'));
  assert.deepEqual(t.attempts, ['10.0.0.1:5050']);
  assert.equal(t.engine.state.errorCode, 'CONNECT_TLS');
});

test('scanning a known server again updates it; a changed CA needs confirmation and drops the old session', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A'}, '10.0.0.3:5050': {serverId: 'A'}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050']));
  await t.engine.login('123', '123456');
  const known = await t.engine.previewServer(link('A', 'Aula A', ['10.0.0.3:5050', '10.0.0.1:5050']));
  assert.ok(known.ok && known.status === 'known');
  await t.engine.enrollServer(known);
  assert.equal(t.engine.state.servers[0].name, 'Aula A');
  assert.deepEqual(t.engine.state.servers[0].addresses, ['10.0.0.3:5050', '10.0.0.1:5050']);
  assert.equal(t.engine.state.session?.token, 'tok-A', 'same identity, same session');
  const changed = await t.engine.previewServer(link('A', 'A', ['10.0.0.1:5050'], notACa));
  assert.equal(changed.ok, false, 'non-CA anchors are refused before anything else');
  const swapped = await t.engine.previewServer(link('A', 'A', ['10.0.0.1:5050']));
  assert.ok(swapped.ok);
  const fake = {...swapped, fingerprint: 'e'.repeat(64), status: 'ca-changed' as const};
  await assert.rejects(t.engine.enrollServer(fake));
  assert.equal(t.engine.state.servers[0].fingerprint, caFingerprint, 'not replaced without confirmation');
  await t.engine.enrollServer(fake, true);
  assert.equal(t.engine.state.servers[0].fingerprint, 'e'.repeat(64));
  assert.equal(t.secure.values.has('wasap.session.A'), false, 'old identity, old session gone');
});

test('the CA-changed status is detected from the fingerprint', async () => {
  const t = setup({});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'A', ['10.0.0.1:5050']));
  const servers = t.engine.state.servers.map(s => ({...s, fingerprint: '0'.repeat(64)}));
  await t.storage.setItem('servers', JSON.stringify(servers));
  const again = setup({}, null, t.storage, t.secure);
  await again.engine.initialize();
  const preview = await again.engine.previewServer(link('A', 'A', ['10.0.0.1:5050']));
  assert.ok(preview.ok);
  assert.equal(preview.status, 'ca-changed');
});

test('at most ten servers', async () => {
  const t = setup({});
  await t.engine.initialize();
  for (let i = 0; i < 10; i++) await enroll(t.engine, link('S' + i, 'S' + i, [`10.0.1.${i}:5050`])).catch(() => {});
  assert.equal(t.engine.state.servers.length, 10);
  const eleventh = await t.engine.previewServer(link('S10', 'S10', ['10.0.1.10:5050']));
  assert.equal(eleventh.ok, false);
  assert.ok((await t.engine.previewServer(link('S3', 'S3', ['10.0.1.3:5050']))).ok, 'known ones still update');
});

test('v1 installs migrate to an installation server, keep their session and settle the queued request', async () => {
  const storage = new Memory(),
    secure = new Memory();
  const scope = JSON.stringify(['10.0.0.5', 5050]);
  const session = {
    token: 'tok-REAL',
    expiresAt: '2027-01-01T00:00:00Z',
    user: {id: 'u-REAL', matricula: '123', name: 'Ana'},
  };
  await storage.setItem('server', JSON.stringify({host: '10.0.0.5', port: 5050}));
  await secure.setItem('wasap.session', JSON.stringify({server: scope, session}));
  const queued = {id: 'op-legacy', type: 'attendance.mark', payload: {expectedLastEventId: null}};
  await storage.setItem('outbox:' + JSON.stringify(['10.0.0.5', 5050, 'u-REAL']), JSON.stringify([queued]));
  const t = setup({'10.0.0.5:5050': {serverId: 'REAL'}}, derToPem(ca), storage, secure);
  await t.engine.initialize();
  assert.equal(
    t.log.some(c => c.type === 'auth.login'),
    false,
    'no PIN needed',
  );
  assert.ok(t.log.some(c => c.type === 'auth.resume' && c.payload.token === 'tok-REAL'));
  assert.deepEqual(
    t.engine.state.servers.map(s => [s.id, s.name, s.manual]),
    [['REAL', 'Servidor REAL', true]],
  );
  assert.equal(t.engine.state.activeServerId, 'REAL');
  assert.equal(secure.values.has('wasap.session'), false);
  assert.equal(secure.values.has('wasap.session.installation'), false);
  assert.ok(secure.values.has('wasap.session.REAL'));
  const settled = t.log.find(c => c.type === 'attendance.mark');
  assert.equal(settled?.id, 'op-legacy', 'same UUID, same scope');
  assert.equal(t.engine.state.pending, false);
});

test('the installation server is edited by hand; QR servers are not', async () => {
  const t = setup({'10.0.0.5:5050': {serverId: 'REAL', noHello: true}}, derToPem(ca));
  await t.engine.initialize();
  await assert.rejects(t.engine.configure({host: '10.0.0.5', port: 70000}), /puerto/);
  await t.engine.configure({host: '10.0.0.5', port: 5050});
  await t.engine.login('123', '123456');
  assert.equal(t.engine.state.activeServerId, 'installation', 'a v1 server without hello keeps working');
  const none = setup({});
  await none.engine.initialize();
  await assert.rejects(none.engine.configure({host: '10.0.0.5', port: 5050}), /código QR/);
  await assert.rejects(none.engine.login('123', '123456'));
  assert.equal(none.engine.state.errorCode, 'CONNECT_CONFIG');
});

test('an invitation QR adds the server and redeeming it signs in with the chosen PIN', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A'}});
  await t.engine.initialize();
  const invite =
    link('A', 'Aula', ['10.0.0.1:5050']).replace('wasap://server?', 'wasap://invite?') +
    '&code=ABCDEFGHJKLMNPQRSTUVWXYZ23';
  const preview = await t.engine.previewServer(invite);
  assert.ok(preview.ok);
  assert.equal(preview.kind, 'invite');
  assert.equal(preview.code, 'ABCDEFGHJKLMNPQRSTUVWXYZ23');
  await t.engine.enrollServer(preview);
  await t.engine.redeemInvitation(preview.code!, '482915');
  const types = t.log.map(c => c.type);
  assert.ok(types.indexOf('server.hello') < types.indexOf('invites.redeem'), 'identity first');
  assert.deepEqual(t.log.find(c => c.type === 'invites.redeem')?.payload, {
    code: 'ABCDEFGHJKLMNPQRSTUVWXYZ23',
    pin: '482915',
  });
  assert.equal(t.engine.state.session?.token, 'tok-A');
  assert.equal(t.engine.state.online, true);
  assert.ok(t.secure.values.has('wasap.session.A'));
});

test('a rejected invitation surfaces INVITATION_INVALID and leaves no session', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A'}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'Aula', ['10.0.0.1:5050']));
  const prior = t.setHandler(async (host, type, payload) => {
    if (type === 'invites.redeem')
      throw new ProtocolError('INVITATION_INVALID', 'La invitación no es válida o ya se usó');
    return prior(host, type, payload);
  });
  await assert.rejects(t.engine.redeemInvitation('ABCDEFGHJKLMNPQRSTUVWXYZ23', '482915'));
  assert.equal(t.engine.state.errorCode, 'INVITATION_INVALID');
  assert.equal(t.engine.state.session, null);
});

test('a sign-up request leaves no session or open socket, and login then reports PENDING_APPROVAL', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A'}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'Aula', ['10.0.0.1:5050']));
  let pending = true;
  const prior = t.setHandler(async (host, type, payload) => {
    if (type === 'signup.request') return {status: 'pending'};
    if (type === 'auth.login' && pending) throw new ProtocolError('PENDING_APPROVAL', 'Pendiente');
    return prior(host, type, payload);
  });
  await t.engine.requestSignup(' k7px2m9q ', ' s001 ', ' Sofía ', '246810');
  assert.deepEqual(t.log.find(c => c.type === 'signup.request')?.payload, {
    classCode: 'K7PX2M9Q',
    matricula: 's001',
    name: 'Sofía',
    pin: '246810',
  });
  assert.equal(t.engine.state.session, null);
  assert.equal(t.secure.values.has('wasap.session.A'), false);
  await assert.rejects(t.engine.login('S001', '246810'));
  assert.equal(t.engine.state.errorCode, 'PENDING_APPROVAL');
  pending = false;
  await t.engine.login('S001', '246810');
  const after = (): typeof t.engine.state => t.engine.state;
  assert.equal(after().session?.token, 'tok-A');
});

test('signup.changed bumps a counter so open teacher screens reload', async () => {
  const t = setup({'10.0.0.1:5050': {serverId: 'A'}});
  await t.engine.initialize();
  await enroll(t.engine, link('A', 'Aula', ['10.0.0.1:5050']));
  await t.engine.login('123', '123456');
  const before = t.engine.state.signupVersion;
  // The fake network has no event channel; call the engine's event hook directly.
  (t.engine as any).onEvent({v: 1, kind: 'event', id: 'x', type: 'signup.changed', payload: {classId: 'c1'}});
  assert.equal(t.engine.state.signupVersion, before + 1);
});
