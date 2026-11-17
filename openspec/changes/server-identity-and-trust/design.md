# Design

## Context

Hoy `Tls.serverContext` carga un PKCS12 al arrancar y `scripts/create-certs.sh` crea la CA y el certificado con OpenSSL fuera del servidor; el README pide guardar `ca.key` lejos del contenedor. La decisión de producto de esta fase es que la CA viva en el servidor cifrada con una frase del administrador (ver `proposal.md`). El contenedor de producción es de solo lectura.

## Goals / Non-Goals

**Goals:** identidad estable del servidor, emisión y recarga de certificados desde el servidor, certificado multi-dirección y anclas para la federación.

**Non-Goals:** ACME o CA pública; revocación de certificados (CRL/OCSP); operaciones entre servidores (ver `federation-design`).

## Decisions

### D1. Identidad en la base
Tabla `server_identity(id uuid, name text, created_at)` con una sola fila creada por la migración `V4`. Vive con los datos, así un respaldo o una segunda instancia sobre la misma base conserva el mismo `serverId`. El nombre se cambia por consola o panel.

### D2. Clave de la CA cifrada
`ca.key.p8` en el directorio de certificados: PKCS#8 cifrado con PBES2 (AES-256-CBC, PBKDF2-HMAC-SHA256, 600 000 iteraciones), el mismo nivel que los PIN. Se descifra en memoria solo durante una emisión y se borra el arreglo al terminar. `certs import` cifra una `ca.key` existente; `certs init` crea una CA nueva (RSA 3072, 10 años).
- *Alternativa descartada:* frase en variable de entorno para firmar sin intervención. Convierte la frase en un secreto permanente del contenedor y anula el propósito.

### D3. Emisión con BouncyCastle
Se añade `org.bouncycastle:bcpkix` para construir certificados X.509 v3 (SAN, `serverAuth`, `CA:FALSE`) en la JVM; el JDK no ofrece una API pública para firmar certificados.

### D4. Gestor de claves recargable
`ReloadableKeyManager` (implementa `X509ExtendedKeyManager`) delega en un gestor guardado en una `AtomicReference`. Emitir carga el PKCS12 nuevo, valida su vigencia y cadena contra la CA y cambia la referencia; los handshakes siguientes lo usan y las sesiones abiertas no se tocan.

### D5. Detección de direcciones
`NetworkInterface` enumera direcciones activas sin bucle local ni enlace local IPv6; se proponen ordenadas (IPv4 privadas primero). En contenedor, las interfaces son las del contenedor, así que la propuesta incluye además `SERVER_PUBLIC_ADDRESSES` (lista configurable) y el panel permite editarla.

### D6. Directorio escribible
`compose.yaml` monta `certs/` en un volumen escribible solo para el certificado emitido y la CA cifrada (`/var/lib/wasap/tls`); el resto del sistema de archivos sigue de solo lectura.

### D7. `server.hello` y versiones
Operación sin sesión, sin coste de base salvo leer la identidad (cacheada al arrancar). `protocolVersions` es `[1]` en esta fase; el sobre ya trae `v`, así que una versión 2 futura se añade sin romper clientes.

## Risks / Trade-offs

- [Clave de la CA en el servidor] → Cifrada y útil solo con la frase; se documenta mantener una copia offline de `ca.key` para recuperación.
- [Detección de IPs dentro de Docker] → `SERVER_PUBLIC_ADDRESSES` y edición manual en el panel.
- [Nueva dependencia criptográfica] → Versión fijada y usada solo para construir certificados; TLS sigue siendo JSSE.

## Migration Plan

1. `V4` crea `server_identity`. 2. El administrador ejecuta `certs import` con su `ca.key` actual (los teléfonos no notan nada: misma CA). 3. Rollback: la imagen anterior sigue leyendo el PKCS12 existente.
