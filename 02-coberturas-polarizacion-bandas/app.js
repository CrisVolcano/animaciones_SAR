const canvas = document.getElementById("sar-canvas");
const ctx = canvas.getContext("2d");

const ui = {
  sigma: document.getElementById("sigma-readout"),
  mechanism: document.getElementById("mechanism-readout"),
  depol: document.getElementById("depol-readout"),
  interpretation: document.getElementById("interpretation"),
  volume: document.getElementById("volume"),
  moisture: document.getElementById("moisture"),
  structure: document.getElementById("structure"),
  incidence: document.getElementById("incidence"),
  volumeOutput: document.getElementById("volume-output"),
  moistureOutput: document.getElementById("moisture-output"),
  structureOutput: document.getElementById("structure-output"),
  incidenceOutput: document.getElementById("incidence-output"),
  volumeLabel: document.getElementById("volume-label"),
  structureLabel: document.getElementById("structure-label"),
  pulseButton: document.getElementById("pulse-button"),
  demoButton: document.getElementById("demo-button"),
  pauseButton: document.getElementById("pause-button"),
  surfaceMeter: document.getElementById("surface-meter"),
  volumeMeter: document.getElementById("volume-meter"),
  doubleMeter: document.getElementById("double-meter"),
  penetrationMeter: document.getElementById("penetration-meter"),
  coverButtons: [...document.querySelectorAll("[data-cover]")],
  polButtons: [...document.querySelectorAll("[data-pol]")],
  bandButtons: [...document.querySelectorAll("[data-band]")],
};

const colors = {
  pulse: "#f2c94c",
  surface: "#4cb1c6",
  volume: "#4aa26b",
  double: "#bf5a68",
  back: "#f08a24",
  text: "#17222b",
  skyTop: "#071018",
  skyMid: "#183948",
  skyBottom: "#75b8e2",
};

const covers = {
  forest: {
    name: "Árboles",
    volumeLabel: "Volumen vegetal",
    structureLabel: "Aleatoriedad del dosel",
    surfaceBase: 0.2,
    volumeBase: 1.0,
    doubleBase: 0.18,
    randomBase: 0.9,
    verticalBase: 0.6,
    roughBase: 0.72,
    notes:
      "En árboles, la señal se dispersa dentro del dosel. VH/HV crecen con volumen y aleatoriedad; L penetra más hacia ramas gruesas, troncos y suelo.",
  },
  urban: {
    name: "Infraestructura",
    volumeLabel: "Densidad de estructuras",
    structureLabel: "Alineación con el radar",
    surfaceBase: 0.55,
    volumeBase: 0.12,
    doubleBase: 1.0,
    randomBase: 0.25,
    verticalBase: 1.0,
    roughBase: 0.48,
    notes:
      "En infraestructura dominan retornos de doble rebote entre pared y suelo. HH suele fortalecer esta geometría; VH/HV aparecen por orientación irregular y múltiples rebotes.",
  },
  pasture: {
    name: "Pastos",
    volumeLabel: "Altura / biomasa",
    structureLabel: "Textura de pasto",
    surfaceBase: 0.62,
    volumeBase: 0.38,
    doubleBase: 0.05,
    randomBase: 0.45,
    verticalBase: 0.22,
    roughBase: 0.34,
    notes:
      "En pastos domina una mezcla de superficie y volumen bajo. C y X responden a hojas y textura fina; L tiende a integrar una capa más profunda.",
  },
  crops: {
    name: "Cultivos",
    volumeLabel: "Biomasa del cultivo",
    structureLabel: "Orientación de surcos",
    surfaceBase: 0.42,
    volumeBase: 0.72,
    doubleBase: 0.18,
    randomBase: 0.58,
    verticalBase: 0.42,
    roughBase: 0.52,
    notes:
      "En cultivos se mezclan suelo, hojas, tallos y orientación de surcos. VH/HV resaltan estructura vegetal; VV/HH retienen más información de suelo y geometría.",
  },
};

const bands = {
  X: {
    name: "X",
    wavelengthCm: 3.1,
    penetration: 0.22,
    volumeForest: 0.86,
    volumePasture: 0.7,
    volumeCrops: 0.72,
    urbanDouble: 0.76,
    surface: 0.92,
    color: "#69d3ff",
  },
  C: {
    name: "C",
    wavelengthCm: 5.6,
    penetration: 0.52,
    volumeForest: 1.0,
    volumePasture: 0.82,
    volumeCrops: 1.0,
    urbanDouble: 0.9,
    surface: 0.86,
    color: "#f2c94c",
  },
  L: {
    name: "L",
    wavelengthCm: 23,
    penetration: 0.9,
    volumeForest: 0.78,
    volumePasture: 0.48,
    volumeCrops: 0.68,
    urbanDouble: 1.0,
    surface: 0.76,
    color: "#f08a24",
  },
};

