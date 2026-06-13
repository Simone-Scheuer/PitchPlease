# Decisions log — PitchPlease

*Append-only. Newest on top. One entry per decision: **YYYY-MM-DD — Bold headline.** Then 1-3 lines: why + revisit trigger.*

---

- **2026-06-12 — Tuner visualizer: horizontal scrolling strip, fixed-center crosshair (Model I).** Chose smooth-scroll (scale slides past a fixed center = your pitch) over a moving-dot/fixed-grid model, because Simone's words were "the whole scale slides" and it avoids the jarring semitone snap at note boundaries. Tradeoff accepted: sharp puts the target tick left-of-center (relative motion) rather than a dot moving right. Revisit if the direction confuses her in real use.
- **2026-06-12 — Default theme flipped to dark.** Simone asked; light (the April overhaul) stays as an opt-in toggle. Noted the reversal at the time; she still wanted dark.
- **2026-06-12 — Graph tap-to-pause aliases the mic toggle, never a second pause state.** Deliberate, to avoid repeating the multi-pause-state bugs (REQ-003/008/012). Center tap = same code path as the mic button + a flash; edge-label press-and-hold-to-drone preserved.
- **2026-06-12 — Journal is dead, permanently.** Simone confirmed: built (REQ-023), cut in the 04-21 overhaul, not coming back. Resolves the open question; supersedes the reconstructed entry below.
- **2026-06-12 — Harmonica pivot: reliability first, then tab-reading trainer.** App was never reliable enough to want to open (all-screens-render bug); pitch viewer + bend trainer are the loved core; timed games felt clunky. New arc: fix P0 bug → C-diatonic tab-reading trainer (untimed, verify-then-advance). Revisit if real use shows the trainer isn't sticky.
- **2026-06-12 — `PRD.md`, `IMPLEMENTATION_PLAN.md`, `CLAUDE.md` stay at repo root.** Archived `do-work/` REQs reference them by path; moving them breaks the trail for zero gain. Revisit if root clutter grows.
- **2026-06-12 — Org layer retrofitted via /newproject.** Domain: personal. Stakeholder: Simone. Project had 81 commits and its own ad-hoc system (PRD, plan, do-work queue) — scaffold wraps it rather than replacing it.
- ~~2026-04-21 — Journal removed in UI overhaul (reconstructed)~~ → superseded by 2026-06-12 "Journal is dead" entry above.
