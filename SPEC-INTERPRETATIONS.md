# SPEC-INTERPRETATIONS.md — Interpretation Engine Addendum

> **Purpose**: Technical specification for expanding the Double Slit simulation with a multi-interpretation engine. This document is a drop-in addendum to the existing SPEC.md and CONTEXT.md. It defines new parameters, data models, components, shaders, and state that transform the binary observer toggle into a full interpretation exploration system.
>
> **Integration**: Agents should read SPEC.md first, then this addendum. Where this document conflicts with SPEC.md, this document takes precedence for interpretation-related features.

---

## 1. ARCHITECTURAL OVERVIEW

The existing simulation has a binary observer toggle: ON (classical two-band pattern) / OFF (interference pattern). The Interpretation Engine replaces this with a layered system:

```
┌───────────────────────────────────────────────────────┐
│               INTERPRETATION ENGINE                    │
│                                                        │
│  ┌─────────────────┐   ┌───────────────────────────┐  │
│  │  Interpretation  │   │    Extended Parameters     │  │
│  │  Selector        │──►│                            │  │
│  │  (10 options)    │   │  - particleMass (new)     │  │
│  │                  │   │  - envCoupling (new)      │  │
│  └─────────────────┘   │  - perspective (new)      │  │
│           │             │  - slitWidth (existing)    │  │
│           ▼             │  - slitSep (existing)      │  │
│  ┌─────────────────┐   │  - wavelength (existing)   │  │
│  │  Narrative       │   └───────────┬───────────────┘  │
│  │  Engine          │               │                  │
│  │  (i18n text)     │               ▼                  │
│  └─────────────────┘   ┌───────────────────────────┐  │
│                         │  Physics Engine Switch     │  │
│                         │                            │  │
│                         │  Standard QM path (9/10)   │  │
│                         │  ObjCollapse path (1/10)   │  │
│                         │  Decoherence path (cont.)  │  │
│                         └───────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

**Key design principle**: 9 out of 10 interpretations produce identical experimental predictions for the double-slit. They differ only in the *narrative* — the explanatory text that accompanies the same visual. Only **Objective Collapse** and **Decoherence** produce visually distinct behaviour via new parameters (particle mass and environment coupling). This means the physics engine branching is minimal — the complexity is in the narrative and UI layer, not the simulation core.

---

## 2. NEW DATA MODELS

### 2.1 Interpretation Type System

```typescript
// types/interpretation.ts

/**
 * The 10 interpretation identities.
 * Ordered by 2025 Nature survey popularity (descending).
 */
type InterpretationId =
  | 'copenhagen'        // 36% — default
  | 'qbism'             // ~17%
  | 'manyWorlds'        // ~15%
  | 'decoherence'       // mainstream (mechanism, not interpretation per se)
  | 'bohmian'           // 7%
  | 'rqm'              // emerging
  | 'objectiveCollapse' // serious minority
  | 'orchOR'            // emerging minority
  | 'vonNeumannWigner'  // fringe/historical
  | 'hoffman'           // speculative

type InterpretationCategory =
  | 'mainstream'        // copenhagen, decoherence
  | 'serious_minority'  // qbism, manyWorlds, bohmian, rqm, objectiveCollapse
  | 'emerging'          // orchOR
  | 'fringe'            // vonNeumannWigner, hoffman

/**
 * Full interpretation definition — drives UI, narrative, and physics branching.
 */
interface InterpretationDef {
  id: InterpretationId;
  nameKey: string;                    // i18n key: 'interpretation.copenhagen.name'
  shortNameKey: string;               // i18n key: 'interpretation.copenhagen.short' (for compact UI)
  category: InterpretationCategory;
  surveyPercent: number | null;       // 2025 Nature survey result, null if not surveyed
  keyFigures: string[];               // ['Niels Bohr', 'Werner Heisenberg']

  /** What the observer toggle means under this interpretation */
  observerMeaningKey: string;         // i18n key for the toggle tooltip

  /** Narrative text shown when observation state changes */
  collapseNarrativeKey: string;       // i18n: displayed when user toggles observer ON
  noCollapseNarrativeKey: string;     // i18n: displayed when user toggles observer OFF

  /** Whether this interpretation produces different physics output */
  physicsVariant: 'standard' | 'massDependent' | 'environmentGradient';

  /** Which new parameters are relevant (enabled in UI) for this interpretation */
  relevantParams: Array<'particleMass' | 'envCoupling' | 'perspective'>;

  /** Whether interpretation uses the binary observer toggle or replaces it */
  observerToggleMode: 'binary' | 'slider' | 'perspective' | 'disabled';

  /** A-level summary (i18n key) — 2-3 sentences for info card */
  summaryKey: string;

  /** Academic status badge */
  statusBadgeKey: string;            // i18n: 'status.mainstream', 'status.emerging', etc.

  /** Colour accent for UI theming per interpretation */
  accentColour: string;              // hex, used for the interpretation badge
}
```

### 2.2 Extended Experiment Parameters

```typescript
// Extends ExperimentParams from SPEC.md Section 2.1

