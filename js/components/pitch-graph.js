/**
 * pitch-graph.js — The pitch mirror. Scrolling pitch trail with
 * instrument-native rails, skinned rendering, and pause-preserved trace.
 *
 * Left rail:  the instrument's own language (harp tab tokens, whistle
 *             fingering dots). Right rail: note names.
 * Skins:      press = halftone ink dots · neon = glowing line ·
 *             riso = ink dots with a misregistered second pass.
 * Pause:      freezes the virtual clock and keeps the trace; resume
 *             continues the line with no gap.
 *
 * Interactions kept from v1: press-hold a rail label to drone it,
 * quick tap in the center toggles pause, wheel pans the Y range.
 */

import { NOTE_NAMES } from '../utils/constants.js';
import { getScaleNotes } from '../utils/scales.js';
import { frequencyToMidi } from '../audio/note-math.js';
import { mic } from '../audio/mic.js';
import { playNote } from '../audio/synth.js';
import { bus } from '../utils/event-bus.js';
import { themeColors } from '../utils/theme-colors.js';
import { settings } from '../utils/settings.js';
import { getNativeMap, getDefaultRange } from '../utils/instruments.js';

const LEFT_RAIL = 84;    // native tokens
const RIGHT_RAIL = 60;   // note names
const MIN_MIDI = 36;     // C2
const MAX_MIDI = 100;
const SCROLL_SPEEDS = [0.5, 1, 1.5, 2, 3];
const DEFAULT_SPEED_INDEX = 1;
const MAX_POINTS = 4096;

// Quick tap vs hold/drag discrimination (center tap-to-pause)
const TAP_MAX_MS = 400;
const TAP_MAX_MOVE = 12;

// Noise filter: consecutive similar readings required, and "similar" distance
const CONFIRM_THRESHOLD = 2;
const SIMILAR_THRESHOLD = 1.0;

const FONT = (px, weight = '') => `${weight ? weight + ' ' : ''}${px}px "Departure Mono", ui-monospace, monospace`;

/** Per-skin canvas behavior. Colors come from CSS tokens via themeColors. */
const SKIN_FX = {
  press: { glow: 0, misregister: null, dotBase: 2.6 },
  neon:  { glow: 14, misregister: null, dotBase: 2.4 },
  riso:  { glow: 0, misregister: { dx: 1.6, dy: -1.2 }, dotBase: 2.6 },
};

export class PitchGraph {
  #canvas;
  #ctx;
  #dpr = 1;
  #width = 0;
  #height = 0;
  #rafId = null;
  #running = false;   // animation loop active
  #paused = false;    // clock frozen, trace held

  // View range (MIDI)
  #midiLow = 48;
  #midiHigh = 84;
  #semitoneRange = 36;

  // Scroll: the clock IS real elapsed time (pause-aware, see #now()).
  // Speed only scales pixels-per-ms at render, so the newest point always
  // sits on the playhead and stalled frames can never compress the trail.
  #basePixelsPerMs = 0.08;
  #speedMultiplier = 1;
  #speedIndex = DEFAULT_SPEED_INDEX;

  // Auto-range
  #detectedMidiMin = 60;
  #detectedMidiMax = 72;
  #yOffset = 0;
  #baseLow = 48;
  #baseHigh = 84;

  // Instrument
  #nativeMap = new Map();
  #instrument = 'voice';
  #instrumentKey = null;

  // Scale overlay + drone chord tones
  #scaleNotes = null;
  #chordNotes = null;

  // Label interactions
  #labelHitTargets = [];
  #tappedMidi = null;
  #tapFlashTimer = null;
  #droneHandle = null;
  #onCenterTap = null;
  #pointerDownPos = null;

  // Guide (scale player)
  #guideMidi = null;

  // Noise filter + trace data
  #pendingPoint = null;
  #confirmCount = 0;
  #data = [];
  #startTime = 0;
  #pauseOffset = 0;
  #pausedAt = 0;
  #currentMidi = null;

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#resize();
    this.setInstrument(settings.get('instrument'), settings.instrumentKey);

