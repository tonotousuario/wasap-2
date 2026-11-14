# Implementation ledger — docs/implementation-plan.md

- Baseline: README and LICENSE only; clean main branch, no existing tests.
- Contract: docs/protocol.md is the shared server/mobile source of truth.
- Ruling: work on a feature branch in the existing authorized checkout; no extra
  worktree or changes outside the workspace are necessary.
- Tooling: only JRE25 is installed, no Gradle/JDK/Android SDK/Xcode. Download build
  tools into /tmp. Podman needs host permissions to operate its rootless runtime.
- Context7 configured but tools unavailable; official upstream docs used instead.
- Server/protocol/persistence and packaging implemented; final mobile/native checks
  are tracked in docs/mobile-report.md.
- Server first checks: 3 unit + 8 PostgreSQL/TLS integration tests passed.
- Wire-budget regression: two new tests failed for oversized Unicode histories
  and unpaginated conversations. Added bounded message pages and conversation cursors.
- Ruling: cap v1 groups at 100 current members so membership replies stay within
  the 64KiB protocol ceiling; return an explicit validation error at the boundary.
- Compose runs as the operator's non-root uid/gid to read private bind mounts
  without making certificates/database secret files world readable.
- Review C1: fixed read-committed revocation race with shared conversation locks
  for history/member reads and protected writes. Queued frames carry recipient
  identity and conversation, revalidate at output, and serialize with identity
  changes; ten-second write deadline bounds lock holding by slow peers.
- Review I3: replayed attendance hints now contain current authoritative state,
  independently of the durable historical response returned to the requester.
- Review M1: administrator/group names reject control characters so fixed-size
  directory pages cannot expand beyond the frame budget through JSON escaping.
- Final server suite: 3 unit and 11 real PostgreSQL/TLS integration tests pass,
  including concurrency/removal barriers and replayed attendance notifications.
- Infrastructure diagnosis: PostgreSQL stayed healthy but rootless Podman pasta
  lost its forwarded port after temporary-storage exhaustion. Restarting only
  the disposable database restored localhost:55432; this was not a schema failure.
- Real mobile RpcClient-to-JVM TLS smoke passed login, attendance retry,
  private messaging, group removal/authorization and logout.
- Gradle distribution checksum checked against the official published value;
  wrapper now pins SHA256 and uses a 60-second download timeout.
- Final mobile verification: 25 behavioral tests and TypeScript pass. See
  docs/mobile-report.md for exact native-build and export limitations.
- Final server image built successfully; full RPC smoke passed on the earlier
  running image. The final image restart/smoke was interrupted, so that exact
  image's runtime verification is pending.
- Cleanup verified: parent stopped only wasap-smoke-server and wasap-test-pg.
- No commits, merges, pushes, cloud builds or publication were performed.

## Actualización — 14 de noviembre de 2026

El texto anterior es un registro histórico. El proyecto ya está integrado en
main y tiene commits. La evidencia actual se concentra en
[verification.md](verification.md), con capturas reales y pendientes explícitos.

- Backend añade peer en privados y timezone/today en asistencia.
- Cliente usa el calendario del servidor y conserva compatibilidad anterior.
- Última ejecución de implementación: 40 pruebas móviles, typecheck y 16 pruebas
  de servidor aprobadas.
- Compose local incorpora PostgreSQL persistente y servidor; el healthcheck de
  la imagen final desplegada pasó.
- Dentro/Fuera con historial se verificaron mediante dos marcas autorizadas.
- No hay aprobación visual global ni verificación iPhone/dos dispositivos.
