/**
 * exercise-schema.js — Declarative exercise configuration format.
 *
 * All exercises are defined as plain ExerciseConfig objects interpreted by
 * the exercise runtime.  This module provides:
 *   - JSDoc typedefs documenting the full shape
 *   - Frozen enum-like constant arrays for all categorical fields
 *   - A defaults object and a pure merge helper
 *   - Validation that collects ALL errors
 *   - A factory for sequence (scale runner) exercises
 *
 * Pure module — no DOM, no audio, no event bus, no side effects.
 */

import { SCALE_INTERVALS, SCALE_LABELS, ROOT_NAMES } from '../utils/scales.js';
import { formatNote } from '../audio/note-math.js';
import { NOTE_NAMES } from '../utils/constants.js';

// ---------------------------------------------------------------------------
// Type definitions (JSDoc only — no runtime cost)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} NoteSpec
 * @property {string}  note       - Note name with octave, e.g. "C4", "F#3"
 * @property {number}  midi       - MIDI note number (integer, 0–127)
 * @property {number}  [durationMs] - Duration in ms (for fixed-tempo sequences)
 * @property {number}  [bendTarget] - Fractional MIDI for microtonal targets (Phase 10)
 */

/**
 * @typedef {Object} ExerciseContext
 * @property {NoteSpec[]}  [notes]       - Explicit target notes (sequence/sustained)
 * @property {string}      [scale]       - Scale key from SCALE_INTERVALS
 * @property {string}      [root]        - Root note name, e.g. "C", "F#"
 * @property {[number, number]} [octaveRange] - [low, high] octave range
 * @property {'scale'|'chromatic'|NoteSpec[]} [pool] - Note pool for reactive exercises
 */

/**
 * @typedef {Object} ExerciseTiming
 * @property {'player-driven'|'fixed-tempo'|'auto-tempo'|'indefinite'} mode
 * @property {number}   [tempoBpm]      - BPM for fixed-tempo mode
 * @property {number}   [noteDuration]  - ms per note for fixed-tempo mode
 * @property {boolean}  [holdToAdvance] - Player must sustain to advance (player-driven)
 * @property {number}   [holdMs]        - Required sustain time in ms
 */

/**
 * @typedef {Object} ExerciseAudio
 * @property {{ note: string, octave: number, voice: string }|null} [drone]
 * @property {boolean}  [playPhrase]  - Play phrase via synth (echo exercises)
 * @property {string}   [synthVoice]  - One of SYNTH_VOICES
 */

/**
 * @typedef {Object} ExerciseConfig
 * @property {string}          id          - Unique identifier
 * @property {string}          type        - One of EXERCISE_TYPES
 * @property {string}          name        - Human-readable display name
 * @property {string}          description - One-line explanation
 * @property {ExerciseContext}  context    - Musical context (notes, scale, etc.)
 * @property {string}          evaluator   - One of EVALUATOR_TYPES
 * @property {string}          renderer    - One of RENDERER_TYPES
 * @property {ExerciseTiming}  timing      - Timing / pacing configuration
 * @property {ExerciseAudio}   [audio]     - Optional synth output config
 * @property {number|null}     [duration]  - Exercise time limit in ms (null = indefinite)
 * @property {boolean}         [loop]      - Whether the exercise loops on complete
 * @property {number}          [loopGapMs] - Pause between loop iterations in ms
 * @property {string[]}        [measures]  - What to record (subset of MEASURE_TYPES)
 * @property {string[]}        [skills]    - What this trains (subset of SKILL_DIMENSIONS)
 */

// ---------------------------------------------------------------------------
// Frozen enum constants
// ---------------------------------------------------------------------------

/** Exercise interaction patterns */
export const EXERCISE_TYPES = Object.freeze([
  'sustained',   // hold and stabilize (long tone, drone match, centering)
  'sequence',    // play notes in order (scale runner, intervals, arpeggios)
  'reactive',    // respond to prompts (random note, interval recognition)
  'echo',        // listen and reproduce (echo mode, call-and-response)
  'free',        // open-ended play (free play, drone jam, scale explorer)
]);

/** How time works in the exercise */
export const TIMING_MODES = Object.freeze([
  'player-driven',  // notes wait for the player (default)
  'fixed-tempo',    // notes advance on timer
  'auto-tempo',     // tempo adapts to player accuracy
  'indefinite',     // no note targets, no advancement (free play)
]);

