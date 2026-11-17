# Design

## Context

`alpha-release` dejó listo el proyecto EAS, el entorno `preview` con la CA pública en una sola línea (con `\n` escapados, que `app.config.ts` convierte) y la lectura de `certs/ca.crt` cuando la variable falta en local. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** una build iOS instalable en los iPhone registrados de los testers.

**Non-Goals:** TestFlight o App Store; compilación local con Xcode (no hay macOS).

## Decisions

### D1. Ad-hoc con EAS en la nube
Elección del usuario: distribución ad-hoc con el perfil `preview` (`distribution: internal`). EAS crea el certificado de distribución y el perfil ad-hoc con los equipos registrados; los comandos son interactivos porque piden la cuenta de Apple, así que los ejecuta el usuario (`! npx eas-cli ...`).

### D2. Verificación en equipo real
La rama iPhone del diseño nunca se ha visto en pantalla; la primera instalación verifica permiso de red local, validación TLS con la CA embebida, inicio de sesión, asistencia y chat.

## Risks / Trade-offs

- [Cada iPhone nuevo exige otro build] → Registrar a todos los testers antes de compilar.
- [El parche TLS de iOS nunca se ha probado en un equipo] → Probar también un certificado sin la IP en su SAN y comprobar que se rechaza.
