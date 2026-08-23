const canvas = document.getElementById("speckle-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  scatterReadout: document.getElementById("scatter-readout"),
  sumReadout: document.getElementById("sum-readout"),
  brightnessReadout: document.getElementById("brightness-readout"),
  sumMeter: document.getElementById("sum-meter"),
  brightnessMeter: document.getElementById("brightness-meter"),
  interpretation: document.getElementById("interpretation"),
  caseOptions: document.getElementById("case-options"),
  phaseButton: document.getElementById("phase-button"),
};

const state = {
  caseMode: "mixed",
  animating: true,
  phase: 0,
  seed: 41,
  lastTime: performance.now(),
};

const image = {
  width: 92,
  height: 62,
  values: [],
};

const scatterers = [
  { x: 0.18, y: 0.22, r: 5, type: "dot" },
  { x: 0.34, y: 0.18, r: 4, type: "grass" },
  { x: 0.52, y: 0.2, r: 5, type: "dot" },
  { x: 0.72, y: 0.25, r: 4, type: "grass" },
  { x: 0.26, y: 0.42, r: 4, type: "grass" },
  { x: 0.46, y: 0.42, r: 5, type: "dot" },
  { x: 0.64, y: 0.46, r: 4, type: "dot" },
  { x: 0.83, y: 0.48, r: 5, type: "grass" },
  { x: 0.16, y: 0.7, r: 4, type: "dot" },
  { x: 0.38, y: 0.74, r: 5, type: "grass" },
  { x: 0.58, y: 0.72, r: 4, type: "dot" },
  { x: 0.78, y: 0.76, r: 4, type: "grass" },
];

let stage = { width: 0, height: 0, dpr: 1 };
let offscreen = document.createElement("canvas");
let offscreenCtx = offscreen.getContext("2d");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function hashNoise(x, y, look, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + look * 74.7 + seed * 19.19) * 43758.5453;
  return n - Math.floor(n);
}

function gaussianPair(u1, u2) {
  const r = Math.sqrt(-2 * Math.log(Math.max(u1, 0.00001)));
  return {
    re: r * Math.cos(2 * Math.PI * u2),
    im: r * Math.sin(2 * Math.PI * u2),
  };
}

function baseBackscatter(x, y) {
  const nx = x / image.width;
  const ny = y / image.height;
  let value = 0.48;

  if (nx < 0.24 && ny > 0.64) value = 0.26;
  if (nx > 0.58 && nx < 0.88 && ny > 0.58) value = 0.64;
  if (Math.abs(ny - (0.2 + nx * 0.48)) < 0.032) value = 0.34;

  const field = Math.sin(x * 0.15) * 0.025 + Math.cos(y * 0.2) * 0.018;
  return clamp(value + field, 0.12, 0.84);
}

function phaseFor(index) {
  const drift = state.phase * Math.PI * 2;

  if (state.caseMode === "bright") {
    return drift + 0.4 + Math.sin(index * 1.9) * 0.22;
  }

  if (state.caseMode === "dark") {
    const pair = index % 2 === 0 ? 0 : Math.PI;
    return drift + pair + Math.sin(index * 2.3) * 0.28;
  }

  return drift * 0.45 + index * 1.67 + Math.sin(index * 1.31 + state.seed) * 0.74;
}

function vectorSum() {
  let x = 0;
  let y = 0;

  scatterers.forEach((_, index) => {
    const angle = phaseFor(index);
    x += Math.cos(angle);
    y += Math.sin(angle);
  });

  const amplitude = Math.hypot(x, y) / scatterers.length;
  return { x, y, amplitude };
}

function selectedBrightness() {
  const { amplitude } = vectorSum();
  if (state.caseMode === "bright") return 0.92;
  if (state.caseMode === "dark") return 0.12;
  return clamp(0.22 + amplitude * 1.6, 0.18, 0.86);
}

function generateImage() {
  const selectedCol = Math.floor(image.width * 0.62);
  const selectedRow = Math.floor(image.height * 0.48);
  const selected = selectedBrightness();

  image.values = new Array(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const u1 = hashNoise(x, y, 0, state.seed + state.phase * 1.2);
      const u2 = hashNoise(x, y, 1, state.seed + state.phase * 1.8);
      const scatter = gaussianPair(u1, u2);
      let intensity = (scatter.re * scatter.re + scatter.im * scatter.im) * 0.5;
      let value = clamp(baseBackscatter(x, y) * intensity, 0, 1.45);

      if (Math.abs(x - selectedCol) <= 1 && Math.abs(y - selectedRow) <= 1) {
        value = selected;
      }

      image.values[y * image.width + x] = value;
    }
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(360, Math.floor(rect.height));

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage = { width, height, dpr };
  }
}

