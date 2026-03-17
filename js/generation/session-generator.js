/**
 * session-generator.js — Builds personalized practice sessions.
 *
 * "Today's Practice" in one function call: reads profile and history,
 * computes skill map, determines focus, allocates time blocks, selects
 * exercises, picks a scale, calibrates difficulty, and assembles a
 * ready-to-run session config.
 *
 * Always produces a valid session — never fails. Falls back to a
 * balanced default session when profile or history is empty.
 *
 * Pure generation module — no DOM, no audio, no persistence.
 * Named exports only.
 */

import { ensureProfile } from '../profile/profile.js';
import { getHistory } from '../profile/history.js';
import { computeSkillMap } from '../profile/skill-model.js';
import { SCALE_INTERVALS, SCALE_LABELS } from '../utils/scales.js';
import {
  createSequenceExercise,
  createEchoExercise,
  SKILL_DIMENSIONS,
} from '../core/exercise-schema.js';
import {
  buildSustainedExercise,
  buildReactiveExercise,
  buildFreePlayExercise,
} from '../core/session-templates.js';
import {
  calibrateDifficulty,
  getPatternsForLevel,
  getEchoDifficultyForLevel,
} from './difficulty.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All available scale keys for discovery picks. */
const ALL_SCALES = Object.keys(SCALE_INTERVALS);

/** Focus intents the player can choose. */
const VALID_INTENTS = Object.freeze([
  'ear-training',
  'scales',
  'warmup',
  'intonation',
  'range',
]);

/**
 * Block allocation percentages by duration tier.
 * Keys are the max minutes for that tier.
 */
const BLOCK_ALLOCATIONS = Object.freeze([
  {
    maxMin: 5,
    phases: [
      { phase: 'activate', pct: 0.20 },
      { phase: 'challenge', pct: 0.60 },
      { phase: 'play', pct: 0.20 },
    ],
  },
  {
    maxMin: 10,
    phases: [
      { phase: 'activate', pct: 0.15 },
      { phase: 'develop', pct: 0.35 },
      { phase: 'challenge', pct: 0.30 },
      { phase: 'play', pct: 0.20 },
    ],
  },
  {
    maxMin: 15,
    phases: [
      { phase: 'activate', pct: 0.15 },
      { phase: 'develop', pct: 0.25 },
      { phase: 'challenge', pct: 0.25 },
      { phase: 'apply', pct: 0.20 },
      { phase: 'play', pct: 0.15 },
    ],
  },
  {
    maxMin: Infinity,
    phases: [
      { phase: 'activate', pct: 0.10 },
      { phase: 'develop', pct: 0.25 },
      { phase: 'challenge', pct: 0.25 },
      { phase: 'apply', pct: 0.25 },
      { phase: 'play', pct: 0.15 },
    ],
  },
]);

/**
 * Intent to skill dimension mapping.
 */
const INTENT_TO_SKILL = Object.freeze({
  'ear-training': 'earTraining',
  'scales': 'scaleFluency',
  'warmup': 'pitchStability',
  'intonation': 'pitchAccuracy',
  'range': 'range',
});

/**
 * Session name prefixes by focus skill.
 */
const SESSION_NAMES = Object.freeze({
  pitchAccuracy: 'Intonation Focus',
  pitchStability: 'Stability Practice',
  earTraining: 'Ear Training',
  scaleFluency: 'Scale Fluency',
  reactionSpeed: 'Reflex Training',
  range: 'Range Explorer',
});

// ---------------------------------------------------------------------------
// Internal helpers — randomness
// ---------------------------------------------------------------------------

/**
 * Pick a random element from an array.
 * @param {any[]} arr
 * @returns {any}
 */
