/**
 * harmonica.js — Diatonic harmonica data model.
 *
 * Standard Richter tuning layout for a 10-hole diatonic harmonica.
 * All values are semitone offsets from the root note of the key.
 * Supports any key from G (low harp) through F# (high harp).
 *
 * Pure data module — no DOM, no audio, no event bus.
 */

import { NOTE_NAMES } from './constants.js';
import { formatNote } from '../audio/note-math.js';

// ---------------------------------------------------------------------------
// Richter tuning: semitone offsets from root (hole 1 blow = 0)
// ---------------------------------------------------------------------------

/**
 * Standard Richter tuning layout.
 * Each entry: { blow: semitone offset, draw: semitone offset }
 *
 * For a C harp (root = C4, MIDI 60):
 *   Hole 1: blow C4 (0), draw D4 (2)
 *   Hole 2: blow E4 (4), draw G4 (7)
 *   ...
 */
const RICHTER_HOLES = Object.freeze([
  { blow: 0,  draw: 2  },  // Hole 1:  C4, D4
  { blow: 4,  draw: 7  },  // Hole 2:  E4, G4
  { blow: 7,  draw: 11 },  // Hole 3:  G4, B4
  { blow: 12, draw: 14 },  // Hole 4:  C5, D5
  { blow: 16, draw: 17 },  // Hole 5:  E5, F5
  { blow: 19, draw: 21 },  // Hole 6:  G5, A5
  { blow: 24, draw: 23 },  // Hole 7:  C6, B5
  { blow: 28, draw: 26 },  // Hole 8:  E6, D6
  { blow: 31, draw: 29 },  // Hole 9:  G6, F6
  { blow: 36, draw: 33 },  // Hole 10: C7, A6
]);

// ---------------------------------------------------------------------------
// Key → root MIDI mapping
// ---------------------------------------------------------------------------

/**
 * Root MIDI note for hole 1 blow in each standard harp key.
 *
 * Standard harps:
 *   G (55, G3) through F# (66, F#4)
 *
 * Keys G through B are "low" harps starting at octave 3.
 * Keys C through F# start at octave 4.
 */
const KEY_ROOT_MIDI = Object.freeze({
  'G':  55,  // G3
  'Ab': 56,  // Ab3
  'A':  57,  // A3
  'Bb': 58,  // Bb3
  'B':  59,  // B3
  'C':  60,  // C4
  'Db': 61,  // Db4
  'D':  62,  // D4
  'Eb': 63,  // Eb4
  'E':  64,  // E4
  'F':  65,  // F4
  'F#': 66,  // F#4
});

/**
 * All supported harmonica keys, ordered chromatically from lowest to highest.
 */
