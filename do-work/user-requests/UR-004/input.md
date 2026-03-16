---
id: UR-004
title: Rearchitect graph mic/pause coupling to fix rendering bugs
created_at: 2026-03-15T16:45:00Z
requests: [REQ-008]
word_count: 82
---

# Rearchitect graph mic/pause coupling to fix rendering bugs

## Full Verbatim Input

investigate the rendering - switching between tabs can kinda break the graph - it should start mic on and paused probably, or at least cant unpause until the mic is off, or the pause button and the mic one are the same because fundamentally a lot of these issues are coming from note detection happening when scroll is off- i like that i can see what note im on when im paused but it seems to be causing a lot of issues.

---
*Captured: 2026-03-15T16:45:00Z*
