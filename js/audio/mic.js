import { FFT_SIZE } from '../utils/constants.js';
import { destroySynth } from './synth.js';

class Mic {
  #audioCtx = null;
  #analyser = null;
  #source = null;
  #stream = null;
  #buffer = null;

  get sampleRate() {
    return this.#audioCtx?.sampleRate ?? 44100;
  }

  get analyser() {
    return this.#analyser;
  }

  /** Expose AudioContext so synth can share it (avoids multiple contexts on mobile) */
  get audioContext() {
    return this.#audioCtx;
  }

  /**
   * Ensure an AudioContext exists without requesting microphone access.
   * Used for synth-only playback (e.g. tap-to-play note labels).
   * If a context already exists (from mic.start()), this is a no-op.
   */
  async ensureAudioContext() {
    if (this.#audioCtx) {
      if (this.#audioCtx.state === 'suspended') {
        await this.#audioCtx.resume();
      }
      return this.#audioCtx;
    }

    this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.#audioCtx.state === 'suspended') {
      await this.#audioCtx.resume();
    }
    return this.#audioCtx;
  }

  async start() {
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Reuse existing AudioContext (e.g. from ensureAudioContext()) or create new
    if (!this.#audioCtx) {
      this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Resume context if suspended (iOS requirement)
    if (this.#audioCtx.state === 'suspended') {
      await this.#audioCtx.resume();
    }

    this.#analyser = this.#audioCtx.createAnalyser();
    this.#analyser.fftSize = FFT_SIZE;
    this.#analyser.smoothingTimeConstant = 0.5;

    this.#source = this.#audioCtx.createMediaStreamSource(this.#stream);
    this.#source.connect(this.#analyser);
    // NOT connected to destination — prevents feedback

    this.#buffer = new Float32Array(FFT_SIZE);
  }

  getSamples() {
    if (!this.#analyser || !this.#buffer) return null;
    this.#analyser.getFloatTimeDomainData(this.#buffer);
    return this.#buffer;
  }

  stop() {
    if (this.#source) {
      this.#source.disconnect();
      this.#source = null;
    }
    if (this.#stream) {
      for (const track of this.#stream.getTracks()) {
        track.stop();
      }
      this.#stream = null;
    }
    // Clean up synth before closing audio context
    destroySynth();
    if (this.#audioCtx) {
      this.#audioCtx.close();
      this.#audioCtx = null;
    }
    this.#analyser = null;
    this.#buffer = null;
  }
}

export const mic = new Mic();
