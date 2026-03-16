---
id: REQ-029
title: Session view — full-screen exercise UI
status: pending
created_at: 2026-03-16T02:00:00Z
user_request: UR-011
related: [REQ-027, REQ-028, REQ-030]
batch: session-system
---

# Session View

## What
Create `js/views/session-view.js` and `css/session.css` — full-screen view that takes over during a practice session, showing the current exercise renderer with session progress and controls.

## Detailed Requirements
- HTML structure (add to index.html):
  ```
  <div id="session-view" class="view" hidden>
    <div class="session-progress"></div>
    <div class="session-exercise-label"></div>
    <canvas id="session-canvas"></canvas>
    <div class="session-controls">
      <button class="session-btn" id="session-pause">Pause</button>
      <button class="session-btn" id="session-skip">Skip</button>
      <button class="session-btn" id="session-end">End</button>
    </div>
    <div class="session-summary" hidden></div>
  </div>
  ```
- Session progress bar (top): shows blocks as colored segments, current block highlighted with accent color, completed blocks dimmer. Width proportional to block duration.
- Exercise label (below progress): current exercise name and brief description, animated transition on block change
- Canvas area: takes up most of the screen, shared between renderers. The session runner's renderers draw here.
- Controls (bottom): pause/resume toggle, skip to next exercise, end session early. Min 44x44px touch targets.
- Transition between exercises: brief interstitial overlay (1-2s) showing "Next: [exercise name]" centered on canvas, then fades
- Session complete: summary overlay with exercises completed count, total duration, overall score/measurements, "Back to Practice" button
- Full-screen: hides the bottom tab bar when active, restores on exit
- Wires to session runner events: session:block-start updates label + progress, session:transition shows interstitial, session:complete shows summary
- Lifecycle: activate(sessionConfig) — creates runner and starts, deactivate() — stops and cleans up
- CSS: dark theme consistent with existing app, progress bar uses accent color, controls at bottom with spacing

## Builder Guidance
- Certainty level: Firm for structure, Medium for animations (keep simple)
- Follow existing view patterns from tuner-view.js and game-view.js (init/activate/deactivate)
- The session view creates a sessionRunner and passes the canvas element to it
- The session runner handles exercise lifecycle — the view just wires UI events and displays state

---
*Source: Phase 3.2 of IMPLEMENTATION_PLAN.md*
