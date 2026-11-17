// Fallos de conexión con un tipo estable para que la interfaz no dependa del
// texto técnico del sistema operativo.
export type ConnectKind = 'unreachable' | 'tls' | 'closed' | 'offline' | 'config';
export class ConnectError extends Error {
  kind: ConnectKind;
  detail: string;
  constructor(kind: ConnectKind, message: string, detail = '') {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}
export function classifyConnectFailure(detail: string): 'unreachable' | 'tls' | 'closed' {
  if (/certif|cert ?path|trust ?anchor|handshake|ssl|tls|hostname|x509|not verified|secure connection/i.test(detail))
    return 'tls';
  if (/cerró la conexión|closed|reset|broken pipe|EPIPE/i.test(detail)) return 'closed';
  return 'unreachable';
}
export function errorCode(error: unknown): string {
  if (error instanceof ConnectError) return 'CONNECT_' + error.kind.toUpperCase();
  const code = (error as {code?: unknown} | null)?.code;
  return error instanceof Error && typeof code === 'string' ? code : '';
}
export function errorDetail(error: unknown): string {
  if (error instanceof ConnectError && error.detail) return `${error.message} (${error.detail})`;
  return error instanceof Error ? error.message : String(error);
}
