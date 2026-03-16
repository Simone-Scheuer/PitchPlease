---
id: REQ-026
title: Flash-card renderer for reactive exercises
status: completed
claimed_at: 2026-03-16T01:11:00Z
completed_at: 2026-03-16T01:15:00Z
route: B
created_at: 2026-03-16T01:00:00Z
user_request: UR-010
related: [REQ-023, REQ-024, REQ-025]
batch: renderer-abstraction
---

# Flash-Card Renderer

## What
Create `js/renderers/flash-card.js` — new renderer for reactive exercises (random note reflex, interval recognition) showing a large centered note name that the player must match.

## Detailed Requirements
- Implement full renderer interface from renderer-base.js
- Visual: large centered note name using the full canvas area (e.g., "C4" in huge text, similar to tuner-view note display but on canvas)
- Note name uses the same font style as the tuner (large, clean, high contrast)
- Optional reaction timer: small non-intrusive timer in corner showing elapsed time since card appeared (awareness, not pressure)
- Background color subtly shifts as player approaches target pitch:
  - Default: dark background (#0d0d0d)
  - Getting close: very subtle warm shift (dark teal tint)
  - In tune: background brightens slightly with accent color
- On match (evaluatorResult.advance === true): brief green flash animation, then next card slides in from right
- Between cards: 200ms pause to prevent accidental double-matches
- Show "?" or empty state when no target note
- Score badge: after a note is matched, briefly show the score (small, fades out)
- Reaction time display: show the time it took to match (e.g., "1.2s") briefly after match
- onCountdown: show large centered countdown number
- onLoopRestart: reset to first card state
- Canvas setup via renderer-base.js utilities

## Builder Guidance
- Certainty level: Firm for core display, Medium for animations (keep simple)
- This is entirely new code
- The "flash" animation can be simple: briefly set background to green/teal, fade back over 300ms
- The "slide in" can be simple: quick opacity transition, not full slide animation
- Keep it clean and readable — the note name should be the dominant visual element

---
*Source: Phase 2.4 of IMPLEMENTATION_PLAN.md*
