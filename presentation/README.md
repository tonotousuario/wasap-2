# Presentación de avances — WASAP 2

## Demostración en red local

Abre [demo.html](demo.html) en el navegador. Incluye siete diapositivas con capturas de referencia, un ejemplo interactivo de las palomitas y la secuencia para presentar con dos teléfonos y el emulador del profesor.

- Avanza con **→** o **Espacio**, vuelve con **←** y pulsa **F** para pantalla completa.
- Pulsa **N** para las notas de la diapositiva. En **Palomitas honestas**, usa los botones o las teclas **1**, **2** y **3**.
- La presentación usa capturas del repositorio y fuentes locales con licencia OFL en `demo-assets/`. Funciona sin conexión cuando se abre desde una copia del repositorio.

## Presentación técnica de avances

Diapositivas animadas hechas con Remotion 4 (1920×1080, 30 fps, 7 s por diapositiva).

```bash
npm install          # una vez
npm run studio       # editar y previsualizar en el navegador
npm run render       # clips en out/clips/, fotos fijas en out/stills/, video completo en out/Presentacion.mp4
npm run stills       # sólo las imágenes fijas (último cuadro de cada diapositiva)
```

## Presentar

Abre `presentar.html` en Chrome o Firefox (después de `npm run render`). Cada diapositiva
se anima y se queda en su último cuadro. Avanza con → o espacio, regresa con ←,
R repite la animación y F activa pantalla completa.

También puedes insertar los clips de `out/clips/` en PowerPoint o Google Slides
(uno por diapositiva, reproducción automática), o usar `out/Presentacion.mp4` corrido.

El contenido sale de `docs/progress.md` y `docs/mobile-report.md`; si cambian los
resultados, edita los textos en `src/slides/`.
