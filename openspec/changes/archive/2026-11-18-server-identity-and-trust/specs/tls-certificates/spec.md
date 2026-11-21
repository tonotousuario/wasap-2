# Spec Delta

## MODIFIED Requirements

### Requirement: Generación de certificados
El servidor SHALL emitir con `wasap-server certs issue` (y desde el panel) un certificado de servidor de 1 año firmado por la CA de instalación, con SAN para cada dirección indicada (IPs y nombres) más `127.0.0.1`, guardado en un keystore PKCS12 con contraseña aleatoria. El script `scripts/create-certs.sh` sigue disponible; si existe `ca.crt` sin su clave, MUST fallar.

#### Scenario: Cambio de IP
- **WHEN** se emite un certificado nuevo con otra IP usando la CA existente
- **THEN** el certificado nuevo está firmado por la misma CA y la app no necesita recompilarse ni volver a escanear

#### Scenario: CA sin clave
- **WHEN** existe `ca.crt` pero no su clave privada (ni cifrada ni en claro)
- **THEN** la emisión termina con error sin generar archivos

## ADDED Requirements

### Requirement: CA cifrada en el servidor
La clave privada de la CA SHALL guardarse en el servidor solo cifrada con una frase del administrador (PKCS#8 cifrado, derivación de clave fuerte); MUST NOT escribirse en claro en disco ni en la base, y firmar SHALL exigir la frase.

#### Scenario: Importar la CA existente
- **WHEN** el administrador ejecuta `wasap-server certs import` con `ca.key` y una frase
- **THEN** el servidor guarda la clave cifrada y sugiere borrar `ca.key` en claro

#### Scenario: Frase incorrecta
- **WHEN** se intenta emitir un certificado con una frase incorrecta
- **THEN** la emisión falla sin generar archivos ni revelar si la clave existe

### Requirement: Certificado con varias direcciones
El servidor SHALL detectar sus direcciones de red (excepto bucle local) y proponerlas para el SAN; el administrador SHALL poder añadir nombres DNS y quitar direcciones antes de emitir.

#### Scenario: Servidor en dos redes
- **WHEN** el servidor tiene las IPs `192.168.1.50` y `10.8.0.1` y se emite con las propuestas
- **THEN** un cliente se conecta con validación correcta por cualquiera de las dos

### Requirement: Recarga del certificado sin reiniciar
Un certificado recién emitido SHALL usarse en las conexiones nuevas sin reiniciar el servidor; las conexiones abiertas MUST conservar su sesión TLS.

#### Scenario: Emisión en caliente
- **WHEN** se emite un certificado nuevo con el servidor atendiendo clientes
- **THEN** los clientes conectados siguen funcionando y una conexión nueva recibe el certificado nuevo
