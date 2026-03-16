---
id: REQ-024
title: Scroll-targets renderer
status: completed
claimed_at: 2026-03-16T01:04:00Z
completed_at: 2026-03-16T01:10:00Z
route: C
created_at: 2026-03-16T01:00:00Z
user_request: UR-010
related: [REQ-023, REQ-025, REQ-026]
batch: renderer-abstraction
---

# Scroll-Targets Renderer

## What
Create `js/renderers/scroll-targets.js` — extract the scrolling bar + player trail rendering from `game-canvas.js` into a standalone renderer conforming to the renderer interface. Add player-driven mode where bars wait at the play zone.

## Detailed Requirements
- Implement the full renderer interface from renderer-base.js (init, start, update, stop, destroy, onCountdown, onLoopRestart)
- Extract from game-canvas.js: note bar rendering, player pitch trail dots, score badges, MIDI-to-Y mapping, play zone line, grid lines, note labels
- **Player-driven mode** (new, default): bars scroll to the play zone and WAIT there. When the evaluator signals advance (evaluatorResult.advance === true), the completed bar slides left and the next bar arrives. Bars never scroll past the player.
- **Fixed-tempo mode**: preserves current scrolling behavior (bars scroll at constant speed, time-based)
- Determine mode from exercise config timing.mode
- Visual style preserved: colored bars (default teal, in-tune bright teal, close yellow, off red), white player trail dots with connecting lines, score badges on completed notes
- Canvas setup via renderer-base.js utilities (setupCanvas, centsToColor, drawNoteLabel)
- Handle resize events
- Update method receives state from exercise runtime: { pitchData, targetNote, cursor, noteCount, elapsed, evaluatorResult, exerciseState }
- onCountdown: show large centered countdown number
- onLoopRestart: reset trail and bar positions
- destroy: remove event listeners, cancel any pending animations

## Builder Guidance
- Certainty level: Firm for fixed-tempo (existing), Firm for interface (defined), Medium for player-driven visuals (new behavior)
- Read game-canvas.js thoroughly — most rendering logic ports directly
- The biggest change is player-driven mode: bars queue up at the play zone instead of scrolling past
- Don't import from game-canvas.js — extract the logic cleanly into the new file
- Use renderer-base.js utilities for canvas setup and colors

---
*Source: Phase 2.2 of IMPLEMENTATION_PLAN.md*
