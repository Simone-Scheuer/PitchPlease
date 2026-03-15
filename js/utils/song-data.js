/**
 * Song format:
 * {
 *   id: string,
 *   title: string,
 *   artist?: string,
 *   difficulty: 'easy' | 'medium' | 'hard',
 *   bpm: number,
 *   notes: [{ note: 'C4', duration: 500, lyric?: 'do' }, ...]
 * }
 *
 * note: note name + octave (e.g., "C4", "F#3")
 * duration: milliseconds
 * lyric: optional display text
 */

export const STARTER_SONGS = [
  {
    id: 'c-major-scale',
    title: 'C Major Scale',
    difficulty: 'easy',
    bpm: 80,
    notes: [
      { note: 'C4', duration: 750 },
      { note: 'D4', duration: 750 },
      { note: 'E4', duration: 750 },
      { note: 'F4', duration: 750 },
      { note: 'G4', duration: 750 },
      { note: 'A4', duration: 750 },
      { note: 'B4', duration: 750 },
      { note: 'C5', duration: 1500 },
      { note: 'B4', duration: 750 },
      { note: 'A4', duration: 750 },
      { note: 'G4', duration: 750 },
      { note: 'F4', duration: 750 },
      { note: 'E4', duration: 750 },
      { note: 'D4', duration: 750 },
      { note: 'C4', duration: 1500 },
    ],
  },
  {
    id: 'g-major-scale',
    title: 'G Major Scale',
    difficulty: 'easy',
    bpm: 80,
    notes: [
      { note: 'G3', duration: 750 },
      { note: 'A3', duration: 750 },
      { note: 'B3', duration: 750 },
      { note: 'C4', duration: 750 },
      { note: 'D4', duration: 750 },
      { note: 'E4', duration: 750 },
      { note: 'F#4', duration: 750 },
      { note: 'G4', duration: 1500 },
      { note: 'F#4', duration: 750 },
      { note: 'E4', duration: 750 },
      { note: 'D4', duration: 750 },
      { note: 'C4', duration: 750 },
      { note: 'B3', duration: 750 },
      { note: 'A3', duration: 750 },
      { note: 'G3', duration: 1500 },
    ],
  },
  {
    id: 'octave-jumps',
    title: 'Octave Jumps',
    difficulty: 'medium',
    bpm: 60,
    notes: [
      { note: 'C4', duration: 1000 },
      { note: 'C5', duration: 1000 },
      { note: 'D4', duration: 1000 },
      { note: 'D5', duration: 1000 },
      { note: 'E4', duration: 1000 },
      { note: 'E5', duration: 1000 },
      { note: 'F4', duration: 1000 },
      { note: 'F5', duration: 1000 },
      { note: 'G4', duration: 1000 },
      { note: 'G5', duration: 1000 },
    ],
  },
  {
    id: 'twinkle',
    title: 'Twinkle Twinkle',
    difficulty: 'easy',
    bpm: 100,
    notes: [
      { note: 'C4', duration: 600, lyric: 'Twin-' },
      { note: 'C4', duration: 600, lyric: 'kle' },
      { note: 'G4', duration: 600, lyric: 'twin-' },
      { note: 'G4', duration: 600, lyric: 'kle' },
      { note: 'A4', duration: 600, lyric: 'lit-' },
      { note: 'A4', duration: 600, lyric: 'tle' },
      { note: 'G4', duration: 1200, lyric: 'star' },
      { note: 'F4', duration: 600, lyric: 'how' },
      { note: 'F4', duration: 600, lyric: 'I' },
      { note: 'E4', duration: 600, lyric: 'won-' },
      { note: 'E4', duration: 600, lyric: 'der' },
      { note: 'D4', duration: 600, lyric: 'what' },
      { note: 'D4', duration: 600, lyric: 'you' },
      { note: 'C4', duration: 1200, lyric: 'are' },
    ],
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    artist: 'Beethoven',
    difficulty: 'medium',
    bpm: 108,
    notes: [
      { note: 'E4', duration: 555 },
      { note: 'E4', duration: 555 },
      { note: 'F4', duration: 555 },
      { note: 'G4', duration: 555 },
      { note: 'G4', duration: 555 },
      { note: 'F4', duration: 555 },
      { note: 'E4', duration: 555 },
      { note: 'D4', duration: 555 },
      { note: 'C4', duration: 555 },
      { note: 'C4', duration: 555 },
      { note: 'D4', duration: 555 },
      { note: 'E4', duration: 555 },
      { note: 'E4', duration: 833 },
      { note: 'D4', duration: 278 },
      { note: 'D4', duration: 1110 },
    ],
  },
  {
    id: 'chromatic-climb',
    title: 'Chromatic Climb',
    difficulty: 'hard',
    bpm: 72,
    notes: [
      { note: 'C4', duration: 833 },
      { note: 'C#4', duration: 833 },
      { note: 'D4', duration: 833 },
      { note: 'D#4', duration: 833 },
      { note: 'E4', duration: 833 },
      { note: 'F4', duration: 833 },
      { note: 'F#4', duration: 833 },
      { note: 'G4', duration: 833 },
      { note: 'G#4', duration: 833 },
      { note: 'A4', duration: 833 },
      { note: 'A#4', duration: 833 },
      { note: 'B4', duration: 833 },
      { note: 'C5', duration: 1666 },
    ],
  },
];

/**
 * Parse a note string like "C4" or "F#3" into { noteName, octave, midi }
 */
export function parseNoteString(noteStr) {
  const match = noteStr.match(/^([A-G]#?)(\d)$/);
  if (!match) return null;
  const noteName = match[1];
  const octave = parseInt(match[2], 10);
  const noteIndex = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(noteName);
  if (noteIndex === -1) return null;
  const midi = (octave + 1) * 12 + noteIndex;
  return { noteName, octave, midi };
}

/**
 * Compute total duration of a song in ms.
 */
export function songDuration(song) {
  return song.notes.reduce((sum, n) => sum + n.duration, 0);
}

/**
 * Get the MIDI range [min, max] of a song.
 */
export function songMidiRange(song) {
  let min = 127;
  let max = 0;
  for (const n of song.notes) {
    const parsed = parseNoteString(n.note);
    if (parsed) {
      min = Math.min(min, parsed.midi);
      max = Math.max(max, parsed.midi);
    }
  }
  return [min, max];
}