/** Pitch evaluation strategies */
export const EVALUATOR_TYPES = Object.freeze([
  'target-accuracy',     // cents deviation from target note
  'stability',           // pitch variance over sustained notes
  'phrase-match',        // compare played phrase to target
  'interval-accuracy',   // evaluate interval distance correctness
  'reaction-time',       // time from prompt to accurate pitch
  'bend-accuracy',       // microtonal bend accuracy (fractional MIDI targets)
  'none',                // no evaluation (free play)
]);

/** Visual display components */
export const RENDERER_TYPES = Object.freeze([
  'scroll-targets',       // horizontal bars scrolling toward play zone
  'seismograph',          // real-time cents deviation trace
  'flash-card',           // large centered note/interval name
  'overlay-comparison',   // target vs player pitch overlay (echo)
  'pitch-trail',          // free-scrolling pitch graph
  'pitch-trace',          // trace a drawn contour with pitch
  'bend-meter',           // vertical pitch meter for bend exercises
]);

/** What metrics exercises can record */
export const MEASURE_TYPES = Object.freeze([
  'cents-avg',
  'cents-variance',
  'hold-steady-ms',
  'reaction-ms',
  'notes-hit-pct',
  'interval-accuracy',
  'phrase-accuracy',
  'time-to-hit-ms',
  'steady-streak-ms',
  'drift-direction',
  'notes-per-minute',
]);

/** Skill dimensions the app tracks */
export const SKILL_DIMENSIONS = Object.freeze([
  'pitchAccuracy',
  'pitchStability',
  'earTraining',
  'scaleFluency',
  'reactionSpeed',
  'range',
]);

/** Available synth oscillator voices */
export const SYNTH_VOICES = Object.freeze(['sine', 'triangle', 'square']);

/** Note ordering patterns for sequence exercises */
export const NOTE_PATTERNS = Object.freeze([
  'ascending',
  'descending',
  'up-and-back',
  'thirds',
  'fourths',
  'neighbors',
  'random',
]);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default values merged into every ExerciseConfig via applyDefaults().
 * Player-driven timing is the default — notes wait for the player.
 */
