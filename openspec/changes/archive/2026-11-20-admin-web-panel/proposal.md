# Proposal

## Why

Con clases, profesores, invitaciones y certificados, la consola deja de ser práctica: un profesor no va a ejecutar `docker compose exec`. Un panel web da a administradores y profesores lo que necesitan sin tocar la app, que sigue usando solo el protocolo propio.

## What Changes

- **Panel HTTPS en un puerto propio** (5443 por defecto, desactivable), con el mismo certificado que el servidor TCP.
- Entrada con matrícula y PIN para `admin` y `teacher`; los alumnos no entran.
- **Administrador:** usuarios (alta, roles, restablecer PIN, cerrar sesiones), todas las clases, certificados (estado, detectar direcciones, emitir con la frase de la CA), QR del servidor, nombre del servidor, auditoría.
- **Profesor:** sus clases (integrantes, invitaciones e impresión de QR, código de autorregistro, aprobar solicitudes) y la lista de asistencia de cada clase por fechas.
- **Exportar asistencia a CSV** por clase o puerta general.
- **Registro de auditoría** de las acciones administrativas.
- El principio de producto pasa de «sin HTTP» a «la app usa solo el protocolo propio; HTTP existe únicamente para el panel de administración».

## Capabilities

### New Capabilities
- `admin-web-panel`: panel HTTPS de administración y de profesores.
- `audit-log`: registro de acciones administrativas.

### Modified Capabilities
- `server-deployment`: configuración y publicación del puerto del panel.

## Impact

- **Servidor:** nuevo módulo HTTP (servidor HTTPS del JDK), plantillas HTML del lado del servidor sin dependencias de front-end, reutilizando `Service`, `Tls` y las sesiones.
- **BD:** migración `V7` (`audit_log`, sesiones del panel).
- **Despliegue:** `PANEL_PORT`, `PANEL_ENABLED`; puertos en `compose*.yaml`; documentación.
- **Producto:** `PRODUCT.md` y `README.md` con el principio actualizado.
- **Depende de** `server-identity-and-trust`, `class-attendance-and-roles` y `onboarding-invitations`.
