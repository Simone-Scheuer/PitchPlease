// Scale intervals as semitone offsets from root
const SCALE_INTERVALS = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  harmonic_minor:   [0, 2, 3, 5, 7, 8, 11],
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const SCALE_LABELS = {
  major: 'Major',
  minor: 'Minor',
  pentatonic_major: 'Pentatonic Major',
  pentatonic_minor: 'Pentatonic Minor',
  blues: 'Blues',
  dorian: 'Dorian',
  mixolydian: 'Mixolydian',
  harmonic_minor: 'Harmonic Minor',
  chromatic: 'Chromatic',
};

const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Returns a Set of note indices (0–11) that belong to the given scale.
 * e.g., getScaleNotes('C', 'major') → Set {0, 2, 4, 5, 7, 9, 11}
 */
export function getScaleNotes(rootName, scaleKey) {
  const rootIndex = ROOT_NAMES.indexOf(rootName);
  if (rootIndex === -1) return new Set();
  const intervals = SCALE_INTERVALS[scaleKey];
  if (!intervals) return new Set();
  return new Set(intervals.map(i => (rootIndex + i) % 12));
}

/**
 * Check if a MIDI note number is in a given scale.
 */
export function isInScale(midi, rootName, scaleKey) {
  const noteIndex = ((midi % 12) + 12) % 12;
  return getScaleNotes(rootName, scaleKey).has(noteIndex);
}

export { SCALE_INTERVALS, SCALE_LABELS, ROOT_NAMES };
