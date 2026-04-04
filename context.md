# CONTEXT.md — Double Slit: Interactive 3D Quantum Experiment Visualiser

> **Purpose**: This document is the single source of truth for Claude Code / Cursor agents building the Double Slit application. Every architectural decision, constraint, and requirement is captured here. Read this file before writing any code.

---

## 1. WHAT WE'RE BUILDING

An interactive 3D web application that visualises the quantum double-slit experiment. Users fire photons/electrons at a barrier with two slits and watch an interference pattern build on a detection screen. Four features combine to create a unique educational tool that no competitor offers together:

1. **Timeline Scrubber** — Drag through time to watch particles accumulate dot by dot, or rewind to see fewer dots. All particle trajectories are pre-computed; the timeline controls visibility (`particle.birthTime <= currentTime`).
2. **Observer Toggle** — A camera icon button. When "observing," the interference pattern collapses to two classical bands (Gaussian bumps behind each slit). When toggled off, the wave interference pattern returns. The transition lerps between distributions over ~1 second.
3. **360° Orbital Camera** — Full OrbitControls: rotate, zoom, pan around the experiment like a physics bench.
4. **Adjustable Parameters** — Slit width, slit separation, wavelength (changes particle colour), emission rate, distance to screen.

**Scene layout:**
```
[Particle Source] -----> [Barrier with 2 Slits] -----> [Detection Screen]
     (left)                   (centre)                    (right)
```

---

## 2. WHO IT'S FOR

**Primary audience:** A-level physics students (16–18) and their teachers. The double-slit experiment is a core A-level required practical across AQA, OCR, Edexcel, and WJEC exam boards.

**Secondary audiences:**
- KS3/KS4 students (11–16) via scaffolded introductory modes — basic wave behaviour and the photon model are introduced at GCSE
- Science museums and public engagement events — self-contained 2–4 minute interaction cycles for walk-up visitors
- Non-specialist physics teachers — 25% of English state schools have no specialist physics teacher; this tool scaffolds teacher understanding alongside student learning

**Key market context:**
- 44,947 A-level physics entries in 2025 (25-year high, +4.3% YoY)
- 3,456 state-funded secondary schools + 2,421 independent schools in England
- PhET dominates (1.7B cumulative runs, free) but is entirely 2D with no timeline, observer toggle, or 3D rendering
- UK schools primarily use Chromebooks with Intel Celeron N4500, 4GB RAM, Intel UHD — the minimum performance target

---

## 3. TECH STACK

| Layer | Tool | Version | Why |
|-------|------|---------|-----|
| **Framework** | Next.js + TypeScript | 15.x | SSR for SEO, App Router, existing stack |
| **3D Engine** | React Three Fiber (R3F) | 9.x | Declarative 3D, React 19 support, WebGPU via async `gl` prop |
| **Three.js** | three | r183+ | Import via `three/webgpu` for WebGPURenderer with automatic WebGL 2 fallback |
| **3D Helpers** | @react-three/drei | latest | OrbitControls, Text, Html overlays, shaderMaterial |
| **Particle Physics** | @react-three/rapier | latest | Rust WASM physics for particle trajectories through slits |
| **Shaders** | TSL (Three Shading Language) | built into Three.js r171+ | Write once, compiles to WGSL (WebGPU) or GLSL (WebGL) automatically |
| **State** | Zustand | latest | Lightweight global state for all simulation parameters |
| **UI Controls** | Leva | latest | Real-time parameter tweaking panel |
| **Styling** | Tailwind CSS | 4.x | 2D overlay UI (timeline, buttons, info panels) |
| **Audio** | Tone.js | 15.x | Procedural particle "ping" sounds, ambient quantum soundscape |
| **Spatial Audio** | THREE.PositionalAudio | built-in | 3D spatial positioning tied to scene graph, HRTF binaural rendering |
| **Accessibility** | @react-three/a11y | 3.x | Shadow DOM layer for screen readers over 3D canvas |
| **i18n** | next-intl | latest | Internationalisation for Next.js App Router with RSC support |
| **Analytics** | Umami | self-hosted | Cookieless, GDPR/ICO-compliant, anonymous event tracking |
| **Deployment** | Vercel | Hobby/Pro | Native Next.js support, HTTPS included, free tier sufficient |
| **Asset Storage** | Cloudflare R2 | free tier | 10 GB storage, zero egress, S3-compatible, global CDN |

