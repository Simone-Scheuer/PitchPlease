---
id: REQ-005
title: Graph grid/staff doesn't render until mic is on
status: pending
created_at: 2026-03-15T16:30:00Z
user_request: UR-003
related: [REQ-006]
batch: graph-fixes
---

# Graph Grid/Staff Doesn't Render Until Mic Is On

## What
The graph view shows a blank canvas until the mic is activated. The grid lines, note labels, and scale overlay should render immediately when the user switches to the graph tab — not wait for mic start.

## Context
Similar to the scale render bug (REQ-002). The `#draw()` method only runs inside `#animate()` which requires `#active = true` (set by `start()`). The `#drawStatic()` method exists but isn't called when the graph view activates. Need to trigger an initial draw when the view becomes visible.

## Verification

**Source**: UR-003/input.md
**Pre-fix coverage**: 100% (1/1 items)
**Post-fix coverage**: 100% (1/1 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Staff doesn't render until mic is on | What | Full |

*Verified by verify-request action*

---
*Source: "the staff doesnt render until mic is on so we should probably fix that"*