interface ExtendedExperimentParams extends ExperimentParams {
  /**
   * Particle mass in atomic mass units (amu / Daltons).
   * Electron = 0.00055 amu, Photon = 0, C₆₀ = 720 amu, Nanoparticle = 10⁶+ amu.
   *
   * Relevant for: objectiveCollapse, orchOR, decoherence
   * Standard QM: mass affects de Broglie wavelength but not collapse behaviour
   * Objective collapse: above ~10⁶ amu, spontaneous localisation suppresses fringes
   *
   * Range: 0.00055 (electron) to 10⁸ (nanoparticle)
   * UI display: logarithmic slider with labelled presets
   * Default: 0.00055 (electron)
   */
  particleMass: number;

  /**
   * Environment coupling strength (decoherence rate).
   * 0.0 = perfectly isolated (full interference)
   * 1.0 = fully decohered (no interference, classical limit)
   *
   * Relevant for: decoherence (primary), all others (educational contrast)
   * This parameter implements γ in the master equation:
   *   dρ/dt = -i[H,ρ]/ℏ + γ·D[ρ]
   * where D is the decoherence superoperator.
   *
   * In practice: interpolates between interference pattern and classical pattern
   * with smooth, physically-motivated fringe decay.
   *
   * Range: 0.0 to 1.0
   * UI display: horizontal slider labelled "Environment Coupling"
   * Default: 0.0 (isolated)
   */
  envCoupling: number;

  /**
   * Observer perspective for RQM mode.
   * 'particle' = from the particle's reference frame (always definite)
   * 'detector' = from the detector's frame (definite after interaction)
   * 'external' = from an external observer (system + detector in superposition)
   *
   * Relevant for: rqm only
   * Default: 'external'
   */
  perspective: 'particle' | 'detector' | 'external';

  /**
   * Active interpretation — drives narrative layer and physics branching.
   * Default: 'copenhagen'
   */
  activeInterpretation: InterpretationId;
}

/** Presets for the mass slider — labelled ticks the user can snap to */
const MASS_PRESETS: Array<{ label: string; labelKey: string; mass: number }> = [
  { label: 'Photon',       labelKey: 'mass.photon',       mass: 0 },
  { label: 'Electron',     labelKey: 'mass.electron',     mass: 0.00055 },
  { label: 'Neutron',      labelKey: 'mass.neutron',      mass: 1.009 },
  { label: 'Atom (Na)',    labelKey: 'mass.atom_na',      mass: 23 },
  { label: 'C₆₀',         labelKey: 'mass.c60',          mass: 720 },
  { label: 'Protein',      labelKey: 'mass.protein',      mass: 25_000 },
  { label: 'Virus',        labelKey: 'mass.virus',        mass: 10_000_000 },
  { label: 'Nanoparticle', labelKey: 'mass.nanoparticle', mass: 100_000_000 },
];

const DEFAULT_EXTENDED_PARAMS: ExtendedExperimentParams = {
  // ...existing defaults from SPEC.md...
  slitWidth: 1e-7,
  slitSeparation: 5e-7,
  wavelength: 5.5e-7,
  emissionRate: 100,
  screenDistance: 1.0,
  slitMode: 'double',
  // New params
  particleMass: 0.00055,
  envCoupling: 0.0,
  perspective: 'external',
  activeInterpretation: 'copenhagen',
};
```

### 2.3 Interpretation Registry

```typescript
// lib/interpretations.ts

/**
 * Master registry of all 10 interpretations.
 * This is the single source of truth for interpretation metadata.
 * All i18n keys reference messages/{locale}.json.
 */
