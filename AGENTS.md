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
**Success looks like:** The app is reliable enough that Simone actually wants to open it — and when she does, it makes her a better harmonica player: effortless hole-to-hole movement on a C diatonic, reading tabs fluently, nailing bends.
**Out of scope:** Backend, accounts, server sync (no data leaves the device). Polyphonic/chord detection. Social features. Journal/progress tracking (built, cut, confirmed dead 2026-06-12).

**Stakeholder:** Simone (no external stakeholder)

## Current Focus
**Harmonica pivot** (set 2026-06-12). The app never got reliable enough for Simone to want to open it — worst offender is a bug where all screens render at once, which fries the session. The loved core is the pitch viewer; the bend trainer is "actually awesome"; the timed game modes felt clunky and unintuitive. Direction: (1) fix the all-screens-render-at-once bug first — reliability is the adoption threshold, no feature matters if she won't open the app; (2) build the **harmonica tab-reading trainer**: hole→pitch math for C diatonic Richter (bend maps from commit 15390d2 may already cover part of this), show a tab number, verify the played pitch, advance to the next — untimed, player-driven, "ball bouncing game" style.

## Active Work
*(🎯 in progress · 🅿️ parked · 🟡 blocked)*
- 🎯 Repro + fix the all-screens-render-simultaneously bug (P0 — this is why the app doesn't get opened)
- 🅿️ Harmonica tab-reading trainer (spec via /build once the P0 is dead)
- 🅿️ Build out the pitch viewer further (loved core; no concrete asks yet)

## Recent Wins
- 2026-04-21 — UI overhaul shipped: light theme, journal removed, scale settings, drone voices
- 2026-03-19 — Drone got its own tab with chord drone player

## Open Questions
- How does the all-screens-at-once bug reproduce? History of view-visibility fixes (hidden-attribute, z-index, display:none→flex) suggests the view-switching layer is fragile, not one-off. → answer at repro time; consider a structural fix over another patch.
- Tab trainer v1 scope: plain blow/draw notes only, or include bends (e.g. -3')? Which tab notation? → decide at /build for the trainer.

## Deferred on purpose
- Timed/scrolling challenge modes stay opt-in, never the default (PRD design principle #1) — reinforced 2026-06-12: Simone finds the timed games clunky and annoying.
- Tab *import* tooling — v1 of the tab trainer uses a couple of hardcoded tabs; an importer only after reading practice proves itself.

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
**2026-06-12 — Retrofitted the org layer; harmonica pivot set.** Scaffolded AGENTS.md + context/ logs via /newproject, then Simone set direction: journal is dead, reliability (all-screens-render bug) blocks adoption, harmonica training is the next arc — tab-reading trainer on C diatonic, untimed and player-driven. **Pick up by:** reproducing the all-screens bug, then /build the tab trainer.
