# 09 · Distorsiones geométricas por relieve

Visualización didáctica para ilustrar tres efectos clásicos de la geometría SAR sobre relieve:

- **Acortamiento / foreshortening**.
- **Inversión por relieve / layover**.
- **Sombra radar**.

La estructura sigue el mismo patrón que los otros módulos del repositorio:

```text
09-distorsiones-terreno/
├── README.md
├── app.js
├── index.html
└── styles.css
```

## Controles

- Ángulo de incidencia `θ`.
- Pendiente de la ladera orientada hacia el sensor `α`.
- Pendiente opuesta `γ`.
- Altura del relieve.
- Presets para acortamiento, layover y sombra.

La parte inferior del canvas representa la **posición registrada en rango radar** de tres puntos `A`, `B` y `C`. Esto permite ver la compresión de `A′–B′` durante el acortamiento y la inversión de orden durante layover.

## Regla didáctica principal

- Si `0 < α < θ`, la ladera que mira al radar se comprime en rango: **acortamiento**.
- Si `α > θ`, la cima puede registrarse antes que la base cercana: **layover**.
- En la ladera opuesta, una geometría suficientemente oblicua puede impedir la iluminación: **sombra radar**.

## Tarjeta para el catálogo principal

Añadir al `index.html` raíz:

```html
<article class="visual-card">
  <span class="number">09</span>
  <h2>Distorsiones geométricas por relieve</h2>
  <p>
    Acortamiento, inversión por relieve y sombra radar mediante una montaña conceptual,
    ángulo de incidencia y pendientes ajustables.
  </p>
  <a href="09-distorsiones-terreno/">Abrir visualización</a>
</article>
```

## Nota

La geometría está deliberadamente exagerada para fines didácticos. La visualización busca explicar el orden relativo en rango y las condiciones geométricas de cada distorsión, no reproducir un procesador SAR físico completo.
