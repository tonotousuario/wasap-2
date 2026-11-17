# Tasks

## 1. Formateo

- [ ] 1.1 Añadir `.editorconfig`, Prettier fijado en `mobile/` con script `format` y ktlint en `server/build.gradle.kts`; verificar con `npm run format -- --check` y `./gradlew ktlintCheck` que la configuración carga (deben reportar diferencias, no errores)
- [ ] 1.2 Reformatear todo en un commit aislado, añadir su hash a `.git-blame-ignore-revs` y verificar que `./gradlew test`, `npm test` y `npx tsc --noEmit` siguen pasando

## 2. Android

- [ ] 2.1 Generar el keystore de alpha en `~/.wasap/` y configurar la firma del release por propiedades de Gradle fuera del repo; verificar con `git status` que no se versiona ningún secreto
- [ ] 2.2 Compilar el APK de release con `WASAP_CA_PEM`; instalarlo con `adb install` en el AVD `Medium_Phone_API_37.0` y verificar contra el servidor local: login, entrada/salida, privado, grupo, cola de mensajes y reconexión tras reiniciar el servidor sin pedir PIN

## 3. iOS

- [ ] 3.1 Configurar `WASAP_CA_PEM` y el proyecto en EAS con el login del usuario; con su confirmación, lanzar el build iOS (ad-hoc o TestFlight, según su elección) y verificar que termina y queda disponible para los testers

## 4. Entrega

- [ ] 4.1 Documentar en `mobile/README.md` la instalación de la alpha (APK y iOS), la IP o el certificado que necesita el tester y cómo reportar errores desde Diagnóstico; verificar siguiendo la guía en el AVD con el APK generado
