# PitchPlease — Implementation Plan

## Phase 1: Core Pitch Detector (Tuner)
**Goal**: A standalone, fully functional, visually polished tuner that detects pitch in real-time.

### Milestone 1.1: Project Shell
- Directory structure and empty files
- index.html with dark theme shell
- CSS: reset, tokens, layout, tuner styles
- PWA: manifest.json, service worker, placeholder icons

### Milestone 1.2: Audio Pipeline
- `js/utils/event-bus.js` — pub/sub system
- `js/utils/constants.js` — FFT_SIZE, thresholds, frequency range
- `js/audio/note-math.js` — frequency → note/octave/cents conversion
- `js/audio/mic.js` — getUserMedia + AudioContext + AnalyserNode
- `js/audio/detector.js` — pitchy integration, rAF loop, emits events

### Milestone 1.3: Tuner UI
- `js/components/note-display.js` — large note name + octave
- `js/components/frequency-display.js` — Hz readout
- `js/components/needle.js` — canvas cents deviation indicator
- `js/views/tuner-view.js` — wires components to events
- `js/app.js` — boot, service worker registration

### Milestone 1.4: Polish
- Smooth transitions and animations
- Mic permission error handling
- Loading and idle states
- Mobile testing and touch target validation

**Definition of done**: Open the app, tap mic button, sing a note → see correct note name, cents deviation needle, and Hz readout. Works offline. Installable as PWA.

---

## Phase 2: Scrolling Graph Visualizer
**Goal**: Add landscape-oriented scrolling piano roll that shows pitch history.

### Milestones
- 2.1: Pitch history buffer (circular buffer storing recent readings)
- 2.2: Canvas piano roll renderer (Y = semitones, X = time)
- 2.3: Smooth scrolling with configurable speed
- 2.4: Key/scale overlay system
- 2.5: Pause, scrub, and zoom controls
- 2.6: Auto-switch to graph view in landscape orientation

**Definition of done**: Rotate phone to landscape → see scrolling pitch graph. Sing a scale → see the line step up through the notes. Pause and scroll back to review.

---

## Phase 3: Song/Game Mode
**Goal**: Play along with target notes, get scored on accuracy.

### Milestones
- 3.1: Song data model and JSON format
- 3.2: Song engine (playback cursor, note scheduling)
- 3.3: Target bar rendering on the graph canvas
- 3.4: Real-time accuracy feedback (color-coded bars)
- 3.5: Scoring engine (per-note and overall)
- 3.6: End-of-song breakdown screen
- 3.7: Loop section and slow mode

**Definition of done**: Select a song → target bars scroll → match pitch → see green/yellow/red feedback → see score breakdown at end. Loop a tricky section at half speed.

---

## Phase 4: Song Library & Import
**Goal**: Browsable song library with MIDI import.

### Milestones
- 4.1: Starter song collection (5–10 JSON files)
- 4.2: Song list view with search/filter
- 4.3: MIDI file import and parsing
- 4.4: Song storage in localStorage
- 4.5: Song management (delete, favorite)

**Definition of done**: Browse library → pick a song → play it. Import a MIDI file → it appears in the library → play it.

---

## Phase 5: Instrument Profiles
**Goal**: Optimized experience per instrument.

### Milestones
- 5.1: Profile data model (tuning offset, range, labels)
- 5.2: Harmonica profile with hole number mapping
- 5.3: Voice profile with vocal range optimization
- 5.4: Settings view for profile selection
- 5.5: Tuning offset integration into note-math

**Definition of done**: Switch to harmonica mode → see hole numbers on the graph → detection range matches harp. Change tuning to A=442 → cents calculation adjusts.

---

## Phase 6: Progression System
**Goal**: Track improvement over time.

### Milestones
- 6.1: History storage schema and data layer
- 6.2: Per-song accuracy recording after each session
- 6.3: Weak note identification algorithm
- 6.4: Progress view with charts/sparklines
- 6.5: Practice suggestions based on weak notes

**Definition of done**: Play a song 5 times → see accuracy trend → get told "You go flat on F#4, try this exercise."
