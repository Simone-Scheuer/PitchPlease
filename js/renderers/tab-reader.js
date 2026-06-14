/**
 * tab-reader.js — Renderer for the harmonica tab trainer.
 *
 * A horizontal "breath ribbon": notes flow through a fixed playhead. Blow notes
 * ride above the centerline, draw notes below it — so the breath direction is
 * spatial, not just a symbol. The current note sits enlarged under the playhead
 * with a hold-progress ring that fills as you sustain it in tune; completed
 * notes dim off to the left, upcoming notes wait to the right.
 *
 * Implements the standard renderer interface (init/start/update/stop/destroy +
 * onCountdown/onLoopRestart). Driven entirely by the runtime's tickState, so it
 * can be exercised with synthetic pitch events — no mic required.
 *
 * Theme-aware: reads the live CSS custom properties so it tracks the dark
 * default AND the light theme, unlike the dark-locked COLORS constants.
 */

import { setupCanvas, resizeCanvas, drawCountdown } from './renderer-base.js';

const SLOT_W = 92;          // horizontal pixels per note
const PLAYHEAD_FRAC = 0.32; // playhead x as a fraction of width (room to read ahead)
const SCROLL_EASE = 0.22;   // lerp factor toward the target scroll position
const RING_R = 46;          // hold-progress ring radius around the current note

