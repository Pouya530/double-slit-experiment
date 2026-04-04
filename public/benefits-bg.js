/**
 * Subtle Three.js background for #benefits: soft electron-like spheres + additive flares (features palette).
 */
import * as THREE from 'https://esm.sh/three@0.160.0';

const REDUCED =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Same turquoise as features trail / line (#5dd4c4) */
const TEAL = 0x5dd4c4;

function initBenefitsBg() {
  const canvas = document.getElementById('benefits-canvas');
  const section = document.getElementById('benefits');
  if (!canvas || !section) return () => {};

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: 'default',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  /* Transparent black clear: composites correctly over .section-light white when premultipliedAlpha is false */
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  const frustumH = 4.8;

  function layoutCam(w, h) {
    const ww = Math.max(2, Math.round(w));
    const hh = Math.max(2, Math.round(h));
    const aspect = ww / hh;
    const halfH = frustumH / 2;
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    renderer.setSize(ww, hh, false);
  }

  /** Electron-like spheres: features turquoise (#5dd4c4), more opaque, higher count */
  const spheres = [];
  const nSpheres = 16;
  for (let i = 0; i < nSpheres; i++) {
    const r = 0.06 + (i % 5) * 0.018;
    const geom = new THREE.SphereGeometry(r, 16, 16);
    const baseOp = 0.42 + (i % 6) * 0.045;
    const mat = new THREE.MeshBasicMaterial({
      color: TEAL,
      transparent: true,
      opacity: baseOp,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const t0 = (i / nSpheres) * Math.PI * 2;
    const rad = 0.55 + ((i * 3) % 7) * 0.18;
    mesh.position.set(
      Math.cos(t0 * 1.07 + i * 0.4) * rad * 1.35,
      Math.sin(t0 * 0.93 + i * 0.35) * rad * 0.95,
      -0.72 + (i % 5) * 0.11,
    );
    scene.add(mesh);
    spheres.push({
      mesh,
      phase: i * 1.13,
      speed: 0.055 + (i % 3) * 0.02,
      baseOp,
    });
  }

  /** Additive ring flares — telescope / charge whisper */
  const flares = [];
  const nFlares = 5;
  for (let i = 0; i < nFlares; i++) {
    const inner = 0.12 + (i % 2) * 0.08;
    const outer = inner + 0.28 + (i % 3) * 0.05;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48),
      new THREE.MeshBasicMaterial({
        color: TEAL,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.position.set((i - (nFlares - 1) / 2) * 0.95, 0.35 - i * 0.22, -1.2 - (i % 2) * 0.2);
    /* Keep rings mostly in XY so the ortho camera (on +Z) sees them face-on, not edge-on */
    ring.rotation.x = 0.18 * (i % 2 === 0 ? 1 : -1);
    ring.rotation.y = 0.12;
    scene.add(ring);
    flares.push({ mesh: ring, phase: i * 0.89 });
  }

  /** One soft central glow disc (even subtler) */
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 48),
    new THREE.MeshBasicMaterial({
      color: TEAL,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.position.set(0.85, -0.35, -1.55);
  glow.rotation.z = 0.2;
  scene.add(glow);

  const bgEl = section.querySelector('.benefits-bg');

  function layout() {
    const w = bgEl ? bgEl.clientWidth : section.clientWidth;
    const h = bgEl ? bgEl.clientHeight : section.clientHeight;
    layoutCam(w, h);
    renderer.render(scene, camera);
  }

  let raf = 0;
  let t = 0;

  function tick() {
    raf = requestAnimationFrame(tick);

    const dt = REDUCED ? 0 : 0.012;
    t += dt;

    for (const s of spheres) {
      const { mesh, phase, speed } = s;
      const ox = mesh.position.x;
      const oy = mesh.position.y;
      const nx = ox + Math.sin(t * speed + phase) * 0.0035;
      const ny = oy + Math.cos(t * speed * 0.85 + phase * 1.2) * 0.003;
      mesh.position.x = nx;
      mesh.position.y = ny;
      if (!REDUCED) {
        const b = s.baseOp ?? 0.45;
        mesh.material.opacity = Math.min(0.92, b + Math.sin(t * 0.9 + phase) * 0.08);
      }
    }

    flares.forEach((f, fi) => {
      f.mesh.rotation.z = t * 0.11 * (fi % 2 === 0 ? 1 : -1);
      if (!REDUCED) {
        f.mesh.material.opacity = 0.08 + Math.sin(t * 0.55 + f.phase) * 0.05;
      }
    });

    if (!REDUCED) {
      glow.material.opacity = 0.065 + Math.sin(t * 0.35) * 0.04;
      glow.rotation.z = 0.2 + Math.sin(t * 0.02) * 0.04;
    }

    renderer.render(scene, camera);
  }

  layout();
  requestAnimationFrame(() => {
    layout();
  });
  const ro = new ResizeObserver(() => layout());
  ro.observe(section);
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    renderer.dispose();
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initBenefitsBg(), { once: true });
  } else {
    initBenefitsBg();
  }
}