function syncUI() {
  const { amplitude } = vectorSum();
  const brightness = selectedBrightness();

  ui.scatterReadout.textContent = String(scatterers.length);
  if (state.caseMode === "bright") {
    ui.sumReadout.textContent = "Constructiva";
  } else if (state.caseMode === "dark") {
    ui.sumReadout.textContent = "Destructiva";
  } else {
    ui.sumReadout.textContent = "Parcial";
  }
  ui.brightnessReadout.textContent = brightness > 0.68 ? "Claro" : brightness < 0.25 ? "Oscuro" : "Medio";
  ui.sumMeter.style.width = `${Math.round(clamp(amplitude, 0.04, 1) * 100)}%`;
  ui.brightnessMeter.style.width = `${Math.round(brightness * 100)}%`;
  ui.phaseButton.textContent = state.animating ? "Pausar fases" : "Animar fases";

  [...ui.caseOptions.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.case === state.caseMode);
  });

  if (state.caseMode === "bright") {
    ui.interpretation.textContent =
      "Cuando muchos ecos llegan con fases parecidas, se refuerzan. Ese píxel aparece claro aunque la cobertura sea la misma.";
  } else if (state.caseMode === "dark") {
    ui.interpretation.textContent =
      "Cuando los ecos llegan desfasados, se cancelan parcialmente. Ese píxel aparece oscuro aunque esté sobre una superficie similar.";
  } else {
    ui.interpretation.textContent =
      "En cada celda la mezcla de fases cambia. Por eso una superficie homogénea puede verse granulada en la imagen SAR.";
  }
}

function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawLabel(x, y, title, subtitle, boxW = 224) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 16, 24, 0.72)";
  roundedRect(x, y, boxW, 58, 8);
  ctx.fill();
  ctx.fillStyle = "#eef7fa";
  ctx.font = "800 18px Inter, system-ui, sans-serif";
  ctx.fillText(title, x + 14, y + 24);
  ctx.fillStyle = "rgba(238, 247, 250, 0.82)";
  ctx.font = `${boxW < 190 ? "760 11px" : "760 12px"} Inter, system-ui, sans-serif`;
  ctx.fillText(subtitle, x + 14, y + 43);
  ctx.restore();
}

function drawArrow(from, to, color, alpha = 1, width = 2) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 9 + width;

  ctx.save();
  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.fillStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - 0.46) * head, to.y - Math.sin(angle - 0.46) * head);
  ctx.lineTo(to.x - Math.cos(angle + 0.46) * head, to.y - Math.sin(angle + 0.46) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const n = Number.parseInt(value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawBackground(showDivider = true) {
  const { width: w, height: h } = stage;
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "#173646");
  grd.addColorStop(1, "#071018");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  if (!showDivider) return;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
}

function drawSensor(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.52);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#dbe6ec";
  ctx.fillRect(-16, -10, 32, 20);
  ctx.strokeStyle = "rgba(7, 16, 24, 0.35)";
  ctx.strokeRect(-16, -10, 32, 20);
  ctx.fillStyle = "#456f82";
  ctx.fillRect(-45, -7, 24, 14);
  ctx.fillRect(21, -7, 24, 14);
  ctx.fillStyle = "#f08a24";
  ctx.beginPath();
  ctx.arc(0, 12, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#eef7fa";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.fillText("sensor SAR", x - 36 * scale, y - 28 * scale);
  ctx.restore();
}

function drawScatterer(x, y, r, type) {
  ctx.save();
  if (type === "grass") {
    ctx.strokeStyle = "#35b779";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.lineTo(x, y - r * 1.4);
    ctx.moveTo(x, y);
    ctx.lineTo(x - r, y - r * 0.7);
    ctx.moveTo(x, y);
    ctx.lineTo(x + r, y - r * 0.8);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#27333a";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.35, r, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawResolutionCell(x, y, w, h) {
  const grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, "#eef3ec");
  grd.addColorStop(1, "#c9d8bf");
  ctx.fillStyle = grd;
  roundedRect(x, y, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(23, 34, 43, 0.18)";
  ctx.lineWidth = 1;
  const cols = 3;
  const rows = 2;
  for (let i = 1; i < cols; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + (w * i) / cols, y + 12);
    ctx.lineTo(x + (w * i) / cols, y + h - 12);
    ctx.stroke();
  }
  for (let i = 1; i < rows; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 12, y + (h * i) / rows);
    ctx.lineTo(x + w - 12, y + (h * i) / rows);
    ctx.stroke();
  }

  const cellX = x + w / 3;
  const cellY = y;
  const cellW = w / 3;
  const cellH = h / 2;
  ctx.fillStyle = "rgba(240, 138, 36, 0.13)";
  ctx.fillRect(cellX, cellY, cellW, cellH);
  ctx.strokeStyle = "#f08a24";
  ctx.lineWidth = 3;
  ctx.strokeRect(cellX, cellY, cellW, cellH);

  scatterers.forEach((s) => {
    drawScatterer(cellX + s.x * cellW, cellY + s.y * cellH, s.r, s.type);
  });

  ctx.save();
  ctx.fillStyle = "#17222b";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("celda de resolución", cellX + cellW / 2, cellY + cellH + 20);
  ctx.fillStyle = "rgba(23, 34, 43, 0.72)";
  ctx.font = "760 11px Inter, system-ui, sans-serif";
  ctx.fillText(w < 205 ? "muchos ecos" : "muchos dispersores en un píxel", cellX + cellW / 2, cellY + cellH + 37);
  ctx.restore();

  return { x: cellX, y: cellY, w: cellW, h: cellH };
}

