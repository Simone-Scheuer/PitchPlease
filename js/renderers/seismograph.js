/**
 * seismograph.js — Scrolling trace renderer for sustained exercises.
 *
 * Renders a horizontal seismograph-style trace showing real-time pitch
 * deviation from the target note. The center line represents 0 cents
 * deviation; the trace oscillates above/below based on actual cents off.
 *
 * Auto-detect mode: when no specific target note is configured, the
 * renderer locks onto the first clear pitch the player produces, then
 * re-locks if the player clearly changes notes (>200 cents for >500ms).
 *
 * Designed for: long tones, drone match, centering exercises.
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
// Layout & behavior constants
// ---------------------------------------------------------------------------

const BUFFER_SIZE = 600;         // ~10 seconds at 60fps
const CENTS_RANGE = 50;          // ±50 cents Y-axis range
const PLAYHEAD_MARGIN = 60;      // px from right edge where playhead sits
const GRID_CENTS = [10, 25];     // grid lines drawn at ±these values
const STREAK_THRESHOLD = 15;     // cents — within this = "steady" (includes yellow zone)
const TRACE_LINE_WIDTH = 2;
const GRID_LINE_WIDTH = 0.5;
const CENTER_LINE_WIDTH = 1;

// Auto-detect constants
const INITIAL_LOCK_MS = 200;         // ms of stable pitch before first lock
const RELOCK_CENTS_THRESHOLD = 200;  // cents away to consider a note change
const RELOCK_TIME_MS = 500;          // ms the player must stay away to re-lock

// Colors for trace segments (matching spec exactly)
const TRACE_GREEN = '#4ecdc4';
const TRACE_YELLOW = '#ffe66d';
const TRACE_RED = '#ff6b6b';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a seismograph renderer for sustained pitch exercises.
 *
 * @returns {import('./renderer-base.js').RendererInterface}
 */
