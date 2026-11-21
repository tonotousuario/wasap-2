# Proposal

## Why

Puede llegar el día en que varios servidores deban compartir usuarios, grupos y mensajes (por ejemplo, una escuela con un servidor por edificio). No toca construirlo ahora, pero sí dejar el modelo pensado y las decisiones de la v2 compatibles, para que escribir sus specs sea directo cuando haga falta.

## What Changes

- Documento de diseño `docs/federation.md`: modelo de identidad global, autoridad de cada servidor sobre sus conversaciones, orden de mensajes, revocación entre servidores, confianza servidor a servidor y modos de fallo.
- Borradores de requisitos (en el documento, no como specs) listos para convertirse en specs.
- Lista de las anclas que la v2 ya deja puestas (ID de servidor, UUID en todo, versiones de protocolo).

Sin cambios de comportamiento ni de código (`skip_specs: true`).

## Capabilities

### New Capabilities
<!-- Ninguna en esta fase: solo diseño. -->

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- **Documentación:** `docs/federation.md` y enlace desde `docs/architecture.md`.
- Se apoya en `server-identity-and-trust` (ID de servidor, versiones de protocolo).
