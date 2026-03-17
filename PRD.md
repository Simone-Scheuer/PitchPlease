# PitchPlease — Product Requirements Document v2

> Adaptive PRD. Sections marked [VALIDATED] have been tested in use. Sections marked [DRAFT] are designed but untested. Update as real practice sessions reveal what works and what doesn't.

## Vision

PitchPlease is a practice environment for single-note musicians and vocalists. It detects pitch in real time, provides visual feedback, and guides structured practice sessions informed by music pedagogy research. It runs entirely in the browser — no backend, no accounts, no data leaves the device.

The app serves two modes of use:
1. **Freeform tools** — Tuner, scrolling graph, free play. Always available, no setup required.
2. **Guided practice** — Structured sessions composed of short exercises, personalized to the player's skill profile. The primary product experience.

The guiding philosophy: **practice room, not arcade**. Feedback is visual data, not judgment. Scoring measures where you are, not whether you passed. Every exercise loops until you stop it. The app should reduce the cognitive load of "what should I practice today?" to a single tap.

---

## Design Principles

### 1. Player-Driven Timing Is the Default
Exercises wait for the player. A target note stays on screen until you match it, then advances to the next. Speed is a *metric you can observe improving*, not a gate you fail at. Timed scrolling exists as an opt-in challenge mode for players who want rhythmic pressure, never as the default.

### 2. Low Failure Friction
There are no fail states. Exercises loop. If you miss a note, the next one appears. Silence is not penalized — putting down the instrument to think is a valid part of practice. End-of-exercise feedback shows what happened, not what you did wrong.

### 3. Short Focused Blocks
Individual exercises are 1-5 minutes. Sessions are 5-30 minutes composed of multiple short exercises. Research shows short focused blocks with variety outperform long monotonous grinding. The app enforces this by design.

### 4. The Session Is the Product
The primary interaction is: open app → start today's session → practice → done. Individual exercises exist within sessions. A player should never need to think about what to do next — the session handles sequencing, transitions, and variety.

### 5. Exercises Are Data, Not Code
Every exercise is a declarative config object interpreted by a shared runtime. This means exercises can be generated, serialized, composed into sessions, adapted mid-session, and shared. Adding a new exercise type usually means writing a new config, not new application code.

### 6. Generous Feedback
Accuracy uses a sqrt curve (being close counts for a lot). Hold scoring ignores silence gaps. Colors show where you are (green/yellow/red) without labeling anything as "wrong." Progress tracking shows trends over time — even small improvement is visible and encouraging.

### 7. Freeform Tools Are First-Class
The tuner and graph aren't legacy features. They're exercises with `evaluator: none` and `timing: indefinite`. A player who just wants to see their pitch on a graph should never feel like they're using a stripped-down version of the app.

---

## User Profile System

### Profile Model
```
Profile
├── instruments: [{ type, skillLevel }]
│   Types: harmonica, voice, whistle, guitar, trumpet, general
│   Skill levels: beginner, developing, intermediate, advanced
│
├── skillMap (derived from practice measurements)
│   ├── pitchAccuracy:  { level: 0-1, trend, lastPracticed }
│   ├── pitchStability: { level: 0-1, trend, lastPracticed }
│   ├── earTraining:    { level: 0-1, trend, lastPracticed }
│   ├── scaleFluency:   { level: 0-1, trend, lastPracticed }
│   ├── reactionSpeed:  { level: 0-1, trend, lastPracticed }
│   └── range:          { level: 0-1, trend, lastPracticed, low, high }
│
├── preferences
│   ├── defaultSessionLength: 5 | 10 | 15 | 20 | 30 (minutes)
│   ├── feedbackDetail: minimal | standard | detailed
│   ├── favoriteScales: [scaleKey, ...]
│   ├── favoriteRoots: [rootName, ...]
│   └── timedScrolling: false (opt-in)
│
└── history: [{ date, sessionId, duration, exercises, measurements }]
```

### Skill Dimensions

