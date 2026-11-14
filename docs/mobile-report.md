# Mobile implementation and verification

Implemented `mobile/` with Expo SDK 58.0.25, React Native 0.88.1 and a locked npm dependency tree. Spanish screens cover persistent server IP/port, matrícula/PIN authentication, attendance state/mark/history with inclusive date filters, paginated conversations and messages, private conversations, group creation, user directory and creator-only membership management. EAS development/simulator/preview profiles and local Android/macOS/Xcode workflows are documented in [mobile/README.md](../mobile/README.md).

The client implements the shared length-prefixed TLS protocol, rejects malformed framing/UTF-8, correlates responses, closes uncertain timed-out connections, persists mutations before sending and retains their original UUID through reconnection/restart. Journal keys include server/user; session tokens use SecureStore and PINs are never persisted. Logout/server changes clear local sessions, pending actions and downloaded state. Logout lets an online server acknowledge revocation before closing the detached old socket while local clearing completes immediately.

Reconnection recovers all conversation pages and every room's messages by fetched cursors. Live events do not advance recovery boundaries; IDs/sequences deduplicate and sort without numeric precision loss. Membership invalidations queue trailing refreshes, with independent refresh promises for new connection generations. Revoked groups disappear from current app caches. Attendance changes/state reads are monotonic by sequence; conflicts refresh server state. Auth failures on reads and writes require login, clear the invalid secure token and preserve same-user pending replay. Selected attendance date filters remain attached to history/cursors, and obsolete pages cannot overwrite a newer date selection. Confirmed mutation success is independent of subsequent cache-read failures, preventing duplicate user retries.

## Native TLS

The pinned `react-native-tcp-socket` 6.4.3 source was inspected and patched reproducibly. `npm ci` and the Expo config plugin apply/verify the checked-in patch with exact upstream/patched SHA-256 checksums. No host `patch` program is required. iOS uses CA trust anchors, the configured-host SSL policy and `SecTrustEvaluateWithError` instead of upstream leaf-byte comparison/uninitialized validation state. Android retains the original peer host on a layered socket, enables HTTPS endpoint identification and the CA TrustManager, and excludes blind-trust/client-key branches. Both require TLS 1.2 or newer. The patch also supplies the Android library namespace required by current AGP.

Build-time `WASAP_CA_PEM` is exactly one PUBLIC installation CA certificate. It is embedded as PEM text in Expo configuration and passed directly to TLS; it is never resolved from a Metro HTTP asset. Private keys and leaf certificates are rejected by configuration. Verification used an ephemeral test-only CA in `/tmp`, not a production installation CA; neither that key nor certificate is checked into the project.

## Completed checks

- `npm test`: **25 passed, 0 failed**, after the final logout change. Meaningful behavior tests cover byte framing/fragmentation/coalescing, UTF-8 rejection/size boundaries, RPC response correlation/errors/timeout, save-before-send, lost-acknowledgement restart/retry, offline/overlapping actions, user/server isolation, terminal/transient errors, sequence precision, recovery gaps/pagination, membership invalidation/generation races, committed-write/read-failure separation, attendance conflicts/order/date filters, read/write auth expiry and logout revocation ordering.
- Regression tests were observed failing before their production fixes, then passing; initial protocol/journal/RPC/state tests likewise went through RED → GREEN. No framework/source-text tests were substituted for behavior tests.
- `npm run typecheck`: passed after all final changes.
- `npx expo config --type public --json`: passed with the ephemeral public test CA.
- `npx expo prebuild --no-install`: successfully generated Android and iOS projects and applied native config/patches. Expo emitted a non-fatal `expo-system-ui` suggestion for the light UI preference.
- `npx expo export --platform android --platform ios`: completed successfully earlier, producing both Hermes bundles (approximately 1.7 MB each). A later rerun after review fixes stopped at Metro startup amid native-build resource pressure and has no completion evidence; the final revision is typechecked/tested, but a fresh final export remains to be rerun on a normally resourced build machine.
- Native patch application verified from pristine installed files and on repeated invocation; checksum guards accepted the correctly patched state.
- `git check-ignore` confirms generated `android/`, `ios/`, `dist/` and `.native-cache/` are ignored. No APK, signing material or native caches are intended for version control.

