---
id: REQ-024
title: "Phase 10: Instrument-Specific Exercises"
status: pending
created_at: 2026-03-17T16:00:00Z
user_request: UR-012
related: [REQ-019, REQ-020, REQ-021, REQ-022, REQ-023, REQ-025]
batch: phases-5-11
---

# Phase 10: Instrument-Specific Exercises

## What

Bend trainer, vibrato trainer, pitch trace — specialized tools for specific instruments.

## Detailed Requirements

Per IMPLEMENTATION_PLAN.md Phase 10:

### 10.1 Bend Meter Renderer (`js/renderers/bend-meter.js`)
- Vertical pitch axis focused on narrow range (e.g., B4 to D5)
- Target zone highlighted (e.g., Bb4 ±10 cents)
- Player pitch shown as marker/ball
- Color feedback approaching target
- "Locked" when within target zone for sustained time

### 10.2 Bend Accuracy Evaluator (`js/core/evaluators/bend-accuracy.js`)
- Evaluate accuracy to microtonal targets (fractional MIDI)
- Measures: accuracy to target, time-to-reach, hold stability

### 10.3 Vibrato Trainer
- Waveform overlay renderer (or seismograph variant)
- Target: sine wave at specified rate/width
- Player's oscillation shown as waveform
- Match quality: rate accuracy, width accuracy, consistency

### 10.4 Pitch Trace Renderer (`js/renderers/pitch-trace.js`)
- Pre-drawn contour on canvas
- Player's pitch as following line
- Distance from contour shown as color
- Fun shapes: zigzag, wave, mountain, valley

## Builder Guidance
- Bend trainer is specifically for harmonica draw bends
- User plays harmonica, whistle, mouth trumpet, guitar — bend trainer is high priority
- These only appear when profile includes relevant instrument

## Context
Reference: IMPLEMENTATION_PLAN.md Phase 10, PRD.md exercises #13-15
