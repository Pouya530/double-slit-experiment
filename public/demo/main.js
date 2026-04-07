/**
 * Double Slit Demo — Full visual experience
 * Particles fly from source through slits to detection screen.
 */

import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { createParticleBuffer } from './simulation.js?v=18';
import { wavelengthToRGB, fringeVisibility } from './physics.js?v=18';
import { INTERPRETATIONS } from './interpretations.js';
import { MEASUREMENT_CONFIGS, CLASSIC_INTERP_TO_CONFIG_KEY, narrativeForGamma } from './measurement-configs.js';

/** Desktop initial orbit: ~10% farther from target than legacy framing (tablet unchanged). */
const DESKTOP_INITIAL_ORBIT_SCALE = 1.1;
/** Initial camera world Y for desktop (non-tablet); tablet uses scaled 0.6 */
const DESKTOP_INITIAL_CAM_Y = 1.5 * DESKTOP_INITIAL_ORBIT_SCALE;
/** Mobile-only: world Y after orbit offset; offset also scaled ~15% toward target */
const MOBILE_INITIAL_CAM_Y = 2.5;
const MOBILE_INITIAL_DISTANCE_SCALE = 0.85;

function hexFromInterpBrand(def) {
  const c = def?.color;
  if (typeof c !== 'string' || !c.startsWith('#')) return null;
  const h = c.slice(1);
  if (h.length === 6 && /^[0-9a-fA-F]+$/.test(h)) return parseInt(h, 16);
  return null;
}

/**
 * Safari / WebKit Canvas2D is much slower than Chrome when drawing many radial gradients per frame.
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

function drawDetectionScreenWebKitFast(ctx, w, h, theme, _positionBlend, collapseFlashActive, thinStripHits) {
  ctx.fillStyle = theme.screenBg;
  ctx.fillRect(0, 0, w, h);
  const { birthTimes, interferencePositions, wavelengths } = particleBuffer;
  const isDark = isDarkMode;
  ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over';
  const r0 = thinStripHits ? 2 : 3.5;
  const r1 = thinStripHits ? 1.15 : 1.85;

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
      let flashExtra = (thinStripHits ? 4 : 7) * (1 - flashDecay);
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

/** Play/pause control: glyph, a11y label, and CSS hooks for circle + animations */
function syncPlayButton() {
  const playBtn = document.getElementById('play');
  if (!playBtn) return;
  playBtn.textContent = isPlaying ? '❚❚' : '▶';
  playBtn.classList.toggle('play-btn--paused', !isPlaying);
  playBtn.classList.toggle('play-btn--playing', isPlaying);
  playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
}

function syncInterpretationUI() {
  document.querySelectorAll('.interp-tab').forEach((b) => b.classList.toggle('active', b.dataset.interp === activeInterpretation));
  if (showInfoPanel) renderInfoPanel(activeInterpretation);
  const infoAccent = INTERPRETATIONS[activeInterpretation]?.color || '#129079';
  document.getElementById('info-toggle')?.style.setProperty('--interp-accent', infoAccent);
  const ms = document.getElementById('measurement-slider');
  if (ms) {
    ms.value = String(Math.round(measurementStrength * 100));
    ms.setAttribute('aria-valuetext', `${Math.round(measurementStrength * 100)}%`);
  }
  const labelEl = document.getElementById('measurement-label');
  const readout = document.getElementById('measurement-value-readout');
  const narrative = document.getElementById('measurement-narrative');
  const advKey = CLASSIC_INTERP_TO_CONFIG_KEY[activeInterpretation];
  const cfg = advKey ? MEASUREMENT_CONFIGS[advKey] : null;
  if (labelEl && cfg) labelEl.textContent = cfg.sliderLabel;
  if (readout) readout.textContent = `${Math.round(measurementStrength * 100)}%`;
  if (narrative && cfg) narrative.textContent = narrativeForGamma(measurementStrength, cfg);
  syncPlayButton();
  const interpMobile = document.getElementById('interp-select-mobile');
  if (interpMobile) interpMobile.value = activeInterpretation;
}

