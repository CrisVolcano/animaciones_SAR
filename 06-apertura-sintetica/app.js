const canvas = document.getElementById("aperture-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  beamReadout: document.getElementById("beam-readout"),
  rangeReadout: document.getElementById("range-readout"),
  apertureReadout: document.getElementById("aperture-readout"),
  resolutionReadout: document.getElementById("resolution-readout"),
  interpretation: document.getElementById("interpretation"),
  antenna: document.getElementById("antenna"),
  range: document.getElementById("range"),
  antennaOutput: document.getElementById("antenna-output"),
  rangeOutput: document.getElementById("range-output"),
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
  range: 150000,
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
  "La antena física controla el ancho del haz azimutal β. Una antena más corta produce un haz más ancho.",
  "El sensor avanza con velocidad V. R(x) es la distancia oblicua desde cada posición x hasta el blanco fijo P; R₀ es la distancia de referencia en el centro de la apertura.",
  "P permanece dentro del haz entre x₁ y x₂. El radar lo observa repetidamente y cada posición aporta una medición coherente.",
  "SAR combina las observaciones tomadas a lo largo de LSA. Esa trayectoria se comporta como una antena virtual mucho más larga que la antena física.",
  "La antena física corta genera un haz ancho y una celda azimutal grande. SAR corrige esa pérdida: combina las observaciones y crea una apertura virtual larga, equivalente a un haz mucho más estrecho. La resolución radial o en rango depende del ancho de banda.",
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
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

  return { beta, betaDeg, aperture, sarResolution, slarResolution };
}

function formatDistance(value, decimals = 0) {
  return value >= 1000 ? `${(value / 1000).toFixed(decimals)} km` : `${value.toFixed(decimals)} m`;
}

function syncUI() {
  const metrics = metricsFor();

  ui.antenna.value = String(state.antenna);
  ui.range.value = String(state.range);
  ui.antennaOutput.value = `${state.antenna.toFixed(1)} m`;
  ui.rangeOutput.value = formatDistance(state.range);
  ui.rangeReadout.textContent = formatDistance(state.range);
  ui.lambdaNote.textContent = `λ = ${(state.lambda * 100).toFixed(1)} cm`;

  ui.beamReadout.textContent = `${metrics.betaDeg.toFixed(2)}°`;
  ui.apertureReadout.textContent = formatDistance(metrics.aperture, 1);
  ui.resolutionReadout.textContent = `${metrics.sarResolution.toFixed(1)} m`;

  const beamNorm = clamp((metrics.betaDeg - 0.15) / 6.7, 0, 1);
  const apertureNorm = clamp((Math.log10(metrics.aperture) - 2) / 3, 0, 1);
  const slarNorm = apertureNorm;
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
  const rangeNorm = clamp((state.range - 50000) / 800000, 0, 1);
  const trackY = mix(h * 0.35, h * 0.10, rangeNorm);

  // Escala conceptual: exagerada para que la relación sea visible.
  const apertureNorm = clamp((Math.log10(metrics.aperture) - 2) / 3, 0.06, 1);
  const aperturePx = mix(w * 0.18, w * 0.68, apertureNorm);
  const left = target.x - aperturePx / 2;
  const right = target.x + aperturePx / 2;
  const sensor = { x: mix(left, right, state.position), y: trackY };

  const beamHalf = aperturePx / 2;

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
  ctx.fillText("V  Dirección de vuelo →", stage.width * 0.09, g.trackY - 16);
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

function drawLineLabel(from, to, label, color, offset = -9) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(7,16,24,0.78)";
  const labelWidth = ctx.measureText(label).width + 12;
  ctx.fillRect(-labelWidth / 2, offset - 12, labelWidth, 18);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(label, 0, offset + 1);
  ctx.restore();
}

