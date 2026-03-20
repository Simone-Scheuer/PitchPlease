---
id: REQ-021
title: "Phase 7: Profile System"
status: pending
created_at: 2026-03-17T16:00:00Z
user_request: UR-012
related: [REQ-019, REQ-020, REQ-022, REQ-023, REQ-024, REQ-025]
batch: phases-5-11
---

# Phase 7: Profile System

## What

Build user profile, practice history tracking, and skill model — the data layer for intelligent sessions.

## Detailed Requirements

Per IMPLEMENTATION_PLAN.md Phase 7:

### 7.1 Profile Model (`js/profile/profile.js`)
- Profile data: instruments, preferences, skill levels
- CRUD via store.js (pp:profile key)
- `getProfile()`, `createProfile(instruments, prefs)`, `updatePreferences(prefs)`, `hasProfile()`

### 7.2 Practice History (`js/profile/history.js`)
- `recordExercise(config, measurements)` — after each exercise
- `recordSession(sessionConfig, exerciseMeasurements[])` — after each session
- `getHistory(days)`, `getExerciseHistory(type, days)`
- Storage: pp:history key, capped at 90 days, auto-prune on write

### 7.3 Skill Model (`js/profile/skill-model.js`)
- `computeSkillMap(history)` → skill map object
- Dimensions: pitchAccuracy, pitchStability, earTraining, scaleFluency, reactionSpeed, range
- Rolling 14-session window for level computation
- Trend detection: improving, plateau, declining

### 7.4 Profile UI
- Simple setup: instruments, session length preference
- Octave range preference (user specifically requested this)
- Show on first launch or accessible from settings

## Builder Guidance
- localStorage with pp: prefix per CLAUDE.md conventions
- Octave range is important — user can't play in some ranges
- Profile should be minimal to set up — don't gate the experience behind a long form

## Context
Reference: IMPLEMENTATION_PLAN.md Phase 7, PRD.md Profile section