const pols = {
  VV: { tx: "V", rx: "V", cross: false, surface: 1.0, volume: 0.42, double: 0.78 },
  VH: { tx: "V", rx: "H", cross: true, surface: 0.18, volume: 1.18, double: 0.22 },
  HH: { tx: "H", rx: "H", cross: false, surface: 0.9, volume: 0.48, double: 1.06 },
  HV: { tx: "H", rx: "V", cross: true, surface: 0.16, volume: 1.08, double: 0.24 },
};

const demoSteps = [
  { cover: "forest", pol: "VH", band: "C", volume: 78, moisture: 58, structure: 82 },
  { cover: "forest", pol: "HH", band: "L", volume: 82, moisture: 62, structure: 68 },
  { cover: "urban", pol: "HH", band: "L", volume: 68, moisture: 48, structure: 82 },
  { cover: "pasture", pol: "VV", band: "C", volume: 34, moisture: 42, structure: 38 },
  { cover: "crops", pol: "VH", band: "C", volume: 70, moisture: 54, structure: 76 },
  { cover: "crops", pol: "VV", band: "X", volume: 58, moisture: 36, structure: 64 },
];

const stars = Array.from({ length: 135 }, (_, index) => ({
  x: pseudo(index * 13.11),
  y: pseudo(index * 29.7 + 3) * 0.58,
  size: 0.55 + pseudo(index * 7.19) * 1.8,
  twinkle: pseudo(index * 2.71) * Math.PI * 2,
}));

const scatterAngles = [-156, -132, -114, -96, -74, -54, -34, -16, -4];

