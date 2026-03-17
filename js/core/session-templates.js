/**
 * session-templates.js — Curated practice session configurations.
 *
 * Each template is a function that takes (root, scale) and returns a
 * fully-formed session config with parameterized exercises.
 *
 * Pure data module — no DOM, no audio, no event bus.
 */

import { createSequenceExercise, createEchoExercise, applyDefaults, buildScaleMidiNotes, applyNotePattern, midiToNoteSpec } from './exercise-schema.js';
import { getBendTargets, getHoleLayout } from '../utils/harmonica.js';

// ---------------------------------------------------------------------------
// Session config schema (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SessionBlock
 * @property {import('./exercise-schema.js').ExerciseConfig} exercise
 * @property {number}  duration  - Block time limit in ms
 * @property {string}  label     - Short display label (e.g., "Settle In")
 * @property {string}  phase     - 'activate' | 'develop' | 'challenge' | 'play'
 */

/**
 * @typedef {Object} SessionConfig
 * @property {string}  id
 * @property {string}  name
 * @property {string}  description
 * @property {string[]} tags
 * @property {SessionBlock[]} blocks
 * @property {string}  transitions - 'none' | 'gentle' | 'seamless'
 * @property {number}  totalDuration - ms
 */

// ---------------------------------------------------------------------------
// Exercise config builders (internal helpers)
// ---------------------------------------------------------------------------

export function buildSustainedExercise(name, root, scale, opts = {}) {
  const config = {
    id: `sustained-${name}-${root}-${scale}`,
    type: 'sustained',
    name: opts.label ?? name,
    description: opts.description ?? `Hold notes steady in ${root} ${scale}`,
    context: {
      scale,
      root,
      octaveRange: opts.octaveRange ?? [3, 5],
    },
    evaluator: 'stability',
    renderer: 'seismograph',
    timing: { mode: 'indefinite' },
    loop: false,
    measures: ['cents-avg', 'hold-steady-ms', 'steady-streak-ms'],
    skills: ['pitchStability', 'pitchAccuracy'],
  };

  // Pattern support: build note sequence for scale walking
  if (opts.pattern && opts.pattern !== 'none') {
    const midiNotes = buildScaleMidiNotes(root, scale, opts.octaveRange?.[0] ?? 4, opts.octaveRange?.[1] ?? 5);
    const ordered = applyNotePattern(midiNotes, opts.pattern);
    config.context.notes = ordered.map(midi => midiToNoteSpec(midi));
    config.timing = { mode: 'player-driven', holdToAdvance: true, holdMs: opts.holdMs ?? 600 };
  }

  // Drone support — accepts string ('follow', 'root', 'off') or legacy object
  if (typeof opts.drone === 'string') {
    if (opts.drone === 'follow') {
      // Drone follows notes — runtime reads from context.notes, no fixed note/octave
      config.audio = { drone: { voice: opts.droneVoice ?? 'triangle', gain: opts.droneGain ?? 0.6 } };
    } else if (opts.drone === 'root') {
      config.audio = { drone: { note: root, octave: opts.octaveRange?.[0] ?? 3, voice: opts.droneVoice ?? 'triangle', gain: opts.droneGain ?? 0.7 } };
    }
    // drone === 'off' or other — no drone
  } else if (opts.drone && typeof opts.drone === 'object') {
    // Legacy object form: { voice, gain }
    config.audio = {
      drone: {
        note: root,
        octave: opts.octaveRange?.[0] ?? 3,
        voice: opts.drone.voice ?? 'triangle',
        gain: opts.drone.gain ?? 0.8,
      },
    };
  }

  // Loop support
  if (opts.loop === true) {
    config.loop = true;
    config.loopGapMs = opts.loopGapMs ?? 1500;
  }

  return applyDefaults(config);
}

