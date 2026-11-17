# Spec Delta

## ADDED Requirements

### Requirement: Aviso de vencimiento próximo
El servidor SHALL registrar un aviso en su salida de error al arrancar y al menos una vez cada 24 horas mientras algún certificado de la cadena venza en menos de 30 días, indicando la fecha de vencimiento.

#### Scenario: Vence en 10 días
- **WHEN** el servidor arranca con un certificado que vence en 10 días
- **THEN** registra un aviso con la fecha de vencimiento y sigue atendiendo conexiones

#### Scenario: Vence en 200 días
- **WHEN** el certificado vence en más de 30 días
- **THEN** no se registra aviso
