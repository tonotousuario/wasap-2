# Proposal

## Why

Hoy cualquier usuario autenticado puede descargar el directorio completo (matrícula y nombre de todos) con un `users.list` sin búsqueda. Para un grupo escolar eso expone más datos personales de los necesarios: para abrir un privado o armar un grupo basta con encontrar a una persona concreta.

## What Changes

- **BREAKING**: `users.list` exige `query` con al menos 3 caracteres después de recortar espacios; sin `query` o con menos responde `VALIDATION`. Las apps anteriores que abren "Nuevo chat" sin búsqueda verán un error hasta actualizarse.
- La app deja de mostrar el directorio completo al abrir "Nuevo chat", "Crear grupo" y "Añadir integrante": muestra un campo de búsqueda con la indicación "Escribe al menos 3 letras o números".
- Se mantiene el máximo de 100 resultados y los campos `id`, `matricula`, `name`.
- `admin users list` (consola) no cambia.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `user-directory`: la búsqueda pasa a ser obligatoria con un mínimo de 3 caracteres.
- `mobile-experience`: las pantallas de selección de personas empiezan con un campo de búsqueda en lugar de una lista.

## Impact

- **Servidor**: `Service.kt` (`users.list`), pruebas de integración.
- **Móvil**: `src/screens/Chats.tsx` (`NewChat`, `NewGroup`), `src/screens/Thread.tsx` (`Members`), `src/format.ts` si se centralizan textos.
- **Documentación**: `docs/protocol.md` (tabla de operaciones), `docs/mobile-backend-needs.md` (punto 4).
