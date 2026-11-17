# WASAP TCP protocol v1

All application traffic uses TLS 1.2 or newer over TCP. Default port: 5050.
Each frame is `uint32 big-endian byte length | UTF-8 JSON`, length 1..65536.
Decode UTF-8 only after assembling the complete byte frame; invalid UTF-8 is an error.

Request: `{ "v":1, "kind":"request", "id":"UUID", "type":"auth.login", "payload":{} }`.
Response reuses `id`, has `kind:"response"`, `type:"success"` and result in `payload`,
or `type:"error"`, `payload:{code,message}`. Event: `kind:"event"`, fresh UUID `id`,
`type:"message.created"|"conversations.changed"|"attendance.changed"`, `payload`.
Malformed framing closes the socket. Semantic errors return an error response.
Errors: VALIDATION, UNAUTHENTICATED, INVALID_CREDENTIALS, RATE_LIMITED, FORBIDDEN,
NOT_FOUND, CONFLICT, REQUEST_ID_REUSED, INTERNAL, UNAVAILABLE, UNSUPPORTED_VERSION.

Retry semantics for mutations. Only two codes mean the same request UUID may still
succeed later; clients keep the pending mutation and resend it unchanged:
- `UNAVAILABLE`: transient database failure (SQLSTATE class 08 connection, 40
  serialization/deadlock, 53 insufficient resources, 57 cancellation/operator, or no
  pooled connection in time). Nothing was committed.
- `UNAUTHENTICATED`: sign in again as the same user, then resend.
Every other error is final and the client discards the pending mutation. In particular
`INTERNAL` covers deterministic failures (constraint violations, invalid data, bugs):
nothing was committed and resending the same request would fail again. Error messages
never include database text.

## Operations

All payloads/results below are JSON objects. UUID strings identify users,
conversations, requests and attendance events. Sequence values are decimal strings
to avoid JavaScript integer overflow. Instants are ISO-8601 UTC strings.

| Type | Payload | Success payload |
| --- | --- | --- |
| ping | `{}` | `{ready:true}` |
| auth.login | `{matricula,pin}` | `{token,expiresAt,user:{id,matricula,name}}` |
| auth.resume | `{token}` | `{token,expiresAt,user:{id,matricula,name}}` |
| auth.logout | `{}` | `{}` |
| users.list | `{query?:string}` | `{users:[{id,matricula,name}]}` (max 100) |
| attendance.state | `{}` | `{lastEvent:Event|null,nextType:"ENTRY"|"EXIT",timezone?:string,today?:"YYYY-MM-DD"}` |
| attendance.mark | `{expectedLastEventId:UUID|null}` | `{event:Event,nextType}` |
| attendance.list | `{before?:string,limit?:number,from?:"YYYY-MM-DD",to?:"YYYY-MM-DD"}` | `{events:[Event],nextCursor:string|null}` |
| conversations.list | `{after?:UUID,limit?:number}` | `{conversations:[Conversation],nextCursor:UUID|null}` (id ASC) |
| conversations.direct | `{matricula}` | `{conversation:Conversation}` |
| groups.create | `{name,matriculas:string[]}` | `{conversation:Conversation}` |
| groups.members | `{conversationId}` | `{members:[{id,matricula,name}]}` |
| groups.add | `{conversationId,matricula}` | `{}` |
| groups.remove | `{conversationId,matricula}` | `{}` |
| messages.list | `{conversationId,before?:string,after?:string,limit?:number}` | `{messages:[Message],nextCursor:string|null}` |
| messages.send | `{conversationId,text}` | `{message:Message}` |

