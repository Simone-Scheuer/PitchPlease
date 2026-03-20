---
id: REQ-031
title: Key/type-aware harmonica bend maps
status: pending
created_at: 2026-03-17T18:15:00Z
user_request: UR-014
---

# Key/Type-Aware Harmonica Bend Maps

## What
The harmonica bend trainer currently has hardcoded bend targets that only work for a C diatonic. Bend availability, target pitches, and hole numbers all depend on the harmonica type (diatonic, chromatic, tremolo) and key (C, G, A, Bb, etc.). This needs proper domain modeling.

## Detailed Requirements

### Domain Knowledge: Diatonic Harmonica Bends

On a standard 10-hole Richter-tuned diatonic:

**Draw bends (holes 1-6):** Bending lowers the pitch. The number of available bends per hole depends on the interval between the blow and draw note — you can bend down to just above the blow note.

For a **C diatonic** (most common):
| Hole | Blow | Draw | Draw Bends Available |
|------|------|------|---------------------|
| 1 | C4 | D4 | Db4 (1 half-step) |
| 2 | E4 | G4 | Gb4, F4 (2 half-steps) |
| 3 | G4 | B4 | Bb4, A4, Ab4 (3 half-steps) |
| 4 | C5 | D5 | Db5 (1 half-step) |
| 5 | E5 | F5 | (no bends — only semitone apart) |
| 6 | G5 | A5 | Ab5 (1 half-step) |

**Blow bends (holes 7-10):** Bending lowers the pitch from blow note toward draw note.
| Hole | Blow | Draw | Blow Bends Available |
|------|------|------|---------------------|
| 7 | C6 | B5 | (no bends) |
| 8 | E6 | D6 | Eb6 (1 half-step) |
| 9 | G6 | F6 | Gb6 (1 half-step) |
| 10 | C7 | A6 | B6, Bb6 (2 half-steps) |

### Key Transposition
All of the above transposes by the key of the harmonica. A G harp has hole 1 blow = G3, etc. The intervals between blow/draw stay the same (Richter tuning), but all absolute pitches shift.

Formula: `actualMidi = cHarpMidi + (keyOffset)` where keyOffset is semitones from C.

### What to Build

1. **Harmonica data model** (`js/utils/harmonica.js` or `js/audio/harmonica.js`):
   - `RICHTER_TUNING` — the blow/draw notes for each hole relative to the key
   - `getBendTargets(key, holeRange)` — returns all available bend targets with MIDI values, hole numbers, bend type (draw/blow), and step count
   - `getHoleLayout(key)` — returns the full hole chart for display
   - Support keys: C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B (all 12)

2. **Profile integration**:
   - Add harmonica key to profile/preferences (default: C)
   - The bend trainer and harmonica workshop template should read the harp key from profile

3. **Update harmonica workshop template**:
   - Use `getBendTargets(key)` instead of hardcoded MIDI values
   - Bend exercises should label targets with hole number and bend type: "Hole 3 draw bend (Bb)"
   - Order bends by difficulty: start with hole 4 (easiest), then hole 1, then hole 2, then hole 3

4. **UI for harp key selection**:
   - Add a "Harmonica Key" selector to the Quick Start section (only shown when relevant)
   - Or add it to the profile preferences

## Builder Guidance
- The current hardcoded bend targets in harmonicaWorkshop() are wrong for any key other than C
- This is a domain-knowledge-heavy task — the Richter tuning pattern is the standard but the implementation needs to be precise
- Hole 3 draw has 3 available bends — this is the hardest and most musically useful hole
- Start with diatonic only — chromatic and tremolo are different instruments
- The user plays harmonica as one of their primary instruments

## Context
Reference: Standard 10-hole Richter tuning. The Richter tuning pattern is consistent across all keys — only the absolute pitches change.

---
*Source: "which places are meant to bend and the holes is dependent on which type of harp and which key so thats gonna take some articulate customization and domain knowledge to figure out its innacurate at the moment"*
