---
id: REQ-028
title: Session runner — chains exercises into sessions
status: pending
created_at: 2026-03-16T02:00:00Z
user_request: UR-011
related: [REQ-027, REQ-029, REQ-030]
batch: session-system
---

# Session Runner

## What
Create `js/core/session-runner.js` — orchestrates a sequence of exercise blocks, managing transitions, timing, and measurement collection.

## Detailed Requirements
- Factory: `createSessionRunner(sessionConfig)` returns runner instance
- Session config: `{ blocks: [{ exercise, duration, label, phase }], transitions }` (from session-templates.js)
- State machine: idle → running → transitioning → complete
- For each block:
  - Create exercise runtime (createExerciseRuntime) with the block's exercise config
  - Create appropriate evaluator based on exercise config.evaluator field
  - Create appropriate renderer based on exercise config.renderer field (renderer passed in or looked up)
  - Start the exercise runtime
  - When block duration elapses OR exercise completes: stop exercise, collect measurements, transition to next
- Transition between blocks: emit session:transition event, brief pause (1-2s), then start next block
- Pause/resume: pauses current exercise runtime + session timer
- Skip: stop current exercise, advance to next block
- End early: stop everything, collect measurements for completed blocks
- Events: session:start, session:block-start { blockIndex, label, exercise }, session:block-end { blockIndex, measurements }, session:transition { nextBlockIndex }, session:complete { totalDuration, blockResults[], aggregateMeasurements }
- Collect measurements from each exercise's evaluator.getMeasurements() and aggregate into session results
- Public API: start(canvasElement), pause(), resume(), skip(), stop() → sessionResults, getState(), getCurrentBlock(), getElapsed(), getProgress() → { blockIndex, blockCount, blockElapsed, blockDuration, sessionElapsed, sessionDuration }
- The runner creates evaluators and renderers internally based on exercise config fields — it needs a registry/factory for this
- Evaluator registry: { 'target-accuracy': createTargetAccuracyEvaluator, 'stability': createTargetAccuracyEvaluator (reuse for now), 'none': null }
- Renderer registry: { 'scroll-targets': createScrollTargetsRenderer, 'seismograph': createSeismographRenderer, 'flash-card': createFlashCardRenderer, 'pitch-trail': null (placeholder) }

## Builder Guidance
- Certainty level: Firm for orchestration, Medium for renderer/evaluator registry (will evolve)
- Import evaluators and renderers to build the registries
- The session runner is the layer ABOVE exercise runtime — it creates and manages runtime instances
- Each block gets its own fresh exercise runtime, evaluator, and renderer
- The canvas element is shared — each renderer init() reuses the same canvas

---
*Source: Phase 3.1 of IMPLEMENTATION_PLAN.md*
