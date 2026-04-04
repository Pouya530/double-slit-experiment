/**
 * Double Slit Physics — Interference & sampling (SPEC.md / AGENTS.md)
 */

export {
  intensity,
  mulberry32,
  gaussian,
  sampleInterferencePosition,
  sampleClassicalPosition,
  wavelengthToRGB,
};

function intensity(theta, d, a, lambda) {
  const alpha = (Math.PI * a * Math.sin(theta)) / lambda;
  const beta = (Math.PI * d * Math.sin(theta)) / lambda;
  const sinc = alpha === 0 ? 1 : Math.sin(alpha) / alpha;
  return Math.cos(beta) ** 2 * sinc ** 2;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u1 = random();
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Rejection sampling — use normalized params for visible pattern in scene units */
function sampleInterferencePosition(random, screenHalfWidth, L, dNorm, aNorm, lambdaNorm) {
  let attempts = 0;
  const maxAttempts = 5000;
  while (attempts++ < maxAttempts) {
    const z = (random() * 2 - 1) * screenHalfWidth;
    const theta = Math.atan2(z, L);
    const I_val = intensity(theta, dNorm, aNorm, lambdaNorm);
    const I_max = 1.0;
    if (random() <= I_val / I_max) return z;
  }
  return (random() * 2 - 1) * screenHalfWidth;
}

function sampleClassicalPosition(random, slitSeparation, slitWidth) {
  const slit0 = -slitSeparation / 2;
  const slit1 = slitSeparation / 2;
  const sigma = slitWidth * 0.8;
  const which = random() < 0.5 ? 0 : 1;
  const mu = which === 0 ? slit0 : slit1;
  return mu + sigma * gaussian(random);
}

function wavelengthToRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) {
    r = (nm - 380) / 60;
  } else if (nm >= 440 && nm < 490) {
    r = 0;
    g = (nm - 440) / 50;
  } else if (nm >= 490 && nm < 510) {
    r = 0;
    g = 1;
    b = (nm - 490) / 20;
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
    b = 0;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = (645 - nm) / 65;
    b = 0;
  } else if (nm >= 645 && nm <= 700) {
    r = 1;
    g = 0;
    b = (700 - nm) / 55;
  } else {
    r = g = b = 0.5;
  }
  const factor = nm >= 420 && nm <= 700 ? 1 : nm >= 380 ? 0.3 + (0.7 * (nm - 380)) / 40 : 0.3;
  return [Math.min(1, r * factor), Math.min(1, g * factor), Math.min(1, b * factor)];
}
