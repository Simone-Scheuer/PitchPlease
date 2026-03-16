---
id: REQ-002
title: Scale overlay doesn't render until mic is on
status: pending
created_at: 2026-03-15T15:45:00Z
user_request: UR-002
related: [REQ-003, REQ-004]
batch: graph-bugs
---

# Scale Overlay Doesn't Render Until Mic Is On

## What
When selecting a scale (root + type) in the graph view, the scale highlight bands don't appear on the grid until the mic is activated. They should render immediately on the grid when a scale is selected, regardless of whether the mic/graph is actively running.

## Context
The graph only draws when `#active` is true (inside the rAF animation loop). Scale selection updates the internal state but the canvas isn't redrawn because the animation loop isn't running. Need to trigger a static redraw when scale changes while inactive.

## Verification

**Source**: UR-002/input.md
**Pre-fix coverage**: 100% (1/1 items)
**Post-fix coverage**: 100% (1/1 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Scale doesn't render until mic is turned on | What | Full |

*Verified by verify-request action*

---
*Source: "when i select a scale mode it doesnt render on the graph until i turn the mic on"*
