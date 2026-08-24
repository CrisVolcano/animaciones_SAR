const canvas = document.getElementById("terrain-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  incidenceReadout: document.getElementById("incidence-readout"),
  slopeReadout: document.getElementById("slope-readout"),
  localReadout: document.getElementById("local-readout"),
  effectReadout: document.getElementById("effect-readout"),
  angle: document.getElementById("angle"),
  slope: document.getElementById("slope"),
  backslope: document.getElementById("backslope"),
  height: document.getElementById("height"),
  angleOutput: document.getElementById("angle-output"),
  slopeOutput: document.getElementById("slope-output"),
  backslopeOutput: document.getElementById("backslope-output"),
  heightOutput: document.getElementById("height-output"),
  pulseButton: document.getElementById("pulse-button"),
  demoButton: document.getElementById("demo-button"),
  pauseButton: document.getElementById("pause-button"),
  shorteningMeter: document.getElementById("shortening-meter"),
  layoverMeter: document.getElementById("layover-meter"),
  shadowMeter: document.getElementById("shadow-meter"),
  interpretation: document.getElementById("interpretation"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
};

const colors = {
  beam: "#f2c94c",
  near: "#ef6f51",
  far: "#4da3d9",
  shadow: "#8b9298",
  ground: "#6f5748",
  axis: "#e9f2f4",
  skyTop: "#071018",
  skyMid: "#183948",
  skyBottom: "#76b9df",
  radar: "#72d6bc",
  layover: "#d65b5b",
};

const presets = {
  foreshortening: {
    incidence: 35,
    slope: 22,
    backslope: 38,
    height: 450,
  },
  layover: {
    incidence: 30,
    slope: 48,
    backslope: 36,
    height: 500,
  },
  shadow: {
    incidence: 55,
    slope: 24,
    backslope: 48,
    height: 600,
  },
};

const state = {
  mode: "foreshortening",
  incidence: 35,
  slope: 22,
  backslope: 38,
  height: 450,
  playing: true,
  demo: false,
  demoStart: performance.now(),
  time: 0,
  pulse: 1,
  lastTime: performance.now(),
};

let stage = { width: 0, height: 0, dpr: 1 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const n = Number.parseInt(value, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function metricsFor(values = state) {
  const theta = degToRad(values.incidence);
  const local = values.incidence - values.slope;

  // Compresión relativa frente a terreno plano.
  // 1 = sin(theta-alpha)/sin(theta): 1 en plano, 0 al aproximarse alpha=theta.
  const ratio = Math.sin(degToRad(local)) / Math.max(0.05, Math.sin(theta));
  const shortening = local >= 0 ? clamp(1 - ratio, 0, 1) : 1;
  const layover = local < 0 ? clamp(Math.abs(local) / 35, 0, 1) : clamp((8 - local) / 18, 0, 0.35);

  // Longitud de sombra física idealizada detrás de la cima.
  // Desde la cima, el rayo continúa una distancia H*tan(theta) hasta el plano horizontal.
  // La base opuesta está a H/tan(gamma). El exceso queda oculto.
  const rayRun = values.height * Math.tan(theta);
  const backRun = values.height / Math.max(0.12, Math.tan(degToRad(values.backslope)));
  const shadowLength = Math.max(0, rayRun - backRun);
  const shadow = clamp(shadowLength / Math.max(1, values.height * 1.2), 0, 1);

  let effect = "Sin distorsión fuerte";
  if (local < 0) effect = "Layover";
  else if (shadow > 0.12 && values.incidence > 45) effect = "Sombra";
  else if (shortening > 0.08 && values.slope > 2) effect = "Acortamiento";

  return {
    local,
    ratio,
    shortening,
    layover,
    shadow,
    shadowLength,
    effect,
  };
}

function syncUI() {
  const m = metricsFor();
  ui.angle.value = String(Math.round(state.incidence));
  ui.slope.value = String(Math.round(state.slope));
  ui.backslope.value = String(Math.round(state.backslope));
  ui.height.value = String(Math.round(state.height));

  ui.angleOutput.value = `${Math.round(state.incidence)}°`;
  ui.slopeOutput.value = `${Math.round(state.slope)}°`;
  ui.backslopeOutput.value = `${Math.round(state.backslope)}°`;
  ui.heightOutput.value = `${Math.round(state.height)} m`;

  ui.incidenceReadout.textContent = `${Math.round(state.incidence)}°`;
  ui.slopeReadout.textContent = `${Math.round(state.slope)}°`;
  ui.localReadout.textContent = `${Math.round(m.local)}°`;
  ui.effectReadout.textContent = m.effect;

  ui.shorteningMeter.style.width = `${Math.round(m.shortening * 100)}%`;
  ui.layoverMeter.style.width = `${Math.round(m.layover * 100)}%`;
  ui.shadowMeter.style.width = `${Math.round(m.shadow * 100)}%`;

  ui.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  ui.demoButton.setAttribute("aria-pressed", state.demo ? "true" : "false");
  ui.demoButton.textContent = state.demo ? "Detener" : "Demo";
  ui.pauseButton.textContent = state.playing ? "Pausar" : "Reproducir";

  if (m.local < 0) {
    ui.interpretation.textContent =
      `La pendiente α (${Math.round(state.slope)}°) supera la incidencia θ (${Math.round(state.incidence)}°). ` +
      "La cima puede registrarse antes que la base cercana: el orden en rango se invierte y aparece layover.";
  } else if (m.shadow > 0.12 && state.mode === "shadow") {
    ui.interpretation.textContent =
      `Con una mirada oblicua de ${Math.round(state.incidence)}°, el relieve bloquea parte de la ladera opuesta. ` +
      `La zona sin iluminación aumenta al crecer el ángulo de incidencia; en este esquema equivale a ~${Math.round(m.shadowLength)} m.`;
  } else if (m.shortening > 0.08) {
    ui.interpretation.textContent =
      `La ladera mira hacia el sensor y su incidencia local baja a ${Math.round(m.local)}°. ` +
      `Los puntos de la pendiente quedan más próximos en rango radar: la ladera aparece acortada.`;
  } else {
    ui.interpretation.textContent =
      "Con una pendiente pequeña, la separación entre puntos cambia poco respecto a un terreno plano y la distorsión geométrica es menor.";
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(340, Math.floor(rect.width));
  const height = Math.max(420, Math.floor(rect.height));
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage = { width, height, dpr };
  }
}

function sceneGeometry() {
  const { width: w, height: h } = stage;
  const groundY = h * 0.68;
  const peakX = w * 0.58;
  const heightNorm = clamp((state.height - 100) / 800, 0, 1);
  const reliefPx = mix(h * 0.16, h * 0.33, heightNorm);
  const peak = { x: peakX, y: groundY - reliefPx };

  const nearRun = reliefPx / Math.max(0.18, Math.tan(degToRad(state.slope || 1)));
  const farRun = reliefPx / Math.max(0.18, Math.tan(degToRad(state.backslope)));

  const nearBase = { x: clamp(peakX - nearRun, w * 0.16, peakX - w * 0.07), y: groundY };
  const farBase = { x: clamp(peakX + farRun, peakX + w * 0.07, w * 0.88), y: groundY };

  // Sensor colocado para que la línea sensor-cima tenga el ángulo de incidencia indicado respecto a la vertical.
  const verticalGap = Math.max(h * 0.23, peak.y - h * 0.085);
  const horizontalGap = verticalGap * Math.tan(degToRad(state.incidence));
  const sensor = {
    x: clamp(peak.x - horizontalGap, w * 0.08, peak.x - w * 0.07),
    y: peak.y - verticalGap,
  };

  const rayDir = normalize({ x: peak.x - sensor.x, y: peak.y - sensor.y });
  const tGround = (groundY - peak.y) / Math.max(0.001, rayDir.y);
  const shadowEnd = { x: peak.x + rayDir.x * tGround, y: groundY };

  return { groundY, peak, nearBase, farBase, sensor, shadowEnd, reliefPx };
}

function drawLine(a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawCanvasLabel(x, y, text, fill = "rgba(7, 16, 24, 0.7)", color = "#f4fbff") {
  ctx.save();
  ctx.font = "750 12px Inter, system-ui, sans-serif";
  const padX = 7;
  const width = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y - 15, width, 22, 5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x + padX, y);
  ctx.restore();
}

function drawBackground() {
  const { width: w, height: h } = stage;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, colors.skyTop);
  sky.addColorStop(0.58, colors.skyMid);
  sky.addColorStop(1, colors.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#d7eef5";
  ctx.lineWidth = 1;
  const step = Math.max(48, Math.min(w, h) * 0.1);
  for (let y = h * 0.13; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - h * 0.10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(g) {
  const { width: w, height: h } = stage;
  ctx.save();

  ctx.beginPath();
  ctx.moveTo(0, g.groundY);
  ctx.lineTo(g.nearBase.x, g.nearBase.y);
  ctx.lineTo(g.peak.x, g.peak.y);
  ctx.lineTo(g.farBase.x, g.farBase.y);
  ctx.lineTo(w, g.groundY);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  const ground = ctx.createLinearGradient(0, g.peak.y, 0, h);
  ground.addColorStop(0, "#94755e");
  ground.addColorStop(1, "#45362d");
  ctx.fillStyle = ground;
  ctx.fill();

  ctx.strokeStyle = "rgba(240, 193, 154, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, g.groundY);
  ctx.lineTo(g.nearBase.x, g.nearBase.y);
  ctx.lineTo(g.peak.x, g.peak.y);
  ctx.lineTo(g.farBase.x, g.farBase.y);
  ctx.lineTo(w, g.groundY);
  ctx.stroke();

  ctx.strokeStyle = colors.near;
  ctx.lineWidth = 5;
  drawLine(g.nearBase, g.peak);

  ctx.strokeStyle = colors.far;
  ctx.lineWidth = 5;
  drawLine(g.peak, g.farBase);

  ctx.restore();
}

function drawShadow(g) {
  const shadowStart = g.farBase;
  const shadowEndX = Math.max(shadowStart.x, g.shadowEnd.x);
  if (shadowEndX <= shadowStart.x + 2) return;

  ctx.save();
  ctx.fillStyle = rgba(colors.shadow, state.mode === "shadow" ? 0.52 : 0.30);
  ctx.beginPath();
  ctx.moveTo(g.peak.x, g.peak.y);
  ctx.lineTo(shadowStart.x, shadowStart.y);
  ctx.lineTo(clamp(shadowEndX, shadowStart.x, stage.width * 0.96), g.groundY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = rgba(colors.shadow, 0.9);
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  drawLine(g.peak, { x: clamp(shadowEndX, 0, stage.width), y: g.groundY });
  ctx.setLineDash([]);
  ctx.restore();

  if (state.mode === "shadow") {
    drawCanvasLabel(
      clamp((shadowStart.x + shadowEndX) * 0.5 - 36, 12, stage.width - 95),
      g.groundY - 24,
      "Sombra"
    );
  }
}

function drawSatellite(sensor) {
  ctx.save();
  ctx.translate(sensor.x, sensor.y);
  ctx.rotate(-0.08);
  ctx.fillStyle = "#dbe6ec";
  ctx.strokeStyle = "#17222b";
  ctx.lineWidth = 2;
  ctx.fillRect(-18, -11, 36, 22);
  ctx.strokeRect(-18, -11, 36, 22);
  ctx.fillStyle = "#f2c94c";
  ctx.fillRect(-32, 14, 64, 6);
  ctx.fillStyle = "#4da3d9";
  ctx.fillRect(-49, -7, 23, 14);
  ctx.fillRect(26, -7, 23, 14);
  ctx.restore();
  drawCanvasLabel(sensor.x - 38, sensor.y - 28, "Sensor SAR");
}

function drawRadarLines(g, time) {
  const points = [g.nearBase, g.peak, g.farBase];
  const labels = ["A", "B", "C"];

  ctx.save();
  points.forEach((p, i) => {
    ctx.strokeStyle = rgba(colors.beam, i === 1 ? 0.88 : 0.46);
    ctx.lineWidth = i === 1 ? 2.2 : 1.4;
    if (i !== 1) ctx.setLineDash([5, 5]);
    drawLine(g.sensor, p);
    ctx.setLineDash([]);

    ctx.fillStyle = "#f7fbfd";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    drawCanvasLabel(p.x + 7, p.y - 7, labels[i]);

    if (state.pulse < 1) {
      const t = (state.pulse + i * 0.11) % 1;
      const x = g.sensor.x + (p.x - g.sensor.x) * t;
      const y = g.sensor.y + (p.y - g.sensor.y) * t;
      ctx.fillStyle = colors.beam;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawAngles(g) {
  const theta = degToRad(state.incidence);
  const radius = 42;
  ctx.save();
  ctx.strokeStyle = "rgba(233,242,244,0.84)";
  ctx.lineWidth = 1.6;

  // Vertical / nadir reference at sensor.
  ctx.setLineDash([5, 5]);
  drawLine(g.sensor, { x: g.sensor.x, y: g.sensor.y + 120 });
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(g.sensor.x, g.sensor.y, radius, Math.PI / 2 - theta, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = "#f4fbff";
  ctx.font = "800 13px Inter, system-ui, sans-serif";
  ctx.fillText("θ", g.sensor.x + 13, g.sensor.y + 46);

  // Slope angle alpha near the base.
  const alpha = degToRad(state.slope);
  ctx.beginPath();
  ctx.arc(g.nearBase.x, g.nearBase.y, 37, -alpha, 0);
  ctx.strokeStyle = rgba(colors.near, 0.9);
  ctx.stroke();
  ctx.fillStyle = colors.near;
  ctx.fillText("α", g.nearBase.x + 35, g.nearBase.y - 8);
  ctx.restore();
}

function drawRangeMapping(g) {
  const { width: w, height: h } = stage;
  const y = h * 0.84;
  const x0 = w * 0.10;
  const x1 = w * 0.90;

  const terrainPoints = [g.nearBase, g.peak, g.farBase];
  const ranges = terrainPoints.map((p) => distance(g.sensor, p));
  const minR = Math.min(...ranges);
  const maxR = Math.max(...ranges);
  const pad = Math.max(20, (maxR - minR) * 0.22);

  const mapX = (r) => x0 + ((r - (minR - pad)) / Math.max(1, (maxR + pad) - (minR - pad))) * (x1 - x0);
  const xs = ranges.map(mapX);

  ctx.save();
  ctx.strokeStyle = "rgba(233,242,244,0.66)";
  ctx.lineWidth = 2;
  drawLine({ x: x0, y }, { x: x1, y });

  ctx.fillStyle = "rgba(233,242,244,0.76)";
  ctx.font = "750 12px Inter, system-ui, sans-serif";
  ctx.fillText("Near range", x0, y + 37);
  const farText = "Far range";
  ctx.fillText(farText, x1 - ctx.measureText(farText).width, y + 37);
  ctx.fillText("Posición registrada en rango radar", x0, y - 28);

  const labels = ["A′", "B′", "C′"];
  const pointColors = [colors.near, colors.radar, colors.far];
  xs.forEach((x, i) => {
    ctx.strokeStyle = pointColors[i];
    ctx.lineWidth = 3;
    drawLine({ x, y: y - 10 }, { x, y: y + 10 });
    ctx.fillStyle = pointColors[i];
    ctx.font = "850 13px Inter, system-ui, sans-serif";
    ctx.fillText(labels[i], x - 6, y - 15);
  });

  // Highlight compression/inversion of A-B in range.
  const abLeft = Math.min(xs[0], xs[1]);
  const abRight = Math.max(xs[0], xs[1]);
  ctx.fillStyle = rgba(state.slope > state.incidence ? colors.layover : colors.near, 0.22);
  ctx.fillRect(abLeft, y - 5, Math.max(2, abRight - abLeft), 10);

  if (state.slope > state.incidence) {
    drawCanvasLabel(clamp((xs[0] + xs[1]) / 2 - 45, 8, w - 125), y - 52, "Orden invertido", "rgba(116,31,31,0.80)");
  } else if (state.mode === "foreshortening") {
    drawCanvasLabel(clamp((xs[0] + xs[1]) / 2 - 38, 8, w - 105), y - 52, "Comprimido");
  }

  ctx.restore();
}

function drawEffectTitle(g) {
  const m = metricsFor();
  let title = "Acortamiento (foreshortening)";
  let subtitle = "La ladera se comprime en la coordenada de rango.";
  let color = colors.near;

  if (state.mode === "layover") {
    title = "Inversión por relieve (layover)";
    subtitle = m.local < 0 ? "La cima queda más cerca del radar que la base cercana." : "Aumente α o reduzca θ hasta que α > θ.";
    color = colors.layover;
  } else if (state.mode === "shadow") {
    title = "Sombra radar";
    subtitle = m.shadow > 0.05 ? "Una zona detrás del relieve no recibe iluminación directa." : "Aumente θ para hacer visible la zona de sombra.";
    color = colors.shadow;
  }

  ctx.save();
  ctx.fillStyle = rgba("#071018", 0.72);
  ctx.strokeStyle = rgba(color, 0.85);
  ctx.lineWidth = 1.5;
  const boxW = Math.min(360, stage.width * 0.42);
  const boxH = 62;
  const x = stage.width - boxW - 20;
  const y = 18;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f7fbfd";
  ctx.font = "850 14px Inter, system-ui, sans-serif";
  ctx.fillText(title, x + 14, y + 24);
  ctx.fillStyle = "rgba(233,242,244,0.78)";
  ctx.font = "650 11.5px Inter, system-ui, sans-serif";
  ctx.fillText(subtitle, x + 14, y + 45);
  ctx.restore();
}

function render(time = performance.now()) {
  resizeCanvas();
  syncUI();
  const g = sceneGeometry();

  drawBackground();
  drawTerrain(g);
  drawShadow(g);
  drawRadarLines(g, time);
  drawAngles(g);
  drawSatellite(g.sensor);
  drawRangeMapping(g);
  drawEffectTitle(g);
}

function setMode(mode, applyPreset = true) {
  state.mode = mode;
  if (applyPreset) {
    const preset = presets[mode];
    state.incidence = preset.incidence;
    state.slope = preset.slope;
    state.backslope = preset.backslope;
    state.height = preset.height;
  }
  syncUI();
  render();
}

function animate(now) {
  const dt = Math.min(50, now - state.lastTime);
  state.lastTime = now;

  if (state.playing) {
    state.time += dt / 1000;
    state.pulse = (state.pulse + dt / 1700) % 1;
  }

  if (state.demo) {
    const t = (now - state.demoStart) / 1000;
    const phase = Math.floor(t / 6) % 3;
    const mode = ["foreshortening", "layover", "shadow"][phase];
    if (mode !== state.mode) setMode(mode, true);

    const localT = (t % 6) / 6;
    if (mode === "foreshortening") {
      state.incidence = 28 + localT * 18;
      state.slope = 21;
    } else if (mode === "layover") {
      state.incidence = 38 - localT * 12;
      state.slope = 48;
    } else {
      state.incidence = 38 + localT * 20;
      state.slope = 24;
    }
  }

  render(now);
  requestAnimationFrame(animate);
}

ui.angle.addEventListener("input", (event) => {
  state.demo = false;
  state.incidence = Number(event.target.value);
  render();
});

ui.slope.addEventListener("input", (event) => {
  state.demo = false;
  state.slope = Number(event.target.value);
  render();
});

ui.backslope.addEventListener("input", (event) => {
  state.demo = false;
  state.backslope = Number(event.target.value);
  render();
});

ui.height.addEventListener("input", (event) => {
  state.demo = false;
  state.height = Number(event.target.value);
  render();
});

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.demo = false;
    setMode(button.dataset.mode, true);
  });
});

ui.pulseButton.addEventListener("click", () => {
  state.pulse = 0;
  state.playing = true;
});

ui.demoButton.addEventListener("click", () => {
  state.demo = !state.demo;
  state.demoStart = performance.now();
  state.playing = true;
  if (state.demo) setMode("foreshortening", true);
  syncUI();
});

ui.pauseButton.addEventListener("click", () => {
  state.playing = !state.playing;
  if (!state.playing) state.demo = false;
  syncUI();
});

window.addEventListener("resize", render);

setMode("foreshortening", true);
requestAnimationFrame(animate);
