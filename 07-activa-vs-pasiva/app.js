const canvas = document.getElementById("remote-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  passiveReadout: document.getElementById("passive-readout"),
  activeReadout: document.getElementById("active-readout"),
  conditionReadout: document.getElementById("condition-readout"),
  passiveMeter: document.getElementById("passive-meter"),
  activeMeter: document.getElementById("active-meter"),
  interpretation: document.getElementById("interpretation"),
  sceneOptions: document.getElementById("scene-options"),
  pauseButton: document.getElementById("pause-button"),
  cloudButton: document.getElementById("cloud-button"),
};

const colors = {
  dayTop: "#9fd9f5",
  dayBottom: "#edf8fb",
  nightTop: "#071018",
  nightBottom: "#173646",
  sun: "#f2c94c",
  reflect: "#f08a24",
  pulse: "#4aa9df",
  echo: "#85d7ef",
  groundTop: "#806b56",
  groundBottom: "#493a30",
  text: "#eef7fa",
};

const state = {
  mode: "cycle",
  cloud: true,
  playing: true,
  elapsed: 0,
  lastTime: performance.now(),
};

let stage = { width: 0, height: 0, dpr: 1 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(mix(ca.r, cb.r, t));
  const g = Math.round(mix(ca.g, cb.g, t));
  const bl = Math.round(mix(ca.b, cb.b, t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(340, Math.floor(rect.height));

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage = { width, height, dpr };
  }
}

function sceneValues() {
  const cycle = 14500;
  const phase = (state.elapsed % cycle) / cycle;
  let light = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);

  if (state.mode === "day") light = 1;
  if (state.mode === "night") light = 0.08;

  const { width: w, height: h } = stage;
  const cloudX = ((state.elapsed * 0.028) % (w + 260)) - 130;
  const cloudY = h * 0.22;
  const passiveTargetX = w * 0.28;
  const cloudShade = state.cloud ? 1 - clamp(Math.abs(cloudX - passiveTargetX) / 180, 0, 1) : 0;
  const reflectedPassive = clamp(light * (1 - cloudShade * 0.68), 0.04, 1);
  const activeReturn = clamp(0.92 - cloudShade * 0.05, 0.82, 0.98);

  return {
    phase,
    light,
    night: 1 - light,
    cloudX,
    cloudY,
    cloudShade,
    reflectedPassive,
    activeReturn,
  };
}

function conditionLabel(values) {
  if (values.light > 0.68) return values.cloudShade > 0.55 ? "Día+nube" : "Día";
  if (values.light < 0.32) return values.cloudShade > 0.55 ? "Noche+nube" : "Noche";
  return values.cloudShade > 0.55 ? "Cambio+nube" : "Cambio";
}

function signalLabel(value) {
  if (value > 0.68) return "Alta";
  if (value > 0.34) return "Atenuada";
  return "Débil";
}

