const canvas = document.getElementById("polar-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  typeReadout: document.getElementById("type-readout"),
  traceReadout: document.getElementById("trace-readout"),
  phaseReadout: document.getElementById("phase-readout"),
  interpretation: document.getElementById("interpretation"),
  speed: document.getElementById("speed"),
  speedOutput: document.getElementById("speed-output"),
  pulseButton: document.getElementById("pulse-button"),
  playButton: document.getElementById("play-button"),
  resetButton: document.getElementById("reset-button"),
  verticalMeter: document.getElementById("vertical-meter"),
  horizontalMeter: document.getElementById("horizontal-meter"),
  phaseMeter: document.getElementById("phase-meter"),
  ellipticityMeter: document.getElementById("ellipticity-meter"),
  typeButtons: [...document.querySelectorAll("[data-type]")],
  linearButtons: [...document.querySelectorAll("[data-linear]")],
  rotationButtons: [...document.querySelectorAll("[data-rotation]")],
};

const colors = {
  vertical: "#f2c94c",
  horizontal: "#48abc1",
  trace: "#f08a24",
  vector: "#f8fbfc",
  axis: "#d7eef5",
  skyTop: "#071018",
  skyMid: "#183948",
  skyBottom: "#76b9df",
};

const typeLabels = {
  lineal: {
    name: "Lineal",
    trace: "Línea",
    note:
      "En polarización lineal, la punta del campo eléctrico oscila siempre dentro de un mismo plano. V, H o 45° cambian la orientación de ese plano.",
  },
  circular: {
    name: "Circular",
    trace: "Círculo",
    note:
      "En polarización circular, las componentes horizontal y vertical tienen la misma amplitud y están desfasadas 90°. La punta del campo gira con radio casi constante.",
  },
  eliptica: {
    name: "Elíptica",
    trace: "Elipse",
    note:
      "En polarización elíptica, las componentes tienen amplitudes distintas y un desfase. La punta del campo dibuja una elipse; lineal y circular pueden verse como casos particulares.",
  },
};

const linearModes = {
  vertical: { label: "Vertical", ampV: 1, ampH: 0 },
  horizontal: { label: "Horizontal", ampV: 0, ampH: 1 },
  diagonal: { label: "45°", ampV: 0.78, ampH: 0.78 },
};

const state = {
  type: "lineal",
  linear: "vertical",
  rotation: "right",
  playing: true,
  speed: 0.7,
  time: 0,
  pulse: 0,
  lastTime: performance.now(),
};

let stage = { width: 0, height: 0, dpr: 1 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
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

function paramsFor(values = state) {
  if (values.type === "lineal") {
    const mode = linearModes[values.linear];
    return {
      ...typeLabels.lineal,
      ampV: mode.ampV,
      ampH: mode.ampH,
      phaseDeg: 0,
      phaseRad: 0,
      componentText: mode.label,
    };
  }

  const handedness = values.rotation === "right" ? 1 : -1;
  if (values.type === "circular") {
    return {
      ...typeLabels.circular,
      ampV: 0.78,
      ampH: 0.78,
      phaseDeg: 90 * handedness,
      phaseRad: degToRad(90 * handedness),
      componentText: "V=H",
    };
  }

  return {
    ...typeLabels.eliptica,
    ampV: 0.96,
    ampH: 0.48,
    phaseDeg: 70 * handedness,
    phaseRad: degToRad(70 * handedness),
    componentText: "V>H",
  };
}

function ellipticityFor(params) {
  const major = Math.max(params.ampV, params.ampH, 0.001);
  const minor = Math.min(params.ampV, params.ampH);
  return clamp((minor / major) * Math.abs(Math.sin(params.phaseRad)), 0, 1);
}

function syncUI() {
  const params = paramsFor();
  const ellipticity = ellipticityFor(params);
  ui.typeReadout.textContent = params.name;
  ui.traceReadout.textContent = params.trace;
  ui.phaseReadout.textContent = `${Math.abs(params.phaseDeg)}°`;
  ui.speed.value = String(Math.round(state.speed * 100));
  ui.speedOutput.value = `${Math.round(state.speed * 100)}%`;
  ui.verticalMeter.style.width = `${Math.round(params.ampV * 100)}%`;
  ui.horizontalMeter.style.width = `${Math.round(params.ampH * 100)}%`;
  ui.phaseMeter.style.width = `${Math.round((Math.abs(params.phaseDeg) / 180) * 100)}%`;
  ui.ellipticityMeter.style.width = `${Math.round(ellipticity * 100)}%`;
  ui.interpretation.textContent = params.note;

  ui.typeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.type === state.type);
  });
  ui.linearButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.linear === state.linear);
    button.disabled = state.type !== "lineal";
  });
  ui.rotationButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rotation === state.rotation);
    button.disabled = state.type === "lineal";
  });
  ui.playButton.textContent = state.playing ? "Pausar" : "Reproducir";
  ui.playButton.setAttribute("aria-pressed", state.playing ? "true" : "false");
}

function applyQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("tipo") || params.get("type");
  const linear = params.get("plano") || params.get("linear");
  const rotation = params.get("giro") || params.get("rotation");
  if (type && typeLabels[type]) state.type = type;
  if (linear && linearModes[linear]) state.linear = linear;
  if (rotation === "right" || rotation === "left") state.rotation = rotation;
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

function geometry() {
  const { width: w, height: h } = stage;
  const start = { x: w * 0.14, y: h * 0.62 };
  const end = { x: w * 0.82, y: h * 0.33 };
  const fieldScale = Math.min(w, h) * 0.16;
  return {
    start,
    end,
    hUnit: { x: -0.62, y: 0.32 },
    vUnit: { x: 0, y: -1 },
    fieldScale,
  };
}

function axisPoint(t) {
  const g = geometry();
  return {
    x: mix(g.start.x, g.end.x, t),
    y: mix(g.start.y, g.end.y, t),
  };
}

function projectField(t, horizontal, vertical, scaleFactor = 1) {
  const g = geometry();
  const base = axisPoint(t);
  const scale = g.fieldScale * scaleFactor;
  return {
    x: base.x + g.hUnit.x * horizontal * scale + g.vUnit.x * vertical * scale,
    y: base.y + g.hUnit.y * horizontal * scale + g.vUnit.y * vertical * scale,
  };
}