const TOUR_STEPS = [
  { text: "Let's fire a photon.", action: () => { singleParticleMode = true; effectiveTMax = FLIGHT_TIME + 0.4; currentTime = 0; isPlaying = true; measurementStrength = 0; syncInterpretationUI(); scheduleClassicBufferRecompute(); } },
  { text: "Simple, right? Now let's do it a thousand times. Watch the pattern emerge.", action: () => { singleParticleMode = false; effectiveTMax = particleBuffer?.tMax ?? tMax; currentTime = 0; isPlaying = true; syncInterpretationUI(); } },
  { text: "Here's where it gets weird. Crank measurement strength — watch the fringes fade.", action: () => { measurementStrength = 1; syncInterpretationUI(); scheduleClassicBufferRecompute(); } },
  { text: "Every physicist agrees on WHAT happens. They disagree on WHY.", action: () => { } },
  { text: "Copenhagen says: The particle has no path until measured. The wave collapses at the screen.", action: () => { activeInterpretation = 'copenhagen'; measurementStrength = 0; syncInterpretationUI(); scheduleClassicBufferRecompute(); } },
  { text: "But Everett said: The wave never collapses. The universe branches — all outcomes happen.", action: () => { activeInterpretation = 'many-worlds'; syncInterpretationUI(); scheduleClassicBufferRecompute(); } },
  { text: "Bohm had a different idea: A real particle surfing a real wave. Fully deterministic.", action: () => { activeInterpretation = 'pilot-wave'; syncInterpretationUI(); scheduleClassicBufferRecompute(); } },
  { text: "Decoherence: Here's what's actually happening physically. Environment coupling destroys interference.", action: () => { activeInterpretation = 'decoherence'; syncInterpretationUI(); scheduleClassicBufferRecompute(); } },
  { text: "QBism: Some say we're asking the wrong question. The wavefunction describes your beliefs, not reality.", action: () => { activeInterpretation = 'qbism'; syncInterpretationUI(); scheduleClassicBufferRecompute(); } },
  { text: "In 2025, Nature surveyed 1,100+ physicists. 36% Copenhagen, 15% Many-Worlds, 47% said the wavefunction is 'simply a useful tool'.", action: () => { } },
  { text: "Only 24% were confident in their answer. This is the frontier. Maybe YOU will figure it out.", action: () => { syncInterpretationUI(); } },
];

const MAX_PARTICLES = 3000;
const SCREEN_DISTANCE = 2;
const SCREEN_WIDTH = 4;
const SCREEN_HEIGHT = 2.8;
const SOURCE_X = -1.8;
const BARRIER_X = 0;
const FLIGHT_TIME = 0.8;
const SLIT_SEP = 0.22;
const SLIT_WIDTH = 0.055;

function getClassicVisibilityModel() {
  const k = CLASSIC_INTERP_TO_CONFIG_KEY[activeInterpretation];
  return MEASUREMENT_CONFIGS[k]?.preferredVisModel ?? 'quadratic';
}

function scheduleClassicBufferRecompute(immediate = false) {
  clearTimeout(classicGammaTimer);
  const run = () => {
    const slitWidth = parseFloat(document.getElementById('slit-width')?.value || 100) * 1e-9;
    const slitSeparation = parseFloat(document.getElementById('slit-sep')?.value || 500) * 1e-9;
    const wavelength = parseFloat(document.getElementById('wavelength')?.value || 550) * 1e-9;
    particleBuffer = createParticleBuffer(
      {
        slitWidth,
        slitSeparation,
        wavelength,
        emissionRate: 60,
        screenDistance: SCREEN_DISTANCE,
        sourceX: SOURCE_X,
        barrierX: BARRIER_X,
        measurementGamma: measurementStrength,
        visibilityModel: getClassicVisibilityModel(),
      },
      MAX_PARTICLES,
      Date.now()
    );
    tMax = particleBuffer.tMax;
    effectiveTMax = singleParticleMode ? FLIGHT_TIME + 0.4 : tMax;
    classicGammaTimer = null;
  };
  if (immediate) {
    run();
    return;
  }
  classicGammaTimer = setTimeout(run, 200);
}

let scene, camera, renderer, controls;
let particleMesh, detectionTexture, detectionCanvas;
let particleBuffer, visibleCount = 0;
let currentTime = 0, tMax = 30, effectiveTMax = 30, isPlaying = true, lastTime = performance.now();
let measurementStrength = 0;
let classicGammaTimer = null;
let gridHelper, sourceMesh, sourceGlow, barrierLeft, barrierCenter, barrierRight, screenFrame;
let waveOverlay, envParticles, qbismOverlay;
let isDarkMode = false;
let activeInterpretation = 'copenhagen';
let showInfoPanel = false;
let tourActive = false;
let tourStep = 0;
let singleParticleMode = false;

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

