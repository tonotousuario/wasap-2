import type {Envelope} from './protocol.ts';
import {Outbox, ProtocolError, isTerminal, mergeMessages, compareSeq, type Storage} from './state.ts';
import type {
  Server,
  Session,
  Message,
  AttendanceState,
  AttendanceEvent,
  Conversation,
  Operation,
  FailedMessage,
  ClassInfo,
  ReportEvent,
} from './types.ts';
import {ConnectError, errorCode, errorDetail} from './errors.ts';
import {presetRange, type RangePreset} from './format.ts';
import {joinAddress, parseServerLink, pemToDer, splitAddress, type LinkKind, type ServerLink} from './enrollment.ts';

export const MAX_SERVERS = 10;
const INSTALLATION = 'installation';
/** SecureStore keys allow only letters, digits, «.», «-» and «_». */
const sessionKey = (serverId: string) => 'wasap.session.' + serverId.replace(/[^A-Za-z0-9._-]/g, '_');

/** A server the app knows, with its own trust anchor and session. */
export type SavedServer = {
  id: string;
  name: string;
  /** host:port, in preference order. */
  addresses: string[];
  /** Last address that answered; tried first. */
  lastAddress: string | null;
  caPem: string | null;
  /** SHA-256 of the CA (lowercase hex), compared with server.hello. */
  fingerprint: string | null;
  /** Prefix of the outbox/cache keys; kept when the installation server learns its real id. */
  scope: string;
  /** The build-time installation server, editable by hand. */
  manual?: boolean;
  addedAt: string;
};
/** What a scanned or pasted link would do, before the user confirms. */
export type ServerPreview =
  | {ok: false; reason: string}
  | {
      ok: true;
      link: ServerLink;
      fingerprint: string;
      status: 'new' | 'known' | 'ca-changed';
      /** What the QR is for besides adding the server. */
      kind: LinkKind;
      code?: string;
      className?: string;
    };
