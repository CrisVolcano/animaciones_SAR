const canvas = document.getElementById("aperture-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  beamReadout: document.getElementById("beam-readout"),
  apertureReadout: document.getElementById("aperture-readout"),
  slarResolutionReadout: document.getElementById("slar-resolution-readout"),
  resolutionReadout: document.getElementById("resolution-readout"),
  interpretation: document.getElementById("interpretation"),
  antenna: document.getElementById("antenna"),
  range: document.getElementById("range"),
  antennaOutput: document.getElementById("antenna-output"),
  rangeOutput: document.getElementById("range-output"),
  incidence: document.getElementById("incidence"),
  slope: document.getElementById("slope"),
  incidenceOutput: document.getElementById("incidence-output"),
  slopeOutput: document.getElementById("slope-output"),
  localIncidenceNote: document.getElementById("local-incidence-note"),
  lambdaNote: document.getElementById("lambda-note"),
  pulseButton: document.getElementById("pulse-button"),
  demoButton: document.getElementById("demo-button"),
  pauseButton: document.getElementById("pause-button"),
  beamMeter: document.getElementById("beam-meter"),
  apertureMeter: document.getElementById("aperture-meter"),
  slarMeter: document.getElementById("slar-meter"),
  sarMeter: document.getElementById("sar-meter"),
  bandOptions: document.getElementById("band-options"),
  stepOptions: document.getElementById("step-options"),
};

const colors = {
  beam: "#f2c94c",
  track: "#48abc1",
  look: "#8ad4e3",
  sar: "#2f9f70",
  slar: "#f08a24",
  axis: "#e9f2f4",
  skyTop: "#071018",
  skyMid: "#183948",
  skyBottom: "#76b9df",
  ground: "#796552",
};

const state = {
  antenna: 6,
  range: 50000,
  incidence: 35,
  slope: 0,
  lambda: 0.056,
  band: "C",
  step: 0,
  position: 0.5,
  playing: true,
  demo: false,
  demoStart: performance.now(),
  pulse: 0,
  lastTime: performance.now(),
};

let stage = { width: 0, height: 0, dpr: 1 };

