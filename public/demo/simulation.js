/**
 * Double Slit Simulation — Precompute particle buffer
 * Uses normalized params for clear visible pattern in 3D scene.
 */

import {
  mulberry32,
  gaussian,
  sampleInterferencePosition,
  sampleClassicalPosition,
} from './physics.js';

export function createParticleBuffer(params, maxParticles, seed) {
  const random = mulberry32(seed);
  const screenDistance = params.screenDistance ?? 2;
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

    const iz = sampleInterferencePosition(random, screenHalfWidth, L, dNorm, aNorm, lambdaNorm);
    const iy = (random() * 2 - 1) * screenHalfHeight * 0.3;
    interferencePositions[i * 3] = screenDistance;
    interferencePositions[i * 3 + 1] = iy;
    interferencePositions[i * 3 + 2] = iz;

    const cz = sampleClassicalPosition(random, slitSepScene, slitWidthScene);
    slitIndices[i] = cz < 0 ? 0 : 1;
    slitZ[i] = cz;
    slitY[i] = Math.max(-slitHalfHeight, Math.min(slitHalfHeight, gaussian(random) * (slitHalfHeight * 0.55)));
    classicalPositions[i * 3] = screenDistance;
    classicalPositions[i * 3 + 1] = interferencePositions[i * 3 + 1];
    classicalPositions[i * 3 + 2] = cz;
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
