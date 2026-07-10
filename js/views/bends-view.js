/**
 * bends-view.js — Standalone harmonica bend trainer.
 *
 * A zoomed vertical meter (±2 semitones around the target bend) with a
 * gravity-well target zone. Hold the bent pitch in the zone to lock it.
 * No score, no fail state, no clock — lock feedback only, player advances
 * with the arrows. Distilled from the old bend-meter renderer +
 * bend-accuracy evaluator, minus the exercise machinery.
 */

import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast, setStatus } from '../utils/dom.js';
import { getBendTargets } from '../utils/harmonica.js';
import { playNote } from '../audio/synth.js';
import { frequencyToMidi } from '../audio/note-math.js';
import { themeColors } from '../utils/theme-colors.js';
import { settings } from '../utils/settings.js';
import { NOTE_NAMES } from '../utils/constants.js';

const SEMITONE_RANGE = 4;        // ±2 semitones visible
const TARGET_CENTS = 10;         // in-the-pocket zone
const CLOSE_CENTS = 25;
const LOCK_MS = 1000;            // hold this long to lock
const GRACE_MS = 200;            // out-of-zone forgiveness
const TOP = 24;
const BOTTOM = 24;
const LEFT = 56;
const RIGHT = 20;

const FONT = (px) => `${px}px "Departure Mono", ui-monospace, monospace`;

class BendsView {
  #canvas;
  #ctx;
  #dpr = 1;
  #width = 0;
  #height = 0;
  #rafId = null;

  #tokenEl;
  #descEl;
  #selectEl;
  #micBtn;
  #lockTagEl;

  #targets = [];
  #index = 0;
  #active = false;

  // Live pitch (median-steadied)
  #pitchWindow = [];
  #playerMidi = null;

  // Hold-to-lock
  #inZoneSince = 0;
  #bankedMs = 0;
  #graceSince = 0;
  #locked = false;

  init() {
    this.#canvas = qs('#bends-canvas');
    this.#ctx = this.#canvas.getContext('2d');
    this.#tokenEl = qs('#bends-token');
    this.#descEl = qs('#bends-desc');
    this.#selectEl = qs('#bends-select');
    this.#micBtn = qs('#bends-mic');
    this.#lockTagEl = qs('#bends-lock');

    qs('#bends-prev').addEventListener('click', () => this.#step(-1));
    qs('#bends-next').addEventListener('click', () => this.#step(1));
    qs('#bends-ref').addEventListener('click', () => this.#playReference());
    this.#micBtn.addEventListener('click', () => this.#toggleMic());
    this.#selectEl.addEventListener('change', () => {
      this.#index = Number(this.#selectEl.value) || 0;
      this.#onTargetChange();
    });

    this._resizeObserver = new ResizeObserver(() => this.#resize());
    this._resizeObserver.observe(this.#canvas);

    bus.on('pitch', (data) => this.#onPitch(data));
    bus.on('silence', () => this.#onSilence());
    bus.on('settings:changed', ({ key }) => {
      if (key === 'harpKey') this.#loadTargets();
    });

    this.#loadTargets();
  }

  activate() {
    this.#resize();
    this.#startLoop();
  }

  deactivate() {
    this.#stopLoop();
    if (this.#active) this.#stopMic();
  }

  // -------------------------------------------------------------------------
  // Targets
  // -------------------------------------------------------------------------

  #loadTargets() {
    const key = settings.get('harpKey');
    this.#targets = getBendTargets(key);
    this.#index = 0;

    this.#selectEl.innerHTML = '';
    let group = null;
    let groupLabel = '';
    this.#targets.forEach((t, i) => {
      const label = `${t.type === 'draw' ? 'Draw' : 'Blow'} bends`;
      if (label !== groupLabel) {
        groupLabel = label;
        group = document.createElement('optgroup');
        group.label = label;
        this.#selectEl.appendChild(group);
      }
      const opt = document.createElement('option');
      opt.value = String(i);
      const ticks = "'".repeat(t.stepDown);
      opt.textContent = `${t.type === 'draw' ? '-' : ''}${t.hole}${ticks}  (${t.note})`;
      group.appendChild(opt);
    });

    this.#onTargetChange();
  }

  get #target() {
    return this.#targets[this.#index] ?? null;
  }

  #step(dir) {
    if (this.#targets.length === 0) return;
    this.#index = (this.#index + dir + this.#targets.length) % this.#targets.length;
    this.#onTargetChange();
  }

  #onTargetChange() {
    const t = this.#target;
    if (!t) return;
    this.#selectEl.value = String(this.#index);
    const ticks = "'".repeat(t.stepDown);
    this.#tokenEl.textContent = `${t.type === 'draw' ? '-' : ''}${t.hole}${ticks}`;
    this.#descEl.textContent = `${t.type} ${t.hole}, ${t.stepDown} step${t.stepDown > 1 ? 's' : ''} down → ${t.note}`;
    this.#resetLock();
    if (!this.#rafId) this.#draw();
  }

  #playReference() {
    mic.ensureAudioContext().then(() => {
      const t = this.#target;
      if (t) playNote(t.midi, 1200, { voice: settings.get('droneVoice'), gain: 0.7 });
    });
  }

  // -------------------------------------------------------------------------
  // Mic
  // -------------------------------------------------------------------------

  async #toggleMic() {
    if (this.#active) this.#stopMic();
    else await this.#startMic();
  }

  async #startMic() {
    try {
      await mic.start();
      detector.start();
      this.#active = true;
      this.#micBtn.classList.add('active');
      setStatus('LIVE', true);
    } catch (err) {
      setStatus('MIC ERR', false);
      if (err.name === 'NotAllowedError') showToast('Microphone access denied.');
      else showToast('Could not access microphone.');
    }
  }

