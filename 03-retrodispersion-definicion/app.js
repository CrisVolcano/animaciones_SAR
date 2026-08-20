const canvas = document.getElementById("sar-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  phase: document.getElementById("phase-readout"),
  returnReadout: document.getElementById("return-readout"),
  sigma: document.getElementById("sigma-readout"),
  interpretation: document.getElementById("interpretation"),
  pulseButton: document.getElementById("pulse-button"),
  playButton: document.getElementById("play-button"),
  resetButton: document.getElementById("reset-button"),
  lossMeter: document.getElementById("loss-meter"),
  specularMeter: document.getElementById("specular-meter"),
  scatterMeter: document.getElementById("scatter-meter"),
  backscatterMeter: document.getElementById("backscatter-meter"),
  targetButtons: [...document.querySelectorAll("[data-target]")],
  stepButtons: [...document.querySelectorAll("[data-step]")],
};

const colors = {
  pulse: "#f2c94c",
  scatter: "#48abc1",
  back: "#f08a24",
  loss: "#8f9aa2",
  volume: "#67b36f",
  double: "#d16473",
  textDark: "#17222b",
  skyTop: "#071018",
  skyMid: "#193b49",
  skyBottom: "#76b9df",
};

const targets = {
  water: {
    name: "Agua lisa",
    surfaceTexture: 0.1,
    materialResponse: 0.72,
    volume: 0.01,
    doubleBounce: 0,
    specular: 0.86,
    scatter: 0.08,
    backscatter: 0.09,
    loss: 0.28,
    label: "Superficie especular",
    note:
      "En agua lisa la señal se refleja como espejo. La mayor parte se aleja del sensor, por eso regresa poca energía.",
  },
  soil: {
    name: "Suelo rugoso",
    surfaceTexture: 0.58,
    materialResponse: 0.56,
    volume: 0.04,
    doubleBounce: 0.03,
    specular: 0.24,
    scatter: 0.62,
    backscatter: 0.23,
    loss: 0.42,
    label: "Microrelieve",
    note:
      "En suelo rugoso la energía se reparte en muchas direcciones. Una fracción de esa energía queda orientada hacia la antena.",
  },
  forest: {
    name: "Bosque",
    surfaceTexture: 0.72,
    materialResponse: 0.62,
    volume: 0.78,
    doubleBounce: 0.16,
    specular: 0.12,
    scatter: 0.82,
    backscatter: 0.44,
    loss: 0.31,
    label: "Volumen vegetal",
    note:
      "En vegetación, hojas, ramas y troncos multiplican los caminos de scattering. Parte de esa energía queda orientada hacia la línea de vista del radar.",
  },
  corner: {
    name: "Esquina urbana",
    surfaceTexture: 0.34,
    materialResponse: 0.82,
    volume: 0.02,
    doubleBounce: 0.92,
    specular: 0.48,
    scatter: 0.42,
    backscatter: 0.74,
    loss: 0.18,
    label: "Doble rebote",
    note:
      "Una esquina formada por pared y suelo puede devolver la onda hacia la antena mediante doble rebote, por eso genera retornos intensos.",
  },
};

const phases = [
  { name: "Emisión", start: 0, end: 0.2 },
  { name: "Interacción", start: 0.2, end: 0.4 },
  { name: "Dispersión", start: 0.4, end: 0.66 },
  { name: "Retorno", start: 0.66, end: 0.88 },
  { name: "Medición", start: 0.88, end: 1 },
];

const scatterAngles = [-168, -144, -121, -96, -72, -49, -27, -9, 13];

const stars = Array.from({ length: 135 }, (_, index) => ({
  x: pseudo(index * 11.31),
  y: pseudo(index * 27.7 + 5) * 0.58,
  size: 0.55 + pseudo(index * 6.19) * 1.8,
  twinkle: pseudo(index * 2.41) * Math.PI * 2,
}));

const state = {
  target: "soil",
  playing: true,
  timeline: 0,
  lastTime: performance.now(),
  pulseFlash: 0,
};

