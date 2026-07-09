---
project: PitchPlease
domain: personal
status: active
stakeholder: Simone (no external stakeholder)
last_updated: 2026-07-09
phase: active
tags: [music, pwa, audio, ear-training]
---

# PitchPlease

> Source of truth. Read at the start of every session. Update at the end. That ritual is the entire point.
> Conventions and archive policy live in `INSTRUCTIONS.md`. Decisions log lives in `context/DECISIONS_log.md`.

## North Star
**What:** A pitch mirror that knows Simone's instruments. Real-time pitch detection on one flagship screen (the graph) that answers "which note am I playing, in my instrument's language" — harp hole numbers, whistle fingerings, harp position — plus a precision tuner and the bend trainer. Fully client-side PWA, no backend.
**Why it matters:** Tuning, calibrating, and pitch practice are the daily need (harmonica, tin whistle, whistling, mouth trumpet). The app's edge is its ears; anything paper does better (reading tabs) stays on paper.
**Success looks like:** It's the only thing Simone thinks to open when she wants to tune or practice pitch.
**Out of scope:** Backend/accounts/sync. Polyphonic detection. Social. Journal (dead 2026-06-12). Guided sessions/skill profiles/curriculum (built in the v2 era, never validated, cut 2026-07-09). In-app tab reading (v1 shipped, didn't stick, retired 2026-07-09).

**Stakeholder:** Simone (no external stakeholder)

## Current Focus
**Full rebuild — "the pitch mirror" — built on `rebuild/pitch-mirror`, awaiting Simone's device check + merge** (2026-07-09). The graph is now the app: instrument-native edge rails (harp tab tokens incl. bends, whistle fingering dots), corner HUD (note + native token + cents + hold stats + position chip), scale overlay with in-key %, drone as a layer, pause-holds-trace. Tuner and Bends are the other two tabs; guided-session machine, game cluster, drone tab, and tab trainer are gone (−18k lines net). New dithered-print design system (Departure Mono, bundled) with three whole-app skins: press / neon / riso. A4 reference exposed + tune-to-my-instrument calibration. Spec: `PRD.md` v3.
**Next:** (1) Simone plays with it on a real device (branch `rebuild/pitch-mirror`, `python3 -m http.server` or Netlify preview) — mic feel, rail readability on phone, skin taste. (2) Merge + deploy on her go (bump SW cache if needed; it's at v30). (3) React to real-use feedback; candidates in "Open by design" in PRD v3.

## Active Work
*(🎯 in progress · 🅿️ parked · 🟡 blocked)*
- 🟡 Rebuild device check + merge decision — blocked on Simone
- 🅿️ Trace scrub-back after pause (data exists; build if asked)
- 🅿️ Per-instrument calibration offsets (one global A4 today)

> Verification caveat: rebuild verified in Chrome via an oscillator-backed
> fake mic (real pipeline, synthetic tone): trail + skins + HUD + hold stats +
> pause/resume trace + in-key % + position chip + tuner cents + bend lock +
> calibration math. Hidden automation tabs suspend rAF — that cost an hour of
> ghost-chasing; it is NOT an app bug. Real-mic feel wants a device check.

## Recent Wins
- 2026-07-09 — Full rebuild on `rebuild/pitch-mirror`: graph-first IA (Graph/Tuner/Bends), instrument-native rails + HUD + position math, A4 calibration flow, three print skins, Departure Mono design system, −18k lines net. Structural `[hidden] !important` fix retires the view-visibility bug class. 11 unit tests on instrument math.
- 2026-06-15 — Harmonica tab trainer v1 shipped & merged (retired 2026-07-09; parser lessons live on in the hole-label rail).
- 2026-06-12 — P0 session-freeze fix; graph tap-to-pause; dark-mode default; tuner sliding pitch strip. Org layer retrofitted.

## Open Questions
- ~~How does the all-screens-at-once bug reproduce?~~ → **Structurally closed 2026-07-09**: `[hidden] { display:none !important }` in reset.css + a single registry-driven `.view.active` mechanism. The bug class cannot recur by construction; delete this line if a year passes without a sighting.
- Do the new skins hold up on a real phone screen (glare, brightness, canvas DPI)? → Simone's device check.
- Is one global A4 enough, or does she want per-instrument saved offsets (C harp sharp, D whistle flat)? → wait for real calibration use.

## Deferred on purpose
- Timed/scrolling challenge modes stay opt-in, never the default — reinforced 2026-06-12: Simone finds the timed games clunky and annoying.
- Tab reading in-app — retired with the tab trainer. The graph's hole-number rail delivers the goal passively (read paper tabs, glance at the graph to see which hole you actually hit). A "tab as target layer" only if the rail proves insufficient.
- Whistle half-holings, harp overblows, third-octave fingerings — the maps cover standard technique; extend when her playing does.

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

**2026-06-13→15 — Built & shipped the harmonica tab trainer (v1), merged to main.** Parser → onset-gated `tab-runner` → searchable library. 35 unit tests; verified via synthetic pitch events. (Retired in the 07-09 rebuild — reading real tabs stayed nicer than reading in-app.)

**2026-07-09 — Scoped, then rebuilt the entire site as "the pitch mirror" (branch `rebuild/pitch-mirror`, not merged).** Diagnosis first: ~40% of the 20k-line codebase served products Simone never bought (dead game cluster, never-validated session machine); each generation had added a sibling tab instead of enriching the graph she actually opens. She green-lit a full rebuild: graph-first, bend trainer kept, tab trainer cut, "incredibly attractive" with dithered-print aesthetics and toggleable skins. Shipped in two commits: demolition (−11.7k lines), then the rebuild — instrument profiles (`js/utils/instruments.js`: harp tokens, whistle fingerings, position math; 11 node tests), settings + A4 calibration flow, three skins (press/neon/riso) over a Departure Mono design system, pause-holds-trace, one view mechanism, `[hidden] !important`. Verified end-to-end in Chrome with an oscillator-backed fake `getUserMedia` (real detector, real canvas): melodies draw, skins render (neon glow, riso misregistration), tuner reads +12¢ exactly, bend −4' locks, calibration measured +15¢ → A4 443.8 → same tone reads 0¢. Gotchas for next time: hidden automation tabs suspend rAF (shim it, don't debug ghosts); `?dev` now skips the SW (the fresh-ports dance is dead). New instruments fact: Simone also plays **tin whistle** (profile shipped: C/D/Eb/F/G/Bb/Low D). **Pick up by:** Simone device-checks the branch (mic feel, phone readability, skin taste) → merge on her go → react to real use.

**2026-07-09 (cont.) — First device feedback landed ("fucking incredible… really really impressed") + fix round.** Real-use nits, all shipped same session: scroll clock rebuilt (derived real time; speed = render zoom, live dot pinned to playhead — the "weird compression" was clock drift at speeds ≠ 1x), rail typography (one token size, bends full-size, blow/draw digits aligned via minus-column, key highlight bands across the rail, everything bigger), whistle HUD fingerings as squares matching the rail, PLAY SCALE labeled and fronting the NOTE/GAP/DIR/LOOP strip, DRONE button labeled with its note ("DRONE G4"). She loves riso. 6th-position for A minor on C harp noted as correct-but-unplayable — left as is, by her call.