/** A pending self sign-up as the class owner sees it. */
export type SignupRequest = {matricula: string; name: string; classId: string; className: string; createdAt: string};
export type ConnectTarget = Server & {caPem: string};
export type Connection = {
  closed: boolean;
  request(type: string, payload: Record<string, unknown>, id: string): Promise<any>;
  close(error?: Error): void;
};
export type Dependencies = {
  storage: Storage;
  secure: Storage;
  uuid: () => string;
  connect: (target: ConnectTarget, event: (e: Envelope) => void, close: (e: Error) => void) => Promise<Connection>;
  /** SHA-256 as lowercase hex. */
  sha256: (bytes: Uint8Array) => Promise<string>;
  /** CA PEM embedded at build time; defines the hand-configurable installation server. */
  installationCa?: string | null;
  now?: () => string;
};
export type AttendanceFilters = {from?: string; to?: string};
export type AppState = {
  /** Address of the active server being used (or about to be). */
  server: Server;
  servers: SavedServer[];
  activeServerId: string | null;
  /** Servers with a stored session. */
  signedIn: string[];
  session: Session | null;
  online: boolean;
  busy: boolean;
  pending: boolean;
  pendingCount: number;
  outbox: Operation[];
  failed: Record<string, FailedMessage[]>;
  needsLogin: boolean;
  error: string;
  errorCode: string;
  pendingType: string | null;
  attendance: AttendanceState | null;
  events: AttendanceEvent[];
  attendanceCursor: string | null;
  attendanceFilters: AttendanceFilters;
  /** Classes the user belongs to; empty on servers without classes. */
  classes: ClassInfo[];
  /** Class whose attendance is shown and marked; null = the general door. */
  attendanceClassId: string | null;
  /** Bumped by signup.changed so open teacher screens reload their pending list. */
  signupVersion: number;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  older: Record<string, string | null>;
};
export class Engine {
  state: AppState = {
    server: {host: '192.168.1.2', port: 5050},
    servers: [],
    activeServerId: null,
    signedIn: [],
    session: null,
    online: false,
    busy: false,
    pending: false,
    pendingCount: 0,
    outbox: [],
    failed: {},
    needsLogin: false,
    error: '',
    errorCode: '',
    pendingType: null,
    attendance: null,
    events: [],
    attendanceCursor: null,
    attendanceFilters: {},
    classes: [],
    attendanceClassId: null,
    signupVersion: 0,
    conversations: [],
    messages: {},
    older: {},
  };
  private deps: Dependencies;
  private connection: Connection | null = null;
  private journal: Outbox | null = null;
  private draining: Promise<void> | null = null;
  private waiters = new Map<string, {resolve: (value: any) => void; reject: (error: unknown) => void}>();
  private listeners = new Set<() => void>();
  private recovered: Record<string, string> = {};
  private generation = 0;
  private operation: Promise<any> | null = null;
  private conversationRefresh: Promise<void> | null = null;
  private conversationRefreshGeneration = -1;
  private conversationDirty = false;
  private attendanceHistoryGeneration = 0;
  constructor(deps: Dependencies) {
    this.deps = deps;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<AppState>) {
    this.state = {...this.state, ...patch};
    this.listeners.forEach(fn => fn());
  }
  // Estado del diario para la interfaz: si hay algo sin confirmar y de qué tipo.
  private async pendingPatch() {
    const ops = (await this.journal?.load()) ?? [];
    return {pending: ops.length > 0, pendingCount: ops.length, pendingType: ops[0]?.type ?? null, outbox: ops};
  }
  activeServer(): SavedServer | null {
    return this.state.servers.find(server => server.id === this.state.activeServerId) ?? null;
  }
  private userScope(session: Session, server = this.activeServer()) {
    return JSON.stringify([...JSON.parse(server?.scope ?? '[]'), session.user.id]);
  }
  private now() {
    return this.deps.now?.() ?? new Date().toISOString();
  }
  private addressOf(server: SavedServer | null): Server {
    const parts = server && splitAddress(server.lastAddress ?? server.addresses[0] ?? '');
    return parts ?? this.state.server;
  }
  private async saveServers(servers: SavedServer[], activeServerId = this.state.activeServerId) {
    await this.deps.storage.setItem('servers', JSON.stringify(servers));
    if (activeServerId) await this.deps.storage.setItem('servers.active', activeServerId);
    else await this.deps.storage.removeItem('servers.active');
    const active = servers.find(server => server.id === activeServerId) ?? null;
    this.update({servers, activeServerId: active?.id ?? null, server: this.addressOf(active)});
  }
  private async markSignedIn(serverId: string, signedIn: boolean) {
    const others = this.state.signedIn.filter(id => id !== serverId);
    this.update({signedIn: signedIn ? [...others, serverId] : others});
  }
  private async storeSession(session: Session | null, serverId = this.state.activeServerId) {
    if (!serverId) return;
    if (session) await this.deps.secure.setItem(sessionKey(serverId), JSON.stringify(session));
    else await this.deps.secure.removeItem(sessionKey(serverId));
    await this.markSignedIn(serverId, !!session);
  }
  /** Loads the server list, migrating the single v1 server (and its session) on first run. */
  private async loadServers() {
    const raw = await this.deps.storage.getItem('servers');
    let servers: SavedServer[] = raw ? JSON.parse(raw) : [];
    let active = await this.deps.storage.getItem('servers.active');
    const ca = this.deps.installationCa;
    if (!raw && ca) {
      const legacy = JSON.parse((await this.deps.storage.getItem('server')) ?? 'null') ?? this.state.server;
      const host = String(legacy.host).toLowerCase();
      const scope = JSON.stringify([host, legacy.port]);
      servers = [
        {
          id: INSTALLATION,
          name: 'Servidor de instalación',
          addresses: [joinAddress(host, legacy.port)],
          lastAddress: null,
          caPem: ca,
          fingerprint: null,
          scope,
          manual: true,
          addedAt: this.now(),
        },
      ];
      active = INSTALLATION;
      const saved = await this.deps.secure.getItem('wasap.session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.server === scope)
          await this.deps.secure.setItem(sessionKey(INSTALLATION), JSON.stringify(parsed.session));
        await this.deps.secure.removeItem('wasap.session');
      }
      await this.deps.storage.removeItem('server');
    }
    for (const server of servers)
      if (server.caPem && !server.fingerprint) server.fingerprint = await this.deps.sha256(pemToDer(server.caPem));
    const signedIn: string[] = [];
    for (const server of servers) if (await this.deps.secure.getItem(sessionKey(server.id))) signedIn.push(server.id);
    this.update({signedIn});
    await this.saveServers(servers, servers.some(server => server.id === active) ? active : (servers[0]?.id ?? null));
  }
  /** Restores the active server's stored session, if any, and reconnects. */
  private async resumeStored() {
    const server = this.activeServer();
    if (!server) return;
    const saved = await this.deps.secure.getItem(sessionKey(server.id));
    if (!saved) return;
    const session: Session = JSON.parse(saved);
    this.journal = new Outbox(this.deps.storage, this.userScope(session, server));
    this.update({session, ...(await this.pendingPatch())});
    try {
      await this.reconnect();
    } catch (error) {
      this.report(error);
    }
  }
  async initialize() {
    await this.loadServers();
    await this.resumeStored();
  }
  report(error: unknown) {
    this.update({error: errorDetail(error), errorCode: errorCode(error)});
  }
  clearError() {
    if (this.state.error || this.state.errorCode) this.update({error: '', errorCode: ''});
  }
  /**
   * Connects to the active server trying its addresses (last good one first). Network failures
   * move on to the next address; certificate and identity failures stop, since another address
   * cannot fix them. No credentials are sent before server.hello matches the saved server.
   */
  private async open() {
    this.connection?.close();
    const generation = ++this.generation;
    const server = this.activeServer();
    if (!server) throw new ConnectError('config', 'Añade un servidor escaneando su código QR.');
    if (!server.caPem) throw new ConnectError('config', 'Escanea el código QR del servidor antes de conectar.');
    const order = [
      ...new Set(
        [server.lastAddress, ...server.addresses].filter((a): a is string => !!a && server.addresses.includes(a)),
      ),
    ];
    let failure: unknown = new ConnectError('unreachable', 'El servidor no tiene direcciones.');
    for (const address of order) {
      const target = splitAddress(address);
      if (!target) continue;
      this.update({server: target});
      let connection: Connection;
      try {
        connection = await this.deps.connect(
          {...target, caPem: server.caPem},
          event => {
            if (generation === this.generation) this.onEvent(event);
          },
          error => {
            if (generation === this.generation)
              this.update({online: false, error: errorDetail(error), errorCode: errorCode(error)});
          },
        );
      } catch (error) {
        if (generation !== this.generation) throw new Error('Conexión cancelada');
        if (error instanceof ConnectError && (error.kind === 'tls' || error.kind === 'config')) throw error;
        failure = error;
        continue;
      }
      if (generation !== this.generation) {
        connection.close();
        throw new Error('Conexión cancelada');
      }
      try {
        await this.verifyIdentity(connection, server);
      } catch (error) {
        connection.close();
        throw error;
      }
      if (generation !== this.generation) {
        connection.close();
        throw new Error('Conexión cancelada');
      }
      this.connection = connection;
      const current = this.activeServer();
      if (current && current.lastAddress !== address)
        await this.saveServers(this.state.servers.map(s => (s.id === current.id ? {...s, lastAddress: address} : s)));
      return;
    }
    throw failure;
  }
  private async verifyIdentity(connection: Connection, server: SavedServer) {
    let hello: {serverId?: string; name?: string; caFingerprint?: string | null};
    try {
      hello = await connection.request('server.hello', {}, this.deps.uuid());
    } catch (error) {
      // v1 servers do not know server.hello; only the hand-configured server may be one.
      if (server.manual && error instanceof ProtocolError && error.code === 'VALIDATION') return;
      throw error;
    }
    const otherServer = () =>
      new ConnectError(
        'identity',
        'En esa dirección responde otro servidor Wasap. Escanea de nuevo el código QR de tu servidor.',
        `esperado ${server.id}, recibido ${hello.serverId ?? 'sin identificador'}`,
      );
    if (hello.caFingerprint && server.fingerprint && hello.caFingerprint !== server.fingerprint) throw otherServer();
    if (server.id === INSTALLATION) {
      if (hello.serverId) await this.adoptServerId(hello.serverId, hello.name);
    } else if (hello.serverId !== server.id) throw otherServer();
  }
  /** The installation server learned its real id: rename it, keeping its session and scope. */
  private async adoptServerId(serverId: string, name?: string) {
    const duplicate = this.state.servers.find(s => s.id === serverId);
    if (duplicate) await this.storeSession(null, duplicate.id);
    const saved = await this.deps.secure.getItem(sessionKey(INSTALLATION));
    if (saved) await this.deps.secure.setItem(sessionKey(serverId), saved);
    await this.storeSession(null, INSTALLATION);
    if (saved) await this.markSignedIn(serverId, true);
    const servers = this.state.servers
      .filter(s => s.id !== serverId)
      .map(s => (s.id === INSTALLATION ? {...s, id: serverId, name: name || s.name} : s));
    await this.saveServers(servers, this.state.activeServerId === INSTALLATION ? serverId : this.state.activeServerId);
  }
  private async activate(session: Session) {
    if (this.state.session && this.state.session.user.id !== session.user.id) {
      await this.journal?.discard();
      this.recovered = {};
      this.update({
        messages: {},
        conversations: [],
        events: [],
        attendance: null,
        older: {},
        failed: {},
        classes: [],
        attendanceClassId: null,
      });
    }
    this.journal = new Outbox(this.deps.storage, this.userScope(session));
    await this.storeSession(session);
    this.update({session, needsLogin: false, online: true, error: '', errorCode: '', ...(await this.pendingPatch())});
    await this.reconcile();
    await this.refresh();
  }
  async login(matricula: string, pin: string) {
    if (this.state.busy) throw new Error('Espera a que termine la operación actual');
    this.update({busy: true, error: '', errorCode: ''});
    try {
      await this.open();
      const session = await this.connection!.request(
        'auth.login',
        {matricula: matricula.trim(), pin},
        this.deps.uuid(),
      );
      await this.activate(session);
    } catch (error) {
      this.report(error);
      throw error;
    } finally {
      this.update({busy: false});
    }
  }
  async reconnect() {
    if (this.state.busy) return;
    const session = this.state.session;
    if (!session) return;
    this.update({busy: true, error: '', errorCode: ''});
    try {
      await this.open();
      const resumed = await this.connection!.request('auth.resume', {token: session.token}, this.deps.uuid());
      await this.activate(resumed);
    } catch (error) {
      if (error instanceof ProtocolError && ['UNAUTHENTICATED', 'INVALID_CREDENTIALS'].includes(error.code)) {
        await this.storeSession(null);
        this.update({needsLogin: true, online: false});
      }
      this.report(error);
      throw error;
    } finally {
      this.update({busy: false});
    }
  }
  async query(type: string, payload: Record<string, unknown> = {}): Promise<any> {
    if (!this.state.online || !this.connection || this.connection.closed)
      throw new ConnectError('offline', 'Sin conexión. Revisa Wi-Fi, IP y permiso de red local.');
    const generation = this.generation;
    const result = await this.call(type, payload, this.deps.uuid());
    if (generation !== this.generation) throw new Error('Solicitud cancelada');
    return result;
  }
  private async call(type: string, payload: Record<string, unknown>, id: string) {
    const connection = this.connection;
    if (!connection || connection.closed) throw new Error('Sin conexión');
    try {
      return await connection.request(type, payload, id);
    } catch (error) {
      if (connection === this.connection && error instanceof ProtocolError && error.code === 'UNAUTHENTICATED') {
        ++this.generation;
        this.connection = null;
        connection.close();
        await this.storeSession(null);
        // Retain the user identity/journal so reauthentication by the same user
        // can settle the original durable request rather than create a new one.
        this.update({online: false, needsLogin: true, error: error.message, errorCode: error.code});
      }
      if (error instanceof ProtocolError && error.code === 'FORBIDDEN' && typeof payload.conversationId === 'string')
        this.purgeConversation(payload.conversationId);
      throw error;
    }
  }
  private async reconcile() {
    if (!this.journal) return;
    try {
      const [first] = await this.journal.load();
      if (first && first.type !== 'messages.send') await this.settle(first);
    } catch (error) {
      this.report(error);
      if (!isTerminal(error)) throw error;
    } finally {
      this.update(await this.pendingPatch());
    }
    await this.drain();
  }
  /** Sends one journaled operation; removes it when confirmed or finally rejected. */
  private async settle(op: Operation) {
    try {
      const result = await this.queryOperation(op);
      await this.journal?.remove(op.id);
      return result;
    } catch (error) {
      if (isTerminal(error)) await this.journal?.remove(op.id);
      throw error;
    }
  }
  private queryOperation(op: {type: string; payload: Record<string, unknown>; id: string}) {
    if (!this.state.online || !this.connection || this.connection.closed)
      return Promise.reject(new Error('Sin conexión'));
    return this.call(op.type, op.payload, op.id);
  }
  async markAttendance() {
    if (!this.state.attendance) throw new Error('Actualiza el estado de asistencia');
    return this.mutate('attendance.mark', {
      expectedLastEventId: this.state.attendance.lastEvent?.id ?? null,
      ...this.classPayload(),
    });
  }
  async mutate(type: string, payload: Record<string, unknown>): Promise<any> {
    // Messages go through the queue; awaiting here still means "until the server confirms".
    if (type === 'messages.send')
      return this.waitFor(await this.enqueueMessage(payload as {conversationId: string; text: string}));
    if (!this.journal || !this.state.session) throw new Error('Inicia sesión');
    if (this.state.busy || this.state.pending)
      throw new Error('Hay una operación pendiente; reconecta para resolverla');
    this.update({busy: true, error: '', errorCode: ''});
    const journal = this.journal,
      op = {id: this.deps.uuid(), type, payload};
    this.operation = (async () => {
      await journal.enqueue(op, this.state.online);
      this.update(await this.pendingPatch());
      return this.settle(op);
    })();
    try {
      const result = await this.operation;
      // A read failure cannot turn an acknowledged, committed operation into a
      // failed mutation: the composer would otherwise keep a resendable draft.
      await this.refresh().catch(error => this.report(error));
      return result;
    } catch (error) {
      if (error instanceof ProtocolError && error.code === 'CONFLICT') await this.refreshAttendance();
      if (error instanceof ProtocolError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code))
        await this.refreshConversations();
      this.report(error);
      throw error;
    } finally {
      this.operation = null;
      this.update({busy: false, ...(await this.pendingPatch())});
    }
  }
  /** Saves a message durably in the outbox and starts sending; resolves once it is queued. */
  async enqueueMessage(payload: {conversationId: string; text: string}): Promise<string> {
    if (!this.journal || !this.state.session) throw new Error('Inicia sesión');
    const op: Operation = {id: this.deps.uuid(), type: 'messages.send', payload};
    await this.journal.enqueue(op, this.state.online && !!this.connection && !this.connection.closed);
    this.update(await this.pendingPatch());
    void this.drain().catch(error => this.report(error));
    return op.id;
  }
  private waitFor(id: string): Promise<any> {
    return new Promise((resolve, reject) => this.waiters.set(id, {resolve, reject}));
  }
  private resolveWaiter(id: string, result: any) {
    this.waiters.get(id)?.resolve(result);
    this.waiters.delete(id);
  }
  private rejectWaiters(error: unknown, id?: string) {
    for (const [key, waiter] of this.waiters)
      if (id === undefined || key === id) {
        waiter.reject(error);
        this.waiters.delete(key);
      }
  }
  /** Sends queued messages one at a time, in order; a single loop runs at a time. */
  drain(): Promise<void> {
    if (!this.draining)
      this.draining = this.drainQueue().finally(() => {
        this.draining = null;
      });
    return this.draining;
  }
  private async drainQueue() {
    const journal = this.journal;
    while (journal && journal === this.journal) {
      const [op] = await journal.load();
      if (!op || op.type !== 'messages.send') return;
      if (!this.state.online || !this.connection || this.connection.closed) {
        this.rejectWaiters(new Error('Sin conexión; se enviará al reconectar'));
        return;
      }
      let result: any;
      try {
        result = await this.queryOperation(op);
      } catch (error) {
        // Retryable: stop with the whole queue intact, to resume in order with the same UUIDs.
        if (!isTerminal(error)) {
          this.rejectWaiters(error);
          this.report(error);
          return;
        }
        await journal.remove(op.id);
        if (journal === this.journal) {
          this.recordFailure(op, error);
          this.update(await this.pendingPatch());
        }
        this.rejectWaiters(error, op.id);
        continue;
      }
      await journal.remove(op.id);
      if (journal !== this.journal) return;
      if (result?.message) this.addMessages(result.message.conversationId, [result.message]);
      // Publish the shorter queue before resolving, so awaiting callers see it settled.
      this.update(await this.pendingPatch());
      this.resolveWaiter(op.id, result);
    }
  }
  private recordFailure(op: Operation, error: unknown) {
    const id = String(op.payload.conversationId);
    const failure: FailedMessage = {
      id: op.id,
      text: String(op.payload.text),
      code: errorCode(error),
      reason: errorDetail(error),
    };
    this.update({failed: {...this.state.failed, [id]: [...(this.state.failed[id] ?? []), failure]}});
  }
  dismissFailed(conversationId: string, id: string) {
    const rest = (this.state.failed[conversationId] ?? []).filter(item => item.id !== id);
    const failed = {...this.state.failed};
    if (rest.length) failed[conversationId] = rest;
    else delete failed[conversationId];
    this.update({failed});
  }
  async refresh() {
    await this.refreshClasses();
    await this.refreshAttendance();
    await this.loadAttendance(false);
    await this.refreshConversations();
  }
  /** `{classId}` for the selected class, nothing for the general door. */
  private classPayload(): Record<string, unknown> {
    return this.state.attendanceClassId ? {classId: this.state.attendanceClassId} : {};
  }
  async refreshClasses() {
    let classes: ClassInfo[] = [];
    try {
      classes = (await this.query('classes.list')).classes;
    } catch (error) {
      // Servers without classes answer VALIDATION (unknown operation): no classes there.
      if (!(error instanceof ProtocolError && error.code === 'VALIDATION')) throw error;
    }
    const selected = this.state.attendanceClassId;
    if (selected && !classes.some(c => c.id === selected)) {
      // Removed from the selected class: back to the general door.
      ++this.attendanceHistoryGeneration;
      this.update({classes, attendanceClassId: null, attendance: null, events: [], attendanceCursor: null});
    } else this.update({classes});
  }
  /** Shows and marks attendance for [classId] (null = the general door). */
  async selectAttendanceClass(classId: string | null) {
    if (classId === this.state.attendanceClassId) return;
    ++this.attendanceHistoryGeneration;
    this.update({attendanceClassId: classId, attendance: null, events: [], attendanceCursor: null});
    await this.refreshAttendance();
    await this.loadAttendance(false);
  }
  async createClass(name: string, matriculas: string[]) {
    return this.mutate('groups.create', {name, matriculas, class: true});
  }
  /** One page of a class report (owner or admin), newest first. */
  async classReport(
    classId: string,
    filters: AttendanceFilters,
    before?: string | null,
  ): Promise<{events: ReportEvent[]; nextCursor: string | null}> {
    return this.query('attendance.classReport', {classId, limit: 50, ...filters, ...(before ? {before} : {})});
  }
  private applyAttendance(attendance: AttendanceState) {
    // Only the selected class (or the door) updates the hero.
    if ((attendance.classId ?? null) !== this.state.attendanceClassId) return;
    const current = this.state.attendance?.lastEvent,
      next = attendance.lastEvent;
    if (current && (!next || compareSeq(next.seq, current.seq) < 0)) return;
    this.update({attendance});
  }
  async refreshAttendance() {
    const attendance = await this.query('attendance.state', this.classPayload());
    this.applyAttendance(attendance);
  }
  async loadAttendancePreset(preset: RangePreset) {
    const historyGeneration = ++this.attendanceHistoryGeneration;
    await this.refreshAttendance();
    if (historyGeneration !== this.attendanceHistoryGeneration) return;
    await this.loadAttendance(false, presetRange(preset, this.state.attendance?.today ?? new Date()));
  }
  async loadAttendance(older = false, filters?: AttendanceFilters) {
    if (!older) {
      ++this.attendanceHistoryGeneration;
      if (filters !== undefined) this.update({attendanceFilters: {...filters}, events: [], attendanceCursor: null});
    }
    if (older && !this.state.attendanceCursor) return;
    const historyGeneration = this.attendanceHistoryGeneration;
    const payload: Record<string, unknown> = {limit: 50, ...this.state.attendanceFilters, ...this.classPayload()};
    if (older && this.state.attendanceCursor) payload.before = this.state.attendanceCursor;
    const page = await this.query('attendance.list', payload);
    if (historyGeneration !== this.attendanceHistoryGeneration) return;
    const events = older ? [...this.state.events, ...page.events] : page.events;
    this.update({
      events: [
        ...new Map<string, AttendanceEvent>(events.map((event: AttendanceEvent) => [event.id, event])).values(),
      ].sort((a, b) => compareSeq(b.seq, a.seq)),
      attendanceCursor: page.nextCursor,
    });
  }
  async refreshConversations() {
    this.conversationDirty = true;
    if (this.conversationRefresh && this.conversationRefreshGeneration === this.generation)
      return this.conversationRefresh;
    const generation = this.generation;
    this.conversationRefreshGeneration = generation;
    const refresh = (async () => {
      do {
        this.conversationDirty = false;
        await this.fetchConversations();
      } while (this.conversationDirty && generation === this.generation);
    })();
    this.conversationRefresh = refresh;
    try {
      await refresh;
    } finally {
      if (this.conversationRefresh === refresh) this.conversationRefresh = null;
    }
  }
  private async fetchConversations() {
    const conversations: Conversation[] = [];
    let after: string | undefined;
    do {
      const page = await this.query('conversations.list', {limit: 100, ...(after ? {after} : {})});
      conversations.push(...page.conversations);
      if (page.nextCursor && page.nextCursor === after) throw new Error('Cursor de conversaciones inválido');
      after = page.nextCursor ?? undefined;
    } while (after);
    const allowed = new Set<string>(conversations.map((c: Conversation) => c.id));
    const messages = Object.fromEntries(Object.entries(this.state.messages).filter(([id]) => allowed.has(id)));
    this.recovered = Object.fromEntries(Object.entries(this.recovered).filter(([id]) => allowed.has(id)));
    this.update({conversations, messages});
    for (const conversation of conversations) {
      try {
        await this.recoverMessages(conversation.id);
      } catch (error) {
        if (error instanceof ProtocolError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code)) {
          this.purgeConversation(conversation.id);
          continue;
        }
        throw error;
      }
    }
  }
  private purgeConversation(id: string) {
    const messages = {...this.state.messages};
    delete messages[id];
    delete this.recovered[id];
    this.update({messages, conversations: this.state.conversations.filter(c => c.id !== id)});
  }
  private addMessages(id: string, messages: Message[]) {
    this.update({messages: {...this.state.messages, [id]: mergeMessages(this.state.messages[id] ?? [], messages, id)}});
  }
  async recoverMessages(id: string) {
    let after = this.recovered[id];
    if (after === undefined) {
      const page = await this.query('messages.list', {conversationId: id, limit: 50});
      this.addMessages(id, page.messages);
      this.update({older: {...this.state.older, [id]: page.nextCursor}});
      this.recovered[id] = page.messages.at(-1)?.seq ?? '0';
      // Fetch from the fetched boundary; events received during the first page do not move it.
      after = this.recovered[id];
    }
    while (true) {
      const page = await this.query('messages.list', {conversationId: id, after, limit: 100});
      this.addMessages(id, page.messages);
      if (page.messages.length) this.recovered[id] = page.messages.at(-1).seq;
      if (!page.nextCursor) break;
      if (page.nextCursor === after) throw new Error('Cursor de mensajes inválido');
      after = page.nextCursor;
    }
  }
  async loadOlderMessages(id: string) {
    const before = this.state.older[id];
    if (!before) return;
    try {
      const page = await this.query('messages.list', {conversationId: id, before, limit: 50});
      this.addMessages(id, page.messages);
      this.update({older: {...this.state.older, [id]: page.nextCursor}});
    } catch (error) {
      if (error instanceof ProtocolError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code)) this.purgeConversation(id);
      throw error;
    }
  }
  private onEvent(event: Envelope) {
    if (event.type === 'message.created') {
      const message = event.payload.message as Message;
      if (this.state.conversations.some(c => c.id === message.conversationId))
        this.addMessages(message.conversationId, [message]);
    } else if (event.type === 'attendance.changed') {
      const changed = event.payload as AttendanceState;
      if ((changed.classId ?? null) !== this.state.attendanceClassId) return;
      this.applyAttendance(changed);
      void this.loadAttendance().catch(error => this.report(error));
    } else if (event.type === 'signup.changed') {
      this.update({signupVersion: this.state.signupVersion + 1});
    } else if (event.type === 'conversations.changed') {
      void this.refreshConversations().catch(error => this.report(error));
      void this.refreshClasses().catch(error => this.report(error));
    }
  }
  async logout() {
    const connection = this.connection;
    ++this.generation;
    this.connection = null;
    // Let revocation reach the server before closing. Its request timeout closes
    // an unreachable socket; local identity clearing does not wait for that ack.
    if (this.state.online && connection && !connection.closed && !this.operation) {
      void connection.request('auth.logout', {}, this.deps.uuid()).then(
        () => connection.close(),
        () => connection.close(),
      );
    } else connection?.close();
    this.update({busy: true, online: false});
    if (this.operation) await this.operation.catch(() => {});
    if (this.draining) await this.draining.catch(() => {});
    this.rejectWaiters(new Error('Sesión cerrada'));
    await this.storeSession(null);
    await this.journal?.discard();
    this.journal = null;
    this.recovered = {};
    ++this.attendanceHistoryGeneration;
    this.update({...Engine.EMPTY_VIEW, busy: false});
  }
  /** Everything shown for one server and session; cleared when either changes. */
  private static readonly EMPTY_VIEW: Partial<AppState> = {
    session: null,
    online: false,
    busy: false,
    pending: false,
    pendingCount: 0,
    outbox: [],
    failed: {},
    pendingType: null,
    needsLogin: false,
    error: '',
    errorCode: '',
    messages: {},
    conversations: [],
    events: [],
    attendance: null,
    attendanceCursor: null,
    attendanceFilters: {},
    classes: [],
    attendanceClassId: null,
    older: {},
  };
  /** Stops using the active server without signing out of it (switching servers). */
  private async suspend() {
    const connection = this.connection;
    ++this.generation;
    this.connection = null;
    connection?.close();
    this.update({busy: true, online: false});
    if (this.operation) await this.operation.catch(() => {});
    if (this.draining) await this.draining.catch(() => {});
    this.rejectWaiters(new Error('Cambiaste de servidor'));
    this.journal = null;
    this.recovered = {};
    ++this.attendanceHistoryGeneration;
    this.update({...Engine.EMPTY_VIEW, busy: false});
  }
  /** Makes [serverId] active, keeping every other server's session. */
  async selectServer(serverId: string) {
    if (serverId === this.state.activeServerId) return;
    if (!this.state.servers.some(server => server.id === serverId)) throw new Error('Servidor desconocido');
    await this.suspend();
    await this.saveServers(this.state.servers, serverId);
    await this.resumeStored();
  }
  /** Parses a scanned or pasted link and says whether it is new, known or a changed identity. */
  async previewServer(text: string): Promise<ServerPreview> {
    const parsed = parseServerLink(text);
    if (!parsed.ok) return parsed;
    const fingerprint = await this.deps.sha256(parsed.server.caDer);
    const existing = this.state.servers.find(server => server.id === parsed.server.id);
    const status = !existing ? 'new' : existing.fingerprint === fingerprint ? 'known' : 'ca-changed';
    if (status === 'new' && this.state.servers.length >= MAX_SERVERS)
      return {ok: false, reason: `Puedes guardar hasta ${MAX_SERVERS} servidores. Elimina uno para añadir otro.`};
    return {
      ok: true,
      link: parsed.server,
      fingerprint,
      status,
      kind: parsed.kind,
      ...(parsed.code ? {code: parsed.code} : {}),
      ...(parsed.className ? {className: parsed.className} : {}),
    };
  }
  /** Redeems a personal invitation on the active server with the PIN the student chose. */
  async redeemInvitation(code: string, pin: string) {
    if (this.state.busy) throw new Error('Espera a que termine la operación actual');
    this.update({busy: true, error: '', errorCode: ''});
    try {
      await this.open();
      const session = await this.connection!.request('invites.redeem', {code, pin}, this.deps.uuid());
      await this.activate(session);
    } catch (error) {
      this.report(error);
      throw error;
    } finally {
      this.update({busy: false});
    }
  }
  /** Asks to join a class on the active server; the account stays pending until approved. */
  async requestSignup(classCode: string, matricula: string, name: string, pin: string) {
    if (this.state.busy) throw new Error('Espera a que termine la operación actual');
    this.update({busy: true, error: '', errorCode: ''});
    try {
      await this.open();
      await this.connection!.request(
        'signup.request',
        {classCode: classCode.trim().toUpperCase(), matricula: matricula.trim(), name: name.trim(), pin},
        this.deps.uuid(),
      );
    } catch (error) {
      this.report(error);
      throw error;
    } finally {
      // No session comes out of a sign-up: do not keep an anonymous socket open.
      if (!this.state.session) {
        ++this.generation;
        this.connection?.close();
        this.connection = null;
      }
      this.update({busy: false});
    }
  }
  /** The class sign-up code (owner or admin); [renew] replaces it. */
  async classCode(classId: string, renew = false): Promise<{code: string; link?: string}> {
    return this.query('classes.code', {classId, renew});
  }
  async signupRequests(classId: string): Promise<SignupRequest[]> {
    return (await this.query('signup.list', {classId})).requests;
  }
  async decideSignup(matricula: string, approve: boolean) {
    return this.mutate(approve ? 'signup.approve' : 'signup.reject', {matricula});
  }
  /**
   * Saves a confirmed preview and makes it active. A changed CA replaces the old one only with
   * [replaceCa], and then the old session and queue go too: it is no longer the same identity.
   */
  async enrollServer(preview: Extract<ServerPreview, {ok: true}>, replaceCa = false) {
    const {link, fingerprint} = preview;
    const existing = this.state.servers.find(server => server.id === link.id);
    if (existing && existing.fingerprint !== fingerprint && !replaceCa)
      throw new Error('La identidad del servidor cambió; confirma antes de reemplazarla');
    if (!existing && this.state.servers.length >= MAX_SERVERS) throw new Error(`Máximo ${MAX_SERVERS} servidores`);
    if (existing && existing.fingerprint !== fingerprint) await this.forget(existing);
    const entry: SavedServer = {
      id: link.id,
      name: link.name,
      addresses: link.addresses,
      lastAddress: existing?.lastAddress && link.addresses.includes(existing.lastAddress) ? existing.lastAddress : null,
      caPem: link.caPem,
      fingerprint,
      scope: existing?.scope ?? JSON.stringify([link.id]),
      addedAt: existing?.addedAt ?? this.now(),
    };
    const servers = existing
      ? this.state.servers.map(server => (server.id === link.id ? entry : server))
      : [...this.state.servers, entry];
    const unchanged =
      existing &&
      existing.fingerprint === fingerprint &&
      existing.name === link.name &&
      existing.addresses.join() === link.addresses.join();
    if (unchanged && link.id === this.state.activeServerId) return;
    if (link.id === this.state.activeServerId) {
      await this.suspend();
      await this.saveServers(servers, link.id);
      await this.resumeStored();
    } else {
      await this.saveServers(servers);
      await this.selectServer(link.id);
    }
  }
  /** Deletes the session, queue and failure notes stored for [server]. */
  private async forget(server: SavedServer) {
    const saved = await this.deps.secure.getItem(sessionKey(server.id));
    if (saved) await new Outbox(this.deps.storage, this.userScope(JSON.parse(saved), server)).discard();
    await this.storeSession(null, server.id);
  }
  /** Removes [serverId] with its session and queue; another server becomes active if needed. */
  async removeServer(serverId: string) {
    const server = this.state.servers.find(item => item.id === serverId);
    if (!server) return;
    const wasActive = serverId === this.state.activeServerId;
    if (wasActive) await this.suspend();
    await this.forget(server);
    const servers = this.state.servers.filter(item => item.id !== serverId);
    await this.saveServers(servers, wasActive ? (servers[0]?.id ?? null) : this.state.activeServerId);
    if (wasActive) await this.resumeStored();
  }
  /** Edits the address of the hand-configurable installation server (and makes it active). */
  async configure(server: Server) {
    const host = server.host
      .trim()
      .replace(/^\[|\]$/g, '')
      .toLowerCase();
    if (!host || /[\s/]/.test(host) || !Number.isInteger(server.port) || server.port < 1 || server.port > 65535)
      throw new Error('Indica una IP/host y puerto entre 1 y 65535');
    const manual = this.state.servers.find(item => item.manual);
    if (!manual) throw new Error('Este servidor se configura con su código QR');
    const address = joinAddress(host, server.port);
    if (manual.id === this.state.activeServerId && manual.addresses.length === 1 && manual.addresses[0] === address)
      return;
    if (manual.id === this.state.activeServerId) await this.logout();
    else await this.forget(manual);
    const servers = this.state.servers.map(item =>
      item.id === manual.id ? {...item, addresses: [address], lastAddress: null} : item,
    );
    await this.saveServers(servers, manual.id);
  }
}