### Critical Stack Decisions

**WebGPU-first, WebGL fallback:** Import Three.js via `import * as THREE from 'three/webgpu'`. This gives the WebGPURenderer where available (~70% browser coverage) with automatic WebGL 2 fallback. WebGPU compute shaders enable 100,000+ particles simulated on GPU in parallel. On WebGL fallback, cap particles at 5,000–10,000.

**TSL over raw GLSL:** Three.js Shading Language compiles to both WGSL and GLSL from a single JavaScript source. Do NOT write separate GLSL and WGSL shaders. Use TSL for all custom shader materials.

**No classical physics engine can simulate quantum mechanics.** Rapier handles particle emission, trajectories, and collision detection only. The double-slit interference pattern is pure custom maths implemented in shaders (see Section 5).

**Pre-generate narration, don't call TTS at runtime.** Use Azure Speech (500K chars/month free, best SSML) at build time → store static audio on R2. Dynamic TTS only for the AI tutor (Phase 2).

---

## 4. PROJECT STRUCTURE

```
src/
  app/
    layout.tsx                    # Root layout with next-intl provider
    page.tsx                      # Main simulation page
    [locale]/                     # i18n routing
  components/
    canvas/
      Scene.tsx                   # R3F Canvas wrapper with WebGPU init
      ParticleEmitter.tsx         # Fires particles from source position
      Barrier.tsx                 # Double-slit wall (adjustable width/separation)
      DetectionScreen.tsx         # Back wall with accumulation shader
      ParticleSystem.tsx          # InstancedMesh (WebGL) or compute shader (WebGPU)
      WaveOverlay.tsx             # Translucent probability wave visualisation
      ObserverDetector.tsx        # "Camera" mesh at the slits (visual indicator)
    ui/
      TimelineScrubber.tsx        # Bottom timeline bar (HTML overlay, not 3D)
      ParameterPanel.tsx          # Leva or custom sliders
      InfoCard.tsx                # Educational pop-ups (Drei Html component)
      ObserveButton.tsx           # Camera icon toggle with Lottie animation
      ModeSelector.tsx            # Wave / Particle / Both view modes
      QualityIndicator.tsx        # Shows current quality tier
    a11y/
      SimulationAnnouncer.tsx     # aria-live announcements for state changes
      DataTableAlternative.tsx    # Tabular view of interference pattern data
  shaders/
    particle.tsl.ts               # TSL particle glow shader (compiles to WGSL/GLSL)
    detection.tsl.ts              # TSL detection screen accumulation shader
    wave.tsl.ts                   # TSL wave probability visualisation shader
    diffraction.tsl.ts            # TSL slit diffraction fan effect
  stores/
    simulationStore.ts            # Zustand: timeline, observer mode, parameters
    qualityStore.ts               # Zustand: adaptive quality tier state
  lib/
    physics.ts                    # Interference pattern formulas
    sampling.ts                   # Probability distribution sampling (rejection/inverse transform)
    quality.ts                    # GPU capability detection and quality tier assignment
    precompute.ts                 # Pre-compute all particle trajectories into buffer
  hooks/
    useSimulation.ts              # Main simulation loop hook (useFrame)
    useAudio.ts                   # Tone.js procedural sound hook
    useAdaptiveQuality.ts         # Monitors FPS, scales quality dynamically
    useKeyboardControls.ts        # Keyboard alternatives for all 3D interactions
  audio/
    narration/                    # Pre-generated Azure Speech MP3/OGG files (served from R2)
  messages/
    en.json                       # English strings
    cy.json                       # Welsh
    ur.json                       # Urdu (and other UK school languages)
  types/
    simulation.ts                 # TypeScript interfaces for all simulation state
```

