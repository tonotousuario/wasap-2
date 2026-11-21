# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users
Estudiantes con matrícula que registran su entrada/salida y se comunican por chat desde Android o iPhone dentro de una LAN; un administrador que da de alta usuarios y consulta asistencia por consola. Audiencia de presentaciones de avance: profesor y grupo de clase (revisión académica).

## Product Purpose
Wasap 2 registra asistencia alternada (ENTRY/EXIT, sin reinicio diario) y ofrece chat general, privados y grupos por un protocolo propio TCP+TLS. La v2 añade un panel HTTPS independiente para administración y profesores. Éxito: cada operación confirmada se registra exactamente una vez, incluso con reintentos, pérdidas de respuesta o reinicios.

## Positioning
Protocolo propio con tramas `uint32 longitud | JSON UTF-8` sobre TLS, idempotencia por UUID de solicitud y confirmación solo después del commit en PostgreSQL.

## Operating Context
Servidor Kotlin/JVM 25 en Docker, PostgreSQL remoto (solo el servidor tiene credenciales), app Expo/React Native con CA de instalación embebida, puerto 5050 en LAN. La app es nativa y adapta su lenguaje visual por sistema (confirmado el 2026-11-13, sustituye la decisión anterior de un solo diseño compartido): convenciones de Material en Android y de iOS en iPhone, con la misma identidad Wasap, el mismo contenido y los mismos flujos. Uso real: teléfonos pequeños, una mano, teclado abierto y textos largos; interfaz en español.

## Capabilities and Constraints
Grupos ≤100 miembros; mensajes de texto ≤4000 caracteres; sesiones de 24 h guardadas en PostgreSQL (solo el hash del token); sin push, adjuntos, panel web ni creación offline en v1.

## Evidence on Hand
docs/progress.md y docs/mobile-report.md: servidor 3 pruebas unitarias + 11 de integración (PostgreSQL/TLS real) aprobadas; móvil con pruebas de comportamiento + typecheck aprobados; imagen Docker construida (verificación runtime de la imagen final pendiente).

Verificado manualmente en la app (según el encargo del 2026-11-13): inicio de sesión; entrada y salida; persistencia del historial al reiniciar la app; mensajes privados entre dos cuentas; creación de grupos y lectura de su historial; retirada de integrantes y desaparición del grupo para el usuario retirado.

Pendiente: entrega en tiempo real con dos dispositivos simultáneos (no presentarla como verificada); compilación y pruebas en iPhone (requiere macOS); casos negativos de TLS en dispositivo físico. No inventar métricas, usuarios ni resultados fuera de esto.

## Product Principles
- Nunca mostrar una confirmación falsa.
- Reintentar no duplica.
- La identidad siempre viene de la conexión autenticada.
- Secretos fuera de la app y de la imagen.
- La interfaz no simula datos que el servidor no entrega (presencia, no leídos, lectura).

## Accessibility & Inclusion
Áreas seguras, tamaño de fuente del sistema, contraste suficiente, etiquetas para lectores de pantalla y objetivos táctiles de al menos 44–48 puntos. Los controles de navegación seleccionados se ven activos, no deshabilitados. Toda pantalla contempla vacío, carga, error, desconexión y sesión vencida. Ningún estado depende solo del color.
