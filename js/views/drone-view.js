import { mic } from '../audio/mic.js';
import { startDrone, playNote } from '../audio/synth.js';
import { qs } from '../utils/dom.js';
import { NOTE_NAMES } from '../utils/constants.js';

const CHORD_TYPES = [
  { key: 'single', label: 'Note', intervals: [0] },
  { key: '5th',    label: '5th',  intervals: [0, 7] },
  { key: 'major',  label: 'Maj',  intervals: [0, 4, 7] },
  { key: 'minor',  label: 'Min',  intervals: [0, 3, 7] },
  { key: '7th',    label: '7',    intervals: [0, 4, 7, 10] },
  { key: 'maj7',   label: 'M7',   intervals: [0, 4, 7, 11] },
  { key: 'min7',   label: 'm7',   intervals: [0, 3, 7, 10] },
];

const OCTAVES = [2, 3, 4, 5, 6];
const JOLT_MS = 600;
const DOUBLE_TAP_MS = 300;

class DroneView {
  #viewEl;
  #statusEl;

  // Current selection
  #selectedRoot = 'C';
  #selectedOctave = 4;
  #selectedChord = 'single';

  // Active drone state
  #droneHandles = null;
  #droneChordKey = null; // which chord button is droning

  // Double-tap tracking per chord button
  #lastTapTime = {};

  init() {
    this.#viewEl = qs('#drone-view');
    this.#statusEl = qs('#drone-status');

    this.#buildKeyGrid();
    this.#buildOctaveGrid();
    this.#buildChordGrid();

    window.addEventListener('beforeunload', () => this.#stopDrone());
  }

  activate() {
    this.#viewEl.classList.add('active');
  }

  deactivate() {
    // Drone persists across tab switches intentionally
    this.#viewEl.classList.remove('active');
  }

  // -------------------------------------------------------------------------
  // Grid builders
  // -------------------------------------------------------------------------

  #buildKeyGrid() {
    const grid = qs('#drone-key-grid');
    for (const name of NOTE_NAMES) {
      const btn = document.createElement('button');
      btn.className = 'drone-grid-btn drone-key-btn';
      btn.dataset.note = name;
      btn.textContent = name;
      if (name === this.#selectedRoot) btn.classList.add('selected');
      // Sharps get a subtle style
      if (name.includes('#')) btn.classList.add('sharp');

      btn.addEventListener('click', () => this.#selectRoot(name));
      grid.appendChild(btn);
    }
  }

  #buildOctaveGrid() {
    const grid = qs('#drone-octave-grid');
    for (const oct of OCTAVES) {
      const btn = document.createElement('button');
      btn.className = 'drone-grid-btn drone-octave-btn';
      btn.dataset.octave = oct;
      btn.textContent = oct;
      if (oct === this.#selectedOctave) btn.classList.add('selected');

      btn.addEventListener('click', () => this.#selectOctave(oct));
      grid.appendChild(btn);
    }
  }

  #buildChordGrid() {
    const grid = qs('#drone-chord-grid');
    for (const chord of CHORD_TYPES) {
      const btn = document.createElement('button');
      btn.className = 'drone-grid-btn drone-chord-btn';
      btn.dataset.chord = chord.key;
      btn.textContent = chord.label;

      btn.addEventListener('click', () => this.#handleChordTap(chord.key));
      grid.appendChild(btn);
    }
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  #selectRoot(name) {
    this.#selectedRoot = name;
    const grid = qs('#drone-key-grid');
    for (const btn of grid.children) {
      btn.classList.toggle('selected', btn.dataset.note === name);
    }
    // If droning, restart with new root
    if (this.#droneHandles) {
      this.#startDrone(this.#droneChordKey);
    }
  }

  #selectOctave(oct) {
    this.#selectedOctave = oct;
    const grid = qs('#drone-octave-grid');
    for (const btn of grid.children) {
      btn.classList.toggle('selected', Number(btn.dataset.octave) === oct);
    }
    // If droning, restart with new octave
    if (this.#droneHandles) {
      this.#startDrone(this.#droneChordKey);
    }
  }

  // -------------------------------------------------------------------------
  // Chord tap: single = jolt, double = toggle drone
  // -------------------------------------------------------------------------

  #handleChordTap(chordKey) {
    const now = Date.now();
    const lastTap = this.#lastTapTime[chordKey] ?? 0;
    this.#lastTapTime[chordKey] = now;

    const isDoubleTap = (now - lastTap) < DOUBLE_TAP_MS;

    if (isDoubleTap) {
      // Double-tap: toggle sustained drone
      if (this.#droneHandles && this.#droneChordKey === chordKey) {
        this.#stopDrone();
      } else {
        this.#startDrone(chordKey);
      }
      // Reset so a third tap doesn't re-trigger
      this.#lastTapTime[chordKey] = 0;
    } else {
      // Single tap: jolt (brief tone)
      // If already droning this chord, stop instead
      if (this.#droneHandles && this.#droneChordKey === chordKey) {
        this.#stopDrone();
      } else {
        this.#jolt(chordKey);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sound
  // -------------------------------------------------------------------------

  async #jolt(chordKey) {
    await mic.ensureAudioContext();
    const intervals = this.#getIntervals(chordKey);
    const rootMidi = this.#getRootMidi();
    const noteNames = [];

    for (const interval of intervals) {
      const midi = rootMidi + interval;
      playNote(midi, JOLT_MS, { voice: 'triangle', gain: 0.7 });
      noteNames.push(NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1));
    }

    this.#showStatus(noteNames.join(' \u00b7 '));

    // Brief highlight on the chord button
    this.#flashChordBtn(chordKey);
  }

  async #startDrone(chordKey) {
    this.#stopDrone();
    await mic.ensureAudioContext();

    const intervals = this.#getIntervals(chordKey);
    const rootMidi = this.#getRootMidi();
    const noteNames = [];

    this.#droneHandles = [];
    this.#droneChordKey = chordKey;

    for (const interval of intervals) {
      const midi = rootMidi + interval;
      const handle = startDrone(midi, { voice: 'triangle', gain: 0.8 });
      if (handle) this.#droneHandles.push(handle);
      noteNames.push(NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1));
    }

    this.#showStatus(noteNames.join(' \u00b7 '));
    this.#updateChordBtnStates();
  }

  #stopDrone() {
    if (this.#droneHandles) {
      for (const h of this.#droneHandles) h.stop();
      this.#droneHandles = null;
      this.#droneChordKey = null;
    }
    this.#showStatus('');
    this.#updateChordBtnStates();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  #getRootMidi() {
    const rootIndex = NOTE_NAMES.indexOf(this.#selectedRoot);
    return (this.#selectedOctave + 1) * 12 + rootIndex;
  }

  #getIntervals(chordKey) {
    const chord = CHORD_TYPES.find(c => c.key === chordKey);
    return chord?.intervals ?? [0];
  }

  #showStatus(text) {
    if (!this.#statusEl) return;
    this.#statusEl.textContent = text;
    this.#statusEl.classList.toggle('active', text.length > 0);
  }

  #flashChordBtn(chordKey) {
    const grid = qs('#drone-chord-grid');
    for (const btn of grid.children) {
      if (btn.dataset.chord === chordKey) {
        btn.classList.add('flash');
        setTimeout(() => btn.classList.remove('flash'), JOLT_MS);
      }
    }
  }

  #updateChordBtnStates() {
    const grid = qs('#drone-chord-grid');
    if (!grid) return;
    for (const btn of grid.children) {
      btn.classList.toggle('droning', btn.dataset.chord === this.#droneChordKey);
    }
  }
}

export const droneView = new DroneView();
