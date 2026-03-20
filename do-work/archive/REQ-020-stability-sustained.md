---
id: REQ-020
title: "Phase 6: Stability Evaluator + Sustained Exercises"
status: pending
created_at: 2026-03-17T16:00:00Z
user_request: UR-012
related: [REQ-019, REQ-021, REQ-022, REQ-023, REQ-024, REQ-025]
batch: phases-5-11
---

# Phase 6: Stability Evaluator + Sustained Exercises

## What

Build proper stability evaluator for long tones, drone match, and centering exercises — the warm-up category.

## Detailed Requirements

Per IMPLEMENTATION_PLAN.md Phase 6:

### 6.1 Stability Evaluator (`js/core/evaluators/stability.js`)
- Track cents deviation from target over time (circular buffer of recent readings)
- Compute: variance, max deviation, steady streak (consecutive readings within threshold)
- "Locked" state: player within ±5 cents for >500ms
- Output: avg-deviation, max-steady-streak-ms, time-locked-pct, drift-direction
- Generous: count yellow zones (±15 cents) as contributing to steady streak, not just green (±5)

### 6.2 Long Tone Exercise Configs
- Single note: hold one note, seismograph shows stability
- Cycle: hold each scale degree for N seconds, advance automatically
- No punitive scoring — seismograph trace IS the feedback

### 6.3 Drone Match Exercise Configs
- Start drone via synth (already integrated), target note matches drone
- Track convergence: distance from drone pitch, time to lock, lock duration
- Seismograph with drone frequency as reference line

### 6.4 Centering Microscope
- Long tone variant with zoomed ±10 cent view
- Seismograph renderer with narrower Y-axis scale
- Encourages finding exact center

## Builder Guidance
- Seismograph renderer already exists with auto-detect
- The stability evaluator should be generous — yellow zones count, not just green
- Sustained exercises should feel meditative, not stressful

## Context
Reference: IMPLEMENTATION_PLAN.md Phase 6, PRD.md exercises #1-3
