/**
 * Double Slit Demo — Full visual experience
 * Particles fly from source through slits to detection screen.
 */

import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { createParticleBuffer } from './simulation.js?v=18';
import { wavelengthToRGB, fringeVisibility, getComplementarity } from './physics.js?v=18';
import { INTERPRETATIONS_ADV, INTERPRETATION_IDS_ADV } from './interpretations-advanced.js';
import { INTERP_KEYBOARD_ORDER, INTERP_KEY_DIGITS, INTERP_UI_GROUPS } from './interpretation-order.js';
import { MEASUREMENT_CONFIGS, narrativeForGamma } from './measurement-configs.js';
import {
  collapseSuppressionFactor,
  decoherenceVisibility,
  effectiveWavelength,
} from './physics-interpretations.js?v=18';

const COMP_PAD = 12;
const COMP_SCALE = 76;
const PANEL_W_STORAGE = 'doubleSlitDemoPanelWidth';
const SHEET_SNAP_STORAGE = 'doubleSlitDemoSheetSnap';
/** Base vertical FOV (deg); widened slightly when canvas is narrow so the scene doesn’t feel “squished”. */
const BASE_CAMERA_FOV = 45;
const CAMERA_FOV_NUDGE_MAX = 6;

/** Map interpretation UI accent (#RRGGBB) to Three.js hex for overlays. */
function hexFromInterpBrand(def) {
  const c = def?.color;
  if (typeof c !== 'string' || !c.startsWith('#')) return null;
  const h = c.slice(1);
  if (h.length === 6 && /^[0-9a-fA-F]+$/.test(h)) return parseInt(h, 16);
  return null;
}

/**
 * Safari / WebKit Canvas2D degrades badly with thousands of createRadialGradient calls per frame.
 * Chrome handles it; Safari becomes janky once many hits accumulate (visibleCount > ~1000).
 */
let safariDetectionFastPath = false;

function initSafariDetectionFastPathFlag() {
  if (typeof navigator === 'undefined') return;
  const ua = navigator.userAgent;
  if (/Chrome|Chromium|Edg|OPR|CriOS|FxiOS/.test(ua)) {
    safariDetectionFastPath = false;
    return;
  }
  safariDetectionFastPath = /Safari/i.test(ua);
}

