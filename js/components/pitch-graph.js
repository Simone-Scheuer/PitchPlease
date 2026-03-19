import { NOTE_NAMES } from '../utils/constants.js';
import { getScaleNotes } from '../utils/scales.js';
import { frequencyToMidi } from '../audio/note-math.js';
import { mic } from '../audio/mic.js';
import { playNote } from '../audio/synth.js';
import { bus } from '../utils/event-bus.js';

const LABEL_WIDTH = 52;
const MIN_MIDI = 36;  // C2
const MAX_MIDI = 96;  // C8
const SCROLL_SPEEDS = [0.5, 1, 1.5, 2, 3];
const DEFAULT_SPEED_INDEX = 1;

export class PitchGraph {
  #canvas;
  #ctx;
  #dpr;
  #width = 0;
  #height = 0;
  #rafId = null;
  #active = false;

  // View range (MIDI note numbers)
  #midiLow = 48;   // C3
  #midiHigh = 84;   // C6
  #semitoneRange = 36;

  // Scroll state
  #scrollTimeMs = 0;      // virtual time in ms that the playhead represents
  #basePixelsPerMs = 0.08; // fixed rate for data rendering
  #speedMultiplier = 1;    // affects scroll accumulation only
  #speedIndex = DEFAULT_SPEED_INDEX;
  #lastFrameTime = 0;

  // Auto-range: track detected pitch to adjust Y range
  #autoRange = true;
  #detectedMidiMin = 60;  // C4
  #detectedMidiMax = 72;  // C5
  #yOffset = 0;           // manual scroll offset in semitones

  // Data
  #buffer = null;

  // Scale overlay
  #scaleRoot = null;
  #scaleKey = null;
  #scaleNotes = null;

  // Tap-to-play: stored label positions for hit detection
  #labelHitTargets = [];  // Array of { midi, y, areaLeft, areaRight }
  #tappedMidi = null;     // Currently highlighted (tapped) MIDI note
  #tapFlashTimer = null;  // Timer to clear the tap highlight
  #droneHandle = null;    // Active drone { stop } from sustained press
  #droneMidi = null;      // MIDI of currently droning note

  // Noise filter: confirmation buffer to reject single-frame spikes
  #pendingPoint = null;   // Most recent unconfirmed pitch reading
  #confirmCount = 0;      // Consecutive similar readings count
  #filteredData = [];     // Confirmed pitch points for rendering
  #filterStartTime = 0;   // Start time for relative timestamps in filtered data

  // Noise filter: required consecutive similar readings before a point is confirmed
  static #CONFIRM_THRESHOLD = 2;
  // Noise filter: maximum MIDI distance to consider readings "similar" (1 semitone)
  static #SIMILAR_THRESHOLD = 1.0;

  // Colors
  static #BG = '#0d0d0d';
  static #GRID_LINE = '#1f1f1f';
  static #GRID_LINE_C = '#333';
  static #LABEL_TEXT = '#666';
  static #LABEL_TEXT_ACTIVE = '#f0f0f0';
  static #SCALE_HIGHLIGHT = 'rgba(78, 205, 196, 0.04)';
  static #PITCH_DOT = '#4ecdc4';
  static #PITCH_DOT_OFF = '#ffe66d';
  static #PITCH_LINE = 'rgba(78, 205, 196, 0.35)';
  static #CURRENT_NOTE_BG = 'rgba(78, 205, 196, 0.08)';
  static #PLAYHEAD = 'rgba(78, 205, 196, 0.3)';

  constructor(canvas, buffer) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#buffer = buffer;
    this.#resize();