---

## 5. PHYSICS SIMULATION — THE CORE MATHS

### 5.1 Interference Pattern (No Observer)

The probability distribution on the detection screen:

```
I(θ) = I₀ × cos²(πd·sin(θ)/λ) × [sin(πa·sin(θ)/λ) / (πa·sin(θ)/λ)]²
```

Where:
- `d` = slit separation (user-adjustable)
- `a` = slit width (user-adjustable)
- `λ` = wavelength (user-adjustable, maps to particle colour)
- `θ` = angle from centre
- First term: double-slit interference envelope
- Second term: single-slit diffraction modulation (sinc²)

Each particle's detection position is sampled from this distribution using **rejection sampling** or **inverse transform sampling**. Store all sampled positions in a pre-computed Float32Array buffer at initialisation.

### 5.2 Classical Pattern (With Observer)

When the observer toggle is ON, particles go through one slit or the other (50/50 random). Two Gaussian distributions centred behind each slit. No interference fringes.

```
P(x) = 0.5 × N(x; μ₁, σ) + 0.5 × N(x; μ₂, σ)
```

Where μ₁, μ₂ are positions behind each slit and σ scales with slit width.

### 5.3 Transition Animation

When toggling observer mode, lerp each particle's final position between its interference-pattern position and its classical-pattern position over ~1 second using an easing function. This is the "wow" moment — students see wave function collapse in real-time.

### 5.4 Timeline Mechanics

All particle data is pre-computed into a buffer:
```typescript
interface ParticleData {
  birthTime: number;          // When this particle was "emitted"
  trajectoryPoints: Float32Array; // Path from source through slit(s) to screen
  interferencePos: Vec3;      // Final position (wave distribution)
  classicalPos: Vec3;         // Final position (particle distribution)
  slitIndex: 0 | 1;          // Which slit it went through (for observer mode)
  wavelength: number;         // Maps to colour
}
```

The timeline controls `currentTime`. Particles are visible when `birthTime <= currentTime`. Dragging left hides particles; dragging right reveals them. The buffer does NOT need recalculation when scrubbing — only visibility changes.

When parameters change (slit width, separation, wavelength), the ENTIRE buffer must be recomputed. Debounce parameter changes by 200ms, then recompute in a Web Worker to avoid blocking the render loop.

---

## 6. RENDERING STRATEGY

### 6.1 Particle Rendering

**WebGPU path (preferred):** Use TSL compute shaders via Three.js GPUComputationRenderer. Store all particle positions in GPU textures. Fragment shaders update positions each frame. InstancedMesh renders from the texture. Target: 100,000+ particles at 60fps.

**WebGL fallback:** Use standard InstancedMesh with CPU-side position updates in `useFrame`. Cap at 5,000–10,000 particles. Update instance matrices each frame:

```typescript
const dummy = new THREE.Object3D();
useFrame(() => {
  for (let i = 0; i < visibleCount; i++) {
    dummy.position.set(particles[i].x, particles[i].y, particles[i].z);
    dummy.updateMatrix();
    meshRef.current.setMatrixAt(i, dummy.matrix);
  }
  meshRef.current.instanceMatrix.needsUpdate = true;
});
```

### 6.2 Detection Screen

TSL fragment shader on the back wall that accumulates hits over time. Each impact creates a persistent bright spot using additive blending. The interference/classical pattern emerges like a photograph developing. Use a render target texture that persists across frames — new hits are added, old hits remain.

### 6.3 Post-Processing

Use `@react-three/postprocessing` for bloom (particle glow), depth of field (focus on detection screen), and optional chromatic aberration. **Disable all post-processing on low-quality tier.** The bloom effect is critical for visual appeal on capable hardware.

### 6.4 Adaptive Quality System

Detect GPU capability at startup and assign a quality tier:

