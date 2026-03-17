# PitchPlease — Implementation Plan v2

## Current State Assessment

### What Exists and Carries Forward
The Phase 1 build is solid. These modules carry forward with minimal changes:

| Module | Status | Notes |
|---|---|---|
| `js/audio/mic.js` | **Keep as-is** | Clean singleton, raw audio constraints, works well |
| `js/audio/detector.js` | **Keep as-is** | pitchy integration, emits pitch/silence events correctly |
| `js/audio/note-math.js` | **Keep as-is** | Frequency ↔ MIDI ↔ note math, all pure functions |
| `js/audio/pitch-buffer.js` | **Keep as-is** | Circular buffer for graph data, works |
| `js/utils/event-bus.js` | **Keep as-is** | Clean pub/sub, used everywhere |
| `js/utils/constants.js` | **Extend** | Add new event names, exercise-related constants |
| `js/utils/scales.js` | **Extend** | Add scale metadata for session generator |
| `js/utils/store.js` | **Keep as-is** | localStorage wrapper with pp: namespace |
| `js/utils/dom.js` | **Keep as-is** | qs/qsa/showToast helpers |
| `js/components/needle.js` | **Keep as-is** | Tuner needle, standalone |
| `js/components/note-display.js` | **Keep as-is** | Note name display, standalone |
| `js/components/frequency-display.js` | **Keep as-is** | Hz readout, standalone |
| `js/views/tuner-view.js` | **Keep as-is** | Standalone tuner, no changes needed |
| `css/tokens.css` | **Extend** | Add new tokens for session UI, renderers |

