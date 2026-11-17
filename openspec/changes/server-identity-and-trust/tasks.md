# Tasks

## 1. Identidad y versiones

- [ ] 1.1 Migración `V4__server_identity.sql` y lectura cacheada; pruebas de integración de ID estable tras reiniciar (`./gradlew integrationTest`)
- [ ] 1.2 Operación `server.hello` y `UNSUPPORTED_VERSION` con `supportedVersions`; pruebas por TLS sin sesión y documentación en `docs/protocol.md`

## 2. CA cifrada y emisión

- [ ] 2.1 Añadir BouncyCastle fijado; `certs init` e `import` con PKCS#8 cifrado; pruebas unitarias de cifrado/descifrado, frase incorrecta y que no queda clave en claro en disco
- [ ] 2.2 `certs issue` con varias direcciones y nombres, y `certs status`; pruebas que validan SAN, `serverAuth`, vigencia y cadena con `Tls.clientContext`
- [ ] 2.3 Detección de direcciones con `NetworkInterface` y `SERVER_PUBLIC_ADDRESSES`; prueba unitaria del orden y filtrado

## 3. Recarga y despliegue

- [ ] 3.1 `ReloadableKeyManager` y recarga tras emitir; prueba de integración: cliente conectado sigue funcionando y una conexión nueva recibe el certificado nuevo
- [ ] 3.2 Volumen escribible para TLS en `compose*.yaml`, `README.md` (importar la CA, emitir, respaldar `ca.key` offline); verificar en `compose.local.yaml` que se emite y recarga sin reiniciar
