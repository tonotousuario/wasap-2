# Spec Delta

## MODIFIED Requirements

### Requirement: CA de instalación incorporada en la app
La app MAY incorporar al compilarse un certificado CA público (PEM) desde `WASAP_CA_PEM`, que define un servidor de instalación configurable a mano. Si se proporciona, la compilación MUST fallar si contiene una clave privada, más de un certificado o un certificado que no es de CA. Sin él, los servidores solo se añaden por QR.

#### Scenario: Certificado de servidor en lugar de CA
- **WHEN** se compila con el certificado del servidor en `WASAP_CA_PEM`
- **THEN** la configuración falla indicando que se requiere la CA de instalación

#### Scenario: Falta la CA en tiempo de ejecución
- **WHEN** un servidor de la lista no tiene CA (sin CA de compilación ni QR)
- **THEN** la app pide escanear el QR del servidor antes de conectar

### Requirement: Validación del servidor en el cliente
En Android e iOS la app SHALL validar la cadena hasta la CA del servidor guardado como único ancla, la vigencia y que el SAN coincida con la dirección usada. Ninguna opción del código JavaScript MUST poder desactivar esta validación.

#### Scenario: IP fuera del SAN
- **WHEN** la app se conecta a una dirección que no está en el SAN del certificado del servidor
- **THEN** la conexión falla con un error de certificado

#### Scenario: Certificado firmado por otra CA
- **WHEN** el servidor presenta un certificado de otra CA, aunque sea la de otro servidor guardado
- **THEN** la conexión falla

#### Scenario: rejectUnauthorized falso
- **WHEN** el código JavaScript pasa `rejectUnauthorized:false`
- **THEN** la validación se aplica igualmente
