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
} from './types.ts';
import {ConnectError, errorCode, errorDetail} from './errors.ts';
import {presetRange, type RangePreset} from './format.ts';
export type Connection = {
  closed: boolean;
  request(type: string, payload: Record<string, unknown>, id: string): Promise<any>;
  close(error?: Error): void;
};
export type Dependencies = {
  storage: Storage;
  secure: Storage;
  uuid: () => string;
  connect: (server: Server, event: (e: Envelope) => void, close: (e: Error) => void) => Promise<Connection>;
};
export type AttendanceFilters = {from?: string; to?: string};
export type AppState = {
  server: Server;
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
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  older: Record<string, string | null>;
};
export class Engine {
  state: AppState = {
    server: {host: '192.168.1.2', port: 5050},
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
  private serverScope() {
    return JSON.stringify([this.state.server.host.toLowerCase(), this.state.server.port]);
  }
  private userScope(session: Session) {
    return JSON.stringify([this.state.server.host.toLowerCase(), this.state.server.port, session.user.id]);
  }
  async initialize() {
    const config = await this.deps.storage.getItem('server');
    if (config) this.update({server: JSON.parse(config)});
    const saved = await this.deps.secure.getItem('wasap.session');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.server === this.serverScope()) {
        this.journal = new Outbox(this.deps.storage, this.userScope(parsed.session));
        this.update({session: parsed.session, ...(await this.pendingPatch())});
        try {
          await this.reconnect();
        } catch (error) {
          this.report(error);
        }
      } else await this.deps.secure.removeItem('wasap.session');
    }
  }
  report(error: unknown) {
    this.update({error: errorDetail(error), errorCode: errorCode(error)});
  }
  clearError() {
    if (this.state.error || this.state.errorCode) this.update({error: '', errorCode: ''});
  }
  private async open() {
    this.connection?.close();
    const generation = ++this.generation;
    const connection = await this.deps.connect(
      this.state.server,
      event => {
        if (generation === this.generation) this.onEvent(event);
      },
      error => {
        if (generation === this.generation)
          this.update({online: false, error: errorDetail(error), errorCode: errorCode(error)});
      },
    );
    if (generation !== this.generation) {
      connection.close();
      throw new Error('Conexión cancelada');
    }
    this.connection = connection;
  }
  private async activate(session: Session) {
    if (this.state.session && this.state.session.user.id !== session.user.id) {
      await this.journal?.discard();
      this.recovered = {};
      this.update({messages: {}, conversations: [], events: [], attendance: null, older: {}, failed: {}});
    }
    this.journal = new Outbox(this.deps.storage, this.userScope(session));
    await this.deps.secure.setItem('wasap.session', JSON.stringify({server: this.serverScope(), session}));
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
        await this.deps.secure.removeItem('wasap.session');
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
        await this.deps.secure.removeItem('wasap.session');
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
    return this.mutate('attendance.mark', {expectedLastEventId: this.state.attendance.lastEvent?.id ?? null});
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
    await this.refreshAttendance();
    await this.loadAttendance(false);
    await this.refreshConversations();
  }
  private applyAttendance(attendance: AttendanceState) {
    const current = this.state.attendance?.lastEvent,
      next = attendance.lastEvent;
    if (current && (!next || compareSeq(next.seq, current.seq) < 0)) return;
    this.update({attendance});
  }
  async refreshAttendance() {
    const attendance = await this.query('attendance.state');
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
    const payload: Record<string, unknown> = {limit: 50, ...this.state.attendanceFilters};
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
      this.applyAttendance(event.payload as AttendanceState);
      void this.loadAttendance().catch(error => this.report(error));
    } else if (event.type === 'conversations.changed')
      void this.refreshConversations().catch(error => this.report(error));
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
    await this.deps.secure.removeItem('wasap.session');
    await this.journal?.discard();
    this.journal = null;
    this.recovered = {};
    ++this.attendanceHistoryGeneration;
    this.update({
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
      older: {},
    });
  }
  async configure(server: Server) {
    const host = server.host
      .trim()
      .replace(/^\[|\]$/g, '')
      .toLowerCase();
    if (!host || /[\s/]/.test(host) || !Number.isInteger(server.port) || server.port < 1 || server.port > 65535)
      throw new Error('Indica una IP/host y puerto entre 1 y 65535');
    if (host === this.state.server.host && server.port === this.state.server.port) return;
    await this.logout();
    await this.deps.storage.setItem('server', JSON.stringify({host, port: server.port}));
    this.update({server: {host, port: server.port}});
  }
}
