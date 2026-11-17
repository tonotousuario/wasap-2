# Proposal

## Why

La alpha de Android ya está publicada y verificada; el build de iPhone ad-hoc se pospuso porque necesita la cuenta de Apple Developer del usuario y registrar los iPhone de los testers. Este cambio recoge ese trabajo pendiente para retomarlo sin bloquear la alpha.

## What Changes

- Registrar los iPhone de prueba con `eas device:create`.
- Generar el build iOS ad-hoc con el perfil `preview` de EAS y distribuirlo a los equipos registrados.
- Verificar la guía de instalación de iPhone de `mobile/README.md` con un equipo real.

Sin cambios de comportamiento (`skip_specs: true`).

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
<!-- Ninguna: distribución. -->

## Impact

- **Externo:** cuenta Expo `@kedap55/wasap` (ya creada, entorno `preview` con `WASAP_CA_PEM`) y Apple Developer Program del usuario.
- **Documentación:** `mobile/README.md` y `docs/verification.md` con el resultado en iPhone.