const stepText = [
  "La longitud física de la antena controla el ancho del haz azimutal. Una antena más corta produce, en esta aproximación, un haz más ancho.",
  "El sensor se desplaza a lo largo de la trayectoria. Un blanco fijo P entra en el haz, permanece iluminado durante un intervalo y finalmente sale de él.",
  "Mientras P permanece dentro del haz, el radar lo observa desde muchas posiciones sucesivas. Cada observación aporta información coherente del mismo blanco.",
  "El procesamiento SAR combina coherentemente esas observaciones. La trayectoria útil se comporta como una antena virtual: la apertura sintética.",
  "Al aumentar R0, aumentan tanto la longitud de la apertura sintética LSA como la resolución azimutal que tendría una antena real (≈ R0β). En cambio, en el modelo SAR idealizado la resolución azimutal permanece aproximadamente La/2. LSA no representa la resolución en rango.",
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function logNormalize(value, min, max) {
  const safeValue = clamp(value, min, max);
  return (Math.log(safeValue) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

function formatDistance(value) {
  if (value < 1000) return `${Math.round(value)} m`;
  if (value < 10000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value / 1000)} km`;
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

function metricsFor(values = state) {
  const beta = values.lambda / values.antenna;
  const betaDeg = (beta * 180) / Math.PI;
  const aperture = beta * values.range;
  const sarResolution = values.antenna / 2;
  const slarResolution = aperture;
  const localIncidence = Math.abs(values.incidence - values.slope);

  return {
    beta,
    betaDeg,
    aperture,
    sarResolution,
    slarResolution,
    localIncidence,
  };
}

function syncUI() {
  const metrics = metricsFor();

  ui.antenna.value = String(state.antenna);
  ui.range.value = String(state.range);
  ui.incidence.value = String(state.incidence);
  ui.slope.value = String(state.slope);

  ui.antennaOutput.value = `${state.antenna.toFixed(1)} m`;
  ui.rangeOutput.value = formatDistance(state.range);
  ui.incidenceOutput.value = `${state.incidence.toFixed(0)}°`;
  ui.slopeOutput.value = `${state.slope.toFixed(0)}°`;
  ui.lambdaNote.textContent = `λ = ${(state.lambda * 100).toFixed(1)} cm`;
  ui.localIncidenceNote.textContent =
    `Incidencia local aproximada: ${metrics.localIncidence.toFixed(1)}°. ` +
    `Pendiente positiva = ladera orientada hacia el radar.`;

  ui.beamReadout.textContent = `${metrics.betaDeg.toFixed(2)}°`;
  ui.apertureReadout.textContent = formatDistance(metrics.aperture);
  ui.slarResolutionReadout.textContent = formatDistance(metrics.slarResolution);
  ui.resolutionReadout.textContent = `${metrics.sarResolution.toFixed(1)} m`;

  const beamNorm = clamp((metrics.betaDeg - 0.15) / 6.7, 0, 1);
  const apertureNorm = logNormalize(metrics.aperture, 8, 24000);
  const slarNorm = logNormalize(metrics.slarResolution, 8, 24000);
  const sarNorm = clamp(metrics.sarResolution / 6, 0, 1);

  ui.beamMeter.style.width = `${Math.max(2, Math.round(beamNorm * 100))}%`;
  ui.apertureMeter.style.width = `${Math.max(2, Math.round(apertureNorm * 100))}%`;
  ui.slarMeter.style.width = `${Math.max(2, Math.round(slarNorm * 100))}%`;
  ui.sarMeter.style.width = `${Math.max(2, Math.round(sarNorm * 100))}%`;

  ui.interpretation.textContent = stepText[state.step];
  ui.demoButton.setAttribute("aria-pressed", state.demo ? "true" : "false");
  ui.demoButton.textContent = state.demo ? "Detener" : "Demo";
  ui.pauseButton.textContent = state.playing ? "Pausar" : "Reproducir";

  [...ui.bandOptions.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.band === state.band);
  });

  [...ui.stepOptions.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.step) === state.step);
  });
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

function sceneGeometry() {
  const { width: w, height: h } = stage;
  const metrics = metricsFor();

  const target = { x: w * 0.56, y: h * 0.76 };

  // R0 se representa con una escala logarítmica para que el cambio vertical
  // entre 3 km y 200 km sea visible, pero no exagerado.
  const rangeNorm = logNormalize(state.range, 3000, 200000);
  const trackY = mix(h * 0.27, h * 0.11, rangeNorm);

  // La longitud visual de la apertura también usa escala logarítmica.
  const apertureNorm = logNormalize(metrics.aperture, 8, 24000);
  const aperturePx = mix(w * 0.17, w * 0.66, apertureNorm);
  const left = target.x - aperturePx / 2;
  const right = target.x + aperturePx / 2;
  const sensor = { x: mix(left, right, state.position), y: trackY };

  // La huella del haz aumenta con β y con R0, pero se limita visualmente.
  const beamHalf = mix(w * 0.05, w * 0.20, apertureNorm);

  return { target, sensor, trackY, left, right, aperturePx, beamHalf };
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
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = "#d7eef5";
  ctx.lineWidth = 1;
  const step = Math.max(44, Math.min(w, h) * 0.09);
  for (let x = -step; x < w + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + w * 0.22, 0);
    ctx.stroke();
  }
  for (let y = h * 0.15; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - h * 0.16);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGround() {
  const { width: w, height: h } = stage;
  const y = h * 0.76;

  const gradient = ctx.createLinearGradient(0, y - 18, 0, h);
  gradient.addColorStop(0, "#816c59");
  gradient.addColorStop(1, "#493a30");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let x = 0; x <= w; x += 12) {
    const rough = Math.sin(x * 0.032) * 3 + Math.sin(x * 0.083) * 1.4;
    ctx.lineTo(x, y + rough);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

function drawTrack(g) {
  ctx.save();
  ctx.strokeStyle = rgba(colors.track, 0.75);
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(stage.width * 0.08, g.trackY);
  ctx.lineTo(stage.width * 0.92, g.trackY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (state.step >= 2) {
    ctx.strokeStyle = colors.track;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(g.left, g.trackY);
    ctx.lineTo(g.right, g.trackY);
    ctx.stroke();

    drawTick(g.left, g.trackY, "x₁");
    drawTick(g.right, g.trackY, "x₂");

    ctx.fillStyle = "rgba(233,242,244,0.82)";
    ctx.font = "700 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Apertura sintética LSA", (g.left + g.right) / 2, g.trackY - 22);
  }

  ctx.fillStyle = "rgba(233,242,244,0.68)";
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Dirección de vuelo →", stage.width * 0.09, g.trackY - 16);
  ctx.restore();
}

function drawTick(x, y, label) {
  ctx.save();
  ctx.strokeStyle = colors.track;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x, y + 9);
  ctx.stroke();
  ctx.fillStyle = "rgba(233,242,244,0.82)";
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 28);
  ctx.restore();
}

function drawBeam(g) {
  const groundY = g.target.y;
  const leftGround = g.target.x - g.beamHalf;
  const rightGround = g.target.x + g.beamHalf;

  ctx.save();
  ctx.fillStyle = rgba(colors.beam, 0.16);
  ctx.strokeStyle = rgba(colors.beam, 0.58);
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(g.sensor.x - 7, g.sensor.y + 17);
  ctx.lineTo(leftGround, groundY);
  ctx.lineTo(rightGround, groundY);
  ctx.lineTo(g.sensor.x + 7, g.sensor.y + 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = rgba(colors.beam, 0.8);
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(g.sensor.x, g.sensor.y + 17);
  ctx.lineTo(g.target.x, g.target.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const labelX = mix(g.sensor.x, g.target.x, 0.44);
  const labelY = mix(g.sensor.y, g.target.y, 0.44);
  ctx.fillStyle = "rgba(233,242,244,0.86)";
  ctx.font = "750 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`R₀ = ${formatDistance(state.range)}`, labelX + 10, labelY - 8);

  ctx.restore();
}

function drawObservations(g) {
  if (state.step < 2) return;

  const count = state.step === 2 ? 8 : 14;
  ctx.save();

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = mix(g.left, g.right, t);

    ctx.strokeStyle = rgba(colors.look, state.step >= 3 ? 0.23 : 0.36);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x, g.trackY + 6);
    ctx.lineTo(g.target.x, g.target.y - 8);
    ctx.stroke();

    ctx.fillStyle = colors.look;
    ctx.beginPath();
    ctx.arc(x, g.trackY, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSensor(g) {
  ctx.save();
  ctx.translate(g.sensor.x, g.sensor.y);

  ctx.fillStyle = "#dfe9ee";
  ctx.strokeStyle = "#8fa2ad";
  ctx.lineWidth = 1.5;
  ctx.fillRect(-18, -10, 36, 20);
  ctx.strokeRect(-18, -10, 36, 20);

  const antennaPx = 36 + (state.antenna - 2) * 3.8;
  ctx.fillStyle = colors.slar;
  ctx.fillRect(-antennaPx / 2, 15, antennaPx, 7);

  ctx.strokeStyle = "#a9bac4";
  ctx.beginPath();
  ctx.moveTo(-14, -10);
  ctx.lineTo(-26, -23);
  ctx.moveTo(14, -10);
  ctx.lineTo(26, -23);
  ctx.stroke();

  ctx.fillStyle = "rgba(233,242,244,0.88)";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SAR", 0, -31);
  ctx.restore();
}

function drawTarget(g) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#f08a24";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(g.target.x, g.target.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.slar;
  ctx.beginPath();
  ctx.arc(g.target.x, g.target.y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(233,242,244,0.9)";
  ctx.font = "800 13px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("P", g.target.x + 16, g.target.y + 4);
  ctx.restore();
}

function drawComparison(g) {
  if (state.step < 4) return;

  const metrics = metricsFor();
  const { width: w, height: h } = stage;
  const baseX = w * 0.08;
  const baseY = h * 0.47;
  const slarWidth = clamp((metrics.slarResolution / 180) * w * 0.24, 60, w * 0.28);
  const sarWidth = clamp((metrics.sarResolution / 8) * w * 0.12, 22, w * 0.12);

  ctx.save();
  ctx.fillStyle = "rgba(7,16,24,0.76)";
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  roundRect(baseX - 16, baseY - 40, w * 0.34, 140, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = "750 12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(233,242,244,0.82)";
  ctx.textAlign = "left";
  ctx.fillText(
    `Resolución azimutal apertura real ≈ ${formatDistance(metrics.slarResolution)}`,
    baseX,
    baseY - 14
  );
  ctx.fillStyle = colors.slar;
  ctx.fillRect(baseX, baseY, slarWidth, 11);

  ctx.fillStyle = "rgba(233,242,244,0.82)";
  ctx.fillText(
    `Resolución azimutal SAR ≈ ${metrics.sarResolution.toFixed(1)} m`,
    baseX,
    baseY + 45
  );
  ctx.fillStyle = colors.sar;
  ctx.fillRect(baseX, baseY + 58, sarWidth, 11);
  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPulse(g) {
  if (state.pulse <= 0) return;

  const t = 1 - state.pulse;
  const x = mix(g.sensor.x, g.target.x, t);
  const y = mix(g.sensor.y, g.target.y, t);
  const radius = 5 + 10 * t;

  ctx.save();
  ctx.fillStyle = rgba(colors.beam, 0.85 - t * 0.3);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSynthesisGlow(g) {
  if (state.step < 3) return;

  const alpha = state.step === 3 ? 0.45 : 0.26;
  ctx.save();
  ctx.strokeStyle = rgba(colors.sar, alpha);
  ctx.lineWidth = 9;
  ctx.shadowBlur = 16;
  ctx.shadowColor = colors.sar;
  ctx.beginPath();
  ctx.moveTo(g.left, g.trackY);
  ctx.lineTo(g.right, g.trackY);
  ctx.stroke();
  ctx.restore();
}

function drawLocalIncidenceInset() {
  const metrics = metricsFor();
  const { width: w, height: h } = stage;
  const boxW = Math.min(245, w * 0.31);
  const boxH = 150;
  const x = w - boxW - 22;
  const y = h - boxH - 54;
  const px = x + boxW * 0.58;
  const py = y + boxH * 0.70;

  const slopeRad = (state.slope * Math.PI) / 180;
  const incidenceRad = (state.incidence * Math.PI) / 180;
  const tangentAngle = -slopeRad;
  const normalAngle = tangentAngle - Math.PI / 2;
  const rayAngle = -Math.PI / 2 - incidenceRad;

  ctx.save();
  ctx.fillStyle = "rgba(7,16,24,0.80)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  roundRect(x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(233,242,244,0.90)";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Incidencia local", x + 14, y + 22);

  // Superficie local.
  const halfSurface = 72;
  ctx.strokeStyle = "#a98b6f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(
    px - Math.cos(tangentAngle) * halfSurface,
    py - Math.sin(tangentAngle) * halfSurface
  );
  ctx.lineTo(
    px + Math.cos(tangentAngle) * halfSurface,
    py + Math.sin(tangentAngle) * halfSurface
  );
  ctx.stroke();

  // Normal local.
  const normalLen = 58;
  ctx.strokeStyle = rgba(colors.sar, 0.95);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(
    px + Math.cos(normalAngle) * normalLen,
    py + Math.sin(normalAngle) * normalLen
  );
  ctx.stroke();

  // Línea hacia el radar.
  const rayLen = 82;
  ctx.strokeStyle = rgba(colors.beam, 0.95);
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(
    px + Math.cos(rayAngle) * rayLen,
    py + Math.sin(rayAngle) * rayLen
  );
  ctx.stroke();
  ctx.setLineDash([]);

  // Arco conceptual del ángulo local.
  const start = Math.min(normalAngle, rayAngle);
  const end = Math.max(normalAngle, rayAngle);
  ctx.strokeStyle = "rgba(233,242,244,0.80)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, 28, start, end);
  ctx.stroke();

  ctx.fillStyle = "rgba(233,242,244,0.82)";
  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.fillText(`θ local ≈ ${metrics.localIncidence.toFixed(1)}°`, x + 14, y + boxH - 14);
  ctx.restore();
}

function drawScene() {
  resizeCanvas();
  const g = sceneGeometry();

  ctx.clearRect(0, 0, stage.width, stage.height);
  drawBackground();
  drawGround();
  drawTrack(g);
  drawSynthesisGlow(g);
  drawObservations(g);
  drawBeam(g);
  drawTarget(g);
  drawComparison(g);
  drawSensor(g);
  drawPulse(g);
  drawLocalIncidenceInset();
}

function setStep(step) {
  state.step = clamp(Number(step), 0, 4);
  if (state.step === 0) state.position = 0.5;
  if (state.step >= 3) state.position = 1;
  syncUI();
}

function startTraversal() {
  state.demo = false;
  state.playing = true;
  state.step = Math.max(1, state.step);
  state.position = 0;
  state.pulse = 1;
  syncUI();
}

function startDemo() {
  state.demo = !state.demo;
  state.playing = true;
  state.demoStart = performance.now();
  syncUI();
}

function updateDemo(now) {
  if (!state.demo) return;

  const cycle = (now - state.demoStart) % 20000;
  const step = Math.min(4, Math.floor(cycle / 4000));
  state.step = step;

  if (step === 1 || step === 2) {
    state.position = (cycle % 4000) / 4000;
  } else if (step >= 3) {
    state.position = 1;
  } else {
    state.position = 0.5;
  }

  if (step === 4) {
    state.antenna = 6 + Math.sin((cycle - 16000) / 600) * 3;
  }
}

function animate(now) {
  const dt = Math.min(60, now - state.lastTime);
  state.lastTime = now;

  if (state.playing) {
    if (state.demo) {
      updateDemo(now);
    } else if (state.position < 1 && state.step >= 1) {
      state.position = clamp(state.position + dt / 5200, 0, 1);
      if (state.position > 0.18 && state.step < 2) state.step = 2;
      if (state.position >= 1 && state.step < 3) state.step = 3;
    }

    state.pulse = Math.max(0, state.pulse - dt / 900);
  }

  syncUI();
  drawScene();
  requestAnimationFrame(animate);
}

ui.antenna.addEventListener("input", (event) => {
  state.demo = false;
  state.antenna = Number(event.target.value);
  syncUI();
});

ui.range.addEventListener("input", (event) => {
  state.demo = false;
  state.range = Number(event.target.value);
  syncUI();
});

ui.incidence.addEventListener("input", (event) => {
  state.demo = false;
  state.incidence = Number(event.target.value);
  syncUI();
});

ui.slope.addEventListener("input", (event) => {
  state.demo = false;
  state.slope = Number(event.target.value);
  syncUI();
});

ui.bandOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-band]");
  if (!button) return;
  state.demo = false;
  state.band = button.dataset.band;
  state.lambda = Number(button.dataset.lambda);
  syncUI();
});

ui.stepOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-step]");
  if (!button) return;
  state.demo = false;
  setStep(button.dataset.step);
});

ui.pulseButton.addEventListener("click", startTraversal);
ui.demoButton.addEventListener("click", startDemo);
ui.pauseButton.addEventListener("click", () => {
  state.playing = !state.playing;
  syncUI();
});

window.addEventListener("resize", drawScene);

syncUI();
requestAnimationFrame(animate);
