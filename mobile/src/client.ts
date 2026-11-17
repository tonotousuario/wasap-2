import {FrameDecoder, encodeFrame, type Envelope} from './protocol.ts';
import {ProtocolError} from './state.ts';
export interface Wire {
  write(bytes: Uint8Array): unknown;
  destroy(): unknown;
}
export class RpcClient {
  private wire: Wire;
  private decoder = new FrameDecoder();
  private pending = new Map<
    string,
    {resolve: (data: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>}
  >();
  private event: (event: Envelope) => void;
  private disconnected: (error: Error) => void;
  private timeout: number;
  closed = false;
  constructor(wire: Wire, onEvent: (event: Envelope) => void, onDisconnect: (error: Error) => void, timeout = 15000) {
    this.wire = wire;
    this.event = onEvent;
    this.disconnected = onDisconnect;
    this.timeout = timeout;
  }
  request(type: string, payload: Record<string, unknown>, id: string): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Sin conexión'));
    if (this.pending.has(id)) return Promise.reject(new Error('Solicitud duplicada en curso'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.close(new Error('Se agotó el tiempo de respuesta; se reconciliará al reconectar')),
        this.timeout,
      );
      this.pending.set(id, {resolve, reject, timer});
      try {
        this.wire.write(encodeFrame({v: 1, kind: 'request', id, type, payload}));
      } catch (e) {
        this.close(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
  receive(bytes: Uint8Array) {
    if (this.closed) return;
    try {
      for (const frame of this.decoder.push(bytes)) {
        if (frame.kind === 'event') {
          this.event(frame);
          continue;
        }
        if (frame.kind !== 'response' || !['success', 'error'].includes(frame.type))
          throw new Error('Respuesta de protocolo inválida');
        const waiting = this.pending.get(frame.id);
        if (!waiting) continue;
        this.pending.delete(frame.id);
        clearTimeout(waiting.timer);
        if (frame.type === 'error')
          waiting.reject(new ProtocolError(String(frame.payload.code), String(frame.payload.message)));
        else waiting.resolve(frame.payload);
      }
    } catch (e) {
      this.close(e instanceof Error ? e : new Error(String(e)));
    }
  }
  close(error = new Error('Conexión cerrada')) {
    if (this.closed) return;
    this.closed = true;
    this.wire.destroy();
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
    this.disconnected(error);
  }
}
