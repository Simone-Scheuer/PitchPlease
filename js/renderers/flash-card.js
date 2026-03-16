/**
 * flash-card.js — Flash card renderer for reactive exercises.
 *
 * Displays a large centered note name the player must match. Used for
 * random note reflex drills, interval recognition, and similar exercises
 * where a single target note is shown at a time.
 *
 * Visual behavior:
 *   - Large note letter centered on canvas, octave number smaller beside it
 *   - Proximity glow ring around the target note that grows and changes
 *     color as the player approaches the correct pitch
 *   - Player's current note shown in dim text below the target
 *   - Direction indicator (arrow up/down or checkmark) between target and
 *     player note so vocalists can see which way to slide
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

// ---------------------------------------------------------------------------
// Proximity ring thresholds (in cents)
// ---------------------------------------------------------------------------

const RING_FAR_THRESHOLD = 50;       // beyond this — no ring
const RING_WARM_THRESHOLD = 25;      // 25-50 cents — dim red
const RING_CLOSE_THRESHOLD = 10;     // 10-25 cents — yellow
                                      // <10 cents — bright green, pulsing

// Ring colors
const RING_COLOR_FAR = { r: 255, g: 107, b: 107 };   // red (#ff6b6b)
const RING_COLOR_WARM = { r: 255, g: 230, b: 109 };   // yellow (#ffe66d)
const RING_COLOR_HIT = { r: 78, g: 205, b: 196 };     // green (#4ecdc4)

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
  let currentPitchData = null;
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
    if (!noteStr || typeof noteStr !== 'string') return { name: '\u2014', octave: '' };

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

  /**
   * Compute the signed cents distance from the player's pitch to the target.
   * Positive means player is sharp (above target), negative means flat (below).
   * Returns null if either pitch or target is unavailable.
   */
  function getSignedCentsDistance() {
    if (!currentPitchData || !currentTargetNote) return null;
    if (typeof currentPitchData.midi !== 'number') return null;
    if (typeof currentTargetNote.midi !== 'number') return null;

    // pitchData.midi is the rounded integer MIDI; cents is deviation from that
    const playerCents = currentPitchData.midi * 100 + (currentPitchData.cents || 0);
    const targetCents = currentTargetNote.midi * 100;
    return playerCents - targetCents;
  }

  /**
   * Build the player's current note string (e.g., "C#4") from pitchData.
   */
  function getPlayerNoteStr() {
    if (!currentPitchData) return null;
    const { note, octave } = currentPitchData;
    if (!note) return null;
    return `${note}${octave ?? ''}`;
  }

  // ---------------------------------------------------------------------------
  // Drawing routines
  // ---------------------------------------------------------------------------

  function draw() {
    clearCanvas(ctx, width, height);

    const now = performance.now();

    // --- Match flash overlay ---
    drawMatchFlash(now);

    // --- Proximity glow ring ---
    drawProximityRing(now);

    // --- Note display ---
    drawNoteCard();

    // --- Direction indicator ---
    drawDirectionIndicator();

    // --- Player's current note ---
    drawPlayerNote();

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
   * Draw the proximity glow ring around the target note.
   * Uses concentric circles with radial gradients for a soft aura effect.
   */
  function drawProximityRing(now) {
    if (!currentTargetNote || !currentEvaluatorResult) return;

    // Don't show during lockout (just matched)
    if (now < lockoutUntil) return;

    const signedCents = getSignedCentsDistance();
    if (signedCents === null) return;

    const absCents = Math.abs(signedCents);
    if (absCents > RING_FAR_THRESHOLD) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const baseSize = Math.min(width, height);

    // Determine ring properties based on proximity
    let color;
    let ringRadius;
    let ringAlpha;

    if (absCents <= RING_CLOSE_THRESHOLD) {
      // Very close: bright green, large, pulsing
      color = RING_COLOR_HIT;
      ringRadius = baseSize * 0.32;
      // Pulse: oscillate alpha between 0.25 and 0.45
      const pulse = Math.sin(now * 0.006) * 0.5 + 0.5; // 0-1
      ringAlpha = 0.25 + pulse * 0.20;
    } else if (absCents <= RING_WARM_THRESHOLD) {
      // Close: yellow, medium
      color = RING_COLOR_WARM;
      // Lerp radius from small to medium as cents decrease from 25 to 10
      const t = 1 - (absCents - RING_CLOSE_THRESHOLD) / (RING_WARM_THRESHOLD - RING_CLOSE_THRESHOLD);
      ringRadius = baseSize * (0.20 + t * 0.08);
      ringAlpha = 0.10 + t * 0.12;
    } else {
      // Getting closer: dim red, small
      color = RING_COLOR_FAR;
      // Lerp from nothing to small ring as cents decrease from 50 to 25
      const t = 1 - (absCents - RING_WARM_THRESHOLD) / (RING_FAR_THRESHOLD - RING_WARM_THRESHOLD);
      ringRadius = baseSize * (0.15 + t * 0.05);
      ringAlpha = 0.04 + t * 0.06;
    }

    // Draw concentric glow circles (3 layers for soft glow)
    ctx.save();
    for (let i = 3; i >= 1; i--) {
      const layerRadius = ringRadius * (0.7 + i * 0.15);
      const layerAlpha = ringAlpha * (1 - (i - 1) * 0.3);

      if (layerAlpha <= 0) continue;

      const gradient = ctx.createRadialGradient(
        centerX, centerY, layerRadius * 0.5,
        centerX, centerY, layerRadius,
      );
      gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      gradient.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${(layerAlpha * 0.6).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, layerRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
      drawCenteredText(ctx, '\u2014', centerX, centerY, {
        fontSize: Math.min(width, height) * 0.35,
        color: COLORS.TEXT_DIM,
      });
      return;
    }

    const noteStr = getDisplayNote(currentTargetNote);
    if (!noteStr) {
      drawCenteredText(ctx, '\u2014', centerX, centerY, {
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
   * Draw a direction indicator between the target note and the player's note.
   * Shows an up arrow if the player is flat, a down arrow if sharp,
   * or a checkmark if within 10 cents.
   */
  function drawDirectionIndicator() {
    if (!currentTargetNote || !currentPitchData) return;

    const signedCents = getSignedCentsDistance();
    if (signedCents === null) return;

    const absCents = Math.abs(signedCents);
    const centerX = width / 2;
    const baseFontSize = Math.min(width, height) * 0.35;
    // Position below the target note, above the player note
    const indicatorY = height / 2 + baseFontSize * 0.38;
    const fontSize = Math.max(18, Math.min(width, height) * 0.07);

    let symbol;
    let color;

    if (absCents <= RING_CLOSE_THRESHOLD) {
      // In tune — checkmark
      symbol = '\u2713';
      color = COLORS.IN_TUNE;
    } else if (signedCents < 0) {
      // Player is flat — needs to go up
      symbol = '\u2191';
      color = absCents <= RING_WARM_THRESHOLD ? COLORS.CLOSE : COLORS.OFF;
    } else {
      // Player is sharp — needs to go down
      symbol = '\u2193';
      color = absCents <= RING_WARM_THRESHOLD ? COLORS.CLOSE : COLORS.OFF;
    }

    ctx.save();
    ctx.font = `bold ${fontSize}px ${FONTS.FAMILY}`;
    ctx.fillStyle = color;
    ctx.globalAlpha = absCents <= RING_CLOSE_THRESHOLD ? 0.9 : 0.6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, centerX, indicatorY);
    ctx.restore();
  }

  /**
   * Draw the player's current note in dim text below the target and indicator.
   */
  function drawPlayerNote() {
    if (!currentTargetNote || !currentPitchData) return;

    const playerNoteStr = getPlayerNoteStr();
    if (!playerNoteStr) return;

    const centerX = width / 2;
    const baseFontSize = Math.min(width, height) * 0.35;
    // Position below the direction indicator
    const playerNoteY = height / 2 + baseFontSize * 0.58;
    const fontSize = Math.max(16, Math.min(width, height) * 0.065);

    // Determine color based on proximity
    const signedCents = getSignedCentsDistance();
    let color = COLORS.TEXT_DIM;
    if (signedCents !== null) {
      const absCents = Math.abs(signedCents);
      if (absCents <= RING_CLOSE_THRESHOLD) {
        color = COLORS.IN_TUNE;
      } else if (absCents <= RING_WARM_THRESHOLD) {
        color = COLORS.CLOSE;
      } else if (absCents <= RING_FAR_THRESHOLD) {
        color = COLORS.OFF;
      }
    }

    ctx.save();
    ctx.font = `${fontSize}px ${FONTS.MONO}`;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(playerNoteStr, centerX, playerNoteY);
    ctx.restore();
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
      currentPitchData = null;
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
      currentPitchData = state.pitchData;
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
      currentPitchData = null;
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
      currentPitchData = null;
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
