# PitchPlease — Product Requirements Document

## Overview
PitchPlease is a client-side web app for real-time pitch detection, visualization, and ear training. It runs entirely in the browser with no backend, no accounts, and works offline as a PWA. Target users: musicians practicing intonation, singers training their ear, harmonica players learning note positions.

---

## Feature 1: Core Pitch Detector

### Description
Real-time microphone input with high-accuracy pitch detection. Shows what note you're playing right now in a clean, non-scrolling tuner-style display.

### Requirements
- **Microphone input** via Web Audio API (`getUserMedia`)
- **Pitch detection** using the `pitchy` library (autocorrelation-based)
- **Note name display**: large, centered, shows note name (C, C#, D, etc.) and octave number
- **Cents deviation**: visual indicator showing how many cents sharp or flat from the target note (-50 to +50 range)
- **Frequency readout**: current detected frequency in Hz
- **Tuner-style display**: horizontal needle/bar indicator, color-coded (green = in tune, yellow = slightly off, red = very off)
- **Silence handling**: graceful display when no pitch is detected (dimmed state, dashes)
- **Low latency**: less than 50ms perceived delay between sound and visual update

### Technical Details
- AnalyserNode with fftSize 2048
- Clarity threshold 0.9 to reject noise
- Frequency range 60–1500 Hz
- requestAnimationFrame-based update loop
- Exponential smoothing on needle (factor 0.3)
- Note name debouncing (3 consecutive frames before switching displayed note)

---

## Feature 2: Scrolling Graph Visualizer

### Description
A horizontal scrolling piano-roll-style graph. Y axis shows a semitone grid with note names. The detected pitch draws as a continuous line scrolling left to right.

### Requirements
- **Piano roll layout**: Y axis = semitone grid with note labels, X axis = time
- **Continuous pitch line**: detected pitch rendered as a smooth line, scrolling left to right
- **Configurable scroll speed**: user can adjust how fast the graph scrolls
- **Pause and rewind**: tap to pause scrolling, scrub backward to review
- **Cents accuracy**: subtle visual indicator showing deviation from nearest semitone (line thickness, color, or offset)
- **Key/scale overlay**: highlight in-scale notes on the Y axis (e.g., highlight C major scale notes)
- **Landscape optimized**: this view activates or is optimized for landscape orientation

### Technical Details
- Canvas 2D rendering with circular buffer for pitch history
- Configurable Y axis range (adjustable semitone window)
- Grid lines at each semitone, heavier lines at octave boundaries
- Smooth scrolling via requestAnimationFrame
- Touch-based zoom on Y axis (pinch to change semitone range)

---

## Feature 3: Song/Game Mode

### Description
Target notes scroll as colored horizontal bars. The player matches pitch to earn scores. Feedback is immediate and visual.

### Requirements
- **Target note bars**: colored horizontal bars scroll into a "play zone"
- **Bar width = duration**: longer notes are wider bars
- **Color feedback**: green (within tolerance), yellow (close), red (out of tune) — updates in real-time as you hold the note
- **Configurable tolerance window**: user can set how many cents of deviation is acceptable (easy/medium/hard)
- **Per-note scoring**: based on pitch accuracy (cents deviation) and hold duration (percentage of target duration held in tune)
- **End-of-song breakdown**: summary showing overall score, which notes were consistently missed, accuracy histogram
- **Loop section**: select a portion of the song to repeat for practice
- **Slow mode**: stretch target durations without changing pitch requirements — practice at slower tempo

### Technical Details
- Song engine maintains a playback cursor synced to real time
- Scoring: `accuracy = max(0, 1 - abs(cents) / tolerance)`, `hold = inTuneFrames / totalFrames`
- Note score = `accuracy * hold * 100`
- Loop defined by start/end bar indices
- Slow mode multiplies all durations by a factor (0.5x, 0.75x, etc.)

---

## Feature 4: Song Library & Import

### Description
A library of songs to practice, with the ability to import MIDI files or manually enter note sequences.

### Requirements
- **Starter songs**: 5–10 hardcoded songs covering common scales, simple melodies, and exercises
- **MIDI import**: upload a .mid file, parse it client-side, extract the melody track as note sequence
- **Song format**: simple JSON arrays: `[{ "note": "C4", "duration": 500, "lyric": "do" }, ...]`
  - `note`: note name + octave (e.g., "C4", "F#3")
  - `duration`: milliseconds
  - `lyric`: optional text displayed below the note bar
- **Manual note entry** (stretch goal): simple UI to tap in a sequence of notes and durations
- **Song management**: list view, delete imported songs, favorite songs

### Technical Details
- MIDI parsing via a lightweight client-side library (e.g., `@tonejs/midi` or custom parser)
- Songs stored in localStorage via the `pp:` namespaced store
- Starter songs bundled as static JSON files in `songs/` directory
- MIDI import extracts the first monophonic track; if polyphonic, uses highest note

---

## Feature 5: Instrument Profiles

### Description
Preset configurations optimized for different instruments, adjusting display, range, and labeling.

### Requirements
- **Harmonica mode**: shows hole numbers alongside note names, Y axis range optimized for the harp's range, blow/draw indicators
- **Voice / mouth trumpet mode**: range optimized for human vocal range, no instrument-specific overlays
- **General mode**: full range, no instrument-specific features, works for any instrument
- **Tuning offset**: each profile stores a tuning offset (cents or Hz adjustment from A4=440)
- **Profile switching**: quick-access in settings or as a top-bar selector

### Technical Details
- Profiles defined as JS objects: `{ label, tuningOffset, range: [minHz, maxHz], holeMap? }`
- Tuning offset shifts the A4 reference frequency in note-math calculations
- Harmonica hole map: maps MIDI note numbers to hole+direction (e.g., `{ 60: "4B", 62: "4D" }`)
- Active profile stored in localStorage, applied on app boot

---

## Feature 6: Progression System

### Description
Track accuracy over time, identify weak notes, and suggest practice focus areas.

### Requirements
- **Accuracy history**: per-song accuracy stored after each play session
- **Streak tracking**: consecutive in-tune notes per session, longest streak per song
- **Weak note identification**: aggregate which notes are consistently missed or flat/sharp
- **Practice suggestions**: "You tend to go flat on F#4 — try this exercise"
- **Visual progress**: simple charts or sparklines showing improvement over time

### Technical Details
- All data in localStorage via the `pp:` store
- History schema: `{ songId, timestamp, score, noteAccuracies: [{ note, avgCents, holdPct }] }`
- Weak note threshold: average absolute cents > 15 over last 5 sessions
- Streak: count of consecutive notes with score > 80

---

## Non-Functional Requirements

### Performance
- Perceived mic-to-display latency < 50ms
- 60fps canvas rendering
- Service worker caching for instant reload

### Compatibility
- Modern browsers: Chrome 90+, Safari 15+, Firefox 90+, Edge 90+
- Mobile: iOS Safari 15+, Android Chrome 90+
- Requires microphone access (graceful degradation without it)

### Privacy
- No data leaves the device — ever
- No analytics, no tracking, no cookies
- Microphone stream is never recorded or stored, only analyzed in real-time

### Accessibility
- Touch targets minimum 44x44px
- High contrast dark theme (WCAG AA for text)
- Screen reader labels on interactive elements
- Respect prefers-reduced-motion for animations

### PWA
- Installable on home screen (Android + iOS)
- Works offline after first load
- Standalone display mode (no browser chrome)
