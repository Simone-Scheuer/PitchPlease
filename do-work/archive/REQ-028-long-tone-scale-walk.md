---
id: REQ-028
title: Long tone scale walkthrough with drone and skip
status: pending
created_at: 2026-03-17T18:00:00Z
user_request: UR-013
related: [REQ-026, REQ-027, REQ-029, REQ-030]
batch: interactive-playback
---

# Long Tone Scale Walkthrough

## What
A dedicated exercise mode that plays a drone on each note of the chosen scale in sequence. Hold each note steady for 10 seconds (or until consistent), then automatically advance to the next scale degree. User can skip with a button.

## Detailed Requirements
- Drone plays the current target note
- Seismograph renderer shows stability
- Advance condition: 10 seconds of "close" stability (±15 cents) OR user presses skip
- After advancing, drone changes to the next scale degree
- Walk through the entire scale ascending then descending
- After completing all notes, show summary
- This is a standalone exercise option (ties into REQ-027)

## Builder Guidance
- Could be a sustained exercise with a notes array (scale degrees) and player-driven timing with holdMs: 10000
- The drone should change pitch when advancing to the next note
- The 10-second hold should use the stability evaluator's "close" threshold (±15 cents), not the strict ±5 cents
- Skip button should be clearly visible

---
*Source: "the long tone with drone minigame could play like all the long tones in a scale each like until you get 10 seconds of it consistent or press to skip as a seperate option"*
