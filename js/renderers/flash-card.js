/**
 * flash-card.js — Flash card renderer for reactive exercises.
 *
 * Displays a large centered note name the player must match. Used for
 * random note reflex drills, interval recognition, and similar exercises
 * where a single target note is shown at a time.
 *
 * Visual behavior:
 *   - Large note letter centered on canvas, octave number smaller beside it
 *   - Background subtly shifts as the player approaches the target pitch
 *   - Green flash animation on successful match
 *   - Reaction timer in bottom-right corner
 *   - Score flash in center-bottom after match
 *   - Progress indicator (e.g., "3/12") in top-left corner
 *
 * Conforms to the RendererInterface defined in renderer-base.js.
 * Receives all data via update(state) — never subscribes to bus events.
 */

import {
  setupCanvas,
  resizeCanvas,
  clearCanvas,
  drawCenteredText,
  drawCountdown,
  COLORS,
  FONTS,
} from './renderer-base.js';

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const MATCH_FLASH_DURATION_MS = 300;
const SCORE_FLASH_DURATION_MS = 500;
const LOCKOUT_DURATION_MS = 200;

// Background tint colors (low alpha overlays)
const BG_TINT_CLOSE = 'rgba(78, 205, 196, 0.04)';
const BG_TINT_IN_TUNE = 'rgba(78, 205, 196, 0.10)';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a flash-card renderer.
 *
 * @returns {import('./renderer-base.js').RendererInterface}
 */
