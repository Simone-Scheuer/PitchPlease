---
id: REQ-003
title: Pause doesn't stop pitch recording — data leaks through
status: pending
created_at: 2026-03-15T15:45:00Z
user_request: UR-002
related: [REQ-002, REQ-004]
batch: graph-bugs
---

# Pause Doesn't Stop Pitch Recording — Data Leaks Through

## What
When the graph is paused, the pitch detector and buffer keep recording data. When unpaused, all the pitch data accumulated during the pause renders at once, causing a visual jump/dump of data. Pause should truly pause — stop recording pitch data into the buffer, not just freeze the scroll.

## Context
Currently pause only stops the scroll time from advancing in the graph component. But the pitch buffer keeps receiving events from the detector via the event bus, and the detector's rAF loop keeps running. On unpause, the buffer has data with timestamps that are ahead of where the scroll was frozen, causing the dump.

Fix needs to either:
- Stop the buffer from recording while paused, OR
- Discard buffer entries that arrived during pause

## Verification

**Source**: UR-002/input.md
**Pre-fix coverage**: 100% (2/2 items)
**Post-fix coverage**: 100% (2/2 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Pause has delay but still listens | What | Full |
| 2 | Post-renders pitches made while paused | What | Full |

*Verified by verify-request action*

---
*Source: "when i pause theres a delay but its still listening and post renders whatever pitches i made while paused rather than truly pausing"*