export function createSeismographRenderer() {
  // --- Canvas state ---
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // --- Exercise data ---
  let targetNote = null;          // { midi, note, octave }
  let hasExplicitTarget = false;  // true if exercise config provided a target
  let exerciseDescription = '';   // instruction text from exercise config
  let noteCount = 0;              // total notes in exercise (for progress)
  let currentCursor = 0;          // current note index (for progress)
  let prevTargetMidi = null;      // for detecting note changes

  // --- Auto-detect state ---
  let autoDetected = false;       // true if target was auto-detected from player
  let initialLockStartTime = 0;   // when we first saw the candidate for initial lock
  let initialLockCandidateMidi = null;  // candidate MIDI for initial lock
  let relockStartTime = 0;        // when the player started drifting away
  let relockTracking = false;     // true while monitoring for re-lock
  let relockCandidateMidi = 0;    // the MIDI note the player may be switching to

  // --- Runtime state ---
  let active = false;
  let countdownValue = null;

  // --- Deviation buffer (circular array) ---
  // Each entry: { cents: number, timestamp: number } or null (silence gap)
  let buffer = [];
  let bufferIndex = 0;     // write position in circular buffer
  let bufferCount = 0;     // total entries written (for indexing)

  // --- Steady streak tracking ---
  let streakStartTime = 0;  // timestamp when current streak began
  let streakActive = false;  // is the current streak ongoing?
  let streakDuration = 0;    // current streak in seconds (for display)

  // --- Resize handler ---
  let resizeHandler = null;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a target note object from a rounded MIDI number.
   */
  function midiToTarget(midiInt) {
    const noteIdx = ((midiInt % 12) + 12) % 12;
    const octave = Math.floor(midiInt / 12) - 1;
    return {
      midi: midiInt,
      note: NOTE_NAMES[noteIdx],
      octave,
    };
  }

  /**
   * Compute cents deviation from pitch data and target note.
   *
   * pitchData.midi is an integer (nearest semitone), pitchData.cents is the
   * sub-semitone offset in cents.  target.midi is also an integer.
   *
   * Returns null if either is missing.
   */
  function computeCents(pitchData, target) {
    if (!pitchData || !target || typeof pitchData.midi !== 'number') return null;
    return (pitchData.midi - target.midi) * 100 + (pitchData.cents || 0);
  }

  /**
   * Auto-detect or re-lock the target note from incoming pitch data.
   * Called on every pitch event when we are in auto-detect mode.
   */
  function autoDetectTarget(pitchData, now) {
    if (!pitchData || typeof pitchData.midi !== 'number') return;

    const snappedMidi = pitchData.midi;  // already integer from detector

    // --- First detection: require stable pitch before locking ---
    if (!targetNote) {
      if (initialLockCandidateMidi === null || snappedMidi !== initialLockCandidateMidi) {
        // New candidate — start tracking
        initialLockCandidateMidi = snappedMidi;
        initialLockStartTime = now;
      } else if (now - initialLockStartTime >= INITIAL_LOCK_MS) {
        // Candidate held long enough — lock
        targetNote = midiToTarget(snappedMidi);
        autoDetected = true;
        relockTracking = false;
        initialLockCandidateMidi = null;
      }
      return;
    }

    // --- Re-lock detection ---
    const currentCentsOff = Math.abs(
      (pitchData.midi - targetNote.midi) * 100 + (pitchData.cents || 0)
    );

    if (currentCentsOff > RELOCK_CENTS_THRESHOLD) {
      // Player is far from current target
      if (!relockTracking) {
        // Start tracking a potential re-lock
        relockTracking = true;
        relockStartTime = now;
        relockCandidateMidi = snappedMidi;
      } else if (snappedMidi !== relockCandidateMidi) {
        // Player changed again — restart tracking with new candidate
        relockStartTime = now;
        relockCandidateMidi = snappedMidi;
      } else if (now - relockStartTime >= RELOCK_TIME_MS) {
        // Player has been on the new note long enough — re-lock
        targetNote = midiToTarget(snappedMidi);
        autoDetected = true;
        relockTracking = false;

        // Clear the buffer so the trace starts fresh for the new note
        buffer = [];
        bufferIndex = 0;
        bufferCount = 0;
        streakActive = false;
        streakDuration = 0;
        streakStartTime = 0;
      }
    } else {
      // Player is close to current target — cancel any re-lock tracking
      relockTracking = false;
    }
  }

  /**
   * Get the color for a given cents deviation.
   */
  function centsToTraceColor(absCents) {
    if (absCents <= 5) return TRACE_GREEN;      // in tune: +/-5 cents
    if (absCents <= STREAK_THRESHOLD) return TRACE_YELLOW;  // close: +/-15 cents
    return TRACE_RED;
  }

  /**
   * Map a cents deviation to a Y position on the canvas.
   * 0 cents = center, +50 = top area, -50 = bottom area.
   */
  function centsToY(cents) {
    const graphTop = 50;        // top margin for labels
    const graphBottom = height - 40; // bottom margin (extra room for instructions)
    const graphHeight = graphBottom - graphTop;
    const centerY = graphTop + graphHeight / 2;

    // Clamp to range
    const clamped = Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, cents));
    // Invert: positive cents = sharp = above center = lower Y value
    return centerY - (clamped / CENTS_RANGE) * (graphHeight / 2);
  }

  /**
   * Get the X position of the playhead (right edge minus margin).
   */
  function playheadX() {
    return width - PLAYHEAD_MARGIN;
  }

  /**
   * Push a deviation reading into the circular buffer.
   */
  function pushReading(entry) {
    if (buffer.length < BUFFER_SIZE) {
      buffer.push(entry);
    } else {
      buffer[bufferIndex % BUFFER_SIZE] = entry;
    }
    bufferIndex++;
    bufferCount = Math.min(bufferCount + 1, BUFFER_SIZE);
  }

  /**
   * Get the buffer entries in chronological order (oldest first).
   * Returns an array of entries.
   */
  function getOrderedBuffer() {
    if (buffer.length < BUFFER_SIZE) {
      return buffer;
    }
    // Circular: oldest is at bufferIndex % BUFFER_SIZE
    const start = bufferIndex % BUFFER_SIZE;
    return [...buffer.slice(start), ...buffer.slice(0, start)];
  }

  /**
   * Update the steady streak counter.
   */
  function updateStreak(cents, now) {
    if (cents === null || Math.abs(cents) > STREAK_THRESHOLD) {
      // Break streak
      streakActive = false;
      streakDuration = 0;
      return;
    }

    if (!streakActive) {
      // Start new streak
      streakActive = true;
      streakStartTime = now;
    }

    streakDuration = (now - streakStartTime) / 1000;
  }

  // ---------------------------------------------------------------------------
  // Drawing routines
  // ---------------------------------------------------------------------------

  function draw() {
    clearCanvas(ctx, width, height);

    const graphTop = 50;
    const graphBottom = height - 40;
    const graphHeight = graphBottom - graphTop;
    const centerY = graphTop + graphHeight / 2;
    const phX = playheadX();

    // --- Grid lines ---
    drawGrid(centerY, graphTop, graphBottom, graphHeight);

    // --- Trace ---
    drawTrace(phX);

    // --- Playhead line ---
    ctx.strokeStyle = COLORS.ACCENT;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(phX, graphTop);
    ctx.lineTo(phX, graphBottom);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // --- Target note label (top-left) ---
    drawTargetLabel();

    // --- Steady streak counter (top-right) ---
    drawStreakCounter();

    // --- Exercise instructions (bottom) ---
    drawInstructions();

    // --- Countdown overlay ---
    if (countdownValue !== null) {
      drawCountdown(ctx, countdownValue, width, height);
    }
  }

  function drawGrid(centerY, graphTop, graphBottom, graphHeight) {
    // Center line (emphasized)
    ctx.strokeStyle = COLORS.TEXT_DIM;
    ctx.lineWidth = CENTER_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // "0" label at center
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.font = `9px ${FONTS.MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', 6, centerY);

    // Grid lines at ±10 and ±25 cents
    ctx.lineWidth = GRID_LINE_WIDTH;

    for (const cents of GRID_CENTS) {
      for (const sign of [1, -1]) {
        const y = centsToY(cents * sign);
        const label = `${sign > 0 ? '+' : ''}${cents * sign}`;

        ctx.strokeStyle = COLORS.GRID_BOLD;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cents label
        ctx.fillStyle = COLORS.TEXT_DIM;
        ctx.font = `9px ${FONTS.MONO}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 6, y);
      }
    }
  }

  function drawTrace(phX) {
    const entries = getOrderedBuffer();
    if (entries.length < 2) return;

    // The newest entry maps to the playhead X.
    // Each entry is 1 "slot" wide. Spread entries across
    // the available width from left edge to playhead.
    const totalEntries = entries.length;
    const traceWidth = phX - 10; // 10px left margin
    const slotWidth = traceWidth / BUFFER_SIZE;

    // X of the newest entry = phX
    // X of entry i = phX - (totalEntries - 1 - i) * slotWidth

    // Draw segments between consecutive non-null entries
    ctx.lineWidth = TRACE_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let prevX = null;
    let prevY = null;

    for (let i = 0; i < totalEntries; i++) {
      const entry = entries[i];

      if (entry === null) {
        // Gap in trace
        prevX = null;
        prevY = null;
        continue;
      }

      const x = phX - (totalEntries - 1 - i) * slotWidth;
      const y = centsToY(entry.cents);

      if (prevX !== null) {
        // Draw segment colored by the endpoint's deviation
        const absCents = Math.abs(entry.cents);
        ctx.strokeStyle = centsToTraceColor(absCents);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      prevX = x;
      prevY = y;
    }
  }

  function drawTargetLabel() {
    if (!targetNote) {
      // No target yet — show waiting message
      ctx.save();
      ctx.font = `bold 20px ${FONTS.FAMILY}`;
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Listening...', 12, 10);
      ctx.restore();
      return;
    }

    const noteIdx = ((targetNote.midi % 12) + 12) % 12;
    const octave = Math.floor(targetNote.midi / 12) - 1;
    const noteName = targetNote.note ?? NOTE_NAMES[noteIdx];
    const label = autoDetected
      ? `Tracking: ${noteName}${octave}`
      : `${noteName}${octave}`;

    ctx.save();
    ctx.font = `bold ${autoDetected ? 20 : 28}px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, 12, 10);

    // Show progress indicator when exercise has multiple notes (e.g. scale walk)
    if (hasExplicitTarget && noteCount > 1) {
      ctx.font = `13px ${FONTS.FAMILY}`;
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.fillText(`${currentCursor + 1} / ${noteCount}`, 12, autoDetected ? 34 : 42);
    }

    ctx.restore();
  }

  function drawStreakCounter() {
    if (streakDuration < 0.1) return;

    const label = `${streakDuration.toFixed(1)}s`;

    ctx.save();
    ctx.font = `bold 20px ${FONTS.MONO}`;
    ctx.fillStyle = TRACE_GREEN;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(label, width - 12, 10);

    // Small "steady" label below
    ctx.font = `10px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.fillText('steady', width - 12, 34);
    ctx.restore();
  }

  function drawInstructions() {
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
    draw();
  }

  // ---------------------------------------------------------------------------
  // State reset helper
  // ---------------------------------------------------------------------------

  function resetState() {
    buffer = [];
    bufferIndex = 0;
    bufferCount = 0;
    streakActive = false;
    streakDuration = 0;
    streakStartTime = 0;
    countdownValue = null;
    active = false;
    autoDetected = false;
    relockTracking = false;
    relockStartTime = 0;
    relockCandidateMidi = 0;
    prevTargetMidi = null;
    noteCount = 0;
    currentCursor = 0;
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

      // Extract target note from exercise config
      const notes = exerciseConfig.context?.notes ?? [];
      if (notes.length > 0) {
        targetNote = notes[0];
        hasExplicitTarget = true;
        noteCount = notes.length;
        prevTargetMidi = notes[0].midi;
      } else {
        targetNote = null;
        hasExplicitTarget = false;
        noteCount = 0;
      }

      // Extract exercise description for instructions overlay
      const desc = exerciseConfig.description ?? '';
      if (desc) {
        exerciseDescription = desc;
      } else if (!hasExplicitTarget) {
        exerciseDescription = 'Hold any note steady';
      } else {
        exerciseDescription = '';
      }

      // Reset state
      resetState();

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

      // Re-read target if config provided and has explicit notes
      if (config) {
        const notes = config.context?.notes ?? [];
        if (notes.length > 0) {
          targetNote = notes[0];
          hasExplicitTarget = true;
        }
      }
    },

    /**
     * Called each rAF frame by the exercise runtime.
     *
     * @param {Object} state
     * @param {Object|null} state.pitchData
     * @param {Object|null} state.targetNote
     * @param {number} state.cursor
     * @param {number} state.noteCount
     * @param {number} state.elapsed
     * @param {Object|null} state.evaluatorResult
     * @param {string} state.exerciseState
     * @param {number} state.iteration
     */
    update(state) {
      if (!ctx) return;

      const now = performance.now();

      // Track progress
      if (state.noteCount != null) noteCount = state.noteCount;
      if (state.cursor != null) currentCursor = state.cursor;

      // --- Target note management ---
      if (hasExplicitTarget) {
        // Use the runtime-provided target if the exercise has explicit notes
        if (state.targetNote) {
          const newMidi = state.targetNote.midi;
          // Detect note change — reset trace for fresh start on new target
          if (prevTargetMidi != null && newMidi !== prevTargetMidi) {
            buffer = [];
            bufferIndex = 0;
            bufferCount = 0;
            streakActive = false;
            streakDuration = 0;
            streakStartTime = 0;
          }
          prevTargetMidi = newMidi;
          targetNote = state.targetNote;
        }
      } else {
        // Auto-detect mode: lock onto what the player is playing
        if (state.pitchData) {
          autoDetectTarget(state.pitchData, now);
        }
      }

      // Compute cents deviation
      const cents = computeCents(state.pitchData, targetNote);

      if (cents !== null) {
        // Push deviation reading
        pushReading({ cents, timestamp: now });
        updateStreak(cents, now);
      } else if (state.pitchData === null || state.pitchData === undefined) {
        // Silence — push null for gap, but avoid consecutive nulls
        const lastEntry = buffer.length > 0
          ? buffer[(bufferIndex - 1 + BUFFER_SIZE) % BUFFER_SIZE]
          : null;
        if (buffer.length === 0 || lastEntry !== null) {
          pushReading(null);
        }
        updateStreak(null, now);
      }

      // Redraw
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

      buffer = [];
      bufferIndex = 0;
      bufferCount = 0;
      targetNote = null;
      hasExplicitTarget = false;
      autoDetected = false;
      exerciseDescription = '';
      prevTargetMidi = null;
      noteCount = 0;
      currentCursor = 0;

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
      buffer = [];
      bufferIndex = 0;
      bufferCount = 0;
      streakActive = false;
      streakDuration = 0;
      streakStartTime = 0;
      countdownValue = null;
      currentCursor = 0;
      prevTargetMidi = null;

      // In auto-detect mode, reset the target so it re-locks
      if (!hasExplicitTarget) {
        targetNote = null;
        autoDetected = false;
        relockTracking = false;
      }

      if (ctx) draw();
    },
  };
}
