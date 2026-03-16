---
id: REQ-025
title: Seismograph renderer for sustained exercises
status: pending
created_at: 2026-03-16T01:00:00Z
user_request: UR-010
related: [REQ-023, REQ-024, REQ-026]
batch: renderer-abstraction
---

# Seismograph Renderer

## What
Create `js/renderers/seismograph.js` — new renderer for sustained exercises (long tones, drone match, centering) showing real-time pitch deviation as a scrolling trace.

## Detailed Requirements
- Implement full renderer interface from renderer-base.js
- Visual: horizontal scrolling trace with center line = 0 cents deviation from target
- Trace oscillates above/below center based on actual cents deviation
- Continuous smooth line (not dots) — store recent deviation points, draw as path
- Color: green (#4ecdc4) when within ±5 cents, yellow (#ffe66d) ±5-15 cents, red (#ff6b6b) >15 cents
- Color transitions smoothly along the trace (each segment colored by its deviation)
- Y-axis: ±50 cents range, with grid lines at ±10, ±25, 0 (center emphasized)
- Target note name displayed large in top-left corner
- "Steady streak" counter in top-right: shows how long the trace has stayed within ±5 cents continuously, formatted as seconds (e.g., "3.2s")
- Scrolls left continuously at a fixed rate (the playhead is at the right edge)
- When no pitch detected (silence), show a gap in the trace (don't draw to 0)
- Canvas setup via renderer-base.js utilities
- onCountdown: show large centered countdown number
- onLoopRestart: clear the trace buffer
- Data buffer: circular array of recent deviation readings (last ~10 seconds worth)

## Builder Guidance
- Certainty level: Firm — visual spec is clear
- This is entirely new code, no extraction from existing modules
- Use Canvas2D path drawing for the smooth trace line
- The steady streak counter is computed from evaluatorResult data (evaluatorResult.inTune) tracking consecutive true frames
- Keep the visual clean and minimal — dark background, just the trace and labels

---
*Source: Phase 2.3 of IMPLEMENTATION_PLAN.md*
