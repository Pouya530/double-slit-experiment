/**
 * Interpretation-engine physics helpers — SPEC-INTERPRETATIONS.md §3
 */

import { fringeVisibility } from './physics.js?v=16';

/**
 * CSL-style spontaneous collapse suppression vs mass (simplified).
 * @param {number} massAmu - atomic mass units
 * @returns {number} 1 = full interference, 0 = classical
 */
export function collapseSuppressionFactor(massAmu) {
  const M_THRESHOLD = 1_000_000;
  const exponent = (massAmu / M_THRESHOLD) ** 2;
  return Math.exp(-exponent);
}

/**
 * Fringe visibility from environment coupling (exponential model — SPEC-MEASUREMENT §1.3).
 * @param {number} envCoupling 0..1
 * @returns {number} visibility 0..1
 */
export function decoherenceVisibility(envCoupling) {
  const c = Math.max(0, Math.min(1, envCoupling));
  return fringeVisibility(c, 'exponential');
}

/**
 * Effective de Broglie wavelength (m) or user photon wavelength.
 * @param {number} massAmu
 * @param {number} userWavelengthM - metres
 * @returns {number} metres
 */
export function effectiveWavelength(massAmu, userWavelengthM) {
  if (massAmu <= 0) return userWavelengthM;

  const AMU_TO_KG = 1.66054e-27;
  const H = 6.626e-34;
  const K_B = 1.381e-23;
  const T = 300;
  const massKg = massAmu * AMU_TO_KG;
  return H / Math.sqrt(3 * massKg * K_B * T);
}
