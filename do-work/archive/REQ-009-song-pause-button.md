---
id: REQ-009
title: Add pause/resume button for songs in game mode
status: pending
created_at: 2026-03-15T16:50:00Z
user_request: UR-005
---

# Add Pause/Resume Button for Songs in Game Mode

## What
Add a pause button to the game controls that pauses the song mid-play and resumes where you left off. This is a practice tool — players need to be able to stop, think, breathe, then continue without restarting.

## Context
The restart button already exists. The song engine already has `pause()` and `resume()` methods. This just needs a UI button wired to them, plus pausing the game canvas scroll and mic detection while paused.

## Verification

**Source**: UR-005/input.md
**Pre-fix coverage**: 100% (2/2 items)
**Post-fix coverage**: 100% (2/2 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Pause button for songs | What | Full |
| 2 | Practice tool first — reduce friction | What | Full |

*Verified by verify-request action*

---
*Source: "a pause button for songs would be great - its a practice tool first"*
