# Spec Delta

## ADDED Requirements

### Requirement: Selector de servidores
La app SHALL mostrar el servidor activo y permitir cambiarlo desde la barra de Ajustes y desde el acceso, con la lista de servidores (nombre, dirección en uso y si hay sesión) y una acción para escanear un QR nuevo.

#### Scenario: Alumno en dos servidores
- **WHEN** un alumno tiene sesión en los servidores de dos profesores
- **THEN** puede cambiar entre ellos en dos toques y cada uno muestra sus propios chats y asistencia

### Requirement: Iniciales del avatar
Las iniciales SHALL tomarse de la primera y la última palabra que empiezan por letra, ignorando sufijos entre paréntesis como «(tú)» y palabras sin letras.

#### Scenario: Usuario propio en Integrantes
- **WHEN** la lista muestra «Usuario de prueba (tú)»
- **THEN** el avatar muestra «UP», igual que en Ajustes
