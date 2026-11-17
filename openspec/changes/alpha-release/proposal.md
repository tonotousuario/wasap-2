# Proposal

## Why

Hay que entregar una versión alpha para que otras personas prueben WASAP en Android y iPhone con todas las mejoras planificadas. Además, el código usa un estilo muy compacto, sin formateo automático, que dificulta revisar los cambios.

## What Changes

- Formateo automático: `.editorconfig`, Prettier en `mobile/` y ktlint en `server/`, aplicados en un commit aislado que se registra en `.git-blame-ignore-revs`.
- APK alpha firmado con un keystore de alpha guardado fuera del repositorio, generado localmente con el perfil `preview` y verificado en el emulador Android.
- Build iOS alpha mediante EAS Build en la nube, distribuido por TestFlight o ad-hoc, con la cuenta Expo y Apple del usuario.
- Guía de instalación para testers.
- Documentación visual: galería de capturas actualizadas y diagramas (arquitectura, trama del protocolo, sesiones, despliegue) en el README y en la documentación que lo necesite.

Sin cambios de comportamiento: este cambio no tiene deltas de specs (`skip_specs: true`).

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
<!-- Ninguna: herramientas, formateo y distribución. -->

## Impact

- **Herramientas**: `.editorconfig`, `mobile/package.json` (Prettier como devDependency y script `format`), `server/build.gradle.kts` (plugin ktlint), `.git-blame-ignore-revs`.
- **Móvil**: configuración de firma del release, `eas.json` si hace falta ajustar perfiles, `mobile/README.md`.
- **Externo**: cuenta Expo/EAS y Apple Developer Program del usuario (solo con su confirmación).
- **Orden**: se aplica después de `harden-server-load-resilience`, `persist-sessions`, `directory-search-only` y `message-outbox`.
