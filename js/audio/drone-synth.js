/**
 * drone-synth.js — Layered chord drone engine.
 *
 * A chord is voiced as: sub-octave sine + each chord tone as a pair of
 * oscillators detuned ±3.5 cents, all through a gently-breathing lowpass
 * (slow LFO on the cutoff). Chord changes crossfade. Progressions are
 * scheduled against the audio clock, so background-tab timer throttling
 * only delays the UI update, never the harmony.
 *
 * Shares the AudioContext from mic.js. Emits nothing — callers get
 * onChordChange callbacks and read state.
 */

import { mic } from './mic.js';
import { midiToFrequency } from './note-math.js';
import { settings } from '../utils/settings.js';
import { NOTE_NAMES } from '../utils/constants.js';

// ---------------------------------------------------------------------------
// Chord + progression definitions
// ---------------------------------------------------------------------------

export const CHORD_QUALITIES = Object.freeze({
  maj:  { label: 'MAJ',  suffix: '',     intervals: [0, 4, 7] },
  min:  { label: 'MIN',  suffix: 'm',    intervals: [0, 3, 7] },
  dom7: { label: '7',    suffix: '7',    intervals: [0, 4, 7, 10] },
  m7:   { label: 'm7',   suffix: 'm7',   intervals: [0, 3, 7, 10] },
  maj7: { label: 'MAJ7', suffix: 'maj7', intervals: [0, 4, 7, 11] },
  sus4: { label: 'SUS4', suffix: 'sus4', intervals: [0, 5, 7] },
  p5:   { label: '5',    suffix: '5',    intervals: [0, 7] },
  dim:  { label: 'DIM',  suffix: '°',    intervals: [0, 3, 6] },
});

/** Steps are semitone offsets from the home root + explicit qualities. */
export const PROGRESSIONS = Object.freeze({
  'i-iv-v': {
    label: 'I·IV·V',
    steps: [
      { offset: 0, quality: 'maj', numeral: 'I' }, { offset: 5, quality: 'maj', numeral: 'IV' },
      { offset: 7, quality: 'dom7', numeral: 'V7' }, { offset: 0, quality: 'maj', numeral: 'I' },
    ],
  },
  'blues12': {
    label: '12-BAR',
    steps: [
      ['I7', 0], ['I7', 0], ['I7', 0], ['I7', 0],
      ['IV7', 5], ['IV7', 5], ['I7', 0], ['I7', 0],
      ['V7', 7], ['IV7', 5], ['I7', 0], ['V7', 7],
    ].map(([numeral, offset]) => ({ offset, quality: 'dom7', numeral })),
  },
  'minor12': {
    label: '12-BAR MIN',
    steps: [
      ['i7', 0, 'm7'], ['i7', 0, 'm7'], ['i7', 0, 'm7'], ['i7', 0, 'm7'],
      ['iv7', 5, 'm7'], ['iv7', 5, 'm7'], ['i7', 0, 'm7'], ['i7', 0, 'm7'],
      ['♭VI', 8, 'maj'], ['V7', 7, 'dom7'], ['i7', 0, 'm7'], ['V7', 7, 'dom7'],
    ].map(([numeral, offset, quality]) => ({ offset, quality, numeral })),
  },
  'i-v-vi-iv': {
    label: 'I·V·vi·IV',
    steps: [
      { offset: 0, quality: 'maj', numeral: 'I' }, { offset: 7, quality: 'maj', numeral: 'V' },
      { offset: 9, quality: 'min', numeral: 'vi' }, { offset: 5, quality: 'maj', numeral: 'IV' },
    ],
  },
  'doowop': {
    label: 'I·vi·IV·V',
    steps: [
      { offset: 0, quality: 'maj', numeral: 'I' }, { offset: 9, quality: 'min', numeral: 'vi' },
      { offset: 5, quality: 'maj', numeral: 'IV' }, { offset: 7, quality: 'dom7', numeral: 'V7' },
    ],
  },
  'axis': {
    label: 'vi·IV·I·V',
    steps: [
      { offset: 9, quality: 'min', numeral: 'vi' }, { offset: 5, quality: 'maj', numeral: 'IV' },
      { offset: 0, quality: 'maj', numeral: 'I' }, { offset: 7, quality: 'maj', numeral: 'V' },
    ],
  },
  'ii-v-i': {
    label: 'ii·V·I',
    steps: [
      { offset: 2, quality: 'm7', numeral: 'ii7' }, { offset: 7, quality: 'dom7', numeral: 'V7' },
      { offset: 0, quality: 'maj7', numeral: 'IΔ' }, { offset: 0, quality: 'maj7', numeral: 'IΔ' },
    ],
  },
  'andalusian': {
    label: 'ANDALUSIAN',
    steps: [
      { offset: 0, quality: 'min', numeral: 'i' }, { offset: 10, quality: 'maj', numeral: '♭VII' },
      { offset: 8, quality: 'maj', numeral: '♭VI' }, { offset: 7, quality: 'dom7', numeral: 'V7' },
    ],
  },
  'mixovamp': {
    label: 'I·♭VII VAMP',
    steps: [
      { offset: 0, quality: 'maj', numeral: 'I' }, { offset: 10, quality: 'maj', numeral: '♭VII' },
      { offset: 0, quality: 'maj', numeral: 'I' }, { offset: 10, quality: 'maj', numeral: '♭VII' },
    ],
  },
  'minorvamp': {
    label: 'i·♭VII·♭VI',
    steps: [
      { offset: 0, quality: 'min', numeral: 'i' }, { offset: 10, quality: 'maj', numeral: '♭VII' },
      { offset: 8, quality: 'maj', numeral: '♭VI' }, { offset: 10, quality: 'maj', numeral: '♭VII' },
    ],
  },
});

