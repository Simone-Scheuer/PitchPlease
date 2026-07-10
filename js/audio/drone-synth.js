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

/**
 * `intervals` (semitones) drive display + rail marks; `ratios` drive the
 * oscillators. Ratios are JUST INTONATION — pure 5/4 thirds and 3/2 fifths
 * lock on sustained tones where tempered intervals beat audibly. A drone
 * doesn't have to compromise with a piano, so it doesn't.
 */
export const CHORD_QUALITIES = Object.freeze({
  maj:  { label: 'MAJ',  suffix: '',     intervals: [0, 4, 7],      ratios: [1, 5 / 4, 3 / 2] },
  min:  { label: 'MIN',  suffix: 'm',    intervals: [0, 3, 7],      ratios: [1, 6 / 5, 3 / 2] },
  dom7: { label: '7',    suffix: '7',    intervals: [0, 4, 7, 10],  ratios: [1, 5 / 4, 3 / 2, 7 / 4] },
  m7:   { label: 'm7',   suffix: 'm7',   intervals: [0, 3, 7, 10],  ratios: [1, 6 / 5, 3 / 2, 9 / 5] },
  maj7: { label: 'MAJ7', suffix: 'maj7', intervals: [0, 4, 7, 11],  ratios: [1, 5 / 4, 3 / 2, 15 / 8] },
  sus4: { label: 'SUS4', suffix: 'sus4', intervals: [0, 5, 7],      ratios: [1, 4 / 3, 3 / 2] },
  p5:   { label: '5',    suffix: '5',    intervals: [0, 7],         ratios: [1, 3 / 2] },
  dim:  { label: 'DIM',  suffix: '°',    intervals: [0, 3, 6],      ratios: [1, 6 / 5, 7 / 5] },
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

/** Sampled voices (bundled FluidR3 notes) vs oscillator waves. */
export const SAMPLE_VOICES = Object.freeze({
  piano: { label: 'PIANO', url: 'assets/samples/piano.json' },
  epiano: { label: 'KEYS', url: 'assets/samples/epiano.json' },
  guitar: { label: 'GUITAR', url: 'assets/samples/guitar.json' },
});

export function isSampleVoice(voice) {
  return voice in SAMPLE_VOICES;
}

/** Note classes (0–11) sounding in a chord. */
export function chordNoteClasses(rootIndex, qualityKey) {
  const intervals = CHORD_QUALITIES[qualityKey]?.intervals ?? [];
  return new Set(intervals.map(i => (rootIndex + i) % 12));
}

// ---------------------------------------------------------------------------
// Voicing constants
// ---------------------------------------------------------------------------

const FADE_STRIKE_S = 0.3;
const FADE_FLOW_S = 0.9;    // chords bloom into each other in FLOW style
const FADE_FAST_S = 0.1;    // user-triggered changes land immediately
const STAGGER_S = 0.055;    // FLOW strikes roll gently instead of hitting as a block
const PAD_GAIN = 0.028;     // FLOW's pad: measured 2026-07-09 — at 0.05 it
                            // buried the piano strikes by >20 dB (spectral
                            // analysis, tools/analyze-audio.mjs). Keep the pad
                            // a floor under the strikes, never the ceiling.
const STRIKE_RELEASE_S = 0.3; // strikes release INTO the bar boundary
const DETUNE_CENTS = 2.0;   // enough width to feel alive, no wub-wub beating

function fadeS() {
  return settings.get('droneStyle') === 'flow' ? FADE_FLOW_S : FADE_STRIKE_S;
}
const TONE_GAIN = 0.16;
const SUB_GAIN = 0.16;
const FILTER_LFO_HZ = 0.04;
const FILTER_LFO_DEPTH = 55;
const PROG_TICK_MS = 150;
const REVERB_SECONDS = 2.4;

/** Root lands in octave 2–3 (LOW) or 3–4 (HIGH register). */
function rootMidiFor(rootIndex) {
  const midi = 48 + rootIndex; // C3..B3
  const low = rootIndex > 7 ? midi - 12 : midi;
  return settings.get('droneRegister') === 'high' ? low + 12 : low;
}

// ---------------------------------------------------------------------------
// Sample banks — lazy-loaded, decoded once, cached across contexts
// ---------------------------------------------------------------------------

const bankCache = new Map();   // voice -> Map<midi, AudioBuffer>
const bankLoading = new Map(); // voice -> Promise

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function loadBank(voice, ctx) {
  if (bankCache.has(voice)) return bankCache.get(voice);
  if (!bankLoading.has(voice)) {
    bankLoading.set(voice, (async () => {
      const res = await fetch(SAMPLE_VOICES[voice].url);
      const json = await res.json();
      const bank = new Map();
      await Promise.all(Object.entries(json).map(async ([midi, b64]) => {
        const buf = await ctx.decodeAudioData(base64ToArrayBuffer(b64));
        bank.set(Number(midi), buf);
      }));
      bankCache.set(voice, bank);
      return bank;
    })());
  }
  return bankLoading.get(voice);
}

/** Nearest sampled midi to a target frequency (samples are A440-tuned). */
function nearestSample(bank, targetHz) {
  let best = null;
  let bestDist = Infinity;
  for (const midi of bank.keys()) {
    const dist = Math.abs(midiToFrequency(midi) - targetHz);
    if (dist < bestDist) { bestDist = dist; best = midi; }
  }
  return best;
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
  // Every chain that has ever started and not yet been dismantled. play()
  // has awaits (sample bank loads) — two overlapping plays used to orphan
  // a chain that no stop() could reach: the "ghost drone". The registry
  // makes install-time sweep-out and stop() exhaustive.
  #liveChains = new Set();
  #generation = 0;     // bumped by play() and stop(); stale plays abort

  // Progression state
  #progTimer = null;
  #progSteps = null;
  #progIndex = 0;
  #progRoot = 0;
  #progBarMs = 4000;
  #nextChangeAt = 0;   // audio-clock seconds
  #onChordChange = null;
  #progKey = null;

  // HOLD-mode sample restrike
  #strikeTimer = null;
  #nextStrikeAt = 0;

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
  #out = null;

  /** Everything the drone makes leaves through this node (analysis tap). */
  get output() {
    return this.#out;
  }

  async #ensure() {
    await mic.ensureAudioContext();
    const ctx = mic.audioContext;
    if (this.#ctx !== ctx) {
      // Fresh context — rebuild master chain: master → dry + reverb-wet → out
      this.#ctx = ctx;
      this.#out = ctx.createGain();
      this.#out.connect(ctx.destination);
      this.#master = ctx.createGain();
      this.#master.gain.value = settings.get('droneVolume');
      this.#master.connect(this.#out); // dry
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx);
      this.#wet = ctx.createGain();
      this.#wet.gain.value = settings.get('droneSpace');
      this.#master.connect(convolver);
      convolver.connect(this.#wet);
      this.#wet.connect(this.#out);
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

  /** Rebuild the sounding chord with current voice/register — immediately. */
  revoice() {
    if (this.#current) this.play(this.#current.rootIndex, this.#current.quality, FADE_FAST_S);
  }

  /** Bar length changes apply from the next chord boundary — no restart. */
  setBarMs(ms) {
    this.#progBarMs = ms;
  }

  /** Re-key a running progression from the next bar — no restart, no jump. */
  setProgressionRoot(rootIndex) {
    this.#progRoot = rootIndex;
  }

  /**
   * Start (or crossfade to) a chord.
   * @param {number|null} fade - crossfade seconds; defaults to a fast attack
   *   when nothing sounds yet, or the style fade when replacing a chord.
   */
  async play(rootIndex, qualityKey, fade = null) {
    const gen = ++this.#generation;
    const ctx = await this.#ensure();
    const quality = CHORD_QUALITIES[qualityKey];
    if (!quality) return;

    // All awaits happen BEFORE any node is created. If a newer play() or a
    // stop() arrived while we were loading, this call is stale: bail out.
    const voice = settings.get('droneVoice');
    const bank = isSampleVoice(voice) ? await loadBank(voice, ctx) : null;
    if (gen !== this.#generation) return;

    const old = this.#chain;
    const t = ctx.currentTime;
    const fadeIn = fade ?? (old ? fadeS() : FADE_FAST_S);

    // Build the new chord chain (synchronous from here — no interleaving)
    const chainGain = ctx.createGain();
    chainGain.gain.setValueAtTime(0, t);
    chainGain.gain.linearRampToValueAtTime(1, t + fadeIn);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = settings.get('droneCutoff');
    filter.Q.value = 0.7;
    this.#lfoGain.connect(filter.frequency);
    filter.connect(chainGain);
    chainGain.connect(this.#master);

    const rootHz = midiToFrequency(rootMidiFor(rootIndex), settings.get('a4'));
    // Just-intonation frequencies straight from the ratios + octave double
    const tonesHz = [
      ...quality.ratios.map(r => rootHz * r),
      rootHz * 2,
    ];

    if (bank) {
      const oscs = [];
      // FLOW: a quiet sustained sine pad under the strikes carries the
      // chord between hits and blooms through the long crossfade.
      if (settings.get('droneStyle') === 'flow') {
        const addPad = (hz, gainValue) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = hz;
          const g = ctx.createGain();
          g.gain.value = gainValue;
          osc.connect(g);
          g.connect(filter);
          osc.start(t);
          oscs.push(osc);
        };
        addPad(rootHz / 2, PAD_GAIN * 0.9); // sub pad measured loudest-in-mix at 1.4x — keep it under the chord
        for (const hz of tonesHz) addPad(hz, PAD_GAIN);
      }
      this.#chain = { gain: chainGain, filter, oscs, sources: [], bank, tonesHz };
      this.#strikeInto(this.#chain, ctx.currentTime);
      this.#armStrikes();
    } else {
      this.#disarmStrikes();
      const oscs = [];
      const addOsc = (hz, type, gainValue, detune) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = hz;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = gainValue;
        osc.connect(g);
        g.connect(filter);
        osc.start(t);
        oscs.push(osc);
      };

      addOsc(rootHz / 2, 'sine', SUB_GAIN, 0); // sub always sine
      for (const hz of tonesHz) {
        if (voice === 'sine') {
          // Pure organ: one osc per tone. Detuned sine pairs just tremolo.
          addOsc(hz, voice, TONE_GAIN * 1.6, 0);
        } else {
          addOsc(hz, voice, TONE_GAIN, -DETUNE_CENTS);
          addOsc(hz, voice, TONE_GAIN, DETUNE_CENTS);
        }
      }
      this.#chain = { gain: chainGain, filter, oscs, sources: [] };
    }

    this.#current = { rootIndex: ((rootIndex % 12) + 12) % 12, quality: qualityKey };
    this.#liveChains.add(this.#chain);

    // Sweep out EVERY other live chain, not just the last-known one —
    // this is what makes an orphaned ghost drone impossible.
    for (const other of this.#liveChains) {
      if (other !== this.#chain) this.#dismantle(other, t, fadeIn);
    }
  }

  /**
   * One strike of the current chord's samples into a chain.
   * The note length IS the bar length: each strike's gain releases into
   * the bar boundary (pedal up on the change), so tails never stack.
   */
  #strikeInto(chain, when) {
    const flow = settings.get('droneStyle') === 'flow';
    const stagger = flow ? STAGGER_S : 0;
    // In FLOW the strikes compete with the sustained pad — give them
    // more level so the attack reads (measured: at equal gain the pad
    // time-averages louder and the strikes disappear).
    const strikeGain = flow ? 0.9 : 0.55;
    const barS = Math.max(0.5, settings.get('droneBarMs') / 1000);
    const release = Math.min(STRIKE_RELEASE_S, barS * 0.4);
    chain.tonesHz.forEach((hz, i) => {
      const sampleMidi = nearestSample(chain.bank, hz);
      const buf = chain.bank.get(sampleMidi);
      if (!buf) return;
      const src = this.#ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = hz / midiToFrequency(sampleMidi);
      const g = this.#ctx.createGain();
      const t0 = when + i * stagger; // FLOW rolls the chord gently
      g.gain.setValueAtTime(strikeGain, t0);
      g.gain.setValueAtTime(strikeGain, t0 + barS - release);
      g.gain.linearRampToValueAtTime(0.0001, t0 + barS);
      src.connect(g);
      g.connect(chain.filter);
      src.start(t0);
      src.stop(t0 + barS + 0.05);
      chain.sources.push(src);
    });
    if (chain.sources.length > 48) chain.sources.splice(0, chain.sources.length - 48);
  }

  /** HOLD mode: re-strike sampled voices every bar so the chord keeps ringing. */
  #armStrikes() {
    this.#disarmStrikes();
    if (this.#progSteps) return; // progressions strike on every chord change
    this.#nextStrikeAt = this.#ctx.currentTime + settings.get('droneBarMs') / 1000;
    this.#strikeTimer = setInterval(() => {
      if (!this.#chain?.bank || !this.#ctx) return;
      if (this.#ctx.currentTime >= this.#nextStrikeAt - 0.05) {
        this.#strikeInto(this.#chain, this.#ctx.currentTime);
        this.#nextStrikeAt += settings.get('droneBarMs') / 1000;
      }
    }, PROG_TICK_MS);
  }

  #disarmStrikes() {
    if (this.#strikeTimer) {
      clearInterval(this.#strikeTimer);
      this.#strikeTimer = null;
    }
  }

  #dismantle(chain, t, fade = null) {
    fade = fade ?? fadeS();
    this.#liveChains.delete(chain);
    try {
      chain.gain.gain.setValueAtTime(chain.gain.gain.value, t);
      chain.gain.gain.linearRampToValueAtTime(0, t + fade);
      for (const osc of chain.oscs) osc.stop(t + fade + 0.05);
      for (const src of chain.sources ?? []) {
        try { src.stop(t + fade + 0.05); } catch { /* already ended */ }
      }
      setTimeout(() => {
        try {
          this.#lfoGain?.disconnect(chain.filter.frequency);
          chain.filter.disconnect();
          chain.gain.disconnect();
        } catch { /* already gone */ }
      }, (fade + 0.15) * 1000);
    } catch { /* context closed */ }
  }

  stop() {
    ++this.#generation; // any play() still awaiting its sample bank aborts
    this.stopProgression();
    this.#disarmStrikes();
    if (this.#ctx) {
      const t = this.#ctx.currentTime;
      for (const chain of [...this.#liveChains]) this.#dismantle(chain, t, FADE_STRIKE_S);
    }
    this.#liveChains.clear();
    this.#chain = null;
    this.#current = null;
  }

  /** 0–1 through the current bar of a progression, or null when holding. */
  get barProgress() {
    if (!this.#ctx || !this.#progSteps) return null;
    const barS = this.#progBarMs / 1000;
    return Math.max(0, Math.min(1, 1 - (this.#nextChangeAt - this.#ctx.currentTime) / barS));
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