const INTERPRETATIONS: Record<InterpretationId, InterpretationDef> = {
  copenhagen: {
    id: 'copenhagen',
    nameKey: 'interp.copenhagen.name',
    shortNameKey: 'interp.copenhagen.short',
    category: 'mainstream',
    surveyPercent: 36,
    keyFigures: ['Niels Bohr', 'Werner Heisenberg'],
    observerMeaningKey: 'interp.copenhagen.observer',
    collapseNarrativeKey: 'interp.copenhagen.collapse',
    noCollapseNarrativeKey: 'interp.copenhagen.noCollapse',
    physicsVariant: 'standard',
    relevantParams: [],
    observerToggleMode: 'binary',
    summaryKey: 'interp.copenhagen.summary',
    statusBadgeKey: 'status.mainstream',
    accentColour: '#2F5496',
  },
  qbism: {
    id: 'qbism',
    nameKey: 'interp.qbism.name',
    shortNameKey: 'interp.qbism.short',
    category: 'serious_minority',
    surveyPercent: 17,
    keyFigures: ['Christopher Fuchs', 'Rüdiger Schack', 'John DeBrota'],
    observerMeaningKey: 'interp.qbism.observer',
    collapseNarrativeKey: 'interp.qbism.collapse',
    noCollapseNarrativeKey: 'interp.qbism.noCollapse',
    physicsVariant: 'standard',
    relevantParams: [],
    observerToggleMode: 'binary',
    summaryKey: 'interp.qbism.summary',
    statusBadgeKey: 'status.emerging',
    accentColour: '#E67E22',
  },
  manyWorlds: {
    id: 'manyWorlds',
    nameKey: 'interp.manyWorlds.name',
    shortNameKey: 'interp.manyWorlds.short',
    category: 'serious_minority',
    surveyPercent: 15,
    keyFigures: ['Hugh Everett III', 'Sean Carroll', 'David Wallace'],
    observerMeaningKey: 'interp.manyWorlds.observer',
    collapseNarrativeKey: 'interp.manyWorlds.collapse',
    noCollapseNarrativeKey: 'interp.manyWorlds.noCollapse',
    physicsVariant: 'standard',
    relevantParams: [],
    observerToggleMode: 'binary',
    summaryKey: 'interp.manyWorlds.summary',
    statusBadgeKey: 'status.serious_minority',
    accentColour: '#8E44AD',
  },
  decoherence: {
    id: 'decoherence',
    nameKey: 'interp.decoherence.name',
    shortNameKey: 'interp.decoherence.short',
    category: 'mainstream',
    surveyPercent: null,
    keyFigures: ['Wojciech Zurek', 'Maximilian Schlosshauer', 'H. Dieter Zeh'],
    observerMeaningKey: 'interp.decoherence.observer',
    collapseNarrativeKey: 'interp.decoherence.collapse',
    noCollapseNarrativeKey: 'interp.decoherence.noCollapse',
    physicsVariant: 'environmentGradient',
    relevantParams: ['envCoupling', 'particleMass'],
    observerToggleMode: 'slider',
    summaryKey: 'interp.decoherence.summary',
    statusBadgeKey: 'status.mainstream',
    accentColour: '#27AE60',
  },
  bohmian: {
    id: 'bohmian',
    nameKey: 'interp.bohmian.name',
    shortNameKey: 'interp.bohmian.short',
    category: 'serious_minority',
    surveyPercent: 7,
    keyFigures: ['David Bohm', 'John Bell', 'Detlef Dürr'],
    observerMeaningKey: 'interp.bohmian.observer',
    collapseNarrativeKey: 'interp.bohmian.collapse',
    noCollapseNarrativeKey: 'interp.bohmian.noCollapse',
    physicsVariant: 'standard',
    relevantParams: [],
    observerToggleMode: 'binary',
    summaryKey: 'interp.bohmian.summary',
    statusBadgeKey: 'status.serious_minority',
    accentColour: '#2980B9',
  },
  rqm: {
    id: 'rqm',
    nameKey: 'interp.rqm.name',
    shortNameKey: 'interp.rqm.short',
    category: 'serious_minority',
    surveyPercent: null,
    keyFigures: ['Carlo Rovelli', 'Emily Adlam'],
    observerMeaningKey: 'interp.rqm.observer',
    collapseNarrativeKey: 'interp.rqm.collapse',
    noCollapseNarrativeKey: 'interp.rqm.noCollapse',
    physicsVariant: 'standard',
    relevantParams: ['perspective'],
    observerToggleMode: 'perspective',
    summaryKey: 'interp.rqm.summary',
    statusBadgeKey: 'status.emerging',
    accentColour: '#16A085',
  },
  objectiveCollapse: {
    id: 'objectiveCollapse',
    nameKey: 'interp.objectiveCollapse.name',
    shortNameKey: 'interp.objectiveCollapse.short',
    category: 'serious_minority',
    surveyPercent: null,
    keyFigures: ['Angelo Bassi', 'Lajos Diósi', 'GianCarlo Ghirardi'],
    observerMeaningKey: 'interp.objectiveCollapse.observer',
    collapseNarrativeKey: 'interp.objectiveCollapse.collapse',
    noCollapseNarrativeKey: 'interp.objectiveCollapse.noCollapse',
    physicsVariant: 'massDependent',
    relevantParams: ['particleMass'],
    observerToggleMode: 'disabled',
    summaryKey: 'interp.objectiveCollapse.summary',
    statusBadgeKey: 'status.serious_minority',
    accentColour: '#C0392B',
  },
  orchOR: {
    id: 'orchOR',
    nameKey: 'interp.orchOR.name',
    shortNameKey: 'interp.orchOR.short',
    category: 'emerging',
    surveyPercent: null,
    keyFigures: ['Roger Penrose', 'Stuart Hameroff'],
    observerMeaningKey: 'interp.orchOR.observer',
    collapseNarrativeKey: 'interp.orchOR.collapse',
    noCollapseNarrativeKey: 'interp.orchOR.noCollapse',
    physicsVariant: 'massDependent',
    relevantParams: ['particleMass'],
    observerToggleMode: 'disabled',
    summaryKey: 'interp.orchOR.summary',
    statusBadgeKey: 'status.emerging',
    accentColour: '#F39C12',
  },
  vonNeumannWigner: {
    id: 'vonNeumannWigner',
    nameKey: 'interp.vonNeumannWigner.name',
    shortNameKey: 'interp.vonNeumannWigner.short',
    category: 'fringe',
    surveyPercent: null,
    keyFigures: ['John von Neumann', 'Eugene Wigner', 'Henry Stapp'],
    observerMeaningKey: 'interp.vonNeumannWigner.observer',
    collapseNarrativeKey: 'interp.vonNeumannWigner.collapse',
    noCollapseNarrativeKey: 'interp.vonNeumannWigner.noCollapse',
    physicsVariant: 'standard',
    relevantParams: [],
    observerToggleMode: 'binary',
    summaryKey: 'interp.vonNeumannWigner.summary',
    statusBadgeKey: 'status.fringe',
    accentColour: '#95A5A6',
  },
  hoffman: {
    id: 'hoffman',
    nameKey: 'interp.hoffman.name',
    shortNameKey: 'interp.hoffman.short',
    category: 'fringe',
    surveyPercent: null,
    keyFigures: ['Donald Hoffman', 'Chetan Prakash'],
    observerMeaningKey: 'interp.hoffman.observer',
    collapseNarrativeKey: 'interp.hoffman.collapse',
    noCollapseNarrativeKey: 'interp.hoffman.noCollapse',
    physicsVariant: 'standard',
    relevantParams: [],
    observerToggleMode: 'binary',
    summaryKey: 'interp.hoffman.summary',
    statusBadgeKey: 'status.speculative',
    accentColour: '#D35400',
  },
};
```

---

## 3. EXTENDED PHYSICS ENGINE

### 3.1 Standard Path (9 interpretations)

For Copenhagen, QBism, Many-Worlds, Bohmian, RQM, Von Neumann-Wigner, Hoffman, IIT, and Orch-OR (at electron mass), the physics is **identical** to the existing SPEC.md implementation:

- Observer OFF → interference pattern: `I(θ) = I₀ × cos²(πd·sin(θ)/λ) × sinc²(πa·sin(θ)/λ)`
- Observer ON → classical pattern: `P(x) = 0.5 × N(x; μ₁, σ) + 0.5 × N(x; μ₂, σ)`
- Transition lerp over ~1 second

The difference is purely narrative — different explanatory text for why the same pattern change occurs.

### 3.2 Mass-Dependent Collapse (Objective Collapse & Orch-OR)

When `activeInterpretation` is `objectiveCollapse` or `orchOR`, the observer toggle is disabled. Instead, the particle mass drives a **spontaneous collapse factor** that continuously modulates the interference pattern:

```typescript
// lib/physics.ts — NEW FUNCTION

