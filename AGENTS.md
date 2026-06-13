---
project: PitchPlease
domain: personal
status: active
stakeholder: Simone (no external stakeholder)
last_updated: 2026-06-12
phase: active
tags: [music, pwa, audio, ear-training]
---

# PitchPlease

> Source of truth. Read at the start of every session. Update at the end. That ritual is the entire point.
> Conventions and archive policy live in `INSTRUCTIONS.md`. Decisions log lives in `context/DECISIONS_log.md`.

## North Star
**What:** A browser-based practice environment for single-note musicians and vocalists — real-time pitch detection with visual feedback (tuner, scrolling graph, drone) plus guided practice sessions built from declarative exercise configs. Fully client-side PWA, no backend.
**Why it matters:** Reduce "what should I practice today?" to a single tap. Practice room, not arcade: feedback is data, not judgment.
**Success looks like:** *(inferred — confirm at next session)* The app is Simone's actual daily practice tool: one tap starts a session worth doing, and skill trends are visible over weeks.
**Out of scope:** Backend, accounts, server sync (no data leaves the device). Polyphonic/chord detection. Social features.

**Stakeholder:** Simone (no external stakeholder)

## Current Focus
Project resumed 2026-06-12 after ~8 weeks idle (last commit 2026-04-21: UI overhaul — light theme, journal removed, drone voices). The `do-work/` request queue is fully drained (29/29 archived). Next session must pick the next workstream: candidates are (a) remaining IMPLEMENTATION_PLAN.md v2 items not yet built, (b) fresh user requests into `do-work/user-requests/`, or (c) real-use testing to validate the [DRAFT] PRD sections. No code work is in flight.

## Active Work
*(🎯 in progress · 🅿️ parked · 🟡 blocked)*
- 🅿️ Validate [DRAFT] sections of PRD.md against real practice sessions (PRD is adaptive — sections get marked [VALIDATED] as they're tested in use)

## Recent Wins
- 2026-04-21 — UI overhaul shipped: light theme, journal removed, scale settings, drone voices
- 2026-03-19 — Drone got its own tab with chord drone player

## Open Questions
- Is the inferred "Success looks like" line right, and is Simone actually using the app to practice? → decide at next session start.
- Journal/progress tracking was built (REQ-023) then removed in the 04-21 overhaul — is progress-over-time tracking still part of the product, or cut for good? → decide before any skill-map/profile work.

## Deferred on purpose
- Timed/scrolling challenge modes stay opt-in, never the default (PRD design principle #1).

## Pointers — don't re-explain context, look here
| Need | Look at |
|---|---|
| Product requirements (living, adaptive) | `PRD.md` (root) |
| Build plan / refactor map | `IMPLEMENTATION_PLAN.md` (root) |
| Tech stack, architecture, code style | `CLAUDE.md` (root) |
| Feature request queue + 29 archived REQs | `do-work/` |
| UI fix history + screenshots | `fix-ui/` |
| Conventions & archive policy | `INSTRUCTIONS.md` |
| Decisions log | `context/DECISIONS_log.md` |
| Shipped milestones | `context/DONE_log.md` |
| Durable facts / preferences | `context/LONGTERM_memory.md` |
| Mini-fix inbox | `context/FIXES_running.md` |

## Session Log (last ~5; trim older)
**2026-06-12 — Retrofitted the org layer.** Scaffolded AGENTS.md + context/ logs into the existing repo via /newproject; seeded DONE_log from git history (81 commits, 2026-03-15 → 2026-04-21). No app code touched. **Pick up by:** confirming the North Star "Success" line and the journal question, then picking the next workstream from Current Focus.
