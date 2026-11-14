---
version: 1
slug: "presentation-src-index-ts"
primary_target: "presentation/src/index.ts"
related_targets: []
---

Scope: presentación de avances (diapositivas animadas Remotion, 1920x1080). Mode: Read. Audiencia: profesor y clase.

## Direction contract
THESIS: La presentación se transmite como el propio protocolo: cada diapositiva llega como una trama `uint32 longitud | JSON` que se ensambla en pantalla. Rechaza la plantilla de título + viñetas + tarjetas iguales.
OWN-WORLD: Fondo grafito azulado (#0F1216), tinta hueso (#E9E4D8). Ámbar (#F2A33A) = cliente móvil / trama; azul acero (#7FB2D9) = servidor; verde liquen (#9CC98A) = verificado; ámbar tenue = parcial; óxido (#D9644A) = pendiente. Instrument Serif para títulos, Literata para lectura, JetBrains Mono sólo para bytes, código y datos. Hilos 1px, sin brillos ni sombras.
STORY: Entender qué es WASAP 2, cómo funciona el protocolo, qué está verificado con evidencia y qué falta; terminar con próximos pasos concretos.
FIRST VIEWPORT: Portada: a la izquierda título serif enorme "WASAP 2"; debajo subtítulo; a la derecha la cabecera hex `00 00 00 xx` que cuenta bytes mientras el JSON de `auth.login` se escribe; pie con fecha y rama.
FORM: Dirección fijada por el usuario (técnico-editorial: fondo oscuro tipo terminal, mono + serif, tramas del protocolo animándose). seed: none (pinned) — "Fondo oscuro tipo terminal, tipografía monoespaciada + serif, tramas del protocolo animándose."
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