| Tier | GPU Class | Particles | Post-Processing | Target FPS |
|------|-----------|-----------|-----------------|------------|
| **Ultra** | Discrete GPU + WebGPU | 100,000 | Full bloom + DoF | 60 |
| **High** | Integrated GPU + WebGPU | 20,000 | Bloom only | 60 |
| **Medium** | Integrated GPU + WebGL | 5,000 | None | 30 |
| **Low** | Intel UHD / Celeron + WebGL | 2,000 | None | 30 |

Monitor FPS via `useFrame` delta. If FPS drops below tier target for >2 seconds, automatically downgrade one tier. Display current tier in a small indicator (optional, teacher-facing).

**The Low tier MUST run at 30fps on Intel Celeron N4500 with 4GB RAM.** This is the school Chromebook baseline. Keep draw calls under 50, no post-processing, simplified materials (MeshBasicMaterial instead of MeshStandardMaterial), reduced geometry complexity.

---

## 7. STATE MANAGEMENT (ZUSTAND)

```typescript
interface SimulationState {
  // Timeline
  currentTime: number;        // 0 to tMax
  tMax: number;               // Total simulation duration
  isPlaying: boolean;         // Auto-advance timeline
  playbackSpeed: number;      // 0.25x, 0.5x, 1x, 2x, 4x

  // Observer
  isObserving: boolean;       // Observer toggle state
  observerTransition: number; // 0 (wave) to 1 (classical), for lerp

  // Parameters
  slitWidth: number;          // metres (display in nm for UI)
  slitSeparation: number;     // metres
  wavelength: number;         // metres (maps to visible colour 380–700nm)
  emissionRate: number;       // particles per second
  screenDistance: number;     // metres

  // Display
  viewMode: 'wave' | 'particle' | 'both';
  showTrajectories: boolean;
  showEquations: boolean;
  equationLevel: 'simple' | 'advanced'; // KS4 vs A-level

  // Quality
  qualityTier: 'ultra' | 'high' | 'medium' | 'low';
  particleCount: number;      // Derived from qualityTier

  // Actions
  setCurrentTime: (t: number) => void;
  toggleObserver: () => void;
  setParameter: (key: string, value: number) => void;
  resetSimulation: () => void;
}
```

---

## 8. ACCESSIBILITY REQUIREMENTS

Accessibility is a **legal requirement** (Public Sector Bodies Accessibility Regulations 2018) and a procurement condition for UK schools. 19.5% of pupils have SEND.

### 8.1 Screen Reader Support

Use `@react-three/a11y` to create a shadow DOM layer synced over the canvas:

```tsx
<A11y role="content" description="Double-slit experiment: particles firing at barrier">
  <Barrier />
</A11y>
```

Place `<A11yAnnouncer />` next to `<Canvas>` for `aria-live` region announcements:
- "Observation started — wave function collapsed to two bands"
- "Timeline at 45% — 900 particles detected"
- "Slit width changed to 0.5 millimetres"

### 8.2 Keyboard Navigation

ALL 3D interactions MUST have keyboard alternatives (WCAG 2.5.7 Dragging Movements):

| Action | Mouse | Keyboard |
|--------|-------|----------|
| Rotate camera | Click + drag | Arrow keys |
| Zoom | Scroll wheel | +/- keys |
| Pan | Right-click + drag | Shift + Arrow keys |
| Timeline scrub | Drag slider | Left/Right arrow on focused slider |
| Toggle observer | Click button | Enter/Space on focused button |
| Adjust parameter | Drag slider | Arrow keys on focused slider |

### 8.3 Reduced Motion

Detect `prefers-reduced-motion` and when active:
- Disable particle oscillation animations
- Use instant transitions instead of lerps
- Reduce particle trail effects
- Keep particle accumulation (core educational value) but remove decorative motion
- Never flash more than 3 times per second (WCAG 2.3.1)

### 8.4 High Contrast Mode

Detect `forced-colors` media query. Swap 3D materials to high-contrast versions:
- White particles on black background (or vice versa)
- Bold slit barrier outlines
- Maximum contrast detection screen

