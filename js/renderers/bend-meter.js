/**
 * bend-meter.js — Vertical pitch display renderer for bend exercises.
 *
 * Renders a vertical pitch axis focused on a narrow range (about 3-4
 * semitones) centered on the current target. The target zone is
 * highlighted as a horizontal band, and the player's pitch is shown
 * as a large circle/ball that moves vertically.
 *
 * Designed for: harmonica bend trainer, microtonal pitch exercises.
 * Feels like a "gravity well" — the target zone pulls your attention.
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
  drawCenteredText,
  COLORS,
  FONTS,
} from './renderer-base.js';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const SEMITONE_RANGE = 4;            // show ±2 semitones from target (4 total)
const TARGET_ZONE_CENTS = 10;        // ±10 cents target band
const CLOSE_ZONE_CENTS = 25;         // ±25 cents close zone
const BALL_RADIUS_FACTOR = 0.04;     // fraction of min(width, height)
const MIN_BALL_RADIUS = 12;
const MAX_BALL_RADIUS = 28;

// Margins
const TOP_MARGIN = 60;
const BOTTOM_MARGIN = 60;
const LEFT_MARGIN = 50;
const RIGHT_MARGIN = 50;

// Colors
const TARGET_ZONE_COLOR = 'rgba(78, 205, 196, 0.15)';
const TARGET_ZONE_BORDER = 'rgba(78, 205, 196, 0.5)';
const TARGET_ZONE_GLOW = 'rgba(78, 205, 196, 0.25)';
const CLOSE_ZONE_COLOR = 'rgba(255, 230, 109, 0.06)';
const BALL_GREEN = '#4ecdc4';
const BALL_YELLOW = '#ffe66d';
const BALL_RED = '#ff6b6b';
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
const SEMITONE_LINE_COLOR = 'rgba(255, 255, 255, 0.12)';

// Locked pulse animation
const PULSE_SPEED = 0.004;
const PULSE_MIN_ALPHA = 0.15;
const PULSE_MAX_ALPHA = 0.35;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a bend meter renderer for bend exercises.
 *
 * @returns {import('./renderer-base.js').RendererInterface}
 */