/**
 * Compute the CSL/Diósi-Penrose spontaneous collapse suppression factor.
 *
 * As particle mass increases, the interference visibility decays:
 *   V(m) = exp(-Γ(m) × t_flight)
 *
 * where Γ(m) is the collapse rate, proportional to m² for CSL
 * and proportional to m^(5/3) for Diósi-Penrose.
 *
 * For the simulation, we use a simplified parameterisation:
 *   suppressionFactor = exp(-(m / m_threshold)^2)
 *
 * where m_threshold ≈ 10⁶ amu is the crossover mass.
 * Below this, suppression is negligible (factor ≈ 1.0).
 * Above this, fringes fade exponentially.
 *
 * @param massAmu - particle mass in atomic mass units
 * @returns 0.0 (fully collapsed, no fringes) to 1.0 (full interference)
 */
function collapseSuppressionFactor(massAmu: number): number {
  const M_THRESHOLD = 1_000_000; // 10⁶ amu crossover
  const exponent = (massAmu / M_THRESHOLD) ** 2;
  return Math.exp(-exponent);
}
```

The suppression factor is applied to the interference pattern intensity:

```
I_effective(θ) = suppressionFactor × I_interference(θ) + (1 - suppressionFactor) × I_classical(θ)
```

This means at electron mass (0.00055 amu), `suppressionFactor ≈ 1.0` → full interference. At nanoparticle mass (10⁸ amu), `suppressionFactor ≈ 0.0` → pure classical. The transition is smooth and continuous — the user drags the mass slider and watches fringes gradually disappear.

**Worker impact**: The mass parameter must be passed to the Web Worker. The `COMPUTE` message adds `particleMass: number`. For each particle, the final position is interpolated: `finalPos = lerp(interferencePos, classicalPos, 1 - suppressionFactor)`.

### 3.3 Environment Coupling Gradient (Decoherence)

When `activeInterpretation` is `decoherence`, the observer toggle is replaced by a continuous `envCoupling` slider (0.0 to 1.0):

```typescript
// lib/physics.ts — NEW FUNCTION

/**
 * Compute decoherence-suppressed interference visibility.
 *
 * The off-diagonal elements of the density matrix decay as:
 *   ρ_off(t) = ρ_off(0) × exp(-γ × t)
 *
 * where γ is the decoherence rate, proportional to envCoupling.
 * Interference visibility V = |ρ_off| / ρ_diag.
 *
 * Simplified for the simulation:
 *   visibility = (1 - envCoupling)^2
 *
 * Quadratic gives a more physical feel than linear — weak coupling
 * barely affects fringes, strong coupling destroys them rapidly.
 *
 * @param envCoupling - 0.0 (isolated) to 1.0 (fully decohered)
 * @returns 0.0 (no interference) to 1.0 (full interference)
 */
function decoherenceVisibility(envCoupling: number): number {
  return (1 - envCoupling) ** 2;
}
```

Applied identically to the collapse suppression factor:
```
I_effective(θ) = visibility × I_interference(θ) + (1 - visibility) × I_classical(θ)
```

### 3.4 De Broglie Wavelength from Mass

When `particleMass > 0`, the effective wavelength for the interference pattern should be computed from de Broglie:

```typescript
/**
 * Compute de Broglie wavelength for a massive particle.
 *
 * λ = h / p = h / (m × v)
 *
 * For the simulation, we use a reference velocity (thermal at 300K):
 *   v = sqrt(3kT / m)  →  λ = h / sqrt(3mkT)
 *
 * This automatically narrows the fringe spacing for heavier particles,
 * which is physically correct and visually dramatic.
 *
 * For photons (mass = 0), use the user-set wavelength directly.
 *
 * @param massAmu - mass in amu (0 = photon)
 * @param userWavelength - user-set wavelength for photons
 * @returns effective wavelength in metres
 */
