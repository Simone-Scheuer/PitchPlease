/**
 * synth.js — Audio output for drones, reference tones, and phrase playback.
 *
 * Shares the AudioContext from mic.js to avoid multiple contexts (iOS limit).
 * All output goes through a master gain node for global volume control.
 * Gentle envelopes (attack/release ramps) prevent clicks.
 */

import { mic } from './mic.js';
import { midiToFrequency } from './note-math.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_GAIN = 0.25;
const ATTACK_MS = 20;
const RELEASE_MS = 80;
const DRONE_FADE_IN_MS = 400;
const DRONE_FADE_OUT_MS = 300;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let masterGain = null;

function getCtx() {
  const ctx = mic.audioContext;
  if (!ctx) return null;

  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = DEFAULT_GAIN;
    masterGain.connect(ctx.destination);
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// playNote — single note with attack/release envelope
// ---------------------------------------------------------------------------

/**
 * Play a single note.
 * @param {number} midi - MIDI note number (integer)
 * @param {number} durationMs - Note duration in ms
 * @param {Object} [options]
 * @param {'sine'|'triangle'|'square'} [options.voice='sine']
 * @param {number} [options.gain=1] - Gain multiplier (0-1), applied on top of master
 * @returns {{ stop: () => void } | null}
 */
export function playNote(midi, durationMs, options = {}) {
  const ctx = getCtx();
  if (!ctx) return null;

  const { voice = 'sine', gain = 1 } = options;
  const freq = midiToFrequency(midi);
  const now = ctx.currentTime;
  const attackSec = ATTACK_MS / 1000;
  const releaseSec = RELEASE_MS / 1000;
  const durationSec = durationMs / 1000;

  const osc = ctx.createOscillator();
  osc.type = voice;
  osc.frequency.value = freq;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attackSec);
  env.gain.setValueAtTime(gain, now + durationSec - releaseSec);
  env.gain.linearRampToValueAtTime(0, now + durationSec);

  osc.connect(env);
  env.connect(masterGain);

  osc.start(now);
  osc.stop(now + durationSec + 0.01);

  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      const t = ctx.currentTime;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(env.gain.value, t);
      env.gain.linearRampToValueAtTime(0, t + releaseSec);
      osc.stop(t + releaseSec + 0.01);
    } catch {
      // Already stopped
    }
  }

  osc.onended = () => {
    stopped = true;
    try {
      osc.disconnect();
      env.disconnect();
    } catch {
      // Already disconnected
    }
  };

  return { stop };
}

// ---------------------------------------------------------------------------
// startDrone — sustained tone with gentle fade-in, returns stop handle
// ---------------------------------------------------------------------------

/**
 * Start a continuous drone tone.
 * @param {number} midi - MIDI note number
 * @param {Object} [options]
 * @param {'sine'|'triangle'|'square'} [options.voice='triangle']
 * @param {number} [options.gain=0.8] - Gain multiplier (0-1)
 * @returns {{ stop: () => void, pause: () => void, resume: () => void } | null}
 */
export function startDrone(midi, options = {}) {
  const ctx = getCtx();
  if (!ctx) return null;

  const { voice = 'triangle', gain = 0.8 } = options;
  const freq = midiToFrequency(midi);
  const now = ctx.currentTime;
  const fadeInSec = DRONE_FADE_IN_MS / 1000;
  const fadeOutSec = DRONE_FADE_OUT_MS / 1000;

  const osc = ctx.createOscillator();
  osc.type = voice;
  osc.frequency.value = freq;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + fadeInSec);

  osc.connect(env);
  env.connect(masterGain);
  osc.start(now);

  let stopped = false;
  let paused = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      const t = ctx.currentTime;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(env.gain.value, t);
      env.gain.linearRampToValueAtTime(0, t + fadeOutSec);
      osc.stop(t + fadeOutSec + 0.01);
    } catch {
      // Already stopped
    }
  }

  function pause() {
    if (stopped || paused) return;
    paused = true;
    const t = ctx.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(env.gain.value, t);
    env.gain.linearRampToValueAtTime(0, t + fadeOutSec);
  }

  function resume() {
    if (stopped || !paused) return;
    paused = false;
    const t = ctx.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + fadeInSec);
  }

  osc.onended = () => {
    stopped = true;
    try {
      osc.disconnect();
      env.disconnect();
    } catch {
      // Already disconnected
    }
  };

  return { stop, pause, resume };
}

// ---------------------------------------------------------------------------
// playPhrase — sequence of notes with timing
// ---------------------------------------------------------------------------

/**
 * Play a phrase (sequence of notes).
 * @param {Array<{ midi: number, durationMs: number, gapMs?: number }>} notes
 * @param {Object} [options]
 * @param {'sine'|'triangle'|'square'} [options.voice='sine']
 * @param {number} [options.gain=1]
 * @returns {Promise<void>} Resolves when phrase is done
 */
export function playPhrase(notes, options = {}) {
  const ctx = getCtx();
  if (!ctx) return Promise.resolve();

  const { voice = 'sine', gain = 1 } = options;

  return new Promise((resolve) => {
    let cancelled = false;
    let currentNote = null;
    let timeoutId = null;

    function playNext(index) {
      if (cancelled || index >= notes.length) {
        resolve();
        return;
      }

      const { midi, durationMs, gapMs = 50 } = notes[index];
      currentNote = playNote(midi, durationMs, { voice, gain });

      timeoutId = setTimeout(() => {
        currentNote = null;
        timeoutId = setTimeout(() => {
          playNext(index + 1);
        }, gapMs);
      }, durationMs);
    }

    playNext(0);

    // Return value is the promise; cancellation is handled via stop
    // The caller can't cancel mid-phrase right now, but the exercise
    // runtime's stop() will mute the master gain.
  });
}

// ---------------------------------------------------------------------------
// Master volume control
// ---------------------------------------------------------------------------

/**
 * Set master synth volume.
 * @param {number} level - 0 to 1
 */
export function setMasterGain(level) {
  if (!masterGain) return;
  const ctx = mic.audioContext;
  if (!ctx) return;
  const t = ctx.currentTime;
  masterGain.gain.setValueAtTime(masterGain.gain.value, t);
  masterGain.gain.linearRampToValueAtTime(level, t + 0.05);
}

/**
 * Clean up master gain node. Call when audio context is being destroyed.
 */
export function destroySynth() {
  if (masterGain) {
    try { masterGain.disconnect(); } catch { /* noop */ }
    masterGain = null;
  }
}