export function createTabReaderRenderer() {
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let resizeObserver = null;

  let notes = [];
  let holdTargetMs = 350;
  let theme = null;

  let scroll = 0;        // eased scroll position (in note-index units)
  let cursor = 0;
  let lastEval = null;   // cached so silence frames keep the last ring/colour
  let countdownValue = 0;

  const FONT = "'JetBrains Mono', 'SF Mono', monospace";

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
    return {
      bg:        v('--color-bg', '#0a0a0b'),
      surface:   v('--color-bg-surface', '#1c1c20'),
      elevated:  v('--color-bg-elevated', '#141416'),
      text:      v('--color-text', '#ececf0'),
      textDim:   v('--color-text-dim', '#5a5a66'),
      textMuted: v('--color-text-muted', '#8888a0'),
      accent:    v('--color-accent', '#4ecdc4'),
      inTune:    v('--color-in-tune', '#4ecdc4'),
      close:     v('--color-close', '#ffe66d'),
      off:       v('--color-off', '#ff6b6b'),
      border:    v('--color-border', 'rgba(255,255,255,0.08)'),
    };
  }

  function tuneColor(absCents) {
    if (absCents == null) return theme.textMuted;
    if (absCents <= 18) return theme.inTune;
    if (absCents <= 45) return theme.close;
    return theme.off;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Draw one note chip centered at (cx) on its blow/draw side. */
  function drawChip(note, cx, centerY, { active, done, absCents }) {
    const offset = height * 0.13;
    const cy = note.direction === 'blow' ? centerY - offset : centerY + offset;
    const w = active ? 76 : 58;
    const h = active ? 76 : 58;
    const r = 16;

    if (cx + w < 0 || cx - w > width) return; // off-screen cull

    const colour = active ? tuneColor(absCents) : (done ? theme.textDim : theme.textMuted);
    ctx.globalAlpha = done ? 0.4 : 1;

    // chip body
    roundRect(cx - w / 2, cy - h / 2, w, h, r);
    ctx.fillStyle = active ? theme.elevated : theme.surface;
    ctx.fill();
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeStyle = active ? colour : theme.border;
    ctx.stroke();

    // hole number
    ctx.fillStyle = active ? theme.text : theme.textMuted;
    ctx.font = `700 ${active ? 30 : 22}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(note.hole), cx, cy - (note.bendSteps ? 6 : 0));

    // bend marks
    if (note.bendSteps) {
      ctx.fillStyle = colour;
      ctx.font = `600 ${active ? 16 : 12}px ${FONT}`;
      ctx.fillText("'".repeat(note.bendSteps), cx, cy + (active ? 18 : 14));
    }

    // breath arrow just outside the chip (up = blow, down = draw)
    const arrow = note.direction === 'blow' ? '▲' : '▼';
    const ay = note.direction === 'blow' ? cy - h / 2 - 12 : cy + h / 2 + 12;
    ctx.fillStyle = active ? colour : theme.textDim;
    ctx.font = `${active ? 13 : 10}px ${FONT}`;
    ctx.fillText(arrow, cx, ay);

    ctx.globalAlpha = 1;
  }

  /** Progress ring around the current note as it's held in tune. */
  function drawHoldRing(cx, cy, progress, colour) {
    ctx.beginPath();
    ctx.arc(cx, cy, RING_R, 0, Math.PI * 2);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 4;
    ctx.stroke();

    if (progress > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  function draw(tickState) {
    if (!ctx) return;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    const centerY = height * 0.5;
    const playheadX = width * PLAYHEAD_FRAC;

    // ease scroll toward the cursor
    scroll += (cursor - scroll) * SCROLL_EASE;

    // centerline + orientation labels
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.fillStyle = theme.textDim;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('BLOW ▲', 14, centerY - height * 0.13 - 34);
    ctx.textBaseline = 'top';
    ctx.fillText('DRAW ▼', 14, centerY + height * 0.13 + 34);

    // playhead band
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(playheadX - 44, 0, 88, height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const ev = tickState.evaluatorResult ?? lastEval;
    const absCents = ev?.absCents ?? null;
    const curColour = tuneColor(absCents);

    // chips (draw non-active first, then the active one on top)
    for (let i = 0; i < notes.length; i++) {
      if (i === cursor) continue;
      const cx = playheadX + (i - scroll) * SLOT_W;
      drawChip(notes[i], cx, centerY, { active: false, done: i < cursor, absCents: null });
    }
    if (cursor < notes.length) {
      const note = notes[cursor];
      const cx = playheadX + (cursor - scroll) * SLOT_W;
      const offset = height * 0.13;
      const cy = note.direction === 'blow' ? centerY - offset : centerY + offset;
      const progress = Math.max(0, Math.min(1, (ev?.holdMs ?? 0) / holdTargetMs));
      drawHoldRing(cx, cy, progress, curColour);
      drawChip(note, cx, centerY, { active: true, done: false, absCents });

      // target note name above; live cents below when playing
      ctx.textAlign = 'center';
      ctx.fillStyle = theme.text;
      ctx.font = `600 18px ${FONT}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(note.note, cx, 30);

      if (tickState.pitchData && tickState.targetNote) {
        const signed = Math.round(
          (tickState.pitchData.midi + (tickState.pitchData.cents || 0) / 100 - note.midi) * 100,
        );
        ctx.fillStyle = curColour;
        ctx.font = `600 14px ${FONT}`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${signed > 0 ? '+' : ''}${signed}¢`, cx, height - 30);
      }
    } else {
      // sequence complete (between loop iterations)
      ctx.textAlign = 'center';
      ctx.fillStyle = theme.accent;
      ctx.font = `700 22px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', playheadX, centerY);
    }

    if (countdownValue > 0) drawCountdown(ctx, countdownValue, width, height);
  }

  return {
    init(canvasEl, config) {
      canvas = canvasEl;
      const setup = setupCanvas(canvas);
      ctx = setup.ctx;
      width = setup.width;
      height = setup.height;
      theme = readTheme();
      notes = [...(config.context?.notes ?? [])];
      holdTargetMs = config.timing?.holdMs ?? 350;
      scroll = 0;
      cursor = 0;
      lastEval = null;
      countdownValue = 0;

      resizeObserver = new ResizeObserver(() => {
        if (!ctx) return;
        const r = resizeCanvas(canvas, ctx);
        width = r.width;
        height = r.height;
      });
      resizeObserver.observe(canvas);
    },

    start() {
      theme = readTheme();
      scroll = 0;
      cursor = 0;
      lastEval = null;
    },

    update(tickState) {
      cursor = tickState.cursor ?? 0;
      if (tickState.evaluatorResult) lastEval = tickState.evaluatorResult;
      draw(tickState);
    },

    stop() {},

    destroy() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      ctx = null;
      canvas = null;
    },

    onCountdown(secondsLeft) {
      countdownValue = secondsLeft;
      draw({ cursor, evaluatorResult: null, pitchData: null, targetNote: null });
    },

    onLoopRestart() {
      scroll = 0;
      cursor = 0;
      lastEval = null;
    },
  };
}