export function createBendMeterRenderer() {
  // --- Canvas state ---
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // --- Exercise data ---
  let targetNotes = [];          // all target notes from exercise config
  let exerciseDescription = '';

  // --- Runtime state ---
  let active = false;
  let countdownValue = null;

  // --- Current frame data ---
  let currentTarget = null;      // { midi, note, label }
  let currentPitchData = null;
  let currentEvaluatorResult = null;
  let currentCursor = 0;
  let currentNoteCount = 0;

  // --- Hold progress tracking (visual fill for active target) ---
  let holdProgress = 0;           // 0..1 fill ratio
  let holdStartTimestamp = 0;     // performance.now() when in-tune streak began
  let holdInTune = false;         // was the last frame in-tune?
  let holdGraceStart = 0;         // timestamp when grace period began (out-of-tune)
  let holdAccumulatedMs = 0;      // accumulated in-tune ms (survives short gaps)
  let holdTargetMs = 2000;        // holdMs from exercise config
  const HOLD_GRACE_MS = 200;      // grace period before resetting progress
  let holdFlashUntil = 0;         // timestamp until which to show bright flash

  // --- Resize handler ---
  let resizeHandler = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Map a fractional MIDI value to a Y position on the canvas.
   * The range is centered on the target note, spanning SEMITONE_RANGE semitones.
   */
  function midiToY(midi) {
    if (!currentTarget) return height / 2;

    const targetMidi = currentTarget.midi;
    const halfRange = SEMITONE_RANGE / 2;
    const graphTop = TOP_MARGIN;
    const graphBottom = height - BOTTOM_MARGIN;
    const graphHeight = graphBottom - graphTop;

    // Clamp to range
    const offset = midi - targetMidi;
    const clamped = Math.max(-halfRange, Math.min(halfRange, offset));

    // Higher pitch = higher on screen = lower Y
    const ratio = (clamped + halfRange) / SEMITONE_RANGE;
    return graphBottom - ratio * graphHeight;
  }

  /**
   * Get the ball color based on cents deviation.
   */
  function getBallColor(absCents) {
    if (absCents <= TARGET_ZONE_CENTS) return BALL_GREEN;
    if (absCents <= CLOSE_ZONE_CENTS) return BALL_YELLOW;
    return BALL_RED;
  }

  /**
   * Format a MIDI number to a note name (handles fractional MIDI).
   */
  function midiToNoteName(midi) {
    const rounded = Math.round(midi);
    const noteIdx = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    const noteName = NOTE_NAMES[noteIdx];

    // If fractional, indicate the bend
    const fraction = midi - rounded;
    if (Math.abs(fraction) > 0.05) {
      const bendCents = Math.round(fraction * 100);
      const sign = bendCents > 0 ? '+' : '';
      return `${noteName}${octave} ${sign}${bendCents}c`;
    }
    return `${noteName}${octave}`;
  }

  // ---------------------------------------------------------------------------
  // Hold progress tracking
  // ---------------------------------------------------------------------------

  /**
   * Update the visual hold progress based on the current evaluator result.
   * Called every frame from update().
   */
  function updateHoldProgress(evaluatorResult) {
    const now = performance.now();

    if (evaluatorResult && evaluatorResult.inTune) {
      // Player is in tune
      if (!holdInTune) {
        // Transition from out-of-tune to in-tune
        if (holdGraceStart > 0 && (now - holdGraceStart) < HOLD_GRACE_MS) {
          // Within grace period — resume from where we left off
          holdGraceStart = 0;
        } else {
          // Grace expired or fresh start
          if (holdGraceStart > 0) {
            // Grace expired, reset
            holdAccumulatedMs = 0;
            holdGraceStart = 0;
          }
        }
        holdStartTimestamp = now;
        holdInTune = true;
      }

      // Accumulate in-tune time
      const streakMs = now - holdStartTimestamp;
      const totalMs = holdAccumulatedMs + streakMs;
      holdProgress = Math.min(1, totalMs / holdTargetMs);

      // Check for advance (target fully filled)
      if (evaluatorResult.advance) {
        holdProgress = 1;
        holdFlashUntil = now + 150; // bright flash for 150ms
      }
    } else {
      // Player is out of tune or silent
      if (holdInTune) {
        // Just went out of tune — bank accumulated time and start grace
        holdAccumulatedMs += (now - holdStartTimestamp);
        holdInTune = false;
        holdGraceStart = now;
      }

      // During grace period, freeze progress (don't reset)
      if (holdGraceStart > 0) {
        if ((now - holdGraceStart) >= HOLD_GRACE_MS) {
          // Grace period expired — reset
          holdAccumulatedMs = 0;
          holdProgress = 0;
          holdGraceStart = 0;
        }
        // else: keep holdProgress frozen at its current value
      }
    }
  }

  /**
   * Reset hold progress (when cursor advances to next note).
   */
  function resetHoldProgress() {
    holdProgress = 0;
    holdStartTimestamp = 0;
    holdInTune = false;
    holdGraceStart = 0;
    holdAccumulatedMs = 0;
    holdFlashUntil = 0;
  }

  // ---------------------------------------------------------------------------
  // Drawing routines
  // ---------------------------------------------------------------------------

  function draw() {
    clearCanvas(ctx, width, height);

    if (!currentTarget) {
      drawWaiting();
      drawCountdownOverlay();
      return;
    }

    const graphTop = TOP_MARGIN;
    const graphBottom = height - BOTTOM_MARGIN;
    const graphHeight = graphBottom - graphTop;
    const graphLeft = LEFT_MARGIN;
    const graphRight = width - RIGHT_MARGIN;
    const graphWidth = graphRight - graphLeft;
    const centerX = graphLeft + graphWidth / 2;

    // --- Semitone grid lines ---
    drawSemitoneGrid(graphTop, graphBottom, graphLeft, graphRight);

    // --- Close zone ---
    drawCloseZone(centerX, graphLeft, graphRight);

    // --- Target zone band ---
    drawTargetZone(centerX, graphLeft, graphRight);

    // --- Hold progress fill inside target zone ---
    drawHoldProgressFill(graphLeft, graphRight);

    // --- Player pitch ball ---
    drawPlayerBall(centerX);

    // --- Target note label ---
    drawTargetLabel();

    // --- Cents deviation display ---
    drawCentsDisplay();

    // --- Locked indicator ---
    drawLockedIndicator();

    // --- Progress ---
    drawProgress();

    // --- Exercise description ---
    drawDescription();

    // --- Countdown overlay ---
    drawCountdownOverlay();
  }

  function drawWaiting() {
    drawCenteredText(ctx, 'Get ready...', width / 2, height / 2, {
      fontSize: Math.min(width, height) * 0.08,
      color: COLORS.TEXT_DIM,
    });
  }

  function drawSemitoneGrid(graphTop, graphBottom, graphLeft, graphRight) {
    if (!currentTarget) return;

    const targetMidi = currentTarget.midi;
    const halfRange = SEMITONE_RANGE / 2;

    // Draw lines for each semitone in range
    for (let offset = -Math.floor(halfRange); offset <= Math.ceil(halfRange); offset++) {
      const midi = Math.round(targetMidi) + offset;
      const y = midiToY(midi);

      if (y < graphTop || y > graphBottom) continue;

      // Draw line
      ctx.strokeStyle = offset === 0 ? SEMITONE_LINE_COLOR : GRID_COLOR;
      ctx.lineWidth = offset === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(graphLeft, y);
      ctx.lineTo(graphRight, y);
      ctx.stroke();

      // Draw note name on left
      const noteIdx = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIdx];

      ctx.save();
      ctx.font = `10px ${FONTS.MONO}`;
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${noteName}${octave}`, graphLeft - 6, y);
      ctx.restore();
    }
  }

  function drawCloseZone(centerX, graphLeft, graphRight) {
    if (!currentTarget) return;

    const closeCents = CLOSE_ZONE_CENTS / 100; // Convert to semitones
    const topY = midiToY(currentTarget.midi + closeCents);
    const bottomY = midiToY(currentTarget.midi - closeCents);

    ctx.fillStyle = CLOSE_ZONE_COLOR;
    ctx.fillRect(graphLeft, topY, graphRight - graphLeft, bottomY - topY);
  }

  function drawTargetZone(centerX, graphLeft, graphRight) {
    if (!currentTarget) return;

    const zoneCents = TARGET_ZONE_CENTS / 100; // Convert to semitones
    const topY = midiToY(currentTarget.midi + zoneCents);
    const bottomY = midiToY(currentTarget.midi - zoneCents);
    const zoneHeight = bottomY - topY;

    // Check if locked for pulse effect
    const isLocked = currentEvaluatorResult?.locked ?? false;

    if (isLocked) {
      // Pulsing glow when locked
      const now = performance.now();
      const pulse = Math.sin(now * PULSE_SPEED) * 0.5 + 0.5;
      const alpha = PULSE_MIN_ALPHA + pulse * (PULSE_MAX_ALPHA - PULSE_MIN_ALPHA);

      // Wider glow band
      const glowExtend = 8;
      ctx.fillStyle = `rgba(78, 205, 196, ${alpha.toFixed(3)})`;
      ctx.fillRect(graphLeft, topY - glowExtend, graphRight - graphLeft, zoneHeight + glowExtend * 2);
    }

    // Target zone fill
    ctx.fillStyle = TARGET_ZONE_COLOR;
    ctx.fillRect(graphLeft, topY, graphRight - graphLeft, zoneHeight);

    // Target zone border lines
    ctx.strokeStyle = TARGET_ZONE_BORDER;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(graphLeft, topY);
    ctx.lineTo(graphRight, topY);
    ctx.moveTo(graphLeft, bottomY);
    ctx.lineTo(graphRight, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center line (exact target)
    const centerY = midiToY(currentTarget.midi);
    ctx.strokeStyle = COLORS.ACCENT;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(graphLeft, centerY);
    ctx.lineTo(graphRight, centerY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawHoldProgressFill(graphLeft, graphRight) {
    if (!currentTarget || holdProgress <= 0) return;

    const now = performance.now();
    const zoneCents = TARGET_ZONE_CENTS / 100; // Convert to semitones
    const topY = midiToY(currentTarget.midi + zoneCents);
    const bottomY = midiToY(currentTarget.midi - zoneCents);
    const zoneHeight = bottomY - topY;
    const zoneWidth = graphRight - graphLeft;

    // Fill width proportional to holdProgress
    const fillW = zoneWidth * holdProgress;

    // Color: brighter during flash, otherwise accent at 0.3 opacity
    if (holdFlashUntil > now) {
      ctx.fillStyle = 'rgba(78, 205, 196, 0.55)';
    } else {
      ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
    }

    ctx.fillRect(graphLeft, topY, fillW, zoneHeight);

    // Draw a thin leading edge line at the fill boundary
    if (holdProgress > 0 && holdProgress < 1) {
      ctx.strokeStyle = 'rgba(78, 205, 196, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(graphLeft + fillW, topY);
      ctx.lineTo(graphLeft + fillW, bottomY);
      ctx.stroke();
    }
  }

  function drawPlayerBall(centerX) {
    if (!currentPitchData || typeof currentPitchData.midi !== 'number') return;

    // Compute player's fractional MIDI
    const playerMidi = currentPitchData.midi + (currentPitchData.cents || 0) / 100;
    const y = midiToY(playerMidi);

    // Compute ball radius and color
    const baseRadius = Math.min(width, height) * BALL_RADIUS_FACTOR;
    const ballRadius = Math.max(MIN_BALL_RADIUS, Math.min(MAX_BALL_RADIUS, baseRadius));

    const absCents = currentEvaluatorResult?.absCents ?? 50;
    const color = getBallColor(absCents);
    const isLocked = currentEvaluatorResult?.locked ?? false;

    // Draw shadow/glow
    ctx.save();
    if (isLocked) {
      // Bright glow when locked
      ctx.shadowColor = BALL_GREEN;
      ctx.shadowBlur = 20;
    } else {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }

    // Draw ball
    ctx.beginPath();
    ctx.arc(centerX, y, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Draw ball outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, y, ballRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawTargetLabel() {
    if (!currentTarget) return;

    // Target name in top-left
    const label = currentTarget.label
      ?? currentTarget.note
      ?? midiToNoteName(currentTarget.midi);

    ctx.save();
    ctx.font = `bold 24px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, 12, 10);
    ctx.restore();

    // Show fractional MIDI as a sub-label if it's a bend
    const fraction = currentTarget.midi - Math.round(currentTarget.midi);
    if (Math.abs(fraction) > 0.05) {
      const bendDesc = midiToNoteName(currentTarget.midi);
      ctx.save();
      ctx.font = `12px ${FONTS.MONO}`;
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(bendDesc, 12, 38);
      ctx.restore();
    }
  }

  function drawCentsDisplay() {
    if (!currentEvaluatorResult) return;

    const absCents = currentEvaluatorResult.absCents ?? 0;
    const color = getBallColor(absCents);

    // Show cents deviation in top-right
    const sign = currentPitchData && currentTarget
      ? (function () {
          const playerMidi = currentPitchData.midi + (currentPitchData.cents || 0) / 100;
          const diff = playerMidi - currentTarget.midi;
          return diff >= 0 ? '+' : '';
        })()
      : '';

    const signedCents = currentPitchData && currentTarget
      ? Math.round((currentPitchData.midi + (currentPitchData.cents || 0) / 100 - currentTarget.midi) * 100)
      : 0;

    ctx.save();
    ctx.font = `bold 20px ${FONTS.MONO}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${sign}${signedCents}c`, width - 12, 10);
    ctx.restore();
  }

  function drawLockedIndicator() {
    if (!currentEvaluatorResult?.locked) return;

    const now = performance.now();
    const pulse = Math.sin(now * 0.005) * 0.5 + 0.5;
    const alpha = 0.7 + pulse * 0.3;

    ctx.save();
    ctx.font = `bold 18px ${FONTS.FAMILY}`;
    ctx.fillStyle = BALL_GREEN;
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Locked!', width / 2, 10);
    ctx.restore();
  }

  function drawProgress() {
    if (currentNoteCount <= 0) return;

    const padding = 16;
    const fontSize = Math.max(12, Math.min(width, height) * 0.04);

    ctx.save();
    ctx.font = `${fontSize}px ${FONTS.MONO}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${currentCursor + 1}/${currentNoteCount}`, padding, height - padding);
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

  function drawCountdownOverlay() {
    if (countdownValue !== null) {
      drawCountdown(ctx, countdownValue, width, height);
    }
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

      // Extract target notes from config
      targetNotes = exerciseConfig.context?.notes ?? [];
      exerciseDescription = exerciseConfig.description ?? '';
      holdTargetMs = exerciseConfig.timing?.holdMs ?? 2000;

      // Reset state
      active = false;
      countdownValue = null;
      currentTarget = null;
      currentPitchData = null;
      currentEvaluatorResult = null;
      currentCursor = 0;
      currentNoteCount = 0;
      resetHoldProgress();

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

      // Re-read notes if config provided
      if (config) {
        targetNotes = config.context?.notes ?? targetNotes;
        holdTargetMs = config.timing?.holdMs ?? holdTargetMs;
      }
    },

    /**
     * Called each rAF frame by the exercise runtime.
     *
     * @param {Object} state
     */
    update(state) {
      if (!ctx) return;

      // Detect cursor advancement and reset hold progress
      const prevCursor = currentCursor;

      currentTarget = state.targetNote;
      currentPitchData = state.pitchData;
      currentEvaluatorResult = state.evaluatorResult;
      currentCursor = state.cursor;
      currentNoteCount = state.noteCount;

      if (currentCursor !== prevCursor) {
        resetHoldProgress();
      }

      // Update hold progress for the active target
      updateHoldProgress(state.evaluatorResult);

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

      targetNotes = [];
      currentTarget = null;
      currentPitchData = null;
      currentEvaluatorResult = null;
      exerciseDescription = '';
      resetHoldProgress();

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
      currentTarget = null;
      currentPitchData = null;
      currentEvaluatorResult = null;
      currentCursor = 0;
      countdownValue = null;
      resetHoldProgress();

      if (ctx) draw();
    },
  };
}
