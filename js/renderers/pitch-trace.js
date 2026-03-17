/**
 * pitch-trace.js — Trace a pre-drawn pitch contour with your pitch.
 *
 * Renders a scrolling canvas with a pre-drawn pitch contour (dashed/dim
 * line) that the player follows with their pitch (solid colored line).
 * The contour scrolls left; the player's pitch is drawn at a fixed
 * playhead position.
 *
 * Contour shapes are generated from config.context.traceShape:
 *   - 'wave'     — sine wave oscillation between two notes
 *   - 'zigzag'   — sharp up-down pattern
 *   - 'mountain' — gradual rise and fall
 *   - 'steps'    — staircase pattern (like a scale but held)
 *
 * Color-coded by proximity: green within 15 cents, yellow 15-30, red >30.
 * This is a "game" exercise — fun, visual, creative.
 *
 * Conforms to the RendererInterface defined in renderer-base.js.
 * Receives all data via update(state) — never subscribes to bus events.
 */

import { NOTE_NAMES } from '../utils/constants.js';
import {
  setupCanvas,
  resizeCanvas,
  clearCanvas,
  drawCountdown,
  COLORS,
  FONTS,
} from './renderer-base.js';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PLAYHEAD_X_RATIO = 0.25;       // playhead at 25% from left
const CONTOUR_DURATION_MS = 30000;    // 30 seconds of contour (scrolling)
const PX_PER_MS = 0.12;              // pixels per millisecond of scroll
const CONTOUR_LINE_WIDTH = 2;
const PLAYER_LINE_WIDTH = 3;
const CONTOUR_DASH = [8, 6];

// Accuracy thresholds (cents)
const GREEN_THRESHOLD = 15;
const YELLOW_THRESHOLD = 30;

// Contour generation
const CONTOUR_SAMPLE_INTERVAL_MS = 50;  // generate a point every 50ms

// Colors
const CONTOUR_COLOR = 'rgba(255, 255, 255, 0.20)';
const CONTOUR_COLOR_BRIGHT = 'rgba(255, 255, 255, 0.35)';
const PLAYER_GREEN = '#4ecdc4';
const PLAYER_YELLOW = '#ffe66d';
const PLAYER_RED = '#ff6b6b';
const SCORE_COLOR = '#4ecdc4';

// ---------------------------------------------------------------------------
// Contour generators
// ---------------------------------------------------------------------------

/**
 * Generate a contour as an array of { time, midi } points.
 *
 * @param {string} shape        - One of: 'wave', 'zigzag', 'mountain', 'steps'
 * @param {number} durationMs   - Total contour duration
 * @param {number} centerMidi   - Center MIDI note
 * @param {number} rangeSemitones - Total range in semitones (peak to peak)
 * @returns {Array<{ time: number, midi: number }>}
 */