/** Lighter-weight hit splats: solid arcs + optional additive blend (dark theme). */
function drawDetectionScreenWebKitFast(ctx, w, h, theme, _positionBlend, collapseFlashActive, thinStripHits) {
  ctx.fillStyle = theme.screenBg;
  ctx.fillRect(0, 0, w, h);
  const { birthTimes, interferencePositions, wavelengths } = particleBuffer;
  const isDark = isDarkMode;
  ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over';
  const r0 = thinStripHits ? 3 : 5;
  const r1 = thinStripHits ? 1.6 : 2.5;

  for (let i = 0; i < particleBuffer.count; i++) {
    if (singleParticleMode && i > 0) continue;
    if (birthTimes[i] > currentTime) continue;
    const age = currentTime - birthTimes[i];
    if (age < FLIGHT_TIME) continue;

    const ageSinceHit = age - FLIGHT_TIME;
    const isNewHit = collapseFlashActive && ageSinceHit < 0.2;

    const iz = interferencePositions[i * 3 + 2];
    const iy = interferencePositions[i * 3 + 1];
    const z = iz;
    const y = iy;

    const u = (z + SCREEN_WIDTH / 2) / SCREEN_WIDTH;
    const v = (y + SCREEN_HEIGHT / 2) / SCREEN_HEIGHT;
    let px = Math.max(0, Math.min(w - 1, u * w));
    let py = Math.max(0, Math.min(h - 1, (1 - v) * h));
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const [r, g, b] = wavelengthToRGB(wavelengths[i]);
    const br = theme.hitBrightness;
    const R = Math.min(255, r * 255 * br);
    const G = Math.min(255, g * 255 * br);
    const B = Math.min(255, b * 255 * br);

    if (isNewHit) {
      const flashDecay = 1 - ageSinceHit / 0.2;
      let flashExtra = (thinStripHits ? 6 : 10) * (1 - flashDecay);
      if (!Number.isFinite(flashExtra)) flashExtra = 0;
      ctx.fillStyle = isDark
        ? `rgba(255,255,255,${0.42 * flashDecay})`
        : `rgba(255,255,255,${0.5 * flashDecay})`;
      ctx.beginPath();
      ctx.arc(px, py, r0 + flashExtra, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = `rgba(${R},${G},${B},${isDark ? 0.38 : 0.42})`;
    ctx.beginPath();
    ctx.arc(px, py, r0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${R},${G},${B},${isDark ? 0.55 : 0.62})`;
    ctx.beginPath();
    ctx.arc(px, py, r1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function syncPlayButton() {
  const label = isPlaying ? 'Pause' : 'Play';
  const glyph = isPlaying ? '❚❚' : '▶';
  const playBtn = document.getElementById('play');
  if (playBtn) {
    playBtn.textContent = glyph;
    playBtn.classList.toggle('play-btn--paused', !isPlaying);
    playBtn.classList.toggle('play-btn--playing', isPlaying);
    playBtn.setAttribute('aria-label', label);
  }
}

function syncInterpretationUI() {
  renderInterpretationPanelBody();
  updateObserveAndAdvancedControls();
  syncPlayButton();
  updateInterpTriggerButton();
  syncInterpNavRows();
}

let massRecomputeTimer = null;

const MAX_PARTICLES = 3000;
const SCREEN_DISTANCE = 2;
const SCREEN_WIDTH = 4;
const SCREEN_HEIGHT = 2.8;
const SOURCE_X = -1.8;
const BARRIER_X = 0;
const FLIGHT_TIME = 0.8;
const SLIT_SEP = 0.22;
const SLIT_WIDTH = 0.055;

let scene, camera, renderer, controls;
let particleMesh, detectionTexture, detectionCanvas;
let particleBuffer, visibleCount = 0;
let currentTime = 0, tMax = 30, effectiveTMax = 30, isPlaying = true, lastTime = performance.now();
/** Slider value / stored γ (synced with observerTransition except during toggle-only animation). */
let measurementStrength = 0;
let isObserving = false;
let observerTarget = 0;
let observerTransition = 0;
let exploreSliderDragging = false;
let isUpdatingFromCircle = false;
let playbackSpeed = 1;
const PLAYBACK_SPEEDS = [0.5, 1, 2];
let transportActivity = false;
let transportHideTimer = 0;
/** @type {Array<{ x: number; y: number }>} */
let complementarityTrail = [];
let lastTrailGamma = -1;
let lastToggleAnimRebuild = 0;
let gridHelper, sourceMesh, sourceGlow, barrierLeft, barrierCenter, barrierRight, screenFrame;
let waveOverlay, envParticles, qbismOverlay;
let isDarkMode = false;
let activeInterpretation = 'copenhagen';
let singleParticleMode = false;
let particleMassAmu = 0.00055;
let envCoupling = 0;
let perspective = 'external';
let gammaRecomputeTimer = null;

/** Per-interpretation persisted knobs (slit λ / geometry stay global on the form). */
const DEFAULT_ELECTRON_AMU = 0.00055;
/** @type {Record<string, { particleMassAmu: number; envCoupling: number; perspective: string; measurementStrength: number; isObserving: boolean }>} */
let interpParamSnapshots = {};

function createDefaultInterpParams() {
  return {
    particleMassAmu: DEFAULT_ELECTRON_AMU,
    envCoupling: 0,
    perspective: 'external',
    measurementStrength: 0,
    isObserving: false,
  };
}

function cloneInterpParams(p) {
  let ms = p.measurementStrength;
  if (typeof ms !== 'number' || Number.isNaN(ms)) {
    ms = p.isObserving ? 1 : 0;
  }
  ms = Math.max(0, Math.min(1, ms));
  const obs =
    typeof p.isObserving === 'boolean' ? p.isObserving : ms > 0.5;
  return {
    particleMassAmu: p.particleMassAmu,
    envCoupling: p.envCoupling,
    perspective: p.perspective,
    measurementStrength: ms,
    isObserving: obs,
  };
}

function captureParamsFromGlobals() {
  return cloneInterpParams({
    particleMassAmu,
    envCoupling,
    perspective,
    measurementStrength,
    isObserving,
  });
}

function initInterpParamSnapshots() {
  interpParamSnapshots = {};
  for (const id of INTERPRETATION_IDS_ADV) {
    interpParamSnapshots[id] = createDefaultInterpParams();
  }
}

function syncAdvancedControlsFromGlobals() {
  const massEl = document.getElementById('adv-mass');
  if (massEl) {
    massEl.value = String(Math.round(amuToMassSlider(particleMassAmu) * 1000));
  }
  const envEl = document.getElementById('adv-env');
  if (envEl) {
    envEl.value = String(Math.round(envCoupling * 100));
  }
  document.querySelectorAll('input[name="perspective"]').forEach((radio) => {
    radio.checked = radio.value === perspective;
  });
}

function snapPhysicsStateImmediate() {
  clearTimeout(gammaRecomputeTimer);
  gammaRecomputeTimer = null;
}

/**
 * Save current globals into the tab we are leaving, load the tab we are entering, rebuild particles.
 */
function switchInterpretation(nextId) {
  if (nextId === activeInterpretation) return;
  interpParamSnapshots[activeInterpretation] = captureParamsFromGlobals();
  activeInterpretation = nextId;
  const snap = interpParamSnapshots[activeInterpretation] || createDefaultInterpParams();
  const hydrated = cloneInterpParams(snap);
  particleMassAmu = snap.particleMassAmu;
  envCoupling = snap.envCoupling;
  perspective = snap.perspective;
  measurementStrength = hydrated.measurementStrength;
  isObserving = hydrated.measurementStrength >= 0.5;
  observerTarget = hydrated.measurementStrength;
  observerTransition = hydrated.measurementStrength;
  const vms = document.getElementById('vis-model-select');
  if (vms) {
    const pref = MEASUREMENT_CONFIGS[activeInterpretation]?.preferredVisModel ?? 'quadratic';
    vms.value = pref;
  }
  syncAdvancedControlsFromGlobals();
  updateObserveAndAdvancedControls();
  snapPhysicsStateImmediate();
  rebuildParticleBuffer(Date.now());
  currentTime = 0;
  const timelineEl = document.getElementById('timeline');
  if (timelineEl) timelineEl.value = 0;
  renderInterpretationPanelBody();
}

const THEMES = {
  dark: {
    bg: 0x050510,
    fog: 0x050510,
    grid: [0x1a1a2e, 0x0d0d18],
    barrier: { color: 0x1a1a2a, emissive: 0x080810 },
    frame: 0x2a2a3a,
    source: { color: 0x00ffaa, emissive: 0x00ff66, glow: 0x00ff88, glowOpacity: 0.15 },
    screenBg: '#050510',
    hitBrightness: 1,
  },
  light: {
    bg: 0xe8edf5,
    fog: 0xe8edf5,
    grid: [0xb8c4d4, 0xd4dce8],
    barrier: { color: 0x4a5568, emissive: 0x2d3748 },
    frame: 0x718096,
    source: { color: 0x0d9488, emissive: 0x0f766e, glow: 0x14b8a6, glowOpacity: 0.25 },
    screenBg: '#f0f4fa',
    hitBrightness: 1.1,
  },
};

function getInterpDef() {
  return INTERPRETATIONS_ADV[activeInterpretation];
}

function getActiveVisibilityModel() {
  return MEASUREMENT_CONFIGS[activeInterpretation]?.preferredVisModel ?? 'quadratic';
}

/** Simulation visibility model (SPEC-MEASUREMENT). Binary mode: user dropdown; else interpretation default. */
function getSimulationVisibilityModel() {
  const mode = getInterpDef()?.observerToggleMode ?? 'binary';
  if (mode === 'binary') {
    const sel = document.getElementById('vis-model-select');
    const v = sel?.value;
    if (v === 'linear' || v === 'quadratic' || v === 'exponential') return v;
  }
  return getActiveVisibilityModel();
}

/** Effective measurement strength γ for the active interpretation (SPEC-MEASUREMENT). */
function computeMeasurementGamma() {
  const def = getInterpDef();
  const mode = def?.observerToggleMode ?? 'binary';
  if (mode === 'slider') return Math.max(0, Math.min(1, envCoupling));
  if (mode === 'disabled') return Math.max(0, Math.min(1, 1 - collapseSuppressionFactor(particleMassAmu)));
  if (mode === 'perspective') {
    if (perspective === 'external') return 0;
    if (perspective === 'detector') return 1;
    return 0.45;
  }
  return Math.max(0, Math.min(1, observerTransition));
}

function scheduleGammaRecompute(immediate = false) {
  clearTimeout(gammaRecomputeTimer);
  const run = () => {
    rebuildParticleBuffer(Date.now());
    gammaRecomputeTimer = null;
  };
  if (immediate) {
    run();
    return;
  }
  gammaRecomputeTimer = setTimeout(run, 200);
}

/** Fringe visibility V(γ) for overlay / HUD copy. */
function currentFringeVisibility() {
  const g = computeMeasurementGamma();
  return fringeVisibility(g, getSimulationVisibilityModel());
}

function massSliderToAmu(t) {
  const u = Math.max(0, Math.min(1, t));
  if (u < 0.003) return 0;
  const u2 = (u - 0.003) / (1 - 0.003);
  const logMin = Math.log10(0.00055);
  const logMax = Math.log10(1e8);
  return 10 ** (logMin + u2 * (logMax - logMin));
}

function amuToMassSlider(m) {
  if (m <= 0) return 0;
  const logMin = Math.log10(0.00055);
  const logMax = Math.log10(1e8);
  return 0.003 + (1 - 0.003) * ((Math.log10(m) - logMin) / (logMax - logMin));
}

function scheduleMassRecompute() {
  clearTimeout(massRecomputeTimer);
  massRecomputeTimer = setTimeout(() => {
    rebuildParticleBuffer(Date.now());
    massRecomputeTimer = null;
  }, 280);
}

function rebuildParticleBuffer(seed) {
  const slitWidth = parseFloat(document.getElementById('slit-width')?.value || 100) * 1e-9;
  const slitSeparation = parseFloat(document.getElementById('slit-sep')?.value || 500) * 1e-9;
  const userLambda = parseFloat(document.getElementById('wavelength')?.value || 550) * 1e-9;
  const lambdaEff = effectiveWavelength(particleMassAmu, userLambda);
  const gamma = computeMeasurementGamma();
  const visibilityModel = getSimulationVisibilityModel();
  particleBuffer = createParticleBuffer(
    {
      slitWidth,
      slitSeparation,
      wavelength: lambdaEff,
      emissionRate: 60,
      screenDistance: SCREEN_DISTANCE,
      sourceX: SOURCE_X,
      barrierX: BARRIER_X,
      measurementGamma: gamma,
      visibilityModel,
    },
    MAX_PARTICLES,
    seed
  );
  tMax = particleBuffer.tMax;
  effectiveTMax = singleParticleMode ? FLIGHT_TIME + 0.4 : tMax;
}

function buildComplementarityPathD(model) {
  const parts = [];
  for (let i = 0; i <= 64; i++) {
    const g = i / 64;
    const V = fringeVisibility(g, model);
    const x = COMP_PAD + g * COMP_SCALE;
    const y = COMP_PAD + (1 - V) * COMP_SCALE;
    parts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  return parts.join(' ');
}

function ensureCompGrid(svg) {
  const g = svg.querySelector('.comp-grid');
  if (!g || g.childElementCount) return;
  for (let t = 0.25; t < 1; t += 0.25) {
    const x = COMP_PAD + t * COMP_SCALE;
    const y = COMP_PAD + (1 - t) * COMP_SCALE;
    const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l1.setAttribute('x1', String(x));
    l1.setAttribute('y1', String(COMP_PAD));
    l1.setAttribute('x2', String(x));
    l1.setAttribute('y2', String(COMP_PAD + COMP_SCALE));
    g.appendChild(l1);
    const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l2.setAttribute('x1', String(COMP_PAD));
    l2.setAttribute('y1', String(y));
    l2.setAttribute('x2', String(COMP_PAD + COMP_SCALE));
    l2.setAttribute('y2', String(y));
    g.appendChild(l2);
  }
}

function nearestGammaOnCurve(normD, normV, model) {
  let bestG = 0;
  let best = Infinity;
  for (let i = 0; i <= 100; i++) {
    const g = i / 100;
    const V = fringeVisibility(g, model);
    const dD = g - normD;
    const dV = V - normV;
    const dist = dD * dD + dV * dV;
    if (dist < best) {
      best = dist;
      bestG = g;
    }
  }
  return bestG;
}

/** Complementarity diagram path + point + trail (right panel). */
function updateComplementarityDiagram() {
  const svg = document.getElementById('complementarity-svg');
  const pathEl = document.getElementById('complementarity-curve-path');
  const pt = document.getElementById('complementarity-point-explore');
  const readout = document.getElementById('complementarity-dv-readout');
  const sumEl = document.getElementById('complementarity-sum-explore');
  if (!svg || !pathEl || !pt) return;
  ensureCompGrid(svg);
  const model = getSimulationVisibilityModel();
  pathEl.setAttribute('d', buildComplementarityPathD(model));
  const g = computeMeasurementGamma();
  const { distinguishability: D, visibility: V, complementarityCheck } = getComplementarity(g, model);
  const cx = COMP_PAD + D * COMP_SCALE;
  const cy = COMP_PAD + (1 - V) * COMP_SCALE;
  pt.setAttribute('cx', String(cx));
  pt.setAttribute('cy', String(cy));
  if (readout) {
    readout.textContent = `D = ${D.toFixed(2)}  V = ${V.toFixed(2)}  D² + V² = ${complementarityCheck.toFixed(2)}`;
  }
  if (sumEl) sumEl.textContent = `D² + V² = ${complementarityCheck.toFixed(2)}`;

  let trailG = svg.querySelector('.comp-trail');
  if (!trailG) {
    trailG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    trailG.setAttribute('class', 'comp-trail');
    svg.insertBefore(trailG, pt);
  }
  while (trailG.firstChild) trailG.removeChild(trailG.firstChild);
  for (let i = 0; i < complementarityTrail.length; i++) {
    const p = complementarityTrail[i];
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const fade = ((i + 1) / complementarityTrail.length) * 0.35;
    c.setAttribute('cx', String(p.x));
    c.setAttribute('cy', String(p.y));
    c.setAttribute('r', '3');
    c.setAttribute('fill', 'currentColor');
    c.setAttribute('opacity', String(fade));
    trailG.appendChild(c);
  }
}

function updateExploreSection() {
  const def = getInterpDef();
  const mode = def?.observerToggleMode ?? 'binary';
  const measureBin = document.getElementById('panel-measure-binary');
  if (measureBin) measureBin.hidden = mode !== 'binary';
  document.querySelector('.vis-model-row')?.classList.toggle('vis-model-row--hidden', mode !== 'binary');

  const gUi = computeMeasurementGamma();
  const slider = document.getElementById('measurement-slider-explore');
  const labelEl = document.getElementById('measurement-label-explore');
  const readout = document.getElementById('measurement-value-readout-explore');
  const narrative = document.getElementById('measurement-narrative-explore');
  const gammaInput = document.getElementById('measurement-gamma-input');
  const config = MEASUREMENT_CONFIGS[activeInterpretation];

  if (labelEl && config && mode === 'binary') {
    labelEl.textContent = `${config.sliderLabel} (γ)`;
  }

  if (slider && mode === 'binary' && !exploreSliderDragging && !isUpdatingFromCircle) {
    slider.value = String(Math.round(observerTransition * 100));
    slider.setAttribute('aria-valuetext', `${Math.round(observerTransition * 100)}%`);
  }

  if (readout && mode === 'binary') {
    readout.textContent = `${Math.round(gUi * 100)}%`;
  }
  if (gammaInput && mode === 'binary' && document.activeElement !== gammaInput && !isUpdatingFromCircle) {
    gammaInput.value = String(Math.round(gUi * 100));
  }

  if (narrative && config && mode === 'binary') {
    narrative.textContent = narrativeForGamma(gUi, config);
  }

  if (mode === 'binary') updateComplementarityDiagram();

  const obsBtn = document.getElementById('panel-observe-toggle');
  if (obsBtn) {
    obsBtn.hidden = mode !== 'binary';
    if (mode === 'binary') {
      const on = observerTransition >= 0.5;
      obsBtn.classList.toggle('active', on);
      obsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const lab = obsBtn.querySelector('.panel-observe-label');
      if (lab) lab.textContent = on ? 'Observer: on' : 'Observer: off';
    }
  }

  const fullInd = document.getElementById('explore-full-measure-indicator');
  if (fullInd && mode === 'binary') {
    const full = gUi >= 0.999;
    fullInd.hidden = !full;
    fullInd.setAttribute('aria-label', full ? 'Full measurement strength, gamma 100 percent' : '');
  } else if (fullInd) {
    fullInd.hidden = true;
  }
}

function renderInterpretationPanelBody() {
  const host = document.getElementById('panel-interpretation-body');
  if (!host) return;
  const interp = INTERPRETATIONS_ADV[activeInterpretation];
  if (!interp) return;
  const happening = getWhatsHappening(activeInterpretation);
  host.innerHTML = `
    <h4 style="border-left: 4px solid ${interp.color}; padding-left: 10px;">${interp.name}</h4>
    <p class="meta"><span class="status-badge">${interp.statusLabel}</span> · ${interp.proponents} (${interp.year})</p>
    ${interp.observerHint ? `<p class="meta" style="opacity:0.95;"><strong>Controls:</strong> ${interp.observerHint}</p>` : ''}
    ${happening ? `<p class="happening"><strong>What's happening:</strong> ${happening}</p>` : ''}
    <p class="story">${interp.story}</p>
    <div class="quote">${interp.quote}<br><small>— ${interp.quoteAuthor}</small></div>
    ${interp.support != null ? `<p class="support"><strong>${interp.support}%</strong> of physicists (Nature 2025 survey framing)</p>` : ''}
    <details>
      <summary>What it explains well</summary>
      <ul class="strengths">${interp.strengths.map((s) => `<li>${s}</li>`).join('')}</ul>
    </details>
    <details>
      <summary>What it doesn't explain as easily</summary>
      <ul class="weaknesses">${interp.weaknesses.map((w) => `<li>${w}</li>`).join('')}</ul>
    </details>
    <p class="meta">Level: ${interp.level}</p>
  `;
}

function updateObserveAndAdvancedControls() {
  const def = getInterpDef();
  const envRow = document.getElementById('adv-env-row');
  const perspRow = document.getElementById('adv-perspective-row');
  const massRow = document.getElementById('adv-mass-row');
  const massReadout = document.getElementById('adv-mass-readout');

  if (envRow) envRow.hidden = def?.observerToggleMode !== 'slider';
  if (perspRow) perspRow.hidden = def?.observerToggleMode !== 'perspective';
  if (massRow) {
    const showMass = def?.physicsVariant === 'massDependent' || def?.id === 'decoherence';
    massRow.hidden = !showMass;
  }

  if (massReadout) {
    const m = particleMassAmu;
    let label = `${m.toExponential(2)} amu`;
    if (m <= 0) label = 'Photon (0 amu — use wavelength)';
    else if (m < 0.001) label = `Electron-scale (${m.toExponential(2)} amu)`;
    massReadout.textContent = label;
  }

  updateExploreSection();
}

/** Size the WebGL buffer to the `#canvas` element or full window. */
function getCanvasHostSize() {
  const el = document.getElementById('canvas');
  if (!el) {
    return {
      w: Math.max(1, window.innerWidth),
      h: Math.max(1, window.innerHeight),
    };
  }
  const w = Math.max(1, Math.round(el.clientWidth));
  const h = Math.max(1, Math.round(el.clientHeight));
  return { w, h };
}

function init() {
  initSafariDetectionFastPathFlag();

  const savedTheme = localStorage.getItem('doubleSlitTheme');
  isDarkMode = savedTheme === 'dark';
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');

  initInterpParamSnapshots();

  scene = new THREE.Scene();

  const { w: cw, h: ch } = getCanvasHostSize();
  camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV, cw / ch, 0.1, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(cw, ch);
  renderer.setPixelRatio(Math.min(safariDetectionFastPath ? 1.5 : 2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('canvas').appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  applyInitialCameraAndControls();

  addLights();
  addScene();
  addParticleSource();
  addBarrier();
  addDetectionScreen();
  addParticles();
  addInterpretationOverlays();

  rebuildParticleBuffer(12345);

  applySceneTheme();
  setupUI();
  setupInterpretationNav();
  syncInterpretationUI();
  setupHeaderAmbient();
  setupHelpAndNudges();
  window.addEventListener('resize', onResize);
  const canvasHost = document.getElementById('canvas');
  if (typeof ResizeObserver !== 'undefined' && canvasHost) {
    new ResizeObserver(() => onResize()).observe(canvasHost);
  }
  queueMicrotask(() => onResize());
  animate();
}

function mobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 768;
}

/** Samsung Internet / Galaxy-style UA — mobile demo only; used for default camera framing. */
function samsungMobileDemoViewport() {
  if (typeof navigator === 'undefined' || !mobileViewport()) return false;
  const ua = navigator.userAgent || '';
  if (/\bSamsungBrowser\b/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Samsung/i.test(ua)) return true;
  if (/Android/i.test(ua) && /SM-[A-Z0-9]+/i.test(ua)) return true;
  return false;
}

function galaxyZFoldDemoViewport() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /SM-F9[0-9]{2}/i.test(ua) || /Galaxy Z Fold/i.test(ua);
}

function galaxyZFoldWideInnerViewport() {
  if (!galaxyZFoldDemoViewport()) return false;
  const w = window.innerWidth;
  return w > 768 && w <= 980;
}

function tabletViewport() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return w > 768 && w <= 1024;
}

/** Call once after OrbitControls exists; tablet + desktop share the same initial angle; mobile = behind emitter + rotate/zoom overrides. */
function applyInitialCameraAndControls() {
  const zFoldWide = galaxyZFoldWideInnerViewport();
  const mobile = mobileViewport() || zFoldWide;
  const tablet = !mobile && tabletViewport();

  if (mobile) {
    const behind = 1.28;
    const up = 0.48;
    const side = 0.4;
    const tgt = new THREE.Vector3(1.12, 0.055, -0.1);
    const camBase = new THREE.Vector3(SOURCE_X - behind, up, side);
    const off = new THREE.Vector3().subVectors(camBase, tgt);
    const rad = (90 * 0.25) * (Math.PI / 180);
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const rx = off.x * c + off.z * s;
    const rz = -off.x * s + off.z * c;
    off.set(rx, off.y, rz).multiplyScalar(1.5 * 1.7 * 1.2);
    if (samsungMobileDemoViewport() || galaxyZFoldDemoViewport()) {
      off.multiplyScalar(1 / 1.4);
      const tilt = galaxyZFoldDemoViewport() ? (14 * Math.PI) / 180 : (20 * Math.PI) / 180;
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), tilt);
      const dir = off.clone().normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
      if (right.lengthSq() > 1e-10) {
        right.normalize();
        off.applyAxisAngle(right, tilt);
      }
    }
    if (galaxyZFoldDemoViewport()) {
      off.multiplyScalar(1.4);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), (11 * Math.PI) / 180);
    }
    /* Narrow phones only (not Z Fold inner >768): closer default + slight pitch — desktop/tablet unchanged */
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      off.multiplyScalar(0.87);
      const dirN = off.clone().normalize();
      const rightN = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dirN);
      if (rightN.lengthSq() > 1e-10) {
        rightN.normalize();
        off.applyAxisAngle(rightN, (8 * Math.PI) / 180);
      }
    }
    camera.position.copy(tgt).add(off);
    controls.target.copy(tgt);
    controls.minDistance = 5.4;
    controls.maxDistance = 67;
  } else {
    const tgt = new THREE.Vector3(0.5, 0, 0);
    const yawLeft = -Math.PI / 6;
    const offX = -1;
    const offZ = 4.5;
    const c = Math.cos(yawLeft);
    const s = Math.sin(yawLeft);
    const rx = offX * c + offZ * s;
    const rz = -offX * s + offZ * c;
    const tabletZoom = tablet ? 1.4 : 1;
    camera.position.set(tgt.x + rx * tabletZoom, 0.6 * tabletZoom, tgt.z + rz * tabletZoom);
    controls.target.copy(tgt);
    if (tablet) {
      controls.minDistance = 4.5;
      controls.maxDistance = 24 * tabletZoom;
    } else {
      controls.minDistance = 3;
      controls.maxDistance = 16;
    }
  }
  controls.update();
}

