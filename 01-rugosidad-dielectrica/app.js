const canvas = document.getElementById("sar-canvas");
const ctx = canvas.getContext("2d");

const controls = {
  dielectric: document.getElementById("dielectric"),
  roughness: document.getElementById("roughness"),
  incidence: document.getElementById("incidence"),
  dielectricOutput: document.getElementById("dielectric-output"),
  roughnessOutput: document.getElementById("roughness-output"),
  incidenceOutput: document.getElementById("incidence-output"),
  sigma: document.getElementById("sigma-readout"),
  returnReadout: document.getElementById("return-readout"),
  mode: document.getElementById("mode-readout"),
  interpretation: document.getElementById("interpretation"),
  pulseButton: document.getElementById("pulse-button"),
  demoButton: document.getElementById("demo-button"),
  pauseButton: document.getElementById("pause-button"),
  specularMeter: document.getElementById("specular-meter"),
  diffuseMeter: document.getElementById("diffuse-meter"),
  backscatterMeter: document.getElementById("backscatter-meter"),
  presets: [...document.querySelectorAll(".preset-grid button")],
};

const palette = {
  pulse: "#f4c44f",
  specular: "#245f73",
  back: "#f08a24",
  cyan: "#7fd4ef",
  soil: "#8e685b",
  drySoil: "#9c7b6a",
  wetSoil: "#6d594f",
  skyTop: "#071018",
  skyBottom: "#69b7e8",
};

const demoCases = [
  { dielectric: 3.5, roughness: 0.03 },
  { dielectric: 28, roughness: 0.03 },
  { dielectric: 3.5, roughness: 0.48 },
  { dielectric: 28, roughness: 0.48 },
];

const stars = Array.from({ length: 130 }, (_, index) => {
  const a = pseudo(index * 17.17);
  const b = pseudo(index * 31.41 + 4);
  return {
    x: a,
    y: b * 0.58,
    size: 0.55 + pseudo(index * 9.3) * 1.9,
    twinkle: pseudo(index * 2.91) * Math.PI * 2,
  };
});

const clouds = [
  { x: 0.28, y: 0.61, s: 0.92 },
  { x: 0.55, y: 0.59, s: 1.05 },
  { x: 0.74, y: 0.64, s: 0.72 },
];

const scatterAngles = [-158, -132, -110, -88, -65, -43, -25, -12];

