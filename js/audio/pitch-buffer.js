import { bus } from '../utils/event-bus.js';

const MAX_SIZE = 4096;

class PitchBuffer {
  #data = [];
  #recording = false;
  #startTime = 0;

  start() {
    this.#data = [];
    this.#startTime = performance.now();
    this.#recording = true;

    bus.on('pitch', this.#onPitch);
    bus.on('silence', this.#onSilence);
  }

  stop() {
    this.#recording = false;
    bus.off('pitch', this.#onPitch);
    bus.off('silence', this.#onSilence);
  }

  clear() {
    this.#data = [];
  }

  get data() {
    return this.#data;
  }

  get length() {
    return this.#data.length;
  }

  #onPitch = (data) => {
    if (!this.#recording) return;
    this.#data.push({
      time: performance.now() - this.#startTime,
      frequency: data.frequency,
      midi: data.midi,
      cents: data.cents,
      note: data.note,
      octave: data.octave,
      clarity: data.clarity,
      silent: false,
    });
    if (this.#data.length > MAX_SIZE) {
      this.#data.shift();
    }
  };

  #onSilence = () => {
    if (!this.#recording) return;
    // Only push silence markers if last entry wasn't already silence
    const last = this.#data[this.#data.length - 1];
    if (last && last.silent) return;
    this.#data.push({
      time: performance.now() - this.#startTime,
      silent: true,
    });
    if (this.#data.length > MAX_SIZE) {
      this.#data.shift();
    }
  };
}

export const pitchBuffer = new PitchBuffer();
