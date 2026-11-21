# Spec Delta

## Purpose

Registra quién hizo cada acción administrativa y cuándo, para que administradores y profesores puedan revisar cambios sensibles.

## ADDED Requirements

### Requirement: Acciones auditadas
El servidor SHALL registrar con autor, fecha, acción y objeto: altas y cambios de rol, restablecimientos de PIN, cierres de sesión, emisión de certificados, creación y revocación de invitaciones, renovación de códigos de clase y aprobaciones o rechazos. El registro MUST NOT contener PIN, frases ni códigos de invitación.

#### Scenario: Emisión de certificado
- **WHEN** un administrador emite un certificado desde el panel
- **THEN** la auditoría muestra quién, cuándo y las direcciones incluidas, sin la frase

### Requirement: Auditoría previa a la publicación de certificados
El panel SHALL registrar la solicitud validada con el número de serie, el autor y las direcciones antes de publicar el certificado. El panel SHALL registrar la activación con el mismo número de serie después de la recarga.

#### Scenario: No se puede registrar la solicitud
- **WHEN** falla el registro de auditoría antes de la publicación
- **THEN** el panel rechaza la operación y el certificado anterior sigue en uso

### Requirement: Consulta de la auditoría
Un `admin` SHALL consultar toda la auditoría y un `teacher` solo las entradas de sus clases, paginadas y filtrables por fecha.

#### Scenario: Profesor revisa su clase
- **WHEN** un profesor abre la auditoría
- **THEN** solo ve acciones sobre sus clases
