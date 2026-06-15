---
project: PitchPlease
domain: personal
status: active
stakeholder: Simone (no external stakeholder)
last_updated: 2026-06-15
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
**Harmonica tab trainer — v1 shipped** (2026-06-15, merged to main). A new "Tabs" view: searchable song library (9 hardcoded songs) + random run + paste-your-own, played on a breath-ribbon (blow above / draw below a fixed playhead, hold-ring per note). Advancement is **onset-gated** — a repeated note needs a release + re-attack, so one sustained breath can't swipe through repeats. Tunable note-length dial + arrow/button nav. Spec: `context/TAB_TRAINER_PRD.md`.
**Next:** (1) Simone ear-checks the library tabs on a real harp — they're parser-valid but sourced from harptabs, not verified against recordings. (2) Convert more songs from `context/SONG_LIBRARY.md` into the library (needs whitespace cleanup + parse-check). (3) Smaller items (graph trace-preserve, drone redesign) in FIXES_running.

## Active Work
*(🎯 in progress · 🅿️ parked · 🟡 blocked)*
- 🎯 Tab trainer: ear-check the 9 library tabs on a real harp; convert more songs from SONG_LIBRARY.md
- 🅿️ Graph: preserve trace across pause/resume (offered, awaiting go — see FIXES_running)
- 🅿️ Build out the pitch viewer further (loved core; no concrete asks yet)
- 🅿️ Drone screen redesign (Simone: "stupid and ugly") — no spec yet

> Verification caveat: tab trainer was verified in Chrome via synthetic pitch
> events (no mic in automation) + node unit tests. The real mic happy-path
> (click song → mic → play, dial feel, arrow keys live) wants a device check.

## Recent Wins
- 2026-06-15 — Harmonica tab trainer v1 shipped & merged: notation parser, onset-gated `tab-runner`, breath-ribbon renderer, searchable 9-song library, length dial, arrow/button nav. 35 unit tests.
- 2026-06-12 — P0 session-freeze fix (activation token, mic timeout, End-always-exits); graph tap-to-pause; dark-mode default; tuner sliding pitch strip. Org layer retrofitted.
- 2026-04-21 — UI overhaul shipped: light theme, journal removed, scale settings, drone voices

## Open Questions
- How does the all-screens-at-once bug reproduce? History of view-visibility fixes (hidden-attribute, z-index, display:none→flex) suggests the view-switching layer is fragile, not one-off. The tab trainer hit the same class (a `display:flex` defeating `[hidden]`) and fixed it with an ID-scoped `[hidden]` rule. → still no single structural fix; watch for recurrence.
- Are the library tabs melodically correct? Parser-valid but sourced from harptabs, unverified against recordings. → resolve by ear on a real harp.

## Deferred on purpose
- Timed/scrolling challenge modes stay opt-in, never the default (PRD design principle #1) — reinforced 2026-06-12: Simone finds the timed games clunky and annoying.
- Tab *file import / scraping* — v1 ships a hardcoded library + a paste-your-own box; harptabs blocks bots (403) and bundling a scraped DB is a copyright gray area, so songs come in by hand. A real importer only if reading practice proves itself.
- Double-stop / chord tabs — the trainer is monophonic by design; songs that lean on double-stops (e.g. some Piano Man tabs) need single-note versions or sit out.

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

**2026-06-12 (cont.) — Shipped the reliability P0 + three polish wins.** Fixed the session-freeze/all-screens bug; graph tap-to-pause, dark-mode default, tuner sliding pitch strip. Service-worker cache-first made browser testing painful — use fresh ports to bust stale modules.

**2026-06-13→15 — Built & shipped the harmonica tab trainer (v1), merged to main.** Full arc via the spine: /build → parser (`harmonica-tab.js`, 17 tests) → built-ins + random gen → view shell + breath-ribbon renderer (reused exercise-runtime at first). Real-mic feedback then drove a redesign: the reference-tone bled into the mic and auto-advanced; repeated notes swiped through on one breath. Replaced the shared engine with a purpose-built **onset-gated `tab-runner`** (release is audio-defined, not tab-defined; 10 tests), added a length dial + arrow/button nav, and swapped notation-preview cards for a **searchable library**. Tabs sourced from harptabs (parser-validated, ear-check pending). 35 unit tests; verified in Chrome via synthetic pitch events. **Pick up by:** Simone ear-checks the 9 library tabs on a real harp + confirms the mic happy-path (click→mic→play, dial feel, arrow keys). Then convert more SONG_LIBRARY.md songs. Pushed — Netlify auto-deploys (bump SW cache version if modules went stale).
