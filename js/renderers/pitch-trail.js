/**
 * pitch-trail.js — Scrolling real-time pitch visualization for free play.
 *
 * No targets, no scoring — just a beautiful continuous trail of the
 * player's pitch scrolling left-to-right with a playhead at 75%.
 *
 * Features:
 *   - Continuous colored line/dots showing detected pitch over time
 *   - Auto-ranging Y-axis that tracks the player's pitch range
 *   - Note grid lines with labels on both edges
 *   - Current note + cents deviation displayed top-center
 *   - Color coding by pitch stability (green/yellow/red)
 *   - Silence gaps break the trail
 *
 * Conforms to the RendererInterface defined in renderer-base.js.
 */

import { NOTE_NAMES } from '../utils/constants.js';
import { frequencyToMidi } from '../audio/note-math.js';
import {
  setupCanvas,
  resizeCanvas,
  clearCanvas,
  drawNoteLabel,
  drawCountdown,
  midiToY,
  COLORS,
  FONTS,
} from './renderer-base.js';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const LABEL_WIDTH = 48;
const PLAYHEAD_PCT = 0.75;       // playhead at 75% from left
const DOT_SIZE = 3;
const TRAIL_MAX_POINTS = 2000;
const SCROLL_SPEED = 0.08;       // pixels per ms
const MIN_MIDI_RANGE = 12;       // minimum visible range (1 octave)
const MIDI_PADDING = 2;          // semitones above/below detected range
const RANGE_HISTORY_MS = 5000;   // look back 5s for auto-range
const RANGE_SMOOTH = 0.04;       // smoothing factor for range transitions

// Stability thresholds (cents deviation from neighbors)
const STABILITY_GOOD = 5;
const STABILITY_FAIR = 15;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a pitch-trail renderer for free play mode.
 *
 * @returns {import('./renderer-base.js').RendererInterface}
 */
