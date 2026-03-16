---
id: REQ-006
title: Auto-range Y axis broken for high/low notes
status: pending
created_at: 2026-03-15T16:30:00Z
user_request: UR-003
related: [REQ-005]
batch: graph-fixes
---

# Auto-Range Y Axis Broken for High/Low Notes

## What
The auto-range feature that expands the Y axis to fit detected high or low notes no longer works. Notes outside the default range (C3–C6) are not visible even when detected.

## Context
The auto-range logic in `#updateAutoRange()` checks buffer data and expands `#detectedMidiMin`/`#detectedMidiMax`. This may have broken when the pause/speed fixes were applied — need to verify the buffer data flow still reaches the auto-range check, and that `#updateRange()` is being called correctly.

## Verification

**Source**: UR-003/input.md
**Pre-fix coverage**: 100% (1/1 items)
**Post-fix coverage**: 100% (1/1 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Height management for low/high notes broken | What | Full |

*Verified by verify-request action*

---
*Source: "the like height management for especially low or high notes doesnt work anymore"*