  #stopMic() {
    detector.stop();
    mic.stop();
    this.#active = false;
    this.#playerMidi = null;
    this.#pitchWindow = [];
    this.#micBtn.classList.remove('active');
    setStatus('STANDBY', false);
    this.#resetLock();
  }

  #onPitch(data) {
    if (!this.#active) return;
    const exact = frequencyToMidi(data.frequency, settings.get('a4'));
    this.#pitchWindow.push(exact);
    if (this.#pitchWindow.length > 3) this.#pitchWindow.shift();
    const sorted = [...this.#pitchWindow].sort((a, b) => a - b);
    this.#playerMidi = sorted[Math.floor(sorted.length / 2)];
  }

  #onSilence() {
    if (!this.#active) return;
    this.#playerMidi = null;
    this.#pitchWindow = [];
  }

  // -------------------------------------------------------------------------
  // Lock logic
  // -------------------------------------------------------------------------

  #resetLock() {
    this.#inZoneSince = 0;
    this.#bankedMs = 0;
    this.#graceSince = 0;
    this.#locked = false;
    this.#lockTagEl.classList.remove('lit');
  }

  #updateLock(absCents) {
    const now = performance.now();
    const inZone = this.#playerMidi !== null && absCents <= TARGET_CENTS;

    if (inZone) {
      if (!this.#inZoneSince) {
        if (this.#graceSince && now - this.#graceSince >= GRACE_MS) this.#bankedMs = 0;
        this.#graceSince = 0;
        this.#inZoneSince = now;
      }
      const held = this.#bankedMs + (now - this.#inZoneSince);
      if (held >= LOCK_MS && !this.#locked) {
        this.#locked = true;
        this.#lockTagEl.classList.add('lit');
      }
      return Math.min(1, held / LOCK_MS);
    }

    if (this.#inZoneSince) {
      this.#bankedMs += now - this.#inZoneSince;
      this.#inZoneSince = 0;
      this.#graceSince = now;
    }
    if (this.#graceSince && now - this.#graceSince >= GRACE_MS) {
      this.#bankedMs = 0;
      this.#graceSince = 0;
      if (this.#locked) {
        this.#locked = false;
        this.#lockTagEl.classList.remove('lit');
      }
    }
    return Math.min(1, this.#bankedMs / LOCK_MS);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  #resize() {
    this.#dpr = window.devicePixelRatio || 1;
    const rect = this.#canvas.getBoundingClientRect();
    this.#width = rect.width;
    this.#height = rect.height;
    this.#canvas.width = this.#width * this.#dpr;
    this.#canvas.height = this.#height * this.#dpr;
    this.#ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    if (!this.#rafId) this.#draw();
  }

  #startLoop() {
    if (this.#rafId) return;
    const loop = () => {
      this.#draw();
      this.#rafId = requestAnimationFrame(loop);
    };
    this.#rafId = requestAnimationFrame(loop);
  }

  #stopLoop() {
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  #midiToY(midi) {
    const t = this.#target;
    if (!t) return this.#height / 2;
    const half = SEMITONE_RANGE / 2;
    const clamped = Math.max(-half, Math.min(half, midi - t.midi));
    const gh = this.#height - TOP - BOTTOM;
    return (this.#height - BOTTOM) - ((clamped + half) / SEMITONE_RANGE) * gh;
  }

  #draw() {
    const ctx = this.#ctx;
    const w = this.#width;
    const h = this.#height;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    const t = this.#target;
    if (!t) return;

    const left = LEFT;
    const right = w - RIGHT;
    const isNeon = document.documentElement.dataset.skin === 'neon';

    // Semitone grid + note names
    ctx.textBaseline = 'middle';
    for (let off = -2; off <= 2; off++) {
      const midi = Math.round(t.midi) + off;
      const y = this.#midiToY(midi);
      if (y < TOP - 4 || y > h - BOTTOM + 4) continue;
      ctx.strokeStyle = themeColors.canvasGrid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      const idx = ((midi % 12) + 12) % 12;
      ctx.font = FONT(10);
      ctx.fillStyle = themeColors.canvasLabel;
      ctx.textAlign = 'right';
      ctx.fillText(`${NOTE_NAMES[idx]}${Math.floor(midi / 12) - 1}`, left - 8, y);
    }

    // Close zone
    const closeTop = this.#midiToY(t.midi + CLOSE_CENTS / 100);
    const closeBot = this.#midiToY(t.midi - CLOSE_CENTS / 100);
    ctx.fillStyle = themeColors.canvasScaleHighlight;
    ctx.fillRect(left, closeTop, right - left, closeBot - closeTop);

    // Target zone
    const zoneTop = this.#midiToY(t.midi + TARGET_CENTS / 100);
    const zoneBot = this.#midiToY(t.midi - TARGET_CENTS / 100);
    ctx.fillStyle = themeColors.canvasCurrentNoteBg;
    ctx.fillRect(left, zoneTop, right - left, zoneBot - zoneTop);
    ctx.strokeStyle = themeColors.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(left, zoneTop, right - left, zoneBot - zoneTop);
    ctx.setLineDash([]);

    // Exact target line
    const centerY = this.#midiToY(t.midi);
    ctx.strokeStyle = themeColors.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, centerY);
    ctx.lineTo(right, centerY);
    ctx.stroke();

    // Player: cents deviation + lock progress + ball
    let absCents = Infinity;
    if (this.#playerMidi !== null) {
      absCents = Math.abs(this.#playerMidi - t.midi) * 100;
    }
    const progress = this.#updateLock(absCents);

    // Lock progress fill inside the zone
    if (progress > 0) {
      ctx.fillStyle = themeColors.accentDim;
      ctx.fillRect(left, zoneTop, (right - left) * progress, zoneBot - zoneTop);
    }

    if (this.#playerMidi !== null) {
      const y = this.#midiToY(this.#playerMidi);
      const color = absCents <= TARGET_CENTS ? themeColors.inTune
        : absCents <= CLOSE_CENTS ? themeColors.close
        : themeColors.off;

      ctx.save();
      ctx.fillStyle = color;
      // Square "pixel" ball — print aesthetic
      const r = this.#locked ? 13 : 11;
      const cx = left + (right - left) / 2;
      if (isNeon) {
        // Atomized bloom: corner satellite pixels instead of a blur glow
        const spread = this.#locked ? 7 : 5;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.fillRect(cx + dx * (r + spread) - 1.5, y + dy * (r + spread) - 1.5, 3, 3);
        }
      }
      ctx.fillRect(cx - r, y - r, r * 2, r * 2);
      ctx.restore();

      // Signed cents readout beside the ball
      const signed = Math.round(this.#playerMidi * 100 - t.midi * 100);
      ctx.font = FONT(12);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(`${signed >= 0 ? '+' : ''}${signed}¢`, cx + r + 10, y);
    }
  }
}

export const bendsView = new BendsView();
