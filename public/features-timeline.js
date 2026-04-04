/**
 * Features section: scroll-scrubbed orthogonal path (90° only) + electron.
 * Path outlines each feature card from DOM bounds; connectors run in the gutter (left), not through the text.
 */
import * as THREE from 'https://esm.sh/three@0.160.0';

const REDUCED = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function segmentLengths(points) {
  const lens = [];
  for (let i = 0; i < points.length - 1; i++) lens.push(points[i].distanceTo(points[i + 1]));
  return lens;
}

/** Cumulative distance along polyline to reach vertex index `endIdx` (distance to that point from start). */
function distToVertexIndex(points, endIdx) {
  let d = 0;
  for (let j = 0; j < endIdx && j + 1 < points.length; j++) {
    d += points[j].distanceTo(points[j + 1]);
  }
  return d;
}

/** Point and unit tangent along polyline at distance d (axis-aligned). */
function samplePolyline(points, d) {
  if (points.length < 2) return { point: new THREE.Vector3(0, 0, 0), tang: new THREE.Vector3(1, 0, 0) };
  if (d <= 0) return { point: points[0].clone(), tang: points[1].clone().sub(points[0]).normalize() };
  let remaining = d;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    if (remaining <= len) {
      const t = len > 1e-8 ? remaining / len : 0;
      const p = a.clone().lerp(b, t);
      const tan = b.clone().sub(a).normalize();
      return { point: p, tang: tan };
    }
    remaining -= len;
  }
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return { point: b.clone(), tang: b.clone().sub(a).normalize() };
}

/** Vertices for Line strip from start to distance d. */
function polylineVerticesTo(points, d) {
  const out = [];
  if (d <= 0 || points.length < 2) return out;
  let remaining = d;
  out.push(points[0].x, points[0].y, points[0].z);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    if (remaining >= len) {
      out.push(b.x, b.y, b.z);
      remaining -= len;
    } else {
      const t = len > 1e-8 ? remaining / len : 0;
      const p = a.clone().lerp(b, t);
      out.push(p.x, p.y, p.z);
      break;
    }
  }
  return out;
}

/** All joints where direction changes (90°). */
function cornerIndices(points) {
  const idx = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i].clone().sub(points[i - 1]);
    const next = points[i + 1].clone().sub(points[i]);
    if (prev.lengthSq() > 1e-8 && next.lengthSq() > 1e-8 && Math.abs(prev.normalize().dot(next.normalize())) < 0.01) {
      idx.push(i);
    }
  }
  return idx;
}

/**
 * Build orthogonal path: for each frame element, TL→TR→BR→BL; between frames, vertical on left (xL) in the gap.
 * @param {HTMLElement[]} frames — feature cards plus optional CTA wrapper, in order top→bottom
 * @param {number} revealMilestoneCount — only the first N frames get entries in revealDist (feature cards only)
 */
