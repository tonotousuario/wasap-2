# WASAP móvil

Aplicación Expo 58 / React Native 0.88 para Android e iOS. Incluye servidor configurable, sesión por matrícula/PIN, asistencia, historial paginado, chat general/privado/grupal y administración de miembros por el creador. La comunicación usa TCP con TLS y el protocolo de [../docs/protocol.md](../docs/protocol.md).

## Preparar la CA pública

Requiere Node 22.18 o posterior, npm y el certificado público de la CA que firmó el servidor. El servidor genera `certs/ca.crt` con `scripts/create-certs.sh`.

Desde la raíz del repositorio:

```sh
cd mobile
npm ci
export WASAP_CA_PEM="$(cat ../certs/ca.crt)"
npm test
npm run typecheck
npx expo config --type public
```

`WASAP_CA_PEM` contiene el TEXTO PEM completo; también admite saltos representados por `\n`. `app.config.ts` valida que sea exactamente un certificado CA público y lo incorpora en `extra.installationCaPem`. El cliente pasa ese texto directamente a TLS. No utiliza `require('ca.pem')`, rutas de assets, ni descargas HTTP de Metro para obtener certificados. La CA pública es visible dentro de la aplicación; nunca proporciones `ca.key`, `server.p12`, contraseñas ni PINs como configuración móvil. El proceso de compilación falla si falta la CA o se proporciona una clave privada o un certificado de hoja.

En la pantalla **Servidor**, guarda la IP/nombre y puerto TLS (5050 por defecto). En un dispositivo físico usa la IP LAN del servidor. En el emulador Android, el host anfitrión suele ser `10.0.2.2`; esa IP también debe estar en el SAN del certificado. Cambiar de IP requiere un certificado de servidor nuevo firmado por la misma CA e incluyendo la nueva IP en su SAN. Rotar la CA requiere volver a compilar la app.

## Compilación local Android

Instala Android Studio/SDK y el JDK compatible con el proyecto generado. Expo 58 requiere Android SDK 37, Build Tools 37.0.0 y NDK 27.1.12297006. Google publica la plataforma como `platforms;android-37.0`. Configura `ANDROID_HOME` y conecta un dispositivo con depuración USB o inicia un emulador.

```sh
npx expo prebuild --platform android --no-install
npx expo run:android --device
npm start
```

Para generar un APK local sin iniciar el dispositivo:

```sh
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleDebug
```

Mantén `WASAP_CA_PEM` exportado también durante Gradle/Metro. El APK debug está en `android/app/build/outputs/apk/debug/`. El build de desarrollo necesita Metro (`npm start`). Un build de distribución incorpora su propio bundle.

## Emulador Android desde la terminal (sin abrir Android Studio)