### 8.5 Data Table Alternative

Provide a toggle to show interference pattern data as an accessible HTML table alongside the 3D view. Columns: position, hit count, normalised intensity. This gives blind/low-vision students access to the same data.

### 8.6 Sonification

Map interference pattern intensity to pitch/volume via Tone.js. As the pattern builds, the audio representation evolves. Particle impact sounds provide spatial audio feedback for the accumulation pattern.

---

## 9. COMPLIANCE & DATA HANDLING

### 9.1 ICO Children's Code (Statutory Law)

This app will be used by under-18s. The following are **mandatory**:

- **Default settings = high privacy.** All non-core data collection OFF by default. Analytics (Umami) must be cookieless and collect no personal data.
- **Data minimisation.** Collect ONLY what the simulation needs to function. No user profiles, no tracking, no session recordings.
- **No detrimental use.** No engagement loops, no streaks, no gamification that encourages overuse.
- **Transparency.** Privacy information must be in clear, age-appropriate language.
- **No profiling by default.** Any AI tutor features (Phase 2) must have profiling OFF by default.

### 9.2 School Data Processing

When schools commission the tool, the lawful basis is the school's "public task" (Article 6(1)(e)). The app acts as a **data processor** under a written Data Processing Agreement. This means:
- Schools are the data controller
- We process data only on their instructions
- We must provide a DPA template for schools to sign
- Student data must not leave the UK/EEA without adequate safeguards

### 9.3 Phase 1: No User Accounts

The MVP ships with **zero user accounts, zero authentication, zero personal data collection**. The simulation runs entirely client-side. Analytics via Umami track anonymous events only (e.g., "experiment_run", "observer_toggled"). This eliminates 90% of the compliance burden.

### 9.4 Phase 2: Teacher Accounts (Future)

When adding teacher dashboards, class management, and LTI integration:
- Teacher accounts via Google/Microsoft OAuth (school SSO)
- Student data accessed via LTI context (school manages identity)
- DPA required with each school/MAT
- DPIA (Data Protection Impact Assessment) required before launch
- DfE AI Product Safety Standards apply to AI tutor feature

---

## 10. AUDIO DESIGN

### 10.1 Particle Sounds (Procedural via Tone.js)

Each particle impact on the detection screen triggers a short synthesised "ping":

```typescript
const synth = new Tone.FMSynth({
  modulationIndex: 2,
  envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
});
```

- Pitch maps to x-position on detection screen (centre = middle C, edges = higher/lower)
- Volume scales with local hit density (louder where pattern is stronger)
- Spatial positioning via THREE.PositionalAudio attached to hit location
- Rate-limit to max ~20 pings/second to avoid cacophony; batch rapid hits into a single richer sound

### 10.2 Ambient Soundscape

A subtle background drone that evolves with the experiment state:
- **Unobserved:** Ethereal, harmonic-rich pad (represents wave nature)
- **Observed:** Sharper, more defined tone (represents particle nature)
- **Transition:** Crossfade between the two over ~1 second during observer toggle
- Volume: LOW by default (0.1). User-adjustable. Mute button prominent.

### 10.3 Audio Must Be Opt-In

Web Audio API requires user gesture to initialise. Show a "Start with Sound" / "Start Silent" choice on first load. Never auto-play audio. Respect `prefers-reduced-motion` for audio-visual sync.

---

## 11. INTERNATIONALISATION

### 11.1 Required Languages (UK School Demographics)

Use `next-intl` with the App Router. All UI strings, educational text, and info cards must be translatable. Required languages for UK schools:

English, Welsh, Urdu, Bengali, Punjabi, Polish, Arabic, Somali, Gujarati, Tamil, Romanian

### 11.2 Translation Pipeline

1. Author all content in English (`messages/en.json`)
2. Use Microsoft Translator API (2M chars/month free, supports all 11 languages) for initial machine translation
3. Welsh is legally required for apps used in Welsh schools (Welsh Language Standards)
4. Physics terms (superposition, interference, wave function) need a Crowdin glossary to ensure consistent translation