    this._resizeHandler = () => {
      this.#resize();
      if (!this.#active) this.drawStatic();
    };
    window.addEventListener('resize', this._resizeHandler);

    // Scroll to pan Y range
    this._wheelHandler = (e) => {
      e.preventDefault();
      this.#yOffset += e.deltaY > 0 ? -2 : 2;
      this.#yOffset = Math.max(-24, Math.min(24, this.#yOffset));
      this.#updateRange();
    };
    this.#canvas.addEventListener('wheel', this._wheelHandler, { passive: false });

    // Press-and-hold note labels to drone continuously (release to stop)
    this._pointerDownHandler = (e) => this.#handleLabelDown(e);
    this._pointerUpHandler = () => this.#handleLabelUp();
    this.#canvas.addEventListener('pointerdown', this._pointerDownHandler);
    this.#canvas.addEventListener('pointerup', this._pointerUpHandler);
    this.#canvas.addEventListener('pointerleave', this._pointerUpHandler);
    this.#canvas.addEventListener('pointercancel', this._pointerUpHandler);

    // Noise filter: subscribe to pitch/silence events
    this._filterPitchHandler = (data) => this.#filterPitch(data);
    this._filterSilenceHandler = () => this.#filterSilence();
    bus.on('pitch', this._filterPitchHandler);
    bus.on('silence', this._filterSilenceHandler);

    // Cursor hint: pointer when hovering over label areas
    this._mousemoveHandler = (e) => {
      const rect = this.#canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const inLabelArea = x < LABEL_WIDTH || x > (this.#width - LABEL_WIDTH);
      this.#canvas.style.cursor = inLabelArea ? 'pointer' : '';
    };
    this.#canvas.addEventListener('mousemove', this._mousemoveHandler);
  }

