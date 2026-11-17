# Tasks

## 1. Servidor

- [x] 1.1 Exigir `query` de al menos 3 caracteres tras recortar en `users.list`; pruebas de integración para sin `query`, 2 caracteres, 3 caracteres y sin sesión; verificar con `./gradlew integrationTest`
- [x] 1.2 Actualizar la fila de `users.list` en `docs/protocol.md` y el punto 4 de `docs/mobile-backend-needs.md`

## 2. App móvil

- [x] 2.1 Extraer a `format.ts` una función pura `canSearchDirectory(text)` con prueba en `tests/format.test.ts`; verificar con `npm test`
- [x] 2.2 `NewChat`, `NewGroup` y `Members`: estado inicial con campo de búsqueda e indicación, sin consulta hasta 3 caracteres, selección del grupo conservada entre búsquedas; verificar con `npx tsc --noEmit` y a mano en el AVD que al abrir Nuevo chat no aparece ninguna persona

## 3. Verificación integrada

- [x] 3.1 En el AVD contra el servidor local: abrir privado buscando por nombre, crear grupo con personas de dos búsquedas distintas y añadir un integrante desde la pantalla de integrantes