export function createPitchTrailRenderer() {
  // --- Canvas state ---
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // --- Trail data ---
  let trail = [];           // { midi, time, clarity } or { midi: null, time } for gaps
  let startTime = 0;
  let elapsed = 0;

  // --- Auto-ranging state ---
  let midiCenter = 60;      // smoothly tracks player's center
  let midiRange = MIN_MIDI_RANGE; // total visible range in semitones
  let targetCenter = 60;
  let targetRange = MIN_MIDI_RANGE;
  let midiLow = 54;
  let midiHigh = 66;

  // --- Current pitch for display ---
  let lastMidi = null;
  let lastCents = 0;
  let lastFrequency = 0;

  // --- Runtime ---
  let active = false;
  let countdownValue = null;
  let resizeHandler = null;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function graphLeft() {
    return LABEL_WIDTH;
  }

  function graphRight() {
    return width - LABEL_WIDTH;
  }

  function graphWidth() {
    return graphRight() - graphLeft();
  }

  function playheadX() {
    return graphLeft() + graphWidth() * PLAYHEAD_PCT;
  }

  /**
   * Map MIDI to Y using renderer-base utility.
   */
  function toY(midi) {
    return midiToY(midi, midiLow, midiHigh, height);
  }

  /**
   * Map a trail point's time to an X position relative to the playhead.
   */
  function timeToX(pointTime) {
    const age = elapsed - pointTime;
    return playheadX() - age * SCROLL_SPEED;
  }

  // ---------------------------------------------------------------------------
  // Auto-ranging
  // ---------------------------------------------------------------------------

  /**
   * Compute target center and range from recent trail data.
   */
  function updateAutoRange() {
    // Find min/max MIDI in the last RANGE_HISTORY_MS
    const cutoff = elapsed - RANGE_HISTORY_MS;
    let lo = Infinity;
    let hi = -Infinity;
    let hasData = false;

    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      if (p.time < cutoff) break;
      if (p.midi === null) continue;
      if (p.midi < lo) lo = p.midi;
      if (p.midi > hi) hi = p.midi;
      hasData = true;
    }

    if (!hasData) return;

    // Pad the detected range
    lo -= MIDI_PADDING;
    hi += MIDI_PADDING;

    // Ensure minimum range
    const detectedRange = hi - lo;
    if (detectedRange < MIN_MIDI_RANGE) {
      const center = (lo + hi) / 2;
      lo = center - MIN_MIDI_RANGE / 2;
      hi = center + MIN_MIDI_RANGE / 2;
    }

    targetCenter = (lo + hi) / 2;
    targetRange = hi - lo;
  }

  /**
   * Smoothly interpolate current range toward target.
   */
  function smoothRange() {
    midiCenter += (targetCenter - midiCenter) * RANGE_SMOOTH;
    midiRange += (targetRange - midiRange) * RANGE_SMOOTH;

    midiLow = midiCenter - midiRange / 2;
    midiHigh = midiCenter + midiRange / 2;
  }

  // ---------------------------------------------------------------------------
  // Trail management
  // ---------------------------------------------------------------------------

  function pushTrailPoint(midi, time, clarity) {
    trail.push({ midi, time, clarity: clarity ?? 0 });
    if (trail.length > TRAIL_MAX_POINTS) {
      trail.shift();
    }
  }

  function pushSilenceGap(time) {
    // Only push if the last point wasn't already a gap
    if (trail.length > 0 && trail[trail.length - 1].midi === null) return;
    trail.push({ midi: null, time });
  }

  // ---------------------------------------------------------------------------
  // Stability color
  // ---------------------------------------------------------------------------

  /**
   * Compute stability of a trail point by comparing to its neighbors.
   * Returns a CSS color string.
   */
  function stabilityColor(index) {
    const p = trail[index];
    if (p.midi === null) return COLORS.TEXT_DIM;

    // Compare to neighbors within ±2 points
    let totalDeviation = 0;
    let count = 0;

    for (let d = -2; d <= 2; d++) {
      if (d === 0) continue;
      const ni = index + d;
      if (ni < 0 || ni >= trail.length) continue;
      const neighbor = trail[ni];
      if (neighbor.midi === null) continue;
      totalDeviation += Math.abs((p.midi - neighbor.midi) * 100); // convert semitones to cents
      count++;
    }

    if (count === 0) return COLORS.IN_TUNE;

    const avgDeviation = totalDeviation / count;

    if (avgDeviation <= STABILITY_GOOD) return COLORS.IN_TUNE;    // green
    if (avgDeviation <= STABILITY_FAIR) return COLORS.CLOSE;       // yellow
    return COLORS.OFF;                                              // red
  }

  /**
   * Return an alpha-adjusted version for connecting lines.
   */
  function stabilityLineColor(index) {
    const p = trail[index];
    if (p.midi === null) return 'transparent';

    let totalDeviation = 0;
    let count = 0;

    for (let d = -2; d <= 2; d++) {
      if (d === 0) continue;
      const ni = index + d;
      if (ni < 0 || ni >= trail.length) continue;
      const neighbor = trail[ni];
      if (neighbor.midi === null) continue;
      totalDeviation += Math.abs((p.midi - neighbor.midi) * 100);
      count++;
    }

    if (count === 0) return 'rgba(78, 205, 196, 0.35)';

    const avgDeviation = totalDeviation / count;

    if (avgDeviation <= STABILITY_GOOD) return 'rgba(78, 205, 196, 0.4)';
    if (avgDeviation <= STABILITY_FAIR) return 'rgba(255, 230, 109, 0.35)';
    return 'rgba(255, 107, 107, 0.3)';
  }

  // ---------------------------------------------------------------------------
  // Drawing routines
  // ---------------------------------------------------------------------------

  function draw() {
    clearCanvas(ctx, width, height);

    const gL = graphLeft();
    const gR = graphRight();

    // Clip to graph area for trail
    ctx.save();
    ctx.beginPath();
    ctx.rect(gL, 0, gR - gL, height);
    ctx.clip();

    drawGrid(gL, gR);
    drawTrail(gL, gR);
    drawPlayheadLine();

    ctx.restore();

    // Labels on both sides (outside clip)
    drawLabels(0, LABEL_WIDTH, 'right');
    drawLabels(gR, width, 'left');

    // Separator lines
    ctx.strokeStyle = COLORS.BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gL, 0);
    ctx.lineTo(gL, height);
    ctx.moveTo(gR, 0);
    ctx.lineTo(gR, height);
    ctx.stroke();

    // Current note label (top-center)
    drawCurrentNote();

    // Countdown overlay
    if (countdownValue !== null) {
      drawCountdown(ctx, countdownValue, width, height);
    }
  }

  function drawGrid(left, right) {
    const lo = Math.floor(midiLow);
    const hi = Math.ceil(midiHigh);

    for (let midi = lo; midi <= hi; midi++) {
      const y = toY(midi);
      if (y < -5 || y > height + 5) continue;

      const noteIndex = ((midi % 12) + 12) % 12;
      const isC = noteIndex === 0;

      ctx.strokeStyle = isC ? COLORS.GRID_BOLD : COLORS.GRID;
      ctx.lineWidth = isC ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
  }

  function drawPlayheadLine() {
    const phX = playheadX();
    ctx.strokeStyle = 'rgba(78, 205, 196, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(phX, 0);
    ctx.lineTo(phX, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTrail(gL, gR) {
    let prevX = null;
    let prevY = null;

    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];

      if (p.midi === null) {
        prevX = null;
        prevY = null;
        continue;
      }

      const x = timeToX(p.time);

      // Skip if off-screen
      if (x < gL - 10 || x > gR + 10) {
        prevX = null;
        prevY = null;
        continue;
      }

      const y = toY(p.midi);

      if (y < -10 || y > height + 10) {
        prevX = null;
        prevY = null;
        continue;
      }

      // Connecting line
      if (prevX !== null && Math.abs(x - prevX) < 40) {
        ctx.strokeStyle = stabilityLineColor(i);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Dot
      ctx.fillStyle = stabilityColor(i);
      ctx.beginPath();
      ctx.arc(x, y, DOT_SIZE, 0, Math.PI * 2);
      ctx.fill();

      prevX = x;
      prevY = y;
    }
  }

  function drawLabels(areaLeft, areaRight, align) {
    const padding = 8;
    const lo = Math.floor(midiLow);
    const hi = Math.ceil(midiHigh);

    // Background fill
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(areaLeft, 0, areaRight - areaLeft, height);

    ctx.textBaseline = 'middle';

    for (let midi = lo; midi <= hi; midi++) {
      const y = toY(midi);
      if (y < -5 || y > height + 5) continue;

      const noteIdx = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIdx];
      const isC = noteIdx === 0;
      const isNatural = !noteName.includes('#');

      if (!isNatural) continue;

      const label = isC ? `${noteName}${octave}` : noteName;
      const x = align === 'right' ? areaRight - padding : areaLeft + padding;

      drawNoteLabel(ctx, label, '', x, y, {
        fontSize: 11,
        color: isC ? COLORS.TEXT_MUTED : COLORS.TEXT_DIM,
        align,
        baseline: 'middle',
      });
    }
  }

  /**
   * Draw the currently detected note name + cents deviation at top-center.
   */
  function drawCurrentNote() {
    if (lastMidi === null) return;

    const roundedMidi = Math.round(lastMidi);
    const noteIdx = ((roundedMidi % 12) + 12) % 12;
    const octave = Math.floor(roundedMidi / 12) - 1;
    const noteName = NOTE_NAMES[noteIdx];
    const label = `${noteName}${octave}`;

    const cents = Math.round(lastCents);
    const centsStr = cents >= 0 ? `+${cents}c` : `${cents}c`;

    const centerX = graphLeft() + graphWidth() / 2;
    const topY = 18;

    // Note name — large
    ctx.font = `bold 22px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.ACCENT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, centerX, topY);

    // Cents deviation — smaller, below
    const absCents = Math.abs(cents);
    let centsColor = COLORS.IN_TUNE;
    if (absCents > 15) centsColor = COLORS.OFF;
    else if (absCents > 5) centsColor = COLORS.CLOSE;

    ctx.font = `14px ${FONTS.MONO}`;
    ctx.fillStyle = centsColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(centsStr, centerX, topY + 26);
  }

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  function handleResize() {
    if (!canvas || !ctx) return;
    const dims = resizeCanvas(canvas, ctx);
    width = dims.width;
    height = dims.height;
    dpr = dims.dpr;
    draw();
  }

  // ---------------------------------------------------------------------------
  // Renderer interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Set up the canvas and prepare for rendering.
     *
     * @param {HTMLCanvasElement} canvasElement
     * @param {Object} exerciseConfig
     */
    init(canvasElement, exerciseConfig) {
      const setup = setupCanvas(canvasElement);
      canvas = setup.canvas;
      ctx = setup.ctx;
      width = setup.width;
      height = setup.height;
      dpr = setup.dpr;

      // Reset state
      trail = [];
      startTime = 0;
      elapsed = 0;
      midiCenter = 60;
      midiRange = MIN_MIDI_RANGE;
      targetCenter = 60;
      targetRange = MIN_MIDI_RANGE;
      midiLow = 54;
      midiHigh = 66;
      lastMidi = null;
      lastCents = 0;
      lastFrequency = 0;
      active = false;
      countdownValue = null;

      // Listen for resize
      resizeHandler = () => handleResize();
      window.addEventListener('resize', resizeHandler);

      // Draw initial frame
      draw();
    },

    /**
     * Called when the exercise begins running (after countdown).
     *
     * @param {Object} config
     */
    start(config) {
      active = true;
      countdownValue = null;
      startTime = performance.now();
    },

    /**
     * Called each rAF frame by the exercise runtime.
     *
     * @param {Object} state
     * @param {Object|null} state.pitchData
     * @param {number} state.elapsed
     * @param {string} state.exerciseState
     */
    update(state) {
      if (!ctx) return;

      elapsed = state.elapsed;

      if (state.pitchData && state.pitchData.frequency > 0) {
        const pd = state.pitchData;
        const exactMidi = typeof pd.midi === 'number'
          ? pd.midi
          : frequencyToMidi(pd.frequency);

        pushTrailPoint(exactMidi, elapsed, pd.clarity ?? 0);

        // Update current note display
        lastMidi = exactMidi;
        lastCents = pd.cents ?? ((exactMidi - Math.round(exactMidi)) * 100);
        lastFrequency = pd.frequency;
      } else {
        // Silence
        pushSilenceGap(elapsed);
        lastMidi = null;
        lastCents = 0;
      }

      // Auto-range
      updateAutoRange();
      smoothRange();

      // Draw
      draw();
    },

    /**
     * Halt rendering.
     */
    stop() {
      active = false;
      countdownValue = null;
    },

    /**
     * Full cleanup — remove event listeners, release canvas context.
     */
    destroy() {
      active = false;
      countdownValue = null;

      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }

      trail = [];
      lastMidi = null;

      canvas = null;
      ctx = null;
    },

    /**
     * Show countdown overlay.
     *
     * @param {number} secondsLeft
     */
    onCountdown(secondsLeft) {
      countdownValue = secondsLeft;
      if (ctx) draw();
    },

    /**
     * Reset renderer state for next loop iteration.
     */
    onLoopRestart() {
      trail = [];
      elapsed = 0;
      lastMidi = null;
      lastCents = 0;
      countdownValue = null;

      // Reset range to default
      midiCenter = 60;
      midiRange = MIN_MIDI_RANGE;
      targetCenter = 60;
      targetRange = MIN_MIDI_RANGE;
      midiLow = 54;
      midiHigh = 66;

      if (ctx) draw();
    },
  };
}