function syncUI(values) {
  ui.passiveReadout.textContent = signalLabel(values.reflectedPassive);
  ui.activeReadout.textContent = values.cloudShade > 0.55 ? "Eco estable" : "Propia";
  ui.conditionReadout.textContent = conditionLabel(values);
  ui.passiveMeter.style.width = `${Math.round(values.reflectedPassive * 100)}%`;
  ui.activeMeter.style.width = `${Math.round(values.activeReturn * 100)}%`;
  ui.pauseButton.textContent = state.playing ? "Pausar" : "Reproducir";
  ui.cloudButton.setAttribute("aria-pressed", state.cloud ? "true" : "false");

  [...ui.sceneOptions.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  if (values.light < 0.28) {
    ui.interpretation.textContent =
      "De noche, la señal solar reflejada casi desaparece para la pasiva. La activa conserva el contraste porque lleva su propia fuente de energía.";
  } else if (values.cloudShade > 0.55) {
    ui.interpretation.textContent =
      "La nube reduce la energía natural que llega y vuelve en el lado pasivo. El pulso activo se representa estable porque la iluminación la controla el sensor.";
  } else {
    ui.interpretation.textContent =
      "Con luz solar, la pasiva recibe una señal reflejada clara. La activa emite su propio pulso, por eso el retorno se mantiene comparable.";
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

function drawBackground(values) {
  const { width: w, height: h } = stage;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, mixColor(colors.nightTop, colors.dayTop, values.light));
  sky.addColorStop(1, mixColor(colors.nightBottom, colors.dayBottom, values.light));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = rgba("#ffffff", 0.06 + values.light * 0.04);
  ctx.fillRect(0, 0, w / 2, h);
  ctx.fillStyle = rgba(colors.pulse, 0.05 + values.night * 0.04);
  ctx.fillRect(w / 2, 0, w / 2, h);

  ctx.save();
  ctx.globalAlpha = values.night * 0.55;
  ctx.fillStyle = "#f4fbff";
  const stars = [
    [0.08, 0.13, 1.2],
    [0.18, 0.08, 1.7],
    [0.37, 0.16, 1.1],
    [0.58, 0.11, 1.3],
    [0.82, 0.18, 1.4],
    [0.91, 0.08, 1.1],
  ];
  stars.forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(w * x, h * y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.strokeStyle = rgba("#ffffff", 0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
}

function drawSunAndMoon(values) {
  const { width: w, height: h } = stage;
  const x = w * 0.13;
  const y = h * 0.16;
  const r = Math.max(18, Math.min(w, h) * 0.045);

  ctx.save();
  ctx.globalAlpha = clamp(values.light, 0, 1);
  ctx.fillStyle = rgba(colors.sun, 0.18);
  ctx.beginPath();
  ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.sun;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = smoothstep(0.25, 0.82, values.night);
  ctx.fillStyle = "#dceaf2";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mixColor(colors.nightTop, colors.dayTop, values.light);
  ctx.beginPath();
  ctx.arc(x + r * 0.34, y - r * 0.08, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function groundYAt(x) {
  const { height: h } = stage;
  const base = h * 0.74;
  return base + Math.sin(x * 0.018) * 3 + Math.sin(x * 0.043) * 2;
}

function drawTerrain() {
  const { width: w, height: h } = stage;
  const base = h * 0.74;
  const ground = ctx.createLinearGradient(0, base - 18, 0, h);
  ground.addColorStop(0, colors.groundTop);
  ground.addColorStop(1, colors.groundBottom);

  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(0, groundYAt(0));
  for (let x = 0; x <= w; x += 12) {
    ctx.lineTo(x, groundYAt(x));
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#3b8db2";
  roundedRect(w * 0.05, base + 18, w * 0.18, 16, 8);
  ctx.fill();

  ctx.fillStyle = "#2f9f70";
  for (let i = 0; i < 8; i += 1) {
    const x = w * (0.28 + i * 0.025);
    const y = groundYAt(x) - 12;
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x - 9, y + 5);
    ctx.lineTo(x + 9, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 1.3, y + 3, 2.6, 10);
  }

  ctx.fillStyle = "#d8e2e7";
  const cityX = w * 0.62;
  [24, 38, 30, 46, 28].forEach((height, i) => {
    const x = cityX + i * 18;
    const y = groundYAt(x) - height;
    ctx.fillStyle = i % 2 ? "#c4d2d8" : "#d8e2e7";
    ctx.fillRect(x, y, 13, height);
  });
}

function drawPanelLabel(x, title, subtitle) {
  const { width: w, height: h } = stage;
  const narrow = w < 560;
  const boxW = Math.min(210, w * (narrow ? 0.44 : 0.38));
  const boxH = 58;

  ctx.save();
  ctx.fillStyle = rgba("#071018", 0.34);
  roundedRect(x - boxW / 2, h * 0.04, boxW, boxH, 8);
  ctx.fill();
  ctx.fillStyle = colors.text;
  ctx.font = "800 18px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, x, h * 0.04 + 24);
  ctx.fillStyle = rgba(colors.text, 0.82);
  ctx.font = `${narrow ? "760 11px" : "760 12px"} Inter, system-ui, sans-serif`;
  ctx.fillText(subtitle, x, h * 0.04 + 43);
  ctx.restore();
}

function drawSatellite(x, y, type) {
  const scale = clamp(stage.width / 920, 0.72, 1.05);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = rgba("#071018", 0.32);
  ctx.lineWidth = 1.5;

  ctx.fillStyle = "#dce8ee";
  ctx.fillRect(-23, -12, 46, 24);
  ctx.strokeRect(-23, -12, 46, 24);

  ctx.fillStyle = "#3b718a";
  ctx.fillRect(-67, -8, 36, 16);
  ctx.fillRect(31, -8, 36, 16);
  ctx.strokeRect(-67, -8, 36, 16);
  ctx.strokeRect(31, -8, 36, 16);

  ctx.strokeStyle = rgba("#eef7fa", 0.42);
  [-57, -45, 42, 54].forEach((lineX) => {
    ctx.beginPath();
    ctx.moveTo(lineX, -8);
    ctx.lineTo(lineX, 8);
    ctx.stroke();
  });

  ctx.fillStyle = type === "active" ? colors.pulse : colors.reflect;
  ctx.beginPath();
  ctx.arc(0, 2, 6, 0, Math.PI * 2);
  ctx.fill();

  if (type === "active") {
    ctx.strokeStyle = colors.echo;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 14, 13, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else {
    ctx.fillStyle = rgba(colors.sun, 0.86);
    ctx.beginPath();
    ctx.moveTo(-7, 14);
    ctx.lineTo(7, 14);
    ctx.lineTo(0, 24);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawArrow(from, to, color, alpha, width) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 10 + width * 1.2;

  ctx.save();
  ctx.strokeStyle = rgba(color, alpha);
  ctx.fillStyle = rgba(color, alpha);
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

function drawTravelingDot(from, to, progress, color, radius, alpha) {
  const p = clamp(progress, 0, 1);
  const x = mix(from.x, to.x, p);
  const y = mix(from.y, to.y, p);

  ctx.save();
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(color, alpha * 0.34);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCloud(values) {
  if (!state.cloud) return;

  const { cloudX: x, cloudY: y } = values;
  const scale = clamp(stage.width / 900, 0.72, 1);

  ctx.save();
  ctx.globalAlpha = 0.84;
  ctx.fillStyle = "#eef5f7";
  ctx.strokeStyle = rgba("#8fa7b2", 0.42);
  ctx.lineWidth = 1;
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  roundedRect(-58, 2, 122, 34, 17);
  ctx.fill();
  ctx.stroke();
  [
    [-34, 3, 25],
    [-8, -7, 31],
    [28, -1, 24],
  ].forEach(([cx, cy, r]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

function drawPassiveSystem(values) {
  const { width: w, height: h } = stage;
  const sensor = { x: w * 0.28, y: h * 0.28 };
  const target = { x: w * 0.28, y: groundYAt(w * 0.28) - 8 };
  const sun = { x: w * 0.13, y: h * 0.16 };
  const dotPhase = (state.elapsed % 2200) / 2200;
  const incidentAlpha = clamp(values.light * (1 - values.cloudShade * 0.55), 0.03, 0.94);
  const reflectedAlpha = clamp(values.reflectedPassive, 0.05, 1);

  drawSatellite(sensor.x, sensor.y, "passive");

  if (values.light > 0.16) {
    drawArrow(sun, { x: target.x - 30, y: target.y + 2 }, colors.sun, incidentAlpha, 2.6);
    drawArrow(sun, { x: target.x + 16, y: target.y - 2 }, colors.sun, incidentAlpha * 0.82, 2.1);
    drawTravelingDot(sun, target, dotPhase, colors.sun, 4, incidentAlpha);
  }

  drawArrow(target, sensor, colors.reflect, reflectedAlpha, 2.4);
  drawTravelingDot(target, sensor, (dotPhase + 0.45) % 1, colors.reflect, 4, reflectedAlpha);

  if (values.light < 0.3) {
    ctx.save();
    ctx.strokeStyle = rgba(colors.reflect, 0.18);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 8]);
    ctx.beginPath();
    ctx.moveTo(target.x - 18, target.y - 4);
    ctx.quadraticCurveTo(target.x + 12, h * 0.5, sensor.x, sensor.y + 16);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = rgba(colors.reflect, 0.78);
  ctx.beginPath();
  ctx.arc(target.x, target.y + 5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawActiveSystem(values) {
  const { width: w, height: h } = stage;
  const sensor = { x: w * 0.73, y: h * 0.28 };
  const target = { x: w * 0.72, y: groundYAt(w * 0.72) - 8 };
  const phase = (state.elapsed % 2500) / 2500;

  drawSatellite(sensor.x, sensor.y, "active");

  ctx.save();
  ctx.fillStyle = rgba(colors.pulse, 0.13 + values.night * 0.08);
  ctx.beginPath();
  ctx.moveTo(sensor.x - 12, sensor.y + 14);
  ctx.lineTo(target.x - 72, target.y + 10);
  ctx.lineTo(target.x + 72, target.y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawArrow(sensor, target, colors.pulse, 0.86, 2.6);
  drawArrow(target, sensor, colors.echo, values.activeReturn, 2.2);

  if (phase < 0.52) {
    drawTravelingDot(sensor, target, phase / 0.52, colors.pulse, 5, 0.95);
  } else {
    drawTravelingDot(target, sensor, (phase - 0.52) / 0.48, colors.echo, 4.5, 0.92);
  }

  ctx.save();
  ctx.strokeStyle = rgba(colors.echo, 0.42);
  ctx.lineWidth = 2;
  const ring = 12 + Math.sin(phase * Math.PI * 2) * 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y + 5, ring, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  resizeCanvas();
  const values = sceneValues();

  drawBackground(values);
  drawSunAndMoon(values);
  drawTerrain();
  drawPanelLabel(stage.width * 0.25, "Pasiva", "recibe energía natural");
  drawPanelLabel(stage.width * 0.75, "Activa", "emite y mide el eco");
  drawPassiveSystem(values);
  drawActiveSystem(values);
  drawCloud(values);
  syncUI(values);
}

function frame(now) {
  const delta = Math.min(48, now - state.lastTime);
  state.lastTime = now;
  if (state.playing) state.elapsed += delta;
  draw();
  requestAnimationFrame(frame);
}

ui.sceneOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  state.mode = button.dataset.mode;
  draw();
});

ui.pauseButton.addEventListener("click", () => {
  state.playing = !state.playing;
  draw();
});

ui.cloudButton.addEventListener("click", () => {
  state.cloud = !state.cloud;
  draw();
});

window.addEventListener("resize", draw);

draw();
requestAnimationFrame(frame);
