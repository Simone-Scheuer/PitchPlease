---
id: REQ-027
title: Session templates — curated practice sessions
status: pending
created_at: 2026-03-16T02:00:00Z
user_request: UR-011
related: [REQ-028, REQ-029, REQ-030]
batch: session-system
---

# Session Templates

## What
Create `js/core/session-templates.js` — curated session configurations that define structured practice sessions composed of exercise blocks.

## Detailed Requirements
- Session config schema:
  ```
  { id, name, description, tags[], blocks: [{ exercise: ExerciseConfig, duration: ms, label, phase }], transitions: 'gentle', totalDuration: ms }
  ```
- Each template is a function taking `(root, scale)` and returning a session config with exercises parameterized to that key
- Implement 3 initial templates from the PRD:
  - **Daily Warm-Up (5 min)**: Long Tone (90s) → Scale Runner ascending (90s) → Random Note Reflex (60s) → Free Play (60s)
  - **Morning Practice (15 min)**: Drone Match (2min) → Long Tone cycle (2min) → Scale Runner patterns (3min) → Echo placeholder (3min) → Random Note Reflex (2min) → Free Play (3min)
  - **Quick Burst (5 min)**: Long Tone (60s) → Scale Runner auto-tempo (3min) → Free Play (60s)
- Use `createSequenceExercise()` from exercise-schema.js for scale runner exercises
- For sustained exercises (long tone, drone match), build configs manually with type: 'sustained', evaluator: 'stability', renderer: 'seismograph'
- For reactive exercises (random note), build configs with type: 'reactive', evaluator: 'reaction-time', renderer: 'flash-card'
- For free play, build configs with type: 'free', evaluator: 'none', renderer: 'pitch-trail'
- Echo mode exercises: create placeholder configs (type: 'sequence' with simple notes) until Phase 5 builds real echo
- Export: `SESSION_TEMPLATES` array and `getTemplate(id, root, scale)` function
- Default root: 'C', default scale: 'major'

## Builder Guidance
- Certainty level: Firm for schema and template structure, placeholder for echo exercises
- Reference PRD.md "Session Templates" section for the full template specs
- Templates are data factories — they produce ExerciseConfig objects, no runtime logic

---
*Source: Phase 3.4 of IMPLEMENTATION_PLAN.md*