| Dimension | What It Measures | How It's Measured | Trained By |
|---|---|---|---|
| Pitch Accuracy | Hitting the right note | Avg cents deviation from targets | Scale runner, random note, intervals |
| Pitch Stability | Holding steady on pitch | Variance of cents over sustained notes | Long tones, drone match, centering |
| Ear Training | Hearing and reproducing music | Echo accuracy, interval identification | Echo mode, interval gym, call & response |
| Scale Fluency | Navigating scales without hesitation | Transition time between notes, accuracy in patterns | Scale runner patterns, random note from scale |
| Reaction Speed | Finding a target note quickly | Time from prompt to accurate pitch (ms) | Random note reflex |
| Range | Comfortable playable range | Highest/lowest notes hit accurately | Tracked passively across all exercises |

Skill levels are derived from measurement history using a rolling window (last 14 sessions). Trend is computed from the slope of the level over that window: improving, stable, plateau, or declining.

### Profile Setup
First-time users see a brief setup: pick instrument(s), pick session length preference, optionally select favorite scales. Everything else is derived from practice data. The setup should take under 30 seconds.

---

## Exercise System

### Exercise Config Schema
Every exercise is a declarative object interpreted by the exercise runtime.

```
{
  id:          string,           // unique identifier
  type:        ExerciseType,     // 'sustained' | 'sequence' | 'reactive' | 'echo' | 'free'
  name:        string,           // human-readable name
  description: string,           // one-line explanation shown before exercise

  context: {
    notes:       NoteSpec[],     // target notes (if applicable)
    scale:       string,         // scale key (if applicable)
    root:        string,         // root note name
    octaveRange: [number, number], // MIDI octave range
    pool:        'scale' | 'chromatic' | NoteSpec[],  // for reactive exercises
  },

  evaluator:   EvaluatorType,    // 'target-accuracy' | 'stability' | 'phrase-match' |
                                 // 'interval-accuracy' | 'reaction-time' | 'none'
  renderer:    RendererType,     // 'scroll-targets' | 'seismograph' | 'flash-card' |
                                 // 'overlay-comparison' | 'pitch-trail' | 'pitch-trace'

  timing: {
    mode:       'player-driven' | 'fixed-tempo' | 'auto-tempo' | 'indefinite',
    tempoBpm:   number,          // for fixed-tempo mode
    noteDuration: number,        // ms per note (for fixed-tempo)
    holdToAdvance: boolean,      // player must sustain note for N ms to advance
    holdMs:     number,          // required hold time
  },

  audio: {                       // optional synth output
    drone:     { note, octave, voice } | null,
    playPhrase: boolean,         // for echo exercises
    synthVoice: 'sine' | 'triangle' | 'square',
  },

  duration:    number | null,    // exercise time limit in ms (null = indefinite)
  loop:        boolean,          // restart when complete
  measures:    MeasureType[],    // what to record: 'cents-avg', 'hold-steady-ms',
                                 // 'reaction-ms', 'notes-hit-pct', 'interval-accuracy', etc.
  skills:      SkillDimension[], // which skill dimensions this exercise trains
}
```

### Exercise Types

#### Sustained — Hold and stabilize
Player targets a single note (or cycles through notes slowly). Focus is on stability and centering, not speed. The renderer shows real-time micro-deviations.

**Exercises:**
- **Long Tone** — Hold a note, see stability trace. Cycles through notes if looped. [DRAFT]
- **Drone Match** — Match a played drone tone. Hear beats when off, smooth when locked. [DRAFT]
- **Centering Microscope** — Zoomed ±10 cent view of a single note. Learn what "in tune" feels like. [DRAFT]

#### Sequence — Play notes in order
A sequence of target notes presented one at a time. Default: player-driven timing (note waits for you). Optional: fixed tempo with scrolling bars.

**Exercises:**
- **Scale Runner** — Scale notes in configurable patterns (ascending, descending, thirds, fourths, neighbors, random-from-scale, up-and-back). Auto-tempo option gently increases speed when you're accurate. [VALIDATED — current practice mode is a prototype]
- **Interval Gym** — Pairs of notes at specific intervals. Play the first, then the second. Focus on the distance between notes. [DRAFT]
- **Arpeggio Patterns** — Chord tones through a key. Major, minor, 7th shapes. [DRAFT]

