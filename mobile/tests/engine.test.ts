import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../src/engine.ts';
import {ProtocolError} from '../src/state.ts';
import type {Envelope} from '../src/protocol.ts';

class Memory {
  values=new Map<string,string>();
  async getItem(key:string){return this.values.get(key)??null;}
  async setItem(key:string,value:string){this.values.set(key,value);}
  async removeItem(key:string){this.values.delete(key);}
}
const user={id:'u1',matricula:'123',name:'Ana'};
const room={id:'r1',kind:'GENERAL',name:'General',ownerId:null,lastSeq:'0'};
const message=(seq:string)=>({id:'m'+seq,seq,conversationId:'r1',senderId:'u1',senderName:'Ana',text:seq,createdAt:'2026-11-12T00:00:00Z'});
function setup(){
  const storage=new Memory(),secure=new Memory();let onEvent=(e:Envelope)=>{};let onClose=(e:Error)=>{};let id=0;
  const calls:{type:string;payload:any;id:string}[]=[];let closes=0;
  let handler=async(type:string,payload:any):Promise<any>=>{
    if(type.startsWith('auth.'))return {token:'session-secret',expiresAt:'2026-11-13T00:00:00Z',user};
    if(type==='attendance.state')return {lastEvent:null,nextType:'ENTRY'};
    if(type==='attendance.list')return {events:[],nextCursor:null};
    if(type==='conversations.list')return {conversations:[room]};
    if(type==='messages.list')return {messages:[message('1')],nextCursor:null};
    return {};
  };
  const engine=new Engine({storage,secure,uuid:()=>String(++id),connect:async(server,event,close)=>{
    onEvent=event;onClose=close;
    return {closed:false,request:async(type,payload,id)=>{calls.push({type,payload,id});return handler(type,payload);},close:(error)=>{closes++;close(error??new Error('closed'));}};
  }});
  return {engine,storage,secure,calls,get closes(){return closes;},event:(event:Envelope)=>onEvent(event),disconnect:()=>onClose(new Error('lost')),setHandler:(fn:typeof handler)=>{const prior=handler;handler=fn;return prior;}};
}
test('reconnect recovers using the last fetched cursor, never a live event that could skip a gap',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  t.event({v:1,kind:'event',id:'e',type:'message.created',payload:{message:message('4')}});
  t.disconnect();
  let pages=0;
  const base=t.setHandler(async(type,payload)=>{
    if(type==='messages.list'&&payload.after){pages++;assert.equal(payload.after,pages===1?'1':'3');return pages===1?{messages:[message('2'),message('3')],nextCursor:'3'}:{messages:[message('4')],nextCursor:null};}
    return base(type,payload);
  });
  await t.engine.reconnect();
  assert.deepEqual(t.engine.state.messages.r1.map(m=>m.seq),['1','2','3','4']);assert.equal(pages,2);
});
test('attendance conflict refreshes authoritative state and unlocks the pending action',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  const base=t.setHandler(async(type,payload)=>{
    if(type==='attendance.mark')throw new ProtocolError('CONFLICT','actualizar');
    if(type==='attendance.state')return {lastEvent:{id:'e',seq:'1',type:'ENTRY',recordedAt:'2026-11-12T00:00:00Z'},nextType:'EXIT'};
    return base(type,payload);
  });
  await assert.rejects(t.engine.markAttendance(),/actualizar/);
  assert.equal(t.engine.state.attendance?.nextType,'EXIT');assert.equal(t.engine.state.pending,false);
});
test('logout clears token, pending operation, cached messages; new user/server cannot replay it',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  const base=t.setHandler(async(type,payload)=>{if(type==='messages.send')throw new Error('lost');return base(type,payload);});
  await assert.rejects(t.engine.mutate('messages.send',{conversationId:'r1',text:'pendiente'}));
  assert.equal(t.engine.state.pending,true);
  await t.engine.logout();
  assert.equal(t.secure.values.size,0);assert.equal(t.engine.state.session,null);assert.deepEqual(t.engine.state.messages,{});
  assert.equal([...t.storage.values.keys()].some(k=>k.startsWith('pending:')),false);
  await t.engine.configure({host:'192.168.1.9',port:5050});
  assert.equal(t.engine.state.server.host,'192.168.1.9');
});
test('loads every conversation page before removing caches for revoked memberships',async()=>{
  const t=setup();await t.engine.initialize();
  const base=t.setHandler(async(type,payload)=>{
    if(type==='conversations.list')return payload.after?{conversations:[{...room,id:'r2',name:'Segundo'}],nextCursor:null}:{conversations:[room],nextCursor:'r1'};
    if(type==='messages.list')return {messages:[],nextCursor:null};
    return base(type,payload);
  });
  await t.engine.login('123','123456');
  assert.deepEqual(t.engine.state.conversations.map(c=>c.id),['r1','r2']);
  assert.equal(t.calls.filter(c=>c.type==='conversations.list').length,2);
});
test('returns committed mutation success even when its follow-up read loses connectivity',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  let committed=false;
  const base=t.setHandler(async(type,payload)=>{
    if(type==='messages.send'){committed=true;return {message:message('2')};}
    if(committed&&type==='attendance.state')throw new Error('read connection lost');
    return base(type,payload);
  });
  const result=await t.engine.mutate('messages.send',{conversationId:'r1',text:'2'});
  assert.equal(result.message.id,'m2');assert.equal(t.engine.state.pending,false);
  assert.equal(t.engine.state.messages.r1.at(-1)?.id,'m2');
  assert.match(t.engine.state.error,/read connection lost/);
});
test('a membership change during recovery queues a trailing authoritative refresh',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  let listCalls=0,release:()=>void=()=>{},entered:()=>void=()=>{};
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const base=t.setHandler(async(type,payload)=>{
    if(type==='conversations.list'){
      listCalls++;return {conversations:listCalls===1?[room]:[room,{...room,id:'r2',name:'nuevo'}],nextCursor:null};
    }
    if(type==='messages.list'&&listCalls===1){entered();await blocked;return {messages:[],nextCursor:null};}
    if(type==='messages.list')return {messages:[],nextCursor:null};
    return base(type,payload);
  });
  const refreshing=t.engine.refreshConversations();await started;
  t.event({v:1,kind:'event',id:'membership',type:'conversations.changed',payload:{}});
  release();await refreshing;
  assert.deepEqual(t.engine.state.conversations.map(c=>c.id),['r1','r2']);assert.equal(listCalls,2);
});
test('attendance events and delayed state responses cannot roll back a newer sequence',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  const state=(seq:string,type:'ENTRY'|'EXIT')=>({lastEvent:{id:'a'+seq,seq,type,recordedAt:'2026-11-12T00:00:00Z'},nextType:type==='ENTRY'?'EXIT':'ENTRY'});
  let release:(value:any)=>void=()=>{};
  const stale=new Promise(resolve=>{release=resolve;});
  const base=t.setHandler(async(type,payload)=>type==='attendance.state'?stale:base(type,payload));
  const reading=t.engine.refreshAttendance();
  t.event({v:1,kind:'event',id:'new',type:'attendance.changed',payload:state('3','ENTRY')});
  t.event({v:1,kind:'event',id:'old',type:'attendance.changed',payload:state('1','ENTRY')});
  release(state('2','EXIT'));await reading;
  assert.equal(t.engine.state.attendance?.lastEvent?.seq,'3');assert.equal(t.engine.state.attendance?.nextType,'EXIT');
});
test('active socket auth expiry prompts login, deletes token, preserves same-user pending UUID for resume',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  const base=t.setHandler(async(type,payload)=>{
    if(type==='messages.send')throw new ProtocolError('UNAUTHENTICATED','sesión vencida');
    return base(type,payload);
  });
  await assert.rejects(t.engine.mutate('messages.send',{conversationId:'r1',text:'2'}),/sesión vencida/);
  assert.equal(t.engine.state.needsLogin,true);assert.equal(t.engine.state.online,false);assert.equal(t.secure.values.size,0);
  const pending=JSON.parse([...t.storage.values.entries()].find(([key])=>key.startsWith('pending:'))![1]);
  t.setHandler(async(type,payload)=>type==='messages.send'?{message:message('2')}:base(type,payload));
  await t.engine.login('123','123456');
  const attempts=t.calls.filter(c=>c.type==='messages.send');
  assert.equal(attempts.length,2);assert.equal(attempts[1].id,pending.id);assert.equal(t.engine.state.pending,false);
  assert.equal(t.engine.state.needsLogin,false);
});
test('background refresh and older pages retain the selected attendance dates and matching cursor',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  const base=t.setHandler(async(type,payload)=>type==='attendance.list'?{events:[],nextCursor:payload.before?null:'77'}:base(type,payload));
  await t.engine.loadAttendance(false,{from:'2026-10-01',to:'2026-10-31'});
  await t.engine.refresh();await t.engine.loadAttendance(true);
  const requests=t.calls.filter(call=>call.type==='attendance.list').slice(-3).map(call=>call.payload);
  assert.deepEqual(requests,[
    {limit:50,from:'2026-10-01',to:'2026-10-31'},
    {limit:50,from:'2026-10-01',to:'2026-10-31'},
    {limit:50,from:'2026-10-01',to:'2026-10-31',before:'77'},
  ]);
});
test('late attendance pages from a superseded date range cannot mix into the active history',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  let release:(result:any)=>void=()=>{};
  const pending=new Promise(resolve=>{release=resolve;});
  const base=t.setHandler(async(type,payload)=>{
    if(type==='attendance.list'&&payload.from==='2026-10-01')return pending;
    if(type==='attendance.list')return {events:[{id:'new',seq:'2',type:'EXIT',recordedAt:'2026-11-12T00:00:00Z'}],nextCursor:'2'};
    return base(type,payload);
  });
  const old=t.engine.loadAttendance(false,{from:'2026-10-01',to:'2026-10-31'});
  await t.engine.loadAttendance(false,{from:'2026-11-01'});
  release({events:[{id:'old',seq:'1',type:'ENTRY',recordedAt:'2026-10-12T00:00:00Z'}],nextCursor:'1'});await old;
  assert.deepEqual(t.engine.state.events.map(e=>e.id),['new']);assert.equal(t.engine.state.attendanceCursor,'2');
});
test('read auth failures also prompt login and clear the invalid secure token',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  const base=t.setHandler(async(type,payload)=>type==='users.list'?Promise.reject(new ProtocolError('UNAUTHENTICATED','caducó')):base(type,payload));
  await assert.rejects(t.engine.query('users.list'),/caducó/);
  assert.equal(t.engine.state.needsLogin,true);assert.equal(t.engine.state.online,false);assert.equal(t.secure.values.size,0);
});
test('a new connection can refresh membership independently of an old blocked recovery generation',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  let release:()=>void=()=>{},entered:()=>void=()=>{};
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{entered=resolve;});
  let block=true,listCalls=0;
  const base=t.setHandler(async(type,payload)=>{
    if(type==='conversations.list'){listCalls++;return {conversations:listCalls===1?[room]:[room,{...room,id:'r2'}],nextCursor:null};}
    if(type==='messages.list'&&block){block=false;entered();await blocked;return {messages:[],nextCursor:null};}
    if(type==='messages.list')return {messages:[],nextCursor:null};
    return base(type,payload);
  });
  const old=t.engine.refreshConversations();const oldRejected=assert.rejects(old,/cancelada/);await started;
  t.disconnect();const reconnect=t.engine.reconnect();
  // Let resume and both attendance reads finish before releasing the old socket.
  await new Promise(resolve=>setTimeout(resolve,0));
  release();await oldRejected;await reconnect;
  assert.deepEqual(t.engine.state.conversations.map(c=>c.id),['r1','r2']);
});
test('logout clears local identity immediately but lets server revocation finish before closing its old socket',async()=>{
  const t=setup();await t.engine.initialize();await t.engine.login('123','123456');
  let release:()=>void=()=>{};
  const acknowledgement=new Promise<void>(resolve=>{release=resolve;});
  const base=t.setHandler(async(type,payload)=>type==='auth.logout'?acknowledgement:base(type,payload));
  await t.engine.logout();
  assert.equal(t.engine.state.session,null);assert.equal(t.secure.values.size,0);
  assert.equal(t.closes,0);
  release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(t.closes,1);
});
test('a lost acknowledgement reports which operation is pending until reconnection settles it',async()=>{
  const t=setup();await t.engine.login('123','123456');
  const prior=t.setHandler(async(type,payload)=>{if(type==='attendance.mark')throw new Error('lost');return prior(type,payload);});
  await assert.rejects(t.engine.markAttendance());
  assert.equal(t.engine.state.pending,true);assert.equal(t.engine.state.pendingType,'attendance.mark');
  t.setHandler(async(type,payload)=>type==='attendance.mark'?{event:{id:'e1',seq:'1',type:'ENTRY',recordedAt:'2026-11-12T00:00:00Z'},nextType:'EXIT'}:prior(type,payload));
  await t.engine.reconnect();
  assert.equal(t.engine.state.pending,false);assert.equal(t.engine.state.pendingType,null);
});
test('failures expose a stable code for the interface and can be dismissed',async()=>{
  const t=setup();
  const prior=t.setHandler(async(type,payload)=>{if(type==='auth.login')throw new ProtocolError('INVALID_CREDENTIALS','Credenciales inválidas');return prior(type,payload);});
  await assert.rejects(t.engine.login('123','000000'));
  assert.equal(t.engine.state.errorCode,'INVALID_CREDENTIALS');assert.equal(t.engine.state.session,null);
  t.engine.clearError();assert.equal(t.engine.state.error,'');assert.equal(t.engine.state.errorCode,'');
  t.setHandler(prior);await t.engine.login('123','123456');
  t.disconnect();await assert.rejects(t.engine.query('ping'));
  t.engine.report(await t.engine.query('ping').catch(error=>error));
  assert.equal(t.engine.state.errorCode,'CONNECT_OFFLINE');
});