### 11.3 RTL Support

Arabic and Urdu are right-to-left. The UI overlay must support `dir="rtl"` via Tailwind's `rtl:` variant. The 3D canvas is language-agnostic and unaffected.

---

## 12. EDUCATIONAL MODES

### 12.1 Core Mode (Default)

Full simulation with all controls. Timeline scrubber, observer toggle, parameter sliders, 360° camera. This is the A-level mode.

### 12.2 Guided Tour Mode

Step-by-step walkthrough with pre-generated narration (Azure Speech audio from R2):
1. "Let's fire one photon at a time…" (single photon mode)
2. "Watch where it lands on the screen…"
3. "Now let's fire a hundred…" (speed up timeline)
4. "See the pattern forming? This is interference…"
5. "Now click the observer…" (toggle)
6. "The pattern changed! This is wave function collapse…"

Each step locks/unlocks specific controls. Narration plays via `<audio>` element (not Web Audio API) for maximum accessibility. Captions displayed as `<Html>` overlays in 3D space.

### 12.3 Quiz Mode

"What do you think will happen if we add a detector?" → Student predicts → Simulation reveals answer. Quiz questions aligned to AQA/OCR/Edexcel/WJEC A-level specifications. Questions stored in `messages/en.json` for translatability.

### 12.4 Museum Mode

Simplified UI. No parameter panel. Large touch targets. Auto-play with observer toggle as the only interaction. Designed for 2–4 minute engagement cycles. Auto-reset after 60 seconds of inactivity. Kiosk-friendly: no address bar, no navigation chrome (Next.js PWA manifest with `display: fullscreen`).

### 12.5 Side-by-Side Mode

Split canvas: left = unobserved (interference), right = observed (two bands). Same particles, same parameters, different outcomes displayed simultaneously. This is the most powerful educational view for demonstrating wave-particle duality.

---

## 13. SCREENSHOT & RECORDING

### 13.1 Screenshot

Use native `canvas.toBlob()`. Call `gl.render(scene, camera)` then immediately `gl.domElement.toDataURL('image/png')` in the same synchronous callback. No `preserveDrawingBuffer: true` needed. Zero dependencies.

### 13.2 Video Recording

Use native `MediaRecorder` API with `canvas.captureStream(30)`. Detect codec support: Chrome/Edge/Firefox → WebM (VP8/VP9), Safari → MP4 (H.264). Provide download link when recording stops. Cap recording at 30 seconds to manage file size.

### 13.3 Shareable State URLs

Encode all simulation parameters into URL query string:
```
/experiment?sw=0.5&ss=2.0&wl=550&obs=0&t=45&mode=wave
```
Teachers can share specific states with students. URL updates on parameter change (using `next/navigation` `useSearchParams`).

---

## 14. PERFORMANCE BUDGET

### 14.1 Load Time

- First Contentful Paint: < 2s on 4G
- Time to Interactive: < 4s on 4G
- Total bundle (JS): < 500KB gzipped (excluding Three.js WASM)
- Three.js + R3F + Drei: ~250KB gzipped (tree-shake aggressively)
- Tone.js: ~80KB gzipped
- Zustand + Leva: ~15KB gzipped

### 14.2 Runtime

- 60fps on discrete GPU (Ultra/High tier)
- 30fps on Intel Celeron N4500 Chromebook (Medium/Low tier)
- Draw calls: < 50 on Low tier, < 200 on Ultra tier
- Memory: < 200MB total (including textures and particle buffers)
- Web Worker for particle buffer recomputation (never block main thread)

### 14.3 Assets on R2

All static assets served from Cloudflare R2 (zero egress):
- Pre-generated narration audio files (~2MB per language per guided tour step)
- Any GLTF models (if used for observer camera mesh, etc.)
- OG images for social sharing

---

## 15. DEPLOYMENT & INFRASTRUCTURE

### 15.1 Vercel