#### Reactive — Respond to prompts
A prompt appears, you find the note. No scrolling, no timing pressure. The prompt waits until you match it. Speed is tracked as a metric, not enforced as a requirement.

**Exercises:**
- **Random Note Reflex** — A note name appears. Find it. Next one appears when you hit it. Average reaction time shown for self-awareness. [DRAFT]
- **Interval Recognition** — An interval name + starting note shown. Play both notes. [DRAFT]

#### Echo — Listen and reproduce
The app plays a phrase via synth. You reproduce it by ear. No visual targets during your attempt — pure audiation training. After your attempt, an overlay shows what you played vs. the target.

**Exercises:**
- **Echo Mode** — 2-5 note phrases, configurable difficulty. The most powerful ear training exercise. [DRAFT]
- **Call and Response** — Phrase played over drone, you respond with *anything in the scale*. No right answer. Improv training. [DRAFT]

#### Free — Open-ended play
No targets, no evaluation. Just pitch visualization with optional context (scale overlay, drone).

**Exercises:**
- **Free Play** — Pitch trail on graph, optional scale overlay. [VALIDATED — current graph view]
- **Drone Jam** — Free play over a sustained drone. Scale highlighted. [DRAFT]
- **Scale Explorer** — Guided walk through an unfamiliar scale, note by note, no timing. [DRAFT]

### Instrument-Specific Exercises

- **Bend Trainer** — Target a microtonal pitch (harmonica bends). Zoomed pitch display with target zone. Half-step → full-step → multi-step progression. [DRAFT]
- **Vibrato Trainer** — Oscillate around a center pitch at target rate and width. Compare your waveform to the target. [DRAFT]
- **Pitch Trace** — A drawn pitch contour (zigzag, wave, mountain). Trace it with your pitch. Creative control exercise. [DRAFT]

---

## Session System

### What Is a Session
A session is an ordered sequence of exercises with durations and transitions. It is the primary unit of practice. Sessions follow a research-backed arc:

```
Activate (warm-up) → Develop (technical work) → Challenge (push skills) → Apply/Play (creative)
```

Not every session hits all phases. Short sessions compress. The arc provides structure without rigidity.

### Session Sources

#### 1. Curated Templates
Pre-designed sessions based on music pedagogy. These are the "just works" option for players who don't want to configure anything. They adapt to the player's profile (scale selection, difficulty calibration) but the structure is fixed.

#### 2. Generated Sessions
Built by the session generator from the player's profile, history, available time, and optional focus intent. This is the "Today's Practice" experience — open the app, tap one button, practice.

#### 3. User-Composed Sessions
Player selects exercises, sets durations, orders them, saves the session. For experienced players who know what they want to work on.

### Session Runner Behavior
- Countdown before first exercise (3-2-1 or "play when ready")
- Timer bar showing current exercise progress and overall session progress
- Gentle transitions between exercises (brief label showing next exercise name, short pause)
- Current exercise label always visible
- Pause/resume at any point (pauses the current exercise)
- Skip exercise (advance to next)
- End session early (still records what was completed)
- Session summary at end (exercises completed, key measurements, encouragement)

### Session Config Schema
```
{
  id:          string,
  name:        string,           // "Morning Practice" or "Ear Training in D Blues (12 min)"
  description: string,
  tags:        string[],         // ['warm-up', 'ear-training', 'scales', etc.]
  blocks: [
    {
      exercise:   ExerciseConfig,
      duration:   number,        // ms — exercise ends at this time even if not complete
      label:      string,        // "Settle In", "Scale Work", etc.
      phase:      'activate' | 'develop' | 'challenge' | 'apply' | 'play',
    }
  ],
  transitions: 'none' | 'gentle' | 'seamless',  // visual transition style
  totalDuration: number,         // ms — sum of block durations + transitions
}
```

---

## Session Templates [DRAFT]

