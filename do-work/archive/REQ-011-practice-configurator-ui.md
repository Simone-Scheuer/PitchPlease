---
id: REQ-011
title: Practice configurator UI and library split
status: pending
created_at: 2026-03-15T17:10:00Z
user_request: UR-006
related: [REQ-010]
batch: practice-tool
---

# Practice Configurator UI and Library Split

## What
Add a practice configurator UI where users control exercise parameters, and split the library view into two sections: Practice (primary, configurable generator) and Songs (fixed melodies). Practice mode is the main use case.

## Detailed Requirements
- Library view gets two tabs/sections: "Practice" (default/first) and "Songs"
- Practice section shows parameter controls:
  - Scale root dropdown (C through B, including sharps)
  - Scale type dropdown (Major, Minor, Pentatonic, Blues, etc.)
  - Octave range — two dropdowns or a visual range picker (e.g., "C3 to C5")
  - Note duration slider or presets (Short / Medium / Long / Very Long)
  - Pattern selector (Ascending, Descending, Up & Back, Random)
- A "Start" button that generates the exercise via REQ-010 and loads it into the game view
- Parameters persist in localStorage so they're remembered between sessions
- Parameters adjustable between loops without stopping — user changes octave range, next loop iteration uses the new setting
- Speed/tempo control already exists in game view (the tempo button) — no need to duplicate here, but could show a note about it

## Constraints
- Practice section is primary — should be the default tab, shown first
- Songs section keeps the existing song list (Twinkle, Ode to Joy, etc.)
- Uses existing CSS token system for styling
- Touch targets ≥ 44px on all controls
- "customizable training tool not just gamification" — controls should feel like a practice setup panel, not a game settings menu

## Builder Guidance
- Certainty level: Firm on the controls needed, exploratory on exact layout
- Scope cues: practice tool first — UI should feel like a practice setup, not a game config
- Builder has latitude on visual design of the configurator

## Full Context
See [user-requests/UR-006/input.md](./user-requests/UR-006/input.md) for complete verbatim input.

## Verification

**Source**: UR-006/input.md
**Pre-fix coverage**: 100% (6/6 items)
**Post-fix coverage**: 100% (6/6 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Library split into Practice + Songs | Detailed Requirements | Full |
| 2 | Practice is primary/default section | Constraints | Full |
| 3 | All parameter controls in UI | Detailed Requirements | Full |
| 4 | Parameters adjustable between loops | Detailed Requirements | Full |
| 5 | Persist settings in localStorage | Detailed Requirements | Full |
| 6 | Practice tool not gamification emphasis | Constraints, Builder Guidance | Full |

*Verified by verify-request action*

---
*Source: See UR-006/input.md for full verbatim input*
