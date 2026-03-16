---
id: REQ-004
title: Graph canvas buggy when changing speeds and pausing/unpausing
status: pending
created_at: 2026-03-15T15:45:00Z
user_request: UR-002
related: [REQ-002, REQ-003]
batch: graph-bugs
---

# Graph Canvas Buggy When Changing Speeds and Pausing/Unpausing

## What
The graph canvas gets "off" and behaves erratically when changing scroll speeds and pausing/unpausing. The visual state drifts from where it should be — data jumps, scroll position seems wrong, and the overall rendering becomes unreliable with repeated speed/pause interactions.

## Context
Likely caused by the scroll time accumulation model interacting badly with speed changes. When speed changes, `#pixelsPerMs` updates but `#scrollTimeMs` stays the same — the mapping between time and pixels shifts, causing existing data points to visually jump. Combined with the pause data-leak issue (REQ-003), these compound into general instability.

Root cause is probably that the graph conflates "virtual scroll time" with "real buffer timestamps." Need a cleaner model where speed only affects the visual mapping (pixels per ms of data), not the time tracking itself.

## Verification

**Source**: UR-002/input.md
**Pre-fix coverage**: 100% (1/1 items)
**Post-fix coverage**: 100% (1/1 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Canvas buggy when changing speeds / pausing / unpausing | What, Context | Full |

*Verified by verify-request action*

---
*Source: "also the canvas can just be really buggy when changing speeds - pausing/unpausing - it gets 'off' quickly"*
