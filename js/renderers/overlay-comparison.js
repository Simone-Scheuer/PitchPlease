/**
 * overlay-comparison.js — Renderer for echo/phrase-reproduction exercises.
 *
 * Three-phase display controlled by the phrase-match evaluator's state:
 *
 *   Listen phase:  "Listen..." text with horizontal note bars appearing
 *                  left to right as the synth plays the phrase.
 *
 *   Attempt phase: "Your turn..." text with the player's pitch drawn as
 *                  a continuous trail in real time. NO target bars visible
 *                  (ear-first philosophy).
 *
 *   Review phase:  Target bars shown as translucent overlays with the
 *                  player's actual pitch trail overlaid as a solid line.
 *                  Green where close, red where divergent.
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
  midiToY,
  COLORS,
  COLORS_ALPHA,
  FONTS,
} from './renderer-base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING_TOP = 60;
const PADDING_BOTTOM = 30;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 20;

const TRAIL_DOT_RADIUS = 2.5;
const TRAIL_LINE_WIDTH = 2;
const TARGET_BAR_HEIGHT = 18;
const TARGET_BAR_RADIUS = 4;

// Phase label styling
const PHASE_LABEL_FONT_FACTOR = 0.08;   // fraction of min(w,h)
const PHASE_LABEL_Y_OFFSET = 30;

// Review colors
const REVIEW_TARGET_ALPHA = 0.3;
const REVIEW_MATCH_COLOR = COLORS.IN_TUNE;
const REVIEW_MISS_COLOR = COLORS.OFF;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an overlay-comparison renderer for echo exercises.
 *
 * @returns {import('./renderer-base.js').RendererInterface}
 */
