---
id: UR-006
title: Dynamic practice exercise generator — customizable training tool
created_at: 2026-03-15T17:10:00Z
requests: [REQ-010, REQ-011]
word_count: 165
---

# Dynamic practice exercise generator — customizable training tool

## Summary
Replace hardcoded scale songs with a dynamic exercise generator controlled by user parameters. The app is a practice tool first, not just gamification. Users need control over octave range, note spacing, pattern, and speed. Library view should split into Practice (primary) and Songs (fixed melodies).

## Extracted Requests

| ID | Title | Summary |
|----|-------|---------|
| REQ-010 | Exercise generator module | Dynamically build note arrays from scale+root+range+pattern+duration params |
| REQ-011 | Practice configurator UI | Settings panel for exercise parameters, integrated into library/game flow |

## Batch Constraints
- User emphasis: "customizable training tool not just gamification" — builder has latitude on UI but principle is user control
- Notes must have generous default spacing/gaps — this is practice, not speed challenge
- Parameters adjustable between loops without stopping
- Exercises feed into existing song engine (same note array format)

## Full Verbatim Input

i want options to change the octave range of my levels, primarily the scales- do a bit of thinking about how best to accomplish this also make the notes on the scales not overlap so much it makes them a bit too difficult - make the speed ajustable etc etc - think customizable training tool not just gamification

Replace hardcoded scale songs with a dynamic practice exercise generator. This is a practice tool, not just gamification.

1) Practice configurator UI: scale+root selector, octave range picker (e.g. C3-C5), note duration control (longer=easier), gap between notes so they don't overlap, pattern selector (ascending, descending, up-and-back, random), speed/tempo control

2) Dynamic exercise generation: given the parameters, generate note arrays in the same format the song engine expects. No need for pre-built scale songs anymore.

3) The library view should have two sections: "Practice" (configurable generator) and "Songs" (fixed melodies). Practice is the primary use case.

4) All parameters should be adjustable between loops without stopping - user tweaks octave range, next loop uses it.

5) Notes in exercises should have generous spacing/gaps by default so they don't overlap and feel rushed. This is practice, not a speed challenge.

User emphasis: "customizable training tool not just gamification" — builder has latitude on exact UI but the principle is user control over their practice session.

---
*Captured: 2026-03-15T17:10:00Z*
