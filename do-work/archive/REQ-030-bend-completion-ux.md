---
id: REQ-030
title: Bend exercise completion — hold-based, not timer
status: pending
created_at: 2026-03-17T18:00:00Z
user_request: UR-013
related: [REQ-026, REQ-027, REQ-028, REQ-029]
batch: interactive-playback
---

# Bend Exercise Completion UX

## What
Bend exercises should complete each target when the player holds in the ideal region for a sustained period, not on a timer. Currently unclear when a bend target ends. Make the completion condition explicit and visual.

## Detailed Requirements
- Bend exercise advances to the next target when player holds within ±10 cents for a threshold duration (e.g., 2-3 seconds)
- Show a visual fill/progress indicator on the bend meter as they hold in the zone
- When the progress fills completely, advance to the next bend target with a brief "success" flash
- Add a skip button for bends the player can't hit yet
- The overall exercise runs until all bend targets are completed (or skipped), NOT on a fixed timer
- Player-driven timing — no failure, just hold and it advances

## Builder Guidance
- The bend-accuracy evaluator already tracks `locked` state and `holdMs`
- Need to connect the evaluator's hold tracking to note advancement (like scroll-targets does with holdMs)
- The bend-meter renderer should show the fill progress (similar to scroll-targets' holdProgress)
- Exercise timing mode should be 'player-driven' with holdMs threshold
- This is fundamentally the same pattern as scroll-targets fill progress, just for the bend meter

---
*Source: "no real clear explanation for when like a bending based minigame ends though - is it on a timer? could just be holding in the ideal region"*
