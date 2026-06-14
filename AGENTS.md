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
**Harmonica pivot** (set 2026-06-12). The reliability P0 is **fixed** (session-freeze / all-screens-render bug — activation token + mic timeout + End-always-exits). Polish on the loved core is also done this session: graph tap-to-pause, dark-mode default, tuner sliding pitch strip. Next big arc is the **harmonica tab-reading trainer**: hole→pitch math for C diatonic Richter (bend maps from commit 15390d2 may already cover part of this), show a tab number, verify the played pitch, advance to the next — untimed, player-driven, "ball bouncing game" style. Spec it via /build. Smaller open items (graph trace-preserve, drone redesign) in FIXES_running.

## Active Work
*(🎯 in progress · 🅿️ parked · 🟡 blocked)*
- 🅿️ Harmonica tab-reading trainer (spec via /build — the main feature arc)
- 🅿️ Graph: preserve trace across pause/resume (offered, awaiting go — see FIXES_running)
- 🅿️ Build out the pitch viewer further (loved core; no concrete asks yet)
- 🅿️ Drone screen redesign (Simone: "stupid and ugly") — no spec yet

> Verification caveat: this session's fixes were verified in Chrome via synthetic
> events (the automation env has no mic). The mic happy-path for all three —
> session start, tap-to-pause, tuner strip — still wants one manual check on a
> real device before fully trusting them. Not yet pushed.

## Recent Wins
- 2026-06-12 — P0 session-freeze fix (activation token, mic timeout, End-always-exits); graph tap-to-pause; dark-mode default; tuner sliding pitch strip. Org layer retrofitted.
- 2026-04-21 — UI overhaul shipped: light theme, journal removed, scale settings, drone voices

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
| Harmonica tab trainer spec | `context/TAB_TRAINER_PRD.md` |
| Song tabs (raw staging for the library) | `context/SONG_LIBRARY.md` |
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
**2026-06-12 — Retrofitted the org layer; harmonica pivot set.** Scaffolded AGENTS.md + context/ logs via /newproject, then Simone set direction: journal is dead, reliability blocks adoption, harmonica training is the next arc.

**2026-06-12 (cont.) — Shipped the reliability P0 + three polish wins.** Fixed the session-freeze/all-screens bug (root-caused live: mic acquired before hiding the tab bar with no timeout, plus no cancellation of stale async activate()). Then: graph tap-to-pause w/ flash, dark-mode default, and the tuner sliding pitch strip (new PitchStrip replacing the needle). All verified in Chrome via synthetic events; mic happy-path unverified (no mic in automation); nothing pushed yet. Dev note: the service worker's cache-first + HTTP heuristic caching made iterative browser testing painful — needed fresh ports or `fetch(...,{cache:'reload'})` to bust stale modules. **Pick up by:** Simone manually checks the three fixes on a real mic; if good, push (Netlify auto-deploys, cache is v25). Then /build the harmonica tab trainer.