### Daily Warm-Up (5 min)
*Quick activation before practice or performance.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Long Tone | 90s | Root note, comfortable octave |
| Develop | Scale Runner (ascending) | 90s | Player-driven timing, slow |
| Challenge | Random Note Reflex | 60s | Notes from same scale |
| Play | Free Play | 60s | Same scale overlay |

### Morning Practice (15 min)
*Balanced daily session. The default recommendation.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Drone Match | 2 min | Root note with sine drone |
| Activate | Long Tone (cycle) | 2 min | Walk through scale degrees |
| Develop | Scale Runner (pattern) | 3 min | Thirds or neighbors, player-driven |
| Challenge | Echo Mode | 3 min | Easy-medium, same scale |
| Apply | Random Note Reflex | 2 min | Full scale, player-paced |
| Play | Drone Jam | 3 min | Drone on root |

### Ear Training Focus (15 min)
*Developing relative pitch and audiation.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Drone Match | 2 min | Settle into the key |
| Develop | Interval Gym (ascending) | 3 min | P5, P4, M3 — consonant intervals |
| Develop | Interval Gym (mixed) | 2 min | Add m3, M2 |
| Challenge | Echo Mode | 4 min | Medium difficulty, adaptive |
| Challenge | Echo Mode (no review) | 2 min | Pure ear — no overlay after |
| Play | Call and Response | 2 min | Free improv over drone |

### Scale Fluency Builder (15 min)
*Getting fluid in a specific scale.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Scale Explorer | 2 min | Walk through note by note |
| Develop | Scale Runner (ascending) | 2 min | Slow, player-driven |
| Develop | Scale Runner (thirds) | 2 min | Build intervallic awareness |
| Develop | Scale Runner (fourths) | 2 min | Different interval pattern |
| Challenge | Random Note Reflex | 2 min | Notes from this scale only |
| Challenge | Scale Runner (auto-tempo) | 3 min | Gently increasing speed |
| Play | Drone Jam | 2 min | Improvise in the scale |

### Intonation Deep Dive (15 min)
*Fine-tuning pitch accuracy and stability.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Centering Microscope | 2 min | Root note, ±10 cent zoom |
| Activate | Long Tone (stability) | 2 min | Minimize seismograph amplitude |
| Develop | Drone Match (scale walk) | 3 min | Each scale degree against drone |
| Develop | Slow Scale (hold each note) | 3 min | 3s per note, centering feedback |
| Challenge | Interval Precision | 3 min | Exact tuning, not just right note |
| Play | Centering Cool-down | 2 min | Return to root |

### Harmonica Workshop (15 min)
*Harmonica-specific technique. Only appears with harmonica in profile.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Long Tone | 2 min | Clean draw notes, holes 1-6 |
| Develop | Bend Trainer (half-step) | 3 min | Holes 1-4 draw bends |
| Develop | Bend Trainer (targets) | 3 min | Specific bent pitches for blues scale |
| Challenge | Blues Scale Runner | 3 min | Includes bends as targets |
| Play | Blues Drone Jam | 4 min | Improvise over root drone |

### Quick Burst (5 min)
*Focused micro-session. Middle exercise chosen by generator based on weakest skill.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Long Tone | 60s | One note, settle in |
| Challenge | (Generator picks) | 3 min | Targets weakest skill |
| Play | Free Play | 60s | Cool down |

### Range Explorer (10 min)
*Gently extending comfortable range.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Activate | Long Tone | 90s | Mid-range, comfortable |
| Develop | Scale Runner | 2 min | Comfortable range only |
| Develop | Scale Runner (extended) | 3 min | One note above/below comfort |
| Challenge | Long Tones at edges | 2 min | Boundary notes of range |
| Play | Full-range Free Play | 90s | Explore |

### Wind-Down (10 min)
*End of practice day. Reversed arc: play first, settle last.*

| Phase | Exercise | Duration | Notes |
|---|---|---|---|
| Play | Drone Jam | 4 min | Favorite key, enjoy |
| Develop | Slow Scale (legato) | 3 min | Beautiful, connected, no rush |
| Activate | Long Tone series | 3 min | Walk down to low range, end quiet |