function generateContour(shape, durationMs, centerMidi, rangeSemitones = 4) {
  const points = [];
  const halfRange = rangeSemitones / 2;
  const steps = Math.floor(durationMs / CONTOUR_SAMPLE_INTERVAL_MS);

  switch (shape) {
    case 'wave': {
      // Sine wave: ~2 full cycles over the duration
      const cycles = 2;
      for (let i = 0; i <= steps; i++) {
        const t = i * CONTOUR_SAMPLE_INTERVAL_MS;
        const phase = (i / steps) * cycles * Math.PI * 2;
        const midi = centerMidi + Math.sin(phase) * halfRange;
        points.push({ time: t, midi });
      }
      break;
    }

    case 'zigzag': {
      // Sharp triangular zigzag: ~4 peaks
      const peaks = 4;
      const segmentSteps = Math.floor(steps / (peaks * 2));
      let direction = 1;
      let currentMidi = centerMidi - halfRange;

      for (let i = 0; i <= steps; i++) {
        const t = i * CONTOUR_SAMPLE_INTERVAL_MS;
        points.push({ time: t, midi: currentMidi });

        const stepSize = rangeSemitones / segmentSteps;
        currentMidi += direction * stepSize;

        if (currentMidi >= centerMidi + halfRange) {
          currentMidi = centerMidi + halfRange;
          direction = -1;
        } else if (currentMidi <= centerMidi - halfRange) {
          currentMidi = centerMidi - halfRange;
          direction = 1;
        }
      }
      break;
    }

    case 'mountain': {
      // Gradual bell curve rise and fall
      for (let i = 0; i <= steps; i++) {
        const t = i * CONTOUR_SAMPLE_INTERVAL_MS;
        const x = (i / steps) * 2 - 1; // -1 to 1
        // Gaussian-ish curve
        const g = Math.exp(-x * x * 3);
        const midi = centerMidi - halfRange + g * rangeSemitones;
        points.push({ time: t, midi });
      }
      break;
    }

    case 'steps': {
      // Staircase: hold each step for equal time
      const stepCount = Math.max(4, Math.min(8, rangeSemitones + 1));
      const stepsPerHold = Math.floor(steps / stepCount);

      for (let i = 0; i <= steps; i++) {
        const t = i * CONTOUR_SAMPLE_INTERVAL_MS;
        const stepIndex = Math.min(Math.floor(i / stepsPerHold), stepCount - 1);
        // Go up then come back down
        const halfSteps = Math.ceil(stepCount / 2);
        let midi;
        if (stepIndex < halfSteps) {
          midi = centerMidi - halfRange + (stepIndex / (halfSteps - 1)) * rangeSemitones;
        } else {
          const downIndex = stepIndex - halfSteps;
          const downSteps = stepCount - halfSteps;
          midi = centerMidi + halfRange - ((downIndex + 1) / downSteps) * rangeSemitones;
        }
        points.push({ time: t, midi });
      }
      break;
    }

    default: {
      // Default to wave
      const cycles = 2;
      for (let i = 0; i <= steps; i++) {
        const t = i * CONTOUR_SAMPLE_INTERVAL_MS;
        const phase = (i / steps) * cycles * Math.PI * 2;
        const midi = centerMidi + Math.sin(phase) * halfRange;
        points.push({ time: t, midi });
      }
    }
  }

  return points;
}

/**
 * Interpolate the contour value at a given time.
 *
 * @param {Array<{ time: number, midi: number }>} contour
 * @param {number} timeMs
 * @returns {number|null} Interpolated MIDI value, or null if out of range
 */