function drawBackground(time) {
  const { width: w, height: h } = stage;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, colors.skyTop);
  sky.addColorStop(0.58, colors.skyMid);
  sky.addColorStop(1, colors.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = "#d7eef5";
  ctx.lineWidth = 1;
  const step = Math.max(42, Math.min(w, h) * 0.08);
  for (let x = -step; x < w + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + w * 0.28, 0);
    ctx.stroke();
  }
  for (let y = h * 0.18; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - h * 0.18);
    ctx.stroke();
  }
  ctx.restore();

  const pulseGlow = 0.05 + state.pulse * 0.14 + Math.sin(time * 0.002) ** 2 * 0.03;
  const glow = ctx.createRadialGradient(w * 0.78, h * 0.34, 8, w * 0.78, h * 0.34, w * 0.5);
  glow.addColorStop(0, rgba(colors.trace, pulseGlow));
  glow.addColorStop(1, "rgba(7, 16, 24, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function drawAxisFrame() {
  const g = geometry();
  const { width: w } = stage;
  const compact = w < 560;

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(colors.axis, 0.42);
  ctx.lineWidth = 2;
  drawArrow(g.start, g.end, rgba(colors.axis, 0.7), 2);

  [0.14, 0.38, 0.62, 0.86].forEach((t) => {
    const center = axisPoint(t);
    const hStart = projectField(t, -0.42, 0, 0.72);
    const hEnd = projectField(t, 0.42, 0, 0.72);
    const vStart = projectField(t, 0, -0.42, 0.72);
    const vEnd = projectField(t, 0, 0.42, 0.72);
    ctx.strokeStyle = rgba(colors.axis, 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hStart.x, hStart.y);
    ctx.lineTo(hEnd.x, hEnd.y);
    ctx.moveTo(vStart.x, vStart.y);
    ctx.lineTo(vEnd.x, vEnd.y);
    ctx.stroke();
    ctx.fillStyle = rgba(colors.axis, 0.35);
    ctx.beginPath();
    ctx.arc(center.x, center.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  const labelPoint = axisPoint(0.68);
  if (!compact) {
    drawCanvasLabel(labelPoint.x + w * 0.03, labelPoint.y + 22, "Dirección de propagación", "rgba(7, 16, 24, 0.58)");
  }
  drawCanvasLabel(projectField(0.14, 0, 0.56, 0.72).x - 10, projectField(0.14, 0, 0.56, 0.72).y - 7, "V", rgba(colors.vertical, 0.92));
  drawCanvasLabel(projectField(0.14, 0.56, 0, 0.72).x - 8, projectField(0.14, 0.56, 0, 0.72).y + 12, "H", rgba(colors.horizontal, 0.92));
  ctx.restore();
}

function drawWave(params) {
  const cycles = 3.15;
  const samples = 188;
  const phaseTime = state.time * 1.9;
  const mainPath = [];
  const verticalPath = [];
  const horizontalPath = [];

  for (let i = 0; i < samples; i += 1) {
    const t = i / (samples - 1);
    const theta = t * cycles * Math.PI * 2 - phaseTime;
    const vertical = params.ampV * Math.sin(theta);
    const horizontal = params.ampH * Math.sin(theta + params.phaseRad);
    mainPath.push(projectField(t, horizontal, vertical));
    verticalPath.push(projectField(t, 0, vertical));
    horizontalPath.push(projectField(t, horizontal, 0));
  }

  drawPolyline(verticalPath, rgba(colors.vertical, 0.58), 2);
  drawPolyline(horizontalPath, rgba(colors.horizontal, 0.58), 2);
  drawPolyline(mainPath, rgba(colors.trace, 0.95), 3.3);

  for (let i = 8; i < samples; i += 18) {
    const t = i / (samples - 1);
    const theta = t * cycles * Math.PI * 2 - phaseTime;
    const vertical = params.ampV * Math.sin(theta);
    const horizontal = params.ampH * Math.sin(theta + params.phaseRad);
    const base = axisPoint(t);
    const tip = projectField(t, horizontal, vertical);
    ctx.strokeStyle = rgba(colors.vector, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }

  drawTracePlane(params, cycles, phaseTime);
}

function drawTracePlane(params, cycles, phaseTime) {
  const t = 0.84;
  const compact = stage.width < 560;
  const center = axisPoint(t);
  const theta = t * cycles * Math.PI * 2 - phaseTime;
  const vertical = params.ampV * Math.sin(theta);
  const horizontal = params.ampH * Math.sin(theta + params.phaseRad);
  const tip = projectField(t, horizontal, vertical, 1.12);
  const vTip = projectField(t, 0, vertical, 1.12);
  const hTip = projectField(t, horizontal, 0, 1.12);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(colors.axis, 0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(projectField(t, -1.05, 0, 1.12).x, projectField(t, -1.05, 0, 1.12).y);
  ctx.lineTo(projectField(t, 1.05, 0, 1.12).x, projectField(t, 1.05, 0, 1.12).y);
  ctx.moveTo(projectField(t, 0, -1.05, 1.12).x, projectField(t, 0, -1.05, 1.12).y);
  ctx.lineTo(projectField(t, 0, 1.05, 1.12).x, projectField(t, 0, 1.05, 1.12).y);
  ctx.stroke();

  const trace = [];
  for (let i = 0; i <= 120; i += 1) {
    const a = (i / 120) * Math.PI * 2;
    trace.push(projectField(t, params.ampH * Math.sin(a + params.phaseRad), params.ampV * Math.sin(a), 1.12));
  }
  drawPolyline(trace, rgba(colors.trace, 0.95), 2.2, true);

  ctx.strokeStyle = rgba(colors.vertical, 0.8);
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(vTip.x, vTip.y);
  ctx.stroke();

  ctx.strokeStyle = rgba(colors.horizontal, 0.8);
  ctx.beginPath();
  ctx.moveTo(vTip.x, vTip.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.setLineDash([]);

  drawArrow(center, tip, rgba(colors.vector, 0.95), 3);
  ctx.fillStyle = colors.trace;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 5 + state.pulse * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(colors.vector, 0.85);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawCanvasLabel(tip.x + 10, tip.y - 10, "E", "rgba(7, 16, 24, 0.7)");
  if (!compact) {
    drawCanvasLabel(center.x + 18, center.y + 32, params.trace, "rgba(7, 16, 24, 0.58)");
    drawCanvasLabel(hTip.x - 8, hTip.y + 18, "H", rgba(colors.horizontal, 0.92));
    drawCanvasLabel(vTip.x + 8, vTip.y - 10, "V", rgba(colors.vertical, 0.92));
  }
  ctx.restore();
}

function drawPolyline(points, strokeStyle, lineWidth, closePath = false) {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  if (closePath) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawArrow(start, end, strokeStyle, lineWidth) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = 12 + lineWidth * 1.4;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.fillStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - Math.cos(angle - 0.48) * head, end.y - Math.sin(angle - 0.48) * head);
  ctx.lineTo(end.x - Math.cos(angle + 0.48) * head, end.y - Math.sin(angle + 0.48) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCanvasLabel(x, y, text, background) {
  ctx.save();
  ctx.font = "800 12px system-ui, sans-serif";
  const metrics = ctx.measureText(text);
  const width = metrics.width + 14;
  const height = 22;
  ctx.fillStyle = background;
  roundRect(x - width / 2, y - height / 2, width, height, 6);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
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

function draw(time) {
  resizeCanvas();
  const params = paramsFor();
  drawBackground(time);
  drawAxisFrame();
  drawWave(params);
}

function animate(now) {
  const dt = Math.min(60, now - state.lastTime) / 1000;
  state.lastTime = now;
  if (state.playing) {
    state.time += dt * state.speed;
  }
  state.pulse = Math.max(0, state.pulse - dt * 1.7);
  draw(now);
  requestAnimationFrame(animate);
}

ui.typeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.type = button.dataset.type;
    state.pulse = 1;
    syncUI();
  });
});

ui.linearButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.linear = button.dataset.linear;
    state.pulse = 1;
    syncUI();
  });
});

ui.rotationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.rotation = button.dataset.rotation;
    state.pulse = 1;
    syncUI();
  });
});

ui.speed.addEventListener("input", () => {
  state.speed = Number(ui.speed.value) / 100;
  syncUI();
});

ui.pulseButton.addEventListener("click", () => {
  state.pulse = 1;
  state.time = 0;
});

ui.playButton.addEventListener("click", () => {
  state.playing = !state.playing;
  syncUI();
});

ui.resetButton.addEventListener("click", () => {
  state.type = "lineal";
  state.linear = "vertical";
  state.rotation = "right";
  state.speed = 0.7;
  state.time = 0;
  state.pulse = 1;
  state.playing = true;
  syncUI();
});

applyQueryParams();
syncUI();
requestAnimationFrame(animate);
