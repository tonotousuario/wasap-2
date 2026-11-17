import type {Message, Operation} from './types.ts';
export class ProtocolError extends Error {code:string;constructor(code:string,message:string){super(message);this.code=code;}}
// Only these server answers mean the operation may still succeed with the same UUID.
// Any other server error (including INTERNAL) is final: the server never committed it.
export const RETRYABLE_CODES=['UNAVAILABLE','UNAUTHENTICATED'];
export function isTerminal(error:unknown):boolean{return error instanceof ProtocolError&&!RETRYABLE_CODES.includes(error.code);}
export interface Storage {getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>}
export const OUTBOX_LIMIT=20;
/**
 * Durable, ordered journal of mutations sent but not yet resolved. Messages queue (up to
 * OUTBOX_LIMIT, sent one at a time in order); any other mutation is exclusive: it can only start
 * with the journal empty, and no message can be queued behind it. The whole array lives under a
 * single key so every write is atomic. A legacy single pending operation is migrated on load.
 */
export class Outbox {
  private storage:Storage;
  private key:string;
  private legacy:string;
  private lock:Promise<unknown>=Promise.resolve();
  constructor(storage:Storage,scope:string){this.storage=storage;this.key='outbox:'+scope;this.legacy='pending:'+scope;}
  // Serialize read-modify-write cycles so concurrent enqueue/remove cannot lose entries.
  private exclusive<T>(task:()=>Promise<T>):Promise<T>{const run=this.lock.then(task,task);this.lock=run.catch(()=>{});return run;}
  private async read():Promise<Operation[]>{
    const value=await this.storage.getItem(this.key);
    if(value)return JSON.parse(value);
    const legacy=await this.storage.getItem(this.legacy);
    if(!legacy)return [];
    const ops=[JSON.parse(legacy) as Operation];
    await this.storage.setItem(this.key,JSON.stringify(ops));await this.storage.removeItem(this.legacy);
    return ops;
  }
  load():Promise<Operation[]>{return this.exclusive(()=>this.read());}
  /** Saves [op] durably before it is sent; throws if it may not start now. */
  enqueue(op:Operation,online:boolean):Promise<Operation[]>{
    return this.exclusive(async()=>{
      if(!online)throw new Error('Se requiere conexión para crear acciones');
      const ops=await this.read();
      if(op.type==='messages.send'){
        if(ops.some(item=>item.type!=='messages.send'))throw new Error('Resuelve la operación pendiente antes de continuar');
        if(ops.length>=OUTBOX_LIMIT)throw new Error(`Hay ${OUTBOX_LIMIT} mensajes esperando confirmación; espera a que el servidor responda`);
      }else if(ops.length)throw new Error('Resuelve la operación pendiente antes de continuar');
      const next=[...ops,op];
      await this.storage.setItem(this.key,JSON.stringify(next));
      return next;
    });
  }
  remove(id:string):Promise<Operation[]>{
    return this.exclusive(async()=>{
      const next=(await this.read()).filter(op=>op.id!==id);
      if(next.length)await this.storage.setItem(this.key,JSON.stringify(next));else await this.storage.removeItem(this.key);
      return next;
    });
  }
  discard():Promise<void>{return this.exclusive(async()=>{await this.storage.removeItem(this.key);await this.storage.removeItem(this.legacy);});}
}
export function compareSeq(a:string,b:string){return BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;}
export function mergeMessages(a:Message[],b:Message[],room:string):Message[]{
  const seenId=new Set<string>(),seenSeq=new Set<string>();
  return [...a,...b].filter(m=>{
    if(m.conversationId!==room||seenId.has(m.id)||seenSeq.has(m.seq)) return false;
    seenId.add(m.id);seenSeq.add(m.seq);return true;
  }).sort((x,y)=>compareSeq(x.seq,y.seq));
}