Estos pasos usan Bash en Linux y un AVD ya creado, como el utilizado en las pruebas.
Android Studio puede permanecer cerrado; necesitas el SDK, Android Emulator y la
imagen del AVD instalados. En cada terminal configura las rutas (ajusta la del SDK
si lo instalaste en otro lugar):

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
emulator -list-avds
```

En una primera terminal inicia uno de los nombres que devuelve la lista:

```sh
emulator -avd Medium_Phone_API_37.0
```

Conserva esa terminal abierta. En una segunda terminal comprueba el dispositivo
y espera a que termine de arrancar:

```sh
adb devices
adb -s emulator-5554 wait-for-device
adb -s emulator-5554 shell getprop sys.boot_completed
```

El último comando debe devolver `1`; si todavía no lo hace, espera y repítelo.
Sustituye `emulator-5554` por el identificador que muestre `adb devices` si cambia.

### Usar la app ya instalada y el servidor local

Si usas los contenedores locales descritos en [la guía del servidor](../docs/local-runtime.md),
inícialos desde la raíz del repositorio:

```sh
podman compose -f compose.local.yaml -f compose.local.podman.yaml up -d
adb -s emulator-5554 reverse tcp:5050 tcp:5050
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 reverse --list
```

En WASAP configura **127.0.0.1**, puerto **5050**. El reenvío hace que ese puerto
del emulador llegue al servidor del equipo. El certificado del servidor debe
incluir `127.0.0.1` en su SAN y estar firmado por la CA incorporada a la app.
Repite los reenvíos si reinicias o reconectas el emulador. Esta ruta evita depender
de la IP LAN; no necesitas regenerar el certificado cada vez que cambia el Wi-Fi.

Desde la raíz del repositorio, en otra terminal:

```sh
cd mobile
export WASAP_CA_PEM="$(cat ../certs/ca.crt)"
npm start -- --localhost
```

Abre WASAP en el emulador y selecciona el servidor de desarrollo de Metro.
El puerto 8081 sirve el JavaScript de desarrollo; 5050 es la conexión TCP/TLS de
WASAP. Si falta el binario de la app o cambiaste dependencias nativas, usa el
procedimiento de [compilación local Android](#compilación-local-android).
Para cambios de interfaz basta con Metro y recargar la app.

### Apagar y resolver problemas de arranque

```sh
adb -s emulator-5554 emu kill
```

Si el AVD no restaura correctamente su sesión, vuelve a iniciarlo con
`emulator -avd Medium_Phone_API_37.0 -no-snapshot-load`. Esto arranca sin cargar
el snapshot y conserva los datos. Evita `-wipe-data`: borra las aplicaciones y
datos del AVD. Si la lista de AVD está vacía, primero debes crear uno; las
herramientas de consola para ello son `sdkmanager` y `avdmanager`, disponibles
en Android SDK Command-line Tools. En Linux la aceleración requiere KVM;
puedes revisar su disponibilidad con `emulator -accel-check`.

Referencias: [inicio del emulador por CLI](https://developer.android.com/studio/run/emulator-commandline)
y [ADB](https://developer.android.com/tools/adb). Esta guía usa los ejecutables
del SDK instalado; la documentación actual también presenta la nueva Android CLI.

## macOS / Xcode, sin compilación en la nube

Instala Xcode con sus herramientas de línea de comandos, un simulador iOS y CocoaPods. Conserva `WASAP_CA_PEM` en el entorno de la terminal.

```sh
npm ci
export WASAP_CA_PEM="$(cat ../certs/ca.crt)"
npx expo prebuild --platform ios
npx expo run:ios
```

Para un iPhone físico:

```sh
npx expo run:ios --device
```

También puedes abrir `ios/WASAP.xcworkspace` en Xcode, seleccionar tu equipo en **Signing & Capabilities**, elegir el dispositivo y ejecutar. Para archivar selecciona **Any iOS Device** y **Product → Archive**. La firma de un dispositivo/distribución requiere la cuenta Apple correspondiente. No cambies las validaciones TLS para resolver problemas de firma o de red. Autoriza **Red local** al iniciar la app; puedes restablecer el permiso en Ajustes.

## EAS

No se ha ejecutado ninguna compilación pagada ni publicado la app. Los perfiles están preparados en `eas.json`:

```sh
npx eas-cli login
npx eas-cli init
```

Guarda el UUID de proyecto que proporciona `init` en `EAS_PROJECT_ID` (o incorpora `extra.eas.projectId` en la configuración). Configura `WASAP_CA_PEM` como variable de entorno de EAS que esté disponible al evaluar la configuración y al compilar; su valor es público, no una credencial. Para introducir el PEM sin problemas de saltos de línea puedes usar el panel de EAS y pegar el contenido completo. Conserva la misma variable exportada al invocar EAS desde tu terminal.

```sh
npx eas-cli build --platform android --profile development
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform ios --profile simulator
```

`development` incluye `expo-dev-client`; `simulator` genera un build iOS para simulador. Después de instalarlo:

```sh
npm start
```

También puedes usar EAS local en una máquina con las herramientas nativas:

```sh
npx eas-cli build --platform android --profile preview --local
npx eas-cli build --platform ios --profile preview --local
```

La app requiere un **development build** o binario nativo; Expo Go no contiene el módulo TCP. Las carpetas `ios/` y `android/` se regeneran con prebuild y están ignoradas en Git.

## Interfaz

La interfaz vive en `src/App.tsx` (navegación y ciclo de conexión), `src/screens/` (Acceso, Asistencia, Chats, Chat/Integrantes, Ajustes) y `src/ui/` (tema, componentes e iconos). `src/format.ts` y `src/errors.ts` contienen la lógica de presentación sin React (fechas, filtros, títulos, mensajes de error) y tienen pruebas en `tests/format.test.ts`. Toda operación sigue pasando por `engine.ts`. El sistema visual está documentado en [DESIGN.md](DESIGN.md).

- Los iconos usan `@expo/vector-icons` (Material en Android, Ionicons en iPhone). Es solo JavaScript y fuentes; no requiere recompilar el binario de desarrollo.
- El tema oscuro está definido en `src/ui/theme.ts`, pero `app.config.ts` fija `userInterfaceStyle: 'light'`. Activarlo requiere `automatic`, añadir `expo-system-ui` y una compilación nativa; no se ha verificado visualmente.
- No hay biblioteca de navegación: una pila propia atiende el botón Atrás de Android y un gesto de borde en iPhone. El gesto de iPhone no se ha probado en dispositivo.

Verificado en el emulador Android (360×640 dp y 411×914 dp, fuente del sistema 1.0 y 1.3): pestañas, asistencia sin registros, lista de chats con privado titulado por la otra persona, chat con teclado abierto y borrador multilínea, envío real de un mensaje, nuevo chat, crear grupo (sin crear), ajustes, diagnóstico, diálogo de cierre de sesión (cancelado), acceso y servidor. Pendiente de otro dispositivo o de datos de prueba que no se debían alterar: iPhone, tema oscuro, estados Dentro/Fuera con historial, «pendiente de confirmación» con corte real de red, sesión vencida, pantalla de integrantes y entrega en tiempo real entre dos teléfonos.

## Seguridad nativa y recuperación

`react-native-tcp-socket` está fijado a 6.4.3. `plugins/patch-tls.cjs` aplica el parche versionado durante `npm ci` y el config plugin vuelve a verificarlo en prebuild. SHA-256 antes/después impide aplicar silenciosamente el parche a otra versión. No depende del ejecutable `patch` del sistema.

- iOS: el parche activa la comprobación y usa `SecTrustSetAnchorCertificates`, anclas exclusivas, `SecPolicyCreateSSL` con el host/IP configurado y `SecTrustEvaluateWithError`; exige TLS 1.2 o posterior. Sustituye la comparación incorrecta entre certificado de hoja y CA.
- Android: crea TLS sobre el socket TCP con el host original, activa identificación de extremo `HTTPS`, permite únicamente TLS 1.2/1.3 y usa el TrustManager de la CA. Rechaza opciones de confianza ciega y claves de cliente. Incluye compatibilidad de namespace con AGP moderno.
- Las mutaciones se escriben primero en AsyncStorage (clave `outbox:<servidor,usuario>`, un arreglo ordenado) y sólo después se envían. Los mensajes forman una cola de hasta 20 que se envía de uno en uno y en orden; asistencia, privados y grupos son exclusivos (solo empiezan con la cola vacía). Lo pendiente se reintenta con el mismo UUID, contenido, servidor y usuario después de reconectar/reiniciar; un error definitivo descarta solo ese mensaje y lo muestra como «No enviado» con acciones para copiarlo o descartarlo. Un pendiente del formato anterior (`pending:`) se migra al abrir la app. No se crean acciones nuevas sin conexión.
- SecureStore guarda el token y los datos mínimos de sesión; el PIN sólo permanece en memoria durante el inicio de sesión. Cerrar sesión o cambiar de servidor elimina token, pendientes y cachés locales.
- Los mensajes se deduplican por ID/secuencia, se ordenan sin convertir la secuencia a `number` y se recuperan por cursor en todas las conversaciones al reconectar/reanudar. Los eventos en vivo no adelantan el cursor de recuperación. La pérdida de membresía elimina la conversación de la caché de la app.

## Verificación en dispositivos físicos

Estos pasos son necesarios antes de distribuir; exportar JavaScript no verifica las APIs TLS nativas.

1. En **Android e iPhone**, confirma conexión con certificado vigente, CA correcta y SAN de la IP/nombre exacto. Verifica login, entrada/salida e historial; prueba chat general y privado, grupo y altas/bajas de miembros con dos usuarios.
2. Presenta un servidor firmado por otra CA: debe fallar antes del login. Repite con hoja expirada, hoja aún no vigente, certificado válido con SAN equivocado y un certificado sin SAN para la IP configurada. No deben enviarse credenciales ni datos de aplicación. Restaura después el servidor correcto.
3. Corta Wi-Fi justo después de enviar asistencia o mensaje. Tras una asistencia la UI debe bloquear otras acciones; tras un mensaje, el siguiente se encola (sin conexión no se crean acciones nuevas). Fuerza cierre/reinicio, restablece red e inicia sesión con el mismo usuario: debe existir un solo efecto en servidor y debe desaparecer el pendiente tras recuperar su confirmación.
4. Durante la desconexión, crea más de 100 mensajes desde otro cliente. Reconecta/reanuda; comprueba recuperación paginada sin duplicados ni huecos. Prueba cargar páginas anteriores y una conversación cuyos mensajes máximos requieran páginas menores a 100 para respetar 64 KiB.
5. Quita un usuario de un grupo desde el creador mientras mantiene el chat abierto. Debe desaparecer de su lista y deben fallar las nuevas consultas/envíos. Verifica que el creador no pueda eliminarse a sí mismo.
6. Cierra sesión o cambia de servidor con un pendiente; entra con otro usuario. No debe reproducirse la operación anterior. Reinicia el servidor: la app debe reconectar sin pedir matrícula ni PIN. Tras `admin users reset-pin` o `admin users logout`, debe pedir login en un máximo de 5 segundos.
7. Deniega permiso iOS de red local, cambia a una red inaccesible o usa puerto cerrado; comprueba el error y posterior reconexión al restablecer permisos/conectividad. Prueba segundo plano y regreso al primer plano.

## Comprobaciones automatizadas

```sh
npm test
npm run typecheck
npx expo export --platform android --platform ios
npx expo prebuild --no-install
```

Las pruebas ejecutan encuadre/UTF-8, correlación de solicitudes, errores/desconexiones, persistencia antes del envío, reintentos después de reinicio, aislamiento de usuario/servidor, conflictos de asistencia y recuperación/paginación de mensajes/conversaciones. Las APIs nativas se prueban en los dispositivos anteriores, no mediante búsquedas de texto fuente.

El análisis `npm audit --omit=dev` del 12 de noviembre de 2026 detectó tres paquetes afectados por el aviso moderado [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): `minimatch` y sus dependientes `@expo/fingerprint`/`expo`. Está en herramientas de fingerprint/build; la solución automática propone degradar a Expo 52. No se aplicó ese cambio incompatible. Revisa el aviso y las actualizaciones de Expo antes de distribuir.

Referencias primarias: [development builds](https://docs.expo.dev/develop/development-builds/introduction/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [config plugins](https://docs.expo.dev/config-plugins/plugins/), [seguridad TLS en Android](https://developer.android.com/privacy-and-security/security-ssl) y [biblioteca TCP](https://github.com/Rapsssito/react-native-tcp-socket).

Comprobación posterior (14 de noviembre): estados Dentro y Fuera con historial y aviso de sesión vencida observados en Android; véase [la evidencia actualizada](../docs/mobile-report.md#verificación-posterior--14-de-noviembre-de-2026). Esto amplía las comprobaciones anteriores y no implica aprobación global del diseño.

Consulta [las capturas y el estado de verificación](../docs/verification.md) y [los diagramas de arquitectura](../docs/architecture.md).
