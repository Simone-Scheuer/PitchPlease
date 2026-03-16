/**
 * renderer-base.js — Shared canvas utilities and renderer interface definition.
 *
 * This is a utility module, NOT a base class. Renderers import these
 * functions to set up canvases, convert cents to colors, and draw note
 * labels. They don't extend or inherit from anything.
 *
 * Pure utility module — no state, no event bus, no side effects.
 */

// ---------------------------------------------------------------------------
// Color constants (matching css/tokens.css)
// ---------------------------------------------------------------------------

export const COLORS = Object.freeze({
  BG:          '#0d0d0d',
  BG_ELEVATED: '#1a1a1a',
  BG_SURFACE:  '#242424',
  TEXT:        '#f0f0f0',
  TEXT_DIM:    '#666',
  TEXT_MUTED:  '#999',
  ACCENT:     '#4ecdc4',
  ACCENT_DIM: 'rgba(78, 205, 196, 0.15)',
  IN_TUNE:    '#4ecdc4',
  CLOSE:      '#ffe66d',
  OFF:        '#ff6b6b',
  BORDER:     '#333',
  GRID:       '#1a1a1a',
  GRID_BOLD:  '#2a2a2a',
});

// Alpha variants for bars and overlays
export const COLORS_ALPHA = Object.freeze({
  BAR_DEFAULT:  'rgba(78, 205, 196, 0.2)',
  BAR_BORDER:   'rgba(78, 205, 196, 0.4)',
  BAR_IN_TUNE:  'rgba(78, 205, 196, 0.45)',
  BAR_CLOSE:    'rgba(255, 230, 109, 0.35)',
  BAR_OFF:      'rgba(255, 107, 107, 0.3)',
  PLAYZONE:     'rgba(78, 205, 196, 0.25)',
});

// ---------------------------------------------------------------------------
// Font constants (matching css/tokens.css)
// ---------------------------------------------------------------------------

export const FONTS = Object.freeze({
  FAMILY: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  MONO: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
});

// ---------------------------------------------------------------------------
// Cents thresholds
// ---------------------------------------------------------------------------

export const CENTS_THRESHOLD = Object.freeze({
  IN_TUNE: 10,
  CLOSE: 25,
});

// ---------------------------------------------------------------------------
// Canvas setup & resize
// ---------------------------------------------------------------------------

/**
 * Set up a canvas element with DPI scaling for crisp rendering.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number }}
 */
export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  return { canvas, ctx, width, height, dpr };
}

/**
 * Resize a canvas to its current container dimensions with DPI scaling.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @returns {{ width: number, height: number, dpr: number }}
 */
export function resizeCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  return { width, height, dpr };
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/**
 * Convert absolute cents deviation to a CSS color string.
 * Uses the app's standard accuracy color scheme:
 *   ≤10 cents → green (in tune)
 *   ≤25 cents → yellow (close)
 *   >25 cents → red (off)
 *
 * @param {number} absCents - Absolute cents deviation from target
 * @returns {string} CSS color string
 */
export function centsToColor(absCents) {
  if (absCents <= CENTS_THRESHOLD.IN_TUNE) return COLORS.IN_TUNE;
  if (absCents <= CENTS_THRESHOLD.CLOSE) return COLORS.CLOSE;
  return COLORS.OFF;
}

/**
 * Convert absolute cents to a bar fill color (alpha variant for overlays).
 *
 * @param {number} absCents
 * @returns {string} CSS color string with alpha
 */
