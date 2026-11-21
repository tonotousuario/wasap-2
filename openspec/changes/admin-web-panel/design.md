# Design

## Context

El servidor es una sola JVM sin framework web; `Service` concentra la lógica y `Tls` crea el contexto TLS (recargable tras `server-identity-and-trust`). El producto se definía «sin HTTP»; el usuario aprobó un panel HTTPS separado (ver `proposal.md`).

## Goals / Non-Goals

**Goals:** panel funcional y seguro para administradores y profesores con dependencias mínimas.

**Non-Goals:** panel para alumnos; API REST pública; tiempo real en el panel (se refresca al navegar).

## Decisions

### D1. `com.sun.net.httpserver.HttpsServer` del JDK
Servidor HTTPS incluido en el JDK, con el mismo `SSLContext` recargable y un ejecutor de hilos virtuales. Sin Ktor ni Spring: el panel son unas pocas páginas y formularios.
- *Alternativa descartada:* Ktor. Mejor ergonomía, pero añade un framework y su superficie de seguridad por poco beneficio.

### D2. HTML renderizado en el servidor, sin JavaScript
Plantillas Kotlin con escape obligatorio (`html { }` propio con funciones que escapan por defecto) y formularios POST con token anti-CSRF ligado a la sesión. CSP `default-src 'self'; script-src 'none'` lo hace verificable. Los QR se generan en el servidor como SVG (biblioteca ZXing core) y se incrustan en la página o se descargan como PNG para imprimir. El diseño visual sigue `mobile/DESIGN.md` (verde profundo, superficies tonales, tipografía del sistema).

### D3. Sesiones del panel
`panel_sessions(token_hash, user_id, created_at, last_seen_at, csrf)` con el mismo esquema de hash que las sesiones de la app; caducidad absoluta de 8 h e inactividad de 30 min. Revalidación de rol con el TTL de 5 s existente.

### D4. Auditoría
`audit_log(id, at, actor_id, action, class_id NULL, details jsonb)` se escribe en la misma transacción que cada mutación de datos. `details` pasa por una lista blanca de campos. Para emitir un certificado, el panel registra la solicitud validada antes de publicar archivos y registra la activación después de recargar el certificado. Ambos eventos incluyen el mismo número de serie. Una solicitud sin evento de activación queda visible para revisión.

### D5. Emisión de certificados desde el panel
Formulario con las direcciones detectadas (editable) y la frase de la CA en un campo de contraseña; la frase solo vive durante la petición y no se registra. Tras emitir, la página muestra el QR nuevo.

## Risks / Trade-offs

- [HTTP en un producto «sin HTTP»] → Puerto separado, desactivable y solo para administración; el principio se reformula explícitamente en `PRODUCT.md`.
- [`HttpsServer` es básico] → Suficiente para formularios; límites de tamaño de cuerpo y tiempos de espera configurados a mano.
- [Panel expuesto en la LAN] → Mismo limitador de intentos; solo `admin` y `teacher`; recomendación de publicarlo solo donde haga falta.

## Migration Plan

`V7` añade tablas. El panel arranca activado; se desactiva con `PANEL_ENABLED=false`. Sin cambios para la app.