- Hobby tier (free) for development, Pro ($20/month) for production
- Automatic HTTPS, global CDN, instant rollbacks
- Next.js native — zero configuration
- Preview deployments for PRs

### 15.2 Cloudflare R2

- 10 GB free storage, zero egress fees
- S3-compatible API
- Custom domain via Cloudflare (free)
- CORS configured for the Vercel domain

### 15.3 Umami Analytics (Self-Hosted)

- Hetzner VPS (€5/month, Germany for EU data residency)
- PostgreSQL database
- No cookies, no fingerprinting, no personal data
- Custom events: `umami.track('experiment_run', { mode: 'guided', quality: 'medium' })`
- Dashboard accessible to internal team only

### 15.4 Azure Speech (Build-Time Only)

- F0 free tier: 500K characters/month (ongoing, no expiry)
- Used at build time via a script to generate narration audio files
- Output stored on R2
- NOT called at runtime from the client

---

## 16. PHASED DELIVERY

### Phase 1: Core Simulation (MVP) — Weeks 1–4

**Goal:** A working 3D double-slit simulation with the four USP features.

- [ ] Next.js 15 + R3F + Three.js (WebGPU with WebGL fallback) project scaffold
- [ ] Scene: particle source, barrier, detection screen
- [ ] InstancedMesh particle system with interference pattern sampling
- [ ] Timeline scrubber (Zustand state + HTML slider)
- [ ] Observer toggle switching between wave and classical distributions
- [ ] Transition lerp animation (~1 second)
- [ ] OrbitControls with keyboard alternatives
- [ ] Adaptive quality detection (4 tiers)
- [ ] Leva parameter panel (slit width, separation, wavelength, emission rate)
- [ ] Basic particle glow shader (TSL)
- [ ] Detection screen accumulation shader (TSL)
- [ ] Shareable state URLs
- [ ] Screenshot (canvas.toBlob)
- [ ] `@react-three/a11y` shadow DOM layer
- [ ] A11yAnnouncer for state changes
- [ ] `prefers-reduced-motion` and `forced-colors` support
- [ ] Deploy to Vercel

### Phase 2: Visual Polish — Weeks 4–6

- [ ] Post-processing: bloom, depth of field (disabled on Low tier)
- [ ] Wave probability overlay (translucent TSL shader, toggle)
- [ ] Diffraction fan effect at slits
- [ ] Smooth wavelength-to-colour mapping (visible spectrum)
- [ ] Detection screen heatmap mode (alternative to dots)
- [ ] Improved particle trails
- [ ] Dark/light theme for UI overlay

### Phase 3: Educational Features — Weeks 6–9

- [ ] Guided tour mode with pre-generated Azure Speech narration
- [ ] Audio narration pipeline (build script → R2)
- [ ] Tone.js procedural particle sounds
- [ ] Spatial audio (THREE.PositionalAudio)
- [ ] Info hotspots (Drei `<Html>` pop-ups in 3D space)
- [ ] Quiz mode with exam-board-aligned questions
- [ ] Side-by-side mode (split canvas)
- [ ] Single photon mode (one-at-a-time with accumulation)
- [ ] Equation overlay (simple/advanced toggle)
- [ ] Data table alternative for accessibility
- [ ] Sonification of interference pattern
- [ ] Video recording (MediaRecorder)
- [ ] Museum mode (simplified UI, auto-reset, kiosk PWA)

### Phase 4: Internationalisation & Distribution — Weeks 9–12

- [ ] next-intl setup with all 11 UK school languages
- [ ] Microsoft Translator API integration for initial translations
- [ ] RTL support for Arabic and Urdu
- [ ] Welsh language compliance
- [ ] Crowdin integration with physics glossary
- [ ] LTI 1.3 integration via ltijs (Canvas, Moodle, Brightspace)
- [ ] Google Classroom API integration
- [ ] Microsoft Teams Education API integration
- [ ] Oak National Academy curriculum alignment metadata
- [ ] Umami analytics with custom education events
- [ ] Privacy policy (age-appropriate language)
- [ ] DPA template for schools

