# SPEC.md — Double Slit: Technical Specification

> **Purpose**: Implementation-level specification for Claude Code agents. Every function signature, data structure, component contract, and system boundary is defined here. Read CONTEXT.md first for requirements and rationale; this document tells you exactly _how_ to build it.

---

## 1. SYSTEM ARCHITECTURE

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │   Next.js    │  │  R3F Canvas   │  │    Web Worker         │  │
│  │  App Router  │  │  (WebGPU/GL)  │  │  (Particle Buffer)   │  │
│  │              │  │               │  │                       │  │
│  │  - Pages     │  │  - Scene      │  │  - physics.ts         │  │
│  │  - Layouts   │  │  - Particles  │  │  - sampling.ts        │  │
│  │  - UI Overlay│  │  - Shaders    │  │  - precompute.ts      │  │
│  │  - i18n      │  │  - Audio      │  │                       │  │
│  └──────┬───────┘  └───────┬───────┘  └───────────┬───────────┘  │
│         │                  │                      │              │
│         └──────────┬───────┘                      │              │
│                    │                              │              │
│              ┌─────┴──────┐              ┌────────┴────────┐    │
│              │  Zustand   │◄────────────►│  MessageChannel │    │
│              │  Store     │              │  (Worker Comms)  │    │
│              └────────────┘              └─────────────────┘    │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ Umami Script │  │  Tone.js      │  │  @react-three/a11y   │  │
│  │ (analytics)  │  │  (audio)      │  │  (accessibility)     │  │
│  └──────────────┘  └───────────────┘  └──────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌──────────────┐  ┌────────────┐  ┌──────────────┐
     │   Vercel     │  │ Cloudflare │  │   Umami      │
     │   (hosting)  │  │ R2 (assets)│  │   (Hetzner)  │
     └──────────────┘  └────────────┘  └──────────────┘
```

### 1.2 Data Flow

```
User adjusts parameter
        │
        ▼
Zustand store updates (debounced 200ms)
        │
        ▼
Web Worker receives new params via MessageChannel
        │
        ▼
Worker recomputes particle buffer (Float32Array)
        │
        ▼
Worker posts buffer back via Transferable
        │
        ▼
Zustand store receives new buffer
        │
        ▼
useFrame reads buffer, updates InstancedMesh matrices
        │
        ▼
Detection screen shader accumulates visible hits
        │
        ▼
A11yAnnouncer fires aria-live update
```

### 1.3 Rendering Pipeline

```
Scene.tsx mounts Canvas
        │
        ├─► WebGPU available? ─► WebGPURenderer + compute shaders
        │                         100K particles, GPU-side simulation
        │
        └─► WebGL fallback ────► WebGLRenderer + CPU InstancedMesh
                                  2K–10K particles, useFrame loop

Both paths:
        │
        ▼
ParticleSystem renders InstancedMesh (single draw call)
        │
        ▼
DetectionScreen accumulates hits (persistent render target)
        │
        ▼
PostProcessing (bloom, DoF) — disabled on Medium/Low tiers
        │
        ▼
Canvas output → screenshot/recording capture point
```

---

## 2. DATA MODELS

### 2.1 Core Simulation Types

```typescript
// types/simulation.ts

/** 3D vector — use Three.js Vector3 at runtime, plain tuple for serialisation */
type Vec3Tuple = [x: number, y: number, z: number];

/** Quality tiers ordered by capability */
type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

/** Playback speed multipliers */
type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;

/** Educational display modes */
type ViewMode = 'wave' | 'particle' | 'both';

/** Equation complexity levels */
type EquationLevel = 'simple' | 'advanced';

/** Application modes that change the entire UI layout */
type AppMode = 'core' | 'guided' | 'quiz' | 'museum' | 'sideBySide';

/** Slit experiment mode */
type SlitMode = 'single' | 'double' | 'triple' | 'grating';

/**
 * Physical parameters of the experiment.
 * All values stored in SI units (metres, seconds).
 * UI displays in nanometres / micrometres as appropriate.
 */
interface ExperimentParams {
  slitWidth: number;        // metres — range: 10nm to 500nm (1e-8 to 5e-7)
  slitSeparation: number;   // metres — range: 100nm to 10μm (1e-7 to 1e-5)
  wavelength: number;       // metres — range: 380nm to 700nm (3.8e-7 to 7e-7)
  emissionRate: number;     // particles/second — range: 1 to 1000
  screenDistance: number;   // metres — range: 0.1 to 2.0 (scene units, not real)
  slitMode: SlitMode;       // Phase 5: defaults to 'double'
}

/** Default experiment parameters (visible light, double slit) */
const DEFAULT_PARAMS: ExperimentParams = {
  slitWidth: 1e-7,          // 100nm
  slitSeparation: 5e-7,     // 500nm
  wavelength: 5.5e-7,       // 550nm (green light)
  emissionRate: 100,        // 100 particles/sec
  screenDistance: 1.0,       // 1 metre (scene unit)
  slitMode: 'double',
};
```

### 2.2 Particle Buffer Data Model

```typescript
// types/particle.ts

/**
 * Struct-of-Arrays layout for GPU/CPU particle data.
 * Each array index corresponds to one particle.
 * All arrays have length === maxParticleCount.
 *
 * SoA layout is critical for performance:
 * - GPU texture uploads read contiguous memory
 * - SIMD-friendly for Web Worker computation
 * - InstancedMesh matrix updates stride sequentially
 */
interface ParticleBuffer {
  /** Simulation time when particle was emitted. Sorted ascending. */
  birthTimes: Float32Array;

  /** Final x,y,z on detection screen under WAVE distribution (interference) */
  interferencePositions: Float32Array;  // length: maxParticleCount * 3

  /** Final x,y,z on detection screen under CLASSICAL distribution (observed) */
  classicalPositions: Float32Array;     // length: maxParticleCount * 3

  /** Which slit the particle "chose" (0 or 1). Used for observer mode visuals. */
  slitIndices: Uint8Array;

  /** Wavelength per particle in metres. Uniform for now; varies if multi-source added. */
  wavelengths: Float32Array;

