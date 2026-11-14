# Presentación de avances — WASAP 2

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