const state = {
  dielectric: Number(controls.dielectric.value),
  roughness: Number(controls.roughness.value),
  incidence: Number(controls.incidence.value),
  paused: false,
  demo: false,
  demoStart: 0,
  pulses: [],
  lastAutoPulse: 0,
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

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function metricsFor(values = state) {
  const eps = values.dielectric;
  const roughness = values.roughness;
  const fresnel = ((Math.sqrt(eps) - 1) / (Math.sqrt(eps) + 1)) ** 2;
  const minFresnel = ((Math.sqrt(3) - 1) / (Math.sqrt(3) + 1)) ** 2;
  const maxFresnel = ((Math.sqrt(35) - 1) / (Math.sqrt(35) + 1)) ** 2;
  const dielectricFactor = clamp((fresnel - minFresnel) / (maxFresnel - minFresnel), 0, 1);
  const roughFactor = smoothstep(0.05, 0.5, roughness);
  const reflectivity = 0.12 + 0.88 * dielectricFactor;
  const specular = clamp(reflectivity * (1 - 0.82 * roughFactor), 0.02, 1);
  const diffuse = clamp(reflectivity * roughFactor, 0.01, 1);
  const incidencePenalty = 1 - Math.abs(values.incidence - 38) / 70;
  const backscatter = clamp(
    0.015 + reflectivity * (0.045 + 0.83 * roughFactor ** 1.12) * incidencePenalty,
    0.01,
    1
  );
  const sigma = -38 + 31 * backscatter ** 0.74;

  return {
    dielectricFactor,
    roughFactor,
    reflectivity,
    specular,
    diffuse,
    backscatter,
    sigma,
    returnPercent: Math.round(backscatter * 100),
  };
}

function classify(values = state, metrics = metricsFor(values)) {
  const dielectricLabel = values.dielectric >= 14 ? "alta εr" : "baja εr";
  const roughLabel = values.roughness >= 0.24 ? "alta rugosidad" : "baja rugosidad";
  const short = `${values.roughness >= 0.24 ? "Rugosa" : "Lisa"} ${
    values.dielectric >= 14 ? "húmeda" : "seca"
  }`;

  let interpretation = "";
  if (values.dielectric < 14 && values.roughness < 0.24) {
    interpretation =
      "Superficie lisa y poco reflectiva: el pulso pierde energía y casi no vuelve al sensor.";
  } else if (values.dielectric >= 14 && values.roughness < 0.24) {
    interpretation =
      "Material reflectivo pero liso: domina la reflexión especular, dirigida fuera de la antena.";
  } else if (values.dielectric < 14 && values.roughness >= 0.24) {
    interpretation =
      "Relieve rugoso con baja reflectividad: hay dispersión en varias direcciones, aunque el retorno sigue siendo moderado.";
  } else {
    interpretation =
      "Reflectividad alta y superficie rugosa: la energía se redistribuye y una fracción importante vuelve al sensor.";
  }

  if (metrics.backscatter > 0.82) {
    interpretation =
      "El retorno es muy alto para esta escala pedagógica: el sensor recibe una señal intensa y amplia.";
  }

  return { dielectricLabel, roughLabel, short, interpretation };
}

function syncControlsFromState() {
  controls.dielectric.value = state.dielectric.toFixed(1);
  controls.roughness.value = state.roughness.toFixed(2);
  controls.incidence.value = state.incidence.toFixed(0);
  controls.dielectricOutput.value = state.dielectric.toFixed(1);
  controls.roughnessOutput.value = state.roughness.toFixed(2);
  controls.incidenceOutput.value = `${Math.round(state.incidence)}°`;

  const metrics = metricsFor();
  const labels = classify(state, metrics);
  controls.sigma.textContent = `${metrics.sigma.toFixed(0)} dB`;
  controls.returnReadout.textContent = `${metrics.returnPercent}%`;
  controls.mode.textContent = labels.short;
  controls.interpretation.textContent = labels.interpretation;
  controls.specularMeter.style.width = `${Math.round(metrics.specular * 100)}%`;
  controls.diffuseMeter.style.width = `${Math.round(metrics.diffuse * 100)}%`;
  controls.backscatterMeter.style.width = `${Math.round(metrics.backscatter * 100)}%`;

  controls.presets.forEach((button) => {
    const d = Number(button.dataset.dielectric);
    const r = Number(button.dataset.roughness);
    button.classList.toggle(
      "is-active",
      Math.abs(d - state.dielectric) < 0.2 && Math.abs(r - state.roughness) < 0.02
    );
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
    stage = { width, height, dpr };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function setValues(values, options = {}) {
  if (typeof values.dielectric === "number") {
    state.dielectric = clamp(values.dielectric, 3, 35);
  }
  if (typeof values.roughness === "number") {
    state.roughness = clamp(values.roughness, 0.01, 0.55);
  }
  if (typeof values.incidence === "number") {
    state.incidence = clamp(values.incidence, 25, 55);
  }
  if (options.stopDemo) {
    state.demo = false;
    controls.demoButton.textContent = "Demo 20 s";
    controls.demoButton.setAttribute("aria-pressed", "false");
  }
  syncControlsFromState();
}

function sensorPoint(w, h) {
  return { x: w * 0.17, y: h * 0.15 };
}

function targetPoint(w, h) {
  const x = w * 0.48;
  return { x, y: terrainY(x, w, h) - 2 };
}

function terrainBase(h) {
  return h * 0.78;
}

function terrainY(x, w, h) {
  const rough = smoothstep(0.02, 0.55, state.roughness);
  const base = terrainBase(h);
  const nx = x / w;
  const amp = mix(h * 0.004, h * 0.052, rough);
  const broad = Math.sin(nx * Math.PI * 7.5 + 0.7) * 0.26;
  const mid = Math.sin(nx * Math.PI * 23 + 1.8) * 0.38;
  const fine = Math.sin(nx * Math.PI * 57 + 0.5) * 0.22;
  const saw = (pseudo(Math.floor(nx * 64) + 11) - 0.5) * 0.24;
  return base - Math.abs((broad + mid + fine + saw) * amp) - rough * h * 0.006;
}

function terrainSlope(x, w, h) {
  const dx = 2;
  return (terrainY(x + dx, w, h) - terrainY(x - dx, w, h)) / (2 * dx);
}

function drawBackground(time) {
  const { width: w, height: h } = stage;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.55, "#183948");
  sky.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  for (const star of stars) {
    const alpha = 0.4 + 0.45 * Math.sin(time * 0.0015 + star.twinkle) ** 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(245, 251, 255, ${alpha})`;
    ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const cloud of clouds) {
    drawCloud(cloud.x * w, cloud.y * h, cloud.s * Math.min(w, h) * 0.16);
  }
}

function drawCloud(cx, cy, scale) {
  ctx.save();
  ctx.globalAlpha = 0.72;
  const gradient = ctx.createRadialGradient(cx, cy, scale * 0.1, cx, cy, scale);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  const parts = [
    [-0.65, 0.05, 0.42, 0.2],
    [-0.25, -0.08, 0.48, 0.24],
    [0.18, 0, 0.52, 0.22],
    [0.58, 0.05, 0.35, 0.17],
  ];
  for (const [x, y, rx, ry] of parts) {
    ctx.beginPath();
    ctx.ellipse(cx + x * scale, cy + y * scale, rx * scale, ry * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBeam() {
  const { width: w, height: h } = stage;
  const sensor = sensorPoint(w, h);
  const target = targetPoint(w, h);
  const right = { x: target.x + w * 0.2, y: terrainBase(h) + 8 };
  const left = { x: target.x - w * 0.035, y: terrainBase(h) + 8 };

  ctx.save();
  ctx.fillStyle = "rgba(230, 243, 250, 0.13)";
  ctx.beginPath();
  ctx.moveTo(sensor.x, sensor.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(230, 243, 250, 0.18)";
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
  const scale = Math.min(w, h) * 0.07;

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
  ctx.moveTo(-scale * 0.08, scale * 0.19);
  ctx.lineTo(-scale * 0.34, scale * 0.58);
  ctx.lineTo(scale * 0.36, scale * 0.58);
  ctx.lineTo(scale * 0.08, scale * 0.19);
  ctx.stroke();

  const glow = 0.32 + 0.22 * Math.sin(time * 0.005);
  ctx.fillStyle = `rgba(244, 196, 79, ${glow})`;
  ctx.beginPath();
  ctx.arc(0, scale * 0.27, scale * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

function drawTerrain() {
  const { width: w, height: h } = stage;
  const metrics = metricsFor();
  const wet = metrics.dielectricFactor;
  const topColor = wet > 0.5 ? palette.wetSoil : palette.drySoil;
  const base = terrainBase(h);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, terrainY(0, w, h));
  const samples = 160;
  for (let i = 1; i <= samples; i += 1) {
    const x = (i / samples) * w;
    ctx.lineTo(x, terrainY(x, w, h));
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  const ground = ctx.createLinearGradient(0, base - h * 0.1, 0, h);
  ground.addColorStop(0, topColor);
  ground.addColorStop(1, "#4a372f");
  ctx.fillStyle = ground;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba("#f2b38d", 0.48 + metrics.dielectricFactor * 0.25);
  ctx.stroke();

  const target = targetPoint(w, h);
  ctx.fillStyle = rgba(palette.pulse, 0.9);
  ctx.beginPath();
  ctx.arc(target.x, target.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPulseAlongPath(start, end, progress, color, alpha, width) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t0 = clamp(progress - 0.12, 0, 1);
  const t1 = clamp(progress + 0.025, 0, 1);
  const x0 = start.x + dx * t0;
  const y0 = start.y + dy * t0;
  const x1 = start.x + dx * t1;
  const y1 = start.y + dy * t1;

  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowBlur = width * 4;
  ctx.shadowColor = rgba(color, alpha);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawMovingRay(start, direction, length, progress, color, alpha, width) {
  const travel = clamp(progress, 0, 1);
  const head = length * travel;
  const tail = Math.max(0, head - length * 0.24);
  const x0 = start.x + direction.x * tail;
  const y0 = start.y + direction.y * tail;
  const x1 = start.x + direction.x * head;
  const y1 = start.y + direction.y * head;

  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowBlur = width * 3;
  ctx.shadowColor = rgba(color, alpha * 0.8);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawImpact(target, progress, metrics) {
  const radius = 6 + progress * (28 + metrics.diffuse * 24);
  const alpha = (1 - progress) * (0.25 + metrics.reflectivity * 0.45);
  ctx.save();
  ctx.strokeStyle = rgba(palette.pulse, alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, radius, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawScattering(pulse, now) {
  const { width: w, height: h } = stage;
  const sensor = sensorPoint(w, h);
  const target = targetPoint(w, h);
  const elapsed = now - pulse.createdAt;
  const incomingDuration = 1180;
  const impactDuration = 260;
  const outgoingDuration = 1750;
  const metrics = metricsFor(pulse.values);

  if (elapsed < incomingDuration) {
    const progress = elapsed / incomingDuration;
    drawPulseAlongPath(sensor, target, progress, palette.pulse, 0.95, 4 + metrics.reflectivity * 2);
    return;
  }

  if (elapsed < incomingDuration + impactDuration) {
    const p = (elapsed - incomingDuration) / impactDuration;
    drawImpact(target, p, metrics);
    return;
  }

  const p = (elapsed - incomingDuration - impactDuration) / outgoingDuration;
  const fade = Math.max(0, 1 - p * 0.18);
  const incoming = normalize({ x: target.x - sensor.x, y: target.y - sensor.y });
  const slope = terrainSlope(target.x, w, h);
  const normal = normalize({ x: -slope, y: -1 });
  const reflected = normalize({
    x: incoming.x - 2 * dot(incoming, normal) * normal.x,
    y: incoming.y - 2 * dot(incoming, normal) * normal.y,
  });
  const back = normalize({ x: sensor.x - target.x, y: sensor.y - target.y });
  const long = Math.max(w, h) * 0.72;

  drawMovingRay(
    target,
    reflected,
    long,
    p,
    palette.specular,
    fade * (0.12 + metrics.specular * 0.82),
    3 + metrics.specular * 5
  );

  const diffuseCount = Math.round(2 + metrics.roughFactor * 9);
  for (let i = 0; i < diffuseCount; i += 1) {
    const angle = ((scatterAngles[i % scatterAngles.length] + pulse.seed * 8 + i * 3) * Math.PI) / 180;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const rayAlpha = fade * metrics.diffuse * (0.18 + pseudo(pulse.seed + i) * 0.28);
    drawMovingRay(
      target,
      direction,
      long * (0.34 + pseudo(i + pulse.seed) * 0.34),
      clamp(p * (0.84 + pseudo(i + 5) * 0.35), 0, 1),
      palette.pulse,
      rayAlpha,
      1.5 + metrics.diffuse * 2.2
    );
  }

  drawMovingRay(
    target,
    back,
    Math.hypot(sensor.x - target.x, sensor.y - target.y),
    p,
    palette.back,
    fade * (0.15 + metrics.backscatter * 0.95),
    2.5 + metrics.backscatter * 5
  );

  if (p > 0.86) {
    const arrival = clamp((p - 0.86) / 0.14, 0, 1);
    ctx.save();
    ctx.strokeStyle = rgba(palette.back, (1 - arrival) * metrics.backscatter);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sensor.x, sensor.y, 10 + arrival * 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawHudValues() {
  const { width: w, height: h } = stage;
  if (w < 560) {
    return;
  }
  const metrics = metricsFor();
  const labels = classify(state, metrics);
  const panelWidth = Math.min(280, w * 0.34);
  const x = w - panelWidth - 18;
  const y = 18;

  ctx.save();
  ctx.fillStyle = "rgba(251, 252, 253, 0.88)";
  ctx.strokeStyle = "rgba(24, 34, 43, 0.14)";
  ctx.lineWidth = 1;
  roundRect(x, y, panelWidth, 104, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#18222b";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText(labels.dielectricLabel, x + 14, y + 24);
  ctx.fillText(labels.roughLabel, x + 14, y + 50);
  ctx.fillText(`retorno ${metrics.returnPercent}%`, x + 14, y + 76);
  ctx.fillText(`σ° ${metrics.sigma.toFixed(0)} dB`, x + 14, y + 96);

  drawMiniBar(x + panelWidth - 116, y + 16, 92, metrics.reflectivity, palette.specular);
  drawMiniBar(x + panelWidth - 116, y + 42, 92, metrics.roughFactor, palette.pulse);
  drawMiniBar(x + panelWidth - 116, y + 68, 92, metrics.backscatter, palette.back);
  ctx.restore();
}

function drawMiniBar(x, y, width, value, color) {
  ctx.fillStyle = "rgba(24, 34, 43, 0.13)";
  roundRect(x, y, width, 8, 4);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(x, y, Math.max(2, width * clamp(value, 0, 1)), 8, 4);
  ctx.fill();
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

function emitPulse(now = performance.now()) {
  state.pulses.push({
    createdAt: now,
    seed: pseudo(now * 0.001 + state.dielectric + state.roughness),
    values: {
      dielectric: state.dielectric,
      roughness: state.roughness,
      incidence: state.incidence,
    },
  });
  state.lastAutoPulse = now;
}

function updateDemo(now) {
  if (!state.demo) {
    return;
  }
  const duration = 20000;
  const t = (now - state.demoStart) % duration;
  const segment = Math.floor(t / 5000);
  const local = t - segment * 5000;
  const current = demoCases[segment];
  const next = demoCases[(segment + 1) % demoCases.length];
  const transition = smoothstep(4200, 5000, local);
  state.dielectric = mix(current.dielectric, next.dielectric, transition);
  state.roughness = mix(current.roughness, next.roughness, transition);
  syncControlsFromState();
}

function draw(now) {
  resizeCanvas();
  updateDemo(now);

  const { width: w, height: h } = stage;
  ctx.clearRect(0, 0, w, h);
  drawBackground(now);
  drawBeam();
  drawSatellite(now);
  drawTerrain();

  if (!state.paused && now - state.lastAutoPulse > 2900) {
    emitPulse(now);
  }

  state.pulses = state.pulses.filter((pulse) => now - pulse.createdAt < 3450);
  for (const pulse of state.pulses) {
    drawScattering(pulse, now);
  }

  drawHudValues();
  requestAnimationFrame(draw);
}

function handleManualChange() {
  setValues(
    {
      dielectric: Number(controls.dielectric.value),
      roughness: Number(controls.roughness.value),
      incidence: Number(controls.incidence.value),
    },
    { stopDemo: true }
  );
}

controls.dielectric.addEventListener("input", handleManualChange);
controls.roughness.addEventListener("input", handleManualChange);
controls.incidence.addEventListener("input", handleManualChange);

controls.pulseButton.addEventListener("click", () => {
  emitPulse();
});

controls.demoButton.addEventListener("click", () => {
  state.demo = !state.demo;
  state.demoStart = performance.now();
  state.paused = false;
  controls.pauseButton.textContent = "Pausar";
  controls.pauseButton.setAttribute("aria-pressed", "false");
  controls.demoButton.textContent = state.demo ? "Detener demo" : "Demo 20 s";
  controls.demoButton.setAttribute("aria-pressed", String(state.demo));
  emitPulse();
});

controls.pauseButton.addEventListener("click", () => {
  state.paused = !state.paused;
  controls.pauseButton.textContent = state.paused ? "Reanudar" : "Pausar";
  controls.pauseButton.setAttribute("aria-pressed", String(state.paused));
});

controls.presets.forEach((button) => {
  button.addEventListener("click", () => {
    setValues(
      {
        dielectric: Number(button.dataset.dielectric),
        roughness: Number(button.dataset.roughness),
      },
      { stopDemo: true }
    );
    emitPulse();
  });
});

window.addEventListener("resize", resizeCanvas);

syncControlsFromState();
emitPulse();
requestAnimationFrame(draw);