  /** Trajectory control points: source → slit → screen. 3 points × 3 components = 9 floats. */
  trajectories: Float32Array;           // length: maxParticleCount * 9

  /** Total particle count in this buffer */
  count: number;
}

/**
 * Message types for Worker ↔ Main thread communication.
 * Uses Transferable for zero-copy buffer transfer.
 */
type WorkerInMessage =
  | { type: 'COMPUTE'; params: ExperimentParams; maxParticles: number; seed: number }
  | { type: 'ABORT' };

type WorkerOutMessage =
  | { type: 'COMPLETE'; buffer: ParticleBuffer }
  | { type: 'PROGRESS'; percent: number }
  | { type: 'ERROR'; message: string };
```

### 2.3 Zustand Store Schema

```typescript
// stores/simulationStore.ts

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface SimulationStore {
  // ─── Timeline ────────────────────────────────────
  currentTime: number;          // 0 to tMax
  tMax: number;                 // computed from emissionRate and particleCount
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;

  // ─── Observer ────────────────────────────────────
  isObserving: boolean;
  /** 0.0 = full wave pattern, 1.0 = full classical. Animated via useFrame. */
  observerTransition: number;

  // ─── Experiment Parameters ───────────────────────
  params: ExperimentParams;

  // ─── Display ─────────────────────────────────────
  viewMode: ViewMode;
  showTrajectories: boolean;
  showEquations: boolean;
  equationLevel: EquationLevel;
  showWaveOverlay: boolean;
  showHeatmap: boolean;

  // ─── App Mode ────────────────────────────────────
  appMode: AppMode;
  guidedTourStep: number;       // 0-indexed, -1 = not in tour

  // ─── Quality ─────────────────────────────────────
  qualityTier: QualityTier;
  maxParticleCount: number;     // derived from tier

  // ─── Particle Buffer ─────────────────────────────
  particleBuffer: ParticleBuffer | null;
  isComputing: boolean;         // true while Worker is processing
  computeProgress: number;      // 0–100

  // ─── Audio ───────────────────────────────────────
  audioEnabled: boolean;
  masterVolume: number;         // 0.0 to 1.0

  // ─── Actions ─────────────────────────────────────
  setCurrentTime: (t: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  toggleObserver: () => void;
  setObserverTransition: (t: number) => void;
  updateParam: <K extends keyof ExperimentParams>(key: K, value: ExperimentParams[K]) => void;
  setViewMode: (mode: ViewMode) => void;
  setAppMode: (mode: AppMode) => void;
  setGuidedTourStep: (step: number) => void;
  setQualityTier: (tier: QualityTier) => void;
  setParticleBuffer: (buffer: ParticleBuffer) => void;
  setIsComputing: (computing: boolean) => void;
  setComputeProgress: (percent: number) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setMasterVolume: (volume: number) => void;
  resetSimulation: () => void;
}

/**
 * Quality tier → max particle count mapping.
 * These are hard limits validated against school Chromebook baselines.
 */
const TIER_PARTICLE_LIMITS: Record<QualityTier, number> = {
  ultra: 100_000,
  high: 20_000,
  medium: 5_000,
  low: 2_000,
};
```

### 2.4 Quality Detection Model

```typescript
// lib/quality.ts

interface GPUCapabilities {
  renderer: string;           // e.g., "ANGLE (Intel, Intel(R) UHD Graphics)"
  vendor: string;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  webgpuSupported: boolean;
  estimatedTflops: number;    // rough estimate from renderer string heuristics
}

interface QualityProfile {
  tier: QualityTier;
  maxParticles: number;
  postProcessing: boolean;
  bloomEnabled: boolean;
  dofEnabled: boolean;
  materialType: 'standard' | 'basic';
  maxDrawCalls: number;
  targetFps: number;
  shadowsEnabled: boolean;
  antialiasLevel: 0 | 2 | 4;
  dpr: number;                // device pixel ratio cap (1.0 for low, 2.0 for ultra)
}

/**
 * Assigns quality tier based on detected GPU.
 * Falls back conservatively — better to run smoothly on Low
 * than stutter on Medium.
 */
function detectQualityTier(gl: WebGLRenderingContext | WebGL2RenderingContext): QualityProfile;

/**
 * Runtime FPS monitor. If average FPS drops below threshold
 * for DOWNGRADE_WINDOW_MS, automatically drops one tier.
 * Fires Zustand action: setQualityTier(newTier).
 */
const DOWNGRADE_WINDOW_MS = 2000;
const FPS_SAMPLE_COUNT = 120; // 2 seconds at 60fps
```

### 2.5 URL State Serialisation

```typescript
// lib/urlState.ts

/**
 * URL query parameter schema for shareable experiment states.
 * Short keys to keep URLs compact for sharing.
 *
 * Example: /experiment?sw=100&ss=500&wl=550&obs=0&t=45&vm=wave&am=core
 */
interface URLStateSchema {
  sw: number;   // slitWidth in nanometres (integer)
  ss: number;   // slitSeparation in nanometres (integer)
  wl: number;   // wavelength in nanometres (integer)
  er: number;   // emissionRate (integer)
  sd: number;   // screenDistance × 100 (integer, 2 decimal precision)
  obs: 0 | 1;   // isObserving
  t: number;     // currentTime as percentage 0–100 (integer)
  vm: ViewMode;
  am: AppMode;
  ps: PlaybackSpeed;
  sm: SlitMode;
}

/** Encode simulation state → URL search params */
function encodeStateToURL(state: SimulationStore): URLSearchParams;

/** Decode URL search params → partial simulation state */
function decodeURLToState(params: URLSearchParams): Partial<SimulationStore>;

/** Sync Zustand store ↔ URL bidirectionally via next/navigation */
function useURLStateSync(): void;
```

### 2.6 Guided Tour Data Model

```typescript
// types/tour.ts

interface TourStep {
  id: string;                           // e.g., 'intro', 'first_photon', 'observe'
  titleKey: string;                     // i18n key for step title
  descriptionKey: string;               // i18n key for narration text
  narrationFile: string;                // R2 path: '/audio/en/tour/step_01.mp3'
  /** Which controls are enabled during this step. All others are locked. */
  enabledControls: Array<
    'timeline' | 'observer' | 'parameters' | 'camera' | 'viewMode'
  >;
  /** Auto-set simulation state when entering this step */
  stateOverrides: Partial<SimulationStore>;
  /** Condition to advance to next step (null = manual "Next" button) */
  advanceCondition: TourAdvanceCondition | null;
  /** Duration of auto-play in ms before enabling "Next" (0 = immediate) */
  autoPlayDuration: number;
}

type TourAdvanceCondition =
  | { type: 'OBSERVER_TOGGLED' }
  | { type: 'TIMELINE_REACHED'; percent: number }
  | { type: 'PARTICLES_VISIBLE'; count: number }
  | { type: 'MANUAL' };

/** Full guided tour definition */
interface TourDefinition {
  id: string;
  nameKey: string;
  steps: TourStep[];
}
```

### 2.7 Quiz Data Model

```typescript
// types/quiz.ts

interface QuizQuestion {
  id: string;
  questionKey: string;              // i18n key
  options: QuizOption[];
  correctOptionId: string;
  explanationKey: string;           // i18n key for post-answer explanation
  /** Simulation state to set up before showing this question */
  setupState: Partial<SimulationStore>;
  /** Simulation state to apply when revealing the answer */
  revealState: Partial<SimulationStore>;
  /** Exam board alignment tags */
  examBoards: Array<'AQA' | 'OCR' | 'Edexcel' | 'WJEC'>;
  /** Curriculum key stage */
  keyStage: 'KS3' | 'KS4' | 'A-level';
}

interface QuizOption {
  id: string;
  labelKey: string;                 // i18n key
}
```

### 2.8 Analytics Event Schema

```typescript
// lib/analytics.ts

/**
 * All analytics events are anonymous. No user IDs, no session IDs,
 * no personal data. ICO Children's Code compliant.
 */
type AnalyticsEvent =
  | { name: 'experiment_run'; data: { mode: AppMode; quality: QualityTier } }
  | { name: 'observer_toggled'; data: { to: 'on' | 'off' } }
  | { name: 'parameter_changed'; data: { param: keyof ExperimentParams } }
  | { name: 'guided_tour_started'; data: { tourId: string } }
  | { name: 'guided_tour_completed'; data: { tourId: string } }
  | { name: 'guided_tour_abandoned'; data: { tourId: string; lastStep: number } }
  | { name: 'quiz_answered'; data: { questionId: string; correct: boolean } }
  | { name: 'screenshot_taken'; data: {} }
  | { name: 'recording_started'; data: {} }
  | { name: 'quality_downgraded'; data: { from: QualityTier; to: QualityTier } }
  | { name: 'mode_changed'; data: { from: AppMode; to: AppMode } }
  | { name: 'language_changed'; data: { locale: string } };

/** Fire anonymous event to Umami. No-op if analytics disabled. */
function trackEvent(event: AnalyticsEvent): void;
```

---

## 3. COMPONENT SPECIFICATIONS

### 3.1 Scene.tsx — Canvas Wrapper

```typescript
/**
 * Root R3F Canvas component. Handles WebGPU/WebGL renderer selection,
 * adaptive DPR, and quality-tier-aware configuration.
 *
 * CRITICAL: Use the async `gl` prop for WebGPU initialisation.
 * R3F v9 requires this pattern for WebGPURenderer.
 */
interface SceneProps {
  children: React.ReactNode;
}

// Implementation notes:
// - gl prop: async function that returns WebGPURenderer or falls back to WebGLRenderer
// - dpr: capped by qualityTier (low=1.0, ultra=min(2.0, devicePixelRatio))
// - camera: PerspectiveCamera, fov=50, position=[0, 2, 5]
// - frameloop: 'always' (not 'demand' — simulation is continuous)
// - Resize observer enabled for responsive canvas
// - onCreated callback: run quality detection, set initial tier
```

### 3.2 ParticleSystem.tsx — The Core Renderer

```typescript
/**
 * Renders all particles as a single InstancedMesh.
 * Reads from particleBuffer in Zustand store.
 * Updates visible particles each frame based on currentTime.
 *
 * Two code paths:
 * 1. WebGPU: compute shader updates positions on GPU
 * 2. WebGL: CPU loop in useFrame updates instance matrices
 *
 * Performance contract:
 * - Low tier: 2,000 particles, < 1ms per frame
 * - Ultra tier: 100,000 particles, < 2ms per frame
 */

// Geometry: SphereGeometry(0.005, 4, 4) for Low, (0.003, 8, 8) for Ultra
// Material: TSL shader with additive blending, wavelength→colour uniform
// Instance count: store.maxParticleCount
// Frustum culling: disabled (particles are always in view in this scene)

// useFrame pseudocode:
// 1. Read currentTime, observerTransition from store (via selector)
// 2. For each particle where birthTime <= currentTime:
//    a. Lerp between interferencePos and classicalPos by observerTransition
//    b. If showTrajectories && particle is "in-flight" (not yet hit screen):
//       interpolate along trajectory control points
//    c. Set instance matrix
//    d. Set instance colour from wavelength
// 3. Set instanceMatrix.needsUpdate = true
// 4. Set instanceColor.needsUpdate = true (if colour changed)
// 5. Set mesh.count = visibleParticleCount (hides excess instances)
```

### 3.3 DetectionScreen.tsx — Accumulation Display

```typescript
/**
 * Back wall of the experiment. Uses a persistent render target
 * to accumulate particle hits over time.
 *
 * Two rendering modes (user toggle):
 * 1. DOT mode: Each hit rendered as a small bright circle on the texture
 * 2. HEATMAP mode: Binned intensity values rendered as a colour gradient
 *
 * The render target persists across frames. When timeline rewinds,
 * the texture must be REDRAWN from scratch (iterate all particles
 * with birthTime <= newCurrentTime). Cache the texture at key
 * timeline checkpoints (every 10%) to make scrubbing performant.
 */

interface DetectionScreenState {
  /** Render target for persistent hit accumulation */
  renderTarget: THREE.WebGLRenderTarget;
  /** Cached textures at 10% timeline intervals for fast scrubbing */
  checkpoints: Map<number, THREE.Texture>;  // key: Math.floor(timePercent / 10)
  /** Current display mode */
  displayMode: 'dots' | 'heatmap';
}

// Mesh: PlaneGeometry(screenWidth, screenHeight)
// Material: TSL ShaderMaterial reading from renderTarget.texture
// Position: [screenDistance, 0, 0] (right side of scene)
```

### 3.4 Barrier.tsx — The Double Slit Wall

```typescript
/**
 * The barrier with adjustable slits. Rendered as a solid plane
 * with rectangular cutouts.
 *
 * Geometry approach: CSG (Constructive Solid Geometry) is overkill.
 * Instead, render 3 box meshes:
 * - Top section (above upper slit)
 * - Middle section (between slits)
 * - Bottom section (below lower slit)
 *
 * Recalculate geometry when slitWidth or slitSeparation changes.
 * Use BufferGeometry with manual vertex positions for efficiency.
 */

// Material: MeshStandardMaterial for High/Ultra, MeshBasicMaterial for Low
// Colour: dark grey (#2a2a2a), slight metallic sheen on High+
// A11y: <A11y role="content" description={t('barrier.description')} />
```

### 3.5 TimelineScrubber.tsx — HTML Overlay Control

```typescript
/**
 * HTML range input overlaid on the canvas. NOT a 3D object.
 * Positioned at bottom of viewport via Tailwind absolute positioning.
 *
 * Features:
 * - Drag to scrub through time
 * - Play/Pause button
 * - Speed selector (0.25x, 0.5x, 1x, 2x, 4x)
 * - Particle count display ("847 / 2,000 particles")
 * - Timeline percentage display
 *
 * Accessibility:
 * - <input type="range"> with aria-label={t('timeline.label')}
 * - aria-valuetext="45%, 900 particles detected"
 * - Step size: 1% (keyboard arrow keys)
 *
 * Performance:
 * - onChange fires Zustand setCurrentTime
 * - Debounce: NONE for scrubbing (must feel instant)
 * - The expensive part (detection screen redraw) uses cached checkpoints
 */
```

### 3.6 ObserveButton.tsx — The "Wow" Toggle

```typescript
/**
 * Camera icon button. Toggles isObserving in store.
 * When toggled, initiates the 1-second lerp animation
 * of observerTransition (0↔1) driven by useFrame.
 *
 * Visual states:
 * - Off: Semi-transparent camera outline, "Not observing" label
 * - On: Solid camera icon, glowing border, "Observing" label
 * - Transition: Pulsing animation during the 1s lerp
 *
 * Accessibility:
 * - <button> with aria-pressed={isObserving}
 * - aria-label={t(isObserving ? 'observer.on' : 'observer.off')}
 * - A11yAnnouncer fires: "Observation started" / "Observation stopped"
 *
 * Educational note displayed on hover/focus:
 * "In quantum mechanics, observing which slit a particle goes through
 *  destroys the interference pattern."
 */
```

### 3.7 WaveOverlay.tsx — Probability Wave Visualisation

```typescript
/**
 * Translucent 3D surface showing the probability wave propagating
 * from the source through both slits.
 *
 * Implementation: A PlaneGeometry deformed by a TSL vertex shader
 * that computes the Huygens-Fresnel diffraction pattern in real-time.
 * Height maps to probability amplitude. Colour maps to phase.
 *
 * Toggle: showWaveOverlay in store. Fades in/out over 0.3s.
 * Disabled during observer mode (waves collapse).
 *
 * Material: TSL shader, transparent, additive blending, depthWrite=false
 * Segments: 128×128 for High/Ultra, 32×32 for Medium, hidden on Low
 */
```

---

## 4. SHADER SPECIFICATIONS (TSL)

### 4.1 Particle Glow Shader

```typescript
// shaders/particle.tsl.ts
/**
 * TSL material for instanced particles.
 *
 * Vertex:
 * - Standard instancedMesh transforms
 * - Scale by distance from camera (billboard effect optional)
 *
 * Fragment:
 * - Radial gradient: bright centre, soft falloff
 * - Colour from wavelength uniform (nm → RGB via CIE 1931 approximation)
 * - Additive blending (particles glow when overlapping)
 * - Alpha fades during observer transition
 *
 * Wavelength to RGB conversion (CIE 1931 approximation):
 *   380-440nm: violet→blue
 *   440-490nm: blue→cyan
 *   490-510nm: cyan→green
 *   510-580nm: green→yellow
 *   580-645nm: yellow→orange→red
 *   645-700nm: red
 */

// TSL pseudocode:
// const wavelengthNm = uniform(float(550));
// const color = wavelengthToRGB(wavelengthNm); // custom TSL function
// const dist = length(vUv - vec2(0.5));
// const glow = smoothstep(0.5, 0.0, dist);
// output.color = vec4(color * glow, glow);
```

### 4.2 Detection Screen Accumulation Shader

```typescript
// shaders/detection.tsl.ts
/**
 * Fragment shader for the detection screen.
 *
 * Reads from a persistent render target texture that accumulates
 * particle hit positions. Each hit is rendered as a small gaussian
 * blob (radius ~2 pixels) at the impact position.
 *
 * DOT mode: Direct display of the render target texture
 * HEATMAP mode: Sample the texture, map intensity → colour ramp
 *   (black → blue → cyan → green → yellow → red → white)
 *
 * The render target is updated by a separate render pass that
 * draws small quads at each new hit position with additive blending.
 */
```

### 4.3 Wave Probability Shader

```typescript
// shaders/wave.tsl.ts
/**
 * Vertex + Fragment shader for the wave probability overlay.
 *
 * Vertex shader:
 * - Computes Huygens-Fresnel double-slit diffraction
 * - Each vertex displaced in Y by probability amplitude
 * - Inputs: slitWidth, slitSeparation, wavelength, propagation time
 *
 * Fragment shader:
 * - Colour encodes phase (blue = positive, red = negative amplitude)
 * - Alpha proportional to amplitude squared (probability)
 * - Animated: wave propagates over time (linked to currentTime)
 *
 * The wave equation solved per-vertex:
 *   ψ(r,t) = A₁·exp(i(k·r₁ - ωt)) + A₂·exp(i(k·r₂ - ωt))
 * where r₁, r₂ are distances from each slit to the vertex position.
 */
```

---

## 5. WEB WORKER SPECIFICATION

### 5.1 Particle Computation Worker

```typescript
// workers/particleWorker.ts

/**
 * Dedicated Web Worker for pre-computing particle buffers.
 * Runs entirely off the main thread to prevent frame drops.
 *
 * Input: ExperimentParams + maxParticleCount + random seed
 * Output: ParticleBuffer (transferred, not copied)
 *
 * Algorithm:
 * 1. Generate birthTimes: uniform distribution from 0 to tMax
 *    where tMax = maxParticleCount / emissionRate
 *    Sort ascending.
 *
 * 2. For each particle:
 *    a. Sample interference position from I(θ) distribution
 *       using rejection sampling:
 *       - Generate candidate x from uniform(-screenWidth/2, screenWidth/2)
 *       - Compute I(θ) at that x
 *       - Generate uniform random u ∈ [0, I_max]
 *       - Accept if u <= I(θ), else reject and retry
 *    b. Sample classical position from mixed Gaussian:
 *       - Choose slit 0 or 1 with 50/50 probability
 *       - Sample x from N(μ_slit, σ) where σ = slitWidth
 *    c. Assign slitIndex based on classical choice
 *    d. Compute trajectory: 3 control points
 *       - P0: source position [−sourceDistance, 0, 0]
 *       - P1: slit opening position (jittered within slit width)
 *       - P2: detection screen position
 *
 * 3. Pack into SoA Float32Arrays
 * 4. Transfer back via postMessage with Transferable list
 *
 * Performance target:
 * - 2,000 particles: < 10ms
 * - 100,000 particles: < 200ms
 * - Progress callback every 10%
 *
 * Abort: On receiving 'ABORT' message, terminate current computation
 * and discard partial results.
 */

// CRITICAL: Use a seeded PRNG (e.g., mulberry32) for deterministic results.
// Same seed + same params = identical buffer.
// This allows timeline scrubbing to always produce the same visual.

function mulberry32(seed: number): () => number {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

---

## 6. HOOK SPECIFICATIONS

### 6.1 useSimulation

```typescript
// hooks/useSimulation.ts

/**
 * Core simulation loop hook. Called inside R3F Canvas via useFrame.
 *
 * Responsibilities:
 * 1. Advance currentTime when isPlaying (delta × playbackSpeed)
 * 2. Animate observerTransition towards target (lerp over 1s)
 * 3. Trigger particle buffer recomputation when params change (debounced)
 * 4. Manage Web Worker lifecycle
 *
 * Does NOT:
 * - Update InstancedMesh (that's ParticleSystem's job)
 * - Handle input (that's UI components' job)
 * - Play audio (that's useAudio's job)
 */

function useSimulation(): {
  /** Current visible particle count based on timeline */
  visibleCount: number;
  /** Whether the Worker is recomputing */
  isRecomputing: boolean;
};
```

### 6.2 useAudio

```typescript
// hooks/useAudio.ts

/**
 * Manages all audio: particle impact pings, ambient drone, narration.
 *
 * Initialisation: ONLY after user gesture (click "Start with Sound").
 * Sets up Tone.js Transport and synthesisers.
 *
 * Particle pings:
 * - Triggered when a new particle becomes visible (birthTime <= currentTime)
 * - Rate-limited to 20/second (batch excess into richer chord)
 * - Pitch: map x-position to MIDI note (C3 at centre, ±2 octaves)
 * - Volume: map hit density at that position (louder at pattern peaks)
 * - Spatial: THREE.PositionalAudio at hit position
 *
 * Ambient drone:
 * - Two Tone.js PolySynths: waveDrone and particleDrone
 * - Crossfade by observerTransition value
 * - waveDrone: lush pad, detuned, reverb-heavy
 * - particleDrone: sharp, dry, staccato-ish
 *
 * Narration:
 * - <audio> element (NOT Tone.js) for maximum accessibility
 * - Source from R2: '/audio/{locale}/tour/step_{n}.mp3'
 * - Captions displayed via InfoCard component
 *
 * Cleanup: Dispose all Tone.js nodes on unmount.
 */
```

### 6.3 useAdaptiveQuality

```typescript
// hooks/useAdaptiveQuality.ts

/**
 * Monitors runtime performance and downgrades quality tier
 * if FPS drops below threshold.
 *
 * Algorithm:
 * 1. Maintain rolling buffer of last 120 frame deltas (2s at 60fps)
 * 2. Compute average FPS every 500ms
 * 3. If avgFPS < targetFPS for tier for 2 consecutive checks:
 *    → Downgrade one tier (fire Zustand action)
 *    → Track analytics event 'quality_downgraded'
 *    → Log to console: "Quality downgraded: high → medium (avg 22fps)"
 * 4. Never auto-upgrade (only manual via settings)
 *
 * Called inside useFrame. Cost: negligible (one division per frame).
 */
```

### 6.4 useKeyboardControls

```typescript
// hooks/useKeyboardControls.ts

/**
 * Provides keyboard alternatives for all mouse-based 3D interactions.
 * WCAG 2.5.7 compliance.
 *
 * Key bindings (customisable via Zustand):
 * - Arrow keys: Rotate camera (when canvas focused)
 * - +/-: Zoom camera
 * - Shift + Arrow: Pan camera
 * - Space: Play/Pause timeline
 * - O: Toggle observer
 * - R: Reset simulation
 * - S: Screenshot
 * - Tab: Cycle focus through interactive elements
 * - Escape: Exit guided tour / close info panel
 * - 1-5: Set playback speed (1=0.25x, 2=0.5x, 3=1x, 4=2x, 5=4x)
 *
 * Focus management:
 * - Canvas receives focus on click
 * - Tab order: Canvas → Timeline → Observer → Parameters → Mode buttons
 * - Focus ring visible on all interactive elements
 */
```

---

## 7. API CONTRACTS

### 7.1 Cloudflare R2 Asset Structure

```
double-slit-assets/
  audio/
    en/
      tour/
        step_00_intro.mp3
        step_01_first_photon.mp3
        step_02_accumulate.mp3
        step_03_interference.mp3
        step_04_observe.mp3
        step_05_collapse.mp3
      quiz/
        q01_explanation.mp3
        q02_explanation.mp3
    cy/                            # Welsh
      tour/
        step_00_intro.mp3
        ...
    ur/                            # Urdu
      ...
  images/
    og-image.png                   # OpenGraph social sharing image
    og-image-museum.png            # Museum mode variant
  models/                          # Optional GLTF assets
    observer-camera.glb            # Stylised camera mesh for observer toggle
```

### 7.2 Umami Analytics API

```typescript
// All tracking is client-side via the Umami script tag.
// No server-side API calls needed for Phase 1.

// Script inclusion (layout.tsx):
// <Script src={`${UMAMI_URL}/script.js`}
//         data-website-id={UMAMI_WEBSITE_ID}
//         strategy="lazyOnload" />

// Event tracking:
// umami.track(event.name, event.data);
```

### 7.3 Azure Speech TTS (Build Script Only)

```typescript
// scripts/generateNarration.ts
// Run at build time: npx ts-node scripts/generateNarration.ts

/**
 * Reads narration text from messages/{locale}.json
 * Generates MP3 audio files via Azure Speech REST API
 * Uploads to R2
 *
 * SSML template for physics narration:
 * <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
 *        xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-GB">
 *   <voice name="en-GB-SoniaNeural">
 *     <mstts:express-as style="friendly">
 *       <prosody rate="-10%">
 *         Let's fire one <phoneme alphabet="ipa" ph="ˈfəʊ.tɒn">photon</phoneme>
 *         at a time and see what happens.
 *       </prosody>
 *     </mstts:express-as>
 *   </voice>
 * </speak>
 *
 * Voice selection:
 * - en-GB: en-GB-SoniaNeural (friendly, clear, British)
 * - cy-GB: cy-GB-NiaNeural (Welsh)
 * - ur: ur-PK-UzmaNeural (Urdu)
 * - ... (see Azure docs for full voice list per locale)
 */
```

### 7.4 Microsoft Translator (Build Script Only)

```typescript
// scripts/translateMessages.ts
// Run at build time: npx ts-node scripts/translateMessages.ts

/**
 * Reads messages/en.json as source
 * Translates to all target locales via Azure Translator REST API
 * Writes messages/{locale}.json for each
 * Preserves ICU message syntax placeholders ({count}, {param})
 *
 * Custom glossary (quantum physics terms) provided via Translator API
 * glossary attachment to ensure consistent translation of:
 * - "wave function" → specific term per language
 * - "superposition" → specific term per language
 * - "interference pattern" → specific term per language
 * - "observer effect" → specific term per language
 */
```

---

## 8. TESTING STRATEGY

### 8.1 Unit Tests

```
Framework: Vitest (Vite-native, faster than Jest for TypeScript)

Coverage targets:
  lib/physics.ts        — 100% (core maths MUST be correct)
  lib/sampling.ts       — 100% (statistical distribution accuracy)
  lib/quality.ts        — 90%  (all tier assignments)
  lib/urlState.ts       — 100% (encode/decode roundtrip)
  stores/*              — 90%  (all actions, derived state)

Key physics tests:
  - Interference pattern peaks at correct positions for known d, a, λ
  - sinc² envelope modulates correctly
  - Classical distribution is bimodal Gaussian
  - Rejection sampling produces correct distribution (χ² test, n=10,000)
  - Wavelength → RGB conversion matches CIE reference values ±5%
  - Buffer recomputation with same seed produces identical output

Key state tests:
  - Observer toggle triggers transition animation
  - Timeline scrub updates visible particle count correctly
  - Parameter changes trigger Worker recomputation (debounced)
  - Quality tier changes update particle count limits
  - URL state encode → decode roundtrip preserves all values
```

### 8.2 Visual Tests

```
Framework: Playwright (captures screenshots of R3F canvas)

Key scenarios:
  - Interference pattern visible after 100% timeline
  - Classical two-band pattern visible in observer mode
  - Side-by-side mode shows both patterns simultaneously
  - Quality tiers render different particle counts
  - Wave overlay appears/disappears on toggle
  - High contrast mode renders correctly
  - Museum mode shows simplified UI

Cross-browser matrix:
  - Chrome (latest) — WebGPU path
  - Firefox (latest) — WebGPU path
  - Safari (latest) — WebGPU path
  - Chrome on ChromeOS (simulated) — WebGL fallback
```

### 8.3 Accessibility Tests

```
Manual:
  - NVDA + Chrome: Full screen reader navigation walkthrough
  - VoiceOver + Safari: Full screen reader navigation walkthrough
  - Keyboard-only: Complete all interactions without mouse
  - prefers-reduced-motion: Verify animations disabled
  - forced-colors: Verify high contrast rendering
  - Data table mode: Verify screen reader reads interference data

Automated:
  - axe-core via Playwright: Scan all UI overlays (not canvas)
  - Lighthouse accessibility audit: Target score 95+
  - Custom: Verify all interactive elements have aria-label/description
```

### 8.4 Performance Tests

```
Framework: Custom via Playwright + requestAnimationFrame timing

Key benchmarks (automated CI):
  - Low tier (throttled GPU): Sustain 30fps for 30 seconds
  - High tier: Sustain 60fps for 30 seconds
  - Timeline scrub: < 100ms to update display when dragging
  - Parameter change: < 500ms buffer recomputation for 2,000 particles
  - Parameter change: < 2s buffer recomputation for 100,000 particles
  - Initial load: TTI < 4s on simulated 4G
  - Bundle size: < 500KB gzipped JS

Device lab (manual):
  - Lenovo Chromebook with Celeron N4500 (THE critical test)
  - iPad Air (Safari)
  - Samsung Galaxy Tab A (Chrome Android)
  - MacBook Pro M-series (Ultra tier validation)
```

---

## 9. ERROR HANDLING

### 9.1 WebGPU Failure

```
If WebGPU initialisation fails:
  1. Catch error in Scene.tsx async gl factory
  2. Fall back to WebGLRenderer
  3. Set qualityTier to 'medium' maximum
  4. Log: console.warn('WebGPU unavailable, falling back to WebGL')
  5. Track: analytics event 'quality_downgraded' with reason 'webgpu_fallback'
  6. User sees no error — seamless degradation
```

### 9.2 Worker Failure

```
If Web Worker throws or times out (>5s for 2K particles, >30s for 100K):
  1. Catch error in useSimulation hook
  2. Terminate worker
  3. Show toast: "Simulation error — retrying with fewer particles"
  4. Halve maxParticleCount and retry
  5. If retry fails, fall back to synchronous computation on main thread
     (will stutter but at least produces results)
  6. Track: analytics event with error type
```

### 9.3 Audio Context Failure

```
If Tone.js / Web Audio fails to initialise:
  1. Catch error in useAudio hook
  2. Set audioEnabled = false in store
  3. Hide audio-related UI controls
  4. Simulation continues silently — audio is never required
```

### 9.4 Asset Loading Failure (R2)

```
If R2 audio/model fetch fails:
  1. Retry once after 2 seconds
  2. If retry fails: skip the asset
     - Missing narration: show text-only captions
     - Missing model: use primitive geometry fallback
  3. Never block simulation startup on asset loading
```

---

## 10. SECURITY

### 10.1 CSP Headers

```typescript
// next.config.ts — Content Security Policy

const csp = {
  'default-src': ["'self'"],
  'script-src': ["'self'", UMAMI_URL],
  'style-src': ["'self'", "'unsafe-inline'"],  // Tailwind needs inline
  'img-src': ["'self'", R2_DOMAIN, 'data:', 'blob:'],
  'media-src': ["'self'", R2_DOMAIN],
  'connect-src': ["'self'", R2_DOMAIN, UMAMI_URL],
  'worker-src': ["'self'", 'blob:'],
  'frame-ancestors': ["'self'"],  // LTI Phase 4: add LMS domains
};
```

### 10.2 No User Input Processing

Phase 1 has zero user input beyond simulation controls (sliders, buttons). No text input, no forms, no file uploads. This eliminates XSS, injection, and CSRF concerns entirely. Phase 2 (AI tutor text input) will require input sanitisation.

---

## 11. AGENT CONFIGURATIONS

> These agent definitions are designed for Claude Code in Cursor and can be reused across ventures as part of the virtual corporation agent library.

### 11.1 Agent: Quantum Simulation Engineer

```yaml
name: quantum-sim-engineer
role: Core simulation logic — physics maths, particle buffers, Web Workers
context_files:
  - CONTEXT.md (Sections 5, 6)
  - SPEC.md (Sections 2.1–2.2, 4, 5)
  - src/lib/physics.ts
  - src/lib/sampling.ts
  - src/lib/precompute.ts
  - src/workers/particleWorker.ts
  - src/types/simulation.ts
  - src/types/particle.ts
rules:
  - All physics calculations in SI units internally; convert only at UI boundary
  - Use seeded PRNG (mulberry32) for deterministic particle generation
  - Float32Array for all buffers — never use number[] for particle data
  - Rejection sampling for interference pattern; mixed Gaussian for classical
  - Web Worker MUST use Transferable for buffer transfer (zero-copy)
  - Debounce param changes 200ms before triggering recomputation
  - Report progress every 10% via WorkerOutMessage
  - NEVER import Three.js in the Worker — pure maths only
  - Test interference peak positions against analytical formula to < 0.1% error
```

### 11.2 Agent: R3F Renderer

```yaml
name: r3f-renderer
role: All React Three Fiber components — scene, particles, shaders, post-processing
context_files:
  - CONTEXT.md (Sections 3, 4, 6, 17)
  - SPEC.md (Sections 3, 4, 6)
  - src/components/canvas/*
  - src/shaders/*
  - src/hooks/useSimulation.ts
  - src/hooks/useAdaptiveQuality.ts
rules:
  - ONLY declarative R3F JSX — never imperative Three.js
  - useFrame for ALL animation — never requestAnimationFrame
  - InstancedMesh for particles — never individual meshes
  - TSL for ALL shaders — never raw GLSL/WGSL
  - Import Three.js via 'three/webgpu' for automatic WebGPU/WebGL fallback
  - Respect qualityTier from store for all rendering decisions
  - MeshBasicMaterial on Low tier, MeshStandardMaterial on High+
  - Disable post-processing on Medium and Low tiers
  - Cap DPR: low=1.0, medium=1.0, high=1.5, ultra=min(2, devicePixelRatio)
  - All meshes: dispose geometry and materials on unmount
  - frustumCulled={false} on particles (always visible in scene)
  - Use Drei helpers where available (OrbitControls, Html, Text)
```

### 11.3 Agent: UI/UX Engineer

```yaml
name: ui-ux-engineer
role: HTML overlay UI — timeline, buttons, panels, educational modes
context_files:
  - CONTEXT.md (Sections 8, 10, 11, 12, 13)
  - SPEC.md (Sections 3.5–3.6, 2.5–2.7)
  - src/components/ui/*
  - src/components/a11y/*
  - src/messages/en.json
rules:
  - Tailwind CSS for all styling — no CSS modules, no styled-components
  - ALL user-facing strings via useTranslations() — never hardcode English
  - RTL support via Tailwind rtl: variant for Arabic and Urdu
  - Every interactive element MUST have aria-label or aria-labelledby
  - Every state change MUST fire A11yAnnouncer update
  - Keyboard navigation: Tab order matches visual layout top→bottom, left→right
  - Touch targets minimum 44×44px (WCAG 2.5.8 enhanced, not just 24×24)
  - prefers-reduced-motion: disable all CSS transitions and animations
  - forced-colors: test all components render correctly
  - No engagement loops, streaks, or gamification (ICO Children's Code)
  - Museum mode: simplified layout, large touch targets, auto-reset after 60s inactivity
```

### 11.4 Agent: Audio Engineer

```yaml
name: audio-engineer
role: Procedural sound design via Tone.js, spatial audio, narration playback
context_files:
  - CONTEXT.md (Section 10)
  - SPEC.md (Section 6.2)
  - src/hooks/useAudio.ts
  - src/components/canvas/Scene.tsx (for PositionalAudio attachment)
rules:
  - Tone.js for synthesis — Howler.js ONLY if pre-recorded samples needed
  - THREE.PositionalAudio for 3D spatial positioning
  - Audio MUST be opt-in — never auto-play
  - Rate-limit particle pings to 20/second maximum
  - Ambient drone volume default: 0.1 (very low)
  - Crossfade wave↔particle drone over observerTransition value
  - Narration via <audio> element (HTML5), NOT Tone.js (accessibility)
  - Dispose all Tone.js nodes on component unmount
  - Respect prefers-reduced-motion for audio-visual sync effects
  - Mute button MUST be visible and prominent at all times
```

### 11.5 Agent: Accessibility Specialist

```yaml
name: a11y-specialist
role: WCAG 2.2 AA compliance, screen reader support, keyboard navigation
context_files:
  - CONTEXT.md (Section 8)
  - SPEC.md (Sections 3.5, 6.4, 8.3)
  - src/components/a11y/*
  - src/hooks/useKeyboardControls.ts
rules:
  - @react-three/a11y for 3D→screen reader bridge
  - A11yAnnouncer with aria-live="polite" for non-urgent updates
  - aria-live="assertive" ONLY for observer toggle (critical state change)
  - Data table alternative for interference pattern (toggle in UI)
  - Sonification via Tone.js mapping intensity→pitch for blind users
  - Skip link to main simulation canvas
  - Focus management: trap focus in modals/guided tour overlays
  - Never rely on colour alone to convey information
  - Minimum contrast ratio 4.5:1 for all text (WCAG 1.4.3)
  - Test with NVDA, VoiceOver, and keyboard-only before marking complete
```

### 11.6 Agent: Infrastructure & DevOps

```yaml
name: infra-devops
role: Vercel deployment, R2 storage, Umami analytics, build scripts, CI/CD
context_files:
  - CONTEXT.md (Sections 15, 18)
  - SPEC.md (Sections 7, 10)
  - next.config.ts
  - vercel.json
  - scripts/*
rules:
  - Vercel for deployment — no custom Docker/servers
  - R2 for static assets — configure CORS for Vercel domain only
  - Umami self-hosted on Hetzner — PostgreSQL, no cookies
  - Azure Speech script runs locally or in CI — never at runtime
  - CSP headers in next.config.ts — strict policy
  - Environment variables: never commit secrets — use Vercel env config
  - Preview deployments enabled for all PRs
  - Build must complete in < 2 minutes (Vercel free tier limit)
  - Cache narration audio aggressively (immutable, max-age=31536000)
```

### 11.7 Agent: Test Engineer

```yaml
name: test-engineer
role: Unit tests, visual regression, accessibility audits, performance benchmarks
context_files:
  - SPEC.md (Section 8)
  - src/lib/* (unit test targets)
  - src/stores/* (unit test targets)
rules:
  - Vitest for unit tests — NOT Jest
  - Playwright for visual tests and accessibility audits
  - 100% coverage on physics.ts and sampling.ts — non-negotiable
  - χ² goodness-of-fit test for sampling distribution accuracy
  - Snapshot tests for wavelength→RGB conversion reference values
  - Performance test: monitor frame times over 30-second simulated run
  - Accessibility: axe-core scan of all non-canvas UI
  - All tests must pass before merging to main
  - Performance regression: fail CI if Low tier drops below 28fps average
```

---

## 12. DEPENDENCY MANIFEST

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^0.183.0",
    "@react-three/fiber": "^9.0.0",
    "@react-three/drei": "^9.0.0",
    "@react-three/postprocessing": "^3.0.0",
    "@react-three/a11y": "^3.0.0",
    "@react-three/rapier": "^2.0.0",
    "zustand": "^5.0.0",
    "leva": "^0.10.0",
    "tone": "^15.0.0",
    "next-intl": "^4.0.0",
    "tailwindcss": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/three": "^0.183.0",
    "vitest": "^3.0.0",
    "@playwright/test": "^1.50.0",
    "axe-playwright": "^2.0.0",
    "@aws-sdk/client-s3": "^3.0.0"
  }
}
```

**Total estimated bundle (gzipped):**
- Three.js + R3F + Drei: ~250KB
- Tone.js: ~80KB
- Zustand + Leva: ~15KB
- next-intl: ~15KB
- Postprocessing: ~40KB (lazy-loaded, High+ tiers only)
- Application code: ~50KB
- **Total: ~450KB** (under 500KB budget)

---

## 13. GLOSSARY

| Term | Definition |
|------|-----------|
| **TSL** | Three.js Shading Language. Write shaders in JavaScript that compile to WGSL (WebGPU) or GLSL (WebGL). |
| **SoA** | Struct of Arrays. Data layout where each field is a separate contiguous array. Optimal for GPU upload and SIMD. |
| **Rejection sampling** | Monte Carlo method: generate random candidates, accept/reject based on target probability density. |
| **Observer transition** | The 0→1 lerp value controlling the blend between interference (wave) and classical (particle) patterns. |
| **Checkpoint** | Cached detection screen render target at a specific timeline percentage. Used for fast scrubbing. |
| **DPR** | Device Pixel Ratio. Capped per quality tier to balance sharpness vs GPU load. |
| **LTI** | Learning Tools Interoperability. Standard for embedding educational tools in LMS platforms (Canvas, Moodle). |
| **DPA** | Data Processing Agreement. Required when processing student data on behalf of schools under UK GDPR. |
| **DPIA** | Data Protection Impact Assessment. Required before processing children's data at scale. |
| **ICO Children's Code** | UK statutory code of practice with 15 standards governing how services process under-18s' data. |
| **KCSIE** | Keeping Children Safe in Education. DfE statutory guidance that references AI safeguarding requirements. |
| **xAPI** | Experience API. JSON-based standard for tracking granular learning interactions. |
