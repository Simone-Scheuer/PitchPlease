---
id: REQ-027
title: Make exercises playable standalone outside sessions
status: pending
created_at: 2026-03-17T18:00:00Z
user_request: UR-013
related: [REQ-026, REQ-028, REQ-029, REQ-030]
batch: interactive-playback
---

# Standalone Exercise Play

## What
Allow individual exercises (minigames) to be launched directly from the Practice view, not just as part of curated sessions. Each exercise type should be accessible as a standalone activity.

## Detailed Requirements
- Add an "Exercises" section to the Practice view (below Sessions, above Quick Start)
- List exercise types: Long Tone, Scale Runner, Random Note Reflex, Echo Mode, Drone Match, Bend Trainer, Pitch Trace
- Tapping one launches a single exercise using the current root/scale/octave settings
- Exercise runs until its natural completion or the user ends it
- Uses the same session-view infrastructure but with a single block
- After completion, shows the exercise summary and returns to Practice

## Builder Guidance
- Reuse the session runner with a 1-block session config
- Exercise configs come from the existing builders (buildSustainedExercise, createSequenceExercise, etc.)
- Player-driven timing as always — no time pressure

---
*Source: "make all the minigames playable seperately from the sessions"*
