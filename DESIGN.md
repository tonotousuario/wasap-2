---
name: WASAP 2 · Trama en pantalla
description: Mundo técnico-editorial de la presentación de avances; cada diapositiva llega como una trama uint32 longitud | JSON.
colors:
  ground: "#0F1216"
  ground-raised: "#161A20"
  rule: "#2A3039"
  ink: "#E9E4D8"
  ink-soft: "#B6B1A6"
  ink-faint: "#8C887F"
  client: "#F2A33A"
  server: "#7FB2D9"
  verified: "#9CC98A"
  partial: "#E7C36A"
  pending: "#D9644A"
typography:
  display:
    fontFamily: "Instrument Serif, serif"
    fontSize: "280px"
    fontWeight: 400
    lineHeight: 0.86
    letterSpacing: "0.005em"
  headline:
    fontFamily: "Instrument Serif, serif"
    fontSize: "112px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Instrument Serif, serif"
    fontSize: "64px"
    fontWeight: 400
    lineHeight: 1
  body:
    fontFamily: "Literata, serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.4
  body-soft:
    fontFamily: "Literata, serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "26px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  none: "0px"
spacing:
  gutter: "120px"
  head-top: "50px"
  title-top: "150px"
  content-top: "330px"
  content-bottom: "80px"
  row: "17px"
  column-gap: "64px"
components:
  running-head:
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    height: "50px"
  length-prefix:
    textColor: "{colors.client}"
    typography: "{typography.label}"
  length-prefix-boxed:
    textColor: "{colors.client}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  frame-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "17px 0"
  code-pane:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.none}"
    padding: "28px 32px"
  status-mark:
    size: "24px"
    rounded: "{rounded.none}"
---

# Design System: WASAP 2 · Trama en pantalla

> **Alcance.** Este mundo gobierna hoy una sola superficie: la presentación de avances en `presentation/` (Remotion, 1920×1080, 30 fps, 7 s por diapositiva, reproductor de teclado `presentar.html`). La app móvil (`mobile/src/App.tsx`) conserva su propio aspecto previo y **no** sigue este sistema. Extenderlo a la app es una decisión pendiente, no un hecho.

## Overview

**Creative North Star: "La trama en pantalla"**

La presentación se comporta como el protocolo que describe. Cada diapositiva es una trama: arriba, la cabecera de 4 bytes con la longitud real del contenido serializado y su `"type"`; debajo, el contenido que se ensambla mientras los bytes llegan. El mundo es un terminal leído con ojos de editor: fondo grafito azulado, tinta color hueso, una serif de titular condensada y elegante, una serif de lectura sobria y monoespaciada sólo donde hay bytes, código o datos.

La densidad es de pizarra, no de documento: pocas ideas por pantalla, cuerpos grandes (26 px como mínimo en 1920×1080), márgenes de 120 px y mucho aire debajo del contenido. La estructura se dibuja con hilos de 1 px; no hay tarjetas, sombras, brillos ni esquinas redondeadas. El color es semántico antes que decorativo: ámbar es el cliente móvil y la trama en tránsito, azul acero es el servidor, y verde/amarillo/óxido son los tres estados de evidencia.

El movimiento cuenta la llegada de datos: los bytes de la cabecera cuentan hasta su valor, el hilo superior se extiende con la misma curva, las filas se encienden en ámbar y se enfrían a hilo gris al aterrizar. Todo usa una salida exponencial y descansa: el último fotograma de cada clip es la diapositiva en reposo.

**Key Characteristics:**
- Cabecera de trama en cada diapositiva: `00 00 01 DA  "type":"avance.x"  n / 8`.
- Grafito + hueso, acentos sólo con significado (cliente, servidor, estado).
- Tres familias con papeles estrictos: Instrument Serif (titulares), Literata (lectura), JetBrains Mono (bytes, código, datos).
- Hilos de 1 px como única estructura; cero radios, cero sombras.
- Animación de llegada con ease-out exponencial que siempre termina en reposo.

## Colors

Un fondo casi negro con tinte frío, tinta cálida de papel viejo y cinco acentos que siempre significan algo.

### Primary
- **Ámbar de trama** (client): el cliente móvil y todo lo que está en tránsito. Bytes significativos de la cabecera, relleno de llegada de `FrameRow`, el cursor de escritura, el hilo superior de la columna "App móvil", flechas app → servidor y la palabra de cierre en itálica. Es el color más visto, pero nunca de fondo.

