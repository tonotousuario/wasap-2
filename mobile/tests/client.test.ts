import test from 'node:test';
import assert from 'node:assert/strict';
import {RpcClient} from '../src/client.ts';
import {FrameDecoder, encodeFrame} from '../src/protocol.ts';

test('correlates out-of-order responses and emits live events separately', async () => {
  const writes: Buffer[] = [];
  const events: unknown[] = [];
  const client = new RpcClient(
    {write: b => writes.push(Buffer.from(b)), destroy: () => {}},
    e => events.push(e),
    () => {},
    1000,
  );
  const first = client.request('ping', {}, '1'),
    second = client.request('attendance.state', {}, '2');
  assert.equal(new FrameDecoder().push(writes[0])[0].type, 'ping');
  client.receive(encodeFrame({v: 1, kind: 'event', id: 'e', type: 'conversations.changed', payload: {}}));
  client.receive(encodeFrame({v: 1, kind: 'response', id: '2', type: 'success', payload: {nextType: 'ENTRY'}}));
  client.receive(encodeFrame({v: 1, kind: 'response', id: '1', type: 'success', payload: {ready: true}}));
  assert.deepEqual(await first, {ready: true});
  assert.deepEqual(await second, {nextType: 'ENTRY'});
  assert.equal(events.length, 1);
});
test('protocol errors reject the correct request without exposing another response', async () => {
  const client = new RpcClient(
    {write: () => {}, destroy: () => {}},
    () => {},
    () => {},
  );
  const result = client.request('attendance.mark', {}, '1');
  client.receive(
    encodeFrame({
      v: 1,
      kind: 'response',
      id: '1',
      type: 'error',
      payload: {code: 'CONFLICT', message: 'estado anterior'},
    }),
  );
  await assert.rejects(result, {code: 'CONFLICT', message: 'estado anterior'});
});
test('malformed frames close socket and reject all requests; timeout closes uncertain connection', async () => {
  let destroyed = 0;
  const client = new RpcClient(
    {
      write: () => {},
      destroy: () => {
        destroyed++;
      },
    },
    () => {},
    () => {},
    10,
  );
  const waiting = client.request('ping', {}, '1');
  client.receive(Buffer.from([0, 0, 0, 0]));
  await assert.rejects(waiting, /length/);
  assert.equal(destroyed, 1);
  const next = new RpcClient(
    {
      write: () => {},
      destroy: () => {
        destroyed++;
      },
    },
    () => {},
    () => {},
    10,
  );
  await assert.rejects(next.request('ping', {}, '2'), /tiempo/i);
  assert.equal(destroyed, 2);
});
