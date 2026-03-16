import { SCALE_INTERVALS, SCALE_LABELS, ROOT_NAMES } from './scales.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note number to note string (e.g., 60 → "C4")
 */
function midiToNoteStr(midi) {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Get all MIDI notes in a scale within an octave range.
 */
function getScaleMidiNotes(root, scaleKey, octaveLow, octaveHigh) {
  const rootIndex = ROOT_NAMES.indexOf(root);
  if (rootIndex === -1) return [];
  const intervals = SCALE_INTERVALS[scaleKey];
  if (!intervals) return [];

  const notes = [];
  for (let octave = octaveLow; octave <= octaveHigh; octave++) {
    for (const interval of intervals) {
      const midi = (octave + 1) * 12 + rootIndex + interval;
      // Include the root of the top octave as endpoint
      if (octave === octaveHigh && interval > 0) continue;
      notes.push(midi);
    }
  }
  // Add the top root note
  const topRoot = (octaveHigh + 1) * 12 + rootIndex;
  if (!notes.includes(topRoot)) {
    notes.push(topRoot);
  }
  notes.sort((a, b) => a - b);
  return notes;
}

/**
 * Apply pattern to a set of MIDI notes.
 */
function applyPattern(midiNotes, pattern) {
  switch (pattern) {
    case 'descending':
      return [...midiNotes].reverse();

    case 'up-and-back': {
      const up = [...midiNotes];
      const down = [...midiNotes].reverse().slice(1); // skip duplicate top note
      return [...up, ...down];
    }

    case 'random': {
      const shuffled = [...midiNotes];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    case 'ascending':
    default:
      return [...midiNotes];
  }
}

/**
 * Generate a practice exercise.
 *
 * @param {Object} params
 * @param {string} params.root - Root note name (e.g., 'C', 'F#')
 * @param {string} params.scale - Scale key (e.g., 'major', 'blues')
 * @param {number} params.octaveLow - Lowest octave (e.g., 3)
 * @param {number} params.octaveHigh - Highest octave (e.g., 5)
 * @param {number} params.noteDuration - Duration per note in ms (default 1000)
 * @param {number} params.noteGap - Gap between notes in ms (default 300)
 * @param {string} params.pattern - 'ascending' | 'descending' | 'up-and-back' | 'random'
 * @returns {Object} Song-compatible object for songEngine.load()
 */
export function generateExercise({
  root = 'C',
  scale = 'major',
  octaveLow = 3,
  octaveHigh = 5,
  noteDuration = 1000,
  noteGap = 300,
  pattern = 'ascending',
} = {}) {
  const midiNotes = getScaleMidiNotes(root, scale, octaveLow, octaveHigh);
  const orderedNotes = applyPattern(midiNotes, pattern);

  const scaleLabel = SCALE_LABELS[scale] || scale;
  const patternLabel = pattern.replace(/-/g, ' ');
  const rangeLabel = `${root}${octaveLow}–${root}${octaveHigh}`;
  const title = `${root} ${scaleLabel} · ${rangeLabel} · ${patternLabel}`;

  const notes = [];
  for (const midi of orderedNotes) {
    notes.push({
      note: midiToNoteStr(midi),
      duration: noteDuration,
    });
    // Add gap as a rest if noteGap > 0
    // We encode the gap into the duration by extending each note
    // Actually, the song engine treats notes as continuous — add gap to duration
  }

  // Determine difficulty based on note count and duration
  const totalNotes = notes.length;
  const difficulty = totalNotes <= 8 ? 'easy'
    : totalNotes <= 15 ? 'medium'
    : 'hard';

  return {
    id: `exercise-${root}-${scale}-${pattern}-${Date.now()}`,
    title,
    difficulty,
    bpm: Math.round(60000 / (noteDuration + noteGap)),
    notes: notes.map(n => ({
      ...n,
      duration: n.duration + noteGap, // include gap in duration for spacing
    })),
    generated: true, // flag so we know it's dynamic
  };
}

export const PATTERNS = [
  { key: 'ascending', label: 'Ascending' },
  { key: 'descending', label: 'Descending' },
  { key: 'up-and-back', label: 'Up & Back' },
  { key: 'random', label: 'Random' },
];

export const DURATION_PRESETS = [
  { key: 'short', label: 'Short', ms: 500 },
  { key: 'medium', label: 'Medium', ms: 800 },
  { key: 'long', label: 'Long', ms: 1200 },
  { key: 'very-long', label: 'Very Long', ms: 2000 },
];
