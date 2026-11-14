# Mobile implementation task

Own ONLY mobile/ (and its lockfile). Read docs/protocol.md first. Implement the
approved Expo TypeScript Android+iOS app end-to-end against that exact contract.
Use Expo development builds/EAS and support local macOS/Xcode builds as well.
Screens: persistent IP/port configuration; matrícula/PIN login; attendance state,
mark and own paginated history; conversations general/private/group; messages and
paginated recovery; create groups and creator add/remove membership via directory.
Keep UI Spanish, clear and accessible, without speculative libraries/features.

Use react-native-tcp-socket for TLS, with custom public CA TEXT configured by build
env (bundle it rather than resolving PEM assets from Metro HTTP). Native code MUST
validate CA chain, expiration and host/IP SAN. Upstream master iOS TcpSocketClient.m
leaves _checkValidity false by default and its custom-CA branch compares leaf bytes;
Android TcpSocketClient.java doesn't enable endpoint identification. Inspect and
patch the installed version reproducibly (pnpm patch or checked-in patch applied
by config plugin). On iOS use SecTrust anchors + SSL policy with host + evaluation;
on Android ensure peer host is known and enable endpoint verification. Default
rejectUnauthorized true; no blind trust. Never bundle private keys or PINs.

Durable pending mutations saved before sending (AsyncStorage), same request UUID
retried after reconnect/app restart. Namespace server/user; session token in Expo
SecureStore, PIN never stored. No new offline actions. Disable attendance button
while unresolved pending operation; reconcile then fetch state. Catch stale-state
CONFLICT and refresh. Incoming message events deduplicated and ordered by seq;
recover histories by cursors on resume/reconnect to avoid missed live events.
Changing server discards prior session/pending/state; logout prevents cross-user
replay. Handle revoked group access and local-network permission/connectivity errors.

Write meaningful protocol/client/state tests first and observe RED then GREEN.
Do not write framework/source-text tests. Run typecheck and available tests; native
device execution may be unavailable, report limitations precisely. Do not publish,
invoke paid cloud builds, or request secrets. Install deps if possible; sandbox DNS
errors require escalation, don't bypass with another tool.

You are not alone: do not overwrite root/server/docs files or others' edits. No
subagents and no git commits; parent integrates. Report in docs/mobile-report.md
(exception to ownership). Explain tests run and any remaining platform blockers.