function randomFrom(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick a random element from the array, preferring ones NOT in the exclude set.
 * Falls back to any element if all are excluded.
 *
 * @param {any[]} arr
 * @param {Set|any[]} exclude
 * @returns {any}
 */
function pickUnused(arr, exclude) {
  const excludeSet = exclude instanceof Set ? exclude : new Set(exclude);
  const unused = arr.filter(item => !excludeSet.has(item));
  if (unused.length > 0) return randomFrom(unused);
  return randomFrom(arr);
}

// ---------------------------------------------------------------------------
// Internal helpers — scale selection
// ---------------------------------------------------------------------------

/**
 * Extract scale keys used in recent session history.
 *
 * @param {Object[]} history - Session records
 * @param {number} sessionCount - How many recent sessions to check
 * @returns {Set<string>}
 */
function extractRecentScales(history, sessionCount) {
  const scales = new Set();
  const recent = history.slice(0, sessionCount);

  for (const session of recent) {
    for (const block of (session.blocks ?? [])) {
      const scale = block.measurements?.scale
        ?? block.exerciseType?.match?.(/scale:(\w+)/)?.[1];
      if (scale) scales.add(scale);
    }

    // Also check the session name for scale hints
    const nameMatch = session.name?.match(/in\s+[A-G]#?\s+(\w+)/i);
    if (nameMatch) {
      const scaleName = nameMatch[1].toLowerCase().replace(/\s+/g, '_');
      if (SCALE_INTERVALS[scaleName]) {
        scales.add(scaleName);
      }
    }
  }

  return scales;
}

/**
 * Extract all scale keys ever used in history.
 *
 * @param {Object[]} history
 * @returns {string[]}
 */
function extractAllUsedScales(history) {
  const scales = new Set();
  for (const session of history) {
    for (const block of (session.blocks ?? [])) {
      const scale = block.measurements?.scale;
      if (scale) scales.add(scale);
    }
    const nameMatch = session.name?.match(/in\s+[A-G]#?\s+(\w+)/i);
    if (nameMatch) {
      const scaleName = nameMatch[1].toLowerCase().replace(/\s+/g, '_');
      if (SCALE_INTERVALS[scaleName]) {
        scales.add(scaleName);
      }
    }
  }
  return [...scales];
}

/**
 * Select a scale based on profile favorites, history, and discovery.
 *
 * 50% from favorites (not recently used)
 * 30% from previously used (not recently used)
 * 20% discovery (never used before)
 *
 * @param {Object} profile
 * @param {Object[]} history
 * @returns {string} Scale key
 */
function selectScale(profile, history) {
  const favorites = profile.preferences?.favoriteScales ?? ['major'];
  const recentScales = extractRecentScales(history, 2);
  const allUsed = extractAllUsedScales(history);

  const roll = Math.random();

  if (roll < 0.5) {
    // Pick from favorites, preferring ones not used recently
    return pickUnused(favorites, recentScales) ?? randomFrom(favorites);
  } else if (roll < 0.8) {
    // Pick from all previously used scales
    if (allUsed.length > 0) {
      return pickUnused(allUsed, recentScales) ?? randomFrom(favorites);
    }
    return randomFrom(favorites);
  } else {
    // Discovery: pick a scale they haven't tried
    const tried = new Set(allUsed);
    const untried = ALL_SCALES.filter(s => !tried.has(s) && s !== 'chromatic');
    if (untried.length > 0) {
      return randomFrom(untried);
    }
    return pickUnused(ALL_SCALES.filter(s => s !== 'chromatic'), recentScales)
      ?? randomFrom(favorites);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — focus selection
// ---------------------------------------------------------------------------

/**
 * Determine which skill dimension to focus on.
 *
 * If no history, returns 'pitchAccuracy' as a sensible default.
 * Weights: (1 - level) * recencyWeight
 * Only considers dimensions that have been practiced at least once.
 *
 * @param {Object} skillMap
 * @param {Object[]} history
 * @returns {string} Skill dimension key
 */
function selectFocus(skillMap, history) {
  if (!skillMap || Object.keys(skillMap).length === 0) return 'pitchAccuracy';

  const MS_PER_DAY = 86_400_000;
  const now = Date.now();
  let best = null;
  let bestScore = -1;

  for (const dim of SKILL_DIMENSIONS) {
    const entry = skillMap[dim];
    if (!entry) continue;

    // Only consider dimensions practiced at least once
    if (!entry.lastPracticed) continue;

    const daysSincePractice = entry.lastPracticed
      ? (now - new Date(entry.lastPracticed).getTime()) / MS_PER_DAY
      : 30; // treat never-practiced as 30 days ago

    // Need = (1 - level) * recencyWeight
    // Recency: more weight for things not practiced recently (capped at 2x)
    const recencyWeight = Math.min(2, 1 + daysSincePractice / 14);
    const need = (1 - entry.level) * recencyWeight;

    if (need > bestScore) {
      bestScore = need;
      best = dim;
    }
  }

  // If nothing was practiced, default to pitchAccuracy
  return best ?? 'pitchAccuracy';
}

// ---------------------------------------------------------------------------
// Internal helpers — exercise builders per phase
// ---------------------------------------------------------------------------

/**
 * Build an activate-phase exercise.
 * Always a long tone or drone match.
 */
function buildActivateExercise(root, scale, octaveRange, skillMap) {
  const oRange = [octaveRange[0], octaveRange[1]];
  const useDrone = Math.random() < 0.5;

  if (useDrone) {
    return buildSustainedExercise('drone-match', root, scale, {
      label: 'Drone Match',
      description: `Match the ${root} drone tone to settle in`,
      octaveRange: oRange,
      drone: { voice: 'triangle', gain: 0.7 },
    });
  }

  return buildSustainedExercise('long-tone', root, scale, {
    label: 'Long Tone',
    description: 'Hold a comfortable note, focus on stability',
    octaveRange: oRange,
  });
}

/**
 * Build a develop-phase exercise based on focus skill.
 */
function buildDevelopExercise(focus, root, scale, octaveRange, skillMap) {
  const [octLow, octHigh] = octaveRange;
  const level = skillMap[focus]?.level ?? 0.5;
  const patterns = getPatternsForLevel(level);
  const pattern = randomFrom(patterns);

  switch (focus) {
    case 'earTraining': {
      const difficulty = getEchoDifficultyForLevel(skillMap.earTraining?.level ?? 0);
      // For develop phase, keep difficulty at easy/medium max
      const safeDifficulty = difficulty === 'hard' ? 'medium' : difficulty;
      return createEchoExercise({
        root, scale, octaveLow: octLow, octaveHigh: octHigh,
        difficulty: safeDifficulty,
        phraseCount: 3,
        synthVoice: 'sine',
      });
    }

    case 'pitchStability':
      return buildSustainedExercise('long-tone-cycle', root, scale, {
        label: 'Long Tone Cycle',
        description: 'Walk through scale degrees, hold each steady',
        octaveRange: [octLow, octHigh],
        drone: { voice: 'sine', gain: 0.5 },
      });

    case 'reactionSpeed':
      return buildReactiveExercise('random-note-develop', root, scale, {
        label: 'Note Finding',
        description: `Find notes from ${root} ${SCALE_LABELS[scale] ?? scale}`,
        octaveRange: [octLow, octHigh],
      });

    case 'scaleFluency':
    case 'pitchAccuracy':
    case 'range':
    default:
      return createSequenceExercise({
        root, scale, pattern,
        octaveLow: octLow, octaveHigh: octHigh,
      });
  }
}

/**
 * Build a challenge-phase exercise based on focus skill.
 */
function buildChallengeExercise(focus, root, scale, octaveRange, skillMap) {
  const [octLow, octHigh] = octaveRange;

  switch (focus) {
    case 'earTraining': {
      const difficulty = getEchoDifficultyForLevel(skillMap.earTraining?.level ?? 0);
      return createEchoExercise({
        root, scale, octaveLow: octLow, octaveHigh: octHigh,
        difficulty,
        phraseCount: 4,
        synthVoice: 'sine',
      });
    }

    case 'reactionSpeed':
      return buildReactiveExercise('random-note-challenge', root, scale, {
        label: 'Random Note Reflex',
        description: `Find each note as fast as you can`,
        octaveRange: [octLow, octHigh],
      });

    case 'scaleFluency':
      return createSequenceExercise({
        root, scale,
        pattern: 'ascending',
        octaveLow: octLow, octaveHigh: octHigh,
        timing: { mode: 'auto-tempo', tempoBpm: 60, noteDuration: 1000 },
        skills: ['scaleFluency', 'pitchAccuracy'],
      });

    case 'pitchStability':
    case 'pitchAccuracy':
      return buildReactiveExercise('random-note', root, scale, {
        label: 'Random Note Reflex',
        description: `Find random notes from ${root} ${SCALE_LABELS[scale] ?? scale}`,
        octaveRange: [octLow, octHigh],
      });

    case 'range':
      return createSequenceExercise({
        root, scale,
        pattern: 'up-and-back',
        octaveLow: octLow, octaveHigh: octHigh,
        skills: ['range', 'pitchAccuracy'],
      });

    default:
      return buildReactiveExercise('challenge', root, scale, {
        octaveRange: [octLow, octHigh],
      });
  }
}

/**
 * Build an apply-phase exercise based on focus skill.
 */
function buildApplyExercise(focus, root, scale, octaveRange, skillMap) {
  const [octLow, octHigh] = octaveRange;

  switch (focus) {
    case 'earTraining': {
      const difficulty = getEchoDifficultyForLevel(skillMap.earTraining?.level ?? 0);
      return createEchoExercise({
        root, scale, octaveLow: octLow, octaveHigh: octHigh,
        difficulty,
        phraseCount: 3,
        showReview: false,
        synthVoice: 'sine',
      });
    }

    case 'scaleFluency': {
      const level = skillMap.scaleFluency?.level ?? 0.5;
      const patterns = getPatternsForLevel(level);
      // Pick a harder pattern for apply phase
      const complexPatterns = patterns.filter(p => !['ascending', 'descending'].includes(p));
      const pattern = complexPatterns.length > 0 ? randomFrom(complexPatterns) : randomFrom(patterns);
      return createSequenceExercise({
        root, scale, pattern,
        octaveLow: octLow, octaveHigh: octHigh,
      });
    }

    case 'pitchAccuracy':
    case 'pitchStability':
      return buildSustainedExercise('centering', root, scale, {
        label: 'Centering',
        description: 'Find the exact center of each note',
        octaveRange: [octLow, octHigh],
      });

    case 'reactionSpeed':
      return buildReactiveExercise('speed-apply', root, scale, {
        label: 'Speed Challenge',
        description: `Full scale reflex — how fast can you go?`,
        octaveRange: [octLow, octHigh],
      });

    case 'range':
    default:
      return createSequenceExercise({
        root, scale, pattern: 'ascending',
        octaveLow: octLow, octaveHigh: octHigh,
      });
  }
}

/**
 * Build a play-phase exercise.
 * Always free play or drone jam.
 */
function buildPlayExercise(root, scale, octaveRange) {
  const useDrone = Math.random() < 0.6;

  return buildFreePlayExercise(root, scale, {
    label: useDrone ? 'Drone Jam' : 'Free Play',
    description: useDrone
      ? `Improvise freely in ${root} ${SCALE_LABELS[scale] ?? scale} over drone`
      : `Play whatever you like in ${root} ${SCALE_LABELS[scale] ?? scale}`,
    octaveRange: [octaveRange[0], octaveRange[1]],
    ...(useDrone ? { drone: { voice: 'triangle', gain: 0.6 } } : {}),
  });
}

// ---------------------------------------------------------------------------
// Internal helpers — block assembly
// ---------------------------------------------------------------------------

/**
 * Map a phase + focus to a label for the block.
 */
const PHASE_LABELS = Object.freeze({
  activate: 'Warm Up',
  develop: 'Build',
  challenge: 'Push',
  apply: 'Apply',
  play: 'Enjoy',
});

/**
 * Build a single block for a phase.
 */
function buildBlock(phase, focus, root, scale, octaveRange, durationMs, skillMap) {
  let exercise;

  switch (phase) {
    case 'activate':
      exercise = buildActivateExercise(root, scale, octaveRange, skillMap);
      break;
    case 'develop':
      exercise = buildDevelopExercise(focus, root, scale, octaveRange, skillMap);
      break;
    case 'challenge':
      exercise = buildChallengeExercise(focus, root, scale, octaveRange, skillMap);
      break;
    case 'apply':
      exercise = buildApplyExercise(focus, root, scale, octaveRange, skillMap);
      break;
    case 'play':
      exercise = buildPlayExercise(root, scale, octaveRange);
      break;
    default:
      exercise = buildPlayExercise(root, scale, octaveRange);
  }

  // Calibrate difficulty
  exercise = calibrateDifficulty(exercise, skillMap);

  return {
    exercise,
    duration: durationMs,
    label: exercise.name ?? PHASE_LABELS[phase] ?? phase,
    phase,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a personalized practice session.
 *
 * Reads profile and history, computes skill map, determines focus,
 * allocates blocks, selects exercises, and returns a ready-to-run
 * session config (same shape as template configs).
 *
 * Always succeeds — falls back to sensible defaults when data is missing.
 *
 * @param {Object} [options={}]
 * @param {string}  [options.intent] - Focus intent: 'ear-training', 'scales', 'warmup', 'intonation', 'range'
 * @param {number}  [options.durationMinutes] - Target session length (defaults to profile preference)
 * @param {string}  [options.root] - Override root note
 * @param {string}  [options.scale] - Override scale
 * @param {number}  [options.octaveLow] - Override low octave
 * @param {number}  [options.octaveHigh] - Override high octave
 * @returns {Object} Session config (SessionConfig shape)
 */
export function generateSession(options = {}) {
  // Step 0: Read profile and history
  const profile = ensureProfile();
  const history = getHistory(14); // last 2 weeks
  const skillMap = computeSkillMap(history);

  // Step 1: Determine duration
  const durationMinutes = options.durationMinutes
    ?? profile.preferences?.defaultSessionLength
    ?? 15;
  const totalMs = durationMinutes * 60_000;

  // Step 2: Select root and scale
  const root = options.root ?? randomFrom(profile.preferences?.favoriteRoots ?? null) ?? 'C';
  const scale = options.scale ?? selectScale(profile, history);
  const scaleLabel = SCALE_LABELS[scale] ?? scale;

  // Step 3: Get octave range
  const octaveRange = [
    options.octaveLow ?? profile.preferences?.octaveRange?.[0] ?? 3,
    options.octaveHigh ?? profile.preferences?.octaveRange?.[1] ?? 5,
  ];

  // Step 4: Determine focus
  let focus;
  if (options.intent && INTENT_TO_SKILL[options.intent]) {
    focus = INTENT_TO_SKILL[options.intent];
  } else {
    focus = selectFocus(skillMap, history);
  }

  // Step 5: Allocate time to blocks
  const allocation = BLOCK_ALLOCATIONS.find(a => durationMinutes <= a.maxMin)
    ?? BLOCK_ALLOCATIONS[BLOCK_ALLOCATIONS.length - 1];

  // Step 6: Build blocks
  const blocks = [];
  for (const { phase, pct } of allocation.phases) {
    const blockMs = Math.round(totalMs * pct);
    // Skip very short blocks (< 30s)
    if (blockMs < 30_000) continue;

    const block = buildBlock(phase, focus, root, scale, octaveRange, blockMs, skillMap);
    blocks.push(block);
  }

  // Step 7: Assemble session config
  const focusName = SESSION_NAMES[focus] ?? 'Practice';
  const sessionName = `${focusName} in ${root} ${scaleLabel}`;

  return {
    id: `generated-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: sessionName,
    description: `${durationMinutes} min personalized session — ${focusName.toLowerCase()}`,
    tags: ['generated', 'today', `${durationMinutes}-min`],
    blocks,
    transitions: 'gentle',
    totalDuration: blocks.reduce((sum, b) => sum + b.duration, 0),
    _generated: true,
    _focus: focus,
    _scale: scale,
    _root: root,
  };
}

/**
 * Format a generated session into a brief human-readable summary.
 *
 * @param {Object} session - Session config from generateSession()
 * @returns {{ name: string, duration: string, exerciseCount: number, exercises: string[] }}
 */
export function summarizeSession(session) {
  const totalMin = Math.round((session.totalDuration ?? 0) / 60_000);
  const exercises = (session.blocks ?? []).map(b => b.label ?? b.exercise?.name ?? 'Exercise');

  return {
    name: session.name ?? 'Today\'s Practice',
    duration: `${totalMin} min`,
    exerciseCount: exercises.length,
    exercises,
  };
}