function drawRangeGeometry(g) {
  if (state.step < 1) return;

  const reference = { x: g.target.x, y: g.trackY };
  const alongTrackOffset = (state.position - 0.5) * metricsFor().aperture;
  const instantaneousRange = Math.hypot(state.range, alongTrackOffset);
  const rangeLabel = `R(x)  ${formatDistance(instantaneousRange, 1)}`;

  ctx.save();
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.lineWidth = 1.5;

  ctx.strokeStyle = "rgba(255,255,255,0.46)";
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(reference.x, reference.y + 8);
  ctx.lineTo(g.target.x, g.target.y - 13);
  ctx.stroke();
  ctx.setLineDash([]);
  drawLineLabel(reference, g.target, `R₀  ${formatDistance(state.range)}`, "#ffffff", 13);

  if (Math.abs(g.sensor.x - reference.x) > stage.width * 0.035) {
    ctx.strokeStyle = rgba(colors.look, 0.72);
    ctx.beginPath();
    ctx.moveTo(g.sensor.x, g.sensor.y + 18);
    ctx.lineTo(g.target.x, g.target.y - 13);
    ctx.stroke();
    drawLineLabel(g.sensor, g.target, rangeLabel, colors.look);
  }
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

  const centerAngle = Math.atan2(g.target.y - g.sensor.y, g.target.x - g.sensor.x);
  const leftAngle = Math.atan2(groundY - g.sensor.y, leftGround - g.sensor.x);
  const arcRadius = 42;
  ctx.strokeStyle = rgba(colors.beam, 0.95);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(g.sensor.x, g.sensor.y, arcRadius, leftAngle, centerAngle);
  ctx.stroke();
  ctx.fillStyle = colors.beam;
  ctx.font = "800 13px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("β", g.sensor.x - 24, g.sensor.y + 48);
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
  const compact = w < 700;
  const gap = compact ? 12 : 22;
  const cardWidth = compact ? w - 32 : (w - gap * 3) / 2;
  const cardHeight = compact ? Math.min(118, h * 0.27) : Math.min(240, h * 0.52);
  const firstX = compact ? 16 : gap;
  const firstY = compact ? 88 : h * 0.31;
  const secondX = compact ? 16 : firstX + cardWidth + gap;
  const secondY = compact ? firstY + cardHeight + gap : firstY;

  function comparisonCard(x, y, width, height, synthetic) {
    const accent = synthetic ? colors.sar : colors.slar;
    const antennaX = x + width * 0.18;
    const centerY = y + height * 0.58;
    const beamEndX = x + width * 0.86;
    const beamHalf = synthetic ? height * 0.045 : height * 0.25;
    const antennaHalf = synthetic ? height * 0.27 : height * 0.09;

    ctx.fillStyle = "rgba(10,24,33,0.94)";
    ctx.strokeStyle = rgba(accent, 0.75);
    ctx.lineWidth = 2;
    roundRect(x, y, width, height, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = `850 ${compact ? 11 : 13}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(synthetic ? "APERTURA SINTÉTICA LARGA" : "ANTENA FÍSICA CORTA", x + 14, y + 23);

    ctx.fillStyle = rgba(accent, synthetic ? 0.18 : 0.25);
    ctx.beginPath();
    ctx.moveTo(antennaX, centerY);
    ctx.lineTo(beamEndX, centerY - beamHalf);
    ctx.lineTo(beamEndX, centerY + beamHalf);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.85);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = synthetic ? 7 : 4;
    ctx.beginPath();
    ctx.moveTo(antennaX, centerY - antennaHalf);
    ctx.lineTo(antennaX, centerY + antennaHalf);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(beamEndX, centerY - beamHalf);
    ctx.lineTo(beamEndX, centerY + beamHalf);
    ctx.stroke();

    const targetX = beamEndX - 7;
    if (synthetic) {
      ctx.fillStyle = "#ffffff";
      for (const offset of [-8, 8]) {
        ctx.beginPath();
        ctx.arc(targetX, centerY + offset, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.sar;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      ctx.save();
      ctx.fillStyle = rgba(colors.slar, 0.75);
      ctx.shadowBlur = 12;
      ctx.shadowColor = colors.slar;
      ctx.beginPath();
      ctx.ellipse(targetX, centerY, 9, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = "#e9f2f4";
    ctx.font = `800 ${compact ? 10 : 12}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    const result = synthetic
      ? `Celda azimutal: ${formatDistance(metrics.sarResolution, 1)}`
      : `Huella azimutal: ${formatDistance(metrics.slarResolution, 1)}`;
    ctx.fillText(result, x + width / 2, y + height - 29);
    ctx.fillStyle = accent;
    ctx.fillText(synthetic ? "✓  DOS BLANCOS SEPARADOS" : "×  DOS BLANCOS MEZCLADOS", x + width / 2, y + height - 12);
  }

  ctx.save();
  ctx.fillStyle = "rgba(3,10,15,0.78)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${compact ? 12 : 18}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  if (compact) {
    ctx.fillText("SAR CORRIGE LA PÉRDIDA", w / 2, 23);
    ctx.fillText("DE RESOLUCIÓN AZIMUTAL", w / 2, 39);
  } else {
    ctx.fillText("SAR CORRIGE LA PÉRDIDA DE RESOLUCIÓN AZIMUTAL", w / 2, 28);
  }
  ctx.fillStyle = colors.look;
  ctx.font = `750 ${compact ? 9 : 12}px Inter, system-ui, sans-serif`;
  if (compact) {
    ctx.fillText("observaciones → procesamiento coherente", w / 2, 58);
    ctx.fillText("→ apertura virtual larga", w / 2, 72);
  } else {
    ctx.fillText("observaciones sucesivas  →  procesamiento coherente  →  antena virtual", w / 2, 48);
  }

  comparisonCard(firstX, firstY, cardWidth, cardHeight, false);
  comparisonCard(secondX, secondY, cardWidth, cardHeight, true);
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
  drawRangeGeometry(g);
  drawTarget(g);
  drawSensor(g);
  drawPulse(g);
  drawComparison(g);
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