function effectiveWavelength(massAmu: number, userWavelength: number): number {
  if (massAmu <= 0) return userWavelength;

  const AMU_TO_KG = 1.66054e-27;
  const H = 6.626e-34;       // Planck constant
  const K_B = 1.381e-23;     // Boltzmann constant
  const T = 300;              // Room temperature

  const massKg = massAmu * AMU_TO_KG;
  return H / Math.sqrt(3 * massKg * K_B * T);
}
```

---

## 4. EXTENDED ZUSTAND STORE

Add to the existing `SimulationStore` from SPEC.md Section 2.3:

```typescript
interface SimulationStore {
  // ... existing fields from SPEC.md ...

  // ─── Interpretation Engine (NEW) ──────────────────────
  activeInterpretation: InterpretationId;
  particleMass: number;               // amu, default 0.00055
  envCoupling: number;                // 0.0–1.0, default 0.0
  perspective: 'particle' | 'detector' | 'external';

  /** Derived: current suppression factor (from mass or env coupling) */
  fringeVisibility: number;           // 0.0–1.0, computed

  /** Whether the observer toggle is active for the current interpretation */
  observerToggleEnabled: boolean;     // derived from interpretation def

  // ─── New Actions ──────────────────────────────────────
  setInterpretation: (id: InterpretationId) => void;
  setParticleMass: (mass: number) => void;
  setEnvCoupling: (coupling: number) => void;
  setPerspective: (p: 'particle' | 'detector' | 'external') => void;
}

// Derived state computed in selectors:
// fringeVisibility = depends on activeInterpretation:
//   - objectiveCollapse, orchOR: collapseSuppressionFactor(particleMass)
//   - decoherence: decoherenceVisibility(envCoupling)
//   - all others: isObserving ? 0.0 : 1.0 (binary, from existing toggle)
```

### Interpretation Change Side Effects

When `setInterpretation` is called:

1. Enable/disable the observer toggle based on `interpretation.observerToggleMode`
2. Show/hide mass slider based on `interpretation.relevantParams.includes('particleMass')`
3. Show/hide environment slider based on `interpretation.relevantParams.includes('envCoupling')`
4. Show/hide perspective selector based on `interpretation.relevantParams.includes('perspective')`
5. Reset `envCoupling` to 0.0 if switching away from decoherence
6. Reset `perspective` to 'external' if switching away from RQM
7. Fire `A11yAnnouncer` with interpretation name and summary
8. Track analytics event: `interpretation_changed`
9. Update URL state with `interp=` param
10. Trigger narrative text update

---

## 5. NEW COMPONENT SPECIFICATIONS

### 5.1 InterpretationSelector.tsx

```typescript
/**
 * Dropdown / pill selector for choosing the active interpretation.
 * Positioned in the UI overlay, above the parameter panel.
 *
 * Layout: Horizontal scrollable pill bar (mobile) or dropdown (desktop).
 * Each pill shows:
 *   - Short name (e.g., "Copenhagen", "QBism", "Many-Worlds")
 *   - Accent colour dot
 *   - Survey % badge where available (e.g., "36%")
 *   - Category badge: "Mainstream" / "Emerging" / "Fringe"
 *
 * On selection:
 *   - Fire setInterpretation(id)
 *   - Animate accent colour transition on the entire UI chrome
 *   - Display interpretation info card (auto-dismiss after 5s or on tap)
 *
 * Accessibility:
 *   - <select> with aria-label={t('interpretation.selector.label')}
 *   - Each option includes category in aria-description
 *   - A11yAnnouncer: "Switched to Many-Worlds interpretation — 15% of physicists"
 *
 * Grouping:
 *   Mainstream → Serious Minority → Emerging → Fringe
 *   Within groups, ordered by survey % (descending)
 *
 * Museum mode: Hidden. Museum mode locks to Copenhagen.
 */
```

### 5.2 MassSlider.tsx

```typescript
/**
 * Logarithmic slider for particle mass.
 * Only visible when activeInterpretation.relevantParams includes 'particleMass'.
 *
 * Range: 0.00055 amu (electron) to 10⁸ amu (nanoparticle)
 * Scale: LOGARITHMIC (base 10). Slider position maps linearly to log10(mass).
 *
 * Visual features:
 *   - Labelled snap points at MASS_PRESETS positions
 *   - Current mass displayed: "720 amu (C₆₀ buckminsterfullerene)"
 *   - De Broglie wavelength displayed below: "λ_dB = 4.7 pm"
 *   - Colour gradient on track: blue (quantum) → red (classical)
 *   - Fringe visibility indicator: small preview showing pattern strength
 *
 * When mass changes:
 *   - Recompute effective wavelength (changes fringe spacing)
 *   - Recompute suppression factor (changes fringe visibility)
 *   - Both trigger Worker recompute (debounced 200ms)
 *   - A11yAnnouncer: "Particle mass: 720 atomic mass units. C₆₀ molecule.
 *     De Broglie wavelength: 4.7 picometres. Interference: strong."
 *
 * Accessibility:
 *   - <input type="range"> with aria-valuetext including mass, name, and visibility
 *   - Snap to presets on keyboard arrow keys for easier navigation
 *   - Step: 1 preset position per arrow key press
 */
