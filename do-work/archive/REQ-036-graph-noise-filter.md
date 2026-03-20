---
id: REQ-036
title: Filter single-sample noise spikes from pitch graph
status: pending
created_at: 2026-03-17T19:15:00Z
user_request: UR-016
---

# Filter Single-Sample Noise From Pitch Graph

## What
The pitch graph shows isolated single-dot points that are likely feedback or interference, not real notes. These should be filtered out — if a pitch detection lasts only 1 frame, it's almost certainly noise.

## Detailed Requirements
- In the pitch graph component, filter out isolated pitch readings that don't persist for at least 2-3 consecutive frames
- A "real" note should have at least ~50-80ms of consecutive similar pitch readings before it gets drawn
- Implementation: buffer the last 2-3 readings. Only commit a point to the graph when the pitch has been stable (within ~100 cents of the same note) for the minimum duration
- This filtering should happen at the graph rendering level, NOT in the detector — other consumers (exercises, tuner) may want the raw data
- Single-frame spikes that are far from the current pitch (>200 cents jump) are almost always noise

## Builder Guidance
- Read `js/components/pitch-graph.js` — find where pitch data points are added to the graph buffer
- Add a small smoothing/debounce buffer: hold 2-3 frames, only draw if they're consistent
- Don't filter in `js/audio/detector.js` — that would affect all consumers
- The tuner view benefits from raw responsiveness; the graph benefits from smoothness
- This is a visual quality improvement, not a detection algorithm change

---
*Source: "the pitch graph could filter for like 1 dot interference - if the note is that small its probably just feedback or interferance"*
