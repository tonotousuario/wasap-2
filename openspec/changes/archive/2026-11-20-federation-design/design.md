# Design

## Context

La v2 cubre un servidor con varias clases y una app con varios servidores, pero cada servidor es una isla: sus usuarios, grupos y mensajes no se ven desde otro. Este cambio solo diseña la federación (topología D en la exploración) y la deja documentada. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** un modelo coherente con las garantías actuales (confirmación tras commit, idempotencia, revocación) y su traducción a requisitos borrador.

**Non-Goals:** implementación; descubrimiento automático de servidores en internet; cifrado de extremo a extremo.

## Decisions

### D1. Identidad global `matricula@serverId`
Cada usuario pertenece a un servidor de origen, que es el único que verifica su PIN y emite sus sesiones. En otros servidores aparece como usuario remoto con su ID global.

### D2. Autoridad por conversación
Cada conversación tiene un servidor dueño (donde se creó). El dueño decide la membresía, asigna la secuencia de los mensajes (conserva el orden total por conversación) y confirma tras su propio commit. Los demás servidores reenvían al dueño y replican.

### D3. Confianza servidor a servidor
TLS mutuo entre servidores federados, con intercambio explícito de CA (el administrador acepta el QR del otro servidor, como hace la app). Sin federación abierta.

### D4. Entrega y revocación
El dueño envía cada mensaje confirmado a los servidores con miembros; cada servidor entrega a sus usuarios con las reglas actuales. Una retirada en el dueño se propaga antes de confirmar mensajes posteriores. Si un servidor federado no está disponible, el dueño encola por destino y reintenta (con la misma idempotencia por UUID).

### D5. Versión de protocolo 2
Las operaciones entre servidores van en `v:2`; los clientes v1 no cambian. La negociación de `server.hello` ya anuncia las versiones.

## Risks / Trade-offs

- [Particiones de red] → El dueño sigue funcionando; los remotos ven retraso, nunca mensajes reordenados.
- [Complejidad operativa] → Federación solo por acuerdo explícito entre administradores.

## Migration Plan

No aplica: solo documentación.
