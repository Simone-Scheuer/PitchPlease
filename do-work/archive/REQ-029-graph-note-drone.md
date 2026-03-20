---
id: REQ-029
title: Tap graph note labels to play drone
status: pending
created_at: 2026-03-17T18:00:00Z
user_request: UR-013
related: [REQ-026, REQ-027, REQ-028, REQ-030]
batch: interactive-playback
---

# Graph Note Labels Play Drone on Tap

## What
In the pitch graph view, tapping/clicking on the note labels on the Y-axis (the side notes like C4, D4, etc.) should play that note as a short drone via the synth. Helps the user find notes by ear.

## Detailed Requirements
- The pitch graph has note names along the Y-axis
- Tapping a note label plays that note via `playNote(midi, 500)` from synth.js
- Brief tone (500ms) with gentle envelope
- Visual feedback: briefly highlight the tapped note label
- Works whether or not the mic is active
- Requires mic to have been started at least once (for AudioContext)

## Builder Guidance
- The graph canvas renders note labels — may need to detect tap position and map to note rows
- Or: add small tap targets as HTML elements overlaid on the canvas edge
- The synth needs the AudioContext from mic.js — if mic hasn't started yet, may need to start/resume context on first tap

---
*Source: "clicking the side notes of the graph could also play the drone its very helpful for finding notes ykwim?"*