function init() {
  initSafariDetectionFastPathFlag();

  const savedTheme = localStorage.getItem('doubleSlitTheme');
  isDarkMode = savedTheme === 'dark';
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');

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

  const params = {
    slitWidth: 1e-7,
    slitSeparation: 5e-7,
    wavelength: 5.5e-7,
    emissionRate: 60,
    screenDistance: SCREEN_DISTANCE,
    sourceX: SOURCE_X,
    barrierX: BARRIER_X,
    measurementGamma: measurementStrength,
    visibilityModel: getClassicVisibilityModel(),
  };
  particleBuffer = createParticleBuffer(params, MAX_PARTICLES, 12345);
  tMax = particleBuffer.tMax;
  effectiveTMax = tMax;

  applySceneTheme();
  setupUI();
  setupInterpretationUI();
  setupTourUI();
  syncInterpretationUI();
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

/** Galaxy Z Fold 4 / 5 / 6 (and matching SM-F9… UA) — cover + inner; also wide inner >768 CSS px. */
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
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      off.multiplyScalar(0.87);
      const dirN = off.clone().normalize();
      const rightN = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dirN);
      if (rightN.lengthSq() > 1e-10) {
        rightN.normalize();
        off.applyAxisAngle(rightN, (8 * Math.PI) / 180);
      }
    }
    off.multiplyScalar(MOBILE_INITIAL_DISTANCE_SCALE);
    camera.position.copy(tgt).add(off);
    camera.position.y = MOBILE_INITIAL_CAM_Y;
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
    const startScale = tablet ? 1 : DESKTOP_INITIAL_ORBIT_SCALE;
    const camY = tablet ? 0.6 * tabletZoom * startScale : DESKTOP_INITIAL_CAM_Y;
    camera.position.set(
      tgt.x + rx * tabletZoom * startScale,
      camY,
      tgt.z + rz * tabletZoom * startScale
    );
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
  const interp = INTERPRETATIONS[activeInterpretation];
  const V = fringeVisibility(measurementStrength, getClassicVisibilityModel());
  const showWave =
    V > 0.35 &&
    (activeInterpretation === 'copenhagen' ||
      activeInterpretation === 'many-worlds' ||
      activeInterpretation === 'pilot-wave');
  const showEnv = activeInterpretation === 'decoherence' && measurementStrength > 0.02;
  const showQbism = activeInterpretation === 'qbism';

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
      const n = Math.max(1, Math.min(80, Math.ceil(measurementStrength * 80)));
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
      const pulse = 0.14 + 0.08 * Math.sin(currentTime * 1.5) ** 2;
      const classicalPulse =
        0.1 + 0.06 * Math.sin(currentTime * 1.2) ** 2;
      qbismOverlay.material.opacity = classical ? classicalPulse : pulse;
    }
  }
}

function getWhatsHappening(interpId) {
  const g = measurementStrength;
  const V = fringeVisibility(g, getClassicVisibilityModel());
  switch (interpId) {
    case 'copenhagen':
      return V < 0.45 ? 'Strong which-path — low fringe visibility' : 'Weak measurement — interference visible';
    case 'many-worlds':
      return V < 0.45 ? 'Branch entanglement — illustrative classical-like stats' : 'High coherence — fringes';
    case 'pilot-wave':
      return V < 0.45 ? 'Guiding field disrupted in this illustration' : 'Pilot-wave steering — interference';
    case 'decoherence':
      return `Coupling ${(g * 100).toFixed(0)}% — fringe visibility ${(V * 100).toFixed(0)}%`;
    case 'qbism':
      return V < 0.55 ? 'Strong belief update — classical-like expectations' : 'Interference from uncertainty';
    default:
      return '';
  }
}

