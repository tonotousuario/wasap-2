# Tasks

## 1. Build

- [ ] 1.1 Registrar los iPhone de prueba con `npx eas-cli device:create` (lo ejecuta el usuario) y verificar con `npx eas-cli device:list` que aparecen
- [ ] 1.2 Lanzar `npx eas-cli build --platform ios --profile preview` con la cuenta de Apple Developer del usuario y verificar que el build termina y ofrece enlace de instalación

## 2. Verificación

- [ ] 2.1 Instalar en un iPhone registrado y verificar permiso de red local, TLS con la CA embebida (y rechazo de un certificado sin la IP en su SAN), inicio de sesión, asistencia y chat; documentar el resultado y capturas en `docs/verification.md`
