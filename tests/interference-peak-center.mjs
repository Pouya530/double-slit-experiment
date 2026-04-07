/**
 * Regression: at γ = 0 the double-slit PDF peaks at screen centre (z = 0).
 * Guards against sampling / buffer wiring bugs reported as a weak central fringe.
 */
import assert from 'node:assert/strict';
import { createParticleBuffer } from '../public/demo/simulation.js';

const SCREEN_DISTANCE = 2;
const SOURCE_X = -1.8;
const BARRIER_X = 0;
const PARTICLES = 3000;
const SEED = 12345;

/** Matches advanced demo defaults (nm). */
const PARAMS_BASE = {
  slitWidth: 100e-9,
  slitSeparation: 500e-9,
  wavelength: 550e-9,
  emissionRate: 60,
  screenDistance: SCREEN_DISTANCE,
  sourceX: SOURCE_X,
  barrierX: BARRIER_X,
  measurementGamma: 0,
};

function peakZBin(visibilityModel) {
  const buf = createParticleBuffer(
    { ...PARAMS_BASE, visibilityModel },
    PARTICLES,
    SEED
  );
  const binCount = 81;
  const screenHalfWidth = 2;
  const bins = new Array(binCount).fill(0);
  const { interferencePositions } = buf;
  for (let i = 0; i < buf.count; i++) {
    const iz = interferencePositions[i * 3 + 2];
    const b = Math.floor(((iz + screenHalfWidth) / (2 * screenHalfWidth)) * binCount);
    if (b >= 0 && b < binCount) bins[b]++;
  }
  let max = -1;
  let peak = -1;
  for (let j = 0; j < binCount; j++) {
    if (bins[j] > max) {
      max = bins[j];
      peak = j;
    }
  }
  let sumZ = 0;
  for (let i = 0; i < buf.count; i++) sumZ += interferencePositions[i * 3 + 2];
  return { peak, bins, meanZ: sumZ / buf.count };
}

const centreBin = 40; // z ≈ 0 for 81 bins on [-2, 2]

for (const visibilityModel of ['linear', 'exponential', 'quadratic']) {
  const { peak, meanZ } = peakZBin(visibilityModel);
  assert.equal(
    peak,
    centreBin,
    `γ=0 peak z-bin should be centre (${visibilityModel}, seed=${SEED})`
  );
  assert.ok(
    Math.abs(meanZ) < 0.06,
    `mean iz should be near 0 (${visibilityModel}): got ${meanZ}`
  );
}

console.log('interference-peak-center: ok (linear, exponential, quadratic, γ=0)');