let stage = { width: 0, height: 0, dpr: 1 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function pseudo(seed) {
  return Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const n = Number.parseInt(value, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function phaseProgress(index) {
  const phase = phases[index];
  return clamp((state.timeline - phase.start) / (phase.end - phase.start), 0, 1);
}

function activePhaseIndex() {
  return phases.findIndex((phase) => state.timeline >= phase.start && state.timeline < phase.end);
}

function currentPhase() {
  const index = activePhaseIndex();
  return phases[index === -1 ? phases.length - 1 : index];
}

function metricsFor(values = state) {
  const target = targets[values.target];
  const rough = target.surfaceTexture;
  const materialResponse = target.materialResponse;
  const reflectivity = clamp(0.18 + materialResponse * 0.68, 0.05, 0.95);
  const specular = target.specular;
  const scatter = target.scatter;
  const volume = target.volume;
  const doubleBounce = target.doubleBounce;
  const backscatter = target.backscatter;
  const loss = target.loss;
  const sigma = -34 + 36 * backscatter ** 0.72;

  return {
    rough,
    materialResponse,
    reflectivity,
    specular,
    scatter,
    volume,
    doubleBounce,
    backscatter,
    loss,
    sigma,
  };
}

function syncUI() {
  const metrics = metricsFor();
  const target = targets[state.target];
  const phase = currentPhase();
  ui.phase.textContent = phase.name;
  ui.returnReadout.textContent = `${Math.round(metrics.backscatter * 100)}%`;
  ui.sigma.textContent = `${metrics.sigma.toFixed(0)} dB`;
  ui.lossMeter.style.width = `${Math.round(metrics.loss * 100)}%`;
  ui.specularMeter.style.width = `${Math.round(metrics.specular * 100)}%`;
  ui.scatterMeter.style.width = `${Math.round(metrics.scatter * 100)}%`;
  ui.backscatterMeter.style.width = `${Math.round(metrics.backscatter * 100)}%`;

  const extra =
    metrics.backscatter > 0.68
      ? " En la imagen SAR se vería como un tono claro."
      : metrics.backscatter < 0.18
        ? " En la imagen SAR se vería como un tono oscuro."
        : " En la imagen SAR se vería como un tono intermedio.";
  ui.interpretation.textContent = `${target.note}${extra}`;

  ui.targetButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.target === state.target);
  });
  ui.stepButtons.forEach((button, index) => {
    button.classList.toggle("is-active", currentPhase() === phases[index]);
  });
  ui.playButton.textContent = state.playing ? "Pausar" : "Reproducir";
  ui.playButton.setAttribute("aria-pressed", state.playing ? "true" : "false");
}

function setState(next) {
  if (next.target && targets[next.target]) state.target = next.target;
  syncUI();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(320, Math.floor(rect.height));
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage = { width, height, dpr };
  }
}

function sensorPoint(w, h) {
  return { x: w * 0.17, y: h * 0.16 };
}

function targetPoint(w, h) {
  const x = w * 0.56;
  return { x, y: terrainY(x, w, h) - h * 0.01 };
}

function terrainBase(h) {
  return h * 0.76;
}

function terrainY(x, w, h) {
  const metrics = metricsFor();
  const base = terrainBase(h);
  const nx = x / w;
  const amp = mix(h * 0.004, h * 0.045, metrics.rough);
  const wave =
    Math.sin(nx * Math.PI * 9 + 0.7) * 0.34 +
    Math.sin(nx * Math.PI * 31 + 1.8) * 0.24 +
    (pseudo(Math.floor(nx * 95) + 17) - 0.5) * 0.22;
  if (state.target === "water") {
    return base + Math.sin(nx * Math.PI * 4) * h * 0.003;
  }
  return base - Math.abs(wave * amp);
}

