---
id: REQ-035
title: Skip individual notes/sections within an exercise
status: pending
created_at: 2026-03-17T19:00:00Z
user_request: UR-015
related: [REQ-032, REQ-033, REQ-034]
batch: ux-refinements
---

# Per-Note Skip Within Exercises

## What
Add the ability to skip individual notes/targets within an exercise, not just skip the entire exercise block. Useful when you can't hit a specific bend or note and want to move on.

## Detailed Requirements
- Add a "Skip Note" button to the session controls (or a tap gesture)
- When tapped, advance to the next note in the current exercise (same as if you'd held the note long enough)
- The exercise runtime should call `advanceNote()` manually
- Works for: scale runner, scale walk, bend trainer, random note
- The skipped note should be marked differently in results (not counted as "hit")
- Visual: brief indicator that the note was skipped
- The existing "Skip" button skips the entire block — this is a different, more granular control
- Could be a double-tap on the canvas, or a small "Next" button below the main controls

## Builder Guidance
- The exercise runtime already has `advanceNote()` as an internal function — just need to expose it or wire a bus event
- Add `exercise:skip-note` bus event that the runtime listens to
- The session view emits this event when the per-note skip button is tapped
- Evaluator's `advanceNote()` should mark the note as skipped in its measurements
- Keep the block-level Skip button as-is — these are complementary controls

---
*Source: "the ability to like skip individual sections of exercises not just the whole thing would be awesome"*
