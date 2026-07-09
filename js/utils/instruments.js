/**
 * instruments.js — Instrument profiles: native note labels, ranges, positions.
 *
 * An instrument profile turns a raw MIDI number into what the player actually
 * thinks in: harmonica tab tokens ("4", "-4", "-3'"), tin whistle fingerings
 * (●●●○○○), or nothing (voice). Profiles also provide a sensible default
 * graph range and, for harmonica, position math (circle of fifths).
 *
 * Pure data/math module — no DOM, no audio, no event bus.
 */

import { getHoleLayout, getBendsForHole, HARMONICA_KEYS } from './harmonica.js';
import { ROOT_NAMES } from './scales.js';

// ---------------------------------------------------------------------------
// Instrument catalog
// ---------------------------------------------------------------------------

export const INSTRUMENTS = Object.freeze({
  harmonica: {
    id: 'harmonica',
    label: 'Harmonica',
    shortLabel: 'harp',
    keys: HARMONICA_KEYS,
    defaultKey: 'C',
  },
  whistle: {
    id: 'whistle',
    label: 'Tin whistle',
    shortLabel: 'whistle',
    keys: ['C', 'D', 'Eb', 'F', 'G', 'Bb', 'Low D'],
    defaultKey: 'D',
  },
  voice: {
    id: 'voice',
    label: 'Voice / free',
    shortLabel: 'voice',
    keys: null,
    defaultKey: null,
  },
});

// ---------------------------------------------------------------------------
// Harmonica native labels
// ---------------------------------------------------------------------------

/**
 * Build a Map of midi → { token, kind, desc } for a harp key.
 * kind: 'blow' | 'draw' | 'bend'. When a pitch is playable more than one way
 * (e.g. 2 draw = 3 blow), tokens join with "/" and the first is canonical.
 */
