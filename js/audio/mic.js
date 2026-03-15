import { FFT_SIZE } from '../utils/constants.js';

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

  async start() {
    this.#stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Resume context if suspended (iOS requirement)
    if (this.#audioCtx.state === 'suspended') {
      await this.#audioCtx.resume();
    }

    this.#analyser = this.#audioCtx.createAnalyser();
    this.#analyser.fftSize = FFT_SIZE;
    this.#analyser.smoothingTimeConstant = 0.8;

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
    if (this.#audioCtx) {
      this.#audioCtx.close();
      this.#audioCtx = null;
    }
    this.#analyser = null;
    this.#buffer = null;
  }
}

export const mic = new Mic();
