/**
 * Per-interpretation measurement copy & preferences — SPEC-MEASUREMENT.md §3
 */

export const MEASUREMENT_CONFIGS = {
  copenhagen: {
    sliderLabel: 'Observation strength',
    sliderDescription: 'How strongly the measuring device interacts with the particle',
    narrativeAtZero:
      'No measurement is made. The particle exists as a wave — passing through both slits simultaneously. The wave function is a complete description of reality.',
    narrativeAtHalf:
      "A weak measurement is made. The wave function partially collapses — we gain some which-path information but not enough to fully determine the slit. The interference pattern fades but doesn't vanish.",
    narrativeAtOne:
      'A strong measurement determines which slit the particle passed through. The wave function collapses. The particle was always going through one slit — we just did not know which until we looked.',
    preferredVisModel: 'linear',
    showEnvironmentParticles: false,
    showDetectorGlow: true,
  },
  manyWorlds: {
    sliderLabel: 'Entanglement strength',
    sliderDescription: 'How strongly the detector becomes entangled with the particle',
    narrativeAtZero:
      'The detector is decoupled. Both branches of the wave function contribute to a single interference pattern in this branch of the multiverse.',
    narrativeAtHalf:
      "The detector partially entangles with the particle. The universe is beginning to branch — but the branches haven't fully separated. You are seeing a superposition of worlds bleeding together.",
    narrativeAtOne:
      'The detector is fully entangled. The universe has branched: in one branch, the particle went left; in the other, it went right. You only see one branch.',
    preferredVisModel: 'quadratic',
    showEnvironmentParticles: false,
    showDetectorGlow: false,
  },
  bohmian: {
    sliderLabel: 'Detector coupling',
    sliderDescription: "How strongly the detector's pilot wave disturbs the guiding field",
    narrativeAtZero:
      'The particle always goes through exactly one slit — it has a definite trajectory. But the pilot wave goes through both, creating the guiding field that steers particles into the interference pattern.',
    narrativeAtHalf:
      "The detector's own pilot wave disrupts the guiding field near the slits. Trajectories are being deflected — some are pushed out of the interference minima.",
    narrativeAtOne:
      "The detector's pilot wave overwhelms the interference structure of the guiding field. The classical pattern emerges — not because anything collapsed, but because the guide changed.",
    preferredVisModel: 'quadratic',
    showEnvironmentParticles: false,
    showDetectorGlow: true,
  },
  decoherence: {
    sliderLabel: 'Environment coupling',
    sliderDescription: 'How many environment degrees of freedom interact with the system near the slits',
    narrativeAtZero:
      'The experiment is in perfect isolation. No stray coupling. Quantum coherence between the two paths is preserved.',
    narrativeAtHalf:
      'Environment scattering carries which-path information into the surroundings. Coherence terms decay. The pattern fades — not because of observation, but because information has leaked.',
    narrativeAtOne:
      'The environment has fully decohered the system. Which-path information is spread across many environmental degrees of freedom. Classical statistics emerge via irreversible information loss.',
    preferredVisModel: 'exponential',
    showEnvironmentParticles: true,
    showDetectorGlow: false,
  },
  qbism: {
    sliderLabel: 'Information gained',
    sliderDescription: 'How much your beliefs about which slit update based on the measurement',
    narrativeAtZero:
      'You have made no measurement. Your beliefs about the path are maximally uncertain — equal probability for both slits.',
    narrativeAtHalf:
      "You've gained partial information. Your beliefs have updated — but you are not certain, so your expected pattern blends interference and classical.",
    narrativeAtOne:
      'You are now certain which slit the particle traversed. The interference pattern is gone from your perspective — because you no longer expect it.',
    preferredVisModel: 'linear',
    showEnvironmentParticles: false,
    showDetectorGlow: false,
  },
  rqm: {
    sliderLabel: 'Interaction strength',
    sliderDescription: 'The strength of the physical interaction between detector and particle',
    narrativeAtZero:
      'Relative to the detector, no interaction has occurred. Interference is visible because no which-path facts are established.',
    narrativeAtHalf:
      'A partial interaction establishes partial relational facts. Descriptions can differ for different subsystems.',
    narrativeAtOne:
      'The interaction is complete. Relative to the detector, the particle has a definite path.',
    preferredVisModel: 'quadratic',
    showEnvironmentParticles: false,
    showDetectorGlow: true,
  },
  objectiveCollapse: {
    sliderLabel: 'System mass / complexity',
    sliderDescription: 'Spontaneous localization scale (toy model via mass slider)',
    narrativeAtZero: 'Tiny, isolated system — interference largely unaffected.',
    narrativeAtHalf: 'Mesoscopic regime — localization begins to compete with coherence.',
    narrativeAtOne: 'Macroscopic regime — classical pattern dominates in this toy model.',
    preferredVisModel: 'exponential',
    showEnvironmentParticles: false,
    showDetectorGlow: true,
  },
  orchOR: {
    sliderLabel: 'Gravitational scale',
    sliderDescription: 'Objective reduction scale (toy model via mass slider)',
    narrativeAtZero: 'Below effective threshold — coherence maintained in this illustration.',
    narrativeAtHalf: 'Approaching threshold — reduction becomes likely.',
    narrativeAtOne: 'Strong localization — which-path effectively resolved (illustrative).',
    preferredVisModel: 'exponential',
    showEnvironmentParticles: false,
    showDetectorGlow: true,
  },
  vonNeumannWigner: {
    sliderLabel: 'Conscious awareness',
    sliderDescription: 'Historical framing: degree of conscious record (pedagogical only)',
    narrativeAtZero: 'No conscious record in this stylized account — interference remains.',
    narrativeAtHalf: 'Partial record — partial which-path information.',
    narrativeAtOne: 'Full conscious record in this stylized account — pattern resembles classical.',
    preferredVisModel: 'linear',
    showEnvironmentParticles: false,
    showDetectorGlow: false,
  },
  hoffman: {
    sliderLabel: 'Interface activation',
    sliderDescription: 'How strongly the perceptual interface resolves which-path (metaphor)',
    narrativeAtZero: 'Interface not resolving path — interference-style statistics.',
    narrativeAtHalf: 'Partial resolution — blended pattern.',
    narrativeAtOne: 'Full resolution — classical-style statistics in the interface metaphor.',
    preferredVisModel: 'linear',
    showEnvironmentParticles: false,
    showDetectorGlow: false,
  },
};

/** Classic demo tab ids → advanced interpretation keys */
export const CLASSIC_INTERP_TO_CONFIG_KEY = {
  copenhagen: 'copenhagen',
  'many-worlds': 'manyWorlds',
  'pilot-wave': 'bohmian',
  decoherence: 'decoherence',
  qbism: 'qbism',
};

export function narrativeForGamma(gamma, config) {
  if (!config) return '';
  const g = Math.max(0, Math.min(1, gamma));
  if (g < 1 / 3) return config.narrativeAtZero;
  if (g < 2 / 3) return config.narrativeAtHalf;
  return config.narrativeAtOne;
}