### Secondary
- **Azul acero** (server): el servidor y sus respuestas o eventos. Hilo de la columna "Servidor", paquetes de vuelta, etiqueta `servidor` en diagramas de secuencia, borde de la trama ensamblada en "Trama".

### Tertiary (estados de evidencia)
- **Verde liquen** (verified): verificado con prueba. Marca de estado llena y respuesta final correcta en secuencias.
- **Amarillo paja** (partial): parcial. Marca de estado medio llena.
- **Óxido** (pending): pendiente o fallido. Marca abierta, mensaje perdido (línea discontinua con aspa).

### Neutral
- **Grafito azulado** (ground): fondo de todas las diapositivas y del reproductor.
- **Grafito elevado** (ground-raised): única superficie secundaria; panel de código JSON en la portada.
- **Hilo** (rule): líneas de 1 px, carriles de secuencia, bytes nulos encajonados.
- **Hueso** (ink): titulares y texto principal.
- **Hueso apagado** (ink-soft): texto de apoyo, cabecera, notas de fuente, código en reposo.
- **Hueso tenue** (ink-faint): bytes `00` iniciales de la cabecera, conectores en diagramas, pistas del reproductor.

### Named Rules
**The Color Means Something Rule.** Ámbar = cliente/trama, azul = servidor, verde/amarillo/óxido = verificado/parcial/pendiente. Ningún acento se usa sólo para adornar; si un elemento no es de un lado ni de un estado, va en tinta.

**The Faint Zero Rule.** En un prefijo de longitud, los bytes nulos iniciales van en hueso tenue y el ámbar empieza en el primer byte significativo.

## Typography

**Display Font:** Instrument Serif (400, normal e itálica), con serif de respaldo
**Body Font:** Literata (400; cargada también en 500 y 600), con serif de respaldo
**Label/Mono Font:** JetBrains Mono (400; cargada también en 500 y 700), con cifras tabulares

**Character:** Una serif de titular alta y condensada que da voz editorial, sobre una serif de lectura robusta para pantalla proyectada; la mono aparece como evidencia literal, nunca como textura.

### Hierarchy
- **Display** (400, 280 px, 0.86): sólo el nombre del proyecto en la portada.
- **Headline** (400, 112 px, 1, −0.01em, `text-wrap: balance`): título de cada diapositiva dentro de `SlideShell`.
- **Title** (400, 52–68 px, 1–1.1): nombres de nodos, ámbitos y problemas dentro del contenido.
- **Body** (Literata 400, 31–34 px, 1.4–1.45, máximo 38–62ch): explicación principal.
- **Body soft** (Literata 400, 26–29 px, 1.3, ink-soft): evidencia, notas, fuentes.
- **Label** (JetBrains Mono 400, 26 px, tabular): cabecera de trama, tipos de mensaje, operaciones, carriles, estados.

### Named Rules
**The Mono Is Evidence Rule.** JetBrains Mono sólo para bytes, JSON, nombres de mensaje, identificadores, rutas y etiquetas de estado. Prosa en mono es un error.

**The Italic Accent Rule.** La itálica de Instrument Serif en ámbar marca una sola frase clave por diapositiva como máximo (portada: "TCP + TLS"; cierre).

**The 26 px Floor Rule.** Nada en la diapositiva baja de 24 px a 1920×1080; el piso habitual es 26 px.

## Layout

Lienzo fijo de 1920×1080. Margen lateral de 120 px (`GUTTER`) en todas las diapositivas. Esqueleto de `SlideShell`: cabecera de trama a 50 px del borde superior, hilo a 100 px, titular a 150 px, contenido desde 330 px hasta 80 px del borde inferior. La portada rompe el esqueleto a propósito: titular gigante a la izquierda (860 px) y panel de trama a la derecha (760 px).

El contenido se organiza en columnas definidas por hilos superiores, no por cajas: tres columnas con 64 px de separación, rejillas de tabla (`500px 250px 1fr`) con filas de 17 px de relleno vertical, o un diagrama SVG con una nota al lado. El texto de lectura se limita a 38–62ch. Se deja aire libre en la parte inferior en vez de llenar la pantalla.

### Motion
Una sola curva: `Easing.out(Easing.exp)` vía `ease(frame, start, duration)`, 24–30 fotogramas por defecto. Entradas escalonadas de 10–12 fotogramas. `Rise` levanta 22 px con fundido; `FrameRow` llena un hilo ámbar de 2 px en 16 fotogramas, lo enfría a 0 en los 24 siguientes y deja aterrizar el contenido 14 px. La escritura de código va a 60–150 caracteres por segundo con cursor `▍` ámbar. Cada clip de 210 fotogramas termina en reposo.

