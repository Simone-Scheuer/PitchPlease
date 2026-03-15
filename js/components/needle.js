import { CENTS_IN_TUNE, CENTS_CLOSE, SMOOTHING_FACTOR } from '../utils/constants.js';

export class Needle {
  #canvas;
  #ctx;
  #dpr;
  #width;
  #height;
  #displayCents = 0;
  #targetCents = 0;
  #rafId = null;
  #active = false;

  // Colors (matching CSS tokens)
  static #COLOR_IN_TUNE = '#4ecdc4';
  static #COLOR_CLOSE = '#ffe66d';
  static #COLOR_OFF = '#ff6b6b';
  static #COLOR_NEEDLE = '#f0f0f0';
  static #COLOR_SCALE = '#666';
  static #COLOR_SCALE_LABEL = '#999';
  static #COLOR_CENTER_ZONE = 'rgba(78, 205, 196, 0.08)';
  static #COLOR_CENTER_LINE = 'rgba(78, 205, 196, 0.4)';

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#resize();
    this.#drawIdle();

    // Handle resize — debounce to avoid excessive redraws
    this._resizeHandler = () => {
      this.#resize();
      this.#draw(this.#displayCents);
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  #resize() {
    this.#dpr = window.devicePixelRatio || 1;
    const rect = this.#canvas.getBoundingClientRect();
    this.#width = rect.width;
    this.#height = rect.height;
    this.#canvas.width = this.#width * this.#dpr;
    this.#canvas.height = this.#height * this.#dpr;
    this.#ctx.scale(this.#dpr, this.#dpr);
  }

  start() {
    if (this.#active) return;
    this.#active = true;
    this.#animate();
  }

  stop() {
    this.#active = false;
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#displayCents = 0;
    this.#targetCents = 0;
    this.#drawIdle();
  }

  update(cents) {
    this.#targetCents = cents;
    if (!this.#active) {
      this.start();
    }
  }

  #animate() {
    if (!this.#active) return;

    // Exponential smoothing
    this.#displayCents += (this.#targetCents - this.#displayCents) * SMOOTHING_FACTOR;

    // Snap to zero if very close (avoids perpetual micro-movement)
    if (Math.abs(this.#displayCents) < 0.1 && Math.abs(this.#targetCents) < 0.1) {
      this.#displayCents = 0;
    }

    this.#draw(this.#displayCents);
    this.#rafId = requestAnimationFrame(() => this.#animate());
  }

  #centsToX(cents) {
    // Map -50..+50 cents to padding...(width-padding)
    const padding = 32;
    const usable = this.#width - padding * 2;
    return padding + ((cents + 50) / 100) * usable;
  }

  #getColor(cents) {
    const abs = Math.abs(cents);
    if (abs <= CENTS_IN_TUNE) return Needle.#COLOR_IN_TUNE;
    if (abs <= CENTS_CLOSE) return Needle.#COLOR_CLOSE;
    return Needle.#COLOR_OFF;
  }

  #draw(cents) {
    const ctx = this.#ctx;
    const w = this.#width;
    const h = this.#height;

    ctx.clearRect(0, 0, w, h);

    const centerX = this.#centsToX(0);
    const needleX = this.#centsToX(cents);
    const barY = h * 0.5;
    const barHeight = 6;
    const scaleY = barY;

    // Draw center zone highlight (-10 to +10)
    const zoneLeft = this.#centsToX(-CENTS_IN_TUNE);
    const zoneRight = this.#centsToX(CENTS_IN_TUNE);
    ctx.fillStyle = Needle.#COLOR_CENTER_ZONE;
    ctx.fillRect(zoneLeft, barY - 20, zoneRight - zoneLeft, 40);

    // Draw scale marks
    const marks = [-50, -25, -10, 0, 10, 25, 50];
    const labelMarks = [-50, -25, 0, 25, 50];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${10}px system-ui, sans-serif`;

    for (const mark of marks) {
      const x = this.#centsToX(mark);
      const isMajor = labelMarks.includes(mark);
      const tickH = isMajor ? 12 : 8;

      ctx.strokeStyle = mark === 0 ? Needle.#COLOR_CENTER_LINE : Needle.#COLOR_SCALE;
      ctx.lineWidth = mark === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, scaleY - tickH);
      ctx.lineTo(x, scaleY + tickH);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = Needle.#COLOR_SCALE_LABEL;
        const label = mark === 0 ? '0' : (mark > 0 ? `+${mark}` : `${mark}`);
        ctx.fillText(label, x, scaleY + tickH + 4);
      }
    }

    // Draw deviation bar (from center to current position)
    const color = this.#getColor(cents);
    const barLeft = Math.min(centerX, needleX);
    const barWidth = Math.abs(needleX - centerX);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(barLeft, barY - barHeight / 2, barWidth, barHeight);
    ctx.globalAlpha = 1;

    // Draw needle line
    ctx.strokeStyle = Needle.#COLOR_NEEDLE;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(needleX, barY - 18);
    ctx.lineTo(needleX, barY + 18);
    ctx.stroke();

    // Draw needle dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(needleX, barY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw center diamond
    ctx.fillStyle = Needle.#COLOR_CENTER_LINE;
    ctx.beginPath();
    ctx.moveTo(centerX, barY - 6);
    ctx.lineTo(centerX + 4, barY);
    ctx.lineTo(centerX, barY + 6);
    ctx.lineTo(centerX - 4, barY);
    ctx.closePath();
    ctx.fill();
  }

  #drawIdle() {
    this.#draw(0);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
    this.#canvas = null;
    this.#ctx = null;
  }
}
