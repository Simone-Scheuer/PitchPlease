/**
 * tuner-view.js — Precision tuner: median-steadied note readout, sliding
 * chromatic strip, cents/Hz, and the instrument's own name for the pitch.
 */

import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast, setStatus } from '../utils/dom.js';
import { PitchStrip } from '../components/pitch-strip.js';
import { CENTS_IN_TUNE, NOTE_NAMES } from '../utils/constants.js';
import { midiToFrequency } from '../audio/note-math.js';
import { settings } from '../utils/settings.js';
import { describePitch } from '../utils/instruments.js';

// Median window (frames): ~80ms at 60fps — rejects jitter and octave spikes
// without making real note changes feel laggy.
const PITCH_WINDOW = 5;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

class TunerView {
  #strip;
  #noteEl;
  #nativeEl;
  #centsEl;
  #freqEl;
  #descEl;
  #micBtn;
  #hintEl;
  #active = false;
  #silenceTimeout = null;
  #pitchWindow = [];

  init() {
    this.#strip = new PitchStrip(qs('#tuner-strip'));
    this.#noteEl = qs('#note-name');
    this.#nativeEl = qs('#tuner-native');
    this.#centsEl = qs('#tuner-cents');
    this.#freqEl = qs('#tuner-frequency');
    this.#descEl = qs('#tuner-desc');
    this.#micBtn = qs('#mic-btn');
    this.#hintEl = qs('#mic-hint');

    this.#micBtn.addEventListener('click', () => this.#toggleMic());

    bus.on('pitch', (data) => this.#onPitch(data));
    bus.on('silence', () => this.#onSilence());
  }

  async #toggleMic() {
    if (this.#active) this.#stop();
    else await this.#start();
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
      setStatus('LIVE', true);
    } catch (err) {
      this.#micBtn.classList.add('error');
      setStatus('MIC ERR', false);
      if (err.name === 'NotAllowedError') showToast('Microphone access denied. Allow mic access in your browser settings.');
      else if (err.name === 'NotFoundError') showToast('No microphone found.');
      else showToast('Could not access microphone.');
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
    setStatus('STANDBY', false);
    this.#clearReadouts();
  }

  #onPitch(data) {
    if (!this.#active) return;
    if (this.#silenceTimeout) {
      clearTimeout(this.#silenceTimeout);
      this.#silenceTimeout = null;
    }

    // Steady the raw per-frame pitch before it drives anything
    this.#pitchWindow.push(data.midi + data.cents / 100);
    if (this.#pitchWindow.length > PITCH_WINDOW) this.#pitchWindow.shift();
    const steadyMidi = median(this.#pitchWindow);

    const rounded = Math.round(steadyMidi);
    const cents = Math.round((steadyMidi - rounded) * 100);
    const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
    const octave = Math.floor(rounded / 12) - 1;
    const frequency = midiToFrequency(steadyMidi, settings.get('a4'));

    this.#noteEl.classList.remove('idle');
    this.#noteEl.innerHTML = `${note}<span class="octave">${octave}</span>`;

    const native = describePitch(settings.get('instrument'), settings.instrumentKey, rounded);
    this.#nativeEl.textContent = native ? native.token : '';
    this.#descEl.textContent = native?.desc ? native.desc.toUpperCase() : ' ';

    this.#strip.update({ midi: rounded, cents });
    this.#freqEl.textContent = `${frequency.toFixed(1)} Hz`;
    this.#updateCents(cents);
  }

  #onSilence() {
    if (!this.#active || this.#silenceTimeout) return;
    this.#silenceTimeout = setTimeout(() => {
      this.#pitchWindow = [];
      this.#strip.update(null);
      this.#clearReadouts();
      this.#silenceTimeout = null;
    }, 300);
  }

  #clearReadouts() {
    this.#noteEl.classList.add('idle');
    this.#noteEl.innerHTML = '--<span class="octave"></span>';
    this.#nativeEl.textContent = '';
    this.#descEl.textContent = ' ';
    this.#freqEl.textContent = ' ';
    this.#updateCents(null);
  }

  #updateCents(cents) {
    if (cents === null || cents === undefined) {
      this.#centsEl.textContent = ' ';
      this.#centsEl.classList.remove('sharp', 'flat', 'in-tune');
      return;
    }
    const abs = Math.abs(cents);
    const sign = cents > 0 ? '+' : '';
    this.#centsEl.textContent = `${sign}${cents} CENTS`;
    this.#centsEl.classList.remove('sharp', 'flat', 'in-tune');
    if (abs <= CENTS_IN_TUNE) this.#centsEl.classList.add('in-tune');
    else if (cents > 0) this.#centsEl.classList.add('sharp');
    else this.#centsEl.classList.add('flat');
  }
}

export const tunerView = new TunerView();
