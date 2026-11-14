# TCP attendance implementation

Approved scope: Kotlin on JVM 25, TLS TCP only, remote configurable PostgreSQL,
Docker server, Expo TypeScript clients for Android and iPhone. Support EAS and
local macOS/Xcode builds. Attendance is self-service with alternating entry/exit,
matrícula/PIN login, own history and administrator console queries. Messaging
includes durable general, private and creator-managed group conversations.

## Tasks

1. Define and verify the framed JSON protocol and PIN hashing.
2. Implement PostgreSQL migrations, transactional domain operations, TLS server
   and local administration commands. Exercise real PostgreSQL and TLS sockets.
3. Implement Expo screens, durable pending requests, authentication, reconnect,
   history sync and native TLS validation with Android/iOS configuration.
4. Package Docker/Compose, certificate tooling, cloud and local build instructions.
5. Run checks and an independent final code review; fix substantive findings.

## Acceptance

Frames tolerate arbitrary splitting/concatenation and reject malformed input.
Attendance commits exactly once per request even after lost responses/restarts;
concurrent stale state cannot toggle attendance twice. History survives restart.
Authorization protects private/group history, writes and live deliveries.
Certificate chain, expiration and requested IP are validated on both platforms.
No PIN, database credentials or private TLS keys are bundled in the mobile app.
Docker startup validates database and migrations before listening.

External prerequisites: remote PostgreSQL credentials, Expo signing accounts and
an Apple signing identity/device for physical iOS validation. No store publishing.
