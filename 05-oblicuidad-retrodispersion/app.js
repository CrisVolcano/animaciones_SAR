const canvas = document.getElementById("obliquity-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  incidenceReadout: document.getElementById("incidence-readout"),
  slantReadout: document.getElementById("slant-readout"),
  returnReadout: document.getElementById("return-readout"),
  interpretation: document.getElementById("interpretation"),
  angle: document.getElementById("angle"),
  slope: document.getElementById("slope"),
  angleOutput: document.getElementById("angle-output"),
  slopeOutput: document.getElementById("slope-output"),
  pulseButton: document.getElementById("pulse-button"),
  demoButton: document.getElementById("demo-button"),
  pauseButton: document.getElementById("pause-button"),
  groundMeter: document.getElementById("ground-meter"),
  swathMeter: document.getElementById("swath-meter"),
  rangeLossMeter: document.getElementById("range-loss-meter"),
  backscatterMeter: document.getElementById("backscatter-meter"),
};

const colors = {
  nadir: "#d7eef5",
  beam: "#f2c94c",
  swath: "#48abc1",
  back: "#f08a24",
  ground: "#806652",
  axis: "#e9f2f4",
  skyTop: "#071018",
  skyMid: "#183948",
  skyBottom: "#76b9df",
};

const hypotheticalSurface = {
  roughness: 0.58,
  anglePower: 1.45,
  volumeFloor: 0.06,
  rangePower: 1.1,
  base: 0.82,
  color: "#8a6c55",
  note:
    "En esta superficie hipotética, el retorno representa un blanco distribuido simple. Al aumentar la incidencia, la energía que vuelve al sensor tiende a bajar y la huella sobre el terreno se estira.",
};

const state = {
  incidence: 35,
  slope: 0,
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

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
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

function metricsFor(values = state) {
  const surface = hypotheticalSurface;
  const theta = degToRad(values.incidence);
  const localIncidence = clamp(values.incidence - values.slope, 3, 78);
  const localTheta = degToRad(localIncidence);
  const slant = 1 / Math.cos(theta);
  const ground = Math.tan(theta);
  const groundNorm = clamp((ground - Math.tan(degToRad(15))) / (Math.tan(degToRad(60)) - Math.tan(degToRad(15))), 0, 1);
  const swath = clamp(0.22 + 0.78 * (slant - 1) / (1 / Math.cos(degToRad(60)) - 1), 0, 1);
  const angleTerm = Math.max(0.03, Math.cos(localTheta)) ** surface.anglePower;
  const rangeTerm = 1 / slant ** surface.rangePower;
  const facingTerm = 0.86 + 0.14 * clamp((values.slope + 25) / 50, 0, 1);
  const roughTerm = 0.68 + surface.roughness * 0.32;
  const backscatter = clamp(
    surface.volumeFloor + surface.base * angleTerm * rangeTerm * roughTerm * facingTerm,
    0.02,
    0.96
  );
  const rangeLoss = clamp(1 - rangeTerm, 0, 1);
  const sigma = -33 + 33 * backscatter ** 0.72;

  return {
    localIncidence,
    slant,
    ground,
    groundNorm,
    swath,
    rangeLoss,
    backscatter,
    sigma,
  };
}

function syncUI() {
  const metrics = metricsFor();
  ui.angle.value = String(Math.round(state.incidence));
  ui.slope.value = String(Math.round(state.slope));
  ui.angleOutput.value = `${Math.round(state.incidence)}°`;
  ui.slopeOutput.value = `${Math.round(state.slope)}°`;
  ui.incidenceReadout.textContent = `${Math.round(metrics.localIncidence)}°`;
  ui.slantReadout.textContent = `${metrics.slant.toFixed(2)}x`;
  ui.returnReadout.textContent = `${Math.round(metrics.backscatter * 100)}%`;
  ui.groundMeter.style.width = `${Math.round(metrics.groundNorm * 100)}%`;
  ui.swathMeter.style.width = `${Math.round(metrics.swath * 100)}%`;
  ui.rangeLossMeter.style.width = `${Math.round(metrics.rangeLoss * 100)}%`;
  ui.backscatterMeter.style.width = `${Math.round(metrics.backscatter * 100)}%`;
  ui.demoButton.setAttribute("aria-pressed", state.demo ? "true" : "false");
  ui.demoButton.textContent = state.demo ? "Detener" : "Demo";
  ui.pauseButton.textContent = state.playing ? "Pausar" : "Reproducir";

  const slopePhrase =
    state.slope > 6
      ? " La pendiente mira hacia el sensor: la incidencia local baja y el retorno puede aumentar."
      : state.slope < -6
        ? " La pendiente mira en contra del sensor: la incidencia local sube y el retorno se debilita."
        : " Con terreno plano, la incidencia local coincide casi con el ángulo de incidencia del haz.";
  const tone =
    metrics.backscatter > 0.66
      ? " En una imagen SAR se esperaría un tono relativamente claro."
      : metrics.backscatter < 0.28
        ? " En una imagen SAR se esperaría un tono oscuro."
        : " En una imagen SAR se esperaría un tono intermedio.";
  ui.interpretation.textContent = `${hypotheticalSurface.note}${slopePhrase}${tone}`;
}

function applyQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const incidenceRaw = params.get("incidencia") ?? params.get("incidence");
  const slopeRaw = params.get("pendiente") ?? params.get("slope");
  if (incidenceRaw !== null) {
    const incidence = Number(incidenceRaw);
    if (Number.isFinite(incidence)) state.incidence = clamp(incidence, 15, 60);
  }
  if (slopeRaw !== null) {
    const slope = Number(slopeRaw);
    if (Number.isFinite(slope)) state.slope = clamp(slope, -25, 25);
  }
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
  const theta = degToRad(state.incidence);
  const thetaNorm = clamp((state.incidence - 15) / 45, 0, 1);
  const sensor = { x: w * 0.2, y: h * 0.17 };
  const groundY = h * 0.76;
  const groundRangePx = mix(w * 0.18, w * 0.62, (Math.tan(theta) - Math.tan(degToRad(15))) / (Math.tan(degToRad(60)) - Math.tan(degToRad(15))));
  const nadir = { x: sensor.x, y: groundY };
  const target = {
    x: sensor.x + groundRangePx,
    y: groundY - Math.sin(degToRad(state.slope)) * groundRangePx * 0.18,
  };
  const swathHalf = mix(w * 0.045, w * 0.12, thetaNorm);
  return {
    sensor,
    nadir,
    target,
    near: terrainPoint(target.x - swathHalf),
    far: terrainPoint(target.x + swathHalf),
    groundY,
    swathHalf,
    thetaNorm,
  };
}