/** "G7", "Am", "F#maj7" — display name for a chord. */
export function chordLabel(rootIndex, qualityKey) {
  const name = NOTE_NAMES[((rootIndex % 12) + 12) % 12];
  return `${name}${CHORD_QUALITIES[qualityKey]?.suffix ?? ''}`;
}

/** Note classes (0–11) sounding in a chord. */
export function chordNoteClasses(rootIndex, qualityKey) {
  const intervals = CHORD_QUALITIES[qualityKey]?.intervals ?? [];
  return new Set(intervals.map(i => (rootIndex + i) % 12));
}

// ---------------------------------------------------------------------------
// Voicing constants
// ---------------------------------------------------------------------------

const FADE_S = 0.45;
const DETUNE_CENTS = 2.0;   // enough width to feel alive, no wub-wub beating
const TONE_GAIN = 0.16;
const SUB_GAIN = 0.16;
const FILTER_LFO_HZ = 0.05;
const FILTER_LFO_DEPTH = 110;
const PROG_TICK_MS = 150;
const REVERB_SECONDS = 2.4;

/** Root lands in octave 2–3 (LOW) or 3–4 (HIGH register). */
function rootMidiFor(rootIndex) {
  const midi = 48 + rootIndex; // C3..B3
  const low = rootIndex > 7 ? midi - 12 : midi;
  return settings.get('droneRegister') === 'high' ? low + 12 : low;
}

