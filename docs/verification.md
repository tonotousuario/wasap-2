# Evidencia y estado de verificación

Fecha de esta actualización: **14 de noviembre de 2026**.

## Capturas reales de Android

Las imágenes corresponden al build instalado en `emulator-5554`, con código
cargado desde Metro y conexión al servidor local mediante `adb reverse`.
Muestran la cuenta DEMO002 y movimientos de prueba autorizados por el usuario.
No son mockups.

| Entrada confirmada: Dentro | Salida confirmada: Fuera |
| --- | --- |
| <img src="images/android-attendance-inside.png" alt="WASAP Android: Dentro, entrada confirmada e historial" width="300"> | <img src="images/android-attendance-outside.png" alt="WASAP Android: Fuera, salida confirmada e historial" width="300"> |

El servidor devolvió exactamente dos movimientos para DEMO002:

| Movimiento | Instante UTC | America/Mexico_City |
| --- | --- | --- |
| ENTRY | 2026-11-14T19:34:06.997118Z | 13:34:06 |
| EXIT | 2026-11-14T19:34:30.595020Z | 13:34:30 |

Se comprobaron título de estado, siguiente acción, sello de confirmación e
historial. Una revisión visual independiente consideró Dentro/Fuera resueltos.
Los chips son legibles y la selección es visible; no se verificó la interacción
del selector de fechas en esa pasada. No existe un veredicto global de «ship».

## Comprobaciones realizadas

| Área | Evidencia | Alcance |
| --- | --- | --- |
| Móvil | 40 pruebas y TypeScript aprobados en la última ejecución de implementación | Protocolo, recuperación, diario, filtros, calendario y presentación |
| Servidor | 3 pruebas unitarias y 13 de integración aprobadas | PostgreSQL desechable, TLS, permisos, reintentos, paginación y fechas |
| Compose local | Imagen construida, servidor iniciado y healthcheck aprobado | Conexión TLS y base disponibles |
| Configuración Expo | `expo config --type public` válido | CA, plugins, permisos e identificadores |
| Impeccable Doctor | Sin findings para `mobile/src/App.tsx` | Configuración de la herramienta; no equivale a revisión visual |
| Android manual | Login, aviso de sesión vencida, Dentro/Fuera e historial | Un emulador y cuenta de prueba |

Las pruebas manuales anteriores reportadas por el usuario incluyen privados,
grupos y retirada de integrantes. No equivalen a probar dos dispositivos
conectados simultáneamente.

## Pendientes conservados

| Pendiente | Qué falta comprobar o construir |
| --- | --- |
| Operación pendiente | Capturar el reloj y recuperación tras cortar la conexión durante el envío |
| Integrantes | Revisar esa pantalla y sus acciones en dispositivo |
| Accesibilidad | Repetir los nuevos estados con fuente ampliada y navegación asistida |
| iPhone | Compilación en macOS y pruebas reales de navegación, TLS y red local |
| Tema oscuro | Habilitar integración nativa, recompilar y revisar ambos temas |
| Icono y arranque | Sustituir los recursos predeterminados y verificar el binario |
| Dos dispositivos | Comprobar entrega simultánea y recuperación |
| TLS negativo | CA incorrecta, expiración y SAN incorrecto en dispositivo |

No se han añadido confirmaciones de lectura, presencia, notificaciones push,
adjuntos ni nuevas mutaciones offline.

## Repetir las comprobaciones

Desde `mobile/`:

```bash
npm test
npm run typecheck
export WASAP_CA_PEM="$(cat ../certs/ca.crt)"
npx expo config --type public
```

Para las pruebas del servidor y PostgreSQL desechable, sigue
[el README principal](../README.md#desarrollo-y-pruebas). Para revisar el entorno
en ejecución utiliza [la guía local](local-runtime.md).

El informe histórico permanece en [mobile-report.md](mobile-report.md);
sus apartados antiguos describen el estado de aquella ejecución.
