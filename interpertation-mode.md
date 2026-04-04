# INTERPRETATION OVERLAY MODE
## Double-Slit Experiment — Multi-Interpretation Visualiser
### Feature Spec & Research Document

---

## 1. WHY THIS FEATURE MATTERS

In July 2025, Nature published the largest-ever survey of physicists on quantum interpretation. Over 1,100 researchers responded. The results were striking:

- **36%** favoured the Copenhagen interpretation
- **15%** favoured Many-Worlds
- **47%** said the wavefunction is "simply a useful tool" (not representing reality)
- **36%** said the wavefunction represents "something real"
- **45%** said there IS a boundary between quantum and classical worlds
- **45%** said there IS NOT
- Only **24%** were confident their chosen interpretation was correct
- **75%** believed quantum mechanics will eventually be replaced by a more comprehensive theory

As physicist Gemma De les Coves put it: "I find it remarkable that people who are very knowledgeable about quantum theory can be convinced of completely opposite views."

**This is the entire point of the feature.** The same experiment, the same maths, the same interference pattern — but radically different stories about what's actually happening. Your app doesn't pick a side. It shows all of them. That's more honest than anything currently in the educational space.

---

## 2. THE FIVE INTERPRETATIONS

Each interpretation is a visual "lens" the user can toggle. The particle trajectories, the detection pattern, and the maths are identical. What changes is the visual narrative overlay — what the user sees happening *between* the source and the screen.

---

### 2.1 COPENHAGEN INTERPRETATION (1927)
**Bohr, Heisenberg, Born**

#### The Story
The particle has no definite path. Between emission and detection, it exists as a probability wave described by the wavefunction ψ. The wavefunction passes through both slits simultaneously and interferes with itself. At the moment of detection (hitting the screen), the wavefunction "collapses" — the particle materialises at a specific point, with probability proportional to |ψ|².

When a detector is placed at the slits (observer mode), the wavefunction collapses *at the slit*, forcing the particle through one slit or the other. No superposition → no interference.

#### Visual Representation
- **Unobserved:** Particle emits as a dot, then dissolves into a translucent expanding wave (probability cloud). The wave passes through both slits, diffracts, and interferes. At the detection screen, the wave "pops" back into a single dot at a position sampled from |ψ|².
- **Observed:** Particle stays as a solid dot the entire journey. Goes through one slit. No wave shown.
- **Colour coding:** Probability wave in soft blue/cyan with opacity mapped to |ψ|²
- **Key visual moment:** The "collapse" — wave snapping to a point — should be dramatic. A brief flash/pulse at the detection point.

#### What It Explains Well
- Why measurement changes the outcome
- Why individual particle positions are random but follow a statistical pattern
- Practical "shut up and calculate" usefulness

#### What It Doesn't Explain
- What physically causes collapse
- What the wavefunction IS (real thing or mathematical tool?)
- The "measurement problem" — why should a detector be special?

#### Key Quote for UI
*"There is no quantum world. There is only an abstract quantum physical description."* — Niels Bohr

---

### 2.2 MANY-WORLDS INTERPRETATION (1957)
**Hugh Everett III**

#### The Story
The wavefunction is real and never collapses. When a quantum event has multiple possible outcomes, the universe branches. ALL outcomes happen — each in its own branch. In the double-slit experiment, the particle goes through both slits in every branch. At the detection screen, each possible landing position corresponds to a branch of the universe. You (the observer) end up in one branch, seeing one outcome, but every other outcome is equally real in parallel branches.

When a detector is placed at the slits, the universe branches at that point. In one branch, the particle went through slit A; in another, slit B. Each branch then produces its own single-slit pattern. You only see one branch.

#### Visual Representation
- **Unobserved:** Particle travels as a solid dot but the scene subtly splits — a ghostly "branching tree" visual behind the experiment. Multiple translucent copies of the particle path diverge after passing through the slits. All copies are equally "real" (equal opacity). The detection screen shows the full interference pattern with a label: "All branches combined."
- **Observed:** At the detector, the scene visually forks into two semi-transparent parallel "universes" shown side by side or stacked. Each shows the particle going through one slit. The user is highlighted as being "in this branch" with the other branch greyed out.
- **Colour coding:** Branches in green/emerald tones. Active branch fully saturated, other branches desaturated.
- **Key visual moment:** The "branch" — reality splitting like a forking river. Not a collapse, but a divergence.

