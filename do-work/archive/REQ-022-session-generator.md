---
id: REQ-022
title: "Phase 8: Session Generator"
status: pending
created_at: 2026-03-17T16:00:00Z
user_request: UR-012
related: [REQ-019, REQ-020, REQ-021, REQ-023, REQ-024, REQ-025]
batch: phases-5-11
---

# Phase 8: Session Generator

## What

"Today's Practice" — one tap to a personalized session based on profile and practice history.

## Detailed Requirements

Per IMPLEMENTATION_PLAN.md Phase 8:

### 8.1 Generator Core (`js/generation/session-generator.js`)
- `generateSession(profile, options)` → session config
- Options: `{ intent?, durationMinutes, instruments? }`
- Algorithm: allocate blocks by time, select focus skill, pick exercises, select scale, calibrate difficulty

### 8.2 Difficulty Calibration (`js/generation/difficulty.js`)
- `calibrate(exerciseConfig, skillMap)` → adjusted config
- Map skill levels to: tempo ranges, pattern complexity, echo phrase length, interval sets, range constraints

### 8.3 Practice View Integration
- "Today's Practice" calls generator with current profile
- Shows session preview (name, duration, exercise list) before starting
- "Shuffle" button to regenerate
- Cache generated session for the day

## Builder Guidance
- The generator should produce variety — avoid repeating yesterday's exercises
- Scale selection: 50% favorites, 30% previously used, 20% discovery
- If no profile exists, fall back to sensible defaults (don't block the experience)

## Context
Reference: IMPLEMENTATION_PLAN.md Phase 8, PRD.md Session Generation Engine section
