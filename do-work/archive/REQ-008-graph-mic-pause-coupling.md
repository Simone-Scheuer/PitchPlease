---
id: REQ-008
title: Rearchitect graph mic/pause to fix rendering instability
status: pending
created_at: 2026-03-15T16:45:00Z
user_request: UR-004
---

# Rearchitect Graph Mic/Pause to Fix Rendering Instability

## What
The graph view has fundamental instability caused by mic (pitch detection) and scroll (rendering) being independently controllable. Pitch data arriving while scroll is paused or graph is inactive causes data pileups, visual jumps, and broken state when switching tabs. Need to couple mic and scroll so they can't desync.

## Root Cause Analysis
The core issue: the pitch detector and buffer keep receiving and storing data even when the graph scroll is paused or the view is inactive. This means:
- Tab switch away and back → buffer has data with timestamps the graph wasn't tracking
- Pause → buffer fills up → unpause dumps everything
- Speed changes compound the problem

## Proposed Approach
Merge mic and pause into a single toggle — one button controls both. When "on": mic is active, scroll is running, buffer is recording. When "off": everything stops together. No desync possible.

The current note display in the sidebar labels can still update via the event bus (it reads buffer data) — but the buffer should not accumulate new entries when the graph is stopped.

## User Notes
- User likes seeing current note while paused but acknowledges it causes issues
- User suggested: start with mic on + paused, or merge mic/pause into one button
- Certainty level: exploratory — user gave multiple ideas, builder has latitude on exact approach
- The key constraint: detection happening when scroll is off is the root cause and must be solved

## Verification

**Source**: UR-004/input.md
**Pre-fix coverage**: 100% (5/5 items)
**Post-fix coverage**: 100% (5/5 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Switching tabs breaks graph | What | Full |
| 2 | Detection running when scroll off is root cause | Root Cause Analysis | Full |
| 3 | Merge pause and mic into one button idea | Proposed Approach | Full |
| 4 | User likes seeing current note while paused | User Notes | Full |
| 5 | Several approach options given (mic+paused, can't unpause w/o mic, merge buttons) | User Notes | Full |

*Verified by verify-request action*

---
*Source: "fundamentally a lot of these issues are coming from note detection happening when scroll is off"*