function renderInfoPanel(interpId) {
  const interp = INTERPRETATIONS[interpId];
  if (!interp) return;
  const el = document.getElementById('info-content');
  const happening = getWhatsHappening(interpId);
  el.innerHTML = `
    <h3 style="border-left: 4px solid ${interp.color}; padding-left: 12px;">${interp.name}</h3>
    <p class="meta">${interp.proponents} (${interp.year})</p>
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
  document.querySelectorAll('.interp-tab').forEach((btn) => {
    const color = INTERPRETATIONS[btn.dataset.interp]?.color;
    btn.style.setProperty('--interp-accent', color || '#129079');
    btn.addEventListener('click', () => {
      activeInterpretation = btn.dataset.interp;
      document.querySelectorAll('.interp-tab').forEach(b => b.classList.toggle('active', b.dataset.interp === activeInterpretation));
      const interpMobile = document.getElementById('interp-select-mobile');
      if (interpMobile) interpMobile.value = activeInterpretation;
      syncInterpretationUI();
      scheduleClassicBufferRecompute();
      renderInfoPanel(activeInterpretation);
      if (showInfoPanel) document.getElementById('info-panel').classList.add('open');
    });
  });
  document.querySelector('.interp-tab[data-interp="copenhagen"]').classList.add('active');
  document.getElementById('interp-select-mobile')?.addEventListener('change', (e) => {
    activeInterpretation = e.target.value;
    document.querySelectorAll('.interp-tab').forEach((b) => b.classList.toggle('active', b.dataset.interp === activeInterpretation));
    syncInterpretationUI();
    scheduleClassicBufferRecompute();
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

function setupTourUI() {
  const overlay = document.getElementById('tour-overlay');
  const textEl = document.getElementById('tour-text');
  const progressEl = document.getElementById('tour-progress');
  const runStep = () => {
    if (tourStep >= TOUR_STEPS.length) {
      tourActive = false;
      overlay?.classList.remove('open');
      return;
    }
    const step = TOUR_STEPS[tourStep];
    textEl.textContent = step.text;
    step.action?.();
    progressEl.textContent = `${tourStep + 1} / ${TOUR_STEPS.length}`;
  };

  document.getElementById('tour-toggle')?.addEventListener('click', () => {
    tourActive = !tourActive;
    overlay?.classList.toggle('open', tourActive);
    if (tourActive) {
      tourStep = 0;
      singleParticleMode = false;
      effectiveTMax = particleBuffer?.tMax ?? tMax;
      isPlaying = false;
      syncPlayButton();
      textEl.textContent = TOUR_STEPS[0].text;
      progressEl.textContent = `1 / ${TOUR_STEPS.length}`;
    }
  });

  document.getElementById('tour-next')?.addEventListener('click', () => {
    if (!tourActive) return;
    TOUR_STEPS[tourStep]?.action?.();
    tourStep++;
    runStep();
  });

  document.getElementById('tour-skip')?.addEventListener('click', () => {
    tourActive = false;
    singleParticleMode = false;
    effectiveTMax = particleBuffer?.tMax ?? tMax;
    overlay?.classList.remove('open');
  });
}

function drawDetectionScreen() {
  if (!particleBuffer || !detectionCanvas) return;
  const ctx = detectionCanvas.getContext('2d');
  const w = detectionCanvas.width;
  const h = detectionCanvas.height;
  const theme = THEMES[isDarkMode ? 'dark' : 'light'];
  const collapseFlashActive = activeInterpretation === 'copenhagen' && measurementStrength < 0.25;
  const thinStripHits = measurementStrength >= 0.92;

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
      let flashRadius = thinStripHits ? 3 + 5 * (1 - flashDecay) : 5 + 9 * (1 - flashDecay);
      if (!Number.isFinite(flashRadius) || flashRadius <= 0) flashRadius = thinStripHits ? 3 : 5;
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

    let glowR = thinStripHits ? 4 : 7;
    if (!Number.isFinite(glowR) || glowR <= 0) glowR = 5;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
    grad.addColorStop(0, `rgba(${R},${G},${B},${alpha})`);
    grad.addColorStop(0.4, `rgba(${R},${G},${B},${alphaOuter})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, glowR, 0, Math.PI * 2);
    ctx.fill();

    const coreR = thinStripHits ? 1.25 : 1.75;
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

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('doubleSlitTheme', isDarkMode ? 'dark' : 'light');
    document.querySelector('.theme-icon').textContent = isDarkMode ? '☀' : '🌙';
    document.querySelector('.theme-label').textContent = isDarkMode ? 'Light' : 'Dark';
    applySceneTheme();
  });
  document.querySelector('.theme-icon').textContent = isDarkMode ? '☀' : '🌙';
  document.querySelector('.theme-label').textContent = isDarkMode ? 'Light' : 'Dark';

  document.getElementById('reset')?.addEventListener('click', () => {
    currentTime = 0;
    timelineEl.value = 0;
    isPlaying = true;
    syncPlayButton();
  });

  const msEl = document.getElementById('measurement-slider');
  msEl?.addEventListener('input', () => {
    measurementStrength = Math.max(0, Math.min(1, Number(msEl.value) / 100));
    syncInterpretationUI();
    if (showInfoPanel) renderInfoPanel(activeInterpretation);
    scheduleClassicBufferRecompute();
  });
  msEl?.addEventListener('dblclick', () => {
    const v = Number(msEl.value) / 100;
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
    syncInterpretationUI();
    clearTimeout(classicGammaTimer);
    classicGammaTimer = null;
    scheduleClassicBufferRecompute(true);
    if (showInfoPanel) renderInfoPanel(activeInterpretation);
  });

  document.getElementById('recompute')?.addEventListener('click', () => {
    const params = {
      slitWidth: parseFloat(document.getElementById('slit-width')?.value || 100) * 1e-9,
      slitSeparation: parseFloat(document.getElementById('slit-sep')?.value || 500) * 1e-9,
      wavelength: parseFloat(document.getElementById('wavelength')?.value || 550) * 1e-9,
      emissionRate: 60,
      screenDistance: SCREEN_DISTANCE,
      sourceX: SOURCE_X,
      barrierX: BARRIER_X,
      measurementGamma: measurementStrength,
      visibilityModel: getClassicVisibilityModel(),
    };
    particleBuffer = createParticleBuffer(params, MAX_PARTICLES, Date.now());
    tMax = particleBuffer.tMax;
    effectiveTMax = singleParticleMode ? FLIGHT_TIME + 0.4 : tMax;
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
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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

  if (particleMesh?.userData?.update) particleMesh.userData.update();
  updateInterpretationOverlays();
  drawDetectionScreen();

  controls.update();
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