#### What It Explains Well
- No collapse needed — pure unitary evolution of the Schrödinger equation
- No special role for observers or measurement
- Naturally explains quantum computing (parallel computation across branches)

#### What It Doesn't Explain
- Where the probability rule (Born rule) comes from — why do we experience branch frequencies that match |ψ|²?
- Why we never perceive other branches
- Ontological extravagance — infinite unobservable universes (Occam's razor concerns)

#### Key Quote for UI
*"The universe is constantly splitting into a stupendous number of branches. Every quantum transition... is splitting the world."* — Bryce DeWitt (popularising Everett)

---

### 2.3 PILOT WAVE / DE BROGLIE-BOHM (1927/1952)
**Louis de Broglie, David Bohm**

#### The Story
The particle is ALWAYS a real particle with a definite position and trajectory. But it's guided by a real physical wave — the "pilot wave." The pilot wave passes through both slits and creates an interference pattern in the guiding field. The particle surfs along this wave, following a deterministic path dictated by the wave's shape. Different starting positions lead to different trajectories, but all trajectories are channelled by the interference pattern into the bright bands.

This is the only major interpretation that's fully deterministic. No randomness — the apparent randomness comes from not knowing the particle's exact initial position.

When a detector is placed at the slits, it disturbs the pilot wave, destroying the interference pattern in the guiding field. The particle is then guided to a non-interfering trajectory.

#### Visual Representation
- **Unobserved:** Both the particle AND the wave are shown simultaneously. The pilot wave (translucent, rippling) passes through both slits. The particle (solid dot) rides along one specific trajectory through one slit, but its path curves and bends according to the wave's interference pattern. Show multiple particle trajectories (thin lines) fanning out from the source, each following a different but deterministic path. The trajectories cluster in the bright bands and avoid the dark bands.
- **Observed:** Detector at slit disrupts the pilot wave. The wave pattern flattens. Trajectories become straight (no interference-guided bending).
- **Colour coding:** Pilot wave in warm amber/gold. Particle trajectories as fine white or orange lines.
- **Key visual moment:** The trajectory of a single particle visibly curving away from the dark bands, guided by the wave it can't "see."

#### What It Explains Well
- Particles always have definite positions — no existential crisis
- Deterministic — same initial conditions always give same result
- The wave is physically real and explains interference
- Measurement naturally explained — detectors disturb the pilot wave

#### What It Doesn't Explain
- Requires non-locality (the pilot wave exists in configuration space, not 3D space — for multi-particle systems this gets very strange)
- The pilot wave influences the particle but the particle doesn't influence the wave (one-way causation)
- Less natural extension to quantum field theory
- Why should the initial positions be distributed as |ψ|²? (quantum equilibrium hypothesis)

#### Key Quote for UI
*"Is it not clear from the smallness of the scintillation on the screen that we have to do with a particle? And is it not clear, from the diffraction and interference patterns, that the motion of the particle is directed by a wave?"* — John Bell

---

### 2.4 DECOHERENCE / EINSELECTION (1970s–present)
**H. Dieter Zeh, Wojciech Zurek**

#### The Story
Decoherence isn't an "interpretation" per se — it's a physical mechanism that all interpretations now incorporate. But it deserves its own visual layer because it answers the question kids always ask: "Why don't WE behave like quantum particles?"

The answer: any quantum system that interacts with its environment (air molecules, photons, thermal radiation) rapidly loses its quantum coherence. The off-diagonal terms of the density matrix decay exponentially. The superposition doesn't disappear — it spreads into the environment and becomes practically impossible to observe.

In the double-slit experiment: the particle maintains coherence in vacuum between source and screen (hence interference). But a detector at the slits introduces environmental coupling — the detector's atoms become entangled with the particle's "which-slit" information. This entanglement with the environment destroys the interference.

#### Visual Representation
- **Unobserved:** The particle travels in vacuum (shown as clean, empty space). Its wave nature is preserved (probability wave visible). The environment is absent — no stray particles or noise.
- **Observed:** When the detector activates, show a swarm of tiny "environment particles" (air molecules, photons) flooding the slit area. These entangle with the particle — visualised as thin connecting lines or a web spreading outward. The clean wave pattern becomes "noisy" and decoheres into a classical pattern. The information about which slit has leaked into the environment.
- **Colour coding:** Environment particles in red/orange. Entanglement web in dim red threads.
- **Key visual moment:** The "decoherence cascade" — watching the clean quantum wave dissolve into noise as environment particles swarm in. This is the most physically accurate visualisation of what actually happens.

#### What It Explains Well
- WHY observation destroys interference (not magic — it's physical entanglement with the environment)
- Why large objects don't show quantum effects (they're constantly decohering)
- The transition from quantum to classical is gradual, not a sudden "collapse"
- Explains preferred basis — why we see objects in definite positions, not in momentum superpositions

#### What It Doesn't Explain
- Decoherence alone doesn't solve the measurement problem — it explains why you don't see interference, but not why you see ONE specific outcome
- Still needs an interpretation on top (Copenhagen + decoherence, Many-Worlds + decoherence, etc.)

#### Key Quote for UI
*"Decoherence is the key to understanding the transition from quantum to classical."* — Wojciech Zurek

---

### 2.5 QBism / INFORMATION-THEORETIC (2002–present)
**Christopher Fuchs, N. David Mermin, Rüdiger Schack**

#### The Story
QBism (Quantum Bayesianism) takes the most radical epistemic position: the wavefunction doesn't describe reality at all. It describes YOUR beliefs about what will happen when you interact with a system. Quantum mechanics is a user's manual for navigating experience, not a map of reality.

The interference pattern isn't evidence that the particle "went through both slits." It's evidence that your probabilistic expectations (encoded in ψ) correctly predict the distribution of outcomes. When you add a detector, your expectations change — not because reality changed, but because you now have different information.

In the July 2025 Nature survey, 47% of physicists said the wavefunction is "simply a useful tool" — this is essentially the QBist-adjacent position.

#### Visual Representation
- **Unobserved:** The entire scene is rendered from a first-person perspective or with a highlighted "observer" avatar. The particle path is shown as a cloud of possibilities — not a physical wave, but a visual representation of uncertainty. The emphasis is on the observer's state of knowledge, not the particle.
- **Observed:** The observer gains information. The cloud of possibilities narrows. No dramatic "collapse" — just an update of beliefs, like Bayesian inference. Smooth and anticlimactic by design.
- **Colour coding:** Soft purple/violet tones. Observer highlighted in white.
- **Key visual moment:** The absence of drama. The point is that nothing physically changes — only the observer's knowledge updates. This is intentionally anticlimactic as a contrast to Copenhagen's dramatic collapse.

#### What It Explains Well
- No measurement problem (measurement is just information update)
- No non-locality concerns
- Pragmatically clean — aligns with how physicists actually use quantum mechanics in practice
- Avoids all metaphysical baggage

#### What It Doesn't Explain
- Why does the universe produce experiences that are SO well-described by quantum probability rules? If ψ is just about beliefs, why are those beliefs so constrained?
- Dangerously close to solipsism for many physicists' comfort
- Doesn't answer "what IS happening?" — deliberately refuses to

#### Key Quote for UI
*"There is no quantum world. There is only an abstract quantum physical description."* — Anton Zeilinger (2025 Heligoland centenary event)

---

## 3. UI/UX DESIGN FOR THE OVERLAY

### 3.1 Interpretation Selector

A horizontal tab bar or pill selector at the top of the screen:

```
[ Copenhagen ] [ Many-Worlds ] [ Pilot Wave ] [ Decoherence ] [ QBism ]
```

Each tab has a distinct colour accent matching its visual coding. Active tab fills solid.

### 3.2 Split/Compare Mode

Two-panel split screen. Left panel: one interpretation. Right panel: another. Same simulation running synchronised. Same particle hitting the screen at the same position in both views — but the "story" of how it got there is different.

This is the money feature. When a kid sees the same outcome explained five different ways, that's when the penny drops about what "interpretation" means in physics.

### 3.3 Info Panel

Slide-out panel from the right:
- **Name & Date** — who proposed it, when
- **The Story** — 2-3 sentence plain English explanation
- **What's Happening** — real-time narration of what the current visual shows
- **Strengths** — what this interpretation explains well (checkmarks)
- **Weaknesses** — what it struggles with (question marks)
- **Physicist Support** — percentage from the 2025 Nature survey
- **Key Quote** — one memorable quote
- **Difficulty Level** — KS3 / GCSE / A-Level / Undergraduate tags

### 3.4 Timeline Integration

The interpretation overlay works with the existing timeline scrubber. As you drag through time:
- Copenhagen: wave expands, collapses on impact
- Many-Worlds: branches multiply
- Pilot Wave: trajectory extends
- Decoherence: environment particles accumulate
- QBism: knowledge cloud evolves

### 3.5 Guided Tour: "The Great Debate"

A 5-minute narrated walkthrough:

1. **"Let's fire a photon."** — Show particle hitting the screen (no interpretation yet)
2. **"Simple, right? Now let's do it a thousand times."** — Speed up. Interference pattern emerges.
3. **"Here's where it gets weird."** — Activate observer. Pattern changes.
4. **"Every physicist agrees on WHAT happens. They disagree on WHY."** — Tab through interpretations one by one.
5. **"Copenhagen says..."** — Show Copenhagen overlay with narration.
6. **"But Everett said..."** — Switch to Many-Worlds.
7. **"Bohm had a different idea..."** — Switch to Pilot Wave.
8. **"And here's what's actually happening physically..."** — Switch to Decoherence.
9. **"Some physicists say we're asking the wrong question entirely..."** — Switch to QBism.
10. **"In 2025, Nature surveyed over 1,100 physicists. Here's what they said..."** — Show the survey results as an animated bar chart overlaid on the scene.
11. **"Only 24% were confident in their answer. This is the frontier. Maybe YOU will figure it out."** — End with all five overlays cycling.

---

## 4. TECHNICAL IMPLEMENTATION

### 4.1 State Schema (Zustand)

```typescript
interface InterpretationState {
  activeInterpretation: 'copenhagen' | 'many-worlds' | 'pilot-wave' | 'decoherence' | 'qbism';
  compareMode: boolean;
  compareLeft: InterpretationType;
  compareRight: InterpretationType;
  showInfoPanel: boolean;
  guidedTourActive: boolean;
  guidedTourStep: number;
  overlayOpacity: number;        // 0-1, for fading between interpretations
  showTrajectories: boolean;     // pilot wave paths
  showBranches: boolean;         // many worlds branching
  showWavefunction: boolean;     // copenhagen probability wave
  showEnvironment: boolean;      // decoherence particles
  showKnowledgeCloud: boolean;   // qbism belief state
}
```

### 4.2 Component Architecture

```
<InterpretationOverlay>
  <CopenhagenLayer />       // Probability wave + collapse flash
  <ManyWorldsLayer />       // Branch tree + ghost particles
  <PilotWaveLayer />        // Trajectory lines + guide wave
  <DecoherenceLayer />      // Environment particles + entanglement web
  <QBismLayer />            // Knowledge cloud + observer avatar
</InterpretationOverlay>
```

Each layer is a React component that renders Three.js objects. Only the active layer(s) are visible. Layers share the same particle positions (from the core simulation) but add their own visual narrative on top.

### 4.3 Shader Requirements

| Interpretation | Shader Needed | Description |
|---------------|--------------|-------------|
| Copenhagen | `wavefunctionCollapse.glsl` | Expanding probability wave → point collapse with flash |
| Many-Worlds | `branchTree.glsl` | Forking path visualisation with transparency falloff |
| Pilot Wave | `guidingField.glsl` | 2D wave field + trajectory particles following gradient |
| Decoherence | `entanglementWeb.glsl` | Connecting lines between detector and environment particles |
| QBism | `knowledgeCloud.glsl` | Soft volumetric cloud that sharpens on "measurement" |

### 4.4 Performance Considerations

- Only render the active interpretation layer (no hidden GPU work)
- Pilot Wave trajectories: pre-compute on Web Worker, pass as buffer geometry
- Many-Worlds branches: cap at 8 visible branches, fade older ones
- Decoherence particles: use InstancedMesh (same as main particle system)
- LOD (Level of Detail): reduce overlay complexity on mobile/low-end GPU

---

## 5. THE MATHS BEHIND EACH VISUALISATION

### 5.1 Shared: Interference Pattern

All interpretations produce the same detection pattern:

```
I(y) = I₀ · cos²(π·d·y / (λ·L)) · sinc²(π·a·y / (λ·L))
```

Where:
- `y` = position on detection screen
- `d` = slit separation
- `a` = slit width
- `λ` = wavelength
- `L` = distance from slits to screen

Particle landing positions are sampled from this distribution using rejection sampling.

### 5.2 Copenhagen: Wavefunction Evolution

The free-space propagation of a Gaussian wavepacket:

```
ψ(x,t) = (2πσ²(t))^(-1/4) · exp(-x²/(4σ²(t)) + ikx - iωt)
```

Where `σ(t) = σ₀√(1 + (ℏt/2mσ₀²)²)` describes the spreading.

After the slits, superpose two such wavepackets (one per slit) and compute |ψ₁ + ψ₂|² for the probability distribution.

### 5.3 Pilot Wave: Bohmian Trajectories

The velocity field guiding particles:

```
v(x,t) = (ℏ/m) · Im(∇ψ/ψ)
```

Integrate this ODE numerically (4th-order Runge-Kutta) from different initial positions to get the deterministic trajectories. Initial positions distributed as |ψ(x,0)|².

The trajectories will naturally cluster in bright bands and avoid dark bands — this is the visual proof that pilot wave theory reproduces the interference pattern without the particle going through both slits.

### 5.4 Decoherence: Off-Diagonal Decay

The density matrix evolves as:

```
ρ(t) = |ψ₁|²|1⟩⟨1| + |ψ₂|²|2⟩⟨2| + ψ₁ψ₂*·e^(-t/τ_d)|1⟩⟨2| + h.c.
```

Where `τ_d` is the decoherence time. As `t/τ_d` increases, the off-diagonal (interference) terms vanish exponentially. Visually: the interference pattern smoothly fades into two Gaussian bumps.

The decoherence time depends on the environment:
- Air at room temperature: `τ_d ≈ 10⁻³⁰ s` (essentially instant for macroscopic objects)
- Hard vacuum: `τ_d` can be very long (hence why the experiment works in vacuum)

### 5.5 Many-Worlds: Branch Weights

Each branch has a "weight" given by the squared amplitude:

```
Branch A (slit 1): weight = |α|² = |⟨1|ψ⟩|²
Branch B (slit 2): weight = |β|² = |⟨2|ψ⟩|²
```

For symmetric slits: both weights = 0.5. Visually represent this with equal opacity for both branch overlays.

---

## 6. EDUCATIONAL ALIGNMENT

### UK National Curriculum Links

| Key Stage | Topic | How This Feature Helps |
|-----------|-------|----------------------|
| KS3 (11-14) | Waves: properties and behaviour | Visualises wave interference and diffraction in a tangible way |
| KS4 / GCSE (14-16) | Particle model of matter; wave properties | Shows wave-particle duality. Observer effect introduces quantum concepts. |
| A-Level (16-18) | Quantum physics: photon model, wave-particle duality, de Broglie wavelength | Full interpretations mode. Pilot wave trajectories. Decoherence. Born rule. |
| Undergraduate | Quantum mechanics: Schrödinger equation, measurement problem, density matrices | Full mathematical overlay. Decoherence timescales. Bohmian mechanics. |

### Learning Outcomes per Interpretation

**Copenhagen (KS4+):**
- Understand that quantum objects don't have definite properties until measured
- Explain why the interference pattern disappears when "which-slit" information is obtained

**Many-Worlds (A-Level+):**
- Understand that interpretations are not the same as the theory itself
- Critically evaluate the ontological cost of different interpretations

**Pilot Wave (A-Level+):**
- Understand that deterministic hidden-variable theories can reproduce quantum predictions
- Recognise the difference between "no definite path" (Copenhagen) and "definite but unknown path" (Bohm)

**Decoherence (A-Level+):**
- Explain the quantum-to-classical transition without invoking consciousness
- Understand entanglement as information leakage to the environment

**QBism (Undergraduate+):**
- Engage with the epistemology of physics — what does a theory need to "explain"?
- Understand the distinction between ontic and epistemic interpretations

---

## 7. THE HONEST TAKE: WHAT YOUR APP CAN AND CAN'T DO

### What it CAN do:
- Show that the measurement problem is genuinely unresolved in mainstream physics (2025 Nature survey: no consensus)
- Let users experience the same data through different interpretive lenses
- Demonstrate that the interference pattern is fully explained by known wave mathematics — no hidden code to crack
- Make the measurement problem viscerally felt (observer toggle)
- Show that pilot wave theory offers definite trajectories reproducing all quantum predictions
- Visualise decoherence as a physical process (not mystical consciousness stuff)
- Inspire the next generation to take these questions seriously

### What it CANNOT do:
- Determine which interpretation is correct (nobody can — they all predict the same experimental results)
- Extract information about "other universes" from the interference pattern (Many-Worlds explicitly states branches are non-communicating)
- "Decode" the fringe pattern beyond what the input parameters determine (the pattern is fully specified by d, a, λ, and L)
- Prove or disprove consciousness-based collapse theories (no experiment has done this)

### What WOULD resolve it:
The measurement problem will likely be solved by:
- New experiments testing objective collapse models (e.g., Penrose's gravitational collapse proposal — testable within our lifetime)
- Macroscopic superposition experiments (increasingly large objects placed in superposition — current record: objects visible to the naked eye)
- Quantum gravity theory (may force a specific interpretation)
- Something nobody has thought of yet — which is why getting kids excited about this matters

---

## 8. RESEARCH SOURCES

### Survey Data
- Gibney, E. (2025). "Physicists disagree wildly on what quantum mechanics says about reality." Nature 643, 1175–1179.
- Sharoglazova, V., et al. (2025). "Has Anything Changed? Tracking Long-Term Interpretational Preferences." Foundations of Science.
- Schlosshauer, M., Kofler, J., & Zeilinger, A. (2013). "A Snapshot of Foundational Attitudes Toward Quantum Mechanics." Studies in History and Philosophy of Science.

### Interpretations (Primary)
- Bohr, N. (1928). "The Quantum Postulate and the Recent Development of Atomic Theory." Nature.
- Everett, H. (1957). "Relative State Formulation of Quantum Mechanics." Reviews of Modern Physics.
- Bohm, D. (1952). "A Suggested Interpretation of the Quantum Theory in Terms of Hidden Variables." Physical Review.
- Zurek, W. (2003). "Decoherence, einselection, and the quantum origins of the classical." Reviews of Modern Physics.
- Fuchs, C., Mermin, N.D., & Schack, R. (2014). "An Introduction to QBism." American Journal of Physics.

### Educational Physics Simulations
- PhET Interactive Simulations — phet.colorado.edu
- Quantum Flytrap Virtual Lab — quantumflytrap.com
- Open Source Physics (ComPADRE) — compadre.org/osp
- Aaronson, S. — Lecture notes on Interpretations of QM (MIT/UT Austin)

### Technical
- React Three Fiber documentation — r3f.docs.pmnd.rs
- Three.js documentation — threejs.org/docs
- Leva GUI library — github.com/pmndrs/leva

---

*This document is the INTERPRETATION-MODE.md companion to your DOUBLE-SLIT-APP-RESEARCH.md. Together they form the full CONTEXT for the venture pipeline. Ready for SPEC.md and AGENTS.md when you are.*
