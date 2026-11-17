import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameDecoder, encodeFrame} from '../src/protocol.ts';
import {Buffer as BrowserBuffer} from 'buffer/index.js';

const event = {
  v: 1,
  kind: 'event',
  id: 'ae0a64d0-2f59-48c9-947d-5c8aaec3fb90',
  type: 'conversations.changed',
  payload: {},
};
test('decodes successive frames when typed-array views lose the Buffer prototype', () => {
  // Hermes/browser typed-array views can be plain Uint8Array, unlike Node Buffer views.
  const previous = Object.getOwnPropertyDescriptor(BrowserBuffer, Symbol.species);
  Object.defineProperty(BrowserBuffer, Symbol.species, {value: Uint8Array, configurable: true});
  try {
    const decoder = new FrameDecoder();
    assert.deepEqual(decoder.push(encodeFrame(event)), [event]);
    assert.deepEqual(decoder.push(encodeFrame(event)), [event]);
    const header = BrowserBuffer.alloc(4);
    header.writeUInt32BE(2, 0);
    assert.throws(() => decoder.push(BrowserBuffer.concat([header, BrowserBuffer.from([0xc0, 0xaf])])), /UTF-8/);
  } finally {
    if (previous) Object.defineProperty(BrowserBuffer, Symbol.species, previous);
    else Reflect.deleteProperty(BrowserBuffer, Symbol.species);
  }
});
test('frames survive split headers, coalescing and split multibyte UTF-8', () => {
  const a = encodeFrame({...event, payload: {text: 'México 🌵'}});
  const b = encodeFrame(event);
  const input = Buffer.concat([a, b]);
  const decoder = new FrameDecoder();
  const found = [];
  for (const byte of input) found.push(...decoder.push(Buffer.from([byte])));
  assert.equal(found.length, 2);
  assert.deepEqual(found[0], {...event, payload: {text: 'México 🌵'}});
  assert.deepEqual(found[1], event);
});
test('rejects zero/oversized lengths before accepting payload', () => {
  for (const size of [0, 65537, 0xffffffff]) {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(size);
    assert.throws(() => new FrameDecoder().push(header), /length/i);
  }
});
test('rejects malformed UTF-8, JSON and non-protocol envelopes', () => {
  for (const payload of [Buffer.from([0xc0, 0xaf]), Buffer.from('{'), Buffer.from('{"v":2}')]) {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length);
    assert.throws(() => new FrameDecoder().push(Buffer.concat([header, payload])));
  }
});
test('limits outbound frame by UTF-8 bytes', () => {
  assert.throws(() => encodeFrame({...event, payload: {text: '🌵'.repeat(20000)}}), /length/i);
});