function buildPathAroundFeatureFrames(frames, canvas, camera, width, height, padPx = 12, leadPx = 20, revealMilestoneCount = null) {
  const milestoneN = revealMilestoneCount == null ? frames.length : revealMilestoneCount;
  if (!frames.length || width < 16 || height < 16) return { points: [], revealDist: [], totalLen: 0 };

  const c = canvas.getBoundingClientRect();
  const wPx = (px, py) => {
    const x = camera.left + (px / width) * (camera.right - camera.left);
    const y = camera.top - (py / height) * (camera.top - camera.bottom);
    return new THREE.Vector3(x, y, 0);
  };

  /** Per-frame axis-aligned bounds (two-column desktop: each card has its own x span). */
  const bands = [];

  for (const el of frames) {
    const r = el.getBoundingClientRect();
    const pxL = r.left - c.left - padPx;
    const pxR = r.right - c.left + padPx;
    const pyT = r.top - c.top - padPx;
    const pyB = r.bottom - c.top + padPx;
    const corners = [
      wPx(pxL, pyT),
      wPx(pxR, pyT),
      wPx(pxR, pyB),
      wPx(pxL, pyB),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    bands.push({
      yT: Math.max(...ys),
      yB: Math.min(...ys),
      xL: Math.min(...xs),
      xR: Math.max(...xs),
    });
  }

  const leadWorld = (leadPx / height) * (camera.top - camera.bottom);
  const pts = [];
  const revealIdx = [];

  for (let i = 0; i < bands.length; i++) {
    const { yT, yB, xL, xR } = bands[i];

    if (i === 0) {
      pts.push(new THREE.Vector3(xL, yT + leadWorld, 0));
      pts.push(new THREE.Vector3(xL, yT, 0));
    }

    pts.push(new THREE.Vector3(xR, yT, 0), new THREE.Vector3(xR, yB, 0), new THREE.Vector3(xL, yB, 0));
    if (i < milestoneN) {
      revealIdx.push(pts.length - 1);
    }

    if (i < bands.length - 1) {
      const n = bands[i + 1];
      /* Orthogonal gutter: up/down along current left edge, then across to next TL */
      pts.push(new THREE.Vector3(xL, n.yT, 0));
      pts.push(new THREE.Vector3(n.xL, n.yT, 0));
    }
  }

  const lens = segmentLengths(pts);
  const totalLen = lens.reduce((a, b) => a + b, 0);
  const revealDist = revealIdx.map((vi) => distToVertexIndex(pts, vi));

  return { points: pts, revealDist, totalLen };
}

export function initFeaturesTimeline() {
  const canvas = document.getElementById('features-timeline-canvas');
  const track = document.querySelector('[data-features-timeline-track]');
  const cards = [...document.querySelectorAll('[data-feature-index]')];
  const ctaFrame = document.querySelector('[data-features-path-frame]');
  if (!canvas || !track) return () => {};

  let pathPoints = [];
  let totalLen = 0;
  let corners = [];
  let revealDist = [];
  const nFeat = cards.length;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  let aspect = 1;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x6a8a9c, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.45);
  key.position.set(0, 0, 8);
  scene.add(key);

  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x5dd4c4,
    transparent: true,
    opacity: 0.95,
  });
  const trailLine = new THREE.Line(lineGeo, lineMat);
  scene.add(trailLine);

  const jointGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x129079,
    emissive: 0x5dd4c4,
    emissiveIntensity: 0.45,
    metalness: 0.4,
    roughness: 0.35,
  });
  let joints = [];

  function clearJoints() {
    for (const m of joints) {
      scene.remove(m);
    }
    joints = [];
  }

  function makeJoints() {
    clearJoints();
    for (const vi of corners) {
      const m = new THREE.Mesh(jointGeo, jointMat);
      m.position.copy(pathPoints[vi]);
      scene.add(m);
      joints.push(m);
    }
  }

  const pulseGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0x5dd4c4,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  scene.add(pulse);

  const electronGeo = new THREE.SphereGeometry(0.11, 20, 20);
  const electronMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x5dd4c4,
    emissiveIntensity: 1.0,
    metalness: 0.25,
    roughness: 0.2,
  });
  const electron = new THREE.Mesh(electronGeo, electronMat);
  scene.add(electron);

  let progress = REDUCED ? 1 : 0;
  let raf = 0;
  let t0 = performance.now() / 1000;

  function readScrollProgress() {
    if (REDUCED) return 1;
    const rect = track.getBoundingClientRect();
    const range = track.offsetHeight - window.innerHeight;
    if (range <= 1) return 0;
    return Math.max(0, Math.min(1, -rect.top / range));
  }

  function updateFeatureStates(traveled) {
    cards.forEach((el, i) => {
      const revealed = i < revealDist.length && traveled >= revealDist[i] - 1e-4;
      el.classList.toggle('feature-card--revealed', revealed);
      let active = false;
      if (revealed && i < revealDist.length) {
        const nextT = i < revealDist.length - 1 ? revealDist[i + 1] : totalLen;
        active = traveled >= revealDist[i] && traveled < nextT;
      }
      if (i === nFeat - 1 && revealDist.length && traveled >= revealDist[nFeat - 1]) active = true;
      el.classList.toggle('feature-card--active', active);
      if (active) el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
    });
  }

  function layout() {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = Math.max(200, wrap.clientHeight || window.innerHeight * 0.5);
    if (w < 2 || h < 2) return;
    aspect = w / h;
    const frustum = 5.4;
    camera.left = (-frustum * aspect) / 2;
    camera.right = (frustum * aspect) / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);

    const pathFrames = ctaFrame ? [...cards, ctaFrame] : cards;
    const built = buildPathAroundFeatureFrames(pathFrames, canvas, camera, w, h, 12, 20, cards.length);
    pathPoints = built.points;
    totalLen = built.totalLen || 0;
    revealDist = built.revealDist;
    corners = cornerIndices(pathPoints);
    makeJoints();

    if (pathPoints.length < 2) {
      totalLen = 0;
    }
  }

  function tick(nowMs) {
    t0 = nowMs / 1000;
    if (!REDUCED) progress = readScrollProgress();

    if (pathPoints.length < 2 || totalLen < 1e-6) {
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
      return;
    }

    const traveled = progress * totalLen;
    const { point: head, tang } = samplePolyline(pathPoints, traveled);

    const verts = polylineVerticesTo(pathPoints, traveled);
    if (verts.length >= 6) {
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      lineGeo.computeBoundingSphere();
    } else {
      const p0 = pathPoints[0];
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, p0.x, p0.y, p0.z], 3));
    }

    electron.position.copy(head);
    pulse.position.copy(head);
    const pulseS = 1 + 0.15 * Math.sin(t0 * 4);
    pulse.scale.setScalar(pulseS);

    const jIntensity = 0.35 + 0.45 * Math.sin(t0 * 2);
    joints.forEach((m, j) => {
      const pj = pathPoints[corners[j]];
      if (!pj) return;
      const d = pj.distanceTo(head);
      const near = d < 0.45 ? 1 - d / 0.45 : 0;
      if (m.material && m.material.emissiveIntensity !== undefined) {
        m.material.emissiveIntensity = 0.35 + near * 0.85 + jIntensity * 0.08;
      }
    });

    const dir = Math.atan2(tang.y, tang.x);
    electron.rotation.z = dir + Math.PI / 2;
    electron.position.z = 0.02;

    updateFeatureStates(traveled);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  layout();
  const ro = new ResizeObserver(() => layout());
  ro.observe(canvas.parentElement);

  const onScroll = () => {
    if (REDUCED) return;
    progress = readScrollProgress();
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  requestAnimationFrame(() => layout());
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('scroll', onScroll);
    ro.disconnect();
    clearJoints();
    lineGeo.dispose();
    lineMat.dispose();
    jointGeo.dispose();
    jointMat.dispose();
    pulseGeo.dispose();
    pulseMat.dispose();
    electronGeo.dispose();
    electronMat.dispose();
    renderer.dispose();
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initFeaturesTimeline(), { once: true });
  } else {
    initFeaturesTimeline();
  }
}