function terrainPoint(x) {
  const { width: w, height: h } = stage;
  const base = h * 0.76;
  const nx = x / w;
  const small = Math.sin(nx * Math.PI * 15 + 1.2) * h * 0.006 * hypotheticalSurface.roughness;
  const fine = Math.sin(nx * Math.PI * 43 + 0.8) * h * 0.004 * hypotheticalSurface.roughness;
  return { x, y: base - small - fine };
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
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = "#d7eef5";
  ctx.lineWidth = 1;
  const step = Math.max(44, Math.min(w, h) * 0.09);
  for (let x = -step; x < w + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + w * 0.22, 0);
    ctx.stroke();
  }
  for (let y = h * 0.16; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - h * 0.16);
    ctx.stroke();
  }
  ctx.restore();

  const glow = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.78);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, h * 0.48, w, h * 0.3);

  ctx.save();
  ctx.strokeStyle = rgba(colors.axis, 0.22);
  ctx.lineWidth = 2;
  const g = sceneGeometry();
  const trackStart = { x: g.sensor.x - w * 0.12, y: g.sensor.y + h * 0.08 };
  const trackEnd = { x: g.sensor.x + w * 0.4, y: g.sensor.y - h * 0.14 };
  drawLine(trackStart, trackEnd);
  if (w > 580) drawCanvasLabel(trackEnd.x - 44, trackEnd.y + 22, "Acimut", "rgba(7, 16, 24, 0.58)");
  ctx.restore();
}

