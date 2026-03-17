/**
 * scroll-targets.js — Scrolling bar + player trail renderer.
 *
 * Renders horizontal note bars scrolling toward a play zone, with the
 * player's pitch trail drawn as colored dots and connecting lines.
 *
 * Two timing modes:
 *   - player-driven (default): bars approach the play zone and WAIT there
 *     until the player matches the note. Matched bars slide left and fade.
 *   - fixed-tempo: bars scroll at constant speed based on elapsed time,
 *     bars CAN scroll past if the player doesn't match in time.
 *
 * Conforms to the RendererInterface defined in renderer-base.js.
 * Receives all data via update(state) — never subscribes to bus events.
 */

import { NOTE_NAMES } from '../utils/constants.js';
import { frequencyToMidi } from '../audio/note-math.js';
import { playNote } from '../audio/synth.js';
import {
  setupCanvas,
  resizeCanvas,
  clearCanvas,
  centsToColor,
  drawNoteLabel,
  drawCountdown,
  midiToY,
  COLORS,
  COLORS_ALPHA,
  FONTS,
  CENTS_THRESHOLD,
} from './renderer-base.js';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const LABEL_WIDTH = 52;
const PLAYZONE_X_RATIO = 0.25;
const MIDI_PADDING = 2;
const BAR_HALF_HEIGHT = 0.4;   // semitones above/below center for bar rect
const PITCH_TRAIL_MAX = 500;
const APPROACH_SPEED_PX_MS = 0.12; // px/ms approach speed in player-driven mode
const FADE_DURATION_MS = 400;      // how long a matched bar takes to fade/slide out
const MIN_BAR_WIDTH = 40;         // minimum bar width in player-driven mode (px)
const DEFAULT_PX_PER_MS = 0.15;   // default scroll speed for fixed-tempo mode

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a scroll-targets renderer.
 *
 * @returns {import('./renderer-base.js').RendererInterface}
 */
