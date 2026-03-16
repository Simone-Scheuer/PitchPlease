---
id: REQ-012
title: Fix speed control — scroll speed without shrinking notes
status: pending
created_at: 2026-03-15T17:40:00Z
user_request: UR-007
related: [REQ-013, REQ-014]
batch: practice-flow
---

# Fix Speed Control — Scroll Speed Without Shrinking Notes

## What
The tempo/speed control currently changes how durations are interpreted, which shrinks note bar widths and makes the exercise harder. Speed should only control how fast the canvas scrolls — note bars should maintain the same visual width regardless of speed setting.

## Detailed Requirements
- Speed control changes pixels-per-ms scroll rate of the game canvas
- Note bar width stays fixed based on note duration (visual width = duration in pixels at a constant rate)
- Slower speed = more time to see notes coming, same bar size
- Faster speed = less reaction time, same bar size
- The song engine's tempo scale should NOT be used for this — it changes note durations which is the wrong behavior
- Speed is a visual/scroll property, not a music property

## Verification

**Source**: UR-007/input.md
**Pre-fix coverage**: 100% (3/3 items)
**Post-fix coverage**: 100% (3/3 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Speed control shrinks notes (bug) | What | Full |
| 2 | Speed should change scroll rate only | Detailed Requirements | Full |
| 3 | Note bar width stays same regardless | Detailed Requirements | Full |

*Verified by verify-request action*

---
*Source: "Need proper scroll speed control that changes how fast bars move across the screen WITHOUT changing note bar sizes"*