export function createFlashCardRenderer() {
  // --- Canvas state ---
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // --- Runtime state ---
  let active = false;
  let countdownValue = null;

  // --- Current frame data (from update) ---
  let currentTargetNote = null;
  let currentCursor = 0;
  let currentNoteCount = 0;
  let currentElapsed = 0;
  let currentEvaluatorResult = null;

  // --- Timing trackers ---
  let cardStartTime = 0;          // when the current card appeared
  let matchFlashTime = 0;         // when the last match flash started
  let lastScore = null;           // last score value to display
  let scoreFlashTime = 0;         // when the score flash started
  let lockoutUntil = 0;           // prevent double-match until this time

  // --- Previous cursor to detect advances ---
  let prevCursor = -1;

  // --- Resize handler reference ---
  let resizeHandler = null;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse a note string like "C#4" into { name, octave }.
   * Handles sharps (e.g., "F#3"), flats (e.g., "Bb4"), and plain notes ("A4").
   */
  function parseNoteName(noteStr) {
    if (!noteStr || typeof noteStr !== 'string') return { name: '—', octave: '' };

    const match = noteStr.match(/^([A-Ga-g][#b]?)(\d+)?$/);
    if (!match) return { name: noteStr, octave: '' };

    return {
      name: match[1].toUpperCase(),
      octave: match[2] ?? '',
    };
  }

  /**
   * Get the display note string from a targetNote object.
   * targetNote may have .note (string like "C4") or .name + .octave fields.
   */
  function getDisplayNote(targetNote) {
    if (!targetNote) return null;

    // If targetNote has a .note string, use it
    if (targetNote.note && typeof targetNote.note === 'string') {
      return targetNote.note;
    }

    // Fall back to .name + .octave
    if (targetNote.name) {
      const oct = targetNote.octave ?? '';
      return `${targetNote.name}${oct}`;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Drawing routines
  // ---------------------------------------------------------------------------

  function draw() {
    clearCanvas(ctx, width, height);

    const now = performance.now();

    // --- Background tint based on evaluator result ---
    drawBackgroundTint(now);

    // --- Match flash overlay ---
    drawMatchFlash(now);

    // --- Note display ---
    drawNoteCard();

    // --- Reaction timer ---
    drawReactionTimer();

    // --- Score flash ---
    drawScoreFlash(now);

    // --- Progress indicator ---
    drawProgress();

    // --- Countdown overlay (on top of everything) ---
    if (countdownValue !== null) {
      drawCountdown(ctx, countdownValue, width, height);
    }
  }

  /**
   * Draw a subtle background tint based on how close the player is.
   */
  function drawBackgroundTint(now) {
    if (!currentEvaluatorResult) return;

    // Don't show tint during lockout (just matched)
    if (now < lockoutUntil) return;

    const { inTune, close } = currentEvaluatorResult;

    if (inTune) {
      ctx.fillStyle = BG_TINT_IN_TUNE;
      ctx.fillRect(0, 0, width, height);
    } else if (close) {
      ctx.fillStyle = BG_TINT_CLOSE;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /**
   * Draw the match flash overlay that decays over MATCH_FLASH_DURATION_MS.
   */
  function drawMatchFlash(now) {
    if (matchFlashTime === 0) return;

    const elapsed = now - matchFlashTime;
    if (elapsed >= MATCH_FLASH_DURATION_MS) return;

    const progress = elapsed / MATCH_FLASH_DURATION_MS;
    const alpha = 0.3 * (1 - progress);

    ctx.fillStyle = `rgba(78, 205, 196, ${alpha.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Draw the large centered note name card.
   */
  function drawNoteCard() {
    const centerX = width / 2;
    const centerY = height / 2;

    if (!currentTargetNote) {
      // No target — show dash
      drawCenteredText(ctx, '—', centerX, centerY, {
        fontSize: Math.min(width, height) * 0.35,
        color: COLORS.TEXT_DIM,
      });
      return;
    }

    const noteStr = getDisplayNote(currentTargetNote);
    if (!noteStr) {
      drawCenteredText(ctx, '—', centerX, centerY, {
        fontSize: Math.min(width, height) * 0.35,
        color: COLORS.TEXT_DIM,
      });
      return;
    }

    const { name, octave } = parseNoteName(noteStr);

    // Compute font sizes relative to canvas
    const baseFontSize = Math.min(width, height) * 0.35;
    const noteFontSize = baseFontSize;
    const octaveFontSize = baseFontSize * 0.45;

    // Measure the note name to position the octave beside it
    ctx.save();
    ctx.font = `bold ${noteFontSize}px ${FONTS.FAMILY}`;
    const noteMetrics = ctx.measureText(name);
    ctx.restore();

    // Total width of "C" + "4" for centering
    ctx.save();
    ctx.font = `bold ${octaveFontSize}px ${FONTS.FAMILY}`;
    const octaveMetrics = ctx.measureText(octave);
    ctx.restore();

    const totalWidth = noteMetrics.width + (octave ? octaveMetrics.width + 2 : 0);
    const startX = centerX - totalWidth / 2;

    // Draw note letter
    ctx.save();
    ctx.font = `bold ${noteFontSize}px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, startX, centerY);
    ctx.restore();

    // Draw octave number (smaller, aligned to bottom of note letter)
    if (octave) {
      ctx.save();
      ctx.font = `bold ${octaveFontSize}px ${FONTS.FAMILY}`;
      ctx.fillStyle = COLORS.TEXT_MUTED;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      // Offset octave downward slightly so it sits near the baseline of the large text
      const octaveY = centerY + noteFontSize * 0.18;
      ctx.fillText(octave, startX + noteMetrics.width + 2, octaveY);
      ctx.restore();
    }
  }

  /**
   * Draw reaction timer in bottom-right corner.
   */
  function drawReactionTimer() {
    if (!currentTargetNote || cardStartTime === 0) return;

    const now = performance.now();
    const reactionMs = now - cardStartTime;
    const reactionSec = (reactionMs / 1000).toFixed(1);

    const padding = 16;
    const fontSize = Math.max(14, Math.min(width, height) * 0.045);

    ctx.save();
    ctx.font = `${fontSize}px ${FONTS.MONO}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${reactionSec}s`, width - padding, height - padding);
    ctx.restore();
  }

  /**
   * Draw the score flash after a match, fading over SCORE_FLASH_DURATION_MS.
   */
  function drawScoreFlash(now) {
    if (lastScore === null || scoreFlashTime === 0) return;

    const elapsed = now - scoreFlashTime;
    if (elapsed >= SCORE_FLASH_DURATION_MS) return;

    const progress = elapsed / SCORE_FLASH_DURATION_MS;
    const alpha = 1 - progress;

    const fontSize = Math.max(20, Math.min(width, height) * 0.08);
    const centerX = width / 2;
    const bottomY = height * 0.78;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${fontSize}px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.ACCENT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(lastScore), centerX, bottomY);
    ctx.restore();
  }

  /**
   * Draw progress indicator in top-left corner (e.g., "3/12").
   */
  function drawProgress() {
    if (currentNoteCount <= 0) return;

    const padding = 16;
    const fontSize = Math.max(12, Math.min(width, height) * 0.04);

    ctx.save();
    ctx.font = `${fontSize}px ${FONTS.MONO}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${currentCursor}/${currentNoteCount}`, padding, padding);
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

      // Reset all state
      active = false;
      countdownValue = null;
      currentTargetNote = null;
      currentCursor = 0;
      currentNoteCount = 0;
      currentElapsed = 0;
      currentEvaluatorResult = null;
      cardStartTime = 0;
      matchFlashTime = 0;
      lastScore = null;
      scoreFlashTime = 0;
      lockoutUntil = 0;
      prevCursor = -1;

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
      cardStartTime = performance.now();
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

      currentTargetNote = state.targetNote;
      currentNoteCount = state.noteCount;
      currentElapsed = state.elapsed;
      currentEvaluatorResult = state.evaluatorResult;

      // Detect cursor advance (new card appeared)
      if (state.cursor !== prevCursor) {
        // Check for match on the previous card (cursor moved forward)
        if (prevCursor >= 0 && state.cursor > prevCursor) {
          // A match happened — but only trigger flash if not in lockout
          if (now >= lockoutUntil) {
            matchFlashTime = now;
            lockoutUntil = now + LOCKOUT_DURATION_MS;

            // Capture score from evaluator result if available
            if (state.evaluatorResult && typeof state.evaluatorResult.score === 'number') {
              lastScore = Math.round(state.evaluatorResult.score);
              scoreFlashTime = now;
            }
          }
        }

        prevCursor = state.cursor;
        currentCursor = state.cursor;

        // Reset card start time for the new card
        cardStartTime = now;
      } else {
        currentCursor = state.cursor;

        // Also detect advance via evaluatorResult.advance flag
        if (state.evaluatorResult && state.evaluatorResult.advance && now >= lockoutUntil) {
          matchFlashTime = now;
          lockoutUntil = now + LOCKOUT_DURATION_MS;

          if (typeof state.evaluatorResult.score === 'number') {
            lastScore = Math.round(state.evaluatorResult.score);
            scoreFlashTime = now;
          }
        }
      }

      // Draw the frame
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

      currentTargetNote = null;
      currentEvaluatorResult = null;
      lastScore = null;

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
      currentTargetNote = null;
      currentCursor = 0;
      currentElapsed = 0;
      currentEvaluatorResult = null;
      cardStartTime = performance.now();
      matchFlashTime = 0;
      lastScore = null;
      scoreFlashTime = 0;
      lockoutUntil = 0;
      prevCursor = -1;
      countdownValue = null;

      if (ctx) draw();
    },
  };
}
