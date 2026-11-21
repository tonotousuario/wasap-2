# Spec Delta

## ADDED Requirements

### Requirement: Configuración del panel
El servidor SHALL configurarse con `PANEL_ENABLED` (verdadero por defecto) y `PANEL_PORT` (5443 por defecto); `compose.yaml` SHALL publicar ese puerto y `compose.local.yaml` solo en `127.0.0.1`.

#### Scenario: Entorno local
- **WHEN** se levanta `compose.local.yaml`
- **THEN** el panel responde en `https://127.0.0.1:5443` y no en otras interfaces