`Event={id,seq,type:"ENTRY"|"EXIT",recordedAt}`.
`Conversation={id,kind:"GENERAL"|"DIRECT"|"GROUP",name,ownerId:UUID|null,lastSeq:string,peer?:{id,matricula,name}}`.
`peer` identifies the other member of a DIRECT conversation from the requesting
user's perspective; it is absent for GENERAL and GROUP. It is returned by
`conversations.list` and `conversations.direct`. Older stored mutation replies may
omit it. `groups.members` also accepts a DIRECT conversation owned by the caller.
`Message={id,conversationId,seq,senderId,senderName,text,createdAt}`.
Attendance lists are newest first (`before` is exclusive seq); message lists are
ascending, returning the most recent page when no cursor is provided, older pages
with `before`, and earliest unseen pages with `after`. Do not send both cursors.
Limits default 50, maximum 100. `nextCursor` is the last pagination boundary when
more rows remain (first seq for backwards pagination, last seq for forwards).
Date filters are inclusive dates in APP_TIMEZONE (default America/Mexico_City).
`attendance.state` supplies that IANA `timezone` and the server's current local
`today` date. Refresh it before choosing relative date filters; no new attendance
movement is needed for the calendar date to change. Clients of older servers may
fall back to the device calendar when these optional fields are absent.
Message and conversation pages can be shorter than the requested limit to fit the byte budget;
always follow nextCursor. Messages contain 1–4000 UTF-16 code units after trimming.
Groups contain at most 100 current members including their creator.

`message.created` carries `{message:Message}`. `attendance.changed` carries
`{lastEvent:Event,nextType,timezone?:string,today?:"YYYY-MM-DD"}` only to that user's authenticated sockets.
`conversations.changed` carries `{}` and means refresh conversation membership/list.
It is sent only to users affected by the operation: the members of the conversation
after `conversations.direct` or a group mutation and, for `groups.remove`, the removed
member.
Clients always query histories after reconnect, and deduplicate by record id/seq.

## Guarantees

Identity always comes from the authenticated connection. Tokens are 256 random bits.
Sessions last 24h and are stored in PostgreSQL, so they survive server restarts; only
the SHA-256 of each token is stored, never the token itself. At most five sessions
per account are kept: a sixth login drops the one that expires soonest. Expired
sessions are purged hourly. PINs are 6–12 ASCII digits, hashed with salted
PBKDF2-HMAC-SHA256 (600000 iterations).

Resetting a PIN (`admin users reset-pin`) or `admin users logout` deletes the user's
sessions in the database: `auth.resume` with an old token fails immediately. The
server reconfirms each live session against the database at most once every 5
seconds, so sockets already authenticated with a deleted session stop being served
within 5 seconds: their next request answers UNAUTHENTICATED and no further events
are written to them.

For `attendance.mark`, `conversations.direct`, all group mutations, and
`messages.send`, the request UUID is the durable operation key scoped to the user.
Store the payload and result atomically with the effect. These records are kept for
`PROCESSED_REQUEST_RETENTION_DAYS` (30 by default) and purged hourly afterwards; a
client must reconcile a pending mutation within that period, since a retry of a
purged request would be applied again. Retries with identical
request content return the original result; UUID reuse with other content errors.
Clients durably save pending mutations BEFORE writing them and reuse their UUID
after lost acknowledgements/restarts, until reconciled. Do not create new actions
offline. Never carry a pending action to a different authenticated user/server.

Attendance locks the user row, checks expectedLastEventId, and appends the inverse
of the last type (first ENTRY). A stale expectation errors CONFLICT. There is no
midnight reset. Server/database time is authoritative. All writes acknowledge only
after commit. Messages use per-conversation transaction-ordered sequence numbers.

General chat is available to all users. Direct membership is immutable. Groups
have a single immutable creator, who is always a member and alone manages members.
Current members see the full group history. Removal immediately denies requests and
new deliveries; already displayed/downloaded text cannot be recalled. No transfer,
group deletion, message edits/deletes, attachments, push, or offline creation in v1.

History/member reads hold a shared conversation lock through fetching their rows.
Sensitive queued frames are bound to the authenticated user and reauthorize identity
and group membership immediately before the TLS write, in a short database check that
finishes before writing starts. No database connection, transaction or lock is held
while writing to a socket, so a client that stops reading only delays its own socket.
A frame whose check happens after a removal commits is never delivered to the removed
member; a frame checked just before the removal may still be written, like bytes
already queued in TCP buffers. Identity switches serialize with writes; obsolete
queued frames are discarded. Writes have a 10-second deadline, and a socket whose
queue of 128 frames fills is closed. Bytes already written cannot be recalled.

TLS uses an installation CA bundled as public PEM text, not fetched over HTTP.
Never set rejectUnauthorized=false. Native validation must check chain, validity
and SAN for configured host/IP. Server private keystore stays server-side. New
server IPs require a new leaf certificate signed by the same CA.
