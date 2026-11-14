export type User={id:string;matricula:string;name:string};
export type Session={token:string;expiresAt:string;user:User};
export type AttendanceEvent={id:string;seq:string;type:'ENTRY'|'EXIT';recordedAt:string};
export type AttendanceState={lastEvent:AttendanceEvent|null;nextType:'ENTRY'|'EXIT';timezone?:string;today?:string};
export type Conversation={id:string;kind:'GENERAL'|'DIRECT'|'GROUP';name:string;ownerId:string|null;lastSeq:string;peer?:User};
export type Message={id:string;conversationId:string;seq:string;senderId:string;senderName:string;text:string;createdAt:string};
export type Operation={id:string;type:string;payload:Record<string,unknown>};
export type Server={host:string;port:number};