function interpolateContour(contour, timeMs) {
  if (contour.length === 0) return null;
  if (timeMs <= contour[0].time) return contour[0].midi;
  if (timeMs >= contour[contour.length - 1].time) return contour[contour.length - 1].midi;

  // Binary search for the bracket
  let lo = 0;
  let hi = contour.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (contour[mid].time <= timeMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = contour[lo];
  const b = contour[hi];
  const t = (timeMs - a.time) / (b.time - a.time);
  return a.midi + (b.midi - a.midi) * t;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a pitch trace renderer.
 *
 * @returns {import('./renderer-base.js').RendererInterface}
 */
export function createPitchTraceRenderer() {
  // --- Canvas state ---
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // --- Contour ---
  let contour = [];                 // array of { time, midi }
  let contourDuration = 0;
  let contourMidiLow = 0;
  let contourMidiHigh = 0;

  // --- Player trail ---
  // Array of { time, midi, absCentsFromContour }
  let playerTrail = [];

  // --- Timing ---
  let exerciseStartTime = 0;       // when the exercise started (for scroll)
  let exerciseElapsed = 0;         // ms elapsed

  // --- Score tracking ---
  let totalSamples = 0;
  let greenSamples = 0;
  let yellowSamples = 0;

  // --- Runtime state ---
  let active = false;
  let countdownValue = null;
  let exerciseDescription = '';

  // --- Resize handler ---
  let resizeHandler = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function midiToY(midi) {
    const padTop = 50;
    const padBottom = 50;
    const graphHeight = height - padTop - padBottom;
    const range = contourMidiHigh - contourMidiLow;
    if (range === 0) return height / 2;

    const ratio = (midi - contourMidiLow) / range;
    // Higher pitch = lower Y
    return height - padBottom - ratio * graphHeight;
  }

  function timeToX(timeMs) {
    // The playhead is at a fixed position
    const playheadX = width * PLAYHEAD_X_RATIO;
    // Offset from current exercise time
    const offsetMs = timeMs - exerciseElapsed;
    return playheadX + offsetMs * PX_PER_MS;
  }

  function getProximityColor(absCents) {
    if (absCents <= GREEN_THRESHOLD) return PLAYER_GREEN;
    if (absCents <= YELLOW_THRESHOLD) return PLAYER_YELLOW;
    return PLAYER_RED;
  }

  function computeScorePct() {
    if (totalSamples === 0) return 0;
    // Green = 100%, yellow = 50%, red = 0%
    const score = (greenSamples + yellowSamples * 0.5) / totalSamples;
    return Math.round(score * 100);
  }

  // ---------------------------------------------------------------------------
  // Drawing routines
  // ---------------------------------------------------------------------------

  function draw() {
    clearCanvas(ctx, width, height);

    const playheadX = width * PLAYHEAD_X_RATIO;

    // --- MIDI axis labels ---
    drawMidiAxis();

    // --- Contour line (dashed, dim) ---
    drawContourLine(playheadX);

    // --- Player trail (solid, colored) ---
    drawPlayerTrail(playheadX);

    // --- Playhead line ---
    ctx.strokeStyle = COLORS.ACCENT;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // --- Score display ---
    drawScore();

    // --- Exercise description ---
    drawDescription();

    // --- Countdown overlay ---
    if (countdownValue !== null) {
      drawCountdown(ctx, countdownValue, width, height);
    }
  }

  function drawMidiAxis() {
    const range = contourMidiHigh - contourMidiLow;
    if (range === 0) return;

    // Draw note labels on the left
    const step = range > 6 ? 2 : 1;
    for (let midi = Math.ceil(contourMidiLow); midi <= Math.floor(contourMidiHigh); midi += step) {
      const y = midiToY(midi);
      const noteIdx = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIdx] ?? '';

      // Grid line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Label
      ctx.save();
      ctx.font = `9px ${FONTS.MONO}`;
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${noteName}${octave}`, 26, y);
      ctx.restore();
    }
  }

  function drawContourLine(playheadX) {
    if (contour.length < 2) return;

    ctx.save();
    ctx.strokeStyle = CONTOUR_COLOR_BRIGHT;
    ctx.lineWidth = CONTOUR_LINE_WIDTH;
    ctx.setLineDash(CONTOUR_DASH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    let started = false;

    for (const point of contour) {
      const x = timeToX(point.time);
      // Only draw points visible on screen (with margin)
      if (x < -50 || x > width + 50) continue;

      const y = midiToY(point.midi);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPlayerTrail(playheadX) {
    if (playerTrail.length < 2) return;

    ctx.save();
    ctx.lineWidth = PLAYER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw segments colored by proximity
    for (let i = 1; i < playerTrail.length; i++) {
      const prev = playerTrail[i - 1];
      const curr = playerTrail[i];

      const x1 = timeToX(prev.time);
      const x2 = timeToX(curr.time);

      // Skip off-screen segments
      if (x2 < -50) continue;
      if (x1 > width + 50) break;

      const y1 = midiToY(prev.midi);
      const y2 = midiToY(curr.midi);

      ctx.strokeStyle = getProximityColor(curr.absCentsFromContour);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawScore() {
    const score = computeScorePct();
    const padding = 16;
    const fontSize = Math.max(18, Math.min(width, height) * 0.06);

    ctx.save();
    ctx.font = `bold ${fontSize}px ${FONTS.MONO}`;
    ctx.fillStyle = SCORE_COLOR;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${score}%`, width - padding, padding);

    ctx.font = `10px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.fillText('accuracy', width - padding, padding + fontSize + 2);
    ctx.restore();
  }

  function drawDescription() {
    if (!exerciseDescription) return;

    ctx.save();
    ctx.font = `12px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(exerciseDescription, width / 2, height - 8);
    ctx.restore();
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
  }

  // ---------------------------------------------------------------------------
  // Build contour from config
  // ---------------------------------------------------------------------------

  function buildContour(exerciseConfig) {
    const context = exerciseConfig.context ?? {};
    const shape = context.traceShape ?? 'wave';
    const oRange = context.octaveRange ?? [3, 5];
    const root = context.root ?? 'C';

    // Determine center MIDI from root
    const rootIndex = NOTE_NAMES.indexOf(root);
    const centerOctave = Math.floor((oRange[0] + oRange[1]) / 2);
    const centerMidi = rootIndex >= 0
      ? (centerOctave + 1) * 12 + rootIndex
      : 60; // default C4

    const rangeSemitones = context.traceSemitones ?? 4;
    const duration = context.traceDurationMs ?? CONTOUR_DURATION_MS;

    // Check if contour points are provided directly in config
    if (Array.isArray(context.contourPoints) && context.contourPoints.length > 0) {
      contour = context.contourPoints;
    } else {
      contour = generateContour(shape, duration, centerMidi, rangeSemitones);
    }

    contourDuration = contour.length > 0
      ? contour[contour.length - 1].time
      : duration;

    // Compute MIDI range for Y-axis
    let midiMin = Infinity;
    let midiMax = -Infinity;
    for (const pt of contour) {
      midiMin = Math.min(midiMin, pt.midi);
      midiMax = Math.max(midiMax, pt.midi);
    }

    // Add padding
    const padding = 1.5;
    contourMidiLow = (midiMin === Infinity ? centerMidi - 3 : midiMin) - padding;
    contourMidiHigh = (midiMax === -Infinity ? centerMidi + 3 : midiMax) + padding;
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

      exerciseDescription = exerciseConfig.description ?? '';

      // Build contour from config
      buildContour(exerciseConfig);

      // Reset state
      active = false;
      countdownValue = null;
      playerTrail = [];
      exerciseStartTime = 0;
      exerciseElapsed = 0;
      totalSamples = 0;
      greenSamples = 0;
      yellowSamples = 0;

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
      exerciseStartTime = performance.now();
    },

    /**
     * Called each rAF frame by the exercise runtime.
     *
     * @param {Object} state
     */
    update(state) {
      if (!ctx) return;

      exerciseElapsed = state.elapsed ?? 0;

      // Record player pitch
      if (state.pitchData && typeof state.pitchData.midi === 'number') {
        const playerMidi = state.pitchData.midi + (state.pitchData.cents || 0) / 100;
        const timeMs = exerciseElapsed;

        // Compute distance from contour at this time
        const contourMidi = interpolateContour(contour, timeMs);
        const absCents = contourMidi != null
          ? Math.abs((playerMidi - contourMidi) * 100)
          : 50;

        playerTrail.push({
          time: timeMs,
          midi: playerMidi,
          absCentsFromContour: absCents,
        });

        // Update score tracking
        totalSamples++;
        if (absCents <= GREEN_THRESHOLD) {
          greenSamples++;
        } else if (absCents <= YELLOW_THRESHOLD) {
          yellowSamples++;
        }
      }

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
     * Full cleanup.
     */
    destroy() {
      active = false;
      countdownValue = null;

      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }

      contour = [];
      playerTrail = [];
      exerciseDescription = '';

      canvas = null;
      ctx = null;
    },

    /**
     * Show countdown overlay.
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
      playerTrail = [];
      exerciseStartTime = performance.now();
      exerciseElapsed = 0;
      totalSamples = 0;
      greenSamples = 0;
      yellowSamples = 0;
      countdownValue = null;

      if (ctx) draw();
    },
  };
}
