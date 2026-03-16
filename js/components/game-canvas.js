import { NOTE_NAMES } from '../utils/constants.js';
import { frequencyToMidi } from '../audio/note-math.js';
import { bus } from '../utils/event-bus.js';

const LABEL_WIDTH = 52;
const PLAYZONE_X_RATIO = 0.25; // play zone is 25% from left

export class GameCanvas {
  #canvas;
  #ctx;
  #dpr;
  #width = 0;
  #height = 0;
  #rafId = null;
  #active = false;

  // Song data
  #timings = [];
  #midiLow = 48;
  #midiHigh = 72;
  #semitoneRange = 24;
  #totalDurationMs = 0;

  // Playback state
  #elapsed = 0;
  #pixelsPerMs = 0.15;

  // Per-note feedback state
  #noteFeedback = new Map(); // noteIndex → { absCents, inTune, close }
  #noteScores = new Map();   // noteIndex → score (0-100), set when note completes

  // Player pitch trail
  #pitchTrail = [];
  #maxTrail = 500;

  // Colors
  static #BG = '#0d0d0d';
  static #GRID_LINE = '#1a1a1a';
  static #GRID_LINE_C = '#2a2a2a';
  static #LABEL_TEXT = '#555';
  static #BAR_DEFAULT = 'rgba(78, 205, 196, 0.2)';
  static #BAR_BORDER = 'rgba(78, 205, 196, 0.4)';
  static #BAR_IN_TUNE = 'rgba(78, 205, 196, 0.45)';
  static #BAR_CLOSE = 'rgba(255, 230, 109, 0.35)';
  static #BAR_OFF = 'rgba(255, 107, 107, 0.3)';
  static #PITCH_DOT = '#f0f0f0';
  static #PLAYZONE_LINE = 'rgba(78, 205, 196, 0.25)';
  static #LYRIC_TEXT = '#999';

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#resize();

    this._resizeHandler = () => this.#resize();
    window.addEventListener('resize', this._resizeHandler);

    bus.on('song:note-feedback', this.#onFeedback);
    bus.on('song:note-complete', this.#onNoteComplete);
    bus.on('pitch', this.#onPitch);
    bus.on('silence', this.#onSilence);
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

  loadSong(timings, midiLow, midiHigh, totalDuration) {
    this.#timings = timings;
    this.#midiLow = midiLow - 2; // add padding
    this.#midiHigh = midiHigh + 2;
    this.#semitoneRange = this.#midiHigh - this.#midiLow;
    this.#totalDurationMs = totalDuration;
    this.#noteFeedback.clear();
    this.#noteScores.clear();
    this.#pitchTrail = [];
  }

  start() {
    if (this.#active) return;
    this.#active = true;
    this.#pitchTrail = [];
    this.#noteFeedback.clear();
    this.#animate();
  }

  stop() {
    this.#active = false;
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  updateElapsed(ms) {
    this.#elapsed = ms;
  }

  setScrollSpeed(pxPerMs) {
    this.#pixelsPerMs = pxPerMs;
  }

  get scrollSpeed() {
    return this.#pixelsPerMs;
  }

  #midiToY(midi) {
    const ratio = (midi - this.#midiLow) / this.#semitoneRange;
    return this.#height - ratio * this.#height;
  }

  // Convert song time (ms) to X position.
  // The play zone is a fixed X position. Notes scroll right-to-left toward it.
  // scrollSpeed affects how fast bars approach but NOT their visual width.
  #timeToX(timeMs) {
    const graphLeft = LABEL_WIDTH;
    const graphW = this.#width - LABEL_WIDTH * 2;
    const playZoneX = graphLeft + graphW * PLAYZONE_X_RATIO;
    return playZoneX + (timeMs - this.#elapsed) * this.#pixelsPerMs;
  }

  #onFeedback = (data) => {
    this.#noteFeedback.set(data.noteIndex, data);
  };

  #onNoteComplete = (data) => {
    this.#noteScores.set(data.noteIndex, data.score);
  };

  #onPitch = (data) => {
    if (!this.#active) return;
    const exactMidi = frequencyToMidi(data.frequency);
    this.#pitchTrail.push({
      time: this.#elapsed,
      midi: exactMidi,
      cents: data.cents,
    });
    if (this.#pitchTrail.length > this.#maxTrail) {
      this.#pitchTrail.shift();
    }
  };

  #onSilence = () => {
    if (!this.#active) return;
    this.#pitchTrail.push({ time: this.#elapsed, midi: null });
    if (this.#pitchTrail.length > this.#maxTrail) {
      this.#pitchTrail.shift();
    }
  };

  #animate() {
    if (!this.#active) return;
    this.#draw();
    this.#rafId = requestAnimationFrame(() => this.#animate());
  }

  #draw() {
    const ctx = this.#ctx;
    const w = this.#width;
    const h = this.#height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = GameCanvas.#BG;
    ctx.fillRect(0, 0, w, h);

    const graphLeft = LABEL_WIDTH;
    const graphRight = w - LABEL_WIDTH;
    const graphW = graphRight - graphLeft;
    const playZoneX = graphLeft + graphW * PLAYZONE_X_RATIO;

    // Clip to graph area
    ctx.save();
    ctx.beginPath();
    ctx.rect(graphLeft, 0, graphW, h);
    ctx.clip();

    // Grid
    this.#drawGrid(ctx, graphLeft, graphRight, h);

    // Target bars
    this.#drawBars(ctx, graphLeft, graphRight, h, playZoneX);

    // Player pitch trail
    this.#drawPitchTrail(ctx, graphLeft, graphRight, h);

    ctx.restore();

    // Labels
    this.#drawLabels(ctx, 0, LABEL_WIDTH, h, 'right');
    this.#drawLabels(ctx, graphRight, w, h, 'left');

    // Play zone line
    ctx.strokeStyle = GameCanvas.#PLAYZONE_LINE;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(playZoneX, 0);
    ctx.lineTo(playZoneX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Separators
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
    for (let midi = this.#midiLow; midi <= this.#midiHigh; midi++) {
      const y = this.#midiToY(midi);
      const noteIndex = ((midi % 12) + 12) % 12;
      const isC = noteIndex === 0;

      ctx.strokeStyle = isC ? GameCanvas.#GRID_LINE_C : GameCanvas.#GRID_LINE;
      ctx.lineWidth = isC ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
  }

  #drawBars(ctx, graphLeft, graphRight, h, playZoneX) {
    for (const t of this.#timings) {
      const x1 = this.#timeToX(t.startMs);
      const x2 = this.#timeToX(t.endMs);

      // Skip if fully off-screen
      if (x2 < graphLeft || x1 > graphRight + 200) continue;

      const yTop = this.#midiToY(t.midi + 0.4);
      const yBot = this.#midiToY(t.midi - 0.4);
      const barH = yBot - yTop;
      const barW = x2 - x1;

      // Determine bar color from feedback
      const fb = this.#noteFeedback.get(t.index);
      let fillColor = GameCanvas.#BAR_DEFAULT;
      let borderColor = GameCanvas.#BAR_BORDER;

      if (fb) {
        if (fb.inTune) {
          fillColor = GameCanvas.#BAR_IN_TUNE;
          borderColor = '#4ecdc4';
        } else if (fb.close) {
          fillColor = GameCanvas.#BAR_CLOSE;
          borderColor = '#ffe66d';
        } else {
          fillColor = GameCanvas.#BAR_OFF;
          borderColor = '#ff6b6b';
        }
      }

      // Bar fill
      ctx.fillStyle = fillColor;
      ctx.fillRect(x1, yTop, barW, barH);

      // Bar border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, yTop, barW, barH);

      // Note name inside bar
      if (barW > 30) {
        ctx.fillStyle = '#ccc';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.noteStr, x1 + 6, yTop + barH / 2);
      }

      // Lyric below bar
      if (t.lyric && barW > 20) {
        ctx.fillStyle = GameCanvas.#LYRIC_TEXT;
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(t.lyric, x1 + barW / 2, yBot + 4);
      }

      // Score badge on completed notes
      const noteScore = this.#noteScores.get(t.index);
      if (noteScore !== undefined) {
        const badgeX = x1 + barW / 2;
        const badgeY = yTop - 2;
        const badgeR = 11;

        // Badge circle
        let badgeBg, badgeText;
        if (noteScore >= 80) {
          badgeBg = '#4ecdc4';
          badgeText = '#0d0d0d';
        } else if (noteScore >= 50) {
          badgeBg = '#ffe66d';
          badgeText = '#0d0d0d';
        } else {
          badgeBg = '#ff6b6b';
          badgeText = '#fff';
        }

        ctx.fillStyle = badgeBg;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
        ctx.fill();

        // Score text
        ctx.fillStyle = badgeText;
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteScore, badgeX, badgeY);
      }
    }
  }

