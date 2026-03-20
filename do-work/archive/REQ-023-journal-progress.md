---
id: REQ-023
title: "Phase 9: Journal & Progress View"
status: pending
created_at: 2026-03-17T16:00:00Z
user_request: UR-012
related: [REQ-019, REQ-020, REQ-021, REQ-022, REQ-024, REQ-025]
batch: phases-5-11
---

# Phase 9: Journal & Progress View

## What

Practice journal showing sessions, trends, streaks, and encouraging feedback.

## Detailed Requirements

Per IMPLEMENTATION_PLAN.md Phase 9:

### 9.1 Journal View (`js/views/journal-view.js`)
- Recent sessions list: date, name, duration, focus, key measurement
- Tap to expand: exercise breakdown, per-exercise measurements
- Practice streak counter
- Total practice time this week/month

### 9.2 Skill Radar
- Canvas visualization: radar chart with skill dimensions
- Current levels as filled area
- Previous levels (7 sessions ago) as dotted outline for growth

### 9.3 Trend Lines
- Per-dimension sparkline over last 14-30 sessions
- Simple line chart showing direction

### 9.4 Encouragement Engine
- `generateEncouragement(currentSession, history)` → string[]
- Compare current to recent history
- Templates: "Your stability improved X%", "Best hold time yet", "N days this week"
- Never negative — if performance declined, omit that dimension

## Builder Guidance
- This is NOT gamification — it's honest, encouraging data
- Never show negative feedback or "you got worse" messages
- Add a new tab to the navigation for Journal

## Context
Reference: IMPLEMENTATION_PLAN.md Phase 9, PRD.md
