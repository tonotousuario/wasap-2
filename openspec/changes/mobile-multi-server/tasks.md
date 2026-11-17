# Tasks

## 1. QR y confianza

- [ ] 1.1 Formato `wasap://server` (generar en servidor con `certs qr`, analizar en la app con validación de CA) y pruebas unitarias en ambos lados con QR válidos, ajenos y de otra versión
- [ ] 1.2 Verificación de `server.hello` tras el handshake (ID y huella); pruebas del motor con un servidor falso que responde otro `serverId`

## 2. Varios servidores en la app

- [ ] 2.1 Lista de servidores, sesión por servidor y migración del servidor de instalación; pruebas del motor: cambiar A→B→A sin PIN, borrar un servidor borra su sesión y cola
- [ ] 2.2 Conexión por varias direcciones con plazo de 5 s y recuerdo de la última; pruebas con direcciones caídas y error de certificado que detiene la lista
- [ ] 2.3 CA de compilación opcional en `app.config.ts`; verificar `expo config` con y sin `WASAP_CA_PEM`

## 3. Interfaz

- [ ] 3.1 Pantalla de servidores con escáner (`expo-camera`) y pegado de enlace; selector en Ajustes y acceso; verificar en el AVD con dos servidores locales (dos puertos)
- [ ] 3.2 Corregir iniciales (`format.ts`) con prueba en `tests/format.test.ts`
- [ ] 3.3 Documentar alta por QR en `mobile/README.md` y `README.md`, con captura de la lista de servidores