export function createOverlayComparisonRenderer() {
  // --- Canvas state ---
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;

  // --- Exercise config ---
  let exerciseConfig = null;

  // --- Runtime state ---
  let active = false;
  let countdownValue = null;

  // --- Data from last update ---
  let lastState = null;
  let lastPhase = 'idle';

  // --- MIDI range for Y mapping ---
  let midiLow = 48;    // C3
  let midiHigh = 84;   // C6

  // --- Resize handler ---
  let resizeHandler = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function drawArea() {
    return {
      x: PADDING_LEFT,
      y: PADDING_TOP,
      w: width - PADDING_LEFT - PADDING_RIGHT,
      h: height - PADDING_TOP - PADDING_BOTTOM,
    };
  }

  /**
   * Compute MIDI range from the phrase notes with some padding.
   */
  function computeMidiRange(phrase) {
    if (!phrase || phrase.length === 0) return;

    let lo = Infinity;
    let hi = -Infinity;
    for (const note of phrase) {
      if (note.midi < lo) lo = note.midi;
      if (note.midi > hi) hi = note.midi;
    }

    // Add padding of 4 semitones each direction
    midiLow = Math.max(24, lo - 4);
    midiHigh = Math.min(108, hi + 4);

    // Ensure minimum range of 12 semitones for readability
    if (midiHigh - midiLow < 12) {
      const mid = (midiLow + midiHigh) / 2;
      midiLow = Math.max(24, mid - 6);
      midiHigh = Math.min(108, mid + 6);
    }
  }

  /**
   * Map a MIDI value to a Y coordinate in the draw area.
   */
  function noteToY(midi) {
    const area = drawArea();
    return midiToY(midi, midiLow, midiHigh, area.h, 0) + area.y;
  }

  /**
   * Map a time offset to an X coordinate within the draw area.
   * @param {number} timeMs - Time offset within the phrase
   * @param {number} totalMs - Total duration of the phrase/attempt
   */
  function timeToX(timeMs, totalMs) {
    const area = drawArea();
    if (totalMs <= 0) return area.x;
    const ratio = Math.min(1, timeMs / totalMs);
    return area.x + ratio * area.w;
  }

  /**
   * Compute total phrase duration in ms including gaps.
   */
  function phraseTotalMs(phrase) {
    if (!phrase || phrase.length === 0) return 1000;
    let total = 0;
    for (const n of phrase) {
      total += n.durationMs + (n.gapMs ?? 50);
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // Drawing: Phase label
  // ---------------------------------------------------------------------------

  function drawPhaseLabel(text, subtext) {
    const fontSize = Math.max(18, Math.min(width, height) * PHASE_LABEL_FONT_FACTOR);
    const subtextSize = fontSize * 0.55;

    ctx.save();
    ctx.font = `bold ${fontSize}px ${FONTS.FAMILY}`;
    ctx.fillStyle = COLORS.ACCENT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, PHASE_LABEL_Y_OFFSET);

    if (subtext) {
      ctx.font = `${subtextSize}px ${FONTS.FAMILY}`;
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.fillText(subtext, width / 2, PHASE_LABEL_Y_OFFSET + fontSize * 0.7);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Drawing: Grid lines (pitch reference)
  // ---------------------------------------------------------------------------

  function drawGrid() {
    const area = drawArea();

    ctx.save();
    ctx.strokeStyle = COLORS.GRID_BOLD;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);

    // Draw grid lines for each semitone in range (every 2 semitones)
    for (let midi = Math.ceil(midiLow); midi <= Math.floor(midiHigh); midi++) {
      if (midi % 2 !== 0) continue;
      const y = noteToY(midi);
      if (y < area.y || y > area.y + area.h) continue;

      ctx.beginPath();
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Drawing: Note labels on the Y axis
  // ---------------------------------------------------------------------------

  function drawNoteLabels() {
    const area = drawArea();
    const fontSize = Math.max(9, Math.min(width, height) * 0.028);
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    ctx.save();
    ctx.font = `${fontSize}px ${FONTS.MONO}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let midi = Math.ceil(midiLow); midi <= Math.floor(midiHigh); midi++) {
      // Only label C notes and notes in the phrase
      const noteIdx = midi % 12;
      if (noteIdx !== 0 && midi % 3 !== 0) continue;

      const y = noteToY(midi);
      if (y < area.y || y > area.y + area.h) continue;

      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIdx];
      ctx.fillText(`${noteName}${octave}`, area.x - 6, y);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Drawing: Target note bars
  // ---------------------------------------------------------------------------

  function drawTargetBars(phrase, alpha) {
    if (!phrase || phrase.length === 0) return;

    const totalMs = phraseTotalMs(phrase);
    const barH = TARGET_BAR_HEIGHT;

    ctx.save();
    ctx.globalAlpha = alpha;

    let timeOffset = 0;
    for (const note of phrase) {
      const x1 = timeToX(timeOffset, totalMs);
      const x2 = timeToX(timeOffset + note.durationMs, totalMs);
      const y = noteToY(note.midi) - barH / 2;
      const w = Math.max(4, x2 - x1);

      // Rounded rectangle
      ctx.fillStyle = COLORS.ACCENT;
      ctx.beginPath();
      roundRect(ctx, x1, y, w, barH, TARGET_BAR_RADIUS);
      ctx.fill();

      // Border
      ctx.strokeStyle = COLORS_ALPHA.BAR_BORDER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundRect(ctx, x1, y, w, barH, TARGET_BAR_RADIUS);
      ctx.stroke();

      timeOffset += note.durationMs + (note.gapMs ?? 50);
    }

    ctx.restore();
  }

  /**
   * Draw target bars progressively during listen phase.
   * Only shows bars up to the current time in the phrase playback.
   */
  function drawTargetBarsProgressive(phrase, elapsedMs) {
    if (!phrase || phrase.length === 0) return;

    const totalMs = phraseTotalMs(phrase);
    const barH = TARGET_BAR_HEIGHT;

    ctx.save();

    let timeOffset = 0;
    for (const note of phrase) {
      // Only draw if the note has started appearing
      if (timeOffset > elapsedMs) break;

      const x1 = timeToX(timeOffset, totalMs);
      const noteEnd = timeOffset + note.durationMs;
      const visibleEnd = Math.min(noteEnd, elapsedMs);
      const x2 = timeToX(visibleEnd, totalMs);
      const y = noteToY(note.midi) - barH / 2;
      const w = Math.max(2, x2 - x1);

      // Use full opacity during listen — the player should see what's playing
      ctx.fillStyle = COLORS.ACCENT;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      roundRect(ctx, x1, y, w, barH, TARGET_BAR_RADIUS);
      ctx.fill();

      ctx.strokeStyle = COLORS_ALPHA.BAR_BORDER;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      roundRect(ctx, x1, y, w, barH, TARGET_BAR_RADIUS);
      ctx.stroke();

      timeOffset += note.durationMs + (note.gapMs ?? 50);
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Drawing: Pitch trail
  // ---------------------------------------------------------------------------

  function drawPitchTrail(trail, totalMs, startTime, color, lineWidth) {
    if (!trail || trail.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    let started = false;

    for (const point of trail) {
      const timeMs = point.timestamp - startTime;
      const x = timeToX(timeMs, totalMs);
      const y = noteToY(point.midi);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw dots at each point for clarity
    ctx.fillStyle = color;
    for (const point of trail) {
      const timeMs = point.timestamp - startTime;
      const x = timeToX(timeMs, totalMs);
      const y = noteToY(point.midi);

      ctx.beginPath();
      ctx.arc(x, y, TRAIL_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draw the pitch trail during review phase, color-coded by accuracy.
   * Green segments where the player was close to the target, red where off.
   */
  function drawReviewTrail(trail, phrase, totalMs, startTime) {
    if (!trail || trail.length < 2 || !phrase || phrase.length === 0) return;

    // Build a lookup of target MIDI at each time offset
    const timeMap = [];
    let timeOffset = 0;
    for (const note of phrase) {
      timeMap.push({
        startMs: timeOffset,
        endMs: timeOffset + note.durationMs,
        midi: note.midi,
      });
      timeOffset += note.durationMs + (note.gapMs ?? 50);
    }

    function getTargetMidiAt(timeMs) {
      for (const entry of timeMap) {
        if (timeMs >= entry.startMs && timeMs <= entry.endMs) {
          return entry.midi;
        }
      }
      return null;
    }

    ctx.save();
    ctx.lineWidth = TRAIL_LINE_WIDTH + 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Draw trail segments with color based on distance from target
    for (let i = 1; i < trail.length; i++) {
      const prev = trail[i - 1];
      const curr = trail[i];
      const timeMs = curr.timestamp - startTime;
      const targetMidi = getTargetMidiAt(timeMs);

      let color = COLORS.TEXT_DIM;
      if (targetMidi !== null) {
        const dist = Math.abs(curr.midi - targetMidi);
        if (dist <= 0.5) {
          color = COLORS.IN_TUNE;
        } else if (dist <= 1.5) {
          color = COLORS.CLOSE;
        } else {
          color = COLORS.OFF;
        }
      }

      const x1 = timeToX(prev.timestamp - startTime, totalMs);
      const y1 = noteToY(prev.midi);
      const x2 = timeToX(timeMs, totalMs);
      const y2 = noteToY(curr.midi);

      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Drawing: Progress bar for attempt timer
  // ---------------------------------------------------------------------------

  function drawAttemptProgress(elapsedMs, totalMs) {
    const area = drawArea();
    const barHeight = 3;
    const barY = area.y + area.h + 8;
    const progress = Math.min(1, elapsedMs / totalMs);

    // Background bar
    ctx.save();
    ctx.fillStyle = COLORS.BG_SURFACE;
    ctx.fillRect(area.x, barY, area.w, barHeight);

    // Progress fill
    ctx.fillStyle = COLORS.ACCENT;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(area.x, barY, area.w * progress, barHeight);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Drawing: Phrase progress counter
  // ---------------------------------------------------------------------------

  function drawPhraseCounter(phraseIdx, phraseCount) {
    if (phraseCount <= 1) return;

    const padding = 16;
    const fontSize = Math.max(12, Math.min(width, height) * 0.035);

    ctx.save();
    ctx.font = `${fontSize}px ${FONTS.MONO}`;
    ctx.fillStyle = COLORS.TEXT_DIM;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${phraseIdx + 1}/${phraseCount}`, width - padding, padding);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Main draw function
  // ---------------------------------------------------------------------------

  function draw() {
    clearCanvas(ctx, width, height);

    if (!lastState) {
      // No state yet — draw blank with grid
      drawGrid();
      drawNoteLabels();
      if (countdownValue !== null) {
        drawCountdown(ctx, countdownValue, width, height);
      }
      return;
    }

    const evalResult = lastState.evaluatorResult;
    const phase = evalResult?.phase ?? 'idle';
    const currentPhrase = evalResult?.currentPhrase ?? [];
    const phraseIdx = evalResult?.phraseIndex ?? 0;
    const phraseCount = evalResult?.phraseCount ?? 1;
    const phaseStart = evalResult?.phaseStartTime ?? 0;
    const attemptTimer = evalResult?.attemptTimerMs ?? 3000;
    const trail = evalResult?.pitchTrail ?? [];
    const comparison = evalResult?.comparisonResults;

    // Update MIDI range based on phrase
    if (currentPhrase.length > 0) {
      computeMidiRange(currentPhrase);
    }

    // Also expand range for pitch trail
    if (trail.length > 0) {
      for (const pt of trail) {
        if (pt.midi < midiLow + 2) midiLow = Math.max(24, pt.midi - 4);
        if (pt.midi > midiHigh - 2) midiHigh = Math.min(108, pt.midi + 4);
      }
    }

    drawGrid();
    drawNoteLabels();

    const now = performance.now();
    const phaseElapsed = now - phaseStart;

    switch (phase) {
      case 'listen': {
        drawPhaseLabel('Listen...', 'Hear the phrase');
        // Show target bars progressively as they play
        // Account for the pre-delay before phrase starts
        const playElapsed = Math.max(0, phaseElapsed - 500);
        drawTargetBarsProgressive(currentPhrase, playElapsed);
        break;
      }

      case 'attempt': {
        drawPhaseLabel('Your turn!', 'Play it back');
        // NO target bars — ear first
        // Draw the live pitch trail
        if (trail.length > 0) {
          const trailStart = trail[0].timestamp;
          drawPitchTrail(trail, attemptTimer, trailStart, COLORS.ACCENT, TRAIL_LINE_WIDTH);
        }
        drawAttemptProgress(phaseElapsed, attemptTimer);
        break;
      }

      case 'review': {
        drawPhaseLabel('Compare', null);
        // Show target bars as translucent
        drawTargetBars(currentPhrase, REVIEW_TARGET_ALPHA);
        // Overlay the player's trail, color-coded
        if (trail.length > 0) {
          const trailStart = trail[0].timestamp;
          drawReviewTrail(trail, currentPhrase, attemptTimer, trailStart);
        }
        break;
      }

      case 'complete': {
        // Show final score
        const score = lastState.evaluatorResult?.getScore?.() ?? 0;
        drawCenteredText(ctx, 'Complete', width / 2, height / 2 - 20, {
          fontSize: Math.min(width, height) * 0.12,
          color: COLORS.ACCENT,
        });
        break;
      }

      default: {
        // Idle
        drawCenteredText(ctx, 'Get ready...', width / 2, height / 2, {
          fontSize: Math.min(width, height) * 0.08,
          color: COLORS.TEXT_DIM,
        });
        break;
      }
    }

    // Phrase counter
    drawPhraseCounter(phraseIdx, phraseCount);

    // Countdown overlay
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
    draw();
  }

  // ---------------------------------------------------------------------------
  // Utility: rounded rectangle
  // ---------------------------------------------------------------------------

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }

  // ---------------------------------------------------------------------------
  // Renderer interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Set up the canvas and prepare for rendering.
     *
     * @param {HTMLCanvasElement} canvasElement
     * @param {Object} config - Exercise config
     */
    init(canvasElement, config) {
      const setup = setupCanvas(canvasElement);
      canvas = setup.canvas;
      ctx = setup.ctx;
      width = setup.width;
      height = setup.height;

      exerciseConfig = config;

      // Reset state
      active = false;
      countdownValue = null;
      lastState = null;
      lastPhase = 'idle';

      // Compute MIDI range from config
      const phrases = config.audio?.phrases ?? config.context?.notes ?? [];
      const allNotes = Array.isArray(phrases[0]) ? phrases.flat() : phrases;
      if (allNotes.length > 0) {
        computeMidiRange(allNotes);
      }

      // Resize handler
      resizeHandler = () => handleResize();
      window.addEventListener('resize', resizeHandler);

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
      exerciseConfig = config;
    },

    /**
     * Called each rAF frame by the exercise runtime.
     *
     * @param {Object} state
     */
    update(state) {
      if (!ctx) return;

      lastState = state;

      // Extract phase from evaluator result
      const evalResult = state.evaluatorResult;
      if (evalResult) {
        lastPhase = evalResult.phase ?? 'idle';
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

      lastState = null;
      exerciseConfig = null;
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
     * Reset for next loop iteration.
     */
    onLoopRestart() {
      lastState = null;
      lastPhase = 'idle';
      countdownValue = null;
      if (ctx) draw();
    },
  };
}
