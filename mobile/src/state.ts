import type {Message, Operation} from './types.ts';
export class ProtocolError extends Error {code:string;constructor(code:string,message:string){super(message);this.code=code;}}
export interface Storage {getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>}
export class PendingMutation {
  private storage:Storage;
  private key:string;
  private busy=false;
  constructor(storage:Storage,scope:string){this.storage=storage;this.key='pending:'+scope;}
  async load():Promise<Operation|null>{const value=await this.storage.getItem(this.key);return value?JSON.parse(value):null;}
  async discard(){await this.storage.removeItem(this.key);}
  private async settle(op:Operation,send:(op:Operation)=>Promise<unknown>):Promise<any>{
    try{const result=await send(op);await this.discard();return result;}
    catch(error){
      if(error instanceof ProtocolError&&!['UNAVAILABLE','INTERNAL','UNAUTHENTICATED'].includes(error.code)) await this.discard();
      throw error;
    }
  }
  async replay(send:(op:Operation)=>Promise<unknown>):Promise<any>{
    if(this.busy) throw new Error('Operación pendiente en curso');
    this.busy=true;
    try{const op=await this.load();return op?await this.settle(op,send):null;}finally{this.busy=false;}
  }
  async run(op:Operation,online:boolean,send:(op:Operation)=>Promise<unknown>):Promise<any>{
    if(!online) throw new Error('Se requiere conexión para crear acciones');
    if(this.busy) throw new Error('Operación pendiente en curso');
    this.busy=true;
    try{
      if(await this.load()) throw new Error('Resuelve la operación pendiente antes de continuar');
      await this.storage.setItem(this.key,JSON.stringify(op));
      return await this.settle(op,send);
    }finally{this.busy=false;}
  }
}
export function compareSeq(a:string,b:string){return BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;}
export function mergeMessages(a:Message[],b:Message[],room:string):Message[]{
  const seenId=new Set<string>(),seenSeq=new Set<string>();
  return [...a,...b].filter(m=>{
    if(m.conversationId!==room||seenId.has(m.id)||seenSeq.has(m.seq)) return false;
    seenId.add(m.id);seenSeq.add(m.seq);return true;
  }).sort((x,y)=>compareSeq(x.seq,y.seq));
}