---

## Session Generation Algorithm [DRAFT]

### Inputs
- Profile: instruments, skill map, preferences
- History: last 7-14 sessions
- Intent (optional): "ear training", "scales", "warm-up", "intonation", or auto
- Time budget: minutes available

### Step 1: Block Allocation
Time-based distribution following the pedagogical arc:

| Available Time | Activate | Develop | Challenge | Apply/Play |
|---|---|---|---|---|
| 5 min | 20% | — | 60% | 20% |
| 10 min | 15% | 35% | 30% | 20% |
| 15 min | 15% | 25% | 25% | 20% + 15% play |
| 20-30 min | 10% | 25% | 25% | 25% + 15% play |

### Step 2: Focus Selection
```
if intent provided → use it
else:
  for each skill dimension:
    need = (1 - level) × recency_weight × interest_weight
    // Lower skill = higher need
    // Longer since last practice = higher urgency
    // User-favorited dimensions = weighted higher
  focus = highest scoring dimension
```

### Step 3: Exercise Selection
For each block:
1. Get all exercises that fit the block's phase AND target the focus skill
2. Filter out exercises used in the last 2 sessions (enforce variety)
3. If multiple candidates, randomize (freshness)
4. Configure the selected exercise based on skill level

### Step 4: Scale & Key Selection
- 50% chance: from player's favorite scales, not used in last 2 sessions
- 30% chance: previously used scale, not used in last 4 sessions
- 20% chance: new scale (discovery and variety)
- Exception: ear training sessions use familiar scales (don't compound new intervals with unfamiliar scales)

### Step 5: Difficulty Calibration
Per-exercise, based on the relevant skill dimension level:

| Skill Level | Config |
|---|---|
| < 0.3 (beginner) | Slow tempo, narrow range, simple patterns, easy intervals |
| 0.3-0.6 (developing) | Moderate tempo, standard range, mixed patterns |
| 0.6-0.8 (competent) | Faster tempo, wider range, complex patterns |
| > 0.8 (strong) | Push tempo, full range, challenging intervals, longer echo phrases |

Trend adjustment:
- Improving → nudge difficulty up slightly
- Plateau → try a different exercise variant
- Declining → nudge difficulty down, extra warm-up time

### Step 6: Assembly
Combine blocks into a session, add transitions, compute total duration, name it:
"[Focus Area] in [Root] [Scale] ([Duration] min)"

---

## Renderer System [DRAFT]

Six renderers cover all exercise types. Each implements: `start(config)`, `update(pitchData, exerciseState)`, `transition(nextRenderer)`, `stop()`.

| Renderer | Visual | Used By |
|---|---|---|
| `scroll-targets` | Horizontal bars scrolling toward play zone. Player pitch as colored trail. Per-note score badges. Player-driven: bars wait at play zone. Fixed-tempo: bars scroll past. | Scale runner, interval gym, arpeggios, melody |
| `seismograph` | Horizontal time trace showing cents deviation from target. Center line = perfect. Amplitude = deviation. Shows "steady streak" counter. | Long tones, centering, drone match |
| `flash-card` | Large centered note name (or interval name). Optional reaction timer. Transitions to next prompt on match. | Random note reflex, interval recognition |
| `overlay-comparison` | After echo attempt: target phrase shown as note markers, player's pitch trail overlaid. Shows where you matched and diverged. Hidden during attempt. | Echo mode, call-and-response |
| `pitch-trail` | Free-scrolling pitch graph with optional scale overlay and drone indicator. Essentially the current graph view as a renderer. | Free play, drone jam, scale explorer |
| `pitch-trace` | Pre-drawn pitch contour on graph. Player traces it. Shows deviation from the line. | Pitch trace / shape drawing |

All renderers share a common visual language:
- Colors: `--color-in-tune` (green/teal), `--color-close` (yellow), `--color-off` (red)
- Note labels from the same font and style
- Canvas dimensions and DPI scaling handled by a shared base
- Transition animations: fade-out current → brief label → fade-in next

---

## Synth Engine [DRAFT]

Web Audio oscillator wrapper for audio output. Required for drones, reference tones, and echo phrase playback.

### Capabilities
- **Play note**: single oscillator at specified frequency, configurable voice (sine, triangle, square), attack/release envelope
- **Play drone**: sustained note that plays indefinitely until stopped. Fade in/out.
- **Play phrase**: sequence of notes with specified durations and gaps. Used by echo exercises.
- **Volume control**: master gain, settable by user

### Constraints
- Must not interfere with pitch detection (audio output must not feed back into mic analysis)
- On devices where feedback is unavoidable, provide a "headphones required" warning for synth exercises
- AudioContext reuse: share the existing context from the mic module

---

## Progress & Journal [DRAFT]

### What Gets Recorded
After every exercise: date, exercise config, duration, all measurements. After every session: session config, blocks completed, aggregate measurements, skill deltas.

### What Gets Shown
- **Session summary** (immediately after): exercises completed, key measurements, one encouraging observation ("Your stability improved 12% this session")
- **Journal view**: list of recent sessions with date, duration, focus. Tap to expand details.
- **Skill radar**: simple canvas visualization of the 6 skill dimensions. Shows current levels and trend arrows.
- **Trend lines**: per-dimension line charts over last 14/30 sessions. Even small improvement is visible.

### What Is NOT Shown
- Leaderboards, rankings, or comparisons to other users
- Failure counts or "missed note" tallies
- Streak-breaking warnings or guilt mechanics

### Encouragement Engine
The app generates brief positive observations from measurements:
- "You held Bb4 steady for 8 seconds — that's your best yet"
- "Your reaction time in the blues scale improved by 200ms this week"
- "You've practiced 4 days in a row"
- "Your echo accuracy is up to 73% — developing nicely"

These are shown in session summaries and journal entries. They're derived from real data, not generic platitudes.

---

## Freeform Tools [VALIDATED]

### Tuner
Real-time pitch detection with large note name, cents needle, frequency readout. Always available as a standalone tool. This is the app's simplest and most immediate utility.

### Scrolling Graph
Piano-roll style pitch visualization with scale overlay, speed control, compact mode. Available as a standalone tool. Doubles as the `pitch-trail` renderer when used within an exercise.

These tools exist outside the session system. They're accessible from the main navigation at all times. They don't require a profile or any setup.

---

## Technical Constraints

### Client-Side Only
- No backend, no API calls, no CDN dependencies except pitchy (with service worker cache)
- All data in localStorage (pp: namespace)
- Works offline after first load

### Performance
- Perceived mic-to-display latency < 50ms
- 60fps canvas rendering
- Audio constraints: no echo cancellation, no noise suppression, no auto-gain (minimum processing latency)

### Compatibility
- Modern browsers: Chrome 90+, Safari 15+, Firefox 90+
- Mobile: iOS Safari 15+, Android Chrome 90+
- Requires microphone access

### Privacy
- No data leaves the device. No analytics. No tracking.
- Microphone stream is analyzed in real-time, never recorded or stored.
- Profile and history are localStorage only.

### PWA
- Installable on home screen
- Works offline
- Standalone display mode

---

## Navigation & Information Architecture [DRAFT]

### Primary Navigation (bottom tabs)
1. **Tuner** — Standalone tuner tool
2. **Graph** — Standalone scrolling graph tool
3. **Practice** — Session launcher (the main experience)
4. **Journal** — Practice history and progress

### Practice Tab Flow
```
Practice Tab
├── "Today's Practice" button (generated session, one tap)
├── Session Templates (curated list, tap to start)
├── Quick Start
│   ├── Pick an exercise directly (for focused single-exercise work)
│   └── Build a session (compose custom sequence)
└── Settings gear → Profile setup
```

### During a Session
Full-screen exercise view with:
- Session progress bar (top)
- Current exercise label
- Exercise renderer (full canvas area)
- Pause/skip controls (bottom)
- No tab navigation visible (immersive)

### After a Session
Session summary screen → tap to return to Practice tab.
