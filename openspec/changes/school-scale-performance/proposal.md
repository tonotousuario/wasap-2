# Proposal

## Why

La v2 apunta a una escuela (o menos), con varios servidores por salón. Hoy no sabemos cuántos alumnos aguanta una instancia: la entrega de un mensaje del chat General consulta permisos por destinatario, el pool de base tiene 5 conexiones y no hay pruebas de carga. Hay que demostrar la capacidad objetivo y dejar preparada, sin construirla, la ruta a varias instancias.

## What Changes

- **Objetivo medible** para una instancia: 2 000 conexiones autenticadas simultáneas en hardware de referencia, con latencias acotadas para enviar mensajes, difundirlos y registrar asistencia.
- **Prueba de carga reproducible** que ejecuta ese escenario contra el servidor real por TLS y reporta los percentiles.
- Ajustes necesarios para cumplirlo: pool de base dimensionado, caché de membresía para la difusión, índices revisados y verificación de permisos agrupada.
- **Bus de eventos tras una interfaz**: hoy en memoria; preparado para `LISTEN/NOTIFY` de PostgreSQL si algún día hacen falta varias instancias (no se construye).

## Capabilities

### New Capabilities
- `capacity`: capacidad objetivo de una instancia y cómo se demuestra.

### Modified Capabilities
<!-- Ninguna: el contrato de entrega no cambia. -->

## Impact

- **Servidor:** `TcpServer.notify` y el writer (permisos agrupados con caché), `Database` (pool configurable), índices nuevos en una migración, interfaz `EventBus`.
- **Herramientas:** generador de carga (módulo de pruebas Kotlin) y un comando documentado.
- **Documentación:** resultados en `docs/verification.md` y hardware de referencia.
- Independiente de los demás cambios; conviene medir después de `class-attendance-and-roles`, que añade asistencia por clase.