function harmonicaMap(key) {
  const map = new Map();

  const add = (midi, token, kind, desc) => {
    const existing = map.get(midi);
    if (existing) {
      existing.token = `${existing.token}/${token}`;
      return;
    }
    map.set(midi, { token, kind, desc });
  };

  const layout = getHoleLayout(key);
  for (const { hole, blowMidi, drawMidi } of layout) {
    add(blowMidi, `${hole}`, 'blow', `blow ${hole}`);
  }
  for (const { hole, drawMidi } of layout) {
    add(drawMidi, `-${hole}`, 'draw', `draw ${hole}`);
  }
  for (const { hole } of layout) {
    for (const bend of getBendsForHole(key, hole)) {
      const ticks = "'".repeat(bend.stepDown);
      const token = bend.type === 'draw' ? `-${hole}${ticks}` : `${hole}${ticks}`;
      add(bend.midi, token, 'bend', `${bend.type} ${hole}, bend ${bend.stepDown}`);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tin whistle native labels
// ---------------------------------------------------------------------------

/** Whistle key → MIDI of the six-fingers-down bell note (D5 for a soprano D). */
const WHISTLE_ROOT_MIDI = Object.freeze({
  'C': 72, 'D': 74, 'Eb': 75, 'F': 77, 'G': 79, 'Bb': 70, 'Low D': 62,
});

/**
 * Standard six-hole fingerings by semitone offset from the bell note.
 * true = hole closed. C-natural cross-fingering (offset 10) included.
 * Chromatic half-holings (1, 3, 6, 8) are omitted on purpose.
 */
const WHISTLE_FINGERINGS = Object.freeze({
  0:  [1, 1, 1, 1, 1, 1],
  2:  [1, 1, 1, 1, 1, 0],
  4:  [1, 1, 1, 1, 0, 0],
  5:  [1, 1, 1, 0, 0, 0],
  7:  [1, 1, 0, 0, 0, 0],
  9:  [1, 0, 0, 0, 0, 0],
  10: [0, 1, 1, 0, 0, 0],
  11: [0, 0, 0, 0, 0, 0],
});

function whistleToken(holes) {
  return holes.map(h => (h ? '●' : '○')).join('');
}

function whistleMap(key) {
  const root = WHISTLE_ROOT_MIDI[key];
  if (root == null) return new Map();

  const map = new Map();
  // Two octaves; the second octave repeats the fingerings (overblown).
  for (let octave = 0; octave < 2; octave++) {
    for (const [offsetStr, holes] of Object.entries(WHISTLE_FINGERINGS)) {
      const offset = Number(offsetStr);
      const midi = root + octave * 12 + offset;
      // Second-octave D conventionally vents the top hole
      const fingering = (octave === 1 && offset === 0) ? [0, 1, 1, 1, 1, 1] : holes;
      map.set(midi, {
        token: whistleToken(fingering),
        kind: 'fingering',
        holes: fingering,
        desc: octave === 1 ? '2nd octave' : '',
      });
    }
  }
  // Top of range: the third-octave bell note is playable and common
  map.set(root + 24, { token: whistleToken([1, 1, 1, 1, 1, 1]), kind: 'fingering', holes: [1, 1, 1, 1, 1, 1], desc: '3rd octave' });
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const mapCache = new Map();

/**
 * Native label map for an instrument+key.
 * @returns {Map<number, { token: string, kind: string, desc?: string, holes?: number[] }>}
 */
export function getNativeMap(instrument, key) {
  if (instrument === 'voice' || !key) return new Map();
  const cacheKey = `${instrument}:${key}`;
  if (!mapCache.has(cacheKey)) {
    const map = instrument === 'harmonica' ? harmonicaMap(key)
      : instrument === 'whistle' ? whistleMap(key)
      : new Map();
    mapCache.set(cacheKey, map);
  }
  return mapCache.get(cacheKey);
}

/** Default graph range (MIDI) for an instrument+key, with a little headroom. */
export function getDefaultRange(instrument, key) {
  if (instrument === 'harmonica') {
    const layout = getHoleLayout(key);
    return { low: layout[0].blowMidi - 2, high: layout[9].blowMidi + 2 };
  }
  if (instrument === 'whistle') {
    const root = WHISTLE_ROOT_MIDI[key];
    if (root != null) return { low: root - 2, high: root + 26 };
  }
  return { low: 48, high: 84 }; // voice: C3–C6
}

/** Flat harp-key names → the sharp names used by ROOT_NAMES. */
const FLAT_TO_SHARP = Object.freeze({ 'Ab': 'G#', 'Bb': 'A#', 'Db': 'C#', 'Eb': 'D#' });

function toSharpName(name) {
  return FLAT_TO_SHARP[name] ?? name;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

/**
 * Harmonica position for playing in `rootName` on a `harpKey` harp.
 * Positions follow the circle of fifths: 1st = harp key (straight),
 * 2nd = a fifth up (cross harp), 3rd = two fifths up, etc.
 *
 * @returns {{ position: number, label: string }}
 */
export function harpPosition(harpKey, rootName) {
  const keyIdx = ROOT_NAMES.indexOf(toSharpName(harpKey));
  const rootIdx = ROOT_NAMES.indexOf(toSharpName(rootName));
  if (keyIdx === -1 || rootIdx === -1) return { position: 0, label: '' };
  const interval = (rootIdx - keyIdx + 12) % 12;
  // Multiplying by 7 (a fifth) mod 12 inverts "semitones up" to "fifths up"
  const position = ((interval * 7) % 12) + 1;
  return { position, label: ORDINALS[position - 1] };
}

/**
 * Describe a (rounded) MIDI pitch in the instrument's own terms, for the HUD.
 * @returns {{ token: string, kind: string, desc: string } | null}
 */
export function describePitch(instrument, key, midi) {
  const entry = getNativeMap(instrument, key).get(Math.round(midi));
  if (!entry) return null;
  return { token: entry.token, kind: entry.kind, desc: entry.desc ?? '', holes: entry.holes ?? null };
}

/**
 * New A4 reference such that a note currently reading `meanCents` off
 * becomes centered. Used by the "tune to my instrument" calibration flow.
 */
export function a4FromOffset(currentA4, meanCents) {
  return currentA4 * Math.pow(2, meanCents / 1200);
}
