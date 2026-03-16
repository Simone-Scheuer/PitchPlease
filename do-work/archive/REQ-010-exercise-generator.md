---
id: REQ-010
title: Dynamic exercise generator module
status: pending
created_at: 2026-03-15T17:10:00Z
user_request: UR-006
related: [REQ-011]
batch: practice-tool
---

# Dynamic Exercise Generator Module

## What
Create a module that dynamically generates note arrays (in the same format the song engine expects) from user-configurable parameters. Replaces the need for hardcoded scale "songs."

## Detailed Requirements
- Input parameters:
  - `root`: note name (C, D, E, F, G, A, B + sharps)
  - `scale`: scale type key (major, minor, pentatonic, blues, etc. — use existing scales.js data)
  - `octaveLow` / `octaveHigh`: octave range (e.g., 3–5 means C3 to C5)
  - `noteDuration`: ms per note (default generous — e.g., 1000ms)
  - `noteGap`: ms of rest between notes (default 300ms+ so notes don't overlap/feel rushed)
  - `pattern`: 'ascending' | 'descending' | 'up-and-back' | 'random'
- Output: a song-compatible object `{ id, title, notes: [{ note, duration }...], difficulty, bpm }` that feeds directly into `songEngine.load()`
- Ascending: walk up the scale across the octave range
- Descending: walk down
- Up-and-back: ascend then descend (no duplicate at top)
- Random: randomize note order within the scale+range
- Generated title should be descriptive (e.g., "C Major — C3 to C5 — Ascending")
- Notes must have generous spacing by default — this is practice, not a speed challenge

## Constraints
- Must output the exact same format as `STARTER_SONGS` entries so the song engine works unchanged
- Uses existing scale definitions from `js/utils/scales.js`
- Note gap implemented as a rest (silent period) — either as actual gap in duration or by adding extra time to each note's duration

## Builder Guidance
- Certainty level: Firm on parameters and output format, exploratory on implementation details
- Scope cues: "customizable training tool not just gamification"
- Builder has latitude on exact API shape of the generator function

## Full Context
See [user-requests/UR-006/input.md](./user-requests/UR-006/input.md) for complete verbatim input.

## Verification

**Source**: UR-006/input.md
**Pre-fix coverage**: 100% (7/7 items)
**Post-fix coverage**: 100% (7/7 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Octave range selection | Detailed Requirements (octaveLow/octaveHigh) | Full |
| 2 | Scale+root selection | Detailed Requirements (root, scale) | Full |
| 3 | Note duration control | Detailed Requirements (noteDuration) | Full |
| 4 | Gap between notes | Detailed Requirements (noteGap) | Full |
| 5 | Pattern selector | Detailed Requirements (pattern) | Full |
| 6 | Same format as song engine | Constraints | Full |
| 7 | Generous default spacing | Detailed Requirements | Full |

*Verified by verify-request action*

---
*Source: See UR-006/input.md for full verbatim input*
