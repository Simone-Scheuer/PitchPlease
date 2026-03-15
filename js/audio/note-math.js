import { A4_FREQUENCY, NOTE_NAMES } from '../utils/constants.js';

const MIDI_A4 = 69;
const SEMITONES = 12;
const LOG2 = Math.log(2);

/**
 * Convert frequency to MIDI note number (fractional).
 * A4 (440 Hz) = 69.0
 */
export function frequencyToMidi(frequency, a4 = A4_FREQUENCY) {
  return MIDI_A4 + SEMITONES * Math.log(frequency / a4) / LOG2;
}

/**
 * Convert frequency to note data: { note, octave, cents, midi }
 */
export function frequencyToNoteData(frequency, a4 = A4_FREQUENCY) {
  const midi = frequencyToMidi(frequency, a4);
  const midiRounded = Math.round(midi);
  const cents = Math.round((midi - midiRounded) * 100);
  const noteIndex = ((midiRounded % SEMITONES) + SEMITONES) % SEMITONES;
  const octave = Math.floor(midiRounded / SEMITONES) - 1;
  const note = NOTE_NAMES[noteIndex];

  return { note, octave, cents, midi: midiRounded, frequency };
}

/**
 * Convert MIDI note number to frequency.
 */
export function midiToFrequency(midi, a4 = A4_FREQUENCY) {
  return a4 * Math.pow(2, (midi - MIDI_A4) / SEMITONES);
}

/**
 * Format note string: "C#4", "Ab3", etc.
 */
export function formatNote(note, octave) {
  return `${note}${octave}`;
}