function drawGround(time) {
  const { width: w, height: h } = stage;
  const g = sceneGeometry();
  const samples = 120;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, terrainPoint(0).y);
  for (let i = 1; i <= samples; i += 1) {
    const x = (i / samples) * w;
    const p = terrainPoint(x);
    ctx.lineTo(p.x, p.y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const ground = ctx.createLinearGradient(0, h * 0.64, 0, h);
  ground.addColorStop(0, hypotheticalSurface.color);
  ground.addColorStop(1, "#45362d");
  ctx.fillStyle = ground;
  ctx.fill();
  ctx.strokeStyle = "rgba(238, 176, 132, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  drawSwath(g);
  drawLocalSlopePatch(g);
  ctx.restore();
}

function drawSwath(g) {
  const metrics = metricsFor();
  const radiusX = g.swathHalf * 1.55;
  const radiusY = Math.max(8, g.swathHalf * 0.32);
  ctx.save();
  ctx.translate(g.target.x, g.target.y + 4);
  ctx.rotate(-degToRad(state.slope) * 0.55);
  ctx.fillStyle = rgba(colors.swath, 0.16 + metrics.backscatter * 0.14);
  ctx.strokeStyle = rgba(colors.swath, 0.62);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLocalSlopePatch(g) {
  const slopeAngle = -degToRad(state.slope);
  const length = Math.max(80, g.swathHalf * 2.2);
  const d = { x: Math.cos(slopeAngle), y: Math.sin(slopeAngle) };
  const start = { x: g.target.x - d.x * length * 0.5, y: g.target.y - d.y * length * 0.5 };
  const end = { x: g.target.x + d.x * length * 0.5, y: g.target.y + d.y * length * 0.5 };
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  drawLine(start, end);
  ctx.restore();
}

function drawGeometry(time) {
  const { width: w } = stage;
  const g = sceneGeometry();
  const metrics = metricsFor();
  const compact = w < 620;
  const near = g.near;
  const far = g.far;

  ctx.save();
  ctx.fillStyle = rgba(colors.beam, 0.16);
  ctx.beginPath();
  ctx.moveTo(g.sensor.x, g.sensor.y);
  ctx.lineTo(near.x, near.y);
  ctx.lineTo(far.x, far.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = rgba(colors.beam, 0.3);
  ctx.lineWidth = 1.4;
  drawLine(g.sensor, near);
  drawLine(g.sensor, far);
  ctx.restore();

  drawNadir(g, compact);
  drawRanges(g, compact);
  drawIncidentAndReturn(g, metrics, time);
  drawLocalAngle(g, metrics, compact);
  drawSatellite(g.sensor, time);
}

function drawNadir(g, compact) {
  ctx.save();
  ctx.strokeStyle = rgba(colors.nadir, 0.72);
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 7]);
  drawLine(g.sensor, g.nadir);
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(colors.nadir, 0.9);
  ctx.beginPath();
  ctx.arc(g.nadir.x, g.nadir.y, 4, 0, Math.PI * 2);
  ctx.fill();
  if (!compact) drawCanvasLabel(g.nadir.x - 35, (g.nadir.y + g.sensor.y) / 2, "Nadir", "rgba(7, 16, 24, 0.62)");
  ctx.restore();
}

function drawRanges(g, compact) {
  ctx.save();
  ctx.strokeStyle = rgba(colors.axis, 0.46);
  ctx.lineWidth = 1.8;
  ctx.setLineDash([7, 6]);
  drawLine(g.nadir, { x: g.target.x, y: g.nadir.y });
  drawLine(g.sensor, g.target);
  ctx.setLineDash([]);
  if (!compact) {
    drawCanvasLabel((g.nadir.x + g.target.x) / 2, g.nadir.y + 24, "Ground range", "rgba(7, 16, 24, 0.58)");
    drawCanvasLabel((g.sensor.x + g.target.x) / 2 + 20, (g.sensor.y + g.target.y) / 2 - 20, "Slant range", "rgba(7, 16, 24, 0.58)");
  }
  ctx.restore();
}

function drawIncidentAndReturn(g, metrics, time) {
  const cycle = (state.time * 0.42) % 1;
  const incidentProgress = smoothstep(0.02, 0.5, cycle);
  const returnProgress = smoothstep(0.46, 0.92, cycle);
  const flash = state.pulse;
  const returnWidth = 1.8 + metrics.backscatter * 5 + flash * 1.5;
  const returnAlpha = 0.25 + metrics.backscatter * 0.68 + flash * 0.12;

  drawMovingPath(g.sensor, g.target, incidentProgress, colors.beam, 0.84, 4.2);
  drawMovingPath(g.target, g.sensor, returnProgress, colors.back, returnAlpha, returnWidth);

  const awayAngles = [-155, -124, -96, -62, -28, 8];
  ctx.save();
  ctx.lineCap = "round";
  awayAngles.forEach((angle, index) => {
    const spread = degToRad(angle - state.incidence * 0.2);
    const length = mix(42, 105, pseudo(index + 2));
    const alpha = 0.14 + (1 - metrics.backscatter) * 0.18;
    ctx.strokeStyle = rgba(colors.swath, alpha);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(g.target.x, g.target.y);
    ctx.lineTo(g.target.x + Math.cos(spread) * length, g.target.y + Math.sin(spread) * length);
    ctx.stroke();
  });
  ctx.restore();
}

function drawLocalAngle(g, metrics, compact) {
  const slopeAngle = -degToRad(state.slope);
  const normal = normalize({ x: Math.sin(slopeAngle), y: -Math.cos(slopeAngle) });
  const beam = normalize({ x: g.sensor.x - g.target.x, y: g.sensor.y - g.target.y });
  const normalEnd = {
    x: g.target.x + normal.x * 70,
    y: g.target.y + normal.y * 70,
  };

  ctx.save();
  ctx.strokeStyle = rgba(colors.axis, 0.88);
  ctx.lineWidth = 2;
  drawArrow(g.target, normalEnd, rgba(colors.axis, 0.82), 2);
  ctx.strokeStyle = rgba(colors.beam, 0.85);
  ctx.lineWidth = 2;
  drawArcBetween(g.target, normal, beam, 38, rgba(colors.beam, 0.9));
  if (!compact) {
    drawCanvasLabel(normalEnd.x + 20, normalEnd.y - 8, "Normal local", "rgba(7, 16, 24, 0.62)");
    drawCanvasLabel(g.target.x + 44, g.target.y - 38, `${Math.round(metrics.localIncidence)}°`, "rgba(7, 16, 24, 0.7)");
  } else {
    drawCanvasLabel(g.target.x + 28, g.target.y - 30, `${Math.round(metrics.localIncidence)}°`, "rgba(7, 16, 24, 0.7)");
  }
  ctx.restore();
}

function drawSatellite(point, time) {
  const scale = Math.min(stage.width, stage.height) * 0.074;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(-0.2);
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
  ctx.fillStyle = rgba(colors.back, 0.45 + 0.35 * Math.sin(time * 0.004) ** 2 + state.pulse * 0.25);
  ctx.beginPath();
  ctx.arc(0, scale * 0.29, scale * 0.052, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (stage.width > 560) drawCanvasLabel(point.x + scale * 1.08, point.y - scale * 0.58, "Sensor SAR", "rgba(7, 16, 24, 0.62)");
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

function drawMovingPath(start, end, progress, color, alpha, width) {
  const t0 = clamp(progress - 0.16, 0, 1);
  const t1 = clamp(progress + 0.03, 0, 1);
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowBlur = width * 3;
  ctx.shadowColor = rgba(color, alpha * 0.9);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(mix(start.x, end.x, t0), mix(start.y, end.y, t0));
  ctx.lineTo(mix(start.x, end.x, t1), mix(start.y, end.y, t1));
  ctx.stroke();
  ctx.restore();
}

function drawArcBetween(center, v1, v2, radius, strokeStyle) {
  let a1 = Math.atan2(v1.y, v1.x);
  let a2 = Math.atan2(v2.y, v2.x);
  while (a2 - a1 > Math.PI) a2 -= Math.PI * 2;
  while (a1 - a2 > Math.PI) a1 -= Math.PI * 2;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, a1, a2, a2 < a1);
  ctx.stroke();
  ctx.restore();
}

function drawArrow(start, end, strokeStyle, lineWidth) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = 10 + lineWidth * 1.5;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.fillStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  drawLine(start, end);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - Math.cos(angle - 0.48) * head, end.y - Math.sin(angle - 0.48) * head);
  ctx.lineTo(end.x - Math.cos(angle + 0.48) * head, end.y - Math.sin(angle + 0.48) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLine(start, end) {
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
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
  drawBackground(time);
  drawGround(time);
  drawGeometry(time);
}

function animate(now) {
  const dt = Math.min(60, now - state.lastTime) / 1000;
  state.lastTime = now;
  if (state.playing) {
    state.time += dt;
    if (state.demo) {
      const t = (now - state.demoStart) / 1000;
      state.incidence = 37.5 + Math.sin(t * 0.62) * 22.5;
      state.slope = Math.sin(t * 0.38 + 0.9) * 14;
      syncUI();
    }
  }
  state.pulse = Math.max(0, state.pulse - dt * 1.6);
  draw(now);
  requestAnimationFrame(animate);
}

ui.angle.addEventListener("input", () => {
  state.incidence = Number(ui.angle.value);
  state.demo = false;
  state.pulse = 1;
  syncUI();
});

ui.slope.addEventListener("input", () => {
  state.slope = Number(ui.slope.value);
  state.demo = false;
  state.pulse = 1;
  syncUI();
});

ui.pulseButton.addEventListener("click", () => {
  state.pulse = 1;
  state.time = 0;
});

ui.demoButton.addEventListener("click", () => {
  state.demo = !state.demo;
  state.demoStart = performance.now();
  state.playing = true;
  state.pulse = 1;
  syncUI();
});

ui.pauseButton.addEventListener("click", () => {
  state.playing = !state.playing;
  syncUI();
});

applyQueryParams();
syncUI();
requestAnimationFrame(animate);
