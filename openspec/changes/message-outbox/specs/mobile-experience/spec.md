# Spec Delta

## ADDED Requirements

### Requirement: Mensajes en cola y no enviados en el hilo
El hilo SHALL mostrar al final los mensajes propios en cola con un indicador "pendiente" que no dependa solo del color, y los mensajes no enviados con el motivo y acciones para copiar el texto al compositor o descartarlo. Un mensaje no enviado MUST NOT reenviarse automáticamente.

#### Scenario: Mensaje en cola
- **WHEN** el usuario envía dos mensajes seguidos con la red lenta
- **THEN** ambos aparecen como pendientes en orden y cambian a confirmados al llegar cada respuesta

#### Scenario: Mensaje no enviado
- **WHEN** un mensaje en cola recibe un error definitivo
- **THEN** aparece como no enviado con el motivo y la opción de copiarlo al compositor
