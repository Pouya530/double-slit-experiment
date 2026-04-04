/**
 * Double Slit Demo — Full visual experience
 * Particles fly from source through slits to detection screen.
 */

import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { createParticleBuffer } from './simulation.js';
import { wavelengthToRGB } from './physics.js';
import { INTERPRETATIONS_ADV, INTERPRETATION_IDS_ADV } from './interpretations-advanced.js';
import {
  collapseSuppressionFactor,
  decoherenceVisibility,
  effectiveWavelength,
} from './physics-interpretations.js';

/** Map interpretation UI accent (#RRGGBB) to Three.js hex for overlays. */
function hexFromInterpBrand(def) {
  const c = def?.color;
  if (typeof c !== 'string' || !c.startsWith('#')) return null;
  const h = c.slice(1);
  if (h.length === 6 && /^[0-9a-fA-F]+$/.test(h)) return parseInt(h, 16);
  return null;
}

function syncInterpretationUI() {
  document.querySelectorAll('.interp-tab').forEach((b) => b.classList.toggle('active', b.dataset.interp === activeInterpretation));
  if (showInfoPanel) renderInfoPanel(activeInterpretation);
  updateObserveAndAdvancedControls();
  const playBtn = document.getElementById('play');
  if (playBtn) playBtn.textContent = isPlaying ? '❚❚' : '▶';
  const interpMobile = document.getElementById('interp-select-mobile');
  if (interpMobile) interpMobile.value = activeInterpretation;
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
let isObserving = false, observerTransition = 0, observerTarget = 0;
let gridHelper, sourceMesh, sourceGlow, barrierLeft, barrierCenter, barrierRight, screenFrame;
let waveOverlay, envParticles, qbismOverlay;
let isDarkMode = false;
let activeInterpretation = 'copenhagen';
let showInfoPanel = false;
let singleParticleMode = false;
let particleMassAmu = 0.00055;
let envCoupling = 0;
let perspective = 'external';
let physicsBlend = 0;

/** Per-interpretation persisted knobs (slit λ / geometry stay global on the form). */
const DEFAULT_ELECTRON_AMU = 0.00055;
/** @type {Record<string, { particleMassAmu: number; envCoupling: number; perspective: string; isObserving: boolean }>} */
let interpParamSnapshots = {};

function createDefaultInterpParams() {
  return {
    particleMassAmu: DEFAULT_ELECTRON_AMU,
    envCoupling: 0,
    perspective: 'external',
    isObserving: false,
  };
}

function cloneInterpParams(p) {
  return {
    particleMassAmu: p.particleMassAmu,
    envCoupling: p.envCoupling,
    perspective: p.perspective,
    isObserving: p.isObserving,
  };
}

function captureParamsFromGlobals() {
  return cloneInterpParams({
    particleMassAmu,
    envCoupling,
    perspective,
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

/** Snap blend/observers so switching tabs does not leave seconds of “wrong” interpolation. */
function snapPhysicsStateImmediate() {
  observerTarget = isObserving ? 1 : 0;
  observerTransition = observerTarget;
  physicsBlend = computePhysicsBlendTarget();
}

/**
 * Save current globals into the tab we are leaving, load the tab we are entering, rebuild particles.
 */
function switchInterpretation(nextId) {
  if (nextId === activeInterpretation) return;
  interpParamSnapshots[activeInterpretation] = captureParamsFromGlobals();
  activeInterpretation = nextId;
  const snap = interpParamSnapshots[activeInterpretation] || createDefaultInterpParams();
  particleMassAmu = snap.particleMassAmu;
  envCoupling = snap.envCoupling;
  perspective = snap.perspective;
  isObserving = snap.isObserving;
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

function computePhysicsBlendTarget() {
  const id = activeInterpretation;
  if (id === 'objectiveCollapse' || id === 'orchOR') {
    return 1 - collapseSuppressionFactor(particleMassAmu);
  }
  if (id === 'decoherence') {
    return 1 - decoherenceVisibility(envCoupling);
  }
  if (id === 'rqm') {
    if (perspective === 'external') return 0;
    if (perspective === 'detector') return 1;
    return 0.45;
  }
  return observerTarget;
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
  particleBuffer = createParticleBuffer(
    {
      slitWidth,
      slitSeparation,
      wavelength: lambdaEff,
      emissionRate: 60,
      screenDistance: SCREEN_DISTANCE,
    },
    MAX_PARTICLES,
    seed
  );
  tMax = particleBuffer.tMax;
  effectiveTMax = singleParticleMode ? FLIGHT_TIME + 0.4 : tMax;
}

function updateObserveAndAdvancedControls() {
  const def = getInterpDef();
  const ob = document.getElementById('observe');
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

  if (!ob) return;
  const mode = def?.observerToggleMode ?? 'binary';
  const disabled = mode === 'disabled' || mode === 'slider' || mode === 'perspective';
  ob.disabled = disabled;
  ob.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  ob.classList.toggle('active', isObserving && !disabled);

  const span = ob.querySelector('span:last-child');
  if (mode === 'slider' && span) {
    span.textContent = 'Use environment slider';
  } else if (mode === 'perspective' && span) {
    span.textContent = 'Use perspective control';
  } else if (mode === 'disabled' && span) {
    span.textContent = 'Observer N/A — use mass';
  } else if (span) {
    span.textContent = isObserving ? 'Observing' : 'Not observing';
  }
}

function init() {
  const savedTheme = localStorage.getItem('doubleSlitTheme');
  isDarkMode = savedTheme === 'dark';
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');

  initInterpParamSnapshots();

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
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
  window.addEventListener('resize', onResize);
  animate();
}

function mobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 768;
}

function tabletViewport() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return w > 768 && w <= 1024;
}

/** Call once after OrbitControls exists; tablet + desktop share the same initial angle; mobile = behind emitter + rotate/zoom overrides. */
function applyInitialCameraAndControls() {
  const mobile = mobileViewport();
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
  detectionCanvas.width = 1024;
  detectionCanvas.height = Math.round(1024 * (SCREEN_HEIGHT / SCREEN_WIDTH));
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
    const { birthTimes, interferencePositions, classicalPositions, slitZ, slitY, wavelengths, screenDistance } = particleBuffer;
    let count = 0;
    const blend = physicsBlend;

    for (let i = 0; i < particleBuffer.count; i++) {
      if (singleParticleMode && i > 0) continue;
      if (birthTimes[i] > currentTime) continue;

      const iy = interferencePositions[i * 3 + 1];
      const iz = interferencePositions[i * 3 + 2];
      const cz = classicalPositions[i * 3 + 2];
      const cy = classicalPositions[i * 3 + 1];
      const screenZ = iz * (1 - blend) + cz * blend;
      const screenY = iy * (1 - blend) + cy * blend;

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
  const lowBlend = physicsBlend < 0.35;
  const showWave =
    lowBlend &&
    (activeInterpretation === 'copenhagen' ||
      activeInterpretation === 'manyWorlds' ||
      activeInterpretation === 'bohmian');
  const showEnv = activeInterpretation === 'decoherence' && envCoupling > 0.02;
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
  if (envParticles) envParticles.visible = showEnv;

  if (qbismOverlay) {
    qbismOverlay.visible = showQbism;
    if (showQbism) {
      const cloudHex =
        interp?.cloudColor ?? hexFromInterpBrand(interp) ?? 0xba68c8;
      qbismOverlay.material.color.setHex(cloudHex);
      const classical = physicsBlend > 0.45;
      const pulse =
        0.14 + 0.08 * Math.sin(currentTime * 1.5) ** 2;
      const classicalPulse =
        0.1 + 0.06 * Math.sin(currentTime * 1.2) ** 2;
      qbismOverlay.material.opacity = classical ? classicalPulse : pulse;
    }
  }
}

function getWhatsHappening(interpId) {
  const b = physicsBlend;
  const classical = b > 0.55;
  switch (interpId) {
    case 'copenhagen':
      return classical ? 'Macroscopic record / which-path — two-band distribution' : 'Probability amplitude between source and screen';
    case 'manyWorlds':
      return classical ? 'Branch-relative definite slit; global state still entangled' : 'No collapse — coherence across branches (illustrative)';
    case 'bohmian':
      return classical ? 'Which-path disturbs guiding wave — trajectories separate' : 'Particle guided by pilot wave through both openings';
    case 'decoherence':
      return `Environment coupling ${(envCoupling * 100).toFixed(0)}% — fringe visibility ${(decoherenceVisibility(envCoupling) * 100).toFixed(0)}%`;
    case 'qbism':
      return classical ? 'Agent updates betting odds after new information' : ' ψ encodes expectations, not a mind-independent object';
    case 'rqm':
      if (perspective === 'external') return 'Relative to you outside: lab can remain in superposition';
      if (perspective === 'detector') return 'Relative to detector: definite click after correlation';
      return 'Hybrid perspective (illustrative)';
    case 'objectiveCollapse':
    case 'orchOR':
      return `Mass ${particleMassAmu.toExponential(2)} amu — spontaneous locality weight ~${(100 * (1 - collapseSuppressionFactor(particleMassAmu))).toFixed(1)}% classical`;
    case 'vonNeumannWigner':
      return classical ? '(Historical framing) collapse tied to conscious record — fringe view' : 'Superposed until “mind” — not mainstream QM';
    case 'hoffman':
      return classical ? 'Interface shows definite “icons” given which-path info' : 'ψ as agent-side description — same statistics';
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
  const blend = physicsBlend;

  ctx.fillStyle = theme.screenBg;
  ctx.fillRect(0, 0, w, h);

  const { birthTimes, interferencePositions, classicalPositions, wavelengths } = particleBuffer;

  const collapseFlashActive = activeInterpretation === 'copenhagen' && blend < 0.25;

  for (let i = 0; i < particleBuffer.count; i++) {
    if (singleParticleMode && i > 0) continue;
    if (birthTimes[i] > currentTime) continue;
    const age = currentTime - birthTimes[i];
    if (age < FLIGHT_TIME) continue;

    const ageSinceHit = age - FLIGHT_TIME;
    const isNewHit = collapseFlashActive && ageSinceHit < 0.2;

    const iz = interferencePositions[i * 3 + 2];
    const cz = classicalPositions[i * 3 + 2];
    const iy = interferencePositions[i * 3 + 1];
    const cy = classicalPositions[i * 3 + 1];
    const z = iz * (1 - blend) + cz * blend;
    const y = iy * (1 - blend) + cy * blend;

    const u = (z + SCREEN_WIDTH / 2) / SCREEN_WIDTH;
    const v = (y + SCREEN_HEIGHT / 2) / SCREEN_HEIGHT;
    const px = Math.max(0, Math.min(w - 1, u * w));
    const py = Math.max(0, Math.min(h - 1, (1 - v) * h));
    const [r, g, b] = wavelengthToRGB(wavelengths[i]);
    const br = theme.hitBrightness;
    const R = Math.min(255, r * 255 * br);
    const G = Math.min(255, g * 255 * br);
    const B = Math.min(255, b * 255 * br);
    const alpha = isDarkMode ? 0.9 : 0.95;
    const alphaOuter = isDarkMode ? 0.4 : 0.35;

    if (isNewHit) {
      const flashDecay = 1 - ageSinceHit / 0.2;
      const flashRadius = 8 + 16 * (1 - flashDecay);
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

    const grad = ctx.createRadialGradient(px, py, 0, px, py, 12);
    grad.addColorStop(0, `rgba(${R},${G},${B},${alpha})`);
    grad.addColorStop(0.4, `rgba(${R},${G},${B},${alphaOuter})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${R},${G},${B},${isDarkMode ? 0.8 : 0.9})`;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  detectionTexture.needsUpdate = true;
}

function setupUI() {
  const timelineEl = document.getElementById('timeline');
  const playBtn = document.getElementById('play');
  const countEl = document.getElementById('particle-count');
  const observeBtn = document.getElementById('observe');

  timelineEl.min = 0;
  timelineEl.max = 100;
  timelineEl.value = 0;

  timelineEl.addEventListener('input', () => {
    currentTime = (timelineEl.value / 100) * effectiveTMax;
    isPlaying = false;
    playBtn.textContent = '▶';
  });

  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? '❚❚' : '▶';
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
    playBtn.textContent = '❚❚';
  });

  observeBtn.addEventListener('click', () => {
    isObserving = !isObserving;
    observerTarget = isObserving ? 1 : 0;
    observeBtn.classList.toggle('active', isObserving);
    observeBtn.querySelector('span:last-child').textContent = isObserving ? 'Observing' : 'Not observing';
    if (showInfoPanel) renderInfoPanel(activeInterpretation);
  });

  document.getElementById('recompute')?.addEventListener('click', () => {
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
      if (showInfoPanel) renderInfoPanel(activeInterpretation);
    });
  }

  document.querySelectorAll('input[name="perspective"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) perspective = radio.value;
      if (showInfoPanel) renderInfoPanel(activeInterpretation);
    });
  });
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
        const pb = document.getElementById('play');
        if (pb) pb.textContent = '▶';
      } else {
        currentTime = currentTime % effectiveTMax;
      }
    }
    const tl = document.getElementById('timeline');
    if (tl) tl.value = (currentTime / effectiveTMax) * 100;
  }

  observerTransition += (observerTarget - observerTransition) * Math.min(1, dt * 5);
  const targetBlend = computePhysicsBlendTarget();
  physicsBlend += (targetBlend - physicsBlend) * Math.min(1, dt * 5);

  if (particleMesh?.userData?.update) particleMesh.userData.update();
  updateInterpretationOverlays();
  drawDetectionScreen();

  controls.update();
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