function applySceneTheme() {
  const t = THEMES[isDarkMode ? 'dark' : 'light'];
  scene.background = new THREE.Color(t.bg);
  scene.fog = new THREE.Fog(t.fog, 20, 95);
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(4, 20, t.grid[0], t.grid[1]);
    gridHelper.position.y = -0.6;
    scene.add(gridHelper);
  }
  [barrierLeft, barrierCenter, barrierRight].forEach((m) => {
    if (m?.material) {
      m.material.color.setHex(t.barrier.color);
      m.material.emissive.setHex(t.barrier.emissive);
    }
  });
  if (screenFrame?.material) screenFrame.material.color.setHex(t.frame);
  if (sourceMesh?.material) {
    sourceMesh.material.color.setHex(t.source.color);
    sourceMesh.material.emissive.setHex(t.source.emissive);
  }
  if (sourceGlow?.material) {
    sourceGlow.material.color.setHex(t.source.glow);
    sourceGlow.material.opacity = t.source.glowOpacity;
  }
}

function addScene() {
  const t = THEMES[isDarkMode ? 'dark' : 'light'];
  gridHelper = new THREE.GridHelper(4, 20, t.grid[0], t.grid[1]);
  gridHelper.position.y = -0.6;
  scene.add(gridHelper);
}

