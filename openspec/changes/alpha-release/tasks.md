# Tasks

## 1. Formateo

- [x] 1.1 Añadir `.editorconfig`, Prettier fijado en `mobile/` con script `format` y ktlint en `server/build.gradle.kts`; verificar con `npm run format -- --check` y `./gradlew ktlintCheck` que la configuración carga (deben reportar diferencias, no errores)
- [x] 1.2 Reformatear todo en un commit aislado, añadir su hash a `.git-blame-ignore-revs` y verificar que `./gradlew test`, `npm test` y `npx tsc --noEmit` siguen pasando

## 2. Android

- [x] 2.1 Generar el keystore de alpha en `~/.wasap/` y configurar la firma del release por propiedades de Gradle fuera del repo; verificar con `git status` que no se versiona ningún secreto
- [ ] 2.2 Compilar el APK de release con `WASAP_CA_PEM`; instalarlo con `adb install` en el AVD `Medium_Phone_API_37.0` y verificar contra el servidor local: login, entrada/salida, privado, grupo, cola de mensajes y reconexión tras reiniciar el servidor sin pedir PIN

## 3. iOS

- [ ] 3.1 Configurar `WASAP_CA_PEM` y el proyecto en EAS con el login del usuario; con su confirmación, lanzar el build iOS (ad-hoc o TestFlight, según su elección) y verificar que termina y queda disponible para los testers

## 4. Documentación visual

- [ ] 4.1 Capturar en el AVD, con la versión alpha, las pantallas principales (acceso, servidor, asistencia Dentro/Fuera con historial, lista de chats, hilo, nuevo chat con búsqueda, crear grupo, integrantes, ajustes y diagnóstico) y guardarlas optimizadas en `docs/images/` (PNG ≤ 300 KB cada una); verificar tamaños con `du`
- [ ] 4.2 Rehacer la portada de `README.md`: presentación breve, galería de capturas en tabla, diagrama de arquitectura (Mermaid) y un diagrama de la trama del protocolo; verificar que GitHub renderiza Mermaid y que todos los enlaces de imágenes existen
- [ ] 4.3 Añadir diagramas donde falten: secuencia de login/reanudación con sesiones persistentes y revocación en `docs/protocol.md`, y despliegue (contenedores, red, volúmenes, certificados) en `docs/local-runtime.md`; actualizar `docs/verification.md` con la galería nueva y quitar capturas obsoletas; verificar con un comprobador de enlaces locales (script que valida cada `![...](ruta)` y `<img src>`)

- [ ] 4.4 Identidad de app: explorar 3–4 conceptos de icono con Codex (generación de imágenes) sin parecido con el logotipo del mensajero original, elegir uno con el usuario, vectorizarlo en SVG y exportar `mobile/assets/` (icono 1024, primer plano y fondo del icono adaptativo de Android, monocromo, splash); registrarlos en `app.config.ts` y verificar en el AVD que el icono se ve en el lanzador y el splash al abrir
- [ ] 4.5 Banner del README: ilustración generada con Codex más rótulo compuesto en SVG con el nombre real del producto; verificar que se ve en claro y oscuro y que todo raster generado conserva su prompt de procedencia (`impeccable embed-prompt --scan`)

## 5. Entrega

- [ ] 5.1 Documentar en `mobile/README.md` la instalación de la alpha (APK y iOS), la IP o el certificado que necesita el tester y cómo reportar errores desde Diagnóstico; verificar siguiendo la guía en el AVD con el APK generado
