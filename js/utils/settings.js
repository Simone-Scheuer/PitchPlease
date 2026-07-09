/**
 * settings.js — Central persisted app settings.
 *
 * Single source of truth for instrument profile, reference pitch (A4),
 * skin, and drone preferences. Every change is persisted to localStorage
 * (via store) and announced on the bus as `settings:changed` so views and
 * canvases can react without polling.
 */

import { store } from './store.js';
import { bus } from './event-bus.js';

const DEFAULTS = Object.freeze({
  instrument: 'harmonica',   // 'harmonica' | 'whistle' | 'voice'
  harpKey: 'C',
  whistleKey: 'D',
  a4: 440,                   // reference pitch in Hz
  skin: 'press',             // 'press' | 'neon' | 'riso'
  droneVoice: 'piano',       // sample voice (piano/epiano/guitar) or oscillator wave
  droneChordRoot: 7,         // note class 0-11 (G — cross harp home on a C harp)
  droneChordQuality: 'maj',
  droneProgression: 'hold',  // 'hold' | key of PROGRESSIONS
  droneBarMs: 4000,
  droneVolume: 0.6,
  droneCutoff: 1350,         // lowpass Hz ("warmth")
  droneSpace: 0.12,          // reverb wet gain
  droneRegister: 'low',      // 'low' | 'high' (+12)
  scaleRoot: '',             // '' = no scale overlay
  scaleType: 'major',
});

const A4_MIN = 415;
const A4_MAX = 466;

class Settings {
  #state;

  constructor() {
    const saved = store.get('settings') ?? {};
    this.#state = { ...DEFAULTS, ...saved };
  }

  get(key) {
    return this.#state[key];
  }

  get all() {
    return { ...this.#state };
  }

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    if (key === 'a4') {
      value = Math.min(A4_MAX, Math.max(A4_MIN, Number(value) || 440));
      value = Math.round(value * 10) / 10;
    }
    if (this.#state[key] === value) return;
    this.#state[key] = value;
    store.set('settings', this.#state);
    bus.emit('settings:changed', { key, value });
  }

  /** Key of the currently selected instrument (harp key, whistle key, or null). */
  get instrumentKey() {
    const inst = this.#state.instrument;
    if (inst === 'harmonica') return this.#state.harpKey;
    if (inst === 'whistle') return this.#state.whistleKey;
    return null;
  }
}

export const settings = new Settings();
export { A4_MIN, A4_MAX };