/** Synthetic impulse response: decaying noise burst = a soft, cheap room. */
function makeImpulse(ctx) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * REVERB_SECONDS);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
    }
  }
  return impulse;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class DroneSynth {
  #ctx = null;
  #master = null;      // volume-controlled output
  #lfo = null;
  #lfoGain = null;
  #chain = null;       // { gain, filter, oscs: [] } for the sounding chord
  #current = null;     // { rootIndex, quality }

  // Progression state
  #progTimer = null;
  #progSteps = null;
  #progIndex = 0;
  #progRoot = 0;
  #progBarMs = 4000;
  #nextChangeAt = 0;   // audio-clock seconds
  #onChordChange = null;
  #progKey = null;

  get isPlaying() {
    return this.#chain !== null;
  }

  get current() {
    return this.#current;
  }

  get progressionKey() {
    return this.#progKey;
  }

  #wet = null;

  async #ensure() {
    await mic.ensureAudioContext();
    const ctx = mic.audioContext;
    if (this.#ctx !== ctx) {
      // Fresh context — rebuild master chain: master → dry + reverb-wet → out
      this.#ctx = ctx;
      this.#master = ctx.createGain();
      this.#master.gain.value = settings.get('droneVolume');
      this.#master.connect(ctx.destination); // dry
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx);
      this.#wet = ctx.createGain();
      this.#wet.gain.value = settings.get('droneSpace');
      this.#master.connect(convolver);
      convolver.connect(this.#wet);
      this.#wet.connect(ctx.destination);
      this.#lfo = ctx.createOscillator();
      this.#lfo.frequency.value = FILTER_LFO_HZ;
      this.#lfoGain = ctx.createGain();
      this.#lfoGain.gain.value = FILTER_LFO_DEPTH;
      this.#lfo.connect(this.#lfoGain);
      this.#lfo.start();
      this.#chain = null;
    }
    return ctx;
  }

  setVolume(v) {
    settings.set('droneVolume', v);
    if (this.#master && this.#ctx) {
      const t = this.#ctx.currentTime;
      this.#master.gain.setValueAtTime(this.#master.gain.value, t);
      this.#master.gain.linearRampToValueAtTime(v, t + 0.05);
    }
  }

  /** Reverb amount, 0–0.6. Live. */
  setSpace(v) {
    settings.set('droneSpace', v);
    if (this.#wet && this.#ctx) {
      const t = this.#ctx.currentTime;
      this.#wet.gain.setValueAtTime(this.#wet.gain.value, t);
      this.#wet.gain.linearRampToValueAtTime(v, t + 0.05);
    }
  }

  /** Lowpass cutoff in Hz. Live — glides on the sounding chord too. */
  setCutoff(hz) {
    settings.set('droneCutoff', hz);
    if (this.#chain && this.#ctx) {
      const t = this.#ctx.currentTime;
      this.#chain.filter.frequency.setValueAtTime(this.#chain.filter.frequency.value, t);
      this.#chain.filter.frequency.linearRampToValueAtTime(hz, t + 0.1);
    }
  }

  /** Rebuild the sounding chord with current voice/register (crossfade). */
  revoice() {
    if (this.#current) this.play(this.#current.rootIndex, this.#current.quality);
  }

  /** Bar length changes apply from the next chord boundary — no restart. */
  setBarMs(ms) {
    this.#progBarMs = ms;
  }

  /** Re-key a running progression from the next bar — no restart, no jump. */
  setProgressionRoot(rootIndex) {
    this.#progRoot = rootIndex;
  }

  /** Start (or crossfade to) a chord. */
  async play(rootIndex, qualityKey) {
    const ctx = await this.#ensure();
    const quality = CHORD_QUALITIES[qualityKey];
    if (!quality) return;

    const old = this.#chain;
    const t = ctx.currentTime;

    // Build the new chord chain
    const chainGain = ctx.createGain();
    chainGain.gain.setValueAtTime(0, t);
    chainGain.gain.linearRampToValueAtTime(1, t + FADE_S);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = settings.get('droneCutoff');
    filter.Q.value = 0.4;
    this.#lfoGain.connect(filter.frequency);
    filter.connect(chainGain);
    chainGain.connect(this.#master);

    const voice = settings.get('droneVoice');
    const root = rootMidiFor(rootIndex);
    const midis = [
      root,
      ...quality.intervals.slice(1).map(i => root + i),
      root + 12,
    ];

    const oscs = [];
    const addOsc = (midi, type, gainValue, detune) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = midiToFrequency(midi, settings.get('a4'));
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gainValue;
      osc.connect(g);
      g.connect(filter);
      osc.start(t);
      oscs.push(osc);
    };

    addOsc(root - 12, 'sine', SUB_GAIN, 0); // sub always sine
    for (const midi of midis) {
      addOsc(midi, voice, TONE_GAIN, -DETUNE_CENTS);
      addOsc(midi, voice, TONE_GAIN, DETUNE_CENTS);
    }

    this.#chain = { gain: chainGain, filter, oscs };
    this.#current = { rootIndex: ((rootIndex % 12) + 12) % 12, quality: qualityKey };

    // Fade out and dismantle the previous chord
    if (old) this.#dismantle(old, t);
  }

  #dismantle(chain, t) {
    try {
      chain.gain.gain.setValueAtTime(chain.gain.gain.value, t);
      chain.gain.gain.linearRampToValueAtTime(0, t + FADE_S);
      for (const osc of chain.oscs) osc.stop(t + FADE_S + 0.05);
      setTimeout(() => {
        try {
          this.#lfoGain?.disconnect(chain.filter.frequency);
          chain.filter.disconnect();
          chain.gain.disconnect();
        } catch { /* already gone */ }
      }, (FADE_S + 0.15) * 1000);
    } catch { /* context closed */ }
  }

  stop() {
    this.stopProgression();
    if (this.#chain && this.#ctx) {
      this.#dismantle(this.#chain, this.#ctx.currentTime);
    }
    this.#chain = null;
    this.#current = null;
  }

  // -------------------------------------------------------------------------
  // Progressions — scheduled on the audio clock
  // -------------------------------------------------------------------------

  /**
   * Loop a progression. Chord changes are decided by AudioContext time;
   * the timer only polls, so throttling can't skew the harmony.
   */
  async startProgression(progKey, rootIndex, barMs, onChordChange) {
    const prog = PROGRESSIONS[progKey];
    if (!prog) return;
    const ctx = await this.#ensure();

    this.stopProgression();
    this.#progKey = progKey;
    this.#progSteps = prog.steps;
    this.#progRoot = rootIndex;
    this.#progBarMs = barMs;
    this.#progIndex = 0;
    this.#onChordChange = onChordChange ?? null;

    const step = this.#progSteps[0];
    await this.play(rootIndex + step.offset, step.quality);
    this.#onChordChange?.(0, this.#current);
    this.#nextChangeAt = ctx.currentTime + barMs / 1000;

    this.#progTimer = setInterval(() => this.#progTick(), PROG_TICK_MS);
  }

  #progTick() {
    if (!this.#ctx || !this.#progSteps) return;
    if (this.#ctx.currentTime < this.#nextChangeAt - 0.05) return;

    this.#progIndex = (this.#progIndex + 1) % this.#progSteps.length;
    const step = this.#progSteps[this.#progIndex];
    this.play(this.#progRoot + step.offset, step.quality);
    this.#onChordChange?.(this.#progIndex, {
      rootIndex: ((this.#progRoot + step.offset) % 12 + 12) % 12,
      quality: step.quality,
    });
    this.#nextChangeAt += this.#progBarMs / 1000;
  }

  stopProgression() {
    if (this.#progTimer) {
      clearInterval(this.#progTimer);
      this.#progTimer = null;
    }
    this.#progSteps = null;
    this.#progKey = null;
    this.#onChordChange = null;
  }
}

export const droneSynth = new DroneSynth();
