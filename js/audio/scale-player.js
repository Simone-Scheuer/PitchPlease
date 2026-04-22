import { mic } from './mic.js';
import { playNote } from './synth.js';
import { getScaleNotes } from '../utils/scales.js';

const DEFAULT_NOTE_MS = 2000;
const DEFAULT_GAP_MS = 2000;
const DEFAULT_TOP_MIDI = 72;   // C5
const DEFAULT_BOTTOM_MIDI = 48; // C3

export class ScalePlayer {
  #timerId = null;
  #currentHandle = null;
  #onNoteStart = null;
  #onFinish = null;
  #playing = false;

  get isPlaying() {
    return this.#playing;
  }

  /**
   * @param {Object} opts
   * @param {string} opts.rootName
   * @param {string} opts.scaleKey
   * @param {number} [opts.noteMs] - Note duration in ms
   * @param {number} [opts.gapMs] - Gap between notes in ms
   * @param {boolean} [opts.loop] - Loop the sequence
   * @param {'down'|'up'|'up-down'} [opts.direction] - Scale direction
   * @param {number} [opts.topMidi]
   * @param {number} [opts.bottomMidi]
   * @param {Function} [opts.onNoteStart]
   * @param {Function} [opts.onFinish]
   */
  async start({
    rootName,
    scaleKey,
    noteMs = DEFAULT_NOTE_MS,
    gapMs = DEFAULT_GAP_MS,
    loop = false,
    direction = 'down',
    topMidi = DEFAULT_TOP_MIDI,
    bottomMidi = DEFAULT_BOTTOM_MIDI,
    onNoteStart,
    onFinish,
  } = {}) {
    this.stop();

    const noteIndices = getScaleNotes(rootName, scaleKey);
    if (!noteIndices || noteIndices.size === 0) return;

    await mic.ensureAudioContext();

    // Build descending list first
    const descending = [];
    for (let m = Math.max(topMidi, bottomMidi); m >= Math.min(topMidi, bottomMidi); m--) {
      const idx = ((m % 12) + 12) % 12;
      if (noteIndices.has(idx)) descending.push(m);
    }
    if (descending.length === 0) return;

    let midis;
    if (direction === 'up') {
      midis = [...descending].reverse();
    } else if (direction === 'up-down') {
      const ascending = [...descending].reverse();
      // Avoid duplicating the top note
      midis = [...ascending, ...descending.slice(1)];
    } else {
      midis = descending;
    }

    this.#playing = true;
    this.#onNoteStart = onNoteStart ?? null;
    this.#onFinish = onFinish ?? null;
    this.#playSequence(midis, 0, noteMs, gapMs, loop);
  }

  #playSequence(midis, index, noteMs, gapMs, loop) {
    if (!this.#playing) return;

    if (index >= midis.length) {
      if (loop && this.#playing) {
        // Restart from beginning after a gap
        this.#timerId = setTimeout(() => {
          this.#playSequence(midis, 0, noteMs, gapMs, loop);
        }, gapMs);
        return;
      }
      this.#finish();
      return;
    }

    const midi = midis[index];
    if (this.#onNoteStart) this.#onNoteStart(midi);
    this.#currentHandle = playNote(midi, noteMs, { voice: 'triangle', gain: 0.7 });

    this.#timerId = setTimeout(() => {
      this.#currentHandle = null;
      if (!this.#playing) return;
      this.#timerId = setTimeout(() => {
        this.#playSequence(midis, index + 1, noteMs, gapMs, loop);
      }, gapMs);
    }, noteMs);
  }

  stop() {
    const wasPlaying = this.#playing;
    this.#playing = false;
    if (this.#timerId) {
      clearTimeout(this.#timerId);
      this.#timerId = null;
    }
    if (this.#currentHandle) {
      try { this.#currentHandle.stop(); } catch { /* noop */ }
      this.#currentHandle = null;
    }
    if (wasPlaying && this.#onFinish) this.#onFinish();
    this.#onNoteStart = null;
    this.#onFinish = null;
  }

  #finish() {
    this.#playing = false;
    this.#timerId = null;
    this.#currentHandle = null;
    const cb = this.#onFinish;
    this.#onNoteStart = null;
    this.#onFinish = null;
    if (cb) cb();
  }
}

export const scalePlayer = new ScalePlayer();
