import test from 'node:test';
import assert from 'node:assert/strict';
import { Outbox, OUTBOX_LIMIT, isTerminal, mergeMessages, ProtocolError } from '../src/state.ts';
import type { Message } from '../src/types.ts';

class Memory {
  values=new Map<string,string>();
  async getItem(key:string){return this.values.get(key)??null;}
  async setItem(key:string,value:string){this.values.set(key,value);}
  async removeItem(key:string){this.values.delete(key);}
}
const send=(id:string,conversationId='room')=>({id,type:'messages.send',payload:{conversationId,text:id}});
test('queues messages durably in order and removes them by id',async()=>{
  const disk=new Memory();const outbox=new Outbox(disk,'server/user');
  await outbox.enqueue(send('1'),true);await outbox.enqueue(send('2'),true);
  const restarted=new Outbox(disk,'server/user');
  assert.deepEqual((await restarted.load()).map(op=>op.id),['1','2']);
  await restarted.remove('1');
  assert.deepEqual((await restarted.load()).map(op=>op.id),['2']);
  await restarted.remove('2');
  assert.equal(disk.values.size,0);
});
test('rejects offline actions, a full queue and mixing other mutations with messages',async()=>{
  const disk=new Memory();const outbox=new Outbox(disk,'a/user');
  await assert.rejects(outbox.enqueue(send('x'),false),/conexión/i);
  assert.equal(disk.values.size,0);
  for(let i=0;i<OUTBOX_LIMIT;i++)await outbox.enqueue(send(String(i)),true);
  await assert.rejects(outbox.enqueue(send('extra'),true),/20 mensajes/);
  await assert.rejects(outbox.enqueue({id:'a',type:'attendance.mark',payload:{expectedLastEventId:null}},true),/pendiente/i);
  const other=new Outbox(new Memory(),'a/user');
  await other.enqueue({id:'g',type:'groups.add',payload:{}},true);
  await assert.rejects(other.enqueue(send('m'),true),/pendiente/i);
  await assert.rejects(other.enqueue({id:'g2',type:'groups.add',payload:{}},true),/pendiente/i);
});
test('concurrent enqueues keep every message',async()=>{
  const outbox=new Outbox(new Memory(),'a/user');
  await Promise.all(['1','2','3','4'].map(id=>outbox.enqueue(send(id),true)));
  assert.deepEqual((await outbox.load()).map(op=>op.id),['1','2','3','4']);
});
test('scope prevents replay into another server/user and discard removes everything',async()=>{
  const disk=new Memory();const outbox=new Outbox(disk,'a/one');
  await outbox.enqueue(send('1'),true);
  assert.deepEqual(await new Outbox(disk,'a/two').load(),[]);
  assert.deepEqual(await new Outbox(disk,'b/one').load(),[]);
  await outbox.discard();assert.deepEqual(await outbox.load(),[]);assert.equal(disk.values.size,0);
});
test('migrates a legacy single pending operation keeping its UUID',async()=>{
  const disk=new Memory();
  const legacy={id:'legacy-uuid',type:'messages.send',payload:{conversationId:'room',text:'hola'}};
  await disk.setItem('pending:a/user',JSON.stringify(legacy));
  const outbox=new Outbox(disk,'a/user');
  assert.deepEqual(await outbox.load(),[legacy]);
  assert.equal(await disk.getItem('pending:a/user'),null);
  await outbox.enqueue(send('next'),true);
  assert.deepEqual((await outbox.load()).map(op=>op.id),['legacy-uuid','next']);
});
test('only UNAVAILABLE and UNAUTHENTICATED keep an operation; INTERNAL and others are final',()=>{
  assert.equal(isTerminal(new ProtocolError('UNAVAILABLE','later')),false);
  assert.equal(isTerminal(new ProtocolError('UNAUTHENTICATED','login')),false);
  assert.equal(isTerminal(new Error('connection lost')),false);
  for(const code of ['INTERNAL','CONFLICT','FORBIDDEN','NOT_FOUND','VALIDATION'])assert.equal(isTerminal(new ProtocolError(code,'x')),true,code);
});
test('orders arbitrary precision sequences, deduplicates records and ignores other rooms',()=>{
  const message=(id:string,seq:string,conversationId='room'):Message=>({id,seq,conversationId,senderId:'u',senderName:'Ana',text:id,createdAt:'2026-11-12T00:00:00Z'});
  const a=message('a','9007199254740993'),b=message('b','9007199254740992');
  assert.deepEqual(mergeMessages([a],[b,a,message('other','1','elsewhere')],'room').map(m=>m.id),['b','a']);
});
