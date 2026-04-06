/**
 * Double Slit Demo — Full visual experience
 * Particles fly from source through slits to detection screen.
 */

import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { createParticleBuffer } from './simulation.js?v=18';
import { wavelengthToRGB, fringeVisibility, getComplementarity } from './physics.js?v=18';
import { INTERPRETATIONS_ADV, INTERPRETATION_IDS_ADV } from './interpretations-advanced.js';
import { MEASUREMENT_CONFIGS, narrativeForGamma } from './measurement-configs.js';
import {
  collapseSuppressionFactor,
  decoherenceVisibility,
  effectiveWavelength,
} from './physics-interpretations.js?v=18';

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
  const explorePause = document.getElementById('explore-pause');
  if (explorePause) {
    explorePause.textContent = glyph;
    explorePause.classList.toggle('play-btn--paused', !isPlaying);
    explorePause.classList.toggle('play-btn--playing', isPlaying);
    explorePause.setAttribute('aria-label', label);
  }
}

function syncInterpretationUI() {
  document.querySelectorAll('.interp-tab').forEach((b) => b.classList.toggle('active', b.dataset.interp === activeInterpretation));
  if (showInfoPanel) renderInfoPanel(activeInterpretation);
  updateObserveAndAdvancedControls();
  syncPlayButton();
  const interpMobile = document.getElementById('interp-select-mobile');
  if (interpMobile) interpMobile.value = activeInterpretation;
  const infoAccent = INTERPRETATIONS_ADV[activeInterpretation]?.color || '#129079';
  document.getElementById('info-toggle')?.style.setProperty('--interp-accent', infoAccent);
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
let lastToggleAnimRebuild = 0;
let gridHelper, sourceMesh, sourceGlow, barrierLeft, barrierCenter, barrierRight, screenFrame;
let waveOverlay, envParticles, qbismOverlay;
let isDarkMode = false;
let activeInterpretation = 'copenhagen';
let showInfoPanel = false;
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
  syncAdvancedControlsFromGlobals();
  updateObserveAndAdvancedControls();
  snapPhysicsStateImmediate();
  rebuildParticleBuffer(Date.now());
  currentTime = 0;
  const timelineEl = document.getElementById('timeline');
  if (timelineEl) timelineEl.value = 0;
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

/** Simulation visibility: Englert V = √(1−γ²) for binary observer + explore slider (SPEC-MEASUREMENT). */
function getSimulationVisibilityModel() {
  const mode = getInterpDef()?.observerToggleMode ?? 'binary';
  if (mode === 'binary') return 'quadratic';
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

/** Inline complementarity HUD (Englert / quadratic: D² + V² = 1). */
function updateExploreComplementarityHud() {
  const sumEl = document.getElementById('complementarity-sum-explore');
  const pt = document.getElementById('complementarity-point-explore');
  if (!sumEl || !pt) return;
  const g = computeMeasurementGamma();
  const model = getSimulationVisibilityModel();
  const { distinguishability: D, visibility: V, complementarityCheck } = getComplementarity(g, model);
  sumEl.textContent = `D² + V² = ${complementarityCheck.toFixed(2)}`;
  const cx = 14 + D * 60;
  const cy = 74 - V * 60;
  pt.setAttribute('cx', String(cx));
  pt.setAttribute('cy', String(cy));
}

function updateExploreSection() {
  const def = getInterpDef();
  const mode = def?.observerToggleMode ?? 'binary';
  const explore = document.getElementById('explore-deeper');
  if (explore) explore.hidden = mode !== 'binary';

  const gUi = computeMeasurementGamma();
  const slider = document.getElementById('measurement-slider-explore');
  const labelEl = document.getElementById('measurement-label-explore');
  const readout = document.getElementById('measurement-value-readout-explore');
  const narrative = document.getElementById('measurement-narrative-explore');
  const config = MEASUREMENT_CONFIGS[activeInterpretation];

  if (labelEl && config && mode === 'binary') {
    labelEl.textContent = `${config.sliderLabel} (γ)`;
  }

  if (slider && mode === 'binary' && !exploreSliderDragging) {
    slider.value = String(Math.round(observerTransition * 100));
    slider.setAttribute('aria-valuetext', `${Math.round(observerTransition * 100)}%`);
  }

  if (readout && mode === 'binary') {
    readout.textContent = `${Math.round(gUi * 100)}%`;
  }

  if (narrative && config && mode === 'binary') {
    narrative.textContent = narrativeForGamma(gUi, config);
  }

  if (mode === 'binary') updateExploreComplementarityHud();

  const fullInd = document.getElementById('explore-full-measure-indicator');
  if (fullInd && mode === 'binary') {
    const full = gUi >= 0.999;
    fullInd.hidden = !full;
    fullInd.setAttribute('aria-label', full ? 'Full measurement strength, gamma 100 percent' : '');
  } else if (fullInd) {
    fullInd.hidden = true;
  }
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

function init() {
  initSafariDetectionFastPathFlag();

  const savedTheme = localStorage.getItem('doubleSlitTheme');
  isDarkMode = savedTheme === 'dark';
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');

  initInterpParamSnapshots();

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  setupInterpretationUI();
  syncInterpretationUI();
  setupFocusViewMode();
  window.addEventListener('resize', onResize);
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

function renderInfoPanel(interpId) {
  const interp = INTERPRETATIONS_ADV[interpId];
  if (!interp) return;
  const el = document.getElementById('info-content');
  const happening = getWhatsHappening(interpId);
  el.innerHTML = `
    <h3 style="border-left: 4px solid ${interp.color}; padding-left: 12px;">${interp.name}</h3>
    <p class="meta"><span class="status-badge">${interp.statusLabel}</span> · ${interp.proponents} (${interp.year})</p>
    ${interp.observerHint ? `<p class="meta" style="opacity:0.95;"><strong>Controls:</strong> ${interp.observerHint}</p>` : ''}
    ${happening ? `<p class="happening"><strong>What's happening:</strong> ${happening}</p>` : ''}
    <p class="story">${interp.story}</p>
    <div class="section">
      <div class="section-title">Strengths</div>
      <ul class="strengths">${interp.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
    </div>
    <div class="section">
      <div class="section-title">What it struggles with</div>
      <ul class="weaknesses">${interp.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>
    </div>
    ${interp.support ? `<p class="support">${interp.support}% of physicists (Nature 2025)</p>` : ''}
    <div class="quote">${interp.quote}<br><small>— ${interp.quoteAuthor}</small></div>
    <p class="meta">Level: ${interp.level}</p>
  `;
}

function setupInterpretationUI() {
  const pills = document.querySelector('.interp-tabs-pills');
  const mobile = document.getElementById('interp-select-mobile');
  if (pills && !pills.querySelector('.interp-tab')) {
    for (const id of INTERPRETATION_IDS_ADV) {
      const def = INTERPRETATIONS_ADV[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'interp-tab';
      btn.dataset.interp = id;
      btn.textContent = def.name.replace(/\s*\([^)]*\)\s*$/, '').slice(0, 22) + (def.name.length > 22 ? '…' : '');
      btn.title = def.name;
      pills.appendChild(btn);
    }
  }
  if (mobile && mobile.options.length === 0) {
    mobile.innerHTML = INTERPRETATION_IDS_ADV.map((id) => {
      const d = INTERPRETATIONS_ADV[id];
      return `<option value="${id}">${d.name}</option>`;
    }).join('');
  }

  document.querySelectorAll('.interp-tab').forEach((btn) => {
    const color = INTERPRETATIONS_ADV[btn.dataset.interp]?.color;
    btn.style.setProperty('--interp-accent', color || '#129079');
    btn.addEventListener('click', () => {
      switchInterpretation(btn.dataset.interp);
      document.querySelectorAll('.interp-tab').forEach(b => b.classList.toggle('active', b.dataset.interp === activeInterpretation));
      const interpMobile = document.getElementById('interp-select-mobile');
      if (interpMobile) interpMobile.value = activeInterpretation;
      syncInterpretationUI();
      renderInfoPanel(activeInterpretation);
      if (showInfoPanel) document.getElementById('info-panel').classList.add('open');
    });
  });
  document.querySelector('.interp-tab[data-interp="copenhagen"]')?.classList.add('active');
  document.getElementById('interp-select-mobile')?.addEventListener('change', (e) => {
    switchInterpretation(e.target.value);
    document.querySelectorAll('.interp-tab').forEach((b) => b.classList.toggle('active', b.dataset.interp === activeInterpretation));
    syncInterpretationUI();
    renderInfoPanel(activeInterpretation);
    if (showInfoPanel) document.getElementById('info-panel').classList.add('open');
  });

  document.getElementById('info-toggle')?.addEventListener('click', () => {
    showInfoPanel = !showInfoPanel;
    document.getElementById('info-panel').classList.toggle('open', showInfoPanel);
    if (showInfoPanel) renderInfoPanel(activeInterpretation);
  });
  document.getElementById('info-close')?.addEventListener('click', () => {
    showInfoPanel = false;
    document.getElementById('info-panel').classList.remove('open');
  });

  renderInfoPanel(activeInterpretation);
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

  function syncThemeToggleLabels() {
    const icon = isDarkMode ? '☀' : '🌙';
    const label = isDarkMode ? 'Light' : 'Dark';
    document.querySelectorAll('.theme-btn .theme-icon').forEach((el) => {
      el.textContent = icon;
    });
    document.querySelectorAll('.theme-btn .theme-label').forEach((el) => {
      el.textContent = label;
    });
  }
  const onThemeToggle = () => {
    isDarkMode = !isDarkMode;
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('doubleSlitTheme', isDarkMode ? 'dark' : 'light');
    syncThemeToggleLabels();
    applySceneTheme();
  };
  document.getElementById('theme-toggle')?.addEventListener('click', onThemeToggle);
  document.getElementById('theme-toggle-focus')?.addEventListener('click', onThemeToggle);
  syncThemeToggleLabels();

  document.getElementById('explore-pause')?.addEventListener('click', () => {
    isPlaying = !isPlaying;
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
    updateExploreSection();
    if (showInfoPanel) renderInfoPanel(activeInterpretation);
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
    if (showInfoPanel) renderInfoPanel(activeInterpretation);
  });

  document.getElementById('recompute')?.addEventListener('click', () => {
    clearTimeout(gammaRecomputeTimer);
    gammaRecomputeTimer = null;
    rebuildParticleBuffer(Date.now());
    currentTime = 0;
    timelineEl.value = 0;
    const cluster = document.getElementById('demo-toolbar-cluster');
    const pToggle = document.getElementById('params-toggle');
    if (cluster && pToggle && window.matchMedia('(max-width: 768px)').matches) {
      cluster.classList.remove('params-panel-open');
      pToggle.setAttribute('aria-expanded', 'false');
    }
  });

  const toolbarCluster = document.getElementById('demo-toolbar-cluster');
  const paramsToggleBtn = document.getElementById('params-toggle');
  function closeMobileParamsIfDesktop() {
    if (window.matchMedia('(min-width: 769px)').matches) {
      toolbarCluster?.classList.remove('params-panel-open');
      paramsToggleBtn?.setAttribute('aria-expanded', 'false');
    }
  }
  paramsToggleBtn?.addEventListener('click', () => {
    const open = toolbarCluster?.classList.toggle('params-panel-open');
    paramsToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('resize', closeMobileParamsIfDesktop);

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
      if (showInfoPanel) renderInfoPanel(activeInterpretation);
      scheduleMassRecompute();
    });
  }

  const envEl = document.getElementById('adv-env');
  if (envEl) {
    envEl.addEventListener('input', () => {
      envCoupling = Number(envEl.value) / 100;
      updateObserveAndAdvancedControls();
      if (showInfoPanel) renderInfoPanel(activeInterpretation);
      scheduleGammaRecompute();
    });
  }

  document.querySelectorAll('input[name="perspective"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) perspective = radio.value;
      updateObserveAndAdvancedControls();
      if (showInfoPanel) renderInfoPanel(activeInterpretation);
      scheduleGammaRecompute();
    });
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Focus view: reparent interpretation, parameters, and Explore deeper into a left accordion rail.
 * Preserves element ids; restores DOM on exit.
 */
function setupFocusViewMode() {
  const layout = document.querySelector('.demo-layout-advanced');
  const rail = document.getElementById('demo-focus-rail');
  const enter = document.getElementById('focus-view-enter');
  const helpRail = document.getElementById('focus-rail-help');
  const closeRail = document.getElementById('focus-rail-close');
  const dockRail = document.getElementById('focus-rail-dock');
  const backdropRail = document.getElementById('focus-rail-backdrop');
  const accExplore = document.getElementById('focus-acc-2');
  const cluster = document.getElementById('demo-toolbar-cluster');
  const paramsToggle = document.getElementById('params-toggle');
  const paramsPanel = document.getElementById('params-panel');
  const explore = document.getElementById('explore-deeper');
  const bodyParams = document.getElementById('focus-body-parameters');
  const bodyExplore = document.getElementById('focus-body-explore');

  if (
    !layout ||
    !rail ||
    !enter ||
    !cluster ||
    !paramsToggle ||
    !paramsPanel ||
    !explore ||
    !bodyParams ||
    !bodyExplore
  ) {
    return;
  }

  /** @type {Array<[HTMLElement | Element, Comment]>} */
  let restoreList = [];
  let active = false;

  rail.querySelectorAll('.focus-acc').forEach((det) => {
    det.addEventListener('toggle', () => {
      if (!det.open) return;
      rail.querySelectorAll('.focus-acc').forEach((other) => {
        if (other !== det) other.removeAttribute('open');
      });
    });
  });

  accExplore?.addEventListener('toggle', () => {
    if (accExplore.open && explore) {
      explore.setAttribute('open', '');
      updateExploreSection();
    }
  });

  function syncFocusRailUi() {
    if (!active) {
      if (dockRail) dockRail.hidden = true;
      backdropRail?.setAttribute('hidden', '');
      backdropRail?.setAttribute('aria-hidden', 'true');
      return;
    }
    if (!dockRail) return;
    dockRail.hidden = false;
    const collapsed = layout.classList.contains('demo-focus-rail-collapsed');
    const open = !collapsed;
    dockRail.setAttribute('aria-expanded', open ? 'true' : 'false');
    closeRail?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (collapsed) {
      backdropRail?.setAttribute('hidden', '');
      backdropRail?.setAttribute('aria-hidden', 'true');
    } else {
      backdropRail?.removeAttribute('hidden');
      backdropRail?.setAttribute('aria-hidden', 'false');
    }
  }

  function mark(node) {
    const m = document.createComment('focus-restore');
    node.parentNode.insertBefore(m, node);
    restoreList.push([node, m]);
  }

  function enterFocus() {
    if (active) return;
    active = true;
    restoreList = [];

    mark(paramsToggle);
    bodyParams.appendChild(paramsToggle);

    mark(paramsPanel);
    bodyParams.appendChild(paramsPanel);

    mark(explore);
    bodyExplore.appendChild(explore);

    explore.setAttribute('open', '');
    layout.classList.add('demo-focus-rail-collapsed');

    layout.classList.add('demo-layout--focus');
    rail.hidden = false;
    syncFocusRailUi();
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      layout.classList.add('demo-focus-rail-ready');
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          layout.classList.add('demo-focus-rail-ready');
        });
      });
    }
    window.dispatchEvent(new Event('resize'));
  }

  function leaveFocus() {
    if (!active) return;
    active = false;
    layout.classList.remove('demo-focus-rail-ready');

    for (let i = restoreList.length - 1; i >= 0; i--) {
      const [node, marker] = restoreList[i];
      marker.parentNode.insertBefore(node, marker);
      marker.remove();
    }
    restoreList = [];

    layout.classList.remove('demo-focus-rail-collapsed');
    layout.classList.remove('demo-layout--focus');
    rail.hidden = true;
    syncFocusRailUi();
    window.dispatchEvent(new Event('resize'));
  }

  enter.addEventListener('click', enterFocus);
  document.getElementById('focus-exit-corner')?.addEventListener('click', () => {
    leaveFocus();
  });
  closeRail?.addEventListener('click', () => {
    layout.classList.add('demo-focus-rail-collapsed');
    syncFocusRailUi();
    window.dispatchEvent(new Event('resize'));
  });
  dockRail?.addEventListener('click', () => {
    layout.classList.remove('demo-focus-rail-collapsed');
    syncFocusRailUi();
    window.dispatchEvent(new Event('resize'));
  });
  backdropRail?.addEventListener('click', () => {
    layout.classList.add('demo-focus-rail-collapsed');
    syncFocusRailUi();
    window.dispatchEvent(new Event('resize'));
  });
  helpRail?.addEventListener('click', () => {
    document.getElementById('features-help-open')?.click();
  });

  document.addEventListener('keydown', (e) => {
    if (!active || e.key !== 'Escape') return;
    const helpModal = document.getElementById('features-help-modal');
    if (helpModal && !helpModal.hasAttribute('hidden')) return;
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel?.classList.contains('open')) {
      e.preventDefault();
      infoPanel.classList.remove('open');
      showInfoPanel = false;
      return;
    }
    e.preventDefault();
    if (!layout.classList.contains('demo-focus-rail-collapsed')) {
      layout.classList.add('demo-focus-rail-collapsed');
      syncFocusRailUi();
      window.dispatchEvent(new Event('resize'));
    } else {
      leaveFocus();
    }
  });
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (isPlaying) {
    currentTime += dt;
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