export const HARMONICA_KEYS = Object.freeze([
  'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#',
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a MIDI note number to a note name string (e.g. "C4", "Bb3").
 * Uses the project-wide NOTE_NAMES which use sharps (C#, D#, F#, G#, A#).
 * For harmonica display, we remap to flats where conventional.
 *
 * @param {number} midi - Integer MIDI note
 * @returns {string} Note name with octave
 */
function midiToNoteName(midi) {
  const rounded = Math.round(midi);
  const noteIndex = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return formatNote(NOTE_NAMES[noteIndex], octave);
}

/**
 * Difficulty order for draw bends (hole numbers).
 * Lower index = easier. Used by getDifficultySorted().
 */
const DRAW_BEND_DIFFICULTY_ORDER = [4, 1, 6, 5, 2, 3];

/**
 * Difficulty order for blow bends (hole numbers).
 * All blow bends are considered harder than all draw bends.
 */
const BLOW_BEND_DIFFICULTY_ORDER = [8, 9, 7, 10];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the full hole layout for a harmonica in the given key.
 *
 * @param {string} [key='C'] - Harp key (one of HARMONICA_KEYS)
 * @returns {Array<{ hole: number, blowMidi: number, drawMidi: number, blowNote: string, drawNote: string }>}
 */
export function getHoleLayout(key = 'C') {
  const rootMidi = KEY_ROOT_MIDI[key];
  if (rootMidi == null) {
    throw new Error(`Unknown harmonica key: "${key}". Must be one of: ${HARMONICA_KEYS.join(', ')}`);
  }

  return RICHTER_HOLES.map((hole, i) => {
    const blowMidi = rootMidi + hole.blow;
    const drawMidi = rootMidi + hole.draw;
    return {
      hole: i + 1,
      blowMidi,
      drawMidi,
      blowNote: midiToNoteName(blowMidi),
      drawNote: midiToNoteName(drawMidi),
    };
  });
}

/**
 * Get all available bends for a specific hole.
 *
 * Draw bends (holes 1-6): pitch bends DOWN from draw note toward blow note.
 *   Number of bends = (drawOffset - blowOffset - 1) semitone steps.
 *   Each bend target MIDI = drawMidi - stepDown (stepDown = 1, 2, 3...)
 *
 * Blow bends (holes 7-10): pitch bends DOWN from blow note toward draw note.
 *   Number of bends = (blowOffset - drawOffset - 1) semitone steps.
 *   Each bend target MIDI = blowMidi - stepDown
 *
 * @param {string} [key='C'] - Harp key
 * @param {number} hole - Hole number (1-10)
 * @returns {Array<{ hole: number, type: 'draw'|'blow', stepDown: number, midi: number, note: string, label: string }>}
 */
export function getBendsForHole(key = 'C', hole) {
  const rootMidi = KEY_ROOT_MIDI[key];
  if (rootMidi == null) {
    throw new Error(`Unknown harmonica key: "${key}". Must be one of: ${HARMONICA_KEYS.join(', ')}`);
  }
  if (hole < 1 || hole > 10) {
    throw new Error(`Hole must be 1-10, got: ${hole}`);
  }

  const holeData = RICHTER_HOLES[hole - 1];
  const blowMidi = rootMidi + holeData.blow;
  const drawMidi = rootMidi + holeData.draw;
  const bends = [];

  if (drawMidi > blowMidi) {
    // Draw bends (holes 1-6 in standard tuning)
    const bendCount = drawMidi - blowMidi - 1;
    for (let step = 1; step <= bendCount; step++) {
      const midi = drawMidi - step;
      const note = midiToNoteName(midi);
      const arrow = '\u2193'; // down arrow
      bends.push({
        hole,
        type: 'draw',
        stepDown: step,
        midi,
        note,
        label: `Hole ${hole} Draw ${arrow}${step} (${note})`,
      });
    }
  } else if (blowMidi > drawMidi) {
    // Blow bends (holes 7-10 in standard tuning)
    const bendCount = blowMidi - drawMidi - 1;
    for (let step = 1; step <= bendCount; step++) {
      const midi = blowMidi - step;
      const note = midiToNoteName(midi);
      const arrow = '\u2193'; // down arrow
      bends.push({
        hole,
        type: 'blow',
        stepDown: step,
        midi,
        note,
        label: `Hole ${hole} Blow ${arrow}${step} (${note})`,
      });
    }
  }

  return bends;
}

/**
 * Get all bend targets for a harp key, optionally filtered.
 *
 * Returns bend targets sorted by difficulty (easiest first).
 *
 * @param {string} [key='C'] - Harp key
 * @param {Object} [options={}]
 * @param {'draw'|'blow'|null} [options.type=null] - Filter by bend type
 * @param {number|null} [options.maxStepDown=null] - Filter by max step (e.g. 1 for half-step only)
 * @returns {Array<{ hole: number, type: 'draw'|'blow', stepDown: number, midi: number, note: string, label: string, difficulty: number }>}
 */
export function getBendTargets(key = 'C', options = {}) {
  const { type = null, maxStepDown = null } = options;
  const allBends = [];

  for (let hole = 1; hole <= 10; hole++) {
    const bends = getBendsForHole(key, hole);
    for (const bend of bends) {
      if (type != null && bend.type !== type) continue;
      if (maxStepDown != null && bend.stepDown > maxStepDown) continue;
      allBends.push(bend);
    }
  }

  // Assign difficulty scores and sort
  return assignDifficulty(allBends);
}

/**
 * Get all bends sorted from easiest to hardest.
 *
 * Difficulty ordering:
 *   1. Draw bends by hole order: 4, 1, 6, 5, 2, 3
 *      Within each hole, step 1 before step 2 before step 3.
 *   2. Blow bends by hole order: 8, 9, 7, 10
 *      Within each hole, step 1 before step 2.
 *
 * @param {string} [key='C'] - Harp key
 * @returns {Array<{ hole: number, type: 'draw'|'blow', stepDown: number, midi: number, note: string, label: string, difficulty: number }>}
 */
export function getDifficultySorted(key = 'C') {
  return getBendTargets(key);
}

// ---------------------------------------------------------------------------
// Internal — difficulty assignment
// ---------------------------------------------------------------------------

/**
 * Assign a numeric difficulty score to each bend and sort by it.
 *
 * Draw bends come first (easier), ordered by the conventional difficulty
 * ordering for harmonica players. Within each hole, shallower bends
 * (step 1) come before deeper bends (step 2, 3).
 *
 * Blow bends come after all draw bends.
 *
 * @param {Array} bends
 * @returns {Array} Sorted bends with difficulty property added
 */
function assignDifficulty(bends) {
  const scored = bends.map(bend => {
    let basePriority;
    let orderList;

    if (bend.type === 'draw') {
      orderList = DRAW_BEND_DIFFICULTY_ORDER;
      // Draw bends: base priority 0-59 (before blow bends)
      const holeRank = orderList.indexOf(bend.hole);
      // If hole not in list (shouldn't happen), put at end
      basePriority = holeRank >= 0 ? holeRank * 10 : 59;
    } else {
      orderList = BLOW_BEND_DIFFICULTY_ORDER;
      // Blow bends: base priority 60+ (after all draw bends)
      const holeRank = orderList.indexOf(bend.hole);
      basePriority = 60 + (holeRank >= 0 ? holeRank * 10 : 39);
    }

    // Within each hole, deeper bends are harder
    const difficulty = basePriority + (bend.stepDown - 1);

    return { ...bend, difficulty };
  });

  scored.sort((a, b) => a.difficulty - b.difficulty);
  return scored;
}
