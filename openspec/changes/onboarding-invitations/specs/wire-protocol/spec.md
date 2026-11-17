# Spec Delta

## MODIFIED Requirements

### Requirement: Códigos de error
El conjunto de códigos de error SHALL ser: `VALIDATION`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `REQUEST_ID_REUSED`, `INTERNAL`, `UNAVAILABLE`, `UNSUPPORTED_VERSION`, `INVITATION_INVALID`, `PENDING_APPROVAL`.

#### Scenario: Código conocido
- **WHEN** el servidor responde un error
- **THEN** `payload.code` es uno de los códigos listados
