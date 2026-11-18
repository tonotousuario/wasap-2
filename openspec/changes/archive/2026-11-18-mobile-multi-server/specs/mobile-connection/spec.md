# Spec Delta

## MODIFIED Requirements

### Requirement: Configuración del servidor
La app SHALL mantener una lista de hasta 10 servidores, añadidos por QR o a mano (a mano solo para el servidor de la CA de compilación, si existe), cada uno con nombre, direcciones (host y puerto 1–65535), CA y sesión propias. Cambiar el servidor activo MUST NOT cerrar la sesión de los demás; eliminar un servidor SHALL pedir confirmación y borrar su sesión, su cola y sus datos locales.

#### Scenario: Puerto inválido
- **WHEN** el usuario guarda a mano el puerto 70000
- **THEN** la app rechaza la configuración con un mensaje

#### Scenario: Cambio de servidor
- **WHEN** el usuario cambia del servidor A al B y vuelve a A
- **THEN** sigue con su sesión en A sin volver a escribir el PIN, y los datos de B no se muestran en A

## ADDED Requirements

### Requirement: Varias direcciones por servidor
La app SHALL probar las direcciones del servidor activo en orden, con un plazo de 5 segundos por dirección, empezar por la última que funcionó y recordarla.

#### Scenario: Cambio de red
- **WHEN** la primera dirección no responde y la segunda sí
- **THEN** la app se conecta por la segunda y la usa primero en la siguiente reconexión
