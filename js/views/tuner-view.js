import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast } from '../utils/dom.js';
import { Needle } from '../components/needle.js';
import { NoteDisplay } from '../components/note-display.js';
import { FrequencyDisplay } from '../components/frequency-display.js';
import { CENTS_IN_TUNE, CENTS_CLOSE } from '../utils/constants.js';

class TunerView {
  #needle;
  #noteDisplay;
  #freqDisplay;
  #centsEl;
  #micBtn;
  #hintEl;
  #active = false;
  #silenceTimeout = null;

  init() {
    this.#needle = new Needle(qs('#tuner-needle'));
    this.#noteDisplay = new NoteDisplay(qs('#note-name'));
    this.#freqDisplay = new FrequencyDisplay(qs('#tuner-frequency'));
    this.#centsEl = qs('#tuner-cents');
    this.#micBtn = qs('#mic-btn');
    this.#hintEl = qs('#mic-hint');

    this.#micBtn.addEventListener('click', () => this.#toggleMic());

    bus.on('pitch', (data) => this.#onPitch(data));
    bus.on('silence', () => this.#onSilence());
  }

  async #toggleMic() {
    if (this.#active) {
      this.#stop();
    } else {
      await this.#start();
    }
  }

  async #start() {
    try {
      this.#micBtn.classList.remove('error');
      await mic.start();
      detector.start();
      this.#needle.start();
      this.#active = true;
      this.#micBtn.classList.add('active');
      this.#hintEl.classList.add('hidden');
    } catch (err) {
      this.#micBtn.classList.add('error');
      if (err.name === 'NotAllowedError') {
        showToast('Microphone access denied. Please allow mic access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        showToast('No microphone found. Please connect a microphone.');
      } else {
        showToast('Could not access microphone.');
      }
    }
  }

  #stop() {
    detector.stop();
    mic.stop();
    this.#needle.stop();
    this.#active = false;
    this.#micBtn.classList.remove('active');
    this.#hintEl.classList.remove('hidden');
    this.#noteDisplay.clear();
    this.#freqDisplay.clear();
    this.#updateCents(null);
  }

  #onPitch(data) {
    // Clear silence timeout
    if (this.#silenceTimeout) {
      clearTimeout(this.#silenceTimeout);
      this.#silenceTimeout = null;
    }

    this.#noteDisplay.update(data);
    this.#needle.update(data.cents);
    this.#freqDisplay.update(data);
    this.#updateCents(data.cents);
  }

  #onSilence() {
    // Delay clearing to avoid flicker during brief silences
    if (!this.#silenceTimeout) {
      this.#silenceTimeout = setTimeout(() => {
        this.#noteDisplay.clear();
        this.#freqDisplay.clear();
        this.#needle.update(0);
        this.#updateCents(null);
        this.#silenceTimeout = null;
      }, 300);
    }
  }

  #updateCents(cents) {
    if (cents === null || cents === undefined) {
      this.#centsEl.textContent = '\u00A0';
      this.#centsEl.classList.remove('sharp', 'flat', 'in-tune');
      return;
    }

    const abs = Math.abs(cents);
    const sign = cents > 0 ? '+' : cents < 0 ? '' : '';
    this.#centsEl.textContent = `${sign}${cents} cents`;

    this.#centsEl.classList.remove('sharp', 'flat', 'in-tune');
    if (abs <= CENTS_IN_TUNE) {
      this.#centsEl.classList.add('in-tune');
    } else if (cents > 0) {
      this.#centsEl.classList.add('sharp');
    } else {
      this.#centsEl.classList.add('flat');
    }
  }
}

export const tunerView = new TunerView();