## Native Android attempt and limits

Downloaded Google's official command-line tools (archive SHA-256 matched the published checksum), Android Platform 37.0, Build Tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1 and Gradle 9.4.1. The first Gradle attempt failed with `Disk quota exceeded` in its `/tmp` cache. Retried using the ignored workspace Gradle cache; the SDK stayed in `/tmp`. Extracted-download archives were removed to release quota while keeping the SDK/active caches.

The retry successfully executed **`:react-native-tcp-socket:compileDebugJavaWithJavac` and `:react-native-tcp-socket:bundleLibCompileToJarDebug`**, along with native resource/autolinking and several Expo compile tasks. This establishes Java compilation of the actual patched TLS implementation against the generated Android project.

**No APK was produced, and a full native Android build is not verified.** The build session became unavailable (`write_stdin: Unknown process id`) and `/tmp/wasap-mobile-native-build.log` ends at `:expo-dev-menu:compileDebugKotlin` without `BUILD SUCCESSFUL` or a conclusive failure trailer. At inspection the host had approximately 13/15 GiB RAM in use and essentially all 8 GiB swap occupied. This indicates resource pressure, but kernel/OOM attribution could not be confirmed because the host process/kernel inspection was interrupted. No additional native builds or installs were started after the finalization instruction.

iOS native compilation cannot run on this Linux host: macOS/Xcode/CocoaPods/device signing and an actual iPhone/simulator remain required. Neither platform's real TLS handshake, chain/expiration/SAN negative cases, runtime local-network permission flow, accessibility layout or device lifecycle was executed. The physical-device checklist in `mobile/README.md` specifies correct-CA, wrong-CA, expired/not-yet-valid, wrong/missing-SAN, offline/restart/lost-ack, pagination/revocation and permission tests before distribution. There was no cloud build, paid submission or publication.

`npm audit --omit=dev` with the network-enabled registry reported three moderate affected packages: `minimatch`, `@expo/fingerprint`, and `expo`, through [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). npm's automated fix proposed downgrading to Expo 52; no incompatible forced downgrade was applied. A later offline lockfile-only install printed zero vulnerabilities because it had no fresh registry audit; that does not supersede the actual network audit finding.

Context7 was searched for at implementation start but was unavailable then. Installed package sources and official Expo/Android/Apple documentation were used as the permitted fallback. Server integration/build results belong to the parent/server agent and are not inferred from these mobile checks.

## Verificación posterior — 14 de noviembre de 2026

Este apartado aporta evidencia posterior a los intentos de compilación anteriores;
las limitaciones de esos intentos no describen la app Android instalada hoy.

Se abrió el build existente de WASAP en emulator-5554, se cargó el código actual
con Metro y se conectó al servidor TCP/TLS local mediante adb reverse.
Se observó el aviso de sesión vencida tras reiniciar el servidor y se inició
sesión como DEMO002. Con autorización del usuario se registró una entrada y una
salida: 2026-11-14T19:34:06.997118Z y 2026-11-14T19:34:30.595020Z.
La consulta administrativa confirmó exactamente esos dos movimientos para la
cuenta. Se capturaron Dentro, Fuera, confirmación e historial.

Capturas versionadas: [Dentro](images/android-attendance-inside.png) y [Fuera](images/android-attendance-outside.png). Revisión
independiente: Dentro/Fuera resueltos visualmente; chips legibles y selección
visible. El selector de fechas desborda hacia un carril horizontal; no se probó
su interacción en esta pasada. No hay aprobación global de diseño.

Siguen sin verificarse en esta pasada: burbuja pendiente y recuperación tras
corte durante envío, pantalla de integrantes, texto ampliado, iPhone, tema
oscuro y entrega simultánea en dos dispositivos. Icono/splash y animaciones
propias siguen pendientes. No se realizaron pruebas negativas de TLS.

Se validó app.config.ts con expo config usando la CA pública local: conserva
plugins TLS, permisos e identificadores; supportsTablet:false está versionado.
Impeccable doctor con target mobile/src/App.tsx devolvió findings vacío.
La suite actual pasa 40 pruebas móviles y typecheck; el servidor pasa 3 pruebas
unitarias y 13 de integración en PostgreSQL desechable.
