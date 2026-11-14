---
version: 1
slug: "mobile-src-app-tsx"
primary_target: "mobile/src/App.tsx"
related_targets: []
---

Scope: app móvil WASAP (Expo/React Native, Android + iPhone, adaptive). Mode: Operate. Audiencia: estudiantes con matrícula, teléfono pequeño, una mano, pasillo o salón con luz de día. Tarea principal: registrar entrada/salida; después chat general, privados y grupos. Restricciones: contrato TCP/TLS existente, sin datos simulados (presencia, no leídos, lectura), sin dependencias nativas nuevas.

## Direction contract
THESIS: WASAP es una sátira cariñosa del mensajero verde: se ve y se usa como el chat que todo estudiante ya domina, pero su pantalla protagonista pasa lista. Rechaza la pila de tarjetas azules idénticas del prototipo.
OWN-WORLD: Verde WASAP profundo (#0A7C5A) para la barra y la acción principal, verde brillante (#1FCB6B) para confirmaciones, burbuja propia verde pálido (#D7F8CF) con cola, fondo de chat arena (#EEE9DF), superficies blancas con hilos; esquema oscuro verde-carbón. Tipografía del sistema (Roboto / SF). Iconos Material en Android, Ionicons en iPhone. Android: barra superior verde, barra de navegación con píldora y FAB; iPhone: título grande claro, barra de pestañas con tinte.
STORY: El estudiante abre, ve si está Dentro o Fuera y cuándo fue su último movimiento, registra con un toque y solo ve la palomita cuando el servidor confirmó; luego chatea sin aprender nada nuevo.
FIRST VIEWPORT: Asistencia: barra WASAP con estado de conexión; bloque de estado a todo el ancho con icono, «Dentro»/«Fuera»/«Sin datos», último movimiento y hora del servidor; botón lleno de 56 pt «Registrar entrada/salida» al alcance del pulgar; debajo filtros de fecha en chips e historial agrupado por día; navegación inferior Asistencia · Chats · Ajustes.
Signature move: la palomita honesta. Reloj = enviado, pendiente de confirmación; palomita = confirmado por el servidor; nunca doble palomita azul de lectura.
FORM: Dirección fijada por el usuario. seed: none (pinned) — "También va a hacer tipo WhatsApp, pero el proyecto se llama Wasap que es una satira a ello, también toma en cuenta que tiene que ser tipo asi con quiza esos colores y una interfaz atractiva"
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Decisiones abiertas: documentación del sistema en mobile/DESIGN.md (confirmado). iPhone sin verificar (requiere macOS).