  #filterPitch(data) {
    if (!this.#active) return;

    const newMidi = data.midi;
    const relativeTime = performance.now() - this.#filterStartTime;

    if (this.#pendingPoint && Math.abs(newMidi - this.#pendingPoint.midi) < PitchGraph.#SIMILAR_THRESHOLD) {
      // Similar to pending — increment confirmation
      this.#confirmCount++;
      if (this.#confirmCount >= PitchGraph.#CONFIRM_THRESHOLD) {
        // Confirmed — add pending point to filtered data
        this.#filteredData.push(this.#pendingPoint);
        // Trim to prevent unbounded growth (match PitchBuffer MAX_SIZE)
        if (this.#filteredData.length > 4096) {
          this.#filteredData.shift();
        }
        // Current reading starts the next confirmation chain
        this.#pendingPoint = {
          midi: newMidi,
          time: relativeTime,
          frequency: data.frequency,
          cents: data.cents,
          clarity: data.clarity,
          silent: false,
        };
        this.#confirmCount = 1;
      }
    } else {
      // Different from pending — start new pending
      this.#pendingPoint = {
        midi: newMidi,
        time: relativeTime,
        frequency: data.frequency,
        cents: data.cents,
        clarity: data.clarity,
        silent: false,
      };
      this.#confirmCount = 1;
    }
  }

  #filterSilence() {
    if (!this.#active) return;

    // Clear pending state so stale points don't bleed across silence gaps
    this.#pendingPoint = null;
    this.#confirmCount = 0;

    // Add silence marker to filtered data (matching PitchBuffer behavior)
    const last = this.#filteredData[this.#filteredData.length - 1];
    if (last && last.silent) return;
    this.#filteredData.push({
      time: performance.now() - this.#filterStartTime,
      silent: true,
    });
    if (this.#filteredData.length > 4096) {
      this.#filteredData.shift();
    }
  }

  #handleLabelDown(e) {
    const rect = this.#canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Find closest label
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
    if (!closestTarget || closestDist > semitoneHeight * 0.6) return;

    // Stop any existing drone
    this.#stopDrone();

    // Ensure AudioContext exists — if it doesn't yet, start it then play
    // (first tap may have slight delay, subsequent taps are instant)
    if (!mic.audioContext || mic.audioContext.state === 'suspended') {
      mic.ensureAudioContext().then(() => {
        this.#startLabelDrone(closestTarget.midi);
      });
    } else {
      this.#startLabelDrone(closestTarget.midi);
    }
  }

  #startLabelDrone(midi) {
    this.#droneHandle = playNote(midi, 120000, { voice: 'triangle', gain: 0.7 });
    this.#droneMidi = midi;

    // Visual feedback: highlight the droning note
    if (this.#tapFlashTimer) clearTimeout(this.#tapFlashTimer);
    this.#tappedMidi = midi;
    if (!this.#active) this.drawStatic();
  }

  #handleLabelUp() {
    if (!this.#droneHandle) return;

    this.#stopDrone();

    // Clear visual highlight after brief delay
    this.#tapFlashTimer = setTimeout(() => {
      this.#tappedMidi = null;
      if (!this.#active) this.drawStatic();
      this.#tapFlashTimer = null;
    }, 150);
  }

  #stopDrone() {
    if (this.#droneHandle) {
      this.#droneHandle.stop();
      this.#droneHandle = null;
      this.#droneMidi = null;
    }
  }

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

  start() {
    if (this.#active) return;
    this.#active = true;
    this.#scrollTimeMs = 0;
    this.#lastFrameTime = performance.now();
    this.#detectedMidiMin = 60;
    this.#detectedMidiMax = 72;
    this.#yOffset = 0;
    // Reset noise filter state
    this.#pendingPoint = null;
    this.#confirmCount = 0;
    this.#filteredData = [];
    this.#filterStartTime = performance.now();
    this.#updateRange();
    this.#animate();
  }

  stop() {
    this.#active = false;
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  // Stop animation loop but preserve state (for tab switching)
  stopRendering() {
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  setSpeed(index) {
    this.#speedIndex = Math.max(0, Math.min(SCROLL_SPEEDS.length - 1, index));
    this.#speedMultiplier = SCROLL_SPEEDS[this.#speedIndex];
  }

  get speedIndex() {
    return this.#speedIndex;
  }

  get speedLabel() {
    return `${SCROLL_SPEEDS[this.#speedIndex]}x`;
  }

  setScale(rootName, scaleKey) {
    if (rootName && scaleKey) {
      this.#scaleRoot = rootName;
      this.#scaleKey = scaleKey;
      this.#scaleNotes = getScaleNotes(rootName, scaleKey);
    } else {
      this.#scaleRoot = null;
      this.#scaleKey = null;
      this.#scaleNotes = null;
    }
    // Redraw immediately so scale shows without needing mic active
    if (!this.#active) this.drawStatic();
  }

  setRange(lowMidi, highMidi) {
    this.#midiLow = Math.max(MIN_MIDI, lowMidi);
    this.#midiHigh = Math.min(MAX_MIDI, highMidi);
    this.#semitoneRange = this.#midiHigh - this.#midiLow;
  }

  #updateRange() {
    const padding = 4;
    const low = this.#detectedMidiMin - padding + this.#yOffset;
    const high = this.#detectedMidiMax + padding + this.#yOffset;
    // Minimum 2 octave range
    const range = high - low;
    if (range < 24) {
      const center = (low + high) / 2;
      this.setRange(Math.round(center - 12), Math.round(center + 12));
    } else {
      this.setRange(Math.round(low), Math.round(high));
    }
  }

  #updateAutoRange() {
    const data = this.#buffer?.data;
    if (!data || data.length === 0) return;

    // Check recent data points for range
    let changed = false;
    const lookback = Math.min(data.length, 200);
    for (let i = data.length - lookback; i < data.length; i++) {
      const point = data[i];
      if (point.silent) continue;
      if (point.midi < this.#detectedMidiMin) {
        this.#detectedMidiMin = point.midi;
        changed = true;
      }
      if (point.midi > this.#detectedMidiMax) {
        this.#detectedMidiMax = point.midi;
        changed = true;
      }
    }
    if (changed) this.#updateRange();
  }

  // Convert MIDI note to Y position on canvas
  #midiToY(midi) {
    const graphH = this.#height;
    const ratio = (midi - this.#midiLow) / this.#semitoneRange;
    return graphH - ratio * graphH;
  }

  #animate() {
    if (!this.#active) return;

    const now = performance.now();
    const dt = now - this.#lastFrameTime;
    this.#lastFrameTime = now;

    this.#scrollTimeMs += dt * this.#speedMultiplier;

    // Auto-range: expand Y range based on detected pitch
    if (this.#autoRange) {
      this.#updateAutoRange();
    }

    this.#draw();
    this.#rafId = requestAnimationFrame(() => this.#animate());
  }

  #draw() {
    const ctx = this.#ctx;
    const w = this.#width;
    const h = this.#height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PitchGraph.#BG;
    ctx.fillRect(0, 0, w, h);

    const graphLeft = LABEL_WIDTH;
    const graphRight = w - LABEL_WIDTH;
    const graphW = graphRight - graphLeft;
    const playheadX = graphRight - 60;

    // Clear hit targets before redrawing labels
    this.#labelHitTargets = [];

    // Clipping region for graph area
    ctx.save();
    ctx.beginPath();
    ctx.rect(graphLeft, 0, graphW, h);
    ctx.clip();

    // Draw grid lines and scale highlights
    this.#drawGrid(ctx, graphLeft, graphRight, h);

    // Draw pitch data
    this.#drawPitch(ctx, graphLeft, playheadX, h);

    ctx.restore();

    // Draw labels on both sides
    this.#drawLabels(ctx, 0, LABEL_WIDTH, h, 'right');
    this.#drawLabels(ctx, graphRight, w, h, 'left');

    // Draw playhead line
    ctx.strokeStyle = PitchGraph.#PLAYHEAD;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw separator lines between labels and graph
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphLeft, 0);
    ctx.lineTo(graphLeft, h);
    ctx.moveTo(graphRight, 0);
    ctx.lineTo(graphRight, h);
    ctx.stroke();
  }

  #drawGrid(ctx, left, right, h) {
    const graphW = right - left;

    for (let midi = this.#midiLow; midi <= this.#midiHigh; midi++) {
      const y = this.#midiToY(midi);
      const noteIndex = ((midi % 12) + 12) % 12;
      const isC = noteIndex === 0;
      const isE = noteIndex === 4;
      const isB = noteIndex === 11;

      // Scale highlight bands
      if (this.#scaleNotes && this.#scaleNotes.has(noteIndex)) {
        const yTop = this.#midiToY(midi + 0.5);
        const yBot = this.#midiToY(midi - 0.5);
        ctx.fillStyle = PitchGraph.#SCALE_HIGHLIGHT;
        ctx.fillRect(left, yTop, graphW, yBot - yTop);
      }

      // Grid lines — C notes are bold, E/B are subtle divisions
      if (isC) {
        ctx.strokeStyle = PitchGraph.#GRID_LINE_C;
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = PitchGraph.#GRID_LINE;
        ctx.lineWidth = 0.5;
      }

      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
  }

  #drawLabels(ctx, areaLeft, areaRight, h, align) {
    const areaW = areaRight - areaLeft;
    const padding = 8;

    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // Background for label column
    ctx.fillStyle = PitchGraph.#BG;
    ctx.fillRect(areaLeft, 0, areaW, h);

    // Get current detected note for highlighting
    const bufData = this.#buffer?.data;
    let currentMidi = null;
    if (bufData && bufData.length > 0) {
      const last = bufData[bufData.length - 1];
      if (!last.silent) currentMidi = last.midi;
    }

    for (let midi = this.#midiLow; midi <= this.#midiHigh; midi++) {
      const y = this.#midiToY(midi);
      const noteIndex = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIndex];
      const isC = noteIndex === 0;
      const isNatural = !noteName.includes('#');
      const isCurrent = currentMidi === midi;
      const isTapped = this.#tappedMidi === midi;

      // Only label naturals + C octave markers to avoid clutter
      if (!isNatural && !isCurrent) continue;

      // Store hit target for tap-to-play
      this.#labelHitTargets.push({ midi, y, areaLeft, areaRight });

      // Tap flash highlight
      if (isTapped) {
        const yTop = this.#midiToY(midi + 0.5);
        const yBot = this.#midiToY(midi - 0.5);
        ctx.fillStyle = 'rgba(78, 205, 196, 0.18)';
        ctx.fillRect(areaLeft, yTop, areaW, yBot - yTop);
      }

      // Current note highlight
      if (isCurrent) {
        const yTop = this.#midiToY(midi + 0.5);
        const yBot = this.#midiToY(midi - 0.5);
        ctx.fillStyle = PitchGraph.#CURRENT_NOTE_BG;
        ctx.fillRect(areaLeft, yTop, areaW, yBot - yTop);
      }

      // Label text
      const label = isC ? `${noteName}${octave}` : noteName;
      ctx.fillStyle = isTapped ? '#4ecdc4'
        : isCurrent ? PitchGraph.#LABEL_TEXT_ACTIVE
        : isC ? '#999'
        : PitchGraph.#LABEL_TEXT;
      ctx.font = isTapped ? 'bold 12px system-ui, sans-serif'
        : isCurrent ? 'bold 12px system-ui, sans-serif'
        : isC ? 'bold 11px system-ui, sans-serif'
        : '11px system-ui, sans-serif';

      if (align === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(label, areaRight - padding, y);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(label, areaLeft + padding, y);
      }
    }
  }

  #drawPitch(ctx, graphLeft, playheadX, h) {
    const data = this.#filteredData;
    if (!data || data.length === 0) return;

    // The playhead represents the current scroll time.
    // Points are positioned by their time offset from the scroll time.
    const currentTimeMs = this.#scrollTimeMs;

    let prevX = null;
    let prevY = null;

    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      if (point.silent) {
        prevX = null;
        prevY = null;
        continue;
      }

      // Map time to X: playhead = currentTimeMs, older = to the left
      const age = currentTimeMs - point.time;
      const x = playheadX - age * this.#basePixelsPerMs;

      // Skip if off-screen
      if (x < graphLeft - 10) continue;
      if (x > playheadX + 10) continue;

      // Map fractional MIDI to Y
      const exactMidi = frequencyToMidi(point.frequency);
      const y = this.#midiToY(exactMidi);

      // Skip if outside vertical range
      if (y < -10 || y > h + 10) {
        prevX = null;
        prevY = null;
        continue;
      }

      // Draw connecting line
      if (prevX !== null && prevY !== null) {
        const dist = Math.abs(x - prevX);
        if (dist < 50) {
          ctx.strokeStyle = PitchGraph.#PITCH_LINE;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }

      // Draw dot
      const absCents = Math.abs(point.cents);
      ctx.fillStyle = absCents <= 10 ? PitchGraph.#PITCH_DOT
        : absCents <= 25 ? PitchGraph.#PITCH_DOT_OFF
        : '#ff6b6b';

      const dotSize = absCents <= 10 ? 3 : 2.5;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();

      prevX = x;
      prevY = y;
    }
  }

  drawStatic() {
    this.#draw();
  }

  destroy() {
    this.stop();
    if (this.#tapFlashTimer) {
      clearTimeout(this.#tapFlashTimer);
      this.#tapFlashTimer = null;
    }
    this.#stopDrone();
    bus.off('pitch', this._filterPitchHandler);
    bus.off('silence', this._filterSilenceHandler);
    window.removeEventListener('resize', this._resizeHandler);
    this.#canvas.removeEventListener('wheel', this._wheelHandler);
    this.#canvas.removeEventListener('pointerdown', this._pointerDownHandler);
    this.#canvas.removeEventListener('pointerup', this._pointerUpHandler);
    this.#canvas.removeEventListener('pointerleave', this._pointerUpHandler);
    this.#canvas.removeEventListener('pointercancel', this._pointerUpHandler);
    this.#canvas.removeEventListener('mousemove', this._mousemoveHandler);
    this.#canvas = null;
    this.#ctx = null;
    this.#buffer = null;
    this.#filteredData = [];
    this.#pendingPoint = null;
  }
}
