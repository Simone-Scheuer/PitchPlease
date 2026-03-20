---
id: REQ-032
title: Scale exercise looping — restart immediately after completing
status: pending
created_at: 2026-03-17T19:00:00Z
user_request: UR-015
related: [REQ-033, REQ-034, REQ-035]
batch: ux-refinements
---

# Scale Exercise Looping

## What
Scale runner exercises should loop — when you finish the scale, it immediately starts again from the beginning. No pause, no summary, just continuous practice.

## Detailed Requirements
- Scale runner (scroll-targets) exercises should have `loop: true` by default
- When the last note is hit, the exercise restarts: cursor resets to 0, bars regenerate
- The renderer's `onLoopRestart()` already exists for this
- A brief gap (1-2s) between loops is fine for the player to breathe
- Loop count shown somewhere (e.g., "Loop 3")
- This applies to standalone scale runner exercises and scale exercises within sessions
- The session block timer still controls when the exercise ends (duration cap)

## Builder Guidance
- The exercise runtime already has loop support (`config.loop` and `loopGapMs`)
- Scale exercises from `createSequenceExercise` just need `loop: true` added
- The scroll-targets renderer already implements `onLoopRestart()`
- For standalone exercises, the 5-min safety cap acts as the session timer

---
*Source: "being able to do scales looping - like the same scale interface it just starts one immediately after would also be great"*
