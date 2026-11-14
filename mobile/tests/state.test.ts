import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingMutation, mergeMessages, ProtocolError } from '../src/state.ts';
import type { Message } from '../src/types.ts';

class Memory {
  values=new Map<string,string>();
  async getItem(key:string){return this.values.get(key)??null;}
  async setItem(key:string,value:string){this.values.set(key,value);}
  async removeItem(key:string){this.values.delete(key);}
}
test('saves before sending and replays identical UUID/content after a lost acknowledgement/restart',async()=>{
  const disk=new Memory();
  const operation={id:'operation-1',type:'messages.send',payload:{conversationId:'room',text:'hola'}};
  const first=new PendingMutation(disk,'server/user');
  await assert.rejects(first.run(operation,true,async op=>{
    assert.deepEqual(JSON.parse([...disk.values.values()][0]),operation);
    throw new Error('connection lost');
  }));
  const restarted=new PendingMutation(disk,'server/user');
  let replayed:unknown;
  const result=await restarted.replay(async op=>{replayed=op;return {message:{id:'saved'}};});
  assert.deepEqual(replayed,operation);
  assert.deepEqual(result,{message:{id:'saved'}});
  assert.equal(await restarted.load(),null);
});
test('prevents new offline actions and a second action while a previous result is unresolved',async()=>{
  const disk=new Memory();const journal=new PendingMutation(disk,'a/user');
  const op={id:'1',type:'attendance.mark',payload:{expectedLastEventId:null}};
  await assert.rejects(journal.run(op,false,async()=>({})),/conexión/i);
  assert.equal(disk.values.size,0);
  await assert.rejects(journal.run(op,true,async()=>{throw new Error('lost');}));
  await assert.rejects(journal.run({...op,id:'2'},true,async()=>({})),/pendiente/i);
});
test('scope prevents replay into another server/user and discard removes prior action',async()=>{
  const disk=new Memory();const journal=new PendingMutation(disk,'a/one');
  await assert.rejects(journal.run({id:'1',type:'groups.add',payload:{}},true,async()=>{throw new Error('lost');}));
  assert.equal(await new PendingMutation(disk,'a/two').replay(async()=>{throw new Error('cross user');}),null);
  assert.equal(await new PendingMutation(disk,'b/one').load(),null);
  await journal.discard();assert.equal(await journal.load(),null);
});
test('terminal conflict clears pending; unavailable keeps pending for retry',async()=>{
  const disk=new Memory();const journal=new PendingMutation(disk,'a/user');
  const op={id:'1',type:'attendance.mark',payload:{expectedLastEventId:null}};
  await assert.rejects(journal.run(op,true,async()=>{throw new ProtocolError('CONFLICT','stale');}),/stale/);
  assert.equal(await journal.load(),null);
  await assert.rejects(journal.run(op,true,async()=>{throw new ProtocolError('UNAVAILABLE','later');}));
  assert.deepEqual(await journal.load(),op);
});
test('orders arbitrary precision sequences, deduplicates records and ignores other rooms',()=>{
  const message=(id:string,seq:string,conversationId='room'):Message=>({id,seq,conversationId,senderId:'u',senderName:'Ana',text:id,createdAt:'2026-11-12T00:00:00Z'});
  const a=message('a','9007199254740993'),b=message('b','9007199254740992');
  assert.deepEqual(mergeMessages([a],[b,a,message('other','1','elsewhere')],'room').map(m=>m.id),['b','a']);
});