```

### 5.3 EnvironmentSlider.tsx

```typescript
/**
 * Continuous slider for decoherence / environment coupling.
 * Only visible when activeInterpretation is 'decoherence'.
 * REPLACES the observer toggle when active.
 *
 * Range: 0.0 (perfectly isolated) to 1.0 (fully decohered)
 * Scale: Linear
 *
 * Visual features:
 *   - Left label: "Isolated" with wave icon
 *   - Right label: "Decohered" with particle icon
 *   - Track gradient: purple (quantum) → grey (classical)
 *   - Current value displayed: "37% coupled to environment"
 *   - Below: brief explanation text from narrative engine
 *
 * When coupling changes:
 *   - Compute decoherenceVisibility → fringeVisibility in store
 *   - ParticleSystem lerps positions by fringeVisibility (SAME mechanism as observer toggle)
 *   - No Worker recompute needed — visibility is applied at render time
 *   - DetectionScreen shader updates in real-time
 *   - A11yAnnouncer: "Environment coupling: 37%. Interference partially visible."
 *
 * Accessibility:
 *   - aria-valuetext: "{percent}% coupled. {fringeDescription}."
 *   - Step: 1% per arrow key press
 */
```

### 5.4 PerspectiveSelector.tsx

```typescript
/**
 * Three-way toggle for RQM perspective selection.
 * Only visible when activeInterpretation is 'rqm'.
 *
 * Options:
 *   1. "Particle's perspective" — always sees definite trajectory
 *      → Show single trajectory through one slit, no interference
 *   2. "Detector's perspective" — definite after interaction
 *      → Show interference building, then collapse when detector activates
 *   3. "External observer" — system + detector in superposition
 *      → Show full interference pattern; detector state is undefined
 *
 * Implementation:
 *   'particle': force classical distribution, show single highlighted trajectory
 *   'detector': identical to binary observer toggle (ON state)
 *   'external': identical to binary observer toggle (OFF state)
 *
 * The educational power is in switching between these three and seeing that
 * ALL THREE ARE SIMULTANEOUSLY VALID under RQM. The narrative text explains
 * that "facts" about the particle depend on who/what is asking.
 *
 * Accessibility:
 *   - Radio group with aria-label={t('perspective.selector.label')}
 *   - A11yAnnouncer: "Viewing from the detector's perspective.
 *     The particle has a definite position relative to the detector."
 */
```

### 5.5 NarrativeOverlay.tsx

```typescript
/**
 * Dynamic text overlay that changes based on active interpretation
 * and current simulation state (observing vs not observing).
 *
 * Positioned: bottom-left of canvas, above timeline scrubber.
 * Semi-transparent background, readable over the 3D scene.
 * Max width: 400px. Auto-resize text for mobile.
 *
 * Content driven by:
 *   - activeInterpretation → selects which i18n keys to use
 *   - isObserving / fringeVisibility → selects collapse vs no-collapse narrative
 *   - perspective → additional RQM-specific text
 *
 * Example (Copenhagen, observer ON):
 *   "Copenhagen: The measurement has collapsed the wave function.
 *    The particle went through one slit, producing two bands."
 *
 * Example (Many-Worlds, observer ON):
 *   "Many-Worlds: The wave function never collapsed. The universe
 *    branched — you see slit A, but another you sees slit B."
 *
 * Example (Decoherence, envCoupling = 0.4):
 *   "Decoherence: The particle's quantum coherence is partially
 *    destroyed by environmental interaction. Fringes are fading."
 *
 * Transitions: Fade in/out over 0.3s when content changes.
 * Dismissable: Tap/click to minimize to a small icon. Tap again to expand.
 *
 * Accessibility:
 *   - aria-live="polite" region
 *   - Content update announced by screen reader on interpretation/state change
 */
```

### 5.6 InterpretationInfoCard.tsx

```typescript
/**
 * Expandable info card for the active interpretation.
 * Triggered by tapping the (i) button next to InterpretationSelector.
 *
 * Content:
 *   - Full name and key figures
 *   - 2-3 sentence A-level summary (from interpretation.summaryKey)
 *   - Academic status badge with colour
 *   - 2025 Nature survey percentage (where available)
 *   - "What the observer toggle means" explanation
 *   - "Key insight" callout box
 *   - Link: "Learn more" → external resource (PhET, Stanford Encyclopedia, etc.)
 *
 * Layout: Modal overlay on mobile, slide-out panel on desktop.
 * Close: X button, Escape key, or tap outside.
 *
 * Category badges use Tailwind utility classes:
 *   - Mainstream: bg-green-100 text-green-800
 *   - Serious minority: bg-blue-100 text-blue-800
 *   - Emerging: bg-yellow-100 text-yellow-800
 *   - Fringe: bg-gray-100 text-gray-700
 */
```

---

## 6. URL STATE EXTENSION

Add to the URL schema from SPEC.md Section 2.5:

```typescript
interface URLStateSchema {
  // ... existing params ...
  interp: InterpretationId;  // activeInterpretation
  pm: number;                // particleMass in amu (logarithmic scale)
  ec: number;                // envCoupling × 100 (integer 0–100)
  persp: 'p' | 'd' | 'e';   // perspective shorthand
}