### What Gets Refactored
| Module | Change | Reason |
|---|---|---|
| `js/audio/song-engine.js` | **Refactor → exercise runtime** | The tick loop, scoring, and note-tracking logic is the seed of the exercise runtime. Extract the core loop and make it config-driven. |
| `js/components/game-canvas.js` | **Refactor → scroll-targets renderer** | The scrolling bars and player trail rendering is excellent. Extract it as one of several renderers behind a common interface. |
| `js/components/pitch-graph.js` | **Refactor → pitch-trail renderer** | Already nearly a standalone renderer. Wrap it in the renderer interface. |
| `js/views/game-view.js` | **Replace → session-view** | Currently wires song engine to game canvas with custom controls. Replace with a view that wires the exercise runtime to whatever renderer the exercise config specifies. |
| `js/views/library-view.js` | **Replace → practice-view** | Currently has practice configurator + song list. Replace with session launcher (today's session, templates, quick start). |
| `js/utils/exercise-generator.js` | **Extend** | Currently generates scale sequences. Expand to generate full exercise configs for all types. |
| `js/utils/song-data.js` | **Deprecate gradually** | Starter songs move to a curated songs module. Exercise configs replace the song format for practice. |
| `js/app.js` | **Extend** | Add new views (session, journal, profile), update navigation |
| `index.html` | **Extend** | Add new view containers, update nav |

### What's New
| Module | Purpose |
|---|---|
| `js/core/exercise-schema.js` | Exercise config validation, defaults, type definitions |
| `js/core/exercise-runtime.js` | The engine: interprets exercise configs, manages lifecycle |
| `js/core/evaluators/*.js` | Pitch evaluation strategies (target-accuracy, stability, phrase-match, etc.) |
| `js/core/measurements.js` | Standardized measurement output format |
| `js/core/session-runner.js` | Manages exercise sequencing, transitions, timing |
| `js/core/session-templates.js` | Curated session template definitions |
| `js/renderers/renderer-base.js` | Shared renderer interface and canvas utilities |
| `js/renderers/scroll-targets.js` | Extracted from game-canvas |
| `js/renderers/seismograph.js` | New: stability trace for long tones |
| `js/renderers/flash-card.js` | New: large prompt display for reactive exercises |
| `js/renderers/overlay-comparison.js` | New: echo playback comparison |
| `js/renderers/pitch-trail.js` | Extracted from pitch-graph |
| `js/audio/synth.js` | New: oscillator output for drones and phrase playback |
| `js/profile/profile.js` | User profile model and persistence |
| `js/profile/history.js` | Practice history storage and queries |
| `js/profile/skill-model.js` | Skill map derivation from measurements |
| `js/generation/session-generator.js` | Builds personalized sessions from profile |
| `js/generation/difficulty.js` | Maps skill levels to exercise difficulty configs |
| `js/views/session-view.js` | Full-screen exercise/session runner UI |
| `js/views/practice-view.js` | Session launcher, templates, quick start |
| `js/views/journal-view.js` | Practice history and progress visualization |
| `js/views/profile-view.js` | Profile setup and preferences |

---

## Target File Structure

```
PitchPlease/
├── index.html
├── manifest.json
├── sw.js
├── PRD.md
├── IMPLEMENTATION_PLAN.md
├── CLAUDE.md
│
├── css/
│   ├── reset.css
│   ├── tokens.css          (extended with new design tokens)
│   ├── layout.css           (extended with new views)
│   ├── tuner.css
│   ├── graph.css
│   ├── session.css          (new — session runner UI)
│   ├── practice.css         (new — session launcher)
│   ├── journal.css          (new — progress view)
│   └── profile.css          (new — profile setup)
│
├── js/
│   ├── app.js               (extended — new views and nav)
│   │
│   ├── audio/
│   │   ├── mic.js           (unchanged)
│   │   ├── detector.js      (unchanged)
│   │   ├── note-math.js     (unchanged)
│   │   ├── pitch-buffer.js  (unchanged)
│   │   └── synth.js         (new — oscillator output)
│   │
│   ├── core/                (new — the engine)
│   │   ├── exercise-schema.js
│   │   ├── exercise-runtime.js
│   │   ├── session-runner.js
│   │   ├── session-templates.js
│   │   ├── measurements.js
│   │   └── evaluators/
│   │       ├── target-accuracy.js
│   │       ├── stability.js
│   │       ├── phrase-match.js
│   │       ├── interval-accuracy.js
│   │       └── reaction-time.js
│   │
│   ├── renderers/           (new — visual display layer)
│   │   ├── renderer-base.js
│   │   ├── scroll-targets.js
│   │   ├── seismograph.js
│   │   ├── flash-card.js
│   │   ├── overlay-comparison.js
│   │   ├── pitch-trail.js
│   │   └── pitch-trace.js
│   │
│   ├── profile/             (new — user model)
│   │   ├── profile.js
│   │   ├── history.js
│   │   └── skill-model.js
│   │
│   ├── generation/          (new — intelligent sessions)
│   │   ├── session-generator.js
│   │   └── difficulty.js
│   │
│   ├── components/          (legacy — still used by tuner)
│   │   ├── needle.js        (unchanged)
│   │   ├── note-display.js  (unchanged)
│   │   ├── frequency-display.js (unchanged)
│   │   ├── game-canvas.js   (deprecated — logic moves to scroll-targets renderer)
│   │   └── pitch-graph.js   (deprecated — logic moves to pitch-trail renderer)
│   │
│   ├── views/
│   │   ├── tuner-view.js    (unchanged)
│   │   ├── graph-view.js    (updated — uses pitch-trail renderer)
│   │   ├── session-view.js  (new — runs exercises and sessions)
│   │   ├── practice-view.js (new — replaces library-view)
│   │   ├── journal-view.js  (new — progress and history)
│   │   ├── profile-view.js  (new — profile setup)
│   │   ├── game-view.js     (deprecated — absorbed by session-view)
│   │   └── library-view.js  (deprecated — replaced by practice-view)
│   │
│   └── utils/
│       ├── event-bus.js     (unchanged)
│       ├── constants.js     (extended)
│       ├── dom.js           (unchanged)
│       ├── scales.js        (extended)
│       ├── store.js         (unchanged)
│       ├── exercise-generator.js (extended — generates full exercise configs)
│       └── song-data.js     (retained for backward compat, not extended)
│
└── assets/
    └── icons/
```

---

## Implementation Phases

Each phase produces a working, testable app. No phase breaks existing functionality until its replacement is ready. Deprecated modules are removed only after their replacement is proven.

---

### Phase 1: Exercise Runtime Core
**Goal**: A config-driven engine that can run the existing scale runner exercise.

**Why first**: This is the foundation. Every subsequent feature depends on the exercise runtime. Building it against the existing scale runner exercise validates the architecture with known-working behavior.

#### 1.1 Exercise Schema
**File**: `js/core/exercise-schema.js`
- Define the ExerciseConfig type (as JSDoc, not TypeScript — no build step)
- Validation function: `validateExercise(config) → { valid, errors }`
- Default values for optional fields
- Helper: `createSequenceExercise(params)` — shorthand for the common case

#### 1.2 Target Accuracy Evaluator
**File**: `js/core/evaluators/target-accuracy.js`
- Extract scoring logic from `song-engine.js`
- Interface: `create(config) → { onPitch(pitchData, targetNote), getScore(), reset() }`
- Produces measurements: cents-avg, notes-hit-pct, per-note scores
- Supports both player-driven and fixed-tempo timing
- **Player-driven mode**: note advances when player sustains the target pitch for `holdMs` (default 300ms). No time limit per note. Track time-to-hit as a metric.
- **Fixed-tempo mode**: note advances on timer (backward compat with current scroll behavior)

#### 1.3 Exercise Runtime
**File**: `js/core/exercise-runtime.js`
- Interface:
  - `create(exerciseConfig, evaluator, renderer) → runtime`
  - `runtime.start()` — begins the exercise
  - `runtime.pause()` / `runtime.resume()`
  - `runtime.stop() → measurements`
  - `runtime.onComplete(callback)` — called when exercise finishes (duration elapsed or all notes complete)
- Subscribes to `pitch` and `silence` events from the bus
- Calls `evaluator.onPitch()` each frame
- Calls `renderer.update()` each frame
- Manages exercise state: `idle → countdown → running → paused → complete`
- Emits: `exercise:start`, `exercise:tick`, `exercise:note-complete`, `exercise:complete`
- Loop mode: restarts on complete if `config.loop === true`

#### 1.4 Measurements
**File**: `js/core/measurements.js`
- Standardized measurement format:
  ```
  {
    exerciseId, timestamp, duration,
    metrics: { 'cents-avg': number, 'notes-hit-pct': number, ... },
    perNote: [{ note, cents, hitTime, held, score }],
    skills: { pitchAccuracy: delta, scaleFluency: delta, ... }
  }
  ```
- Skill delta computation: how much should each skill dimension change based on these measurements

#### 1.5 Integration Test
- Create an exercise config equivalent to the current practice mode settings
- Wire exercise runtime to the existing game-canvas (not yet refactored)
- Verify identical behavior to current game-view
- This is a validation step, not a user-facing change

**Definition of done**: A `sequence` exercise with `target-accuracy` evaluator runs through the game-canvas and produces the same scoring behavior as the current game-view. The exercise is driven by a config object, not hardcoded logic.

---

### Phase 2: Renderer Abstraction
**Goal**: Multiple visual presentations of exercises, swappable by config.

#### 2.1 Renderer Base
**File**: `js/renderers/renderer-base.js`
- Shared canvas setup: DPI scaling, resize handling, color/font helpers
- Interface definition (documented, not enforced via class inheritance):
  - `init(canvasElement, config)` — set up
  - `start()` — begin animation loop
  - `update(pitchData, exerciseState)` — called each frame by exercise runtime
  - `stop()` — halt animation
  - `destroy()` — cleanup
  - `transitionIn()` / `transitionOut()` — for session transitions
- Shared color mapping: cents → color using tokens.css values
- Shared note label rendering

#### 2.2 Scroll-Targets Renderer
**File**: `js/renderers/scroll-targets.js`
- Extract rendering logic from `game-canvas.js`
- Adapt to renderer interface
- **New: player-driven mode** — bars scroll to play zone and wait there. When the player matches the note (sustains for holdMs), the bar lights up and the next one slides in. No time-based scrolling in this mode.
- Fixed-tempo mode preserves current scrolling behavior
- Same visual style: colored bars, player trail dots, score badges

#### 2.3 Seismograph Renderer
**File**: `js/renderers/seismograph.js`
- New renderer for sustained exercises
- Visual: horizontal scrolling trace. Center line = 0 cents deviation from target. Trace oscillates above/below center based on actual deviation.
- Color: green when within ±5 cents, yellow ±5-15, red >15
- Shows target note name large in corner
- Shows "steady streak" counter: how long the trace has stayed within ±5 cents
- Amplitude scale: ±50 cents range, with grid lines at ±10, ±25
- Smooth: trace is continuous line, not dots

#### 2.4 Flash-Card Renderer
**File**: `js/renderers/flash-card.js`
- New renderer for reactive exercises
- Visual: large centered note name (or interval name). Uses the full canvas area.
- Shows optional reaction timer (small, non-intrusive — awareness, not pressure)
- On match: brief green flash, then next card slides in
- Between cards: very brief pause (200ms) to prevent accidental double-matches
- Background color subtly shifts as you approach the target pitch (warm color when close)

#### 2.5 Integration
- Exercise runtime selects renderer based on `config.renderer` field
- Build renderer registry: `{ 'scroll-targets': ScrollTargets, 'seismograph': Seismograph, 'flash-card': FlashCard }`
- Test: create a long-tone exercise config with seismograph renderer, verify it works through the exercise runtime

**Definition of done**: Three renderers working. A scale runner uses scroll-targets, a long-tone exercise uses seismograph, a random-note exercise uses flash-card. All driven by the same exercise runtime, differentiated only by the config's `renderer` field.

---

### Phase 3: Session Runner + Session View
**Goal**: Chain exercises into timed sessions with a dedicated full-screen UI.

#### 3.1 Session Runner
**File**: `js/core/session-runner.js`
- Takes a session config (array of exercise blocks with durations)
- Manages the sequence: start → run exercise → transition → next exercise → complete
- State: `idle → countdown → running → transitioning → complete`
- Per-block timer: when duration elapses, gracefully end current exercise and transition
- Handles: pause/resume (pauses current exercise + session timer), skip (advance to next block), end early (stop session, record what was completed)
- Emits: `session:start`, `session:block-start`, `session:block-end`, `session:transition`, `session:complete`
- Collects measurements from each exercise runtime and aggregates them

#### 3.2 Session View
**File**: `js/views/session-view.js`
- Full-screen UI that takes over during a session
- Elements:
  - Session progress bar (top) — shows blocks as segments, current block highlighted
  - Exercise label (below progress) — name of current exercise, brief description
  - Canvas area (center) — occupied by current renderer
  - Controls (bottom) — pause/resume, skip, end session
- On transition between exercises:
  - Current renderer fades out
  - Brief interstitial (1-2s) showing next exercise name and description
  - Next renderer fades in
  - Countdown if exercise needs one
- On session complete:
  - Summary screen: exercises completed, total duration, key measurements
  - "Back to Practice" button

#### 3.3 Practice View (Session Launcher)
**File**: `js/views/practice-view.js`
- Replaces library-view as the "Play" tab
- Sections:
  - **Today's Practice** — large button, starts a generated session (placeholder: hardcoded until generator exists)
  - **Session Templates** — scrollable list of curated sessions with name, duration, description, tags
  - **Quick Start** — single exercise picker: choose type, configure, go (for focused work)
- Tap a template → session-view launches with that session
- Tap quick-start exercise → session-view launches with a single-exercise "session"

#### 3.4 Session Templates (Initial Set)
**File**: `js/core/session-templates.js`
- Implement templates from the PRD: Daily Warm-Up, Morning Practice, Quick Burst
- Each template is a function that takes `(scale, root, difficulty)` and returns a session config
- Templates are partially parameterized — the generator fills in scale/root/difficulty later, but they work with sensible defaults now

#### 3.5 Navigation Update
- Update `js/app.js` to add the session-view
- Update `index.html` to add session-view container
- "Play" tab now opens practice-view (was library-view)
- Starting a session hides the tab bar and shows session-view full-screen
- Ending a session returns to practice-view and restores tab bar

**Definition of done**: Pick a session template → tap start → full-screen session runs through 3-4 exercises with transitions → session summary shown → return to practice tab. This is the first time the app feels like a guided practice tool.

---

### Phase 4: Synth Engine
**Goal**: Audio output for drones and phrase playback.

#### 4.1 Synth Module
**File**: `js/audio/synth.js`
- Uses the existing AudioContext (from mic.js — expose it, or create shared context utility)
- Functions:
  - `playNote(frequency, duration, voice, gain)` — single note with envelope
  - `startDrone(frequency, voice, gain)` → returns `{ stop() }` — sustained tone with fade-in
  - `playPhrase(notes[], voice, gain)` — sequence of { frequency, duration, gap } with timing
- Voice types: sine, triangle, square — simple oscillators
- Envelope: gentle attack (20ms ramp) and release (50ms ramp) to avoid clicks
- Gain: default low (0.3) to not overwhelm the room mic
- Exposed via named exports, not a singleton class

#### 4.2 Integration with Exercise Runtime
- Exercise runtime checks `config.audio` field
- If `audio.drone` specified: start drone when exercise starts, stop when it ends
- If `audio.playPhrase` specified: play phrase, wait for completion, then enable player input
- Drone pauses when exercise pauses, resumes when exercise resumes

#### 4.3 Feedback Loop Prevention
- Test on multiple devices: does synth output feed back into the pitch detector?
- If feedback is detected:
  - Option A: frequency-filter the synth output to a range the detector ignores
  - Option B: briefly suppress pitch detection during synth playback
  - Option C: show "use headphones" prompt for synth exercises
- Document findings and chosen approach

**Definition of done**: A drone-match exercise plays a sustained tone. You hear it, match it, see the convergence on the seismograph. An echo exercise plays 3 notes, waits, then listens to your attempt.

---

### Phase 5: Ear Training Exercises
**Goal**: Echo mode and interval training — the exercises that differentiate this from a tuner.

#### 5.1 Phrase-Match Evaluator
**File**: `js/core/evaluators/phrase-match.js`
- Listens to player pitch during attempt phase
- Segments the pitch stream into discrete notes (detect transitions via pitch jumps or silence gaps)
- Compares the sequence of detected notes to the target phrase
- Scoring: per-note accuracy (cents from target) + sequence accuracy (right notes in right order)
- Lenient: if the player plays an extra note or hesitates, don't penalize harshly
- Output measurements: notes-correct-pct, avg-cents-per-note, intervals-correct-pct

#### 5.2 Interval Accuracy Evaluator
**File**: `js/core/evaluators/interval-accuracy.js`
- Evaluates pairs of notes
- Measures both: is each note accurate? And: is the interval between them correct?
- Interval distance measured in cents (compare actual semitone distance to target)
- Output: interval-accuracy-by-type, weakest-intervals

#### 5.3 Overlay-Comparison Renderer
**File**: `js/renderers/overlay-comparison.js`
- Two-phase display:
  - During synth playback: shows "Listen..." with visual indication of phrase
  - During player attempt: shows "Your turn..." with NO pitch targets visible
  - After attempt: shows target notes as translucent bars, player's actual pitch as solid trail overlaid
- The overlay is the key learning tool — you see where you matched and where you diverged
- Brief display (3-5 seconds), then next phrase or exercise ends

#### 5.4 Echo Exercise Config Factory
**File**: extend `js/utils/exercise-generator.js`
- `generateEchoExercise(difficulty, scale, root)` → exercise config
- Difficulty controls:
  - easy: 2-3 notes, stepwise motion only, narrow range (one octave)
  - medium: 3-4 notes, include 3rds and 4ths, moderate range
  - hard: 4-5 notes, any interval within scale, wide range
  - adaptive: starts easy, increases if accuracy > 80%, decreases if < 50%
- Phrase generation: random walk within the scale, constrained by difficulty params

#### 5.5 Interval Exercise Config Factory
- `generateIntervalExercise(intervals[], direction, scale, root)` → exercise config
- Parameters: which intervals to include, ascending/descending/mixed, scale context

**Definition of done**: Echo mode works end-to-end: app plays a 3-note phrase, you hear it, you play it back, you see the overlay comparison. Interval gym shows you "P5 up from D" and evaluates your response. Both produce measurements that could feed skill tracking.

---

### Phase 6: Stability Evaluator + Sustained Exercises
**Goal**: Long tones, drone match, centering — the warm-up exercises.

#### 6.1 Stability Evaluator
**File**: `js/core/evaluators/stability.js`
- Tracks cents deviation from target over time (circular buffer of recent readings)
- Computes: variance, max deviation, steady streak (consecutive readings within threshold)
- "Locked" state: player has been within ±5 cents for >500ms
- Output measurements: avg-deviation, max-steady-streak-ms, time-locked-pct, drift-direction

#### 6.2 Long Tone Exercise Configs
- Single note: hold one note, seismograph shows stability
- Cycle: hold each scale degree for N seconds, advance automatically
- No scoring in the punitive sense — just the seismograph trace as visual feedback

#### 6.3 Drone Match Exercise Configs
- Starts drone via synth, target note matches drone
- Evaluator tracks convergence: distance from drone pitch, time to lock, lock duration
- Seismograph renderer with drone frequency shown as reference line

#### 6.4 Centering Microscope
- Variant of long tone with zoomed ±10 cent view
- Uses seismograph renderer with narrower Y-axis scale
- Encourages finding the exact center

**Definition of done**: Long tone exercise works: hold a note, see the seismograph trace, see your steady streak counter climb. Drone match: hear a tone, match it, see the lines converge. Centering: zoomed view shows micro-deviations.

---

### Phase 7: Profile System
**Goal**: The app knows who you are and tracks your growth.

#### 7.1 Profile Model
**File**: `js/profile/profile.js`
- Profile data structure (as documented in PRD)
- CRUD operations via store.js (pp:profile key)
- `getProfile()` — returns current profile or null
- `createProfile(instruments, preferences)` — initial setup
- `updatePreferences(prefs)` — modify settings
- `hasProfile()` — boolean check for first-time gating

#### 7.2 Practice History
**File**: `js/profile/history.js`
- `recordExercise(exerciseConfig, measurements)` — stores after each exercise
- `recordSession(sessionConfig, exerciseMeasurements[])` — stores after each session
- `getHistory(days)` — returns recent history
- `getExerciseHistory(exerciseType, days)` — filtered history
- Storage: pp:history key, array of session records, capped at 90 days
- Pruning: on each write, remove records older than 90 days

#### 7.3 Skill Model
**File**: `js/profile/skill-model.js`
- `computeSkillMap(history)` → skill map object
- For each dimension: aggregate measurements from relevant exercises over rolling 14-session window
- Level computation: normalize measurement averages to 0-1 scale
  - pitchAccuracy: `1 - (avgCents / 50)` clamped to [0, 1]
  - pitchStability: `avgSteadyStreak / maxPossibleStreak` clamped
  - earTraining: `avgEchoAccuracy` (already 0-1)
  - scaleFluency: combination of accuracy + speed in scale exercises
  - reactionSpeed: `1 - (avgReactionMs / 5000)` clamped
  - range: `(highMidi - lowMidi) / 48` clamped (4 octave = perfect)
- Trend: linear regression slope over last 14 data points → improving/stable/plateau/declining

#### 7.4 Profile Setup View
**File**: `js/views/profile-view.js`
- First-time setup: instrument picker (multi-select), session length preference, optional scale favorites
- Accessible from Practice tab settings
- Simple form, takes <30 seconds
- Skip option (uses defaults: general instrument, 10 min sessions, major/pentatonic/blues scales)

#### 7.5 Integration
- Exercise runtime calls `history.recordExercise()` on exercise complete
- Session runner calls `history.recordSession()` on session complete
- Practice view reads skill map to show current levels
- Session generator (Phase 8) reads profile and skill map

**Definition of done**: Create a profile → practice two sessions → see skill levels populate → see levels update after more practice. History persists across page reloads.

---

### Phase 8: Session Generator
**Goal**: "Today's Practice" — one tap to a personalized session.

#### 8.1 Generator Core
**File**: `js/generation/session-generator.js`
- `generateSession(profile, options)` → session config
- Options: `{ intent?, durationMinutes, instruments? }`
- Implements the algorithm from the PRD:
  1. Allocate time to blocks based on duration
  2. Select focus skill (from intent or from weakest-recently-unpracticed)
  3. Select exercises per block (matching phase + focus, filtering recent)
  4. Select scale and root (favorites weighted, variety enforced)
  5. Calibrate difficulty per exercise
  6. Assemble and name the session

#### 8.2 Difficulty Calibration
**File**: `js/generation/difficulty.js`
- `calibrate(exerciseConfig, skillMap)` → adjusted exercise config
- Maps skill levels to concrete exercise parameters:
  - Tempo ranges per level
  - Pattern complexity per level
  - Echo phrase length per level
  - Interval set per level
  - Range constraints per level

#### 8.3 Practice View Integration
- "Today's Practice" button calls generator with current profile
- Shows generated session name, duration, exercise list before starting
- "Shuffle" button regenerates (if the player doesn't like today's selection)
- Generated session is cached for the day (regenerate only on explicit request)

#### 8.4 Intent Selector
- Optional quick picker: "What do you want to focus on?"
- Options: Auto (recommended), Ear Training, Scales, Intonation, Warm-Up, Range
- Influences the generator's focus selection

**Definition of done**: Open app → "Today's Practice" shows a personalized session → tap start → session runs → tomorrow's session is different. Intent selector biases the generation toward the chosen focus.

---

### Phase 9: Journal & Progress View
**Goal**: Encouraging practice feedback and visible progress.

#### 9.1 Journal View
**File**: `js/views/journal-view.js`
- Recent sessions list: date, name, duration, focus, key measurement
- Tap to expand: exercise breakdown, per-exercise measurements
- Practice streak counter (days with at least one session)
- Total practice time this week/month

#### 9.2 Skill Radar
- Simple canvas visualization: hexagon/radar chart with 6 skill dimensions
- Current levels shown as filled area
- Previous levels (7 sessions ago) shown as dotted outline → growth visible

#### 9.3 Trend Lines
- Per-dimension sparkline: level over last 14-30 sessions
- Simple line chart, shows direction even if progress is small

#### 9.4 Encouragement Engine
- `generateEncouragement(currentSession, history)` → string[]
- Compares current measurements to recent history
- Templates:
  - "Your pitch stability improved [X]% this session"
  - "You held [note] steady for [N] seconds — your best yet"
  - "You've practiced [N] days this week"
  - "[Skill dimension] is developing nicely — up [X] since last week"
- Shown in session summary and journal entries
- Never negative. If performance declined, simply omit that dimension.

**Definition of done**: Journal view shows practice history with expandable details. Skill radar shows current levels. After a session, summary includes 1-2 encouraging observations based on real data.

---

### Phase 10: Instrument-Specific Exercises
**Goal**: Bend trainer, vibrato trainer, pitch trace.

#### 10.1 Bend Meter Renderer
**File**: `js/renderers/bend-meter.js`
- Vertical pitch axis focused on a narrow range (e.g., B4 to D5 for hole 3 bends)
- Target zone highlighted (e.g., Bb4 ± 10 cents)
- Player's current pitch shown as a marker/ball
- Color feedback as player approaches target
- "Locked" indicator when within target zone for sustained time

#### 10.2 Bend Accuracy Evaluator
**File**: `js/core/evaluators/bend-accuracy.js`
- Evaluates accuracy to microtonal targets (not just nearest semitone)
- Target specified as exact MIDI value (fractional for microtones)
- Measures: accuracy to target, time-to-reach, hold stability at target

#### 10.3 Vibrato Trainer
- Waveform overlay renderer (or variant of seismograph)
- Target: sine wave at specified rate (Hz) and width (cents)
- Player's actual pitch oscillation shown as waveform
- Match quality: rate accuracy, width accuracy, consistency

#### 10.4 Pitch Trace Renderer
**File**: `js/renderers/pitch-trace.js`
- Pre-drawn contour on canvas (line or filled shape)
- Player's pitch shown as a following line
- Distance from contour shown as color (close = green)
- Fun shapes: zigzag, wave, mountain, valley, spiral

**Definition of done**: Harmonica bend trainer works for draw bends on holes 1-4. Vibrato trainer shows target vs. actual waveform. Pitch trace lets you draw shapes with your pitch.

---

### Phase 11: Polish & Cohesion
**Goal**: Everything feels like one product.

- Transition animations between exercise renderers in sessions
- Consistent loading/countdown states across all exercises
- Onboarding flow: first launch → brief intro → profile setup → first session
- "Did you know?" tips in session transitions (optional, teach app features)
- PWA service worker updated for all new files
- Comprehensive session template library (all templates from PRD)
- Accessibility pass: screen reader labels, reduced motion, focus management
- Performance audit: canvas rendering budget, memory usage, localStorage size

---

## Dependency Graph

```
Phase 1 (Runtime) ─────→ Phase 2 (Renderers) ─────→ Phase 3 (Sessions)
                                                            │
Phase 4 (Synth) ────→ Phase 5 (Ear Training)               │
                                                            │
Phase 6 (Sustained) ←── Phase 2 (Renderers)                │
                                                            │
                          Phase 7 (Profile) ───→ Phase 8 (Generator)
                               │
                               └──→ Phase 9 (Journal)

Phase 10 (Instrument-Specific) ←── Phase 2 (Renderers)
Phase 11 (Polish) is continuous from Phase 3 onward
```

### Critical Path to "Practice Tool"
**Phases 1 → 2 → 3** — config-driven exercises, multiple renderers, session runner. This is the minimum viable practice tool.

### Critical Path to "Ear Training"
**Phase 4 → 5** — synth output + echo/interval exercises. Can run in parallel with Phase 3.

### Critical Path to "Intelligent"
**Phase 7 → 8** — profile + generator. Requires measurement data flowing from exercises (Phase 1+).

### Parallelism
- Phases 4-5 (synth + ear training) can be built in parallel with Phase 3 (sessions)
- Phase 6 (sustained exercises) can be built any time after Phase 2 (renderers)
- Phase 10 (instrument-specific) can be built any time after Phase 2
- Phase 9 (journal) can be built any time after Phase 7

---

## Migration Strategy

### No Big Bang
At no point does the existing app break. The migration is additive:
1. New modules are added alongside old ones
2. New views are added behind new navigation entries
3. Old views continue to work via old code paths
4. Once a new view is stable, the old one is removed from navigation
5. Old code files are deleted only when confirmed unused

### Backward Compatibility
- Existing localStorage keys (pp:practice-settings, etc.) are read by the new system during migration
- Profile setup offers to import from existing settings
- Tuner and graph views are untouched throughout the entire migration

### Testing Strategy
- Manual browser testing after each phase
- Each exercise type tested with real microphone input
- Sessions tested end-to-end with 2+ exercises
- Profile/history tested across page reloads and app reinstalls
- PWA tested via Lighthouse after service worker updates
