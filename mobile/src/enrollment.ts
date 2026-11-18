/**
 * Server enrollment links (`wasap://server?v=1&id=…&name=…&a=host:port…&ca=…`), shared by the
 * QR scanner and the "paste link" field. Pure: no React Native imports, tested under Node.
 */

export const LINK_PREFIX = 'wasap://server?';
export const MAX_ADDRESSES = 5;

export type ServerLink = {id: string; name: string; addresses: string[]; caDer: Uint8Array; caPem: string};
export type LinkResult = {ok: true; server: ServerLink} | {ok: false; reason: string};

const NOT_WASAP = 'No es un servidor Wasap compatible.';

export function parseServerLink(text: string): LinkResult {
  const value = text.trim();
  if (!value.startsWith(LINK_PREFIX)) return {ok: false, reason: NOT_WASAP};
  const params: [string, string][] = [];
  for (const part of value.slice(LINK_PREFIX.length).split('&')) {
    const at = part.indexOf('=');
    if (at < 1) return {ok: false, reason: NOT_WASAP};
    try {
      params.push([part.slice(0, at), decodeURIComponent(part.slice(at + 1))]);
    } catch {
      return {ok: false, reason: NOT_WASAP};
    }
  }
  const one = (key: string) => {
    const values = params.filter(([k]) => k === key).map(([, v]) => v);
    return values.length === 1 ? values[0] : null;
  };
  if (one('v') !== '1') return {ok: false, reason: `${NOT_WASAP} Actualiza la app o pide un QR nuevo.`};
  const id = one('id')?.trim();
  const name = one('name')?.trim();
  const ca = one('ca');
  const addresses = params.filter(([k]) => k === 'a').map(([, v]) => v.trim());
  if (!id || id.length > 64 || !name || name.length > 80 || !ca)
    return {ok: false, reason: `${NOT_WASAP} Faltan datos.`};
  if (!addresses.length || addresses.length > MAX_ADDRESSES)
    return {ok: false, reason: `El QR debe traer entre 1 y ${MAX_ADDRESSES} direcciones.`};
  if (addresses.some(address => !splitAddress(address)))
    return {ok: false, reason: 'El QR trae una dirección inválida.'};
  let caDer: Uint8Array;
  try {
    caDer = base64UrlDecode(ca);
  } catch {
    return {ok: false, reason: 'El certificado del QR está dañado.'};
  }
  if (!isCaCertificate(caDer)) return {ok: false, reason: 'El certificado del QR no es el de una autoridad (CA).'};
  return {ok: true, server: {id, name, addresses: [...new Set(addresses)], caDer, caPem: derToPem(caDer)}};
}

/** `host:port` → parts; IPv6 literals in brackets; port 1–65535. */
export function splitAddress(address: string): {host: string; port: number} | null {
  const match = /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+):(\d{1,5})$/.exec(address);
  if (!match) return null;
  const port = Number(match[2]);
  if (port < 1 || port > 65535) return null;
  return {host: match[1].replace(/^\[|\]$/g, ''), port};
}

export function joinAddress(host: string, port: number) {
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64UrlDecode(text: string): Uint8Array {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) throw new Error('base64 inválido');
  const out: number[] = [];
  let buffer = 0,
    bits = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '=';
  }
  return out;
}

export function derToPem(der: Uint8Array): string {
  const body = base64Encode(der)
    .replace(/(.{64})/g, '$1\n')
    .replace(/\n$/, '');
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

export function pemToDer(pem: string): Uint8Array {
  const match = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(pem);
  if (!match) throw new Error('PEM inválido');
  return base64UrlDecode(match[1].replace(/\s+/g, ''));
}

/** Lowercase hex, as the server announces `caFingerprint`. */
export function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Short form for people to compare: first 8 bytes in pairs, «a1b2 c3d4 …». */
export function shortFingerprint(fingerprint: string) {
  return (fingerprint.slice(0, 16).match(/.{4}/g) ?? []).join(' ').toUpperCase();
}

type Tlv = {tag: number; start: number; end: number};

function readTlv(bytes: Uint8Array, offset: number, limit: number): Tlv {
  if (offset + 2 > limit) throw new Error('DER truncado');
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count < 1 || count > 3 || start + count > limit) throw new Error('DER inválido');
    length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | bytes[start + i];
    start += count;
  }
  if (start + length > limit) throw new Error('DER truncado');
  return {tag, start, end: start + length};
}

function children(bytes: Uint8Array, parent: Tlv): Tlv[] {
  const items: Tlv[] = [];
  for (let at = parent.start; at < parent.end;) {
    const item = readTlv(bytes, at, parent.end);
    items.push(item);
    at = item.end;
  }
  return items;
}

const BASIC_CONSTRAINTS = [0x55, 0x1d, 0x13]; // 2.5.29.19

/** Whether the X.509 certificate in [der] has basicConstraints with cA = TRUE. */
export function isCaCertificate(der: Uint8Array): boolean {
  try {
    const certificate = readTlv(der, 0, der.length);
    if (certificate.tag !== 0x30 || certificate.end !== der.length) return false;
    const tbs = children(der, certificate)[0];
    const extensions = children(der, tbs).find(item => item.tag === 0xa3);
    if (!extensions) return false;
    const list = children(der, extensions)[0];
    for (const extension of children(der, list)) {
      const [oid, ...rest] = children(der, extension);
      const id = der.subarray(oid.start, oid.end);
      if (oid.tag !== 0x06 || id.length !== 3 || BASIC_CONSTRAINTS.some((b, i) => id[i] !== b)) continue;
      const value = rest[rest.length - 1];
      if (value?.tag !== 0x04) return false;
      const sequence = readTlv(der, value.start, value.end);
      const first = children(der, sequence)[0];
      return !!first && first.tag === 0x01 && first.end - first.start === 1 && der[first.start] !== 0;
    }
    return false;
  } catch {
    return false;
  }
}