// Example URL:
// /experiment?sw=100&ss=500&wl=550&interp=decoherence&ec=40&pm=720
// /experiment?sw=100&ss=500&wl=550&interp=rqm&persp=d
// /experiment?sw=100&ss=500&wl=550&interp=objectiveCollapse&pm=1000000
```

---

## 7. ANALYTICS EVENTS (NEW)

```typescript
type InterpretationAnalyticsEvent =
  | { name: 'interpretation_changed'; data: { from: InterpretationId; to: InterpretationId } }
  | { name: 'mass_changed'; data: { massAmu: number; presetLabel: string | null } }
  | { name: 'env_coupling_changed'; data: { value: number } }
  | { name: 'perspective_changed'; data: { to: 'particle' | 'detector' | 'external' } }
  | { name: 'interpretation_info_viewed'; data: { id: InterpretationId } };
```

---

## 8. SHADER MODIFICATIONS

### 8.1 Particle Shader — Colour-by-Interpretation

The particle glow shader (SPEC.md Section 4.1) gains an additional `interpretationAccent` uniform:

```typescript
// When the user is in an interpretation mode, particles can optionally
// tint toward the interpretation's accent colour at low opacity.
// This is a subtle visual cue — NOT a strong colour override.
//
// uniform vec3 interpretationAccent;  // from InterpretationDef.accentColour
// uniform float accentStrength;       // 0.0 (off) to 0.15 (subtle tint)
//
// Final colour: mix(wavelengthColour, interpretationAccent, accentStrength)
```

### 8.2 Detection Screen — Fringe Visibility Uniform

The detection screen accumulation shader gains a `fringeVisibility` uniform (0.0–1.0):

```typescript
// The existing shader renders hits from the particle buffer.
// With fringeVisibility, the hit positions are pre-interpolated
// between interference and classical positions in the Worker/CPU.
//
// fringeVisibility is NOT applied in the shader — it's applied
// upstream when computing particle positions. The shader is unchanged.
//
// This means the detection screen "photograph developing" effect
// automatically shows the correct pattern for any interpretation.
```

---

## 9. MANY-WORLDS BRANCHING VISUALISATION

When `activeInterpretation === 'manyWorlds'` and the observer toggle is activated, a special visual effect plays:

```typescript
/**
 * ManyWorldsBranchEffect.tsx
 *
 * On observer toggle ON:
 * 1. Freeze all particles at their current positions (0.5s)
 * 2. Clone the entire particle system into a "ghost" copy (additive, 30% opacity)
 * 3. Original particles: smoothly transition to classical slit-A positions
 * 4. Ghost particles: smoothly transition to classical slit-B positions
 * 5. A subtle "split line" animates between the two sets (branching visual)
 * 6. Narrative: "The universe has branched. You see slit A. Another you sees slit B."
 *
 * On observer toggle OFF:
 * 1. Ghost particles fade out (0.5s)
 * 2. Original particles return to interference positions (1s lerp)
 * 3. Narrative: "The branches are indistinguishable. Interference is restored."
 *
 * Implementation:
 * - Second InstancedMesh (ghostMeshRef) with same geometry, reduced opacity
 * - ghostMeshRef.count = 0 normally; set to visibleCount on toggle
 * - Ghost material: same TSL shader, alpha = 0.3, slight purple tint
 * - Only active when activeInterpretation === 'manyWorlds'
 *
 * Performance: Second InstancedMesh doubles draw calls for particles.
 * On Low tier: skip ghost visualisation, use narrative-only explanation.
 */
```

---

## 10. BOHMIAN TRAJECTORY VISUALISATION

When `activeInterpretation === 'bohmian'`, show deterministic pilot-wave guided trajectories:

```typescript
/**
 * BohmianTrajectories.tsx
 *
 * Bohm's interpretation says particles always have definite positions,
 * guided by a "pilot wave" (the wavefunction). The interference pattern
 * arises because the pilot wave goes through both slits, and the
 * particle surfs along one of the trajectories shaped by the wave.
 *
 * Visual:
 * - Show the wave overlay (WaveOverlay.tsx) as the "pilot wave"
 * - Draw curved trajectory lines from source to screen
 * - Trajectories are deterministic: same initial position → same final position
 * - Particles follow these curves, NEVER crossing the central axis
 *   (Bohmian trajectories are non-crossing for the double-slit)
 * - Colour-code trajectories by which slit they pass closest to
 *
 * Implementation:
 * - Compute Bohmian trajectories by integrating the guidance equation:
 *     dx/dt = (ℏ/m) × Im[∇ψ/ψ]
 * - Pre-compute 50–200 representative trajectories at init
 * - Render as THREE.Line with per-vertex colour (LineBasicMaterial)
 * - Toggle via showTrajectories (existing store field)
 *
 * ONLY active when activeInterpretation === 'bohmian'.
 *
 * Performance: 200 Line objects = 200 draw calls. Acceptable on Medium+.
 * On Low tier: show 20 trajectories maximum.
 */
```

---

## 11. I18N STRUCTURE FOR INTERPRETATIONS

```json
// messages/en.json — interpretation keys

