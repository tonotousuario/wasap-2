# Design

## Context

`users.list` acepta `query` opcional; `NewChat` y `NewGroup` lo llaman sin `query` al abrir (`Chats.tsx`, `useDebounced` de 300 ms) y `Members` ya busca con texto. Motivación en `proposal.md`.

## Goals / Non-Goals

**Goals:** que ningún cliente pueda obtener el directorio completo por la API de la app.

**Non-Goals:** limitar búsquedas repetidas (enumeración por prefijos de 3 caracteres). Para eso haría falta limitar la frecuencia por usuario; se deja como posible cambio futuro si se considera necesario.

## Decisions

### D1. Mínimo de 3 caracteres en el servidor
La regla se aplica en el servidor (fuente de verdad) y se replica en la app para no enviar consultas inútiles. Se cuentan caracteres tras `trim()`.
- *Alternativa descartada:* coincidencia exacta de matrícula. Más privada, pero obliga a conocer matrículas ajenas y vuelve inútil buscar por nombre, que es el uso real.

### D2. Selección en grupos independiente de la búsqueda
`NewGroup` ya guarda `chosen` aparte de la lista mostrada; se conserva y se muestra como chips aunque la búsqueda cambie.

## Risks / Trade-offs

- [Apps antiguas reciben `VALIDATION` al abrir Nuevo chat] → Es una alpha; se distribuye la nueva versión junto con el servidor (cambio `alpha-release`).
- [Enumeración con muchas búsquedas de 3 letras] → Aceptado para la LAN de clase; documentado en Non-Goals.

## Migration Plan

Desplegar servidor y app a la vez. Rollback: revertir la validación del servidor; la app nueva sigue funcionando con servidores anteriores.