function addParticleSource() {
  const t = THEMES[isDarkMode ? 'dark' : 'light'];
  const geo = new THREE.SphereGeometry(0.08, 24, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: t.source.color,
    emissive: t.source.emissive,
    emissiveIntensity: isDarkMode ? 0.5 : 0.3,
  });
  sourceMesh = new THREE.Mesh(geo, mat);
  sourceMesh.position.set(SOURCE_X, 0, 0);
  scene.add(sourceMesh);

  const glowGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: t.source.glow,
    transparent: true,
    opacity: t.source.glowOpacity,
    depthWrite: false,
  });
  sourceGlow = new THREE.Mesh(glowGeo, glowMat);
  sourceGlow.position.set(SOURCE_X, 0, 0);
  scene.add(sourceGlow);
}

function addLights() {
  scene.add(new THREE.AmbientLight(0x4040a0, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x6699ff, 0.3);
  fill.position.set(-2, 1, -1);
  scene.add(fill);
}

function addBarrier() {
  const t = THEMES[isDarkMode ? 'dark' : 'light'];
  const mat = new THREE.MeshStandardMaterial({
    color: t.barrier.color,
    metalness: 0.4,
    roughness: 0.6,
    emissive: t.barrier.emissive,
  });
  const barrierHeight = 0.7;
  const barrierHalfWidth = 0.4;
  const leftPillarWidth = barrierHalfWidth - (SLIT_SEP / 2 + SLIT_WIDTH / 2);
  const centerPillarWidth = SLIT_SEP - SLIT_WIDTH;
  const rightPillarWidth = leftPillarWidth;

  barrierLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, barrierHeight, leftPillarWidth), mat.clone());
  barrierLeft.position.set(0, 0, -barrierHalfWidth + leftPillarWidth / 2);

  barrierCenter = new THREE.Mesh(new THREE.BoxGeometry(0.06, barrierHeight, centerPillarWidth), mat.clone());
  barrierCenter.position.set(0, 0, 0);

  barrierRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, barrierHeight, rightPillarWidth), mat.clone());
  barrierRight.position.set(0, 0, barrierHalfWidth - rightPillarWidth / 2);

  scene.add(barrierLeft, barrierCenter, barrierRight);
}

function addDetectionScreen() {
  detectionCanvas = document.createElement('canvas');
  const detW = safariDetectionFastPath ? 768 : 1024;
  detectionCanvas.width = detW;
  detectionCanvas.height = Math.round(detW * (SCREEN_HEIGHT / SCREEN_WIDTH));
  const t = THEMES[isDarkMode ? 'dark' : 'light'];
  const ctx = detectionCanvas.getContext('2d');
  ctx.fillStyle = t.screenBg;
  ctx.fillRect(0, 0, detectionCanvas.width, detectionCanvas.height);

  detectionTexture = new THREE.CanvasTexture(detectionCanvas);
  detectionTexture.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT);
  const mat = new THREE.MeshBasicMaterial({
    map: detectionTexture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
  });
  const screen = new THREE.Mesh(geo, mat);
  screen.position.set(SCREEN_DISTANCE, 0, 0);
  screen.rotation.y = -Math.PI / 2;
  scene.add(screen);

  const frameGeo = new THREE.BoxGeometry(0.03, SCREEN_HEIGHT + 0.06, SCREEN_WIDTH + 0.06);
  const frameMat = new THREE.MeshStandardMaterial({ color: t.frame });
  screenFrame = new THREE.Mesh(frameGeo, frameMat);
  screenFrame.position.set(SCREEN_DISTANCE + 0.02, 0, 0);
  scene.add(screenFrame);
}

function addParticles() {
  const geo = new THREE.SphereGeometry(0.012, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
  });
  particleMesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
  particleMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
  particleMesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  particleMesh.userData.update = () => {
    if (!particleBuffer) return;
    const { birthTimes, interferencePositions, slitZ, slitY, wavelengths, screenDistance } = particleBuffer;
    let count = 0;

    for (let i = 0; i < particleBuffer.count; i++) {
      if (singleParticleMode && i > 0) continue;
      if (birthTimes[i] > currentTime) continue;

      const iy = interferencePositions[i * 3 + 1];
      const iz = interferencePositions[i * 3 + 2];
      const screenZ = iz;
      const screenY = iy;

      const age = currentTime - birthTimes[i];
      const tFlight = Math.min(1, age / FLIGHT_TIME);
      let x, y, z;

      const [r, g, b] = wavelengthToRGB(wavelengths[i]);
      col.setRGB(r, g, b);

      if (tFlight < 0.5) {
        const f = tFlight * 2;
        x = THREE.MathUtils.lerp(SOURCE_X, BARRIER_X, f);
        y = THREE.MathUtils.lerp(0, slitY[i], f);
        z = THREE.MathUtils.lerp(0, slitZ[i], f);
      } else if (tFlight < 1) {
        const u = (tFlight - 0.5) * 2;
        x = THREE.MathUtils.lerp(BARRIER_X, screenDistance, u);
        y = THREE.MathUtils.lerp(slitY[i], screenY, u);
        z = THREE.MathUtils.lerp(slitZ[i], screenZ, u);
      } else {
        x = screenDistance;
        y = screenY;
        z = screenZ;
      }

      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      particleMesh.setMatrixAt(count, dummy.matrix);
      particleMesh.instanceColor.setXYZ(count, col.r, col.g, col.b);
      count++;
    }

    particleMesh.count = count;
    particleMesh.instanceMatrix.needsUpdate = true;
    particleMesh.instanceColor.needsUpdate = true;
    visibleCount = count;
  };

  scene.add(particleMesh);
}

