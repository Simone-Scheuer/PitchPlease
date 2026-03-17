import { PitchDetector } from 'https://esm.sh/pitchy@4';
import { mic } from './mic.js';
import { frequencyToNoteData } from './note-math.js';
import { bus } from '../utils/event-bus.js';
import {
  CLARITY_THRESHOLD, HIGH_FREQ_CLARITY_THRESHOLD, HIGH_FREQ_BOUNDARY,
  MIN_FREQUENCY, MAX_FREQUENCY, FFT_SIZE,
} from '../utils/constants.js';

class PitchDetectorEngine {
  #detector = null;
  #rafId = null;
  #running = false;

  start() {
    this.#detector = PitchDetector.forFloat32Array(FFT_SIZE);
    this.#running = true;
    this.#loop();
  }

  #loop() {
    if (!this.#running) return;

    const samples = mic.getSamples();
    if (samples) {
      const [frequency, clarity] = this.#detector.findPitch(samples, mic.sampleRate);

      // High-frequency signals (whistles, high harmonica, soprano voice) have
      // naturally lower clarity due to overtone energy — use a relaxed threshold.
      const effectiveClarity = frequency > HIGH_FREQ_BOUNDARY
        ? HIGH_FREQ_CLARITY_THRESHOLD
        : CLARITY_THRESHOLD;

      if (
        clarity >= effectiveClarity &&
        frequency >= MIN_FREQUENCY &&
        frequency <= MAX_FREQUENCY
      ) {
        const noteData = frequencyToNoteData(frequency);
        bus.emit('pitch', {
          ...noteData,
          clarity,
          timestamp: performance.now(),
        });
      } else {
        bus.emit('silence', { timestamp: performance.now() });
      }
    }

    this.#rafId = requestAnimationFrame(() => this.#loop());
  }

  stop() {
    this.#running = false;
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#detector = null;
  }
}

export const detector = new PitchDetectorEngine();