export function buildReactiveExercise(name, root, scale, opts = {}) {
  // Build notes from scale for the pool
  const seq = createSequenceExercise({
    root,
    scale,
    octaveLow: opts.octaveLow ?? 3,
    octaveHigh: opts.octaveHigh ?? 5,
    pattern: 'random',
  });

  return applyDefaults({
    id: `reactive-${name}-${root}-${scale}`,
    type: 'reactive',
    name: opts.label ?? 'Random Note Reflex',
    description: opts.description ?? `Find random notes from ${root} ${scale}`,
    context: {
      notes: seq.context.notes,
      scale,
      root,
      octaveRange: opts.octaveRange ?? [3, 5],
      pool: 'scale',
    },
    evaluator: 'target-accuracy',
    renderer: 'flash-card',
    timing: { mode: 'player-driven', holdToAdvance: true, holdMs: opts.holdMs ?? 300 },
    loop: true,
    measures: ['reaction-ms', 'cents-avg', 'notes-hit-pct'],
    skills: ['reactionSpeed', 'scaleFluency'],
  });
}

export function buildFreePlayExercise(root, scale, opts = {}) {
  const exercise = applyDefaults({
    id: `free-play-${root}-${scale}`,
    type: 'free',
    name: opts.label ?? 'Free Play',
    description: opts.description ?? `Play freely in ${root} ${scale}`,
    context: {
      scale,
      root,
      octaveRange: opts.octaveRange ?? [3, 5],
    },
    evaluator: 'none',
    renderer: 'pitch-trail',
    timing: { mode: 'indefinite' },
    loop: false,
    measures: [],
    skills: [],
  });

  // Add drone audio if requested
  if (opts.drone) {
    exercise.audio = {
      drone: {
        note: root,
        octave: opts.octaveRange?.[0] ?? 3,
        voice: opts.drone.voice ?? 'triangle',
        gain: opts.drone.gain ?? 0.8,
      },
    };
  }

  return exercise;
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

/**
 * Daily Warm-Up (5 min)
 * Quick activation before practice or performance.
 */
function dailyWarmUp(root = 'C', scale = 'major', octaveLow = 3, octaveHigh = 5) {
  const oRange = [octaveLow, octaveHigh];
  const blocks = [
    {
      exercise: buildSustainedExercise('long-tone', root, scale, {
        label: 'Long Tone',
        description: 'Hold a comfortable note, focus on stability',
        octaveRange: oRange,
      }),
      duration: 90_000,
      label: 'Settle In',
      phase: 'activate',
    },
    {
      exercise: createSequenceExercise({
        root, scale,
        pattern: 'ascending',
        octaveLow, octaveHigh,
      }),
      duration: 90_000,
      label: 'Scale Work',
      phase: 'develop',
    },
    {
      exercise: buildReactiveExercise('random-note', root, scale, {
        label: 'Random Note Reflex',
        description: 'Find each note as it appears',
        octaveRange: oRange,
      }),
      duration: 60_000,
      label: 'Quick Reflex',
      phase: 'challenge',
    },
    {
      exercise: buildFreePlayExercise(root, scale, {
        label: 'Free Play',
        description: 'Play whatever you like',
        octaveRange: oRange,
      }),
      duration: 60_000,
      label: 'Cool Down',
      phase: 'play',
    },
  ];

  return {
    id: 'daily-warmup',
    name: 'Daily Warm-Up',
    description: 'Quick 5-minute activation: long tones, scale, reflex, free play',
    tags: ['warm-up', 'daily', '5-min'],
    blocks,
    transitions: 'gentle',
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
  };
}

/**
 * Morning Practice (15 min)
 * Balanced daily session — the default recommendation.
 */
function morningPractice(root = 'C', scale = 'major', octaveLow = 3, octaveHigh = 5) {
  const oRange = [octaveLow, octaveHigh];
  const blocks = [
    {
      exercise: buildSustainedExercise('drone-match', root, scale, {
        label: 'Drone Match',
        description: `Match the ${root} drone tone`,
        octaveRange: oRange,
        drone: { voice: 'triangle', gain: 0.7 },
      }),
      duration: 120_000,
      label: 'Drone Match',
      phase: 'activate',
    },
    {
      exercise: buildSustainedExercise('long-tone-cycle', root, scale, {
        label: 'Long Tone Cycle',
        description: 'Walk through scale degrees, hold each steady',
        octaveRange: oRange,
        drone: { voice: 'sine', gain: 0.5 },
      }),
      duration: 120_000,
      label: 'Long Tones',
      phase: 'activate',
    },
    {
      exercise: createSequenceExercise({
        root, scale,
        pattern: 'thirds',
        octaveLow, octaveHigh,
      }),
      duration: 180_000,
      label: 'Scale Patterns',
      phase: 'develop',
    },
    {
      exercise: createSequenceExercise({
        root, scale,
        pattern: 'up-and-back',
        octaveLow, octaveHigh,
        skills: ['pitchAccuracy', 'earTraining'],
      }),
      duration: 180_000,
      label: 'Echo Prep',
      phase: 'challenge',
    },
    {
      exercise: buildReactiveExercise('random-note', root, scale, {
        label: 'Random Note Reflex',
        description: `Find notes from ${root} ${scale}`,
        octaveRange: oRange,
      }),
      duration: 120_000,
      label: 'Note Reflex',
      phase: 'challenge',
    },
    {
      exercise: buildFreePlayExercise(root, scale, {
        label: 'Drone Jam',
        description: `Improvise freely in ${root} ${scale}`,
        octaveRange: oRange,
        drone: { voice: 'triangle', gain: 0.6 },
      }),
      duration: 180_000,
      label: 'Drone Jam',
      phase: 'play',
    },
  ];

  return {
    id: 'morning-practice',
    name: 'Morning Practice',
    description: 'Balanced 15-minute session: drone match, scales, reflex, free play',
    tags: ['daily', 'balanced', '15-min'],
    blocks,
    transitions: 'gentle',
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
  };
}

/**
 * Quick Burst (5 min)
 * Focused micro-session. Middle exercise targets scale fluency.
 */
function quickBurst(root = 'C', scale = 'major', octaveLow = 3, octaveHigh = 5) {
  const oRange = [octaveLow, octaveHigh];
  const blocks = [
    {
      exercise: buildSustainedExercise('long-tone', root, scale, {
        label: 'Long Tone',
        description: 'One note, settle in',
        octaveRange: oRange,
      }),
      duration: 60_000,
      label: 'Settle In',
      phase: 'activate',
    },
    {
      exercise: createSequenceExercise({
        root, scale,
        pattern: 'ascending',
        octaveLow, octaveHigh,
        timing: { mode: 'auto-tempo', tempoBpm: 60, noteDuration: 1000 },
        skills: ['scaleFluency', 'pitchAccuracy'],
      }),
      duration: 180_000,
      label: 'Speed Ladder',
      phase: 'challenge',
    },
    {
      exercise: buildFreePlayExercise(root, scale, {
        label: 'Free Play',
        description: 'Cool down',
        octaveRange: oRange,
      }),
      duration: 60_000,
      label: 'Cool Down',
      phase: 'play',
    },
  ];

  return {
    id: 'quick-burst',
    name: 'Quick Burst',
    description: 'Focused 5-minute burst: long tone, speed ladder, free play',
    tags: ['quick', 'focus', '5-min'],
    blocks,
    transitions: 'gentle',
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
  };
}

/**
 * Scale Fluency Builder (15 min)
 * Getting fluid in a specific scale.
 */
function scaleFluencyBuilder(root = 'C', scale = 'major', octaveLow = 3, octaveHigh = 5) {
  const oRange = [octaveLow, octaveHigh];
  const blocks = [
    {
      exercise: buildSustainedExercise('settle', root, scale, {
        label: 'Scale Explorer',
        description: `Get to know ${root} ${scale}`,
        octaveRange: oRange,
      }),
      duration: 120_000,
      label: 'Explore',
      phase: 'activate',
    },
    {
      exercise: createSequenceExercise({ root, scale, pattern: 'ascending', octaveLow, octaveHigh }),
      duration: 120_000,
      label: 'Ascending',
      phase: 'develop',
    },
    {
      exercise: createSequenceExercise({ root, scale, pattern: 'thirds', octaveLow, octaveHigh }),
      duration: 120_000,
      label: 'Thirds',
      phase: 'develop',
    },
    {
      exercise: createSequenceExercise({ root, scale, pattern: 'fourths', octaveLow, octaveHigh }),
      duration: 120_000,
      label: 'Fourths',
      phase: 'develop',
    },
    {
      exercise: buildReactiveExercise('random', root, scale, { octaveRange: oRange }),
      duration: 120_000,
      label: 'Random Notes',
      phase: 'challenge',
    },
    {
      exercise: createSequenceExercise({
        root, scale, pattern: 'ascending',
        octaveLow, octaveHigh,
        timing: { mode: 'auto-tempo', tempoBpm: 60, noteDuration: 1000 },
      }),
      duration: 180_000,
      label: 'Speed Ladder',
      phase: 'challenge',
    },
    {
      exercise: buildFreePlayExercise(root, scale, {
        label: 'Drone Jam',
        description: `Improvise in ${root} ${scale}`,
        octaveRange: oRange,
      }),
      duration: 120_000,
      label: 'Drone Jam',
      phase: 'play',
    },
  ];

  return {
    id: 'scale-fluency',
    name: 'Scale Fluency Builder',
    description: `Build fluency in ${root} ${scale}: patterns, reflex, speed`,
    tags: ['scales', 'fluency', '15-min'],
    blocks,
    transitions: 'gentle',
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
  };
}

/**
 * Ear Training Focus (13 min)
 * Developing relative pitch and audiation with echo exercises.
 */
function earTrainingFocus(root = 'C', scale = 'major', octaveLow = 3, octaveHigh = 5) {
  const oRange = [octaveLow, octaveHigh];
  const blocks = [
    {
      exercise: buildSustainedExercise('drone-match', root, scale, {
        label: 'Drone Match',
        description: `Settle into ${root} — match the drone`,
        octaveRange: oRange,
        drone: { voice: 'triangle', gain: 0.7 },
      }),
      duration: 120_000,
      label: 'Settle In',
      phase: 'activate',
    },
    {
      exercise: createEchoExercise({
        root,
        scale,
        octaveLow,
        octaveHigh,
        difficulty: 'easy',
        phraseCount: 3,
        synthVoice: 'sine',
      }),
      duration: 180_000,
      label: 'Echo Easy',
      phase: 'develop',
    },
    {
      exercise: createEchoExercise({
        root,
        scale,
        octaveLow,
        octaveHigh,
        difficulty: 'medium',
        phraseCount: 3,
        synthVoice: 'sine',
      }),
      duration: 180_000,
      label: 'Echo Medium',
      phase: 'challenge',
    },
    {
      exercise: createEchoExercise({
        root,
        scale,
        octaveLow,
        octaveHigh,
        difficulty: 'hard',
        phraseCount: 3,
        synthVoice: 'sine',
      }),
      duration: 180_000,
      label: 'Echo Hard',
      phase: 'challenge',
    },
    {
      exercise: buildFreePlayExercise(root, scale, {
        label: 'Drone Jam',
        description: `Free play in ${root} ${scale} over drone`,
        octaveRange: oRange,
        drone: { voice: 'triangle', gain: 0.6 },
      }),
      duration: 120_000,
      label: 'Cool Down',
      phase: 'play',
    },
  ];

  return {
    id: 'ear-training-focus',
    name: 'Ear Training Focus',
    description: `Ear training in ${root} ${scale}: drone match, echo easy → hard, free play`,
    tags: ['ear-training', 'echo', '13-min'],
    blocks,
    transitions: 'gentle',
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
  };
}

/**
 * Harmonica Workshop (15 min)
 * Harmonica-specific technique: long tones, bends, blues scale, drone jam.
 * Only relevant when the player has harmonica in their profile.
 *
 * Uses the key-aware harmonica data model. The harpKey parameter determines
 * all bend targets and note layouts. Defaults to 'C' if not provided.
 *
 * @param {string} root - Root note for scale exercises
 * @param {string} scale - Scale type
 * @param {number} octaveLow - Lowest octave
 * @param {number} octaveHigh - Highest octave
 * @param {string} [harpKey='C'] - Harmonica key (from profile or selector)
 */
function harmonicaWorkshop(root = 'C', scale = 'blues', octaveLow = 3, octaveHigh = 5, harpKey = 'C') {
  const oRange = [octaveLow, octaveHigh];

  // Get bend targets from the harmonica data model
  const halfStepBends = getBendTargets(harpKey, { maxStepDown: 1 });
  const multiStepBends = getBendTargets(harpKey, { maxStepDown: null })
    .filter(b => b.stepDown > 1);

  // Build NoteSpec arrays for the bend exercises
  const easyBendNotes = halfStepBends.map(b => ({
    note: b.note,
    midi: b.midi,
    label: b.label,
  }));

  const precisionBendNotes = multiStepBends.map(b => ({
    note: b.note,
    midi: b.midi,
    label: b.label,
  }));

  // Use harp key as the root for the blues scale runner
  // (the harp key IS the root for blues on a diatonic)
  const bluesRoot = harpKey === 'F#' ? 'F#'
    : harpKey === 'Db' ? 'C#'
    : harpKey === 'Eb' ? 'D#'
    : harpKey === 'Ab' ? 'G#'
    : harpKey === 'Bb' ? 'A#'
    : harpKey;

  const blocks = [
    // 1. Long Tone warm-up (2 min)
    {
      exercise: buildSustainedExercise('long-tone-harp', bluesRoot, scale, {
        label: 'Long Tone Warm-Up',
        description: `Clean draw notes on ${harpKey} harp, holes 1-6. Focus on clear tone.`,
        octaveRange: oRange,
      }),
      duration: 120_000,
      label: 'Warm Up',
      phase: 'activate',
    },
    // 2. Bend Trainer easy -- half-step bends (3 min)
    {
      exercise: applyDefaults({
        id: `bend-easy-${harpKey}`,
        type: 'sustained',
        name: `Half-Step Bends (${harpKey} Harp)`,
        description: 'Find each half-step bend. Hold it steady in the target zone.',
        context: {
          notes: easyBendNotes,
          root: bluesRoot,
          scale,
          octaveRange: oRange,
          harpKey,
        },
        evaluator: 'bend-accuracy',
        renderer: 'bend-meter',
        timing: { mode: 'player-driven', holdToAdvance: true, holdMs: 2000 },
        loop: true,
        measures: ['cents-avg', 'hold-steady-ms'],
        skills: ['pitchAccuracy', 'pitchStability'],
      }),
      duration: 300_000,
      label: 'Easy Bends',
      phase: 'develop',
    },
    // 3. Bend Trainer precision -- multi-step bends (3 min)
    {
      exercise: applyDefaults({
        id: `bend-precision-${harpKey}`,
        type: 'sustained',
        name: `Precision Bends (${harpKey} Harp)`,
        description: 'Hit specific bent pitches. Full-step and deeper bends.',
        context: {
          notes: precisionBendNotes,
          root: bluesRoot,
          scale,
          octaveRange: oRange,
          harpKey,
        },
        evaluator: 'bend-accuracy',
        renderer: 'bend-meter',
        timing: { mode: 'player-driven', holdToAdvance: true, holdMs: 2000 },
        loop: true,
        measures: ['cents-avg', 'hold-steady-ms'],
        skills: ['pitchAccuracy', 'pitchStability'],
      }),
      duration: 300_000,
      label: 'Precision Bends',
      phase: 'develop',
    },
    // 4. Blues Scale Runner (3 min)
    {
      exercise: createSequenceExercise({
        root: bluesRoot,
        scale: 'blues',
        pattern: 'up-and-back',
        octaveLow,
        octaveHigh,
        skills: ['scaleFluency', 'pitchAccuracy'],
      }),
      duration: 180_000,
      label: 'Blues Scale',
      phase: 'challenge',
    },
    // 5. Blues Drone Jam (4 min)
    {
      exercise: buildFreePlayExercise(bluesRoot, 'blues', {
        label: 'Blues Drone Jam',
        description: `Improvise freely on ${harpKey} harp. Explore bends and expression.`,
        octaveRange: oRange,
        drone: { voice: 'triangle', gain: 0.6 },
      }),
      duration: 240_000,
      label: 'Blues Jam',
      phase: 'play',
    },
  ];

  return {
    id: 'harmonica-workshop',
    name: `Harmonica Workshop (${harpKey} Harp)`,
    description: `${harpKey} harp technique: warm-up, bends, blues scale, improvisation`,
    tags: ['harmonica', 'bends', 'blues', '15-min'],
    blocks,
    transitions: 'gentle',
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
  };
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const TEMPLATE_FACTORIES = {
  'daily-warmup': dailyWarmUp,
  'morning-practice': morningPractice,
  'quick-burst': quickBurst,
  'scale-fluency': scaleFluencyBuilder,
  'ear-training-focus': earTrainingFocus,
  'harmonica-workshop': harmonicaWorkshop,
};

/**
 * Metadata for template listing (without generating full configs).
 */
export const SESSION_TEMPLATES = Object.freeze([
  { id: 'daily-warmup', name: 'Daily Warm-Up', duration: '5 min', description: 'Quick activation: long tones, scale, reflex, free play', tags: ['warm-up', 'daily', '5-min'] },
  { id: 'morning-practice', name: 'Morning Practice', duration: '15 min', description: 'Balanced session: drone match, scales, reflex, free play', tags: ['daily', 'balanced', '15-min'] },
  { id: 'quick-burst', name: 'Quick Burst', duration: '5 min', description: 'Focused burst: long tone, speed ladder, free play', tags: ['quick', 'focus', '5-min'] },
  { id: 'scale-fluency', name: 'Scale Fluency Builder', duration: '15 min', description: 'Build fluency: patterns, reflex, speed ladder, improv', tags: ['scales', 'fluency', '15-min'] },
  { id: 'ear-training-focus', name: 'Ear Training Focus', duration: '13 min', description: 'Echo exercises: drone match, easy/medium/hard phrases, free play', tags: ['ear-training', 'echo', '13-min'] },
  { id: 'harmonica-workshop', name: 'Harmonica Workshop', duration: '15 min', description: 'Harmonica technique: warm-up, bends, blues scale, improvisation (uses harp key from settings)', tags: ['harmonica', 'bends', 'blues', '15-min'] },
]);

/**
 * Generate a full session config from a template ID.
 *
 * @param {string} templateId - One of the template IDs
 * @param {string} [root='C'] - Root note
 * @param {string} [scale='major'] - Scale key
 * @param {number} [octaveLow=3] - Lowest octave
 * @param {number} [octaveHigh=5] - Highest octave
 * @param {Object} [opts={}] - Additional options
 * @param {string} [opts.harpKey='C'] - Harmonica key (used by harmonica-workshop)
 * @returns {SessionConfig|null}
 */
export function getTemplate(templateId, root = 'C', scale = 'major', octaveLow = 3, octaveHigh = 5, opts = {}) {
  const factory = TEMPLATE_FACTORIES[templateId];
  if (!factory) return null;

  // Harmonica workshop accepts harpKey as 5th positional arg
  if (templateId === 'harmonica-workshop') {
    const harpKey = opts.harpKey ?? 'C';
    return factory(root, scale, octaveLow, octaveHigh, harpKey);
  }

  return factory(root, scale, octaveLow, octaveHigh);
}
