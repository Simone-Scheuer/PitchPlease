import { bus } from '../utils/event-bus.js';

const MAX_SIZE = 4096;

class PitchBuffer {
  #data = [];
  #recording = false;
  #paused = false;
  #startTime = 0;
  #pausedAt = 0;
  #pauseOffset = 0; // accumulated pause duration to subtract from timestamps

  start() {
    this.#data = [];
    this.#startTime = performance.now();
    this.#recording = true;
    this.#paused = false;
    this.#pauseOffset = 0;

    bus.on('pitch', this.#onPitch);
    bus.on('silence', this.#onSilence);
  }

  stop() {
    this.#recording = false;
    this.#paused = false;
    bus.off('pitch', this.#onPitch);
    bus.off('silence', this.#onSilence);
  }

  pause() {
    if (!this.#paused) {
      this.#paused = true;
      this.#pausedAt = performance.now();
    }
  }

  resume() {
    if (this.#paused) {
      this.#pauseOffset += performance.now() - this.#pausedAt;
      this.#paused = false;
    }
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
    if (!this.#recording || this.#paused) return;
    this.#data.push({
      time: performance.now() - this.#startTime - this.#pauseOffset,
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
    if (!this.#recording || this.#paused) return;
    // Only push silence markers if last entry wasn't already silence
    const last = this.#data[this.#data.length - 1];
    if (last && last.silent) return;
    this.#data.push({
      time: performance.now() - this.#startTime - this.#pauseOffset,
      silent: true,
    });
    if (this.#data.length > MAX_SIZE) {
      this.#data.shift();
    }
  };
}

export const pitchBuffer = new PitchBuffer();