{
  "interp": {
    "copenhagen": {
      "name": "Copenhagen Interpretation",
      "short": "Copenhagen",
      "observer": "Measurement collapses the wave function — the detector forces a definite outcome",
      "collapse": "The measurement has collapsed the wave function. The particle was forced to choose one slit, producing two bands instead of an interference pattern.",
      "noCollapse": "No measurement is being made. The particle's wave function passes through both slits simultaneously, creating an interference pattern on the screen.",
      "summary": "The most widely taught interpretation. The wave function describes our knowledge of the system, not the system itself. Measurement is a special process that forces a definite outcome — but the theory never explains why or how this happens. This is the measurement problem."
    },
    "qbism": {
      "name": "QBism (Quantum Bayesianism)",
      "short": "QBism",
      "observer": "You chose to measure which slit — your beliefs about the outcome update accordingly",
      "collapse": "You chose to gather which-path information. Your probability assignments have updated — you now expect two bands. This isn't a physical collapse; it's you updating your beliefs based on new evidence.",
      "noCollapse": "You chose not to measure which slit. Your best prediction, given your current information, is an interference pattern. The wave function represents your personal betting odds, not an objective wave.",
      "summary": "The fastest-growing interpretation (7% → 17% in nine years). The wave function represents one person's beliefs about measurement outcomes, not objective reality. 'Collapse' is simply belief-updating, like changing your betting odds. Different people can legitimately assign different quantum states to the same system."
    }
  },
  "mass": {
    "photon": "Photon (massless)",
    "electron": "Electron",
    "neutron": "Neutron",
    "atom_na": "Sodium atom",
    "c60": "C₆₀ (Buckyball)",
    "protein": "Protein",
    "virus": "Virus",
    "nanoparticle": "Nanoparticle"
  },
  "status": {
    "mainstream": "Mainstream",
    "serious_minority": "Serious minority",
    "emerging": "Emerging",
    "fringe": "Historical / fringe",
    "speculative": "Speculative"
  }
}
```

---

## 12. PHASED DELIVERY FOR INTERPRETATIONS

This feature set integrates into the existing CONTEXT.md phased delivery:

### Phase 2 (Visual Polish) — Add:
- [ ] InterpretationSelector component (Copenhagen only initially — scaffold)
- [ ] NarrativeOverlay component (Copenhagen text only)
- [ ] URL state `interp=` parameter

### Phase 3 (Educational Features) — Add:
- [ ] Full InterpretationSelector with all 10 interpretations
- [ ] InterpretationInfoCard with A-level summaries
- [ ] MassSlider with logarithmic scale and presets
- [ ] EnvironmentSlider for decoherence mode
- [ ] PerspectiveSelector for RQM mode
- [ ] collapseSuppressionFactor() and decoherenceVisibility() physics
- [ ] effectiveWavelength() de Broglie computation
- [ ] Bohmian trajectory visualisation (Medium+ tiers)
- [ ] Many-Worlds branching ghost effect (High+ tiers)
- [ ] Narrative text for all 10 interpretations (en.json)
- [ ] Analytics events for interpretation interactions
- [ ] A11y announcements for all interpretation state changes

### Phase 4 (i18n) — Add:
- [ ] Translate all interpretation narratives into 11 UK school languages
- [ ] Physics glossary additions: "decoherence", "pilot wave", "objective collapse", etc.

---

## 13. AGENT ASSIGNMENT

| Component / Feature | Primary Agent | Supporting Agent |
|---|---|---|
| `InterpretationDef` type system | state-architect | quantum-sim-engineer |
| `collapseSuppressionFactor()` | quantum-sim-engineer | — |
| `decoherenceVisibility()` | quantum-sim-engineer | — |
| `effectiveWavelength()` | quantum-sim-engineer | — |
| Worker mass/coupling params | quantum-sim-engineer | — |
| InterpretationSelector UI | ui-ux-engineer | a11y-specialist |
| MassSlider UI | ui-ux-engineer | a11y-specialist |
| EnvironmentSlider UI | ui-ux-engineer | a11y-specialist |
| PerspectiveSelector UI | ui-ux-engineer | a11y-specialist |
| NarrativeOverlay | ui-ux-engineer | i18n-engineer |
| InterpretationInfoCard | ui-ux-engineer | i18n-engineer |
| ManyWorldsBranchEffect | r3f-renderer | — |
| BohmianTrajectories | r3f-renderer | quantum-sim-engineer |
| Interpretation i18n keys | i18n-engineer | — |
| Narrative accuracy review | compliance-officer | — |
| Interpretation unit tests | test-engineer | quantum-sim-engineer |

---

## 14. TESTING REQUIREMENTS

```
New unit tests (100% coverage mandatory):
  - collapseSuppressionFactor: returns 1.0 for electron, ~0.0 for 10⁸ amu
  - decoherenceVisibility: returns 1.0 at 0.0, 0.0 at 1.0, 0.25 at 0.5
  - effectiveWavelength: photon returns user wavelength; electron returns ~0.1nm at 300K
  - INTERPRETATIONS registry: all 10 entries valid, all i18n keys resolve

New visual tests:
  - Each interpretation selector option renders correctly
  - Mass slider at electron mass: full interference pattern
  - Mass slider at nanoparticle mass: no interference (objective collapse)
  - Environment slider at 0: full interference (decoherence)
  - Environment slider at 1: no interference (decoherence)
  - RQM perspective toggle: 3 views produce correct patterns
  - Many-Worlds branch effect: ghost particles visible on High tier
  - Bohmian trajectories: non-crossing curves visible on Medium+ tier

New a11y tests:
  - Interpretation selector navigable by keyboard
  - Mass slider announced with mass + preset name + fringe visibility
  - All narrative text readable by NVDA and VoiceOver
  - Category badges have sufficient contrast
```
