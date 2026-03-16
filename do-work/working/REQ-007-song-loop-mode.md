---
id: REQ-007
title: Add continuous looping mode for songs
status: pending
created_at: 2026-03-15T16:30:00Z
user_request: UR-003
---

# Add Continuous Looping Mode for Songs

## What
Add a looping mode where the song repeats continuously instead of stopping at the end and showing results. Between each iteration, show a brief popup score for that run, then loop back with a gap. This reduces friction — the player stays in flow instead of start/stop/results/retry.

## Detailed Requirements
- Song loops automatically after finishing (no results screen in loop mode)
- Brief popup score overlay shown between iterations (e.g., "82" in large text, fades after 2s)
- Nice gap between loops (2-3 seconds) so the player can breathe
- Per-iteration scoring resets for fresh score each loop
- Toggle to enable/disable loop mode (default: on? or a button in controls)
- When loop mode is off, existing behavior (results screen) still works
- The lead-in gap (REQ-001) should also apply on each loop restart

## Verification

**Source**: UR-003/input.md
**Pre-fix coverage**: 100% (4/4 items)
**Post-fix coverage**: 100% (4/4 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Song loops continuously | What | Full |
| 2 | Popup score between iterations | Detailed Requirements | Full |
| 3 | Nice gap between loops | Detailed Requirements | Full |
| 4 | Reduces friction to practicing | What | Full |

*Verified by verify-request action*

---
*Source: "let the song loop and just give a pop up score on screen for each iteration, this reduces the friction to practicing songs - just make sure theres a nice gap between each one"*