const state = {
  cover: "forest",
  pol: "VH",
  band: "C",
  volume: 65,
  moisture: 55,
  structure: 70,
  incidence: 38,
  paused: false,
  demo: false,
  demoStart: 0,
  lastAutoPulse: 0,
  pulses: [],
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

function terrainBase(h) {
  return h * 0.76;
}

function terrainY(x, w, h, values = state) {
  const cover = covers[values.cover];
  const rough = clamp(cover.roughBase * 0.65 + (values.structure / 100) * 0.35, 0, 1);
  const base = terrainBase(h);
  const nx = x / w;
  const amp = mix(h * 0.006, h * 0.035, rough);
  const rows = values.cover === "crops" ? Math.abs(Math.sin(nx * Math.PI * 28)) * amp * 0.42 : 0;
  const urbanStep = values.cover === "urban" ? Math.floor(nx * 18) % 2 === 0 ? amp * 0.2 : 0 : 0;
  return (
    base -
    Math.abs(Math.sin(nx * Math.PI * 9 + 0.8) * amp * 0.38) -
    Math.abs(Math.sin(nx * Math.PI * 41 + 2.2) * amp * 0.28) -
    rows -
    urbanStep
  );
}

function sensorPoint(w, h) {
  return { x: w * 0.16, y: h * 0.15 };
}

function targetPoint(w, h, values = state) {
  const penetration = metricsFor(values).penetration;
  const ground = terrainY(w * 0.52, w, h, values);
  const canopyLift =
    values.cover === "forest"
      ? mix(h * 0.19, h * 0.04, penetration)
      : values.cover === "crops"
        ? mix(h * 0.1, h * 0.025, penetration)
        : values.cover === "pasture"
          ? mix(h * 0.05, h * 0.015, penetration)
          : 0;
  return { x: w * 0.52, y: ground - canopyLift };
}

function metricsFor(values = state) {
  const cover = covers[values.cover];
  const band = bands[values.band];
  const pol = pols[values.pol];
  const vol = values.volume / 100;
  const moisture = values.moisture / 100;
  const structure = values.structure / 100;
  const incidence = 1 - Math.abs(values.incidence - 38) / 70;
  const wetReflectivity = 0.38 + 0.62 * moisture;
  const bandVolume =
    values.cover === "forest"
      ? band.volumeForest
      : values.cover === "pasture"
        ? band.volumePasture
        : values.cover === "crops"
          ? band.volumeCrops
          : 0.22;
  const penetration = clamp(
    band.penetration *
      (1 - cover.volumeBase * vol * moisture * 0.24) *
      (values.cover === "urban" ? 1.08 : 1),
    0.08,
    1
  );
  const canopyOpacity = clamp(cover.volumeBase * vol * (1 - penetration * 0.38), 0, 1);
  const orientationBoost =
    values.cover === "urban"
      ? 0.45 + structure * 0.75
      : values.cover === "crops"
        ? 0.7 + Math.abs(structure - 0.5) * 0.5
        : 0.82 + structure * 0.18;
  const surface = clamp(
    cover.surfaceBase *
      band.surface *
      wetReflectivity *
      pol.surface *
      incidence *
      (1 - canopyOpacity * 0.46) *
      (0.72 + structure * 0.28),
    0,
    1
  );
  const volume = clamp(
    cover.volumeBase *
      vol *
      bandVolume *
      pol.volume *
      incidence *
      (0.42 + cover.randomBase * structure * 0.58) *
      (0.72 + moisture * 0.28),
    0,
    1
  );
  const doubleBounce = clamp(
    cover.doubleBase *
      band.urbanDouble *
      pol.double *
      wetReflectivity *
      incidence *
      orientationBoost *
      (values.cover === "forest" ? penetration * (0.35 + vol * 0.65) : 1) *
      (values.cover === "pasture" ? 0.35 : 1),
    0,
    1
  );
  const depolarization = clamp(
    cover.randomBase * vol * bandVolume * (0.55 + structure * 0.45) * (0.75 + moisture * 0.25) +
      (pol.cross ? 0.12 : 0) +
      (values.cover === "urban" ? structure * 0.1 : 0),
    0,
    1
  );
  const crossWeight = pol.cross ? 1.05 : 0.62;
  const total = clamp(
    0.03 +
      surface * 0.36 +
      volume * (pol.cross ? 0.58 : 0.38) +
      doubleBounce * 0.55 +
      depolarization * 0.08 * crossWeight,
    0,
    1
  );
  const sigma = -34 + 38 * total ** 0.76;
  const dominant = [
    ["Superficie", surface],
    ["Volumen", volume],
    ["Doble rebote", doubleBounce],
  ].sort((a, b) => b[1] - a[1])[0][0];

  return {
    surface,
    volume,
    doubleBounce,
    depolarization,
    penetration,
    total,
    sigma,
    dominant,
    bandVolume,
    canopyOpacity,
  };
}

function syncUI() {
  const metrics = metricsFor();
  const cover = covers[state.cover];
  const band = bands[state.band];
  ui.volume.value = String(state.volume);
  ui.moisture.value = String(state.moisture);
  ui.structure.value = String(state.structure);
  ui.incidence.value = String(state.incidence);
  ui.volumeOutput.value = `${Math.round(state.volume)}%`;
  ui.moistureOutput.value = `${Math.round(state.moisture)}%`;
  ui.structureOutput.value = `${Math.round(state.structure)}%`;
  ui.incidenceOutput.value = `${Math.round(state.incidence)}°`;
  ui.volumeLabel.textContent = cover.volumeLabel;
  ui.structureLabel.textContent = cover.structureLabel;
  ui.sigma.textContent = `${metrics.sigma.toFixed(0)} dB`;
  ui.mechanism.textContent = metrics.dominant;
  ui.depol.textContent = `${Math.round(metrics.depolarization * 100)}%`;
  ui.surfaceMeter.style.width = `${Math.round(metrics.surface * 100)}%`;
  ui.volumeMeter.style.width = `${Math.round(metrics.volume * 100)}%`;
  ui.doubleMeter.style.width = `${Math.round(metrics.doubleBounce * 100)}%`;
  ui.penetrationMeter.style.width = `${Math.round(metrics.penetration * 100)}%`;

  const polPhrase = pols[state.pol].cross
    ? `${state.pol} mide energía cruzada y por eso responde mejor a despolarización.`
    : `${state.pol} conserva la polarización transmitida y favorece retornos de superficie o geometría.`;
  ui.interpretation.textContent = `${cover.notes} Banda ${band.name} (~${band.wavelengthCm} cm). ${polPhrase}`;

  ui.coverButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.cover === state.cover);
  });
  ui.polButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.pol === state.pol);
  });
  ui.bandButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.band === state.band);
  });
}

function setState(next, options = {}) {
  if (next.cover) state.cover = next.cover;
  if (next.pol) state.pol = next.pol;
  if (next.band) state.band = next.band;
  if (typeof next.volume === "number") state.volume = clamp(next.volume, 0, 100);
  if (typeof next.moisture === "number") state.moisture = clamp(next.moisture, 0, 100);
  if (typeof next.structure === "number") state.structure = clamp(next.structure, 0, 100);
  if (typeof next.incidence === "number") state.incidence = clamp(next.incidence, 25, 55);
  if (options.stopDemo) {
    state.demo = false;
    ui.demoButton.textContent = "Demo";
    ui.demoButton.setAttribute("aria-pressed", "false");
  }
  syncUI();
}

function applyQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const next = {};
  const cover = params.get("cover");
  const pol = params.get("pol");
  const band = params.get("band");
  if (cover && covers[cover]) next.cover = cover;
  if (pol && pols[pol.toUpperCase()]) next.pol = pol.toUpperCase();
  if (band && bands[band.toUpperCase()]) next.band = band.toUpperCase();

  ["volume", "moisture", "structure", "incidence"].forEach((key) => {
    const raw = params.get(key);
    if (raw !== null && raw.trim() !== "") {
      const value = Number(raw);
      if (Number.isFinite(value)) next[key] = value;
    }
  });

  setState(next);
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

function drawBackground(time) {
  const { width: w, height: h } = stage;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, colors.skyTop);
  sky.addColorStop(0.55, colors.skyMid);
  sky.addColorStop(1, colors.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  for (const star of stars) {
    const alpha = 0.38 + 0.45 * Math.sin(time * 0.0014 + star.twinkle) ** 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(245, 251, 255, ${alpha})`;
    ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  const horizon = ctx.createLinearGradient(0, h * 0.58, 0, h * 0.78);
  horizon.addColorStop(0, "rgba(255, 255, 255, 0.16)");
  horizon.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, h * 0.52, w, h * 0.26);
}

function drawBeam() {
  const { width: w, height: h } = stage;
  const sensor = sensorPoint(w, h);
  const target = targetPoint(w, h);
  const band = bands[state.band];
  const spread = mix(w * 0.11, w * 0.22, bands[state.band].penetration);

  ctx.save();
  ctx.fillStyle = rgba(band.color, 0.12);
  ctx.beginPath();
  ctx.moveTo(sensor.x, sensor.y);
  ctx.lineTo(target.x - spread * 0.32, terrainBase(h) + h * 0.08);
  ctx.lineTo(target.x + spread, terrainBase(h) + h * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = rgba(band.color, 0.24);
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
  const scale = Math.min(w, h) * 0.072;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-0.2);
  ctx.strokeStyle = "#f5fbff";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(245, 251, 255, 0.07)";
  ctx.strokeRect(-scale * 0.18, -scale * 0.16, scale * 0.36, scale * 0.32);
  ctx.beginPath();
  ctx.arc(0, 0, scale * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  drawPanel(-scale * 1.04, -scale * 0.22, scale * 0.82, scale * 0.44);
  drawPanel(scale * 0.22, -scale * 0.22, scale * 0.82, scale * 0.44);
  ctx.beginPath();
  ctx.moveTo(-scale * 0.08, scale * 0.2);
  ctx.lineTo(-scale * 0.34, scale * 0.58);
  ctx.lineTo(scale * 0.34, scale * 0.58);
  ctx.lineTo(scale * 0.08, scale * 0.2);
  ctx.stroke();
  ctx.fillStyle = rgba(bands[state.band].color, 0.45 + 0.28 * Math.sin(time * 0.004) ** 2);
  ctx.beginPath();
  ctx.arc(0, scale * 0.28, scale * 0.048, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawPolarizationGlyph(p.x + scale * 0.95, p.y + scale * 0.72, scale * 0.38);
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

function drawPolarizationGlyph(x, y, size) {
  const pol = pols[state.pol];
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(7, 16, 24, 0.55)";
  roundRect(x - size * 0.8, y - size * 0.48, size * 1.6, size * 0.96, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.pol, x, y + 4);
  ctx.font = "700 9px system-ui, sans-serif";
  ctx.fillText(`${pol.tx}→${pol.rx}`, x, y + size * 0.34);
  ctx.restore();
}

function drawGround() {
  const { width: w, height: h } = stage;
  const wet = state.moisture / 100;
  const top = state.cover === "urban" ? "#6d7479" : wet > 0.55 ? "#66564c" : "#9a7661";

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
  const ground = ctx.createLinearGradient(0, terrainBase(h), 0, h);
  ground.addColorStop(0, top);
  ground.addColorStop(1, state.cover === "urban" ? "#353b40" : "#4f392f");
  ctx.fillStyle = ground;
  ctx.fill();
  ctx.strokeStyle = state.cover === "urban" ? "rgba(220, 230, 234, 0.58)" : "rgba(238, 176, 132, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawCoverage(time) {
  if (state.cover === "forest") drawForest(time);
  if (state.cover === "urban") drawUrban(time);
  if (state.cover === "pasture") drawPasture(time);
  if (state.cover === "crops") drawCrops(time);
}

function drawForest(time) {
  const { width: w, height: h } = stage;
  const vol = state.volume / 100;
  const metrics = metricsFor();
  const count = Math.round(mix(7, 18, vol));

  for (let i = 0; i < count; i += 1) {
    const x = w * (0.18 + i * 0.045 + (pseudo(i + 2) - 0.5) * 0.025);
    const ground = terrainY(x, w, h);
    const treeH = h * mix(0.13, 0.27, vol) * (0.8 + pseudo(i + 4) * 0.45);
    const trunkW = mix(3, 8, bands[state.band].penetration) * (0.8 + pseudo(i) * 0.5);
    ctx.fillStyle = "#5a3b2c";
    ctx.fillRect(x - trunkW * 0.5, ground - treeH * 0.78, trunkW, treeH * 0.78);

    const canopyR = treeH * mix(0.28, 0.43, vol);
    const sway = Math.sin(time * 0.001 + i) * 1.2;
    const canopy = ctx.createRadialGradient(x + sway, ground - treeH, canopyR * 0.1, x, ground - treeH, canopyR);
    canopy.addColorStop(0, rgba("#9fd48d", 0.78));
    canopy.addColorStop(1, rgba("#245f3f", 0.7 + metrics.canopyOpacity * 0.22));
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.ellipse(x + sway, ground - treeH, canopyR * 1.05, canopyR * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawUrban() {
  const { width: w, height: h } = stage;
  const density = state.volume / 100;
  const align = state.structure / 100;
  const count = Math.round(mix(5, 10, density));

  for (let i = 0; i < count; i += 1) {
    const bw = w * mix(0.045, 0.075, pseudo(i + 9));
    const x = w * (0.2 + i * 0.07);
    const ground = terrainY(x, w, h);
    const bh = h * mix(0.11, 0.28, density) * (0.72 + pseudo(i + 1) * 0.55);
    const skew = (align - 0.5) * 9;

    ctx.save();
    ctx.translate(x, ground);
    ctx.fillStyle = i % 2 ? "#65717a" : "#788891";
    ctx.strokeStyle = "rgba(235, 245, 248, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.5, 0);
    ctx.lineTo(-bw * 0.5 + skew, -bh);
    ctx.lineTo(bw * 0.5 + skew, -bh);
    ctx.lineTo(bw * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(247, 218, 117, 0.45)";
    const rows = Math.max(2, Math.floor(bh / 22));
    for (let r = 1; r <= rows; r += 1) {
      ctx.fillRect(-bw * 0.32 + skew * (r / rows), -r * (bh / (rows + 1)), bw * 0.14, 4);
      ctx.fillRect(bw * 0.08 + skew * (r / rows), -r * (bh / (rows + 1)), bw * 0.14, 4);
    }
    ctx.restore();
  }
}

function drawPasture(time) {
  const { width: w, height: h } = stage;
  const biomass = state.volume / 100;
  const blades = Math.round(mix(80, 190, biomass));
  ctx.save();
  ctx.strokeStyle = rgba("#77bd74", 0.65);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < blades; i += 1) {
    const x = (i / blades) * w + (pseudo(i + 31) - 0.5) * 8;
    const y = terrainY(x, w, h);
    const bladeH = h * mix(0.025, 0.075, biomass) * (0.65 + pseudo(i + 2) * 0.7);
    const lean = Math.sin(time * 0.0015 + i) * 2.5 + (pseudo(i + 4) - 0.5) * 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - bladeH * 0.55, x + lean, y - bladeH);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrops(time) {
  const { width: w, height: h } = stage;
  const biomass = state.volume / 100;
  const orientation = state.structure / 100;
  const rows = 9;
  ctx.save();
  for (let r = 0; r < rows; r += 1) {
    const yShift = (r - rows / 2) * h * 0.013;
    const startX = w * 0.05;
    const endX = w * 0.98;
    ctx.strokeStyle = rgba("#6fa463", 0.28 + biomass * 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, terrainY(startX, w, h) + yShift);
    ctx.lineTo(endX, terrainY(endX, w, h) + yShift - orientation * h * 0.05);
    ctx.stroke();
  }

  const plants = Math.round(mix(45, 120, biomass));
  ctx.strokeStyle = rgba("#78bd6c", 0.68);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < plants; i += 1) {
    const x = w * (0.08 + pseudo(i + 18) * 0.86);
    const y = terrainY(x, w, h) - pseudo(i + 19) * h * 0.04;
    const plantH = h * mix(0.035, 0.13, biomass) * (0.65 + pseudo(i) * 0.6);
    const sway = Math.sin(time * 0.0012 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sway, y - plantH);
    ctx.moveTo(x + sway, y - plantH * 0.58);
    ctx.lineTo(x + sway - 8, y - plantH * 0.75);
    ctx.moveTo(x + sway, y - plantH * 0.5);
    ctx.lineTo(x + sway + 8, y - plantH * 0.66);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPath(start, end, progress, color, alpha, width, dashed = false) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t0 = clamp(progress - 0.13, 0, 1);
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
  const tail = Math.max(0, head - length * 0.23);
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowBlur = width * 3;
  ctx.shadowColor = rgba(color, alpha * 0.9);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.setLineDash([14, 11]);
  ctx.beginPath();
  ctx.moveTo(start.x + direction.x * tail, start.y + direction.y * tail);
  ctx.lineTo(start.x + direction.x * head, start.y + direction.y * head);
  ctx.stroke();
  ctx.restore();
}

function drawCurvedRay(start, mid, end, progress, color, alpha, width) {
  const t = clamp(progress, 0, 1);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  const currentEnd = quadraticPoint(start, mid, end, t);
  const currentMid = quadraticPoint(start, mid, end, t * 0.5);
  ctx.quadraticCurveTo(currentMid.x, currentMid.y, currentEnd.x, currentEnd.y);
  ctx.stroke();
  ctx.restore();
}

function quadraticPoint(a, b, c, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * a.x + 2 * mt * t * b.x + t * t * c.x,
    y: mt * mt * a.y + 2 * mt * t * b.y + t * t * c.y,
  };
}

function drawPulse(pulse, now) {
  const { width: w, height: h } = stage;
  const values = pulse.values;
  const sensor = sensorPoint(w, h);
  const target = targetPoint(w, h, values);
  const metrics = metricsFor(values);
  const band = bands[values.band];
  const elapsed = now - pulse.createdAt;
  const incomingDuration = 1120;
  const dwellDuration = 360;
  const outgoingDuration = 1850;

  if (elapsed < incomingDuration) {
    drawPath(sensor, target, elapsed / incomingDuration, band.color, 0.96, 4 + metrics.total * 4);
    drawWavePacket(sensor, target, elapsed / incomingDuration, values);
    return;
  }

  if (elapsed < incomingDuration + dwellDuration) {
    const p = (elapsed - incomingDuration) / dwellDuration;
    drawInteractionHalo(target, p, metrics);
    return;
  }

  const p = (elapsed - incomingDuration - dwellDuration) / outgoingDuration;
  const fade = Math.max(0, 1 - p * 0.16);
  const back = normalize({ x: sensor.x - target.x, y: sensor.y - target.y });
  const long = Math.max(w, h) * 0.72;

  const surfaceDir = normalize({ x: 0.8, y: -0.6 });
  drawMovingRay(
    target,
    surfaceDir,
    long * 0.62,
    p,
    colors.surface,
    fade * (0.12 + metrics.surface * 0.9),
    2 + metrics.surface * 4
  );

  const volumeCount = Math.round(2 + metrics.volume * 10 + metrics.depolarization * 4);
  for (let i = 0; i < volumeCount; i += 1) {
    const angle = ((scatterAngles[i % scatterAngles.length] + pulse.seed * 12 + i * 2) * Math.PI) / 180;
    const distance = long * (0.22 + pseudo(i + pulse.seed) * 0.34);
    const mid = {
      x: target.x + Math.cos(angle) * distance * 0.4,
      y: target.y + Math.sin(angle) * distance * 0.15 - h * 0.06 * metrics.volume,
    };
    const end = {
      x: target.x + Math.cos(angle) * distance,
      y: target.y + Math.sin(angle) * distance,
    };
    drawCurvedRay(
      target,
      mid,
      end,
      clamp(p * (0.75 + pseudo(i + 5) * 0.45), 0, 1),
      colors.volume,
      fade * metrics.volume * (0.18 + pseudo(i + 2) * 0.26),
      1.4 + metrics.depolarization * 2.2
    );
  }

  if (metrics.doubleBounce > 0.04) {
    drawDoubleBounce(target, sensor, p, metrics, values);
  }

  drawMovingRay(
    target,
    back,
    Math.hypot(sensor.x - target.x, sensor.y - target.y),
    p,
    colors.back,
    fade * (0.16 + metrics.total * 0.96),
    2.4 + metrics.total * 5
  );

  if (p > 0.85) {
    drawSensorArrival(sensor, (p - 0.85) / 0.15, metrics);
  }
}

function drawMechanismPreview(time) {
  const { width: w, height: h } = stage;
  const sensor = sensorPoint(w, h);
  const target = targetPoint(w, h);
  const metrics = metricsFor();
  const pulse = 0.72 + 0.28 * Math.sin(time * 0.0018) ** 2;
  const back = normalize({ x: sensor.x - target.x, y: sensor.y - target.y });
  const surfaceDir = normalize({ x: 0.86, y: -0.5 });
  const long = Math.max(w, h);

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = rgba(colors.surface, (0.06 + metrics.surface * 0.2) * pulse);
  ctx.lineWidth = 1.6 + metrics.surface * 2.6;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  ctx.lineTo(target.x + surfaceDir.x * long * 0.36, target.y + surfaceDir.y * long * 0.36);
  ctx.stroke();

  const volumeCount = Math.round(3 + metrics.volume * 8);
  ctx.strokeStyle = rgba(colors.volume, (0.08 + metrics.volume * 0.22) * pulse);
  ctx.lineWidth = 1.1 + metrics.depolarization * 2.1;
  ctx.setLineDash([6, 9]);
  for (let i = 0; i < volumeCount; i += 1) {
    const angle = ((-154 + i * 18 + pseudo(i + state.volume) * 8) * Math.PI) / 180;
    const distance = long * (0.12 + pseudo(i + 8) * 0.22);
    const end = {
      x: target.x + Math.cos(angle) * distance,
      y: target.y + Math.sin(angle) * distance,
    };
    const mid = {
      x: mix(target.x, end.x, 0.48),
      y: mix(target.y, end.y, 0.48) - h * 0.035 * metrics.volume,
    };
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
    ctx.stroke();
  }

  if (metrics.doubleBounce > 0.05) {
    const ground = { x: target.x + w * 0.04, y: terrainY(target.x + w * 0.04, w, h) };
    const vertical = {
      x: target.x + (state.cover === "urban" ? w * 0.09 : w * 0.028),
      y: ground.y - h * (state.cover === "urban" ? 0.18 : 0.11),
    };
    ctx.strokeStyle = rgba(colors.double, (0.07 + metrics.doubleBounce * 0.28) * pulse);
    ctx.lineWidth = 1.8 + metrics.doubleBounce * 3;
    ctx.setLineDash([10, 9]);
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(ground.x, ground.y);
    ctx.lineTo(vertical.x, vertical.y);
    ctx.lineTo(sensor.x, sensor.y);
    ctx.stroke();
  }

  ctx.strokeStyle = rgba(colors.back, (0.08 + metrics.total * 0.24) * pulse);
  ctx.lineWidth = 1.6 + metrics.total * 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  ctx.lineTo(target.x + back.x * long * 0.45, target.y + back.y * long * 0.45);
  ctx.stroke();
  ctx.restore();
}

function drawWavePacket(start, end, progress, values) {
  const pol = pols[values.pol];
  const x = mix(start.x, end.x, clamp(progress + 0.02, 0, 1));
  const y = mix(start.y, end.y, clamp(progress + 0.02, 0, 1));
  const size = 11;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (pol.tx === "V") {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
  } else {
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawInteractionHalo(target, progress, metrics) {
  ctx.save();
  ctx.strokeStyle = rgba(colors.volume, (1 - progress) * (0.18 + metrics.volume * 0.45));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 8 + progress * (34 + metrics.volume * 32), 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(colors.double, (1 - progress) * metrics.doubleBounce * 0.65);
  ctx.beginPath();
  ctx.arc(target.x, target.y, 4 + progress * (18 + metrics.doubleBounce * 25), Math.PI * 0.05, Math.PI * 1.3);
  ctx.stroke();
  ctx.restore();
}

function drawDoubleBounce(target, sensor, progress, metrics, values) {
  const { width: w, height: h } = stage;
  const ground = { x: target.x + w * 0.035, y: terrainY(target.x + w * 0.035, w, h, values) };
  const vertical = {
    x: values.cover === "urban" ? target.x + w * 0.09 : target.x + w * 0.025,
    y: ground.y - h * (values.cover === "urban" ? 0.18 : 0.12),
  };
  const p = clamp(progress, 0, 1);
  const alpha = (0.14 + metrics.doubleBounce * 0.9) * (1 - p * 0.12);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(colors.double, alpha);
  ctx.lineWidth = 2.5 + metrics.doubleBounce * 4;
  ctx.setLineDash([15, 10]);
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  if (p < 0.34) {
    const q = p / 0.34;
    ctx.lineTo(mix(target.x, ground.x, q), mix(target.y, ground.y, q));
  } else if (p < 0.68) {
    ctx.lineTo(ground.x, ground.y);
    const q = (p - 0.34) / 0.34;
    ctx.lineTo(mix(ground.x, vertical.x, q), mix(ground.y, vertical.y, q));
  } else {
    ctx.lineTo(ground.x, ground.y);
    ctx.lineTo(vertical.x, vertical.y);
    const q = (p - 0.68) / 0.32;
    ctx.lineTo(mix(vertical.x, sensor.x, q), mix(vertical.y, sensor.y, q));
  }
  ctx.stroke();
  ctx.restore();
}

function drawSensorArrival(sensor, progress, metrics) {
  const p = clamp(progress, 0, 1);
  ctx.save();
  ctx.strokeStyle = rgba(colors.back, (1 - p) * metrics.total);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sensor.x, sensor.y, 10 + p * 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHud() {
  const { width: w } = stage;
  if (w < 600) return;
  const metrics = metricsFor();
  const band = bands[state.band];
  const x = w - 286;
  const y = 18;
  ctx.save();
  ctx.fillStyle = "rgba(251, 252, 253, 0.9)";
  ctx.strokeStyle = "rgba(23, 34, 43, 0.14)";
  ctx.lineWidth = 1;
  roundRect(x, y, 268, 126, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colors.text;
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.fillText(`${covers[state.cover].name} · ${state.pol} · banda ${state.band}`, x + 14, y + 24);
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillText(`λ ≈ ${band.wavelengthCm} cm`, x + 14, y + 49);
  ctx.fillText(`σ° ${metrics.sigma.toFixed(0)} dB`, x + 14, y + 74);
  ctx.fillText(`depol ${Math.round(metrics.depolarization * 100)}%`, x + 14, y + 99);
  drawMiniBar(x + 144, y + 41, 96, metrics.penetration, colors.pulse);
  drawMiniBar(x + 144, y + 67, 96, metrics.total, colors.back);
  drawMiniBar(x + 144, y + 92, 96, metrics.depolarization, colors.volume);
  ctx.restore();
}

function drawMiniBar(x, y, width, value, color) {
  ctx.fillStyle = "rgba(23, 34, 43, 0.13)";
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
    seed: pseudo(now * 0.001 + state.volume + state.moisture),
    values: {
      cover: state.cover,
      pol: state.pol,
      band: state.band,
      volume: state.volume,
      moisture: state.moisture,
      structure: state.structure,
      incidence: state.incidence,
    },
  });
  state.lastAutoPulse = now;
}

function updateDemo(now) {
  if (!state.demo) return;
  const segmentMs = 5200;
  const t = (now - state.demoStart) % (demoSteps.length * segmentMs);
  const index = Math.floor(t / segmentMs);
  const local = t - index * segmentMs;
  const current = demoSteps[index];
  const next = demoSteps[(index + 1) % demoSteps.length];
  const transition = smoothstep(segmentMs - 800, segmentMs, local);
  state.cover = transition < 0.5 ? current.cover : next.cover;
  state.pol = transition < 0.5 ? current.pol : next.pol;
  state.band = transition < 0.5 ? current.band : next.band;
  state.volume = mix(current.volume, next.volume, transition);
  state.moisture = mix(current.moisture, next.moisture, transition);
  state.structure = mix(current.structure, next.structure, transition);
  syncUI();
}

function draw(now) {
  resizeCanvas();
  updateDemo(now);
  const { width: w, height: h } = stage;
  ctx.clearRect(0, 0, w, h);
  drawBackground(now);
  drawBeam();
  drawSatellite(now);
  drawGround();
  drawCoverage(now);
  drawMechanismPreview(now);

  if (!state.paused && now - state.lastAutoPulse > 3000) {
    emitPulse(now);
  }

  state.pulses = state.pulses.filter((pulse) => now - pulse.createdAt < 3550);
  state.pulses.forEach((pulse) => drawPulse(pulse, now));
  drawHud();
  requestAnimationFrame(draw);
}

function handleSliderInput() {
  setState(
    {
      volume: Number(ui.volume.value),
      moisture: Number(ui.moisture.value),
      structure: Number(ui.structure.value),
      incidence: Number(ui.incidence.value),
    },
    { stopDemo: true }
  );
}

ui.coverButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setState({ cover: button.dataset.cover }, { stopDemo: true });
    emitPulse();
  });
});

ui.polButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setState({ pol: button.dataset.pol }, { stopDemo: true });
    emitPulse();
  });
});

ui.bandButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setState({ band: button.dataset.band }, { stopDemo: true });
    emitPulse();
  });
});

[ui.volume, ui.moisture, ui.structure, ui.incidence].forEach((input) => {
  input.addEventListener("input", handleSliderInput);
});

ui.pulseButton.addEventListener("click", () => {
  emitPulse();
});

ui.demoButton.addEventListener("click", () => {
  state.demo = !state.demo;
  state.demoStart = performance.now();
  state.paused = false;
  ui.pauseButton.textContent = "Pausar";
  ui.pauseButton.setAttribute("aria-pressed", "false");
  ui.demoButton.textContent = state.demo ? "Detener demo" : "Demo";
  ui.demoButton.setAttribute("aria-pressed", String(state.demo));
  emitPulse();
});

ui.pauseButton.addEventListener("click", () => {
  state.paused = !state.paused;
  ui.pauseButton.textContent = state.paused ? "Reanudar" : "Pausar";
  ui.pauseButton.setAttribute("aria-pressed", String(state.paused));
});

window.addEventListener("resize", resizeCanvas);

applyQueryParams();
emitPulse();
requestAnimationFrame(draw);