export function centsToBarColor(absCents) {
  if (absCents <= CENTS_THRESHOLD.IN_TUNE) return COLORS_ALPHA.BAR_IN_TUNE;
  if (absCents <= CENTS_THRESHOLD.CLOSE) return COLORS_ALPHA.BAR_CLOSE;
  return COLORS_ALPHA.BAR_OFF;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/**
 * Draw a note label (e.g., "C4", "F#3") at the specified position.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} note - Note name (e.g., "C", "F#")
 * @param {number} octave
 * @param {number} x
 * @param {number} y
 * @param {Object} [opts]
 * @param {number} [opts.fontSize=11]
 * @param {string} [opts.color] - defaults to COLORS.TEXT_DIM
 * @param {string} [opts.align='left'] - 'left', 'center', 'right'
 * @param {string} [opts.baseline='middle']
 */
export function drawNoteLabel(ctx, note, octave, x, y, opts = {}) {
  const fontSize = opts.fontSize ?? 11;
  const color = opts.color ?? COLORS.TEXT_DIM;
  const align = opts.align ?? 'left';
  const baseline = opts.baseline ?? 'middle';

  ctx.save();
  ctx.font = `${fontSize}px ${FONTS.MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(`${note}${octave}`, x, y);
  ctx.restore();
}

/**
 * Draw a large centered text string (for countdowns, note names, etc.).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} centerX
 * @param {number} centerY
 * @param {Object} [opts]
 * @param {number} [opts.fontSize=72]
 * @param {string} [opts.color] - defaults to COLORS.TEXT
 * @param {string} [opts.font] - defaults to FONTS.FAMILY
 */
export function drawCenteredText(ctx, text, centerX, centerY, opts = {}) {
  const fontSize = opts.fontSize ?? 72;
  const color = opts.color ?? COLORS.TEXT;
  const font = opts.font ?? FONTS.FAMILY;

  ctx.save();
  ctx.font = `bold ${fontSize}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
}

/**
 * Draw a countdown overlay — large number centered on the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} secondsLeft
 * @param {number} width - canvas CSS width
 * @param {number} height - canvas CSS height
 */
export function drawCountdown(ctx, secondsLeft, width, height) {
  // Semi-transparent overlay
  ctx.fillStyle = 'rgba(13, 13, 13, 0.7)';
  ctx.fillRect(0, 0, width, height);

  drawCenteredText(ctx, String(secondsLeft), width / 2, height / 2, {
    fontSize: Math.min(width, height) * 0.3,
    color: COLORS.ACCENT,
  });
}

/**
 * Clear the entire canvas with the background color.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
export function clearCanvas(ctx, width, height) {
  ctx.fillStyle = COLORS.BG;
  ctx.fillRect(0, 0, width, height);
}

// ---------------------------------------------------------------------------
// MIDI helpers for renderers
// ---------------------------------------------------------------------------

/**
 * Map a MIDI note number to a Y position within a range.
 *
 * @param {number} midi - MIDI note number (can be fractional)
 * @param {number} midiLow - Lowest MIDI in range
 * @param {number} midiHigh - Highest MIDI in range
 * @param {number} height - Canvas height
 * @param {number} [padding=0] - Top/bottom padding
 * @returns {number} Y position (higher MIDI = lower Y, piano-style)
 */
export function midiToY(midi, midiLow, midiHigh, height, padding = 0) {
  const range = midiHigh - midiLow;
  if (range === 0) return height / 2;
  const ratio = (midi - midiLow) / range;
  const drawHeight = height - padding * 2;
  return height - padding - ratio * drawHeight;
}

// ---------------------------------------------------------------------------
// Renderer interface documentation (JSDoc only — not enforced at runtime)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RendererInterface
 *
 * All renderers should implement these methods. The exercise runtime
 * calls them at the appropriate lifecycle points. Methods marked
 * (optional) may be omitted — the runtime uses optional chaining.
 *
 * @property {function(HTMLCanvasElement, Object): void} init
 *   Set up the canvas and exercise-specific state.
 *
 * @property {function(Object): void} start
 *   Called when the exercise begins running (after countdown).
 *   Receives the exercise config.
 *
 * @property {function(Object): void} update
 *   Called each rAF frame by the exercise runtime.
 *   Receives: { pitchData, targetNote, cursor, noteCount, elapsed,
 *              evaluatorResult, exerciseState, iteration }
 *
 * @property {function(): void} stop
 *   Halt rendering. May be called without destroy (e.g., pause).
 *
 * @property {function(): void} destroy
 *   Full cleanup — remove event listeners, release canvas context.
 *
 * @property {function(number): void} [onCountdown]
 *   Show countdown overlay. Receives secondsLeft.
 *
 * @property {function(): void} [onLoopRestart]
 *   Reset renderer state for next loop iteration.
 */