### Phase 5: Advanced Features (Post-Launch) — Weeks 12+

- [ ] AI tutor chatbot (Gemini Flash / Groq + OpenAI Moderation API)
  - DfE AI Safety Standards compliance
  - No anthropomorphism, no I-statements
  - Content filtering + activity logging
  - Child-development impact plan
- [ ] Multiple slit modes (single, triple, diffraction grating)
- [ ] Delayed choice experiment
- [ ] Quantum eraser demonstration
- [ ] WebXR / VR mode (@react-three/xr v6)
- [ ] Classroom dashboard (teacher analytics, Supabase)
- [ ] xAPI learning record statements

---

## 17. CODING RULES FOR CLAUDE CODE / CURSOR

### DO:
- Always use R3F declarative syntax, never imperative Three.js
- Use `useFrame` for animation loops, never `requestAnimationFrame`
- Use `InstancedMesh` for particles, never individual meshes
- Use TSL for all custom shaders (compiles to WGSL + GLSL)
- All simulation parameters in Zustand store, accessed via selectors
- TypeScript strict mode with no `any` types
- Web Workers for heavy computation (particle buffer recomputation)
- Debounce parameter changes by 200ms before recomputing
- Test every feature on "Low" quality tier (Celeron Chromebook baseline)
- Provide keyboard alternatives for ALL mouse interactions
- Use `aria-live` announcements for all significant state changes
- Use `next-intl` `useTranslations()` for all user-facing strings
- Keep components small — one component per 3D object or UI element

### DON'T:
- Don't use `requestAnimationFrame` — use R3F's `useFrame`
- Don't create individual meshes for particles — use InstancedMesh
- Don't write GLSL directly — use TSL
- Don't call TTS APIs at runtime — use pre-generated audio
- Don't collect personal data — Umami anonymous events only
- Don't store state in React context — use Zustand
- Don't use `preserveDrawingBuffer: true` — capture synchronously instead
- Don't assume WebGPU is available — always handle WebGL fallback
- Don't block the main thread — offload to Web Workers
- Don't hardcode English strings — use i18n keys
- Don't flash anything more than 3 times per second
- Don't use session recordings, cookies, or fingerprinting
- Don't anthropomorphise any AI feature (DfE requirement)

---

## 18. ENVIRONMENT VARIABLES

```env
# Azure Speech (build-time narration generation only)
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=uksouth

# Cloudflare R2 (asset storage)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=double-slit-assets

# Umami Analytics
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
NEXT_PUBLIC_UMAMI_URL=

# Microsoft Translator (build-time translation)
AZURE_TRANSLATOR_KEY=
AZURE_TRANSLATOR_REGION=uksouth

# Phase 2: AI Tutor (not needed for MVP)
# GOOGLE_AI_API_KEY=
# OPENAI_API_KEY=           # For Moderation API only
```

---

## 19. KEY REFERENCES

- **Interference formula:** `I(θ) = I₀ × cos²(πd·sin(θ)/λ) × sinc²(πa·sin(θ)/λ)`
- **Three.js WebGPU:** `import * as THREE from 'three/webgpu'`
- **TSL guide:** https://threejsroadmap.com/blog/tsl-a-better-way-to-write-shaders-in-threejs
- **R3F docs:** https://r3f.docs.pmnd.rs/
- **Drei docs:** https://drei.docs.pmnd.rs/
- **@react-three/a11y:** https://docs.pmnd.rs/a11y/introduction
- **@react-three/xr v6:** https://pmnd.rs/blog/reintroducing-react-three-xr
- **ICO Children's Code:** https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/
- **DfE AI Safety Standards:** Search "DfE Generative AI Product Safety Standards 2026"
- **PhET (benchmark competitor):** https://phet.colorado.edu/en/simulations/wave-interference
- **ltijs (LTI 1.3):** https://www.npmjs.com/package/ltijs
- **next-intl:** https://next-intl.dev/
- **Tone.js:** https://tonejs.github.io/
- **Umami:** https://umami.is/
