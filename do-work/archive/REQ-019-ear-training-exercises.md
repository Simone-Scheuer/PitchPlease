---
id: REQ-019
title: "Phase 5: Ear Training Exercises"
status: pending
created_at: 2026-03-17T16:00:00Z
user_request: UR-012
related: [REQ-020, REQ-021, REQ-022, REQ-023, REQ-024, REQ-025]
batch: phases-5-11
---

# Phase 5: Ear Training Exercises

## What

Build echo mode and interval training — the exercises that differentiate this from a tuner. Requires synth engine (Phase 4, done).

## Detailed Requirements

Per IMPLEMENTATION_PLAN.md Phase 5:

### 5.1 Phrase-Match Evaluator (`js/core/evaluators/phrase-match.js`)
- Listen to player pitch during attempt phase
- Segment pitch stream into discrete notes (detect transitions via pitch jumps or silence gaps)
- Compare sequence of detected notes to target phrase
- Scoring: per-note accuracy (cents) + sequence accuracy (right notes in right order)
- Lenient: extra notes or hesitation don't penalize harshly
- Output: notes-correct-pct, avg-cents-per-note, intervals-correct-pct

### 5.2 Interval Accuracy Evaluator (`js/core/evaluators/interval-accuracy.js`)
- Evaluate pairs of notes
- Measure both: is each note accurate? And is the interval correct?
- Interval distance measured in cents
- Output: interval-accuracy-by-type, weakest-intervals

### 5.3 Overlay-Comparison Renderer (`js/renderers/overlay-comparison.js`)
- During synth playback: shows "Listen..." with visual indication of phrase
- During player attempt: shows "Your turn..." with NO pitch targets visible
- After attempt: shows target notes as translucent bars, player's actual pitch as solid trail overlaid
- Brief display (3-5 seconds), then next phrase or exercise ends

### 5.4 Echo Exercise Config Factory
- `generateEchoExercise(difficulty, scale, root)` → exercise config
- Difficulty levels: easy (2-3 notes, stepwise), medium (3-4 notes, some leaps), hard (4-5 notes, wider)
- Add echo session template

## Builder Guidance
- Player-driven timing is always default — no failure gates
- The overlay comparison after attempt provides feedback without interfering with ear-first process
- Synth engine (Phase 4) is complete and available

## Context
Reference: IMPLEMENTATION_PLAN.md Phase 5, PRD.md exercises #9 Echo Mode, #5 Interval Gym