  #drawPitchTrail(ctx, graphLeft, graphRight, h) {
    let prevX = null;
    let prevY = null;

    for (const p of this.#pitchTrail) {
      if (p.midi === null) {
        prevX = null;
        prevY = null;
        continue;
      }

      const x = this.#timeToX(p.time);
      if (x < graphLeft - 10 || x > graphRight + 10) {
        prevX = null;
        prevY = null;
        continue;
      }

      const y = this.#midiToY(p.midi);
      if (y < -10 || y > h + 10) {
        prevX = null;
        prevY = null;
        continue;
      }

      // Connecting line
      if (prevX !== null && Math.abs(x - prevX) < 40) {
        ctx.strokeStyle = 'rgba(240, 240, 240, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Dot
      ctx.fillStyle = GameCanvas.#PITCH_DOT;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      prevX = x;
      prevY = y;
    }
  }

  #drawLabels(ctx, areaLeft, areaRight, h, align) {
    const padding = 8;
    ctx.fillStyle = GameCanvas.#BG;
    ctx.fillRect(areaLeft, 0, areaRight - areaLeft, h);

    ctx.textBaseline = 'middle';

    for (let midi = this.#midiLow; midi <= this.#midiHigh; midi++) {
      const y = this.#midiToY(midi);
      const noteIndex = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIndex];
      const isC = noteIndex === 0;
      const isNatural = !noteName.includes('#');

      if (!isNatural) continue;

      const label = isC ? `${noteName}${octave}` : noteName;
      ctx.fillStyle = isC ? '#999' : GameCanvas.#LABEL_TEXT;
      ctx.font = isC ? 'bold 11px system-ui, sans-serif' : '11px system-ui, sans-serif';

      if (align === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(label, areaRight - padding, y);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(label, areaLeft + padding, y);
      }
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
    bus.off('song:note-feedback', this.#onFeedback);
    bus.off('song:note-complete', this.#onNoteComplete);
    bus.off('pitch', this.#onPitch);
    bus.off('silence', this.#onSilence);
    this.#canvas = null;
    this.#ctx = null;
  }
}