function drawEchoLines(sensor, cell) {
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = "rgba(215, 238, 245, 0.5)";
  ctx.lineWidth = 1.4;

  scatterers.slice(0, 6).forEach((s) => {
    const sx = cell.x + s.x * cell.w;
    const sy = cell.y + s.y * cell.h;
    ctx.beginPath();
    ctx.moveTo(sensor.x, sensor.y);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  });

  ctx.restore();
}

function drawPhaseBox(x, y, w, h) {
  const center = { x: x + w * 0.5, y: y + h * 0.56 };
  const axis = Math.min(w, h) * 0.31;
  const sum = vectorSum();
  const resultAngle = Math.atan2(sum.y, sum.x);
  const resultLen = axis * clamp(sum.amplitude, 0.08, 1);

  ctx.save();
  ctx.fillStyle = "rgba(7, 16, 24, 0.64)";
  roundedRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.stroke();

  ctx.fillStyle = "#eef7fa";
  ctx.font = `${w < 132 ? "800 12px" : "800 13px"} Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(w < 132 ? "suma de fases" : "suma coherente", x + w / 2, y + 22);

  ctx.strokeStyle = "rgba(238, 247, 250, 0.62)";
  ctx.lineWidth = 1.4;
  drawAxis(center.x - axis, center.y, center.x + axis, center.y);
  drawAxis(center.x, center.y + axis, center.x, center.y - axis);

  scatterers.forEach((_, index) => {
    const angle = phaseFor(index);
    const len = axis * 0.32;
    drawVector(center.x, center.y, Math.cos(angle) * len, Math.sin(angle) * len, "#d7eef5", 0.44, 1.6);
  });

  drawVector(
    center.x,
    center.y,
    Math.cos(resultAngle) * resultLen,
    Math.sin(resultAngle) * resultLen,
    "#f08a24",
    1,
    4,
  );

  ctx.fillStyle = "rgba(238, 247, 250, 0.78)";
  ctx.font = "760 11px Inter, system-ui, sans-serif";
  ctx.fillText("flecha = brillo", x + w / 2, y + h - 15);
  ctx.restore();
}

function drawAxis(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawVector(x, y, dx, dy, color, alpha, width) {
  const angle = Math.atan2(dy, dx);
  const end = { x: x + dx, y: y + dy };
  const head = 6 + width;

  ctx.save();
  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.fillStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - Math.cos(angle - 0.5) * head, end.y - Math.sin(angle - 0.5) * head);
  ctx.lineTo(end.x - Math.cos(angle + 0.5) * head, end.y - Math.sin(angle + 0.5) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSpeckleImage(x, y, w, h) {
  offscreen.width = image.width;
  offscreen.height = image.height;
  const data = offscreenCtx.createImageData(image.width, image.height);

  for (let i = 0; i < image.values.length; i += 1) {
    const value = Math.pow(clamp(image.values[i] / 1.05, 0, 1), 0.78);
    const gray = Math.round(value * 255);
    data.data[i * 4] = gray;
    data.data[i * 4 + 1] = gray;
    data.data[i * 4 + 2] = gray;
    data.data[i * 4 + 3] = 255;
  }

  offscreenCtx.putImageData(data, 0, 0);
  ctx.save();
  roundedRect(x, y, w, h, 8);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, x, y, w, h);
  ctx.restore();

  const selectedCol = Math.floor(image.width * 0.62);
  const selectedRow = Math.floor(image.height * 0.48);
  const cellW = w / image.width;
  const cellH = h / image.height;

  ctx.strokeStyle = "#f08a24";
  ctx.lineWidth = 3;
  ctx.strokeRect(
    x + selectedCol * cellW - cellW,
    y + selectedRow * cellH - cellH,
    cellW * 3,
    cellH * 3,
  );
}

function drawDesktop() {
  const { width: w, height: h } = stage;
  const pad = 28;
  const top = h < 540 ? 84 : 96;
  const bottomPad = 76;
  const columnW = (w - pad * 3) / 2;
  const panelH = h - top - bottomPad;
  const leftX = pad;
  const rightX = pad * 2 + columnW;

  drawBackground();
  drawLabel(leftX, 24, "Generación", "ecos dentro de una celda");
  drawLabel(rightX, 24, "Imagen SAR", "píxeles claros y oscuros");

  const sensor = { x: leftX + columnW * 0.16, y: top + panelH * 0.1 };
  drawSensor(sensor.x, sensor.y, 0.84);
  const cell = drawResolutionCell(leftX + columnW * 0.1, top + panelH * 0.27, columnW * 0.52, panelH * 0.5);
  drawEchoLines(sensor, cell);

  const beamTarget = { x: cell.x + cell.w * 0.5, y: cell.y + cell.h * 0.5 };
  drawArrow(sensor, beamTarget, "#f08a24", 0.86, 2.2);
  drawArrow(beamTarget, { x: leftX + columnW * 0.78, y: top + panelH * 0.54 }, "#d7eef5", 0.72, 2);
  drawPhaseBox(leftX + columnW * 0.63, top + panelH * 0.32, columnW * 0.34, panelH * 0.36);

  drawSpeckleImage(rightX, top + panelH * 0.18, columnW, panelH * 0.68);

  ctx.save();
  ctx.fillStyle = "rgba(238, 247, 250, 0.82)";
  ctx.font = "800 13px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("valores distintos en píxeles vecinos", rightX + columnW / 2, top + panelH * 0.92);
  ctx.restore();
}

function drawMobile() {
  const { width: w, height: h } = stage;
  const pad = 16;
  const panelW = w - pad * 2;
  const topH = Math.max(330, h * 0.5);
  const bottomY = topH + 18;
  const bottomH = Math.max(220, h - bottomY - 70);
  const diagramY = 150;
  const cellW = panelW * 0.53;
  const phaseW = panelW - cellW - 14;

  drawBackground(false);
  drawLabel(pad + 10, 18, "Generación", "ecos dentro de una celda", Math.min(224, panelW - 20));

  const sensor = { x: pad + panelW * 0.2, y: 110 };
  drawSensor(sensor.x, sensor.y, 0.68);
  const cell = drawResolutionCell(pad + 16, diagramY, cellW, topH - diagramY - 18);
  drawEchoLines(sensor, cell);
  const beamTarget = { x: cell.x + cell.w * 0.5, y: cell.y + cell.h * 0.5 };
  drawArrow(sensor, beamTarget, "#f08a24", 0.86, 1.9);
  drawArrow(beamTarget, { x: pad + 16 + cellW + phaseW * 0.55, y: diagramY + (topH - diagramY - 18) * 0.5 }, "#d7eef5", 0.7, 1.8);
  drawPhaseBox(pad + 30 + cellW, diagramY, phaseW, topH - diagramY - 18);

  drawSpeckleImage(pad, bottomY, panelW, bottomH);
  drawLabel(pad + 10, bottomY + 10, "Imagen SAR", "brillo variable por píxel", Math.min(224, panelW - 20));
}

function draw() {
  resizeCanvas();
  generateImage();
  syncUI();

  if (stage.width < 620) {
    drawMobile();
  } else {
    drawDesktop();
  }
}

function frame(now) {
  const delta = Math.min(48, now - state.lastTime);
  state.lastTime = now;
  if (state.animating) state.phase += delta * 0.00016;
  draw();
  requestAnimationFrame(frame);
}

ui.caseOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-case]");
  if (!button) return;
  state.caseMode = button.dataset.case;
  state.seed += 11;
  draw();
});

ui.phaseButton.addEventListener("click", () => {
  state.animating = !state.animating;
  state.seed += 17;
  draw();
});

window.addEventListener("resize", draw);

draw();
requestAnimationFrame(frame);
