import { mic } from '../audio/mic.js';
import { startDrone } from '../audio/synth.js';
import { qs } from '../utils/dom.js';
import { NOTE_NAMES } from '../utils/constants.js';

const CHORD_INTERVALS = {
  'single': [0],
  '5th': [0, 7],
  'major': [0, 4, 7],
  'minor': [0, 3, 7],
  '7th': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'min7': [0, 3, 7, 10],
};

class DroneView {
  #droneHandles = null;
  #viewEl;
  #playBtn;
  #stopBtn;
  #rootSelect;
  #octaveSelect;
  #chordSelect;
  #statusEl;

  init() {
    this.#viewEl = qs('#drone-view');
    this.#playBtn = qs('#drone-play');
    this.#stopBtn = qs('#drone-stop');
    this.#rootSelect = qs('#drone-root');
    this.#octaveSelect = qs('#drone-octave');
    this.#chordSelect = qs('#drone-chord');
    this.#statusEl = qs('#drone-status');

    this.#populateRoot();
    this.#playBtn.addEventListener('click', () => this.#start());
    this.#stopBtn.addEventListener('click', () => this.#stop());

    // Auto-restart drone when changing settings while playing
    this.#rootSelect.addEventListener('change', () => { if (this.#droneHandles) this.#start(); });
    this.#octaveSelect.addEventListener('change', () => { if (this.#droneHandles) this.#start(); });
    this.#chordSelect.addEventListener('change', () => { if (this.#droneHandles) this.#start(); });

    // Stop drone on page unload
    window.addEventListener('beforeunload', () => this.#stop());
  }

  activate() {
    this.#viewEl.classList.add('active');
  }

  deactivate() {
    // NOTE: We intentionally do NOT stop the drone on deactivate.
    // The drone persists across tab switches so the user can play along
    // in Graph or Tuner view. It only stops via the Stop button or page unload.
    this.#viewEl.classList.remove('active');
  }

  #populateRoot() {
    for (const name of NOTE_NAMES) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.#rootSelect.appendChild(opt);
    }
  }

  async #start() {
    this.#stop();
    await mic.ensureAudioContext();

    const root = this.#rootSelect.value;
    const octave = parseInt(this.#octaveSelect.value);
    const chordType = this.#chordSelect.value;
    const intervals = CHORD_INTERVALS[chordType] ?? [0];
    const rootIndex = NOTE_NAMES.indexOf(root);
    const rootMidi = (octave + 1) * 12 + rootIndex;

    this.#droneHandles = [];
    const noteNames = [];
    for (const interval of intervals) {
      const midi = rootMidi + interval;
      const handle = startDrone(midi, { voice: 'triangle', gain: 0.8 });
      if (handle) this.#droneHandles.push(handle);
      noteNames.push(NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1));
    }

    this.#playBtn.hidden = true;
    this.#stopBtn.hidden = false;
    if (this.#statusEl) {
      this.#statusEl.textContent = noteNames.join(' \u00b7 ');
      this.#statusEl.classList.add('active');
    }
  }

  #stop() {
    if (this.#droneHandles) {
      for (const h of this.#droneHandles) h.stop();
      this.#droneHandles = null;
    }
    if (this.#playBtn) this.#playBtn.hidden = false;
    if (this.#stopBtn) this.#stopBtn.hidden = true;
    if (this.#statusEl) {
      this.#statusEl.textContent = '';
      this.#statusEl.classList.remove('active');
    }
  }
}

export const droneView = new DroneView();