export const EXERCISE_DEFAULTS = Object.freeze({
  timing: Object.freeze({
    mode: 'player-driven',
    holdToAdvance: true,
    holdMs: 300,
  }),
  audio: Object.freeze({
    drone: null,
    playPhrase: false,
    synthVoice: 'sine',
  }),
  duration: null,
  loop: true,
  loopGapMs: 3000,
  measures: [],
  skills: [],
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a MIDI note number to a NoteSpec.
 * @param {number} midi
 * @param {Object} [opts]
 * @param {number} [opts.durationMs]
 * @returns {NoteSpec}
 */
function midiToNoteSpec(midi, opts = {}) {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const note = formatNote(NOTE_NAMES[noteIndex], octave);
  const spec = { note, midi };
  if (opts.durationMs != null) spec.durationMs = opts.durationMs;
  return spec;
}

/**
 * Build ascending MIDI notes for a root/scale/octave range.
 * Includes the top-octave root as endpoint.
 * @param {string} root
 * @param {string} scaleKey
 * @param {number} octaveLow
 * @param {number} octaveHigh
 * @returns {number[]}
 */
function buildScaleMidiNotes(root, scaleKey, octaveLow, octaveHigh) {
  const rootIndex = ROOT_NAMES.indexOf(root);
  if (rootIndex === -1) return [];
  const intervals = SCALE_INTERVALS[scaleKey];
  if (!intervals) return [];

  const notes = [];
  for (let octave = octaveLow; octave <= octaveHigh; octave++) {
    for (const interval of intervals) {
      const midi = (octave + 1) * 12 + rootIndex + interval;
      if (octave === octaveHigh && interval > 0) continue;
      notes.push(midi);
    }
  }

  const topRoot = (octaveHigh + 1) * 12 + rootIndex;
  if (!notes.includes(topRoot)) notes.push(topRoot);

  notes.sort((a, b) => a - b);
  return notes;
}

/**
 * Reorder MIDI notes according to a named pattern.
 * @param {number[]} midiNotes - Sorted ascending
 * @param {string} pattern - One of NOTE_PATTERNS
 * @returns {number[]}
 */
function applyNotePattern(midiNotes, pattern) {
  switch (pattern) {
    case 'descending':
      return [...midiNotes].reverse();

    case 'up-and-back': {
      const down = [...midiNotes].reverse().slice(1);
      return [...midiNotes, ...down];
    }

    case 'thirds': {
      const result = [];
      for (let i = 0; i < midiNotes.length - 2; i++) {
        result.push(midiNotes[i], midiNotes[i + 2]);
      }
      return result;
    }

    case 'fourths': {
      const result = [];
      for (let i = 0; i < midiNotes.length - 3; i++) {
        result.push(midiNotes[i], midiNotes[i + 3]);
      }
      return result;
    }

    case 'neighbors': {
      const result = [];
      for (let i = 0; i < midiNotes.length; i++) {
        result.push(midiNotes[i]);
        if (i > 0) result.push(midiNotes[i - 1]);
        result.push(midiNotes[i]);
      }
      return result;
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

// ---------------------------------------------------------------------------
// Public API — applyDefaults
// ---------------------------------------------------------------------------

/**
 * Return a new ExerciseConfig with EXERCISE_DEFAULTS merged under the
 * caller-supplied values. Caller's values always win.
 * Pure function — does not mutate the input.
 * @param {Partial<ExerciseConfig>} config
 * @returns {ExerciseConfig}
 */
export function applyDefaults(config) {
  const timing = { ...EXERCISE_DEFAULTS.timing, ...(config.timing || {}) };
  const audio = { ...EXERCISE_DEFAULTS.audio, ...(config.audio || {}) };

  return {
    duration: EXERCISE_DEFAULTS.duration,
    loop: EXERCISE_DEFAULTS.loop,
    loopGapMs: EXERCISE_DEFAULTS.loopGapMs,
    measures: [...EXERCISE_DEFAULTS.measures],
    skills: [...EXERCISE_DEFAULTS.skills],
    ...config,
    timing,
    audio,
  };
}

// ---------------------------------------------------------------------------
// Public API — validateExercise
// ---------------------------------------------------------------------------

/**
 * Validate an ExerciseConfig, collecting ALL errors.
 * @param {ExerciseConfig} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExercise(config) {
  const errors = [];

  // --- Required top-level fields ---
  if (!config.id || typeof config.id !== 'string') {
    errors.push('id is required and must be a non-empty string');
  }
  if (!config.type || !EXERCISE_TYPES.includes(config.type)) {
    errors.push(`type must be one of: ${EXERCISE_TYPES.join(', ')}`);
  }
  if (!config.name || typeof config.name !== 'string') {
    errors.push('name is required and must be a non-empty string');
  }
  if (config.description != null && typeof config.description !== 'string') {
    errors.push('description must be a string');
  }
  if (!config.evaluator || !EVALUATOR_TYPES.includes(config.evaluator)) {
    errors.push(`evaluator must be one of: ${EVALUATOR_TYPES.join(', ')}`);
  }
  if (!config.renderer || !RENDERER_TYPES.includes(config.renderer)) {
    errors.push(`renderer must be one of: ${RENDERER_TYPES.join(', ')}`);
  }

  // --- Context ---
  if (config.context == null || typeof config.context !== 'object') {
    errors.push('context is required and must be an object');
  } else {
    const ctx = config.context;
    if (ctx.scale != null && !SCALE_INTERVALS[ctx.scale]) {
      errors.push(`context.scale "${ctx.scale}" is not a known scale`);
    }
    if (ctx.root != null && !ROOT_NAMES.includes(ctx.root)) {
      errors.push(`context.root "${ctx.root}" must be one of: ${ROOT_NAMES.join(', ')}`);
    }
    if (ctx.octaveRange != null) {
      if (!Array.isArray(ctx.octaveRange) || ctx.octaveRange.length !== 2) {
        errors.push('context.octaveRange must be [low, high]');
      } else if (ctx.octaveRange[0] > ctx.octaveRange[1]) {
        errors.push('context.octaveRange[0] must be <= octaveRange[1]');
      }
    }
    if (ctx.notes != null) {
      if (!Array.isArray(ctx.notes)) {
        errors.push('context.notes must be an array');
      } else {
        for (let i = 0; i < ctx.notes.length; i++) {
          const ns = ctx.notes[i];
          if (!ns || typeof ns !== 'object') {
            errors.push(`context.notes[${i}] must be an object`);
            continue;
          }
          if (!ns.note || typeof ns.note !== 'string') {
            errors.push(`context.notes[${i}].note is required`);
          }
          if (ns.midi == null || typeof ns.midi !== 'number' || !Number.isFinite(ns.midi)) {
            errors.push(`context.notes[${i}].midi must be a number`);
          } else if (ns.midi < 0 || ns.midi > 127) {
            errors.push(`context.notes[${i}].midi must be 0–127`);
          }
        }
      }
    }
    if (ctx.pool != null) {
      if (ctx.pool !== 'scale' && ctx.pool !== 'chromatic' && !Array.isArray(ctx.pool)) {
        errors.push('context.pool must be "scale", "chromatic", or a NoteSpec[]');
      }
    }
  }

  // --- Timing ---
  if (config.timing != null) {
    const t = config.timing;
    if (t.mode != null && !TIMING_MODES.includes(t.mode)) {
      errors.push(`timing.mode must be one of: ${TIMING_MODES.join(', ')}`);
    }
    if (t.mode === 'fixed-tempo') {
      if (t.tempoBpm == null || typeof t.tempoBpm !== 'number' || t.tempoBpm <= 0) {
        errors.push('timing.tempoBpm required for fixed-tempo mode');
      }
      if (t.noteDuration == null || typeof t.noteDuration !== 'number' || t.noteDuration <= 0) {
        errors.push('timing.noteDuration required for fixed-tempo mode');
      }
    }
    if (t.holdMs != null && (typeof t.holdMs !== 'number' || t.holdMs <= 0)) {
      errors.push('timing.holdMs must be a positive number');
    }
  }

  // --- Audio ---
  if (config.audio != null && typeof config.audio === 'object') {
    const a = config.audio;
    if (a.synthVoice != null && !SYNTH_VOICES.includes(a.synthVoice)) {
      errors.push(`audio.synthVoice must be one of: ${SYNTH_VOICES.join(', ')}`);
    }
    if (a.drone != null && typeof a.drone === 'object') {
      if (!a.drone.note || typeof a.drone.note !== 'string') {
        errors.push('audio.drone.note is required');
      }
      if (a.drone.octave == null || typeof a.drone.octave !== 'number') {
        errors.push('audio.drone.octave is required');
      }
    }
  }

  // --- Duration / loop ---
  if (config.duration != null && (typeof config.duration !== 'number' || config.duration <= 0)) {
    errors.push('duration must be a positive number or null');
  }
  if (config.loopGapMs != null && (typeof config.loopGapMs !== 'number' || config.loopGapMs < 0)) {
    errors.push('loopGapMs must be a non-negative number');
  }
  if (config.loop != null && typeof config.loop !== 'boolean') {
    errors.push('loop must be a boolean');
  }

  // --- Measures / skills ---
  if (config.measures != null) {
    if (!Array.isArray(config.measures)) {
      errors.push('measures must be an array');
    } else {
      for (const m of config.measures) {
        if (!MEASURE_TYPES.includes(m)) {
          errors.push(`measures value "${m}" not in: ${MEASURE_TYPES.join(', ')}`);
        }
      }
    }
  }
  if (config.skills != null) {
    if (!Array.isArray(config.skills)) {
      errors.push('skills must be an array');
    } else {
      for (const s of config.skills) {
        if (!SKILL_DIMENSIONS.includes(s)) {
          errors.push(`skills value "${s}" not in: ${SKILL_DIMENSIONS.join(', ')}`);
        }
      }
    }
  }

  // --- Cross-field warnings ---
  if (config.type === 'sequence' && (!config.context?.notes || config.context.notes.length === 0)) {
    errors.push('[warn] sequence exercise should have context.notes');
  }
  if (config.type === 'echo' && config.evaluator !== 'phrase-match') {
    errors.push('[warn] echo exercises typically use phrase-match evaluator');
  }
  if (config.type === 'free' && config.evaluator !== 'none') {
    errors.push('[warn] free exercises typically use evaluator: none');
  }

  return { valid: errors.filter(e => !e.startsWith('[warn]')).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Public API — createSequenceExercise
// ---------------------------------------------------------------------------

/**
 * Factory that builds a complete ExerciseConfig for sequence-type exercises
 * (scale runners, arpeggios, interval patterns). Computes NoteSpec[] from
 * root, scale, octave range, and pattern. Auto-generates id/name/description.
 *
 * @param {Object} params
 * @param {string}  params.root              - Root note name
 * @param {string}  [params.scale='major']   - Scale key
 * @param {number}  [params.octaveLow=3]     - Lowest octave
 * @param {number}  [params.octaveHigh=5]    - Highest octave
 * @param {string}  [params.pattern='ascending'] - One of NOTE_PATTERNS
 * @param {Partial<ExerciseTiming>} [params.timing] - Timing overrides
 * @param {Partial<ExerciseAudio>}  [params.audio]  - Audio overrides
 * @param {number}  [params.loopGapMs]       - Gap between loops
 * @param {boolean} [params.loop]            - Whether to loop
 * @param {string}  [params.evaluator]       - Override evaluator
 * @param {string}  [params.renderer]        - Override renderer
 * @param {string[]} [params.measures]       - Override measures
 * @param {string[]} [params.skills]         - Override skills
 * @returns {ExerciseConfig}
 */
export function createSequenceExercise({
  root,
  scale = 'major',
  octaveLow = 3,
  octaveHigh = 5,
  pattern = 'ascending',
  timing,
  audio,
  loopGapMs,
  loop,
  evaluator = 'target-accuracy',
  renderer = 'scroll-targets',
  measures = ['cents-avg', 'notes-hit-pct', 'time-to-hit-ms'],
  skills = ['pitchAccuracy', 'scaleFluency'],
} = {}) {
  if (!root || !ROOT_NAMES.includes(root)) {
    throw new Error(`Invalid root: "${root}". Must be one of: ${ROOT_NAMES.join(', ')}`);
  }
  if (!SCALE_INTERVALS[scale]) {
    throw new Error(`Unknown scale: "${scale}"`);
  }

  const midiNotes = buildScaleMidiNotes(root, scale, octaveLow, octaveHigh);
  const ordered = applyNotePattern(midiNotes, pattern);
  const notes = ordered.map(midi => midiToNoteSpec(midi));

  const scaleLabel = SCALE_LABELS[scale] || scale;
  const patternLabel = pattern.replace(/-/g, ' ');

  const config = {
    id: `seq-${root}-${scale}-${pattern}-${octaveLow}-${octaveHigh}`,
    type: 'sequence',
    name: `${root} ${scaleLabel} ${patternLabel}`,
    description: `${root} ${scaleLabel} scale, ${patternLabel}, octaves ${octaveLow}–${octaveHigh}`,
    context: {
      notes,
      scale,
      root,
      octaveRange: [octaveLow, octaveHigh],
    },
    evaluator,
    renderer,
    measures,
    skills,
  };

  if (timing) config.timing = timing;
  if (audio) config.audio = audio;
  if (loopGapMs != null) config.loopGapMs = loopGapMs;
  if (loop != null) config.loop = loop;

  return applyDefaults(config);
}

// ---------------------------------------------------------------------------
// Public API — generateEchoPhrase
// ---------------------------------------------------------------------------

/**
 * Generate a random phrase for echo exercises within a given scale.
 *
 * Uses a constrained random walk: starts on a random scale degree, then
 * steps through the scale with intervals limited by difficulty.
 *
 * @param {Object} params
 * @param {'easy'|'medium'|'hard'} [params.difficulty='easy']
 * @param {string}  params.root       - Root note name
 * @param {string}  [params.scale='major'] - Scale key
 * @param {[number, number]} [params.octaveRange=[3, 5]] - Octave range
 * @returns {Array<{ midi: number, durationMs: number, gapMs?: number }>}
 */
export function generateEchoPhrase({
  difficulty = 'easy',
  root,
  scale = 'major',
  octaveRange = [3, 5],
} = {}) {
  if (!root || !ROOT_NAMES.includes(root)) {
    throw new Error(`Invalid root: "${root}"`);
  }

  const intervals = SCALE_INTERVALS[scale];
  if (!intervals) {
    throw new Error(`Unknown scale: "${scale}"`);
  }

  const rootIndex = ROOT_NAMES.indexOf(root);
  const [octLow, octHigh] = octaveRange;

  // Build pool of scale MIDI notes
  const pool = [];
  for (let oct = octLow; oct <= octHigh; oct++) {
    for (const interval of intervals) {
      const midi = (oct + 1) * 12 + rootIndex + interval;
      pool.push(midi);
    }
  }
  if (pool.length === 0) return [];

  // Difficulty parameters
  let noteCount, maxLeap, noteDuration;
  switch (difficulty) {
    case 'easy':
      noteCount = 2 + Math.floor(Math.random() * 2);  // 2-3 notes
      maxLeap = 2;   // stepwise motion: max 2 scale degrees
      noteDuration = 500;
      break;
    case 'medium':
      noteCount = 3 + Math.floor(Math.random() * 2);  // 3-4 notes
      maxLeap = 4;   // allow 3rds and 4ths (up to 4 scale degrees)
      noteDuration = 450;
      break;
    case 'hard':
      noteCount = 4 + Math.floor(Math.random() * 2);  // 4-5 notes
      maxLeap = 6;   // larger leaps allowed
      noteDuration = 400;
      break;
    default:
      noteCount = 3;
      maxLeap = 2;
      noteDuration = 500;
  }

  // Random walk through the pool
  let currentIdx = Math.floor(Math.random() * Math.min(pool.length, pool.length - noteCount));
  // Ensure we start somewhere with room to move
  currentIdx = Math.max(0, Math.min(currentIdx, pool.length - 1));

  const phrase = [];
  const usedIndices = new Set();

  for (let i = 0; i < noteCount; i++) {
    phrase.push({
      midi: pool[currentIdx],
      durationMs: noteDuration,
      gapMs: 80,
    });
    usedIndices.add(currentIdx);

    // Pick next index within leap distance
    if (i < noteCount - 1) {
      const minIdx = Math.max(0, currentIdx - maxLeap);
      const maxIdx = Math.min(pool.length - 1, currentIdx + maxLeap);
      const candidates = [];
      for (let j = minIdx; j <= maxIdx; j++) {
        if (j !== currentIdx) candidates.push(j);
      }
      if (candidates.length > 0) {
        currentIdx = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
  }

  return phrase;
}

// ---------------------------------------------------------------------------
// Public API — createEchoExercise
// ---------------------------------------------------------------------------

/**
 * Factory that builds a complete ExerciseConfig for echo (listen-and-repeat)
 * exercises. Generates a set of phrases at the specified difficulty and
 * wires up the phrase-match evaluator and overlay-comparison renderer.
 *
 * @param {Object} params
 * @param {string}  params.root              - Root note name
 * @param {string}  [params.scale='major']   - Scale key
 * @param {number}  [params.octaveLow=3]     - Lowest octave
 * @param {number}  [params.octaveHigh=5]    - Highest octave
 * @param {'easy'|'medium'|'hard'} [params.difficulty='easy']
 * @param {number}  [params.phraseCount=4]   - Number of phrases per exercise
 * @param {boolean} [params.showReview=true]  - Whether to show review phase
 * @param {string}  [params.synthVoice='sine'] - Synth voice for phrase playback
 * @param {number}  [params.synthGain=0.8]    - Synth gain
 * @returns {ExerciseConfig}
 */
export function createEchoExercise({
  root,
  scale = 'major',
  octaveLow = 3,
  octaveHigh = 5,
  difficulty = 'easy',
  phraseCount = 4,
  showReview = true,
  synthVoice = 'sine',
  synthGain = 0.8,
} = {}) {
  if (!root || !ROOT_NAMES.includes(root)) {
    throw new Error(`Invalid root: "${root}". Must be one of: ${ROOT_NAMES.join(', ')}`);
  }
  if (!SCALE_INTERVALS[scale]) {
    throw new Error(`Unknown scale: "${scale}"`);
  }

  // Generate phrases
  const phrases = [];
  for (let i = 0; i < phraseCount; i++) {
    phrases.push(generateEchoPhrase({
      difficulty,
      root,
      scale,
      octaveRange: [octaveLow, octaveHigh],
    }));
  }

  const scaleLabel = SCALE_LABELS[scale] || scale;
  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  return applyDefaults({
    id: `echo-${root}-${scale}-${difficulty}-${octaveLow}-${octaveHigh}`,
    type: 'echo',
    name: `Echo ${diffLabel} — ${root} ${scaleLabel}`,
    description: `Listen and play back ${diffLabel.toLowerCase()} phrases in ${root} ${scaleLabel}`,
    context: {
      scale,
      root,
      octaveRange: [octaveLow, octaveHigh],
    },
    evaluator: 'phrase-match',
    renderer: 'overlay-comparison',
    timing: { mode: 'indefinite' },
    audio: {
      phrases,
      synthVoice,
      synthGain,
      playPhrase: true,
    },
    duration: null,
    loop: false,
    measures: ['phrase-accuracy', 'notes-hit-pct', 'cents-avg'],
    skills: ['earTraining', 'pitchAccuracy'],
  });
}
