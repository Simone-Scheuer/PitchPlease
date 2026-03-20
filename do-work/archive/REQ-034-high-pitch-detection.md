---
id: REQ-034
title: Fix pitch detection above C6
status: pending
created_at: 2026-03-17T19:00:00Z
user_request: UR-015
related: [REQ-032, REQ-033, REQ-035]
batch: ux-refinements
---

# Fix Pitch Detection Above C6

## What
Pitch detection fails or becomes unreliable above approximately C6 (~1047 Hz). This limits the usable range for high instruments and high harmonica holes.

## Detailed Requirements
- Investigate the pitchy library configuration — it may need a higher sample rate or different FFT settings
- The AnalyserNode's `fftSize` affects frequency resolution. Current FFT_SIZE may be too large for high frequencies (too much time-domain data, not enough frequency resolution)
- Possible fixes:
  1. Reduce FFT_SIZE from 2048 to 1024 — better time resolution for high frequencies but worse for low
  2. Use pitchy's `minVolumeDecibels` or `clarityThreshold` to be more permissive at high frequencies
  3. The pitch detection algorithm may need a minimum correlation threshold adjustment
- C6 = MIDI 84 = 1046.5 Hz. Holes 7-10 on a C harp go up to C7 (2093 Hz)
- Test with whistle and high harmonica notes after fixing

## Builder Guidance
- Read `js/utils/constants.js` for FFT_SIZE
- Read `js/audio/detector.js` for pitchy configuration and clarity threshold
- Read `js/audio/mic.js` for AnalyserNode setup
- The pitchy library's `PitchDetector.forFloat32Array()` accepts a buffer — the buffer size = FFT_SIZE
- A smaller FFT means fewer samples per analysis window, which means higher frequencies are detected faster but lower frequencies lose accuracy
- Consider: using two detectors (low + high range) or dynamically adjusting, but simplest fix is probably lowering the clarity threshold for high pitches

---
*Source: "we cant seem to detect pitches above like c6"*