## Elevation & Depth

Plano por completo. No hay sombras, brillos, desenfoques ni degradados. La profundidad se expresa con un único escalón tonal (grafito → grafito elevado, sólo para el panel de código) y con hilos de 1 px. La jerarquía la hacen el tamaño tipográfico y el color semántico, no la elevación.

### Named Rules
**The Hairline Structure Rule.** La estructura (separadores, carriles, hilos superiores de columna, bordes de byte) se dibuja con hilos de 1 px en `rule` o en el color semántico del lado. El trazo de 2 px queda reservado para la señal: mensajes y enlaces en diagramas, el contorno de la marca de estado y el relleno de llegada de una trama, que se enfría y desaparece.

## Shapes

Ángulos rectos en todo (radio 0). Las formas recurrentes son geométricas y técnicas: cuadrados de estado de 22 px de caja (lleno, medio, abierto), paquetes rectangulares de 18×12 px que viajan por los enlaces, bytes encajonados con borde de 1 px, flechas de punta abierta y un aspa para la pérdida. Todo icono es SVG dibujado, nunca un glifo.

## Components

### Running Head (SlideShell)
Cabecera de trama de cada diapositiva. Mono 26 px en hueso apagado: prefijo de longitud que cuenta hasta los bytes del contenido serializado (`frameBytes`), luego `"type":"avance.<slug>"` con el valor en hueso, y `n / 8` alineado a la derecha. Debajo, un hilo de 1 px que se extiende con el mismo progreso. El número es real: refleja el JSON del contenido de esa diapositiva.

### Length Prefix
Cuatro bytes hex en mayúsculas con cifras tabulares. Variante simple en línea (26 px, separación 10 px) y variante encajonada (40 px, relleno 8×12, borde 1 px en ámbar para bytes significativos o en `rule` para nulos).

### Frame Row
Fila de lista o tabla que llega como trama: hilo de 1 px en `rule`, sobre él un relleno ámbar de 2 px que avanza y se enfría, y el contenido que aterriza. Se usa para estado, alcance y siguientes pasos, con escalones de 10 fotogramas.

### Status Mark
Cuadrado SVG de 24 px con trazo de 2 px en el color del estado: lleno (verificado), mitad izquierda (parcial), abierto (pendiente). El relleno crece de abajo arriba. Siempre acompañado de la etiqueta mono "Verificado / Parcial / Pendiente".

### Code Pane
Bloque JSON en mono 25 px, interlineado 1.55, sobre grafito elevado, con hilo superior de 1 px en ámbar y relleno 28×32. Es la única superficie elevada del sistema.

### Node Column
Columna de diagrama: hilo superior de 1 px en el color del lado, nombre en Instrument Serif 64–68 px, líneas de detalle en Literata 29 px hueso apagado. Las columnas se conectan con enlaces SVG grises y paquetes que viajan en el color del emisor.

### Player (presentar.html)
Reproductor a pantalla completa sobre `ground`, vídeo en `object-fit: contain`. Pista de teclado discreta abajo a la izquierda que se oculta tras 2.5 s sin movimiento, con teclas en ámbar.

## Do's and Don'ts

### Do:
- **Do** enmarcar toda diapositiva nueva con `SlideShell`, dándole un `type` `avance.<slug>` y los bytes reales de su contenido.
- **Do** asignar ámbar al cliente y azul acero al servidor en cualquier diagrama, y verde/amarillo/óxido sólo a estados de evidencia.
- **Do** dibujar estructura con hilos de 1 px, reservar 2 px para mensajes y señales, y mantener el margen de 120 px.
- **Do** usar `ease` (salida exponencial) para toda entrada y dejar que el clip termine en reposo.
- **Do** dibujar marcas, flechas y paquetes en SVG.

### Don't:
- **Don't** usar tarjetas con fondo, sombras, brillos, degradados ni esquinas redondeadas.
- **Don't** escribir prosa en JetBrains Mono ni bytes o código en serif.
- **Don't** usar un acento como decoración sin su significado de lado o estado.
- **Don't** volver a la plantilla de título + viñetas + tarjetas iguales.
- **Don't** asumir que la app móvil sigue este sistema; hoy no lo hace.