function addInterpretationOverlays() {
  const waveGeo = new THREE.PlaneGeometry(4, 2);
  const waveMat = new THREE.MeshBasicMaterial({
    color: 0x4fc3f7,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  waveOverlay = new THREE.Mesh(waveGeo, waveMat);
  waveOverlay.rotation.y = -Math.PI / 2;
  waveOverlay.position.set(1, 0, 0);
  waveOverlay.visible = false;
  waveOverlay.renderOrder = 10;
  scene.add(waveOverlay);

  const envGeo = new THREE.SphereGeometry(0.015, 4, 4);
  const envMat = new THREE.MeshBasicMaterial({ color: 0xef5350 });
  envParticles = new THREE.InstancedMesh(envGeo, envMat, 80);
  envParticles.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 80; i++) {
    dummy.position.set(
      0.1 + Math.random() * 0.1,
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.3
    );
    dummy.scale.setScalar(0.5 + Math.random());
    dummy.updateMatrix();
    envParticles.setMatrixAt(i, dummy.matrix);
  }
  envParticles.instanceMatrix.needsUpdate = true;
  envParticles.visible = false;
  scene.add(envParticles);

  const qbismGeo = new THREE.PlaneGeometry(5, 3.5);
  const qbismMat = new THREE.MeshBasicMaterial({
    color: 0xba68c8,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  qbismOverlay = new THREE.Mesh(qbismGeo, qbismMat);
  qbismOverlay.rotation.y = -Math.PI / 2;
  qbismOverlay.position.set(0.95, 0, 0);
  qbismOverlay.visible = false;
  qbismOverlay.renderOrder = 10;
  scene.add(qbismOverlay);
}

function updateInterpretationOverlays() {
  const interp = INTERPRETATIONS_ADV[activeInterpretation];
  const V = currentFringeVisibility();
  const gamma = computeMeasurementGamma();
  const showWave =
    V > 0.35 &&
    (activeInterpretation === 'copenhagen' ||
      activeInterpretation === 'manyWorlds' ||
      activeInterpretation === 'bohmian');
  const decoCfg = MEASUREMENT_CONFIGS.decoherence;
  const showEnv =
    activeInterpretation === 'decoherence' && decoCfg?.showEnvironmentParticles && gamma > 0.02;
  const showQbism = activeInterpretation === 'qbism' || activeInterpretation === 'hoffman';

  if (waveOverlay) {
    waveOverlay.visible = showWave;
    if (showWave) {
      const waveHex =
        interp?.waveColor ?? hexFromInterpBrand(interp) ?? 0x4fc3f7;
      waveOverlay.material.color.setHex(waveHex);
    }
    waveOverlay.material.opacity = 0.08 + 0.06 * Math.sin(currentTime * 2) ** 2;
  }
  if (envParticles) {
    envParticles.visible = showEnv;
    if (showEnv) {
      const n = Math.max(1, Math.min(80, Math.ceil(gamma * 80)));
      envParticles.count = n;
    }
  }

  if (qbismOverlay) {
    qbismOverlay.visible = showQbism;
    if (showQbism) {
      const cloudHex =
        interp?.cloudColor ?? hexFromInterpBrand(interp) ?? 0xba68c8;
      qbismOverlay.material.color.setHex(cloudHex);
      const classical = V < 0.55;
      const pulse =
        0.14 + 0.08 * Math.sin(currentTime * 1.5) ** 2;
      const classicalPulse =
        0.1 + 0.06 * Math.sin(currentTime * 1.2) ** 2;
      qbismOverlay.material.opacity = classical ? classicalPulse : pulse;
    }
  }
}

function getWhatsHappening(interpId) {
  const g = computeMeasurementGamma();
  const V = currentFringeVisibility();
  const classical = V < 0.45;
  switch (interpId) {
    case 'copenhagen':
      return classical ? 'Strong which-path information — fringe visibility reduced' : 'High fringe visibility — wave-like statistics on the screen';
    case 'manyWorlds':
      return classical ? 'Entanglement with detector — branch-relative definite statistics (illustrative)' : 'High coherence within branch — interference visible';
    case 'bohmian':
      return classical ? 'Detector disturbs guiding configuration — pattern washes toward envelope' : 'Pilot-wave steering — interference in arrival positions';
    case 'decoherence':
      return `Environment coupling ${(envCoupling * 100).toFixed(0)}% — fringe visibility ${(decoherenceVisibility(envCoupling) * 100).toFixed(0)}%`;
    case 'qbism':
      return classical ? 'Strong information update — expectations resemble classical mixture' : 'ψ encodes expectations — interference from uncertainty';
    case 'rqm':
      if (perspective === 'external') return 'Relative to you outside: lab can remain in superposition';
      if (perspective === 'detector') return 'Relative to detector: definite click after correlation';
      return 'Hybrid perspective (illustrative)';
    case 'objectiveCollapse':
    case 'orchOR':
      return `Mass ${particleMassAmu.toExponential(2)} amu — effective measurement strength γ ≈ ${(100 * g).toFixed(0)}%`;
    case 'vonNeumannWigner':
      return classical ? '(Historical framing) strong record — low fringe visibility' : 'Weak record — interference persists';
    case 'hoffman':
      return classical ? 'Interface fully resolves path metaphor — low fringe visibility' : 'Interface open — interference-style statistics';
    default:
      return '';
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {Record<string, string>} */
const INTERP_ID_TO_DIGIT = {};
INTERP_KEYBOARD_ORDER.forEach((id, i) => {
  INTERP_ID_TO_DIGIT[id] = INTERP_KEY_DIGITS[i];
});

function updateInterpTriggerButton() {
  const def = INTERPRETATIONS_ADV[activeInterpretation];
  const label = document.getElementById('interp-trigger-label');
  const dot = document.getElementById('interp-trigger-dot');
  if (label) label.textContent = def?.name ?? '';
  if (dot && def?.color) dot.style.background = def.color;
}

function syncInterpNavRows() {
  document.querySelectorAll('.interp-row[data-interp]').forEach((row) => {
    row.classList.toggle('is-active', row.dataset.interp === activeInterpretation);
    const chk = row.querySelector('.interp-row__check');
    if (chk) chk.textContent = row.dataset.interp === activeInterpretation ? '✓' : '';
  });
}

function interpRowHintText(def) {
  if (!def?.story) return '';
  const t = def.story.trim();
  const cut = t.indexOf('.') >= 0 ? t.slice(0, t.indexOf('.') + 1) : t.slice(0, 110);
  return cut.length < t.length && !cut.endsWith('.') ? `${cut}…` : cut;
}

function buildInterpListRow(id, opts) {
  const def = INTERPRETATIONS_ADV[id];
  if (!def) return '';
  const stat =
    typeof def.support === 'number' ? `${def.support}%` : def.statusLabel.replace(/\([^)]*\)/g, '').trim().slice(0, 22);
  const hint = escapeHtml(interpRowHintText(def));
  const name = escapeHtml(def.name);
  const trail = opts.sheet
    ? `<span class="interp-row__check" aria-hidden="true">${id === activeInterpretation ? '✓' : ''}</span>`
    : `<span class="interp-row__key">${INTERP_ID_TO_DIGIT[id] ?? ''}</span>`;
  return `<button type="button" class="interp-row${opts.sheet ? ' interp-row--sheet' : ''}" data-interp="${id}" role="option" aria-selected="${id === activeInterpretation}">
    <span class="interp-row-line">
      <span class="interp-row__dot" style="background:${escapeHtml(def.color)}"></span>
      <span class="interp-row__name">${name}</span>
      <span class="interp-row__stat">${escapeHtml(stat)}</span>
      ${trail}
    </span>
    <p class="interp-row__hint">${hint}</p>
  </button>`;
}

function fillInterpPopoverBody() {
  const host = document.getElementById('interp-popover-list');
  if (!host) return;
  let html = '';
  for (const grp of INTERP_UI_GROUPS) {
    html += `<div class="interp-group-label">${escapeHtml(grp.label)}</div>`;
    for (const id of grp.ids) {
      html += buildInterpListRow(id, { sheet: false });
    }
  }
  host.innerHTML = html;
}

function fillInterpSheetBody() {
  const host = document.getElementById('interp-sheet-body');
  if (!host) return;
  let html = '';
  for (const grp of INTERP_UI_GROUPS) {
    html += `<div class="interp-group-label">${escapeHtml(grp.label)}</div>`;
    for (const id of grp.ids) {
      html += buildInterpListRow(id, { sheet: true });
    }
  }
  host.innerHTML = html;
}

function setupInterpretationNav() {
  fillInterpPopoverBody();
  fillInterpSheetBody();

  const trigger = document.getElementById('interp-trigger');
  const wrap = document.getElementById('interp-popover-wrap');
  const backdrop = document.getElementById('interp-popover-backdrop');
  const closeBtn = document.getElementById('interp-popover-close');
  const list = document.getElementById('interp-popover-list');
  const sheet = document.getElementById('interp-sheet');
  const sheetBackdrop = document.getElementById('interp-sheet-backdrop');
  const sheetClose = document.getElementById('interp-sheet-close');

  function closePopover() {
    wrap?.setAttribute('hidden', '');
    trigger?.setAttribute('aria-expanded', 'false');
  }

  function openPopover() {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      sheet?.removeAttribute('hidden');
      return;
    }
    fillInterpPopoverBody();
    wrap?.removeAttribute('hidden');
    trigger?.setAttribute('aria-expanded', 'true');
    syncInterpNavRows();
  }

  function closeSheet() {
    sheet?.setAttribute('hidden', '');
  }

  trigger?.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      fillInterpSheetBody();
      if (sheet?.hasAttribute('hidden')) sheet.removeAttribute('hidden');
      else sheet?.setAttribute('hidden', '');
      syncInterpNavRows();
      return;
    }
    if (wrap?.hasAttribute('hidden')) openPopover();
    else closePopover();
  });

  closeBtn?.addEventListener('click', closePopover);
  backdrop?.addEventListener('click', closePopover);
  sheetBackdrop?.addEventListener('click', closeSheet);
  sheetClose?.addEventListener('click', closeSheet);

  list?.addEventListener('click', (e) => {
    const btn = e.target.closest('.interp-row[data-interp]');
    if (!btn) return;
    switchInterpretation(btn.dataset.interp);
    syncInterpretationUI();
    closePopover();
  });

  document.getElementById('interp-sheet-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.interp-row[data-interp]');
    if (!btn) return;
    switchInterpretation(btn.dataset.interp);
    syncInterpretationUI();
    closeSheet();
  });

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const idx = INTERP_KEY_DIGITS.indexOf(e.key);
    if (idx >= 0 && idx < INTERP_KEYBOARD_ORDER.length) {
      e.preventDefault();
      switchInterpretation(INTERP_KEYBOARD_ORDER[idx]);
      syncInterpretationUI();
    }
  });

  updateInterpTriggerButton();
  syncInterpNavRows();
}

