import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast } from '../utils/dom.js';
import { PitchStrip } from '../components/pitch-strip.js';
import { NoteDisplay } from '../components/note-display.js';
import { FrequencyDisplay } from '../components/frequency-display.js';
import { CENTS_IN_TUNE, CENTS_CLOSE, NOTE_NAMES } from '../utils/constants.js';
import { midiToFrequency } from '../audio/note-math.js';

// Median window (frames) for steadying the raw per-frame pitch. At ~60fps this
// is ~80ms: long enough to reject jitter and 1-2 frame octave spikes, short
// enough that a real note change still registers almost immediately.
const PITCH_WINDOW = 5;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

class TunerView {
  #strip;
  #noteDisplay;
  #freqDisplay;
  #centsEl;
  #micBtn;
  #hintEl;
  #active = false;
  #silenceTimeout = null;
  #pitchWindow = [];   // recent continuous-MIDI readings for median steadying

  init() {
    this.#strip = new PitchStrip(qs('#tuner-strip'));
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
      this.#strip.start();
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

  deactivate() {
    if (this.#active) this.#stop();
  }

  #stop() {
    detector.stop();
    mic.stop();
    this.#strip.stop();
    this.#pitchWindow = [];
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

    // Steady the raw per-frame pitch with a short median window before it drives
    // anything — this is what stops the readout flashing between notes.
    this.#pitchWindow.push(data.midi + data.cents / 100);
    if (this.#pitchWindow.length > PITCH_WINDOW) this.#pitchWindow.shift();
    const steadyMidi = median(this.#pitchWindow);

    const rounded = Math.round(steadyMidi);
    const cents = Math.round((steadyMidi - rounded) * 100);
    const reading = {
      note: NOTE_NAMES[((rounded % 12) + 12) % 12],
      octave: Math.floor(rounded / 12) - 1,
      cents,
      midi: rounded,
      frequency: midiToFrequency(steadyMidi),
    };

    this.#noteDisplay.update(reading);
    this.#strip.update(reading);
    this.#freqDisplay.update(reading);
    this.#updateCents(cents);
  }

  #onSilence() {
    // Delay clearing to avoid flicker during brief silences
    if (!this.#silenceTimeout) {
      this.#silenceTimeout = setTimeout(() => {
        this.#pitchWindow = [];
        this.#noteDisplay.clear();
        this.#freqDisplay.clear();
        this.#strip.update(null);
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
