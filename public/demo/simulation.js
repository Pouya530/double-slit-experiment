/**
 * Double Slit Simulation — Precompute particle buffer
 * Uses normalized params for clear visible pattern in 3D scene.
 */

import {
  mulberry32,
  gaussian,
  sampleDecoherencePosition,
  sampleClassicalPosition,
} from './physics.js?v=17';

/** Smooth hermite edge blend (0 outside [e0,e1]). */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * @param {object} params
 * @param {number} [params.measurementGamma] 0..1
 * @param {'linear'|'quadratic'|'exponential'} [params.visibilityModel]
 * @param {number} [params.sourceX] Ray origin (scene x); default matches demo.
 * @param {number} [params.barrierX] Barrier plane x; default matches demo.
 */
export function createParticleBuffer(params, maxParticles, seed) {
  const random = mulberry32(seed);
  const measurementGamma = Math.max(0, Math.min(1, params.measurementGamma ?? 0));
  const visibilityModel = params.visibilityModel ?? 'quadratic';
  const screenDistance = params.screenDistance ?? 2;
  const sourceX = params.sourceX ?? -1.8;
  const barrierX = params.barrierX ?? 0;
  /** Geometric magnification of slit z onto screen (point source → slit → screen). */
  const dxBarrier = barrierX - sourceX;
  let zScale =
    Math.abs(dxBarrier) > 1e-9 ? (screenDistance - sourceX) / dxBarrier : (screenDistance - barrierX) / 1.8;
  if (!Number.isFinite(zScale) || zScale <= 0) zScale = 3.8 / 1.8;
  const screenHalfWidth = 2;
  const screenHalfHeight = 1.4;
  const L = 1.5;

  // Normalized params: tune for many visible fringes across the wide screen
  const slitSepNm = (params.slitSeparation || 5e-7) * 1e9;
  const slitWidthNm = (params.slitWidth || 1e-7) * 1e9;
  const lambdaNm = (params.wavelength || 5.5e-7) * 1e9;
  const dNorm = (slitSepNm / 100) * 1.5;
  const aNorm = (slitWidthNm / 50) * 0.6;
  const lambdaNorm = (lambdaNm / 200) * 1;

  const slitSepScene = 0.22;
  const slitWidthScene = 0.055;
  const slitHalfHeight = slitWidthScene * 0.75;

  /** Sequential births: default 60 ≈ one new particle per display frame with real-time dt. */
  const PARTICLES_PER_SECOND = Math.max(1, params.emissionRate ?? 60);
  const flightTail = 0.85;

  const birthTimes = new Float32Array(maxParticles);
  const interferencePositions = new Float32Array(maxParticles * 3);
  const classicalPositions = new Float32Array(maxParticles * 3);
  const slitIndices = new Uint8Array(maxParticles);
  const wavelengths = new Float32Array(maxParticles);
  const slitZ = new Float32Array(maxParticles);
  const slitY = new Float32Array(maxParticles);

  const tMax = (maxParticles - 1) / PARTICLES_PER_SECOND + flightTail;

  for (let i = 0; i < maxParticles; i++) {
    birthTimes[i] = i / PARTICLES_PER_SECOND;
    wavelengths[i] = lambdaNm;

    const cz = sampleClassicalPosition(random, slitSepScene, slitWidthScene);
    slitIndices[i] = cz < 0 ? 0 : 1;
    slitZ[i] = cz;
    slitY[i] = Math.max(-slitHalfHeight, Math.min(slitHalfHeight, gaussian(random) * (slitHalfHeight * 0.55)));

    /** Wave-like buildup: loose vertical spread on screen. */
    const iyQ = (random() * 2 - 1) * screenHalfHeight * 0.3;

    const zQ = sampleDecoherencePosition(
      random,
      screenHalfWidth,
      L,
      dNorm,
      aNorm,
      lambdaNorm,
      measurementGamma,
      visibilityModel
    );
    /**
     * Which-path limit: point source at sourceX → slit (cz, slitY) → screen.
     * Same magnification for transverse y and z so vertical slits image as tall, narrow stripes (narrow in z).
     * Width in z is already set by sampleClassicalPosition (Gaussian in slit plane); avoid large extra σ_z — it was smearing blobs.
     */
    const zGeom = cz * zScale;
    const yGeom = slitY * zScale;
    const slitImageHalfW = (slitWidthScene * 0.5) * zScale;
    const slitImageHalfH = slitHalfHeight * zScale;
    const lambdaRatio = (params.slitWidth || 1e-7) > 0 ? 5.5e-7 / (params.slitWidth || 1e-7) : 1;
    const diffractionZ = Math.min(
      slitImageHalfW * 0.22,
      0.004 + 0.0025 * lambdaRatio * (lambdaNm / 550)
    );
    const diffractionY = Math.min(slitImageHalfH * 0.12, diffractionZ * 1.8);
    const zClass = zGeom + gaussian(random) * diffractionZ;
    const iyClass = yGeom + gaussian(random) * diffractionY;
    const classicalMix = smoothstep(0.9, 1, measurementGamma);
    let iz = zQ * (1 - classicalMix) + zClass * classicalMix;
    let iy = iyQ * (1 - classicalMix) + iyClass * classicalMix;
    if (!Number.isFinite(iz)) iz = zQ;
    if (!Number.isFinite(iy)) iy = iyQ;
    iz = Math.max(-screenHalfWidth, Math.min(screenHalfWidth, iz));
    iy = Math.max(-screenHalfHeight, Math.min(screenHalfHeight, iy));

    interferencePositions[i * 3] = screenDistance;
    interferencePositions[i * 3 + 1] = iy;
    interferencePositions[i * 3 + 2] = iz;

    classicalPositions[i * 3] = screenDistance;
    classicalPositions[i * 3 + 1] = interferencePositions[i * 3 + 1];
    classicalPositions[i * 3 + 2] = iz;
  }

  const indices = Array.from({ length: maxParticles }, (_, i) => i);
  indices.sort((a, b) => birthTimes[a] - birthTimes[b]);

  const sortedBirthTimes = new Float32Array(maxParticles);
  const sortedInterference = new Float32Array(maxParticles * 3);
  const sortedClassical = new Float32Array(maxParticles * 3);
  const sortedSlitIndices = new Uint8Array(maxParticles);
  const sortedWavelengths = new Float32Array(maxParticles);
  const sortedSlitZ = new Float32Array(maxParticles);
  const sortedSlitY = new Float32Array(maxParticles);

  for (let i = 0; i < maxParticles; i++) {
    const src = indices[i];
    sortedBirthTimes[i] = birthTimes[src];
    sortedSlitIndices[i] = slitIndices[src];
    sortedWavelengths[i] = wavelengths[src];
    sortedSlitZ[i] = slitZ[src];
    sortedSlitY[i] = slitY[src];
    for (let k = 0; k < 3; k++) {
      sortedInterference[i * 3 + k] = interferencePositions[src * 3 + k];
      sortedClassical[i * 3 + k] = classicalPositions[src * 3 + k];
    }
  }

  return {
    birthTimes: sortedBirthTimes,
    interferencePositions: sortedInterference,
    classicalPositions: sortedClassical,
    slitIndices: sortedSlitIndices,
    slitZ: sortedSlitZ,
    slitY: sortedSlitY,
    wavelengths: sortedWavelengths,
    count: maxParticles,
    tMax,
    screenDistance,
  };
}
