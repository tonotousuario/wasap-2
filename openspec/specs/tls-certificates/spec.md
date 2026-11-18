# tls-certificates Specification

## Purpose

Define el modelo de confianza TLS de WASAP: una CA de instalación propia firma el certificado del servidor, la app incorpora solo la CA pública y ambos extremos validan cadena, vigencia e identidad sin posibilidad de desactivarlo.

## Requirements

### Requirement: TLS obligatorio
Todo el tráfico de la aplicación SHALL usar TLS 1.2 o 1.3. El servidor MUST NOT aceptar conexiones en texto plano ni versiones anteriores de TLS.

#### Scenario: Cliente TLS 1.1
- **WHEN** un cliente intenta negociar TLS 1.1
- **THEN** el handshake falla

### Requirement: Certificado vigente al arrancar
El servidor MUST NOT arrancar si el keystore no contiene una clave privada o si algún certificado de su cadena está vencido o aún no es válido.

#### Scenario: Certificado vencido
- **WHEN** el keystore contiene un certificado vencido
- **THEN** el servidor termina con un error de configuración

#### Scenario: Keystore sin clave privada
- **WHEN** el keystore no tiene ninguna entrada de clave
- **THEN** el servidor termina con un error de configuración

### Requirement: CA de instalación incorporada en la app
La app SHALL incorporar al compilarse exactamente un certificado CA público (PEM) desde `WASAP_CA_PEM`. La compilación MUST fallar si falta, si contiene una clave privada, si contiene más de un certificado o si el certificado no es de CA.

#### Scenario: Certificado de servidor en lugar de CA
- **WHEN** se compila con el certificado del servidor en `WASAP_CA_PEM`
- **THEN** la configuración falla indicando que se requiere la CA de instalación

#### Scenario: Falta la CA en tiempo de ejecución
- **WHEN** la app compilada no tiene la CA disponible al conectar
- **THEN** muestra un error de configuración pidiendo recompilar con `WASAP_CA_PEM`

### Requirement: Validación del servidor en el cliente
En Android e iOS la app SHALL validar la cadena hasta la CA de instalación como único ancla, la vigencia y que el SAN coincida con la IP o el host configurado. Ninguna opción del código JavaScript MUST poder desactivar esta validación.

#### Scenario: IP fuera del SAN
- **WHEN** la app se conecta a una IP que no está en el SAN del certificado del servidor
- **THEN** la conexión falla con un error de certificado

#### Scenario: Certificado firmado por otra CA
- **WHEN** el servidor presenta un certificado de otra CA, aunque sea pública y válida
- **THEN** la conexión falla

#### Scenario: rejectUnauthorized falso
- **WHEN** el código JavaScript pasa `rejectUnauthorized:false`
- **THEN** la validación se aplica igualmente

### Requirement: Sin identidad de cliente
La app MUST NOT presentar certificados ni claves de cliente; la configuración nativa SHALL rechazar cualquier clave o certificado de cliente.

#### Scenario: Clave de cliente configurada
- **WHEN** las opciones TLS incluyen una clave de cliente
- **THEN** la conexión falla con un error de seguridad

### Requirement: Generación de certificados
El servidor SHALL emitir con `wasap-server certs issue` (y desde el panel) un certificado de servidor de 1 año firmado por la CA de instalación, con SAN para cada dirección indicada (IPs y nombres) más `127.0.0.1`, guardado en un keystore PKCS12 con contraseña aleatoria. El script `scripts/create-certs.sh` sigue disponible; si existe `ca.crt` sin su clave, MUST fallar.

#### Scenario: Cambio de IP
- **WHEN** se emite un certificado nuevo con otra IP usando la CA existente
- **THEN** el certificado nuevo está firmado por la misma CA y la app no necesita recompilarse ni volver a escanear

#### Scenario: CA sin clave
- **WHEN** existe `ca.crt` pero no su clave privada (ni cifrada ni en claro)
- **THEN** la emisión termina con error sin generar archivos

### Requirement: Aviso de vencimiento próximo
El servidor SHALL registrar un aviso en su salida de error al arrancar y al menos una vez cada 24 horas mientras algún certificado de la cadena venza en menos de 30 días, indicando la fecha de vencimiento.

#### Scenario: Vence en 10 días
- **WHEN** el servidor arranca con un certificado que vence en 10 días
- **THEN** registra un aviso con la fecha de vencimiento y sigue atendiendo conexiones

#### Scenario: Vence en 200 días
- **WHEN** el certificado vence en más de 30 días
- **THEN** no se registra aviso

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