    this._resizeHandler = () => {
      this.#resize();
      if (!this.#running) this.drawStatic();
    };
    window.addEventListener('resize', this._resizeHandler);

    this._wheelHandler = (e) => {
      e.preventDefault();
      // Proportional pan: a mouse notch (deltaY ~100) moves ~2 semitones,
      // trackpad pixel deltas move smoothly instead of jumping per event.
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.#yOffset = Math.max(-24, Math.min(24, this.#yOffset - dy * 0.02));
      this.#updateRange();
      if (!this.#running) this.drawStatic();
    };
    this.#canvas.addEventListener('wheel', this._wheelHandler, { passive: false });

    this._pointerDownHandler = (e) => this.#handlePointerDown(e);
    this._pointerMoveHandler = (e) => this.#handlePointerMove(e);
    this._pointerUpHandler = (e) => this.#handlePointerUp(e);
    this._pointerCancelHandler = () => this.#handlePointerCancel();
    this.#canvas.addEventListener('pointerdown', this._pointerDownHandler);
    this.#canvas.addEventListener('pointermove', this._pointerMoveHandler);
    this.#canvas.addEventListener('pointerup', this._pointerUpHandler);
    this.#canvas.addEventListener('pointerleave', this._pointerCancelHandler);
    this.#canvas.addEventListener('pointercancel', this._pointerCancelHandler);

    this._filterPitchHandler = (data) => this.#filterPitch(data);
    this._filterSilenceHandler = () => this.#filterSilence();
    bus.on('pitch', this._filterPitchHandler);
    bus.on('silence', this._filterSilenceHandler);

    this._mousemoveHandler = (e) => {
      const rect = this.#canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const inRail = x < LEFT_RAIL || x > (this.#width - RIGHT_RAIL);
      this.#canvas.style.cursor = inRail ? 'pointer' : '';
    };
    this.#canvas.addEventListener('mousemove', this._mousemoveHandler);
  }

  // -------------------------------------------------------------------------
  // Instrument + scale + guide
  // -------------------------------------------------------------------------

  setInstrument(instrument, key) {
    this.#instrument = instrument;
    this.#instrumentKey = key;
    this.#nativeMap = getNativeMap(instrument, key);
    this.recenter();
  }

  /** Snap the view back to the instrument's home range. */
  recenter() {
    const range = getDefaultRange(this.#instrument, this.#instrumentKey);
    this.#baseLow = range.low;
    this.#baseHigh = range.high;
    this.#detectedMidiMin = range.low + 2;
    this.#detectedMidiMax = range.high - 2;
    this.#yOffset = 0;
    this.#updateRange();
    if (!this.#running) this.drawStatic();
  }

  /** Note classes (0–11) of the droning chord, or null. Marked on the rails. */
  setChordNotes(noteClasses) {
    this.#chordNotes = noteClasses && noteClasses.size ? noteClasses : null;
    if (!this.#running) this.drawStatic();
  }

  setScale(rootName, scaleKey) {
    this.#scaleNotes = (rootName && scaleKey) ? getScaleNotes(rootName, scaleKey) : null;
    if (!this.#running) this.drawStatic();
  }

  setGuideMidi(midi) {
    this.#guideMidi = midi;
    if (!this.#running) this.drawStatic();
  }

  // -------------------------------------------------------------------------
  // Lifecycle: begin / pause / resume / stop
  // -------------------------------------------------------------------------

  /** Fresh session: clears the trace and restarts the clock. */
  begin() {
    this.#data = [];
    this.#pendingPoint = null;
    this.#confirmCount = 0;
    this.#pauseOffset = 0;
    this.#startTime = performance.now();
    this.#paused = false;
    this.#currentMidi = null;
    this.#startLoop();
  }

  /** Freeze the clock, keep the trace on screen. */
  pause() {
    if (this.#paused) return;
    this.#paused = true;
    this.#pausedAt = performance.now();
    this.#stopLoop();
    this.drawStatic();
  }

  /** Continue after pause — the line reconnects with no gap. */
  resume() {
    if (!this.#paused) {
      if (!this.#running) this.#startLoop();
      return;
    }
    this.#pauseOffset += performance.now() - this.#pausedAt;
    this.#paused = false;
    this.#startLoop();
  }

  get isPaused() {
    return this.#paused;
  }

  /** Confirmed trace points currently held (dev/test introspection). */
  get traceLength() {
    return this.#data.length;
  }

  /** Stop the render loop without touching state (tab switch). */
  stopRendering() {
    this.#stopLoop();
  }

  /** Re-enter the view: repaint, and restart the loop if not paused. */
  wake() {
    this.#resize();
    if (this.#paused) {
      this.drawStatic();
    } else if (this.#startTime > 0) {
      this.#startLoop();
    } else {
      this.drawStatic();
    }
  }

  #startLoop() {
    if (this.#running) return;
    this.#running = true;
    this.#animate();
  }

  #stopLoop() {
    this.#running = false;
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  // -------------------------------------------------------------------------
  // Speed
  // -------------------------------------------------------------------------

  setSpeed(index) {
    this.#speedIndex = Math.max(0, Math.min(SCROLL_SPEEDS.length - 1, index));
    this.#speedMultiplier = SCROLL_SPEEDS[this.#speedIndex];
  }

  get speedIndex() { return this.#speedIndex; }
  get speedLabel() { return `${SCROLL_SPEEDS[this.#speedIndex]}x`; }

  // -------------------------------------------------------------------------
  // Noise filter (confirmation buffer)
  // -------------------------------------------------------------------------

  #now() {
    return performance.now() - this.#startTime - this.#pauseOffset;
  }

  #filterPitch(data) {
    if (!this.#running || this.#paused) return;

    const exactMidi = frequencyToMidi(data.frequency, settings.get('a4'));
    this.#currentMidi = data.midi;

    if (this.#pendingPoint && Math.abs(exactMidi - this.#pendingPoint.exactMidi) < SIMILAR_THRESHOLD) {
      this.#confirmCount++;
      if (this.#confirmCount >= CONFIRM_THRESHOLD) {
        this.#data.push(this.#pendingPoint);
        if (this.#data.length > MAX_POINTS) this.#data.shift();
        this.#pendingPoint = { exactMidi, time: this.#now(), cents: data.cents, silent: false };
        this.#confirmCount = 1;
      }
    } else {
      this.#pendingPoint = { exactMidi, time: this.#now(), cents: data.cents, silent: false };
      this.#confirmCount = 1;
    }
  }

  #filterSilence() {
    if (!this.#running || this.#paused) return;
    this.#pendingPoint = null;
    this.#confirmCount = 0;
    this.#currentMidi = null;
    const last = this.#data[this.#data.length - 1];
    if (last && last.silent) return;
    this.#data.push({ time: this.#now(), silent: true });
    if (this.#data.length > MAX_POINTS) this.#data.shift();
  }

  // -------------------------------------------------------------------------
  // Pointer: rail drones + center tap
  // -------------------------------------------------------------------------

  setCenterTapHandler(fn) {
    this.#onCenterTap = fn;
  }

  #handlePointerDown(e) {
    const rect = this.#canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let closestTarget = null;
    let closestDist = Infinity;
    for (const target of this.#labelHitTargets) {
      if (clickX < target.areaLeft || clickX > target.areaRight) continue;
      const dist = Math.abs(clickY - target.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestTarget = target;
      }
    }

    const semitoneHeight = this.#height / this.#semitoneRange;
    const onLabel = !!closestTarget && closestDist <= semitoneHeight * 0.6;
    this.#pointerDownPos = { x: clickX, y: clickY, t: performance.now(), onLabel };
    if (!onLabel) return;

    this.#stopDrone();
    if (!mic.audioContext || mic.audioContext.state === 'suspended') {
      mic.ensureAudioContext().then(() => this.#startLabelDrone(closestTarget.midi));
    } else {
      this.#startLabelDrone(closestTarget.midi);
    }
  }

  #startLabelDrone(midi) {
    this.#droneHandle = playNote(midi, 120000, { voice: settings.get('droneVoice'), gain: 0.7 });
    if (this.#tapFlashTimer) clearTimeout(this.#tapFlashTimer);
    this.#tappedMidi = midi;
    if (!this.#running) this.drawStatic();
  }

  /** Vertical drag in the graph area pans the Y range (finger or mouse). */
  #handlePointerMove(e) {
    const down = this.#pointerDownPos;
    if (!down || down.onLabel) return;
    const rect = this.#canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const dy = y - (down.lastY ?? down.y);
    down.lastY = y;
    if (!down.panning && Math.abs(y - down.y) <= TAP_MAX_MOVE) return;
    down.panning = true;
    const semiPerPx = this.#semitoneRange / this.#height;
    this.#yOffset = Math.max(-24, Math.min(24, this.#yOffset + dy * semiPerPx));
    this.#updateRange();
    if (!this.#running) this.drawStatic();
  }

  #handlePointerUp(e) {
    const down = this.#pointerDownPos;
    this.#pointerDownPos = null;

    if (down && !down.onLabel && !down.panning && this.#onCenterTap) {
      const rect = this.#canvas.getBoundingClientRect();
      const moved = Math.hypot((e.clientX - rect.left) - down.x, (e.clientY - rect.top) - down.y);
      if (performance.now() - down.t <= TAP_MAX_MS && moved <= TAP_MAX_MOVE) {
        this.#onCenterTap();
      }
    }
    this.#releaseDrone();
  }

  #handlePointerCancel() {
    this.#pointerDownPos = null;
    this.#releaseDrone();
  }

  #releaseDrone() {
    if (!this.#droneHandle) return;
    this.#stopDrone();
    this.#tapFlashTimer = setTimeout(() => {
      this.#tappedMidi = null;
      if (!this.#running) this.drawStatic();
      this.#tapFlashTimer = null;
    }, 150);
  }

  #stopDrone() {
    if (this.#droneHandle) {
      this.#droneHandle.stop();
      this.#droneHandle = null;
    }
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  resize() {
    this.#resize();
  }

  #resize() {
    this.#dpr = window.devicePixelRatio || 1;
    const rect = this.#canvas.getBoundingClientRect();
    this.#width = rect.width;
    this.#height = rect.height;
    this.#canvas.width = this.#width * this.#dpr;
    this.#canvas.height = this.#height * this.#dpr;
    this.#ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
  }

  setRange(lowMidi, highMidi) {
    this.#midiLow = Math.max(MIN_MIDI, lowMidi);
    this.#midiHigh = Math.min(MAX_MIDI, highMidi);
    this.#semitoneRange = this.#midiHigh - this.#midiLow;
  }

  #updateRange() {
    const low = Math.min(this.#baseLow, this.#detectedMidiMin - 2) + this.#yOffset;
    const high = Math.max(this.#baseHigh, this.#detectedMidiMax + 2) + this.#yOffset;
    const range = high - low;
    if (range < 24) {
      const center = (low + high) / 2;
      this.setRange(Math.round(center - 12), Math.round(center + 12));
    } else {
      this.setRange(Math.round(low), Math.round(high));
    }
  }

  #updateAutoRange() {
    let changed = false;
    const lookback = Math.min(this.#data.length, 200);
    for (let i = this.#data.length - lookback; i < this.#data.length; i++) {
      const point = this.#data[i];
      if (!point || point.silent) continue;
      if (point.exactMidi < this.#detectedMidiMin) { this.#detectedMidiMin = point.exactMidi; changed = true; }
      if (point.exactMidi > this.#detectedMidiMax) { this.#detectedMidiMax = point.exactMidi; changed = true; }
    }
    if (changed) this.#updateRange();
  }

  #midiToY(midi) {
    const ratio = (midi - this.#midiLow) / this.#semitoneRange;
    return this.#height - ratio * this.#height;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  #animate() {
    if (!this.#running) return;
    this.#updateAutoRange();
    this.#draw();
    this.#rafId = requestAnimationFrame(() => this.#animate());
  }

  drawStatic() {
    this.#draw();
  }

  #skinFx() {
    return SKIN_FX[document.documentElement.dataset.skin] ?? SKIN_FX.press;
  }

  #draw() {
    const ctx = this.#ctx;
    const w = this.#width;
    const h = this.#height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    const graphLeft = LEFT_RAIL;
    const graphRight = w - RIGHT_RAIL;
    const playheadX = graphRight - 48;

    this.#labelHitTargets = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(graphLeft, 0, graphRight - graphLeft, h);
    ctx.clip();
    this.#drawGrid(ctx, graphLeft, graphRight);
    this.#drawTrail(ctx, graphLeft, playheadX, h);
    ctx.restore();

    this.#drawNativeRail(ctx, 0, LEFT_RAIL, h);
    this.#drawNoteRail(ctx, graphRight, w, h);

    // Playhead — dotted ink line, pixel-print style
    ctx.strokeStyle = themeColors.canvasPlayhead;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rail separators
    ctx.strokeStyle = themeColors.canvasGridBold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphLeft, 0);
    ctx.lineTo(graphLeft, h);
    ctx.moveTo(graphRight, 0);
    ctx.lineTo(graphRight, h);
    ctx.stroke();
  }

  #drawGrid(ctx, left, right) {
    const graphW = right - left;

    if (this.#guideMidi !== null) {
      const yTop = this.#midiToY(this.#guideMidi + 0.5);
      const yBot = this.#midiToY(this.#guideMidi - 0.5);
      ctx.fillStyle = themeColors.close;
      ctx.globalAlpha = 0.10;
      ctx.fillRect(left, yTop, graphW, yBot - yTop);
      ctx.globalAlpha = 1;
    }

    for (let midi = this.#midiLow; midi <= this.#midiHigh; midi++) {
      const y = this.#midiToY(midi);
      const noteIndex = ((midi % 12) + 12) % 12;
      const isC = noteIndex === 0;

      if (this.#scaleNotes && this.#scaleNotes.has(noteIndex)) {
        const yTop = this.#midiToY(midi + 0.5);
        const yBot = this.#midiToY(midi - 0.5);
        ctx.fillStyle = themeColors.canvasScaleHighlight;
        ctx.fillRect(left, yTop, graphW, yBot - yTop);
      }

      ctx.strokeStyle = isC ? themeColors.canvasGridBold : themeColors.canvasGrid;
      ctx.lineWidth = isC ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
  }

  #trailColor(absCents) {
    if (absCents <= 10) return themeColors.canvasPitchDot;
    if (absCents <= 25) return themeColors.canvasPitchDotOff;
    return themeColors.off;
  }

  #drawTrail(ctx, graphLeft, playheadX, h) {
    const data = this.#data;
    const pending = this.#pendingPoint;
    const count = data.length + (pending ? 1 : 0);
    if (count === 0) return;

    const fx = this.#skinFx();
    const currentTimeMs = this.#now();
    const pxPerMs = this.#basePixelsPerMs * this.#speedMultiplier;

    const passes = fx.misregister ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      const off = pass === 1 ? fx.misregister : { dx: 0, dy: 0 };
      const isGhost = pass === 1;

      let prevX = null;
      let prevY = null;

      for (let i = 0; i < count; i++) {
        const point = i < data.length ? data[i] : pending;
        if (point.silent) {
          prevX = null;
          prevY = null;
          continue;
        }

        const age = currentTimeMs - point.time;
        const x = playheadX - age * pxPerMs + off.dx;
        if (x < graphLeft - 10 || x > playheadX + 10) continue;

        const y = this.#midiToY(point.exactMidi) + off.dy;
        if (y < -10 || y > h + 10) {
          prevX = null;
          prevY = null;
          continue;
        }

        const absCents = Math.abs(point.cents);
        const color = isGhost ? themeColors.accent2 : this.#trailColor(absCents);

        ctx.save();
        if (isGhost) ctx.globalAlpha = 0.45;
        if (fx.glow > 0 && !isGhost) {
          ctx.shadowColor = themeColors.canvasGlow;
          ctx.shadowBlur = fx.glow;
        }

        if (prevX !== null && prevY !== null && Math.abs(x - prevX) < 50) {
          ctx.strokeStyle = isGhost ? themeColors.accent2 : themeColors.canvasPitchLine;
          ctx.lineWidth = fx.glow > 0 ? 2 : 1.25;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        const dotSize = absCents <= 10 ? fx.dotBase + 0.4 : fx.dotBase - 0.4;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        prevX = x;
        prevY = y;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rails
  // -------------------------------------------------------------------------

  /** Chord-tone marker: a small triangle pointing into the graph. dir: 1 = right, -1 = left. */
  #drawChordArrow(ctx, xTip, y, dir) {
    ctx.fillStyle = themeColors.accent2;
    ctx.beginPath();
    ctx.moveTo(xTip, y);
    ctx.lineTo(xTip - dir * 7, y - 5);
    ctx.lineTo(xTip - dir * 7, y + 5);
    ctx.closePath();
    ctx.fill();
  }

  #rowHighlights(midi) {
    return {
      isCurrent: this.#currentMidi === midi,
      isTapped: this.#tappedMidi === midi,
      isGuide: this.#guideMidi === midi,
    };
  }

  #drawRowBands(ctx, midi, areaLeft, areaW) {
    const { isCurrent, isTapped, isGuide } = this.#rowHighlights(midi);
    if (!isCurrent && !isTapped && !isGuide) return;
    const yTop = this.#midiToY(midi + 0.5);
    const yBot = this.#midiToY(midi - 0.5);
    if (isTapped || isCurrent) {
      ctx.fillStyle = themeColors.canvasCurrentNoteBg;
      ctx.fillRect(areaLeft, yTop, areaW, yBot - yTop);
    }
    if (isGuide) {
      ctx.fillStyle = themeColors.close;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(areaLeft, yTop, areaW, yBot - yTop);
      ctx.globalAlpha = 1;
    }
  }

  /** Left rail: harp tokens / whistle fingerings, in-scale tokens emphasized. */
  #drawNativeRail(ctx, areaLeft, areaRight, h) {
    const areaW = areaRight - areaLeft;
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(areaLeft, 0, areaW, h);

    const hasNative = this.#nativeMap.size > 0;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Reserve a minus column so blow "4" and draw "-4" digits align vertically
    ctx.font = FONT(14);
    const minusW = ctx.measureText('-').width;

    for (let midi = this.#midiLow; midi <= this.#midiHigh; midi++) {
      const y = this.#midiToY(midi);
      this.#labelHitTargets.push({ midi, y, areaLeft, areaRight });

      // Key-selection highlight extends into the rail
      const noteIndex = ((midi % 12) + 12) % 12;
      const inScale = this.#scaleNotes ? this.#scaleNotes.has(noteIndex) : true;
      if (this.#scaleNotes && inScale) {
        const yTop = this.#midiToY(midi + 0.5);
        const yBot = this.#midiToY(midi - 0.5);
        ctx.fillStyle = themeColors.canvasScaleHighlight;
        ctx.fillRect(areaLeft, yTop, areaW, yBot - yTop);
      }

      this.#drawRowBands(ctx, midi, areaLeft, areaW);
      const { isCurrent, isTapped } = this.#rowHighlights(midi);

      // Droning chord tones: arrow at the rail's inner edge pointing at the graph
      if (this.#chordNotes?.has(noteIndex)) {
        this.#drawChordArrow(ctx, areaRight - 2, y, 1);
      }

      if (!hasNative) {
        // Voice: mirror the note rail on the left too
        this.#drawNoteLabel(ctx, midi, areaLeft + 8, y, 'left', isCurrent, isTapped, inScale);
        continue;
      }

      const entry = this.#nativeMap.get(midi);
      if (!entry) continue;

      if (entry.kind === 'fingering') {
        this.#drawFingering(ctx, entry.holes, areaLeft + 8, y, isCurrent, inScale);
        continue;
      }

      const isBend = entry.kind === 'bend';
      const isChordTone = this.#chordNotes?.has(noteIndex) ?? false;
      let fill;
      if (isTapped) fill = themeColors.accent;
      else if (isCurrent) fill = themeColors.canvasLabelActive;
      else if (isChordTone) fill = themeColors.accent2;
      else if (isBend) fill = themeColors.nativeLabel;
      else if (entry.kind === 'draw') fill = themeColors.textDim;
      else fill = themeColors.canvasLabelActive;

      // One size for every token — a bend matters as much as its parent note.
      // The current note gets big; out-of-key rows fade but don't shrink.
      ctx.font = isCurrent ? FONT(19) : FONT(14);
      const indent = entry.token.startsWith('-') ? 0 : minusW;
      ctx.globalAlpha = inScale ? 1 : 0.35;
      ctx.fillStyle = fill;
      ctx.fillText(entry.token, areaLeft + 8 + indent, y);
      ctx.globalAlpha = 1;
    }
  }

  /** Whistle fingering: six pixel-square holes, filled = closed. */
  #drawFingering(ctx, holes, x, y, isCurrent, inScale) {
    const size = isCurrent ? 7 : 6;
    const gap = 4;
    ctx.globalAlpha = inScale ? 1 : 0.38;
    for (let i = 0; i < holes.length; i++) {
      const hx = x + i * (size + gap);
      const color = isCurrent ? themeColors.canvasLabelActive : themeColors.nativeLabel;
      if (holes[i]) {
        ctx.fillStyle = color;
        ctx.fillRect(hx, y - size / 2, size, size);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(hx + 0.5, y - size / 2 + 0.5, size - 1, size - 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  #drawNoteLabel(ctx, midi, x, y, align, isCurrent, isTapped, inScale) {
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const noteName = NOTE_NAMES[noteIndex];
    const isC = noteIndex === 0;
    const isSharp = noteName.includes('#');
    const label = isC || isCurrent ? `${noteName}${octave}` : noteName;

    let fill;
    let font;
    if (isTapped) { fill = themeColors.accent; font = FONT(15); }
    else if (isCurrent) { fill = themeColors.canvasLabelActive; font = FONT(15); }
    else if (isC) { fill = themeColors.textMuted; font = FONT(12); }
    else if (isSharp) { fill = themeColors.canvasLabel; font = FONT(9); }
    else { fill = themeColors.canvasLabel; font = FONT(11); }

    ctx.font = font;
    ctx.fillStyle = fill;
    ctx.textAlign = align;
    ctx.globalAlpha = (isSharp && !isCurrent && !isTapped) ? (inScale ? 0.75 : 0.45) : (inScale ? 1 : 0.6);
    ctx.fillText(label, x, y);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /** Right rail: note names. */
  #drawNoteRail(ctx, areaLeft, areaRight, h) {
    const areaW = areaRight - areaLeft;
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(areaLeft, 0, areaW, h);
    ctx.textBaseline = 'middle';

    for (let midi = this.#midiLow; midi <= this.#midiHigh; midi++) {
      const y = this.#midiToY(midi);
      this.#labelHitTargets.push({ midi, y, areaLeft, areaRight });
      this.#drawRowBands(ctx, midi, areaLeft, areaW);

      const { isCurrent, isTapped } = this.#rowHighlights(midi);
      const noteIndex = ((midi % 12) + 12) % 12;
      const inScale = this.#scaleNotes ? this.#scaleNotes.has(noteIndex) : true;
      if (this.#chordNotes?.has(noteIndex)) {
        this.#drawChordArrow(ctx, areaLeft + 2, y, -1);
      }
      this.#drawNoteLabel(ctx, midi, areaRight - 8, y, 'right', isCurrent, isTapped, inScale);
    }
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  destroy() {
    this.#stopLoop();
    if (this.#tapFlashTimer) clearTimeout(this.#tapFlashTimer);
    this.#stopDrone();
    bus.off('pitch', this._filterPitchHandler);
    bus.off('silence', this._filterSilenceHandler);
    window.removeEventListener('resize', this._resizeHandler);
    this.#canvas.removeEventListener('wheel', this._wheelHandler);
    this.#canvas.removeEventListener('pointerdown', this._pointerDownHandler);
    this.#canvas.removeEventListener('pointermove', this._pointerMoveHandler);
    this.#canvas.removeEventListener('pointerup', this._pointerUpHandler);
    this.#canvas.removeEventListener('pointerleave', this._pointerCancelHandler);
    this.#canvas.removeEventListener('pointercancel', this._pointerCancelHandler);
    this.#canvas.removeEventListener('mousemove', this._mousemoveHandler);
    this.#canvas = null;
    this.#ctx = null;
    this.#data = [];
    this.#pendingPoint = null;
  }
}
