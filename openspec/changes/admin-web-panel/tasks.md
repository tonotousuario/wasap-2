# Tasks

## 1. Base del panel

- [x] 1.1 `HttpsServer` con el `SSLContext` recargable, `PANEL_ENABLED`/`PANEL_PORT`, cabeceras de seguridad y límites; pruebas de integración de arranque, desactivado y cabeceras
- [x] 1.2 Plantillas con escape por defecto y estilo de `mobile/DESIGN.md`; prueba unitaria de escape (nombre con HTML)
- [x] 1.3 Migración `V7`, sesiones del panel con cookie segura y CSRF, solo `admin`/`teacher`; pruebas de alumno rechazado, CSRF ausente y caducidades

## 2. Funciones

- [x] 2.1 Administrador: usuarios, roles, PIN, cierre de sesiones, nombre del servidor; pruebas de integración por función
- [x] 2.2 Certificados: estado, direcciones detectadas, emisión con frase y QR del servidor (ZXing, SVG/PNG); prueba de emisión en caliente desde el panel
- [x] 2.3 Profesor: clases propias, integrantes, invitaciones con impresión de QR, código de autorregistro y aprobaciones; pruebas de aislamiento entre profesores
- [x] 2.4 Asistencia por fechas y exportación CSV; prueba del contenido exacto del CSV
- [x] 2.5 Auditoría en la misma transacción y su consulta filtrada; pruebas de que no se guardan secretos

## 3. Despliegue y documentación

- [ ] 3.1 Puertos en `compose*.yaml`, `README.md` y `docs/local-runtime.md`; actualizar el principio en `PRODUCT.md`; verificar el panel en `compose.local.yaml`
- [ ] 3.2 Capturas del panel (administrador y profesor) en `docs/verification.md` y en la galería del README
