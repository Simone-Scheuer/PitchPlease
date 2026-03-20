---
id: REQ-026
title: Tap note blocks to play the note via synth
status: pending
created_at: 2026-03-17T18:00:00Z
user_request: UR-013
related: [REQ-027, REQ-028, REQ-029, REQ-030]
batch: interactive-playback
---

# Tap Note Blocks to Play the Note

## What
When a user taps/clicks on a note block in the scroll-targets renderer (scale exercises), play that note via the synth engine so they can hear what it sounds like.

## Context
- The synth engine (`js/audio/synth.js`) already has `playNote(midi, durationMs, options)`
- The scroll-targets renderer draws note bars on the canvas
- Need to detect taps on the canvas, map to note bars, and trigger playback
- Short duration (300-500ms) with gentle envelope
- Should work during both sessions and standalone exercise play

---
*Source: "add the feature such that when you click on a note block it will play the note"*
