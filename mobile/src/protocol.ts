// Use the same browser implementation in Hermes and Node-based protocol tests.
import {Buffer} from 'buffer/index.js';

export type Envelope={v:1;kind:'request'|'response'|'event';id:string;type:string;payload:Record<string,unknown>};
export function encodeFrame(value:unknown):Buffer {
  const body=Buffer.from(JSON.stringify(value),'utf8');
  if(body.length<1||body.length>65536) throw new Error('Invalid frame length');
  const header=Buffer.alloc(4);header.writeUInt32BE(body.length,0);
  return Buffer.concat([header,body]);
}

export class FrameDecoder {
  private pending=Buffer.alloc(0);
  push(bytes:Uint8Array):Envelope[]{
    this.pending=Buffer.concat([this.pending,Buffer.from(bytes)]);
    const result:Envelope[]=[];
    while(this.pending.length>=4){
      const length=this.pending.readUInt32BE(0);
      if(length<1||length>65536) throw new Error('Invalid frame length');
      if(this.pending.length<length+4) break;
      const body=this.pending.slice(4,4+length);
      const json=body.toString('utf8');
      if(!Buffer.from(json,'utf8').equals(body)) throw new Error('Invalid UTF-8');
      const value=JSON.parse(json);
      if(!value||value.v!==1||!['request','response','event'].includes(value.kind)||typeof value.id!=='string'||typeof value.type!=='string'||!value.payload||typeof value.payload!=='object'||Array.isArray(value.payload)) throw new Error('Invalid protocol envelope');
      result.push(value);
      this.pending=this.pending.slice(4+length);
    }
    return result;
  }
}
