# Spec Delta

## Purpose

Define el panel web HTTPS con el que administradores y profesores gestionan el servidor, sus clases y la asistencia, separado del protocolo propio que usa la app.

## ADDED Requirements

### Requirement: Panel en puerto propio
El servidor SHALL servir el panel solo por HTTPS (TLS 1.2+, mismo certificado que el puerto TCP) en `PANEL_PORT` (5443 por defecto), y MUST NOT servirlo si `PANEL_ENABLED=false`. La app MUST NOT usar HTTP para ninguna función.

#### Scenario: Panel desactivado
- **WHEN** el servidor arranca con `PANEL_ENABLED=false`
- **THEN** no escucha en el puerto del panel y la app funciona igual

### Requirement: Acceso al panel
El panel SHALL autenticar con matrícula y PIN usando el mismo limitador de intentos, y solo `admin` y `teacher` MUST poder entrar. La sesión del panel SHALL ir en una cookie `Secure`, `HttpOnly`, `SameSite=Strict`, caducar tras 8 horas o 30 minutos de inactividad, y toda acción que cambie datos MUST llevar un token anti-CSRF.

#### Scenario: Alumno en el panel
- **WHEN** un alumno intenta entrar al panel con su matrícula y PIN correctos
- **THEN** recibe un mensaje de acceso denegado y no se crea sesión

#### Scenario: Petición sin token
- **WHEN** llega un POST del panel sin token anti-CSRF válido
- **THEN** se rechaza sin cambiar nada

### Requirement: Funciones del administrador
Un `admin` SHALL poder en el panel: gestionar usuarios (alta, rol, restablecer PIN, cerrar sesiones), ver todas las clases, emitir certificados con la frase de la CA a partir de las direcciones detectadas, ver y descargar el QR del servidor, cambiar el nombre del servidor y consultar la auditoría.

#### Scenario: Cambio de red
- **WHEN** el administrador añade una IP, escribe la frase de la CA y pulsa «Emitir»
- **THEN** el servidor usa el certificado nuevo sin reiniciar y el panel muestra el QR actualizado

### Requirement: Funciones del profesor
Un `teacher` SHALL ver y gestionar solo sus clases: integrantes, invitaciones con impresión de sus QR, código de autorregistro, aprobación de solicitudes y lista de asistencia por fechas. Cualquier intento de acceder a otra clase MUST responder como inexistente.

#### Scenario: Clase de otro profesor
- **WHEN** un profesor abre la dirección de una clase que no es suya
- **THEN** el panel responde «no encontrada»

### Requirement: Exportación de asistencia
El panel SHALL exportar la asistencia de una clase (o de la puerta general, solo `admin`) en un rango de fechas como CSV UTF-8 con matrícula, nombre, clase, tipo y fecha y hora locales.

#### Scenario: Exportar noviembre
- **WHEN** el profesor exporta su clase del 1 al 30 de noviembre
- **THEN** descarga un CSV con exactamente los movimientos de ese rango en su clase

### Requirement: Seguridad de las páginas
Las páginas del panel SHALL enviar `Content-Security-Policy` sin scripts de terceros ni en línea, `X-Frame-Options: DENY` y `Referrer-Policy: no-referrer`, y MUST escapar todo dato de usuario mostrado.

#### Scenario: Nombre con HTML
- **WHEN** un usuario se llama `<script>alert(1)</script>`
- **THEN** el panel muestra el texto literal sin ejecutarlo
