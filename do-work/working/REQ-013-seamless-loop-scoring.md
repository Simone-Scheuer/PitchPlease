---
id: REQ-013
title: Seamless loop scoring — no freeze, continuous scroll
status: pending
created_at: 2026-03-15T17:40:00Z
user_request: UR-007
related: [REQ-012, REQ-014]
batch: practice-flow
---

# Seamless Loop Scoring — No Freeze, Continuous Scroll

## What
Remove the stop/freeze between loop iterations. The canvas should keep scrolling continuously. Display the score as an overlay during the 3-second gap while the next iteration's bars approach. No disruption to flow.

## Detailed Requirements
- When a loop iteration ends, do NOT stop the canvas or the song engine
- Show the iteration score as a floating overlay that fades in/out during the gap
- Canvas keeps scrolling — the gap between loops shows empty space, then the next set of bars appear
- Song engine should seamlessly restart the note sequence after the gap
- The gap is visual breathing room, not a hard stop
- Score resets for each iteration but the scroll never pauses

## Verification

**Source**: UR-007/input.md
**Pre-fix coverage**: 100% (3/3 items)
**Post-fix coverage**: 100% (3/3 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Remove stop-to-score freeze | What | Full |
| 2 | Keep canvas scrolling during gap | Detailed Requirements | Full |
| 3 | Display score as overlay during gap | Detailed Requirements | Full |

*Verified by verify-request action*

---
*Source: "Keep the canvas scrolling during the gap between loops, display the score as an overlay during the 3 second gap while bars keep moving"*