export function createScrollTargetsRenderer() {
  // --- Canvas state ---
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // --- Exercise data ---
  let notes = [];            // NoteSpec[] from exercise config
  let timingMode = 'player-driven';
  let midiLow = 48;
  let midiHigh = 72;
  let noteDurationMs = 1000; // for fixed-tempo bar width

  // --- Runtime state ---
  let active = false;
  let cursor = 0;
  let elapsed = 0;
  let countdownValue = null;  // non-null = show countdown overlay

  // --- Player-driven mode state ---
  // Each note gets a visual state: approaching, waiting, matched, gone
  let noteVisualState = [];   // 'approaching' | 'waiting' | 'matched' | 'gone'
  let noteMatchTime = [];     // timestamp when note was matched (for fade animation)
  let waitingSince = [];      // timestamp when note arrived at play zone

  // --- Per-note feedback ---
  let lastEvaluatorResult = null;

  // --- Hold progress tracking (visual fill for active bar) ---
  let holdProgress = 0;         // 0..1 fill ratio
  let holdStartTimestamp = 0;   // performance.now() when in-tune streak began
  let holdInTune = false;       // was the last frame in-tune?
  let holdGraceStart = 0;       // timestamp when grace period began (out-of-tune)
  let holdAccumulatedMs = 0;    // accumulated in-tune ms (survives short gaps)
  let holdTargetMs = 300;       // holdMs from exercise config
  const HOLD_GRACE_MS = 200;    // grace period before resetting progress
  let holdFlashUntil = 0;       // timestamp until which to show bright flash

  // --- Pulsing glow animation ---
  let glowPhase = 0;           // 0..2*PI for sine-wave pulsing

  // --- Score badges: noteIndex → { score } ---
  let noteScores = new Map();

  // --- Pitch trail (circular buffer) ---
  let pitchTrail = [];

  // --- Previous frame state for delta computation ---
  let lastFrameTime = 0;

  // --- Resize handler reference ---
  let resizeHandler = null;

  // --- Tap-to-play state ---
  let barHitRects = [];         // { midi, x, y, width, height } in canvas (scaled) coords
  let tappedBarMidi = null;     // MIDI of currently flashing bar (null = none)
  let tappedBarTimeout = null;  // timeout ID for clearing flash
  let clickHandler = null;      // reference for cleanup

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

  function playZoneX() {
    return graphLeft() + graphWidth() * PLAYZONE_X_RATIO;
  }

  /**
   * Map MIDI to Y using renderer-base utility.
   */
  function toY(midi) {
    return midiToY(midi, midiLow, midiHigh, height);
  }

  /**
   * For fixed-tempo mode: convert a time offset (ms from elapsed) to X.
   * Notes scroll right-to-left. Play zone is a fixed X position.
   */
  function timeToX(timeMs) {
    const pzX = playZoneX();
    return pzX + (timeMs - elapsed) * DEFAULT_PX_PER_MS;
  }

  /**
   * Compute the visual X position for a note bar in player-driven mode.
   * Takes into account which notes have been matched and how far
   * approaching notes have traveled.
   */
  function getPlayerDrivenX(noteIndex) {
    const state = noteVisualState[noteIndex];
    const pzX = playZoneX();
    const gw = graphWidth();
    const spacing = Math.max(MIN_BAR_WIDTH + 20, gw * 0.12);
    const barW = Math.max(MIN_BAR_WIDTH, spacing * 0.6);

    if (state === 'gone') return -999; // off-screen left

    if (state === 'matched') {
      // Slide left and fade
      const matchT = noteMatchTime[noteIndex] || 0;
      const fadeElapsed = performance.now() - matchT;
      const fadeProgress = Math.min(1, fadeElapsed / FADE_DURATION_MS);
      const slideDistance = barW + 40;
      return pzX - slideDistance * fadeProgress;
    }

    if (state === 'waiting') {
      // Parked at the play zone
      return pzX;
    }

    // 'approaching' — compute position based on time
    // Distance from off-screen starting position, approaching the play zone
    // Notes ahead of the cursor get their position relative to the waiting note
    const waitingIndex = findWaitingIndex();
    if (waitingIndex >= 0 && noteIndex > waitingIndex) {
      // This note is queued behind the waiting note
      const distanceBehind = (noteIndex - waitingIndex) * spacing;
      return pzX + distanceBehind;
    }

    // Fallback: should not happen, but position off-screen right
    return pzX + spacing * (noteIndex - cursor + 1);
  }

  /**
   * Find the index of the note currently waiting at the play zone.
   */
  function findWaitingIndex() {
    for (let i = 0; i < noteVisualState.length; i++) {
      if (noteVisualState[i] === 'waiting') return i;
    }
    return -1;
  }

  /**
   * Initialize visual states for all notes.
   */
  function initNoteStates() {
    noteVisualState = notes.map(() => 'approaching');
    noteMatchTime = notes.map(() => 0);
    waitingSince = notes.map(() => 0);

    // First note starts approaching immediately
    if (notes.length > 0) {
      noteVisualState[0] = 'waiting';
      waitingSince[0] = performance.now();
    }
  }

  /**
   * Update player-driven note states based on cursor position.
   * Called each frame from update().
   */
  function updatePlayerDrivenStates(newCursor) {
    const prevCursor = cursor;

    // Mark notes before the new cursor as matched/gone
    for (let i = prevCursor; i < newCursor && i < notes.length; i++) {
      if (noteVisualState[i] !== 'matched' && noteVisualState[i] !== 'gone') {
        noteVisualState[i] = 'matched';
        noteMatchTime[i] = performance.now();
      }
    }

    // Transition matched notes to gone after fade
    for (let i = 0; i < notes.length; i++) {
      if (noteVisualState[i] === 'matched') {
        const fadeElapsed = performance.now() - noteMatchTime[i];
        if (fadeElapsed > FADE_DURATION_MS) {
          noteVisualState[i] = 'gone';
        }
      }
    }

    // The note at the new cursor should be waiting (or approaching → waiting)
    if (newCursor < notes.length) {
      if (noteVisualState[newCursor] === 'approaching') {
        noteVisualState[newCursor] = 'waiting';
        waitingSince[newCursor] = performance.now();
      }
    }

    cursor = newCursor;
  }

  /**
   * Record pitch data into the trail buffer.
   */
  function recordPitch(pitchData) {
    if (!pitchData) {
      // Silence: push a gap marker
      pitchTrail.push({ time: elapsed, midi: null, cents: 0 });
    } else {
      const exactMidi = typeof pitchData.midi === 'number'
        ? pitchData.midi
        : frequencyToMidi(pitchData.frequency);

      pitchTrail.push({
        time: elapsed,
        midi: exactMidi,
        cents: pitchData.cents ?? 0,
      });
    }

    if (pitchTrail.length > PITCH_TRAIL_MAX) {
      pitchTrail.shift();
    }
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
          // Grace expired or fresh start — but don't reset if grace was active
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

      // Check for advance (bar fully filled)
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

    // Reset hit rects for tap-to-play (rebuilt during drawNoteBar calls)
    barHitRects = [];

    const gL = graphLeft();
    const gR = graphRight();
    const gW = graphWidth();
    const pzX = playZoneX();

    // Clip to graph area for bars and trail
    ctx.save();
    ctx.beginPath();
    ctx.rect(gL, 0, gW, height);
    ctx.clip();

    drawGrid(gL, gR);

    if (timingMode === 'player-driven') {
      drawBarsPlayerDriven(gL, gR, pzX);
    } else {
      drawBarsFixedTempo(gL, gR, pzX);
    }

    drawPitchTrail(gL, gR);

    ctx.restore();

    // Labels on both sides (outside clip)
    drawLabels(0, LABEL_WIDTH, 'right');
    drawLabels(gR, width, 'left');

    // Play zone line
    drawPlayZoneLine(pzX);

    // Separator lines
    ctx.strokeStyle = COLORS.BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gL, 0);
    ctx.lineTo(gL, height);
    ctx.moveTo(gR, 0);
    ctx.lineTo(gR, height);
    ctx.stroke();

    // Countdown overlay (on top of everything)
    if (countdownValue !== null) {
      drawCountdown(ctx, countdownValue, width, height);
    }
  }

  function drawGrid(left, right) {
    for (let midi = midiLow; midi <= midiHigh; midi++) {
      const y = toY(midi);
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

  function drawPlayZoneLine(pzX) {
    ctx.strokeStyle = COLORS_ALPHA.PLAYZONE;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pzX, 0);
    ctx.lineTo(pzX, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------------------------------------------------------------------------
  // Fixed-tempo bar drawing (backward compat with game-canvas.js approach)
  // ---------------------------------------------------------------------------

  function drawBarsFixedTempo(gL, gR, pzX) {
    // In fixed-tempo mode, notes have explicit durations.
    // Compute cumulative start times for each note.
    let cumulativeMs = 0;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const dur = note.durationMs ?? noteDurationMs;
      const startMs = cumulativeMs;
      const endMs = cumulativeMs + dur;
      cumulativeMs = endMs;

      const x1 = timeToX(startMs);
      const x2 = timeToX(endMs);

      // Skip if fully off-screen
      if (x2 < gL || x1 > gR + 200) continue;

      drawNoteBar(note, i, x1, x2, i < cursor);
    }
  }

  // ---------------------------------------------------------------------------
  // Player-driven bar drawing
  // ---------------------------------------------------------------------------

  function drawBarsPlayerDriven(gL, gR, pzX) {
    const gW = graphWidth();
    const spacing = Math.max(MIN_BAR_WIDTH + 20, gW * 0.12);
    const barW = Math.max(MIN_BAR_WIDTH, spacing * 0.6);

    for (let i = 0; i < notes.length; i++) {
      const state = noteVisualState[i];
      if (state === 'gone') continue;

      const x = getPlayerDrivenX(i);
      const x1 = x - barW * 0.1; // bar starts slightly before the position
      const x2 = x + barW * 0.9;

      // Skip if fully off-screen
      if (x2 < gL - 50 || x1 > gR + 200) continue;

      // Compute alpha for matched (fading) bars
      let alpha = 1;
      if (state === 'matched') {
        const fadeElapsed = performance.now() - noteMatchTime[i];
        alpha = Math.max(0, 1 - fadeElapsed / FADE_DURATION_MS);
      }

      const isPast = state === 'matched' || state === 'gone';
      drawNoteBar(notes[i], i, x1, x2, isPast, alpha, state === 'waiting');
    }
  }

  // ---------------------------------------------------------------------------
  // Shared note bar drawing
  // ---------------------------------------------------------------------------

  /**
   * Draw a single note bar.
   *
   * @param {Object} note - NoteSpec
   * @param {number} index - Note index
   * @param {number} x1 - Left edge X
   * @param {number} x2 - Right edge X
   * @param {boolean} isPast - Whether cursor has passed this note
   * @param {number} [alpha=1] - Opacity multiplier
   * @param {boolean} [isActive=false] - Whether this is the actively waiting note
   */
  function drawNoteBar(note, index, x1, x2, isPast, alpha = 1, isActive = false) {
    const yTop = toY(note.midi + BAR_HALF_HEIGHT);
    const yBot = toY(note.midi - BAR_HALF_HEIGHT);
    const barH = yBot - yTop;
    const barW = x2 - x1;
    const now = performance.now();

    // Store bar rect for tap-to-play hit testing
    barHitRects.push({ midi: note.midi, x: x1, y: yTop, width: barW, height: barH });

    // Check if this bar is being tap-flashed
    const isTapped = tappedBarMidi === note.midi;

    // Determine bar color from evaluator feedback
    let fillColor = COLORS_ALPHA.BAR_DEFAULT;
    let borderColor = COLORS_ALPHA.BAR_BORDER;

    if (isActive && lastEvaluatorResult) {
      const result = lastEvaluatorResult;
      if (result.inTune) {
        fillColor = COLORS_ALPHA.BAR_IN_TUNE;
        borderColor = COLORS.IN_TUNE;       // green border when in-tune
      } else if (result.close) {
        fillColor = COLORS_ALPHA.BAR_CLOSE;
        borderColor = COLORS.CLOSE;          // yellow border when close
      } else if (result.absCents !== undefined) {
        fillColor = COLORS_ALPHA.BAR_OFF;
        borderColor = COLORS.OFF;
      }
    }

    // Apply alpha
    ctx.save();
    if (alpha < 1) {
      ctx.globalAlpha = alpha;
    }

    // Active note: pulsing glow effect
    if (isActive) {
      const pulseIntensity = 6 + 4 * Math.sin(glowPhase); // oscillates 2..10
      ctx.shadowColor = COLORS.ACCENT;
      ctx.shadowBlur = pulseIntensity;
    }

    // Bar fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(x1, yTop, barW, barH);

    // Reset shadow before drawing overlay and border
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Hold progress fill overlay (only for active bar in player-driven mode)
    if (isActive && holdProgress > 0 && timingMode === 'player-driven') {
      const fillW = barW * holdProgress;

      // Determine fill color: brighter during flash, otherwise accent at 0.3 opacity
      if (holdFlashUntil > now) {
        // Bright flash when advance triggers
        ctx.fillStyle = 'rgba(78, 205, 196, 0.55)';
      } else {
        ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
      }

      ctx.fillRect(x1, yTop, fillW, barH);
    }

    // Bar border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.strokeRect(x1, yTop, barW, barH);

    // Tap flash overlay — bright highlight when user taps the bar
    if (isTapped) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(x1, yTop, barW, barH);
      ctx.strokeStyle = COLORS.TEXT;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, yTop, barW, barH);
    }

    // Note name inside bar
    if (barW > 30) {
      const noteIndex = ((note.midi % 12) + 12) % 12;
      const octave = Math.floor(note.midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIndex];
      const label = note.note ?? `${noteName}${octave}`;

      ctx.fillStyle = isActive ? COLORS.TEXT : '#ccc';
      ctx.font = `${isActive ? 'bold ' : ''}10px ${FONTS.FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x1 + 6, yTop + barH / 2);
    }

    ctx.restore();

    // Score badge on completed (past) notes
    const score = noteScores.get(index);
    if (score !== undefined) {
      drawScoreBadge(x1 + barW / 2, yTop - 2, score);
    }
  }

  /**
   * Draw a circular score badge above a completed note bar.
   */
  function drawScoreBadge(x, y, score) {
    const radius = 11;
    let bgColor, textColor;

    if (score >= 80) {
      bgColor = COLORS.IN_TUNE;
      textColor = COLORS.BG;
    } else if (score >= 50) {
      bgColor = COLORS.CLOSE;
      textColor = COLORS.BG;
    } else {
      bgColor = COLORS.OFF;
      textColor = COLORS.TEXT;
    }

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = `bold 9px ${FONTS.FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(score, x, y);
  }

  // ---------------------------------------------------------------------------
  // Pitch trail drawing
  // ---------------------------------------------------------------------------

  function drawPitchTrail(gL, gR) {
    let prevX = null;
    let prevY = null;

    for (const p of pitchTrail) {
      if (p.midi === null) {
        prevX = null;
        prevY = null;
        continue;
      }

      let x;
      if (timingMode === 'player-driven') {
        // In player-driven mode, trail positions are relative to
        // how recently they were recorded (time-based scroll from play zone)
        const age = elapsed - p.time;
        x = playZoneX() - age * APPROACH_SPEED_PX_MS;
      } else {
        x = timeToX(p.time);
      }

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

      // Connecting line — tinted by accuracy
      if (prevX !== null && Math.abs(x - prevX) < 40) {
        const lineAbsCents = Math.abs(p.cents || 0);
        if (lineAbsCents <= CENTS_THRESHOLD.IN_TUNE) {
          ctx.strokeStyle = 'rgba(78, 205, 196, 0.35)';
        } else if (lineAbsCents <= CENTS_THRESHOLD.CLOSE) {
          ctx.strokeStyle = 'rgba(255, 230, 109, 0.3)';
        } else {
          ctx.strokeStyle = 'rgba(255, 107, 107, 0.25)';
        }
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Dot — colored by accuracy
      ctx.fillStyle = centsToColor(Math.abs(p.cents || 0));
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      prevX = x;
      prevY = y;
    }
  }

  // ---------------------------------------------------------------------------
  // Label drawing
  // ---------------------------------------------------------------------------

  function drawLabels(areaLeft, areaRight, align) {
    const padding = 8;

    // Background fill to cover any clipped content
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(areaLeft, 0, areaRight - areaLeft, height);

    ctx.textBaseline = 'middle';

    for (let midi = midiLow; midi <= midiHigh; midi++) {
      const y = toY(midi);
      const noteIdx = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIdx];
      const isC = noteIdx === 0;
      const isNatural = !noteName.includes('#');

      if (!isNatural) continue;

      const label = isC ? `${noteName}${octave}` : noteName;
      const x = align === 'right' ? areaRight - padding : areaLeft + padding;

      // drawNoteLabel concatenates note + octave; pass label as note
      // with empty octave to get the exact string we want
      drawNoteLabel(ctx, label, '', x, y, {
        fontSize: 11,
        color: isC ? COLORS.TEXT_MUTED : COLORS.TEXT_DIM,
        align,
        baseline: 'middle',
      });
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
  // Compute MIDI range from exercise notes
  // ---------------------------------------------------------------------------

  function computeMidiRange(exerciseNotes) {
    if (!exerciseNotes || exerciseNotes.length === 0) {
      midiLow = 48;
      midiHigh = 72;
      return;
    }

    let lo = Infinity;
    let hi = -Infinity;
    for (const n of exerciseNotes) {
      if (n.midi < lo) lo = n.midi;
      if (n.midi > hi) hi = n.midi;
    }

    midiLow = lo - MIDI_PADDING;
    midiHigh = hi + MIDI_PADDING;
  }

  // ---------------------------------------------------------------------------
  // Tap-to-play: click handler and hit testing
  // ---------------------------------------------------------------------------

  /**
   * Handle click/tap on the canvas. Maps event coordinates to bar hit rects
   * and plays the corresponding note via the synth.
   */
  function handleCanvasClick(event) {
    if (!canvas) return;

    // Convert DOM event coordinates to canvas (scaled) coordinates
    const x = event.offsetX * dpr;
    const y = event.offsetY * dpr;

    // Hit-test against stored bar rects (most recent frame)
    for (const rect of barHitRects) {
      if (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      ) {
        // Play the tapped note
        playNote(rect.midi, 400, { voice: 'sine', gain: 0.8 });

        // Visual feedback: flash this bar
        tappedBarMidi = rect.midi;
        if (tappedBarTimeout) clearTimeout(tappedBarTimeout);
        tappedBarTimeout = setTimeout(() => {
          tappedBarMidi = null;
          tappedBarTimeout = null;
          if (ctx) draw(); // redraw to clear the flash
        }, 200);

        // Redraw immediately to show the flash
        if (ctx) draw();
        return; // only play one note per tap
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Renderer interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Set up the canvas and prepare for rendering.
     *
     * @param {HTMLCanvasElement} canvasElement
     * @param {import('../core/exercise-schema.js').ExerciseConfig} exerciseConfig
     */
    init(canvasElement, exerciseConfig) {
      const setup = setupCanvas(canvasElement);
      canvas = setup.canvas;
      ctx = setup.ctx;
      width = setup.width;
      height = setup.height;
      dpr = setup.dpr;

      // Extract exercise data
      notes = exerciseConfig.context?.notes ?? [];
      timingMode = exerciseConfig.timing?.mode ?? 'player-driven';
      noteDurationMs = exerciseConfig.timing?.noteDuration ?? 1000;
      holdTargetMs = exerciseConfig.timing?.holdMs ?? 300;

      computeMidiRange(notes);
      initNoteStates();

      // Reset trail and scores
      pitchTrail = [];
      noteScores = new Map();
      lastEvaluatorResult = null;
      countdownValue = null;
      cursor = 0;
      elapsed = 0;
      lastFrameTime = 0;
      resetHoldProgress();
      glowPhase = 0;

      // Listen for resize
      resizeHandler = () => handleResize();
      window.addEventListener('resize', resizeHandler);

      // Listen for tap-to-play clicks on the canvas
      clickHandler = (e) => handleCanvasClick(e);
      canvas.addEventListener('click', clickHandler);

      // Draw initial frame
      draw();
    },

    /**
     * Called when the exercise begins running (after countdown).
     *
     * @param {import('../core/exercise-schema.js').ExerciseConfig} config
     */
    start(config) {
      active = true;
      countdownValue = null;
      lastFrameTime = performance.now();

      // Re-read config in case it changed
      if (config) {
        notes = config.context?.notes ?? notes;
        timingMode = config.timing?.mode ?? timingMode;
        noteDurationMs = config.timing?.noteDuration ?? noteDurationMs;
        holdTargetMs = config.timing?.holdMs ?? holdTargetMs;
        computeMidiRange(notes);
      }

      // Ensure note states are initialized
      if (noteVisualState.length !== notes.length) {
        initNoteStates();
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
      const dt = lastFrameTime > 0 ? now - lastFrameTime : 16;

      elapsed = state.elapsed;
      lastEvaluatorResult = state.evaluatorResult;

      // Record pitch trail from pitch data
      if (state.pitchData) {
        recordPitch(state.pitchData);
      } else if (pitchTrail.length > 0) {
        // Only push silence marker if we had pitch before (avoid flooding)
        const last = pitchTrail[pitchTrail.length - 1];
        if (last && last.midi !== null) {
          recordPitch(null);
        }
      }

      // Reset hold progress when the cursor advances to a new note
      const prevCursor = cursor;

      // Update visual states based on cursor movement.
      // Note scores are injected externally via setNoteScore() since this
      // renderer doesn't subscribe to bus events.
      if (timingMode === 'player-driven') {
        updatePlayerDrivenStates(state.cursor);
      } else {
        cursor = state.cursor;
      }

      // Detect cursor advancement and reset hold progress
      if (cursor !== prevCursor) {
        resetHoldProgress();
      }

      // Update hold progress for the active bar (player-driven mode)
      if (timingMode === 'player-driven') {
        updateHoldProgress(state.evaluatorResult);
      }

      // Advance glow pulse animation (~2 second cycle)
      glowPhase += (dt / 1000) * Math.PI; // full cycle in ~2s

      // Draw the frame
      draw();

      lastFrameTime = now;
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

      if (clickHandler && canvas) {
        canvas.removeEventListener('click', clickHandler);
        clickHandler = null;
      }

      // Clean up tap-to-play state
      if (tappedBarTimeout) {
        clearTimeout(tappedBarTimeout);
        tappedBarTimeout = null;
      }
      tappedBarMidi = null;
      barHitRects = [];

      pitchTrail = [];
      noteScores = new Map();
      noteVisualState = [];
      noteMatchTime = [];
      waitingSince = [];
      notes = [];
      resetHoldProgress();
      glowPhase = 0;

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
      pitchTrail = [];
      noteScores = new Map();
      lastEvaluatorResult = null;
      cursor = 0;
      elapsed = 0;
      countdownValue = null;
      resetHoldProgress();
      glowPhase = 0;

      initNoteStates();

      if (ctx) draw();
    },

    /**
     * Record a note score (called externally when a note completes).
     * This allows the exercise view to forward note-complete events.
     *
     * @param {number} noteIndex
     * @param {number} score - 0-100
     */
    setNoteScore(noteIndex, score) {
      noteScores.set(noteIndex, score);
    },
  };
}
