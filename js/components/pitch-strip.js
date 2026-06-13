import { NOTE_NAMES, CENTS_IN_TUNE, CENTS_CLOSE, SMOOTHING_FACTOR } from '../utils/constants.js';
import { themeColors } from '../utils/theme-colors.js';

// On-screen pixels per semitone, derived from canvas width then clamped so the
// strip stays readable on a phone and doesn't sprawl on desktop.
const MIN_PX_PER_SEMITONE = 44;
const MAX_PX_PER_SEMITONE = 96;
const TARGET_VISIBLE_SEMITONES = 7;

/**
 * Horizontal chromatic strip tuner visualizer.
 *
 * The fixed center crosshair IS the player's current pitch. The chromatic note
 * ticks scroll past it like a piano keyboard (low notes left, high notes right).
 * When the nearest note's tick lands on the crosshair (within CENTS_IN_TUNE) the
 * center turns green — "slide the tick onto the line." Sharp → the nearest tick
 * sits left of center (you've risen past it); flat → it sits right.
 *
 * Lifecycle mirrors the old Needle: start() / stop() / update(data|null) / destroy().
 */
export class PitchStrip {
  #canvas;
  #ctx;
  #dpr;
  #width;
  #height;
  #rafId = null;
  #active = false;

  #displayMidi = 60;   // smoothed continuous pitch that drives the scroll
  #targetMidi = 60;    // latest continuous pitch (rounded midi + cents/100)
  #hasTarget = false;  // is a pitch currently detected?
  #snapNext = false;   // jump (no scroll) on the first pitch after (re)start

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#resize();
    this.#draw();

    // Observe the canvas itself, not the window — the tuner view is display:none
    // at init (width 0), so we must re-measure the moment it becomes visible.
    this._observer = new ResizeObserver(() => {
      this.#resize();
      if (!this.#active) this.#draw();
    });
    this._observer.observe(this.#canvas);
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
    this.#snapNext = true;
    this.#animate();
  }

  stop() {
    this.#active = false;
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#hasTarget = false;
    this.#draw();
  }

  /** @param {{midi:number, cents:number}|null} data  null = silence / no pitch */
  update(data) {
    if (!data) {
      this.#hasTarget = false;
      return;
    }
    this.#targetMidi = data.midi + data.cents / 100;
    this.#hasTarget = true;
    if (!this.#active) this.start();
  }

  #pxPerSemitone() {
    return Math.max(MIN_PX_PER_SEMITONE,
      Math.min(MAX_PX_PER_SEMITONE, this.#width / TARGET_VISIBLE_SEMITONES));
  }

  #stateColor(cents) {
    const a = Math.abs(cents);
    if (a <= CENTS_IN_TUNE) return themeColors.inTune;
    if (a <= CENTS_CLOSE) return themeColors.close;
    return themeColors.off;
  }

  #animate() {
    if (!this.#active) return;

    if (this.#hasTarget) {
      if (this.#snapNext) {
        this.#displayMidi = this.#targetMidi;
        this.#snapNext = false;
      } else {
        this.#displayMidi += (this.#targetMidi - this.#displayMidi) * SMOOTHING_FACTOR;
      }
    }

    this.#draw();
    this.#rafId = requestAnimationFrame(() => this.#animate());
  }

  #draw() {
    const ctx = this.#ctx;
    const w = this.#width;
    const h = this.#height;
    const cx = w / 2;
    const pxps = this.#pxPerSemitone();
    const p = this.#displayMidi;
    const lit = this.#hasTarget;
    // Color from the smoothed position, not the raw reading, so the crosshair
    // doesn't flicker green/amber/red while it settles.
    const dispCents = (p - Math.round(p)) * 100;
    const color = lit ? this.#stateColor(dispCents) : themeColors.textDim;

    ctx.clearRect(0, 0, w, h);

    const axisY = h * 0.46;
    const labelY = axisY + 22;

    // In-tune pocket band around the center (±CENTS_IN_TUNE)
    const pocketHalf = (CENTS_IN_TUNE / 100) * pxps;
    ctx.fillStyle = themeColors.canvasCurrentNoteBg;
    ctx.fillRect(cx - pocketHalf, axisY - 30, pocketHalf * 2, 60);

    // Scrolling note ticks + labels
    const loMidi = Math.floor(p - (w / 2) / pxps) - 1;
    const hiMidi = Math.ceil(p + (w / 2) / pxps) + 1;
    const nearest = Math.round(p);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let m = loMidi; m <= hiMidi; m++) {
      const x = cx + (m - p) * pxps;
      if (x < -40 || x > w + 40) continue;

      const noteIdx = ((m % 12) + 12) % 12;
      const name = NOTE_NAMES[noteIdx];
      const octave = Math.floor(m / 12) - 1;
      const isNearest = lit && m === nearest;
      const isC = noteIdx === 0;

      const tickH = isNearest ? 22 : (isC ? 16 : 11);
      ctx.strokeStyle = isNearest ? color : (isC ? themeColors.canvasGridBold : themeColors.canvasGrid);
      ctx.lineWidth = isNearest ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, axisY - tickH);
      ctx.lineTo(x, axisY + tickH);
      ctx.stroke();

      ctx.font = isNearest ? '600 15px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillStyle = isNearest ? color : themeColors.textMuted;
      const label = (isNearest || isC) ? `${name}${octave}` : name;
      ctx.fillText(label, x, labelY);
    }

    // Center crosshair = the player's current pitch
    ctx.globalAlpha = lit ? 1 : 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, axisY - 34);
    ctx.lineTo(cx, axisY + 34);
    ctx.stroke();

    // Pointer cap on the crosshair
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - 6, axisY - 34);
    ctx.lineTo(cx + 6, axisY - 34);
    ctx.lineTo(cx, axisY - 27);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.stop();
    this._observer.disconnect();
    this.#canvas = null;
    this.#ctx = null;
  }
}
