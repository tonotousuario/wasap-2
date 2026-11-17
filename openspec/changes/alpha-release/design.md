# Design

## Context

`eas.json` ya define los perfiles `development`, `simulator`, `preview` (APK, distribución interna) y `production`. En esta máquina Linux están el SDK de Android y el AVD `Medium_Phone_API_37.0`, pero no Xcode. `WASAP_CA_PEM` es obligatorio para evaluar `app.config.ts`. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** un APK instalable y un build iOS distribuible a testers, ambos con la CA de instalación; código formateado de forma reproducible.

**Non-Goals:** publicar en Play Store o App Store; firma de producción; CI.

## Decisions

### D1. Formateo al final y aislado
Se aplica después de los cambios funcionales para no generar conflictos con ellos. Se usan Prettier y ktlint con su configuración por defecto y ancho de línea de 120, para acercarse al estilo actual sin discusiones de configuración. El hash del commit se añade a `.git-blame-ignore-revs`.

### D2. APK local con `assembleRelease`
`npx expo prebuild --platform android` y luego `./gradlew :app:assembleRelease` con un keystore de alpha (`~/.wasap/alpha.keystore`, fuera del repositorio) configurado mediante propiedades de Gradle en `~/.gradle/gradle.properties`. Así no hace falta una cuenta EAS para Android.
- *Alternativa:* `eas build --profile preview --local`. Válida, pero requiere `eas-cli` e iniciar sesión; queda documentada como opción.

### D3. iOS por EAS en la nube
En Linux no se puede compilar iOS. Se usa `npx eas-cli build --platform ios --profile preview` (ad-hoc, con los UDID registrados) o `--profile production` + `eas submit` (TestFlight). Ambas opciones requieren que el usuario inicie sesión y tenga Apple Developer Program, y se ejecutan solo con su confirmación. `WASAP_CA_PEM` se configura como variable de entorno de EAS.

### D4. Red de los testers
El certificado del servidor debe incluir en el SAN la IP o el host que usarán los testers. Si la prueba es fuera de la LAN del servidor, hace falta exponer el puerto 5050 y regenerar el certificado con `scripts/create-certs.sh`; se documenta en la guía.

### D5. Documentación visual al final
Las capturas se toman con la versión alpha ya compilada, para que coincidan con lo que verán los testers. Los diagramas se escriben en Mermaid (GitHub los renderiza y viven como texto en Git) y las capturas se guardan como PNG optimizados en `docs/images/`. Un script pequeño valida que cada imagen enlazada existe.

## Risks / Trade-offs

- [Pérdida del keystore de alpha] → Solo afecta a las actualizaciones de la alpha (habría que desinstalarla y volver a instalarla); se recomienda respaldarlo.
- [Cuota o costo de EAS] → Se avisa antes de lanzar el build; el plan gratuito de EAS tiene cola y un límite de builds.
- [Reformateo rompe algo sutil] → Las pruebas y el typecheck se ejecutan tras el formateo y antes del commit.