function drawBackground(time) {
  const { width: w, height: h } = stage;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, colors.skyTop);
  sky.addColorStop(0.56, colors.skyMid);
  sky.addColorStop(1, colors.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  for (const star of stars) {
    const alpha = 0.36 + 0.46 * Math.sin(time * 0.0014 + star.twinkle) ** 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(245, 251, 255, ${alpha})`;
    ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  const glow = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.76);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.15)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, h * 0.48, w, h * 0.28);
}

function drawBeamCone() {
  const { width: w, height: h } = stage;
  const sensor = sensorPoint(w, h);
  const target = targetPoint(w, h);
  ctx.save();
  ctx.fillStyle = rgba(colors.pulse, 0.1);
  ctx.beginPath();
  ctx.moveTo(sensor.x, sensor.y);
  ctx.lineTo(target.x - w * 0.14, target.y + h * 0.06);
  ctx.lineTo(target.x + w * 0.17, target.y + h * 0.07);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(colors.pulse, 0.24);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sensor.x, sensor.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.restore();
}

function drawSatellite(time) {
  const { width: w, height: h } = stage;
  const p = sensorPoint(w, h);
  const scale = Math.min(w, h) * 0.074;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-0.18);
  ctx.strokeStyle = "#f5fbff";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(245, 251, 255, 0.08)";
  ctx.strokeRect(-scale * 0.18, -scale * 0.16, scale * 0.36, scale * 0.32);
  ctx.beginPath();
  ctx.arc(0, 0, scale * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  drawPanel(-scale * 1.05, -scale * 0.22, scale * 0.82, scale * 0.44);
  drawPanel(scale * 0.23, -scale * 0.22, scale * 0.82, scale * 0.44);
  ctx.beginPath();
  ctx.moveTo(-scale * 0.08, scale * 0.2);
  ctx.lineTo(-scale * 0.34, scale * 0.58);
  ctx.lineTo(scale * 0.34, scale * 0.58);
  ctx.lineTo(scale * 0.08, scale * 0.2);
  ctx.stroke();
  ctx.fillStyle = rgba(colors.back, 0.45 + 0.35 * Math.sin(time * 0.004) ** 2 + state.pulseFlash * 0.3);
  ctx.beginPath();
  ctx.arc(0, scale * 0.29, scale * 0.052, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawCanvasLabel(p.x + scale * 1.1, p.y - scale * 0.55, "Sensor SAR", "rgba(7, 16, 24, 0.62)");
}

function drawPanel(x, y, width, height) {
  ctx.strokeRect(x, y, width, height);
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + (width * i) / 4, y);
    ctx.lineTo(x + (width * i) / 4, y + height);
    ctx.stroke();
  }
}

function drawGround(time) {
  const { width: w, height: h } = stage;
  const metrics = metricsFor();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, terrainY(0, w, h));
  const samples = 150;
  for (let i = 1; i <= samples; i += 1) {
    const x = (i / samples) * w;
    ctx.lineTo(x, terrainY(x, w, h));
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  const fill = ctx.createLinearGradient(0, terrainBase(h), 0, h);
  if (state.target === "water") {
    fill.addColorStop(0, "#316f86");
    fill.addColorStop(1, "#123543");
  } else if (state.target === "corner") {
    fill.addColorStop(0, "#6d7479");
    fill.addColorStop(1, "#333a40");
  } else {
    fill.addColorStop(0, metrics.materialResponse > 0.58 ? "#65564c" : "#95715e");
    fill.addColorStop(1, "#453328");
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle =
    state.target === "water" ? "rgba(178, 224, 241, 0.72)" : "rgba(238, 176, 132, 0.55)";
  ctx.lineWidth = state.target === "water" ? 2.6 : 2;
  ctx.stroke();

  if (state.target === "water") {
    ctx.strokeStyle = rgba("#d6f3ff", 0.2 + state.pulseFlash * 0.15);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i += 1) {
      const y = terrainBase(h) + h * (0.025 + i * 0.023);
      ctx.beginPath();
      for (let x = w * 0.06; x <= w * 0.96; x += 18) {
        const wave = Math.sin(x * 0.012 + time * 0.001 + i) * 2.2;
        if (x === w * 0.06) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawTarget(time) {
  const { width: w, height: h } = stage;
  const target = targetPoint(w, h);
  const metrics = metricsFor();

  if (state.target === "forest") drawForest(time);
  if (state.target === "corner") drawCorner(target, metrics);
  if (state.target === "soil") drawRoughSoil(target, metrics);
  if (state.target === "water") drawWaterGlint(target);

  const interaction = phaseProgress(1);
  const radius = 10 + interaction * 28 + state.pulseFlash * 12;
  ctx.save();
  ctx.globalAlpha = 0.25 + interaction * 0.45 + state.pulseFlash * 0.25;
  ctx.strokeStyle = colors.pulse;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRoughSoil(target, metrics) {
  const { width: w, height: h } = stage;
  ctx.save();
  ctx.strokeStyle = rgba(colors.scatter, 0.32 + metrics.rough * 0.28);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 24; i += 1) {
    const x = target.x + (pseudo(i + 2) - 0.5) * w * 0.34;
    const y = terrainY(x, w, h);
    const pebble = 2 + pseudo(i + 3) * 5 + metrics.rough * 6;
    ctx.beginPath();
    ctx.arc(x, y - pebble * 0.5, pebble, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWaterGlint(target) {
  ctx.save();
  ctx.strokeStyle = rgba(colors.pulse, 0.55 + state.pulseFlash * 0.24);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(target.x - 44, target.y + 5);
  ctx.lineTo(target.x + 68, target.y - 3);
  ctx.stroke();
  drawCanvasLabel(target.x + 78, target.y - 18, targets.water.label, "rgba(7, 16, 24, 0.58)");
  ctx.restore();
}

function drawForest(time) {
  const { width: w, height: h } = stage;
  const metrics = metricsFor();
  const trees = 15;
  for (let i = 0; i < trees; i += 1) {
    const x = w * (0.33 + i * 0.031 + (pseudo(i + 5) - 0.5) * 0.02);
    const ground = terrainY(x, w, h);
    const height = h * (0.12 + pseudo(i + 8) * 0.12);
    const trunk = 3 + pseudo(i + 1) * 4;
    ctx.fillStyle = "#5a3b2c";
    ctx.fillRect(x - trunk * 0.5, ground - height * 0.78, trunk, height * 0.78);
    const canopyR = height * 0.35;
    const sway = Math.sin(time * 0.001 + i) * 1.4;
    const canopy = ctx.createRadialGradient(x + sway, ground - height, canopyR * 0.12, x, ground - height, canopyR);
    canopy.addColorStop(0, rgba("#a4d994", 0.78));
    canopy.addColorStop(1, rgba("#245f3f", 0.7 + metrics.volume * 0.25));
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.ellipse(x + sway, ground - height, canopyR * 1.08, canopyR * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCorner(target, metrics) {
  const { width: w, height: h } = stage;
  const size = Math.min(w, h) * 0.15;
  const x = target.x - size * 0.25;
  const ground = terrainY(target.x, w, h);
  ctx.save();
  ctx.fillStyle = "#75848d";
  ctx.strokeStyle = "rgba(238, 248, 250, 0.58)";
  ctx.lineWidth = 2;
  ctx.fillRect(x, ground - size, size * 0.72, size);
  ctx.strokeRect(x, ground - size, size * 0.72, size);
  ctx.fillStyle = "#4a5359";
  ctx.fillRect(x + size * 0.72, ground - size * 0.78, size * 0.56, size * 0.78);
  ctx.strokeRect(x + size * 0.72, ground - size * 0.78, size * 0.56, size * 0.78);
  ctx.fillStyle = rgba(colors.pulse, 0.35 + metrics.doubleBounce * 0.22);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      ctx.fillRect(x + 13 + col * 26, ground - size + 17 + row * 24, 12, 9);
    }
  }
  ctx.strokeStyle = rgba(colors.double, 0.76);
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.3, ground - size * 0.7);
  ctx.lineTo(x + size * 0.82, ground - size * 0.28);
  ctx.lineTo(x + size * 0.35, ground - 4);
  ctx.stroke();
  drawCanvasLabel(x + size * 0.58, ground - size - 22, targets.corner.label, "rgba(7, 16, 24, 0.58)");
  ctx.restore();
}

function drawIncidentRay() {
  const { width: w, height: h } = stage;
  const start = sensorPoint(w, h);
  const end = targetPoint(w, h);
  const progress = Math.max(phaseProgress(0), phaseProgress(1) * 0.92);
  drawPath(start, end, progress, colors.pulse, 0.96, 4, false);
  if (progress > 0.96) {
    drawArrowHead(start, end, colors.pulse, 0.82, 13);
  }
}

function drawScatterRays() {
  const { width: w, height: h } = stage;
  const origin = targetPoint(w, h);
  const metrics = metricsFor();
  const progress = Math.max(phaseProgress(2), phaseProgress(3) * 0.7);
  if (progress <= 0) return;

  const rayLength = Math.min(w, h) * mix(0.2, 0.42, metrics.scatter);
  scatterAngles.forEach((degrees, index) => {
    const angle = (degrees * Math.PI) / 180;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const strength = 0.18 + pseudo(index + 10) * 0.44 + metrics.scatter * 0.32;
    const color = state.target === "forest" && index % 2 === 0 ? colors.volume : colors.scatter;
    drawMovingRay(origin, direction, rayLength * (0.72 + pseudo(index) * 0.48), progress, color, strength, 2.1);
  });

  const specDir = normalize({ x: 0.58, y: -0.34 });
  drawMovingRay(origin, specDir, rayLength * 1.16, progress, colors.pulse, 0.35 + metrics.specular * 0.38, 3);

  if (state.target === "forest") {
    for (let i = 0; i < 8; i += 1) {
      const p = {
        x: origin.x + (pseudo(i + 31) - 0.5) * w * 0.16,
        y: origin.y - h * (0.05 + pseudo(i + 22) * 0.15),
      };
      const direction = normalize({ x: pseudo(i + 14) - 0.5, y: -0.15 - pseudo(i + 17) * 0.8 });
      drawMovingRay(p, direction, rayLength * 0.46, progress, colors.volume, 0.32 + metrics.volume * 0.36, 1.8);
    }
  }
}

function drawBackscatterRay() {
  const { width: w, height: h } = stage;
  const start = targetPoint(w, h);
  const end = sensorPoint(w, h);
  const metrics = metricsFor();
  const progress = Math.max(phaseProgress(3), phaseProgress(4));
  if (progress <= 0) return;
  drawPath(start, end, progress, colors.back, 0.42 + metrics.backscatter * 0.5, 4.4 + metrics.backscatter * 2.2, true);
  if (progress > 0.86) {
    drawArrowHead(start, end, colors.back, 0.9, 14);
  }
}

function drawLoss(time) {
  const { width: w, height: h } = stage;
  const origin = targetPoint(w, h);
  const metrics = metricsFor();
  const progress = phaseProgress(2);
  if (progress <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = progress * (0.24 + metrics.loss * 0.42);
  ctx.strokeStyle = rgba(colors.loss, 0.75);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i += 1) {
    const angle = Math.PI / 2 + (pseudo(i + 41) - 0.5) * 1.1;
    const length = Math.min(w, h) * (0.04 + pseudo(i + 12) * 0.1) * (0.65 + metrics.loss);
    const wobble = Math.sin(time * 0.002 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(origin.x + (pseudo(i + 3) - 0.5) * 44, origin.y + 4);
    ctx.lineTo(origin.x + Math.cos(angle) * length + wobble, origin.y + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMeasurement() {
  const { width: w, height: h } = stage;
  const progress = phaseProgress(4);
  if (progress <= 0) return;
  const sensor = sensorPoint(w, h);
  const metrics = metricsFor();
  const radius = 20 + progress * 34 + metrics.backscatter * 18;

  ctx.save();
  ctx.globalAlpha = progress;
  ctx.strokeStyle = rgba(colors.back, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sensor.x, sensor.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(7, 16, 24, 0.68)";
  roundRect(sensor.x + 34, sensor.y + 20, 148, 58, 8);
  ctx.fill();
  ctx.strokeStyle = rgba(colors.back, 0.52);
  ctx.stroke();
  ctx.fillStyle = "#f8fbfc";
  ctx.font = "800 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Señal recibida", sensor.x + 46, sensor.y + 43);
  ctx.fillStyle = colors.back;
  ctx.font = "900 18px system-ui, sans-serif";
  ctx.fillText(`${Math.round(metrics.backscatter * 100)}%`, sensor.x + 46, sensor.y + 66);
  ctx.restore();
}

function drawCanvasLabels() {
  const { width: w, height: h } = stage;
  const origin = targetPoint(w, h);
  const phase = currentPhase().name;
  if (phase === "Emisión") {
    drawCanvasLabel(w * 0.3, h * 0.28, "El radar ilumina el blanco", "rgba(7, 16, 24, 0.58)");
  } else if (phase === "Interacción") {
    drawCanvasLabel(origin.x + 22, origin.y - 52, "La onda interactúa con material y geometría", "rgba(7, 16, 24, 0.62)");
  } else if (phase === "Dispersión") {
    drawCanvasLabel(origin.x + 38, origin.y - h * 0.19, "La energía se reparte en varias direcciones", "rgba(7, 16, 24, 0.62)");
  } else if (phase === "Retorno") {
    drawCanvasLabel(w * 0.31, h * 0.38, "Retrodispersión: la fracción que vuelve", "rgba(7, 16, 24, 0.68)");
  } else {
    drawCanvasLabel(w * 0.43, h * 0.2, "El sensor registra intensidad relativa", "rgba(7, 16, 24, 0.62)");
  }
}

function drawCanvasLabel(x, y, text, fill) {
  ctx.save();
  ctx.font = "800 12px system-ui, sans-serif";
  const metrics = ctx.measureText(text);
  const width = metrics.width + 22;
  const height = 30;
  const px = clamp(x, 8, stage.width - width - 8);
  const py = clamp(y, 8, stage.height - height - 42);
  ctx.fillStyle = fill;
  roundRect(px, py, width, height, 7);
  ctx.fill();
  ctx.fillStyle = "#f8fbfc";
  ctx.textAlign = "left";
  ctx.fillText(text, px + 11, py + 20);
  ctx.restore();
}

function drawPath(start, end, progress, color, alpha, width, dashed) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t0 = clamp(progress - 0.18, 0, 1);
  const t1 = clamp(progress + 0.03, 0, 1);
  const x0 = start.x + dx * t0;
  const y0 = start.y + dy * t0;
  const x1 = start.x + dx * t1;
  const y1 = start.y + dy * t1;
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowBlur = width * 3;
  ctx.shadowColor = rgba(color, alpha);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawMovingRay(start, direction, length, progress, color, alpha, width) {
  const head = length * clamp(progress, 0, 1);
  const tail = Math.max(0, head - length * 0.26);
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowBlur = width * 3;
  ctx.shadowColor = rgba(color, alpha * 0.9);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(start.x + direction.x * tail, start.y + direction.y * tail);
  ctx.lineTo(start.x + direction.x * head, start.y + direction.y * head);
  ctx.stroke();
  ctx.restore();
}

function drawArrowHead(start, end, color, alpha, size) {
  const dir = normalize({ x: end.x - start.x, y: end.y - start.y });
  const angle = Math.atan2(dir.y, dir.x);
  ctx.save();
  ctx.translate(end.x, end.y);
  ctx.rotate(angle);
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.46);
  ctx.lineTo(-size * 0.72, 0);
  ctx.lineTo(-size, size * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function render(time) {
  resizeCanvas();
  const delta = Math.min(64, time - state.lastTime);
  state.lastTime = time;
  if (state.playing) {
    state.timeline = (state.timeline + delta / 8800) % 1;
  }
  state.pulseFlash = Math.max(0, state.pulseFlash - delta / 420);

  drawBackground(time);
  drawBeamCone();
  drawGround(time);
  drawTarget(time);
  drawIncidentRay();
  drawLoss(time);
  drawScatterRays();
  drawBackscatterRay();
  drawSatellite(time);
  drawMeasurement();
  drawCanvasLabels();
  syncUI();
  requestAnimationFrame(render);
}

ui.targetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setState({ target: button.dataset.target });
    state.pulseFlash = 1;
  });
});

ui.stepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const index = Number(button.dataset.step);
    const phase = phases[index];
    state.playing = false;
    state.timeline = phase.start + (phase.end - phase.start) * 0.5;
    state.pulseFlash = 0.5;
    syncUI();
  });
});

ui.pulseButton.addEventListener("click", () => {
  state.timeline = 0;
  state.playing = true;
  state.pulseFlash = 1;
  syncUI();
});

ui.playButton.addEventListener("click", () => {
  state.playing = !state.playing;
  syncUI();
});

ui.resetButton.addEventListener("click", () => {
  Object.assign(state, {
    target: "soil",
    playing: true,
    timeline: 0,
    pulseFlash: 1,
  });
  syncUI();
});

window.addEventListener("resize", resizeCanvas);

syncUI();
requestAnimationFrame(render);