function drawDetectionScreen() {
  if (!particleBuffer || !detectionCanvas) return;
  const ctx = detectionCanvas.getContext('2d');
  const w = detectionCanvas.width;
  const h = detectionCanvas.height;
  const theme = THEMES[isDarkMode ? 'dark' : 'light'];
  const collapseFlashActive =
    activeInterpretation === 'copenhagen' && computeMeasurementGamma() < 0.25;
  const thinStripHits = computeMeasurementGamma() >= 0.92;

  if (safariDetectionFastPath) {
    drawDetectionScreenWebKitFast(ctx, w, h, theme, 0, collapseFlashActive, thinStripHits);
    detectionTexture.needsUpdate = true;
    return;
  }

  ctx.fillStyle = theme.screenBg;
  ctx.fillRect(0, 0, w, h);

  const { birthTimes, interferencePositions, wavelengths } = particleBuffer;

  for (let i = 0; i < particleBuffer.count; i++) {
    if (singleParticleMode && i > 0) continue;
    if (birthTimes[i] > currentTime) continue;
    const age = currentTime - birthTimes[i];
    if (age < FLIGHT_TIME) continue;

    const ageSinceHit = age - FLIGHT_TIME;
    const isNewHit = collapseFlashActive && ageSinceHit < 0.2;

    const iz = interferencePositions[i * 3 + 2];
    const iy = interferencePositions[i * 3 + 1];
    const z = iz;
    const y = iy;

    const u = (z + SCREEN_WIDTH / 2) / SCREEN_WIDTH;
    const v = (y + SCREEN_HEIGHT / 2) / SCREEN_HEIGHT;
    let px = Math.max(0, Math.min(w - 1, u * w));
    let py = Math.max(0, Math.min(h - 1, (1 - v) * h));
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const [r, g, b] = wavelengthToRGB(wavelengths[i]);
    const br = theme.hitBrightness;
    const R = Math.min(255, r * 255 * br);
    const G = Math.min(255, g * 255 * br);
    const B = Math.min(255, b * 255 * br);
    const alpha = isDarkMode ? 0.9 : 0.95;
    const alphaOuter = isDarkMode ? 0.4 : 0.35;

    if (isNewHit) {
      const flashDecay = 1 - ageSinceHit / 0.2;
      let flashRadius = thinStripHits ? 5 + 9 * (1 - flashDecay) : 8 + 16 * (1 - flashDecay);
      if (!Number.isFinite(flashRadius) || flashRadius <= 0) flashRadius = thinStripHits ? 5 : 8;
      const flashAlpha = 0.6 * flashDecay;
      const flashGrad = ctx.createRadialGradient(px, py, 0, px, py, flashRadius);
      flashGrad.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
      flashGrad.addColorStop(0.3, `rgba(${R},${G},${B},${flashAlpha * 0.5})`);
      flashGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flashGrad;
      ctx.beginPath();
      ctx.arc(px, py, flashRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    let glowR = thinStripHits ? 7 : 12;
    if (!Number.isFinite(glowR) || glowR <= 0) glowR = 8;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
    grad.addColorStop(0, `rgba(${R},${G},${B},${alpha})`);
    grad.addColorStop(0.4, `rgba(${R},${G},${B},${alphaOuter})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, glowR, 0, Math.PI * 2);
    ctx.fill();

    const coreR = thinStripHits ? 2 : 3;
    ctx.fillStyle = `rgba(${R},${G},${B},${isDarkMode ? 0.8 : 0.9})`;
    ctx.beginPath();
    ctx.arc(px, py, coreR, 0, Math.PI * 2);
    ctx.fill();
  }
  detectionTexture.needsUpdate = true;
}

function setupUI() {
  const timelineEl = document.getElementById('timeline');
  const playBtn = document.getElementById('play');
  const countEl = document.getElementById('particle-count');
  timelineEl.min = 0;
  timelineEl.max = 100;
  timelineEl.value = 0;

  timelineEl.addEventListener('input', () => {
    currentTime = (timelineEl.value / 100) * effectiveTMax;
    isPlaying = false;
    syncPlayButton();
  });

  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    syncPlayButton();
  });

  document.getElementById('transport-speed')?.addEventListener('click', () => {
    const i = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    playbackSpeed = PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length];
    const b = document.getElementById('transport-speed');
    if (b) b.textContent = `${playbackSpeed === 1 ? '1' : playbackSpeed}×`;
  });

  document.getElementById('transport-reset')?.addEventListener('click', () => {
    currentTime = 0;
    timelineEl.value = 0;
    isPlaying = false;
    syncPlayButton();
  });

  const exEl = document.getElementById('measurement-slider-explore');
  exEl?.addEventListener('pointerdown', () => {
    exploreSliderDragging = true;
  });
  exEl?.addEventListener('pointerup', () => {
    exploreSliderDragging = false;
    measurementStrength = observerTransition;
    updateObserveAndAdvancedControls();
  });
  exEl?.addEventListener('pointercancel', () => {
    exploreSliderDragging = false;
    measurementStrength = observerTransition;
    updateObserveAndAdvancedControls();
  });
  exEl?.addEventListener('input', () => {
    const mode = getInterpDef()?.observerToggleMode ?? 'binary';
    if (mode !== 'binary') return;
    const g = Math.max(0, Math.min(1, Number(exEl.value) / 100));
    measurementStrength = g;
    observerTransition = g;
    observerTarget = g;
    isObserving = g >= 0.5;
    localStorage.setItem('demoGammaHintSeen', '1');
    exEl.classList.remove('gamma-hint-wiggle');
    const hint = document.getElementById('explore-deeper-hint');
    if (hint) hint.hidden = false;
    updateExploreSection();
    scheduleGammaRecompute();
  });
  exEl?.addEventListener('dblclick', () => {
    const mode = getInterpDef()?.observerToggleMode ?? 'binary';
    if (mode !== 'binary') return;
    const v = Number(exEl.value) / 100;
    const snaps = [0, 0.5, 1];
    let nearest = snaps[0];
    let best = Math.abs(v - snaps[0]);
    for (const s of snaps) {
      const d = Math.abs(v - s);
      if (d < best) {
        best = d;
        nearest = s;
      }
    }
    measurementStrength = nearest;
    observerTransition = nearest;
    observerTarget = nearest;
    isObserving = nearest >= 0.5;
    updateExploreSection();
    clearTimeout(gammaRecomputeTimer);
    gammaRecomputeTimer = null;
    rebuildParticleBuffer(Date.now());
  });

  document.getElementById('recompute')?.addEventListener('click', () => {
    clearTimeout(gammaRecomputeTimer);
    gammaRecomputeTimer = null;
    rebuildParticleBuffer(Date.now());
    currentTime = 0;
    timelineEl.value = 0;
  });

  syncPlayButton();

  setInterval(() => {
    countEl.textContent = `${visibleCount} / ${particleBuffer.count} particles`;
  }, 200);

  const massEl = document.getElementById('adv-mass');
  if (massEl) {
    massEl.value = String(Math.round(amuToMassSlider(particleMassAmu) * 1000));
    massEl.addEventListener('input', () => {
      particleMassAmu = massSliderToAmu(Number(massEl.value) / 1000);
      updateObserveAndAdvancedControls();
      scheduleMassRecompute();
    });
  }

  const envEl = document.getElementById('adv-env');
  if (envEl) {
    envEl.addEventListener('input', () => {
      envCoupling = Number(envEl.value) / 100;
      updateObserveAndAdvancedControls();
      scheduleGammaRecompute();
    });
  }

  document.querySelectorAll('input[name="perspective"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) perspective = radio.value;
      updateObserveAndAdvancedControls();
      scheduleGammaRecompute();
    });
  });

  document.getElementById('vis-model-select')?.addEventListener('change', () => {
    rebuildParticleBuffer(Date.now());
    updateExploreSection();
  });

  document.getElementById('panel-observe-toggle')?.addEventListener('click', () => {
    const mode = getInterpDef()?.observerToggleMode ?? 'binary';
    if (mode !== 'binary') return;
    const goHigh = observerTarget < 0.5;
    observerTarget = goHigh ? 1 : 0;
    observerTransition = observerTarget;
    measurementStrength = observerTarget;
    isObserving = goHigh;
    rebuildParticleBuffer(Date.now());
    updateExploreSection();
  });

  document.getElementById('measurement-gamma-input')?.addEventListener('change', () => {
    const mode = getInterpDef()?.observerToggleMode ?? 'binary';
    if (mode !== 'binary') return;
    const inp = document.getElementById('measurement-gamma-input');
    let v = Math.round(Number(inp?.value));
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(0, Math.min(100, v));
    const g = v / 100;
    measurementStrength = g;
    observerTransition = g;
    observerTarget = g;
    isObserving = g >= 0.5;
    updateExploreSection();
    scheduleGammaRecompute();
  });

  document.getElementById('reset-params-defaults')?.addEventListener('click', () => {
    document.getElementById('slit-width').value = '100';
    document.getElementById('slit-sep').value = '500';
    document.getElementById('wavelength').value = '550';
    particleMassAmu = DEFAULT_ELECTRON_AMU;
    envCoupling = 0;
    syncAdvancedControlsFromGlobals();
    updateWavelengthSwatch();
    updateObserveAndAdvancedControls();
    rebuildParticleBuffer(Date.now());
    currentTime = 0;
    timelineEl.value = 0;
  });

  const waveEl = document.getElementById('wavelength');
  waveEl?.addEventListener('input', updateWavelengthSwatch);
  waveEl?.addEventListener('change', updateWavelengthSwatch);
  updateWavelengthSwatch();

  setupTransportAutoHide();
  setupRightPanelUi();
  setupComplementarityInteraction();
  scheduleGammaHint();
  renderInterpretationPanelBody();

  document.getElementById('canvas')?.addEventListener('keydown', (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.code === 'Space') {
      e.preventDefault();
      isPlaying = !isPlaying;
      syncPlayButton();
      markTransportActive();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      currentTime = 0;
      const tl = document.getElementById('timeline');
      if (tl) tl.value = 0;
      syncPlayButton();
    }
  });
}

function updateWavelengthSwatch() {
  const wEl = document.getElementById('wavelength');
  const sw = document.getElementById('wavelength-swatch');
  if (!wEl || !sw) return;
  const lamNm = parseFloat(wEl.value) || 550;
  const [r, g, b] = wavelengthToRGB(lamNm);
  sw.style.backgroundColor = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

function markTransportActive() {
  transportActivity = true;
  const t = document.getElementById('transport-overlay');
  t?.classList.remove('transport-overlay--hidden');
  window.clearTimeout(transportHideTimer);
  transportHideTimer = window.setTimeout(() => {
    transportActivity = false;
    document.getElementById('transport-overlay')?.classList.add('transport-overlay--hidden');
  }, 3000);
}

function setupTransportAutoHide() {
  const stack = document.getElementById('canvas-stack');
  const canvas = document.getElementById('canvas');
  const transport = document.getElementById('transport-overlay');
  if (!stack || !transport) return;
  const wake = () => markTransportActive();
  stack.addEventListener('pointermove', wake);
  stack.addEventListener('pointerdown', wake);
  canvas?.addEventListener('focus', wake);
  transport.addEventListener('pointerenter', wake);
  markTransportActive();
}

function setupRightPanelUi() {
  const panel = document.getElementById('demo-right-panel');
  const inner = document.getElementById('demo-right-panel-inner');
  const handle = document.getElementById('panel-resize-edge');
  const chev = document.getElementById('panel-collapse-chevron');
  const rail = document.getElementById('panel-icon-rail');
  const layout = document.querySelector('.demo-layout-advanced');
  const savedW = localStorage.getItem(PANEL_W_STORAGE);
  if (panel && savedW) {
    const n = parseInt(savedW, 10);
    if (n >= 240 && n <= 400) panel.style.setProperty('--panel-user-width', `${n}px`);
  }

  let resizing = false;
  handle?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizing = true;
    handle.setPointerCapture(e.pointerId);
  });
  handle?.addEventListener('pointermove', (e) => {
    if (!resizing || !panel) return;
    const w = Math.max(240, Math.min(400, window.innerWidth - e.clientX));
    panel.style.setProperty('--panel-user-width', `${w}px`);
  });
  handle?.addEventListener('pointerup', () => {
    resizing = false;
    if (!panel) return;
    const w = panel.getBoundingClientRect().width;
    localStorage.setItem(PANEL_W_STORAGE, String(Math.round(w)));
  });

  function setCollapsed(on) {
    panel?.classList.toggle('panel-collapsed', on);
    chev?.setAttribute('aria-expanded', on ? 'false' : 'true');
    window.dispatchEvent(new Event('resize'));
  }

  chev?.addEventListener('click', () => {
    setCollapsed(!panel?.classList.contains('panel-collapsed'));
  });

  rail?.querySelectorAll('.panel-icon-rail-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setCollapsed(false);
      const id = btn.getAttribute('data-panel-section');
      const map = { measure: 'panel-section-measure', comp: 'panel-section-comp', interp: 'panel-section-interp', params: 'panel-section-params' };
      const det = document.getElementById(map[id]);
      det?.setAttribute('open', '');
      det?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== ']' || e.ctrlKey || e.metaKey || e.altKey) return;
    const help = document.getElementById('help-slide-panel');
    if (help && !help.hasAttribute('hidden')) return;
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    e.preventDefault();
    setCollapsed(!panel?.classList.contains('panel-collapsed'));
  });

  function applySheetSnap() {
    if (!panel || !layout) return;
    if (window.matchMedia('(min-width: 1024px)').matches) {
      panel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
      return;
    }
    const snap = sessionStorage.getItem(SHEET_SNAP_STORAGE) || 'half';
    panel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
    panel.classList.add(snap === 'peek' ? 'sheet-peek' : snap === 'full' ? 'sheet-full' : 'sheet-half');
  }

  const sheetHandle = document.getElementById('bottom-sheet-handle');
  const sheetSnaps = ['sheet-peek', 'sheet-half', 'sheet-full'];
  sheetHandle?.addEventListener('click', () => {
    if (!panel || window.matchMedia('(min-width: 1024px)').matches) return;
    let i = 1;
    if (panel.classList.contains('sheet-peek')) i = 0;
    else if (panel.classList.contains('sheet-full')) i = 2;
    const next = (i + 1) % 3;
    panel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
    panel.classList.add(sheetSnaps[next]);
    sessionStorage.setItem(SHEET_SNAP_STORAGE, ['peek', 'half', 'full'][next]);
  });

  window.addEventListener('resize', applySheetSnap);
  applySheetSnap();

  document.getElementById('focus-view-enter')?.addEventListener('click', () => {
    layout?.classList.toggle('demo-layout--focus');
    const focused = layout?.classList.contains('demo-layout--focus');
    if (focused) {
      setCollapsed(true);
      if (window.matchMedia('(max-width: 1023px)').matches) {
        panel?.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
        panel?.classList.add('sheet-peek');
      }
    } else {
      setCollapsed(false);
    }
    window.dispatchEvent(new Event('resize'));
  });
}

function scheduleGammaHint() {
  if (typeof localStorage === 'undefined' || localStorage.getItem('demoGammaHintSeen')) return;
  const slider = document.getElementById('measurement-slider-explore');
  window.setTimeout(() => {
    if (localStorage.getItem('demoGammaHintSeen')) return;
    slider?.classList.add('gamma-hint-wiggle');
    slider?.addEventListener(
      'animationend',
      () => {
        if (!localStorage.getItem('demoGammaHintSeen')) localStorage.setItem('demoGammaHintSeen', '1');
      },
      { once: true },
    );
  }, 3000);
}

function setupComplementarityInteraction() {
  const svg = document.getElementById('complementarity-svg');
  if (!svg) return;

  function svgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function applyPointer(clientX, clientY) {
    const mode = getInterpDef()?.observerToggleMode ?? 'binary';
    if (mode !== 'binary') return;
    const { x, y } = svgPoint(clientX, clientY);
    const normD = (x - COMP_PAD) / COMP_SCALE;
    const normV = (COMP_PAD + COMP_SCALE - y) / COMP_SCALE;
    const model = getSimulationVisibilityModel();
    const g = nearestGammaOnCurve(normD, normV, model);
    isUpdatingFromCircle = true;
    measurementStrength = g;
    observerTransition = g;
    observerTarget = g;
    isObserving = g >= 0.5;
    if (lastTrailGamma < 0 || Math.abs(g - lastTrailGamma) > 0.04) {
      complementarityTrail.push({
        x: COMP_PAD + g * COMP_SCALE,
        y: COMP_PAD + (1 - fringeVisibility(g, model)) * COMP_SCALE,
      });
      if (complementarityTrail.length > 10) complementarityTrail.shift();
      lastTrailGamma = g;
    }
    exploreSliderDragging = false;
    updateExploreSection();
    scheduleGammaRecompute();
    requestAnimationFrame(() => {
      isUpdatingFromCircle = false;
    });
  }

  let dragging = false;
  svg.addEventListener('pointerdown', (e) => {
    if ((getInterpDef()?.observerToggleMode ?? 'binary') !== 'binary') return;
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    applyPointer(e.clientX, e.clientY);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyPointer(e.clientX, e.clientY);
  });
  svg.addEventListener('pointerup', () => {
    dragging = false;
  });
  svg.addEventListener('pointercancel', () => {
    dragging = false;
  });
}

function syncThemeToggleGlyph() {
  const icon = document.querySelector('#theme-toggle .theme-icon');
  if (icon) icon.textContent = isDarkMode ? '☀' : '🌙';
}

function setupHeaderAmbient() {
  const header = document.getElementById('header-overlay');
  const layout = document.querySelector('.demo-layout-advanced');
  const canvasStack = document.getElementById('canvas-stack');
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  syncThemeToggleGlyph();
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('doubleSlitTheme', isDarkMode ? 'dark' : 'light');
    syncThemeToggleGlyph();
    applySceneTheme();
  });

  if (layout && header) {
    const syncFocusHeader = () => {
      const on = layout.classList.contains('demo-layout--focus');
      header.classList.toggle('focus-hidden', on);
      if (!on) header.classList.remove('header-overlay--peek');
    };
    syncFocusHeader();
    new MutationObserver(syncFocusHeader).observe(layout, { attributes: true, attributeFilter: ['class'] });
  }

  let orbitInteracting = false;
  let fadeTimer = null;
  let peekHideTimer = 0;

  function clearFadeTimer() {
    if (fadeTimer != null) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  function armFade() {
    if (reduceMotion) return;
    clearFadeTimer();
    fadeTimer = window.setTimeout(() => {
      if (orbitInteracting) header?.classList.add('faded');
    }, 1000);
  }

  function wakeHeader() {
    clearFadeTimer();
    header?.classList.remove('faded');
  }

  controls?.addEventListener('start', () => {
    orbitInteracting = true;
    armFade();
  });
  controls?.addEventListener('end', () => {
    orbitInteracting = false;
    wakeHeader();
  });

  canvasStack?.addEventListener('pointerleave', wakeHeader);

  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.clientY <= 60) wakeHeader();
      if (!layout?.classList.contains('demo-layout--focus') || !header?.classList.contains('focus-hidden')) return;
      if (e.clientY <= 56) {
        window.clearTimeout(peekHideTimer);
        header.classList.add('header-overlay--peek');
      } else {
        window.clearTimeout(peekHideTimer);
        peekHideTimer = window.setTimeout(() => header.classList.remove('header-overlay--peek'), 420);
      }
    },
    { passive: true },
  );

  header?.addEventListener('pointerenter', wakeHeader);
}

function setupHelpAndNudges() {
  const helpPanel = document.getElementById('help-slide-panel');
  const openBtn = document.getElementById('help-panel-open');
  const closeBtn = document.getElementById('help-slide-close');
  const backdrop = document.getElementById('help-slide-panel-backdrop');
  const nudge = document.getElementById('first-visit-nudge');
  const nudgeClose = document.getElementById('first-visit-nudge-close');
  const layout = document.querySelector('.demo-layout-advanced');

  function openHelp() {
    if (!helpPanel) return;
    helpPanel.removeAttribute('hidden');
    helpPanel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('help-slide-panel-open');
    openBtn?.setAttribute('aria-expanded', 'true');
    localStorage.setItem('ds-helpOpened', '1');
    openBtn?.classList.remove('help-has-hint');
  }

  function closeHelp() {
    if (!helpPanel) return;
    helpPanel.setAttribute('hidden', '');
    helpPanel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('help-slide-panel-open');
    openBtn?.setAttribute('aria-expanded', 'false');
  }

  if (localStorage.getItem('ds-helpOpened')) {
    openBtn?.classList.remove('help-has-hint');
  }

  openBtn?.addEventListener('click', () => {
    if (helpPanel?.hasAttribute('hidden')) openHelp();
    else closeHelp();
  });
  closeBtn?.addEventListener('click', closeHelp);
  backdrop?.addEventListener('click', closeHelp);

  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('how') === '1' || q.get('help') === '1') {
      queueMicrotask(() => openHelp());
    }
  } catch {
    /* ignore */
  }

  function dismissNudge() {
    if (!nudge || nudge.hasAttribute('hidden')) return;
    nudge.setAttribute('hidden', '');
    localStorage.setItem('ds-hasVisited', 'true');
  }

  nudgeClose?.addEventListener('click', dismissNudge);

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!nudge || nudge.hasAttribute('hidden')) return;
      if (e.target.closest('#first-visit-nudge')) return;
      dismissNudge();
    },
    true,
  );

  const markVisitedOnControl = () => dismissNudge();
  document.getElementById('demo-right-panel')?.addEventListener('pointerdown', markVisitedOnControl);
  document.getElementById('transport-overlay')?.addEventListener('pointerdown', markVisitedOnControl);
  document.getElementById('canvas-stack')?.addEventListener('pointerdown', markVisitedOnControl);
  document.getElementById('interp-trigger')?.addEventListener('click', markVisitedOnControl);

  if (!localStorage.getItem('ds-hasVisited')) {
    window.setTimeout(() => {
      if (localStorage.getItem('ds-hasVisited') || !nudge) return;
      const mobile = window.matchMedia('(max-width: 1023px)').matches;
      nudge.style.left = '';
      nudge.style.right = '';
      nudge.style.top = '';
      nudge.style.bottom = '';
      if (mobile) {
        const handle = document.getElementById('bottom-sheet-handle');
        const r = handle?.getBoundingClientRect();
        if (r) {
          const w = 280;
          const cx = r.left + r.width / 2;
          nudge.style.left = `${Math.max(12, Math.min(cx - w / 2, window.innerWidth - w - 12))}px`;
          nudge.style.bottom = `${window.innerHeight - r.top + 12}px`;
        } else {
          nudge.style.left = '12px';
          nudge.style.bottom = '100px';
        }
      } else {
        const el = document.getElementById('measurement-slider-explore');
        const r = el?.getBoundingClientRect();
        const panelEl = document.getElementById('demo-right-panel');
        const pr = panelEl?.getBoundingClientRect();
        if (r && pr) {
          const w = 280;
          const cx = (r.left + r.right) / 2;
          nudge.style.left = `${Math.max(12, Math.min(cx - w / 2, pr.right - w - 8))}px`;
        } else {
          nudge.style.right = '16px';
        }
        nudge.style.top = '72px';
      }
      nudge.removeAttribute('hidden');
      if (!mobile) {
        const mEl = document.getElementById('measurement-slider-explore');
        const mr = mEl?.getBoundingClientRect();
        if (mr) {
          requestAnimationFrame(() => {
            const h = nudge.getBoundingClientRect().height || 72;
            nudge.style.top = `${Math.max(48, mr.top - h - 10)}px`;
          });
        }
      }
    }, 3000);
  }

  const tip = document.getElementById('ctx-tooltip');
  /** @type {HTMLElement | null} */
  let tipPinnedTarget = null;

  function hideCtxTip() {
    if (tip) tip.hidden = true;
  }

  function placeCtxTip(anchor) {
    if (!tip || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth || 200;
    const th = tip.offsetHeight || 40;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 8;
    if (y < 12) y = r.bottom + 8;
    x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function showCtxTip(anchor, text) {
    if (!tip || !text) return;
    tip.textContent = text;
    tip.hidden = false;
    placeCtxTip(anchor);
    requestAnimationFrame(() => placeCtxTip(anchor));
  }

  document.querySelectorAll('.ctx-hint[data-hint]').forEach((btn) => {
    const el = /** @type {HTMLElement} */ (btn);
    const text = el.getAttribute('data-hint') || '';
    el.addEventListener('mouseenter', () => {
      if (tipPinnedTarget) return;
      showCtxTip(el, text);
    });
    el.addEventListener('mouseleave', () => {
      if (tipPinnedTarget === el) return;
      hideCtxTip();
    });
    el.addEventListener('focus', () => showCtxTip(el, text));
    el.addEventListener('blur', () => {
      if (tipPinnedTarget === el) return;
      hideCtxTip();
    });
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (tipPinnedTarget === el && tip && !tip.hidden) {
        tipPinnedTarget = null;
        hideCtxTip();
      } else {
        tipPinnedTarget = el;
        showCtxTip(el, text);
      }
    });
  });

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ctx-hint')) return;
    tipPinnedTarget = null;
    hideCtxTip();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      const help = document.getElementById('help-slide-panel');
      if (help && !help.hasAttribute('hidden')) {
        closeHelp();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const wrap = document.getElementById('interp-popover-wrap');
      const sheet = document.getElementById('interp-sheet');
      if (wrap && !wrap.hasAttribute('hidden')) {
        wrap.setAttribute('hidden', '');
        document.getElementById('interp-trigger')?.setAttribute('aria-expanded', 'false');
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (sheet && !sheet.hasAttribute('hidden')) {
        sheet.setAttribute('hidden', '');
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const header = document.getElementById('header-overlay');
      if (layout?.classList.contains('demo-layout--focus') && header?.classList.contains('focus-hidden')) {
        header.classList.toggle('header-overlay--peek');
        e.preventDefault();
      }
    },
    true,
  );
}

function onResize() {
  const { w, h } = getCanvasHostSize();
  const aspect = w / Math.max(1, h);
  camera.aspect = aspect;
  // Narrower canvas (side panel open): gently widen FOV so framing feels like a small zoom-out, not lateral squish.
  const narrow01 = Math.max(0, Math.min(1, (1.38 - aspect) / 0.6));
  camera.fov = BASE_CAMERA_FOV + narrow01 * CAMERA_FOV_NUDGE_MAX;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (isPlaying) {
    currentTime += dt * playbackSpeed;
    if (currentTime >= effectiveTMax) {
      if (singleParticleMode) {
        currentTime = effectiveTMax;
        isPlaying = false;
        syncPlayButton();
      } else {
        currentTime = currentTime % effectiveTMax;
      }
    }
    const tl = document.getElementById('timeline');
    if (tl) tl.value = (currentTime / effectiveTMax) * 100;
  }

  const defAnim = getInterpDef();
  const modeAnim = defAnim?.observerToggleMode ?? 'binary';
  if (modeAnim === 'binary' && !exploreSliderDragging) {
    observerTransition += (observerTarget - observerTransition) * Math.min(1, dt * 5);
    measurementStrength = observerTransition;
    if (Math.abs(observerTarget - observerTransition) > 0.004) {
      const tNow = performance.now();
      if (tNow - lastToggleAnimRebuild >= 100) {
        lastToggleAnimRebuild = tNow;
        rebuildParticleBuffer(Date.now());
      }
    }
  }
  /* HUD + slider readout must track γ every frame (focus sheet relies on this during drag). */
  if (modeAnim === 'binary') {
    updateExploreSection();
  }

  if (particleMesh?.userData?.update) particleMesh.userData.update();
  updateInterpretationOverlays();
  drawDetectionScreen();

  controls.update();
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
