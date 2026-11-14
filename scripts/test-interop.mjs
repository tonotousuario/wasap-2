// Run ONLY against a disposable localhost instance with SMOKE_A/123456 and
// SMOKE_B/654321 provisioned. This test deliberately creates attendance/chat data.
import tls from 'node:tls';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RpcClient} from '../mobile/src/client.ts';

const port = Number(process.env.WASAP_SMOKE_PORT);
const ca = fs.readFileSync(process.env.WASAP_SMOKE_CA, 'utf8');
assert(Number.isInteger(port) && port > 0 && port <= 65535, 'Set WASAP_SMOKE_PORT');
const opened = [];
async function connect() {
  const events = [];
  return await new Promise((resolve, reject) => {
    let rpc;
    const socket = tls.connect({host:'127.0.0.1',port,ca,minVersion:'TLSv1.2',rejectUnauthorized:true}, () => {
      rpc = new RpcClient({write:bytes=>socket.write(bytes),destroy:()=>socket.destroy()},event=>events.push(event),()=>{});
      opened.push(rpc);
      resolve({rpc,events,request:(type,payload={},id=randomUUID())=>rpc.request(type,payload,id)});
    });
    socket.on('data',bytes=>rpc?.receive(bytes));
    socket.on('error',error=>rpc ? rpc.close(error) : reject(error));
    socket.on('close',()=>rpc?.close());
  });
}

try {
  const a = await connect(), b = await connect();
  await a.request('auth.login',{matricula:'SMOKE_A',pin:'123456'});
  await b.request('auth.login',{matricula:'SMOKE_B',pin:'654321'});
  const state = await a.request('attendance.state');
  const attendanceId = randomUUID();
  const attendancePayload = {expectedLastEventId:state.lastEvent?.id ?? null};
  const marked = await a.request('attendance.mark',attendancePayload,attendanceId);
  assert.deepEqual(await a.request('attendance.mark',attendancePayload,attendanceId),marked);
  assert.equal(marked.event.type,state.nextType);

  const direct = (await a.request('conversations.direct',{matricula:'SMOKE_B'})).conversation;
  const messageId = randomUUID();
  const messagePayload = {conversationId:direct.id,text:'Prueba real JavaScript → Kotlin 👋'};
  const sent = await a.request('messages.send',messagePayload,messageId);
  assert.deepEqual(await a.request('messages.send',messagePayload,messageId),sent);
  const history = await b.request('messages.list',{conversationId:direct.id});
  assert.equal(history.messages.filter(message=>message.id===sent.message.id).length,1);

  const group = (await a.request('groups.create',{name:'Interoperabilidad',matriculas:['SMOKE_B']})).conversation;
  await a.request('messages.send',{conversationId:group.id,text:'Antes de retirar al integrante'});
  assert.equal((await b.request('messages.list',{conversationId:group.id})).messages.length,1);
  await a.request('groups.remove',{conversationId:group.id,matricula:'SMOKE_B'});
  const privateMessage = (await a.request('messages.send',{conversationId:group.id,text:'Solo para miembros actuales'})).message;
  await a.request('ping');
  await b.request('ping');
  await assert.rejects(b.request('messages.list',{conversationId:group.id}),error=>error.code==='FORBIDDEN');
  assert(!b.events.some(event=>event.payload?.message?.id===privateMessage.id));
  await a.request('auth.logout');
  await assert.rejects(a.request('attendance.state'),error=>error.code==='UNAUTHENTICATED');
  console.log('Interop passed: real mobile RPC ↔ JVM TLS, login, attendance replay, private chat, groups, removal and logout.');
} finally { for (const rpc of opened) rpc.close(); }
