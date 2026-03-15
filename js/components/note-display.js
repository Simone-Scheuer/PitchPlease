import { CENTS_IN_TUNE, CENTS_CLOSE, NOTE_DEBOUNCE_FRAMES } from '../utils/constants.js';

export class NoteDisplay {
  #el;
  #pendingNote = null;
  #pendingOctave = null;
  #frameCount = 0;
  #currentNote = null;
  #currentOctave = null;

  constructor(el) {
    this.#el = el;
  }

  update({ note, octave, cents }) {
    // Debounce: only switch displayed note after N consecutive frames of the same note
    if (note === this.#pendingNote && octave === this.#pendingOctave) {
      this.#frameCount++;
    } else {
      this.#pendingNote = note;
      this.#pendingOctave = octave;
      this.#frameCount = 1;
    }

    if (this.#frameCount >= NOTE_DEBOUNCE_FRAMES || (note === this.#currentNote && octave === this.#currentOctave)) {
      this.#currentNote = note;
      this.#currentOctave = octave;
      this.#el.innerHTML = `${note}<span class="octave">${octave}</span>`;
    }

    // Color class based on cents deviation
    const absCents = Math.abs(cents);
    this.#el.classList.remove('idle', 'in-tune', 'close', 'off');
    if (absCents <= CENTS_IN_TUNE) {
      this.#el.classList.add('in-tune');
    } else if (absCents <= CENTS_CLOSE) {
      this.#el.classList.add('close');
    } else {
      this.#el.classList.add('off');
    }
  }

  clear() {
    this.#el.innerHTML = '--<span class="octave"></span>';
    this.#el.classList.remove('in-tune', 'close', 'off');
    this.#el.classList.add('idle');
    this.#pendingNote = null;
    this.#pendingOctave = null;
    this.#frameCount = 0;
    this.#currentNote = null;
    this.#currentOctave = null;
  }

  destroy() {
    this.#el = null;
  }
}
