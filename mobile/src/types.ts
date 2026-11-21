export type Role = 'admin' | 'teacher' | 'student';
export type User = {id: string; matricula: string; name: string; role?: Role};
export type Session = {token: string; expiresAt: string; user: User};
export type AttendanceEvent = {
  id: string;
  seq: string;
  type: 'ENTRY' | 'EXIT';
  recordedAt: string;
  classId?: string | null;
};
/** A movement in a class report: who and in which class. */
export type ReportEvent = AttendanceEvent & {matricula: string; name: string; className?: string | null};
export type AttendanceState = {
  lastEvent: AttendanceEvent | null;
  nextType: 'ENTRY' | 'EXIT';
  /** null (or absent on older servers) = the general door. */
  classId?: string | null;
  timezone?: string;
  today?: string;
};
export type Conversation = {
  id: string;
  kind: 'GENERAL' | 'DIRECT' | 'GROUP';
  name: string;
  ownerId: string | null;
  lastSeq: string;
  /** A group with its own attendance (servers with classes). */
  isClass?: boolean;
  peer?: User;
};
export type ClassInfo = Conversation & {isOwner: boolean};
export type Message = {
  id: string;
  conversationId: string;
  seq: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  seen?: boolean;
};
export type Operation = {id: string; type: string; payload: Record<string, unknown>};
export type Server = {host: string; port: number};
/** A queued message the server rejected for good; shown in its thread until dismissed. */
export type FailedMessage = {id: string; text: string; code: string; reason: string};
