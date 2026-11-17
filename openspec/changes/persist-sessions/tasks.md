# Tasks

## 1. Almacenamiento

- [ ] 1.1 Crear `V3__sessions.sql` (tabla, FK con cascada, índice); verificar que Flyway migra un esquema temporal en `./gradlew integrationTest`
- [ ] 1.2 Reescribir `Sessions` sobre la BD con caché en memoria y hash SHA-256; pruebas de integración: crear, reanudar tras recrear `Sessions` (simula reinicio), sexta sesión elimina la más próxima a vencer, el token en claro no aparece en la tabla

## 2. Revocación

- [ ] 2.1 `resetPin` elimina las sesiones del usuario en su transacción y la revalidación con TTL comprueba existencia y versión en una consulta; prueba de integración: `auth.resume` tras reset responde `UNAUTHENTICATED` y un socket vivo lo recibe pasados 5 s
- [ ] 2.2 Añadir `admin users logout MATRICULA`; prueba de integración del conteo y de `NOT_FOUND`; documentarlo en `README.md` (Administración)

## 3. Purga y documentación

- [ ] 3.1 Programar la purga horaria de sesiones vencidas; prueba de integración que elimine una sesión vencida y conserve una vigente
- [ ] 3.2 Actualizar `docs/protocol.md` (Guarantees) y `docs/architecture.md` (sesiones persistentes, hash del token); verificar que no queda la frase "cease to work after server restart"

## 4. Verificación integrada

- [ ] 4.1 Ejecutar `./gradlew test integrationTest`; en el AVD, iniciar sesión, reiniciar el contenedor del servidor y verificar que la app reconecta sin pedir PIN
