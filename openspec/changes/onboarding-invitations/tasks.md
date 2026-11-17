# Tasks

## 1. Invitaciones

- [ ] 1.1 Migración `V6` y generación de invitaciones (unitaria, CSV) con `admin invites`; pruebas de integración de permisos (admin, profesor de la clase, alumno)
- [ ] 1.2 `invites.redeem` atómico con elección de PIN e inscripción en clase; pruebas de canje doble simultáneo, caducada, reutilizada y `INVITATION_INVALID` indistinguible

## 2. Autorregistro

- [ ] 2.1 Códigos de clase (generar, renovar) y `signup.request` con límites; pruebas de código renovado y tope de 20 pendientes
- [ ] 2.2 Aprobación y rechazo, y `PENDING_APPROVAL` en el login solo con PIN correcto; pruebas de integración
- [ ] 2.3 Documentar operaciones y códigos de error en `docs/protocol.md`

## 3. App

- [ ] 3.1 Reconocer `wasap://invite` y `wasap://signup` en el escáner, formulario de PIN y de autorregistro, y estado «Pendiente de aprobación»; pruebas del motor y `npx tsc --noEmit`
- [ ] 3.2 Verificar en el AVD: alta por invitación y por autorregistro aprobado; capturas en `docs/verification.md`
