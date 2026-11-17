# Spec Delta

## Purpose

Fija cuánta carga debe soportar una sola instancia del servidor para el uso de una escuela y cómo se demuestra con una prueba reproducible.

## ADDED Requirements

### Requirement: Capacidad de una instancia
En el hardware de referencia (4 vCPU, 8 GB de RAM, PostgreSQL en la misma máquina), una instancia SHALL mantener 2 000 conexiones TLS autenticadas simultáneas con: `messages.send` en el chat General con p95 ≤ 300 ms, entrega de `message.created` al 95 % de los conectados en ≤ 2 s, y `attendance.mark` a 50 por segundo con p95 ≤ 300 ms, sin errores `UNAVAILABLE`.

#### Scenario: Hora de entrada
- **WHEN** 2 000 alumnos conectados registran entrada a razón de 50 por segundo mientras el chat General recibe 5 mensajes por segundo
- **THEN** se cumplen los percentiles indicados y ningún registro se duplica ni se pierde

### Requirement: Prueba de carga reproducible
El repositorio SHALL incluir una prueba de carga ejecutable con un solo comando contra un servidor real por TLS, configurable en conexiones y ritmos, que reporte los percentiles de cada operación y verifique en la base que no hay duplicados.

#### Scenario: Ejecución documentada
- **WHEN** alguien sigue la guía con el entorno local
- **THEN** obtiene un informe con los percentiles y el resultado de la verificación de duplicados
