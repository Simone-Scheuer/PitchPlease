---
id: REQ-033
title: Customizable note hold duration
status: pending
created_at: 2026-03-17T19:00:00Z
user_request: UR-015
related: [REQ-032, REQ-034, REQ-035]
batch: ux-refinements
---

# Customizable Note Hold Duration

## What
The duration you need to hold a note before it advances should be longer by default and customizable by the user.

## Detailed Requirements
- Current default holdMs is 300ms — too short for deliberate practice. Increase default to 600-800ms
- Add a "Hold Duration" setting to the Quick Start section in Practice view
- Options: Quick (300ms), Normal (600ms), Long (1000ms), Very Long (2000ms)
- Save the preference to the profile
- All exercises that use player-driven timing with holdToAdvance should read this preference
- The scale walk exercise (10s hold) should NOT be affected — that has its own separate threshold
- This affects: scale runner, random note reflex, bend trainer

## Builder Guidance
- Add `holdDuration` to profile preferences (default: 600)
- The exercise builders in session-templates.js and exercise-schema.js should read from profile or accept it as a parameter
- The standalone exercise launcher should pass the current hold duration setting
- Quick Start UI: simple select dropdown

---
*Source: "making the note length requirement a bit longer or better yet customizable"*
