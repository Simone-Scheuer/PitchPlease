/**
 * difficulty.js — Maps skill levels to concrete exercise parameters.
 *
 * Given an exercise config and a skill map (from skill-model.js), adjusts
 * the exercise's tempo, range, pattern complexity, echo phrase length, and
 * interval set to match the player's current ability.
 *
 * Pure computation module — no DOM, no audio, no persistence.
 * Named exports only.
 */

// ---------------------------------------------------------------------------
// Constants — difficulty tiers
// ---------------------------------------------------------------------------

/**
 * Skill level breakpoints.
 * < 0.3: beginner, 0.3-0.6: developing, 0.6-0.8: competent, > 0.8: strong
 */
const TIERS = Object.freeze([
  { max: 0.3,  label: 'beginner' },
  { max: 0.6,  label: 'developing' },
  { max: 0.8,  label: 'competent' },
  { max: 1.01, label: 'strong' },
]);

/**
 * Tempo ranges (BPM) per tier for sequence exercises.
 */
const TEMPO_BY_TIER = Object.freeze({
  beginner:   { tempoBpm: 40,  noteDuration: 1500 },
  developing: { tempoBpm: 60,  noteDuration: 1000 },
  competent:  { tempoBpm: 90,  noteDuration: 700 },
  strong:     { tempoBpm: 120, noteDuration: 500 },
});

/**
 * Hold time (ms) per tier for player-driven exercises.
 */
const HOLD_BY_TIER = Object.freeze({
  beginner:   400,
  developing: 300,
  competent:  250,
  strong:     200,
});

/**
 * Echo difficulty per ear-training skill level.
 */
const ECHO_DIFFICULTY_BY_TIER = Object.freeze({
  beginner:   'easy',
  developing: 'easy',   // stays easy, medium mixed in at 0.45+
  competent:  'medium',
  strong:     'hard',
});

/**
 * Phrase count per echo difficulty tier.
 */
const PHRASE_COUNT_BY_TIER = Object.freeze({
  beginner:   3,
  developing: 3,
  competent:  4,
  strong:     5,
});

/**
 * Pattern complexity per tier for sequence exercises.
 */
const PATTERN_BY_TIER = Object.freeze({
  beginner:   ['ascending', 'descending'],
  developing: ['ascending', 'descending', 'up-and-back'],
  competent:  ['ascending', 'descending', 'up-and-back', 'thirds'],
  strong:     ['ascending', 'descending', 'up-and-back', 'thirds', 'fourths', 'neighbors', 'random'],
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine the tier label for a skill level value.
 * @param {number} level - 0-1 skill level
 * @returns {string} Tier label
 */
function getTier(level) {
  for (const tier of TIERS) {
    if (level < tier.max) return tier.label;
  }
  return 'strong';
}

/**
 * Get the relevant skill level for an exercise config.
 * Picks the primary skill dimension the exercise trains.
 *
 * @param {Object} config - Exercise config
 * @param {Object} skillMap - Skill map from computeSkillMap()
 * @returns {number} Skill level 0-1
 */
function getRelevantSkillLevel(config, skillMap) {
  const skills = config.skills ?? [];
  if (skills.length === 0) return 0.5; // default to middle

  // Use the first (primary) skill dimension
  const primary = skills[0];
  const entry = skillMap[primary];
  return entry?.level ?? 0.5;
}

/**
 * Deep-clone a plain object.
 * @param {Object} obj
 * @returns {Object}
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Adjust an exercise config's difficulty based on the player's skill levels.
 *
 * Returns a new config with calibrated timing, range, and difficulty
 * parameters. Does not mutate the input.
 *
 * @param {Object} exerciseConfig - Exercise config from exercise-schema.js
 * @param {Object} skillMap - Skill map from computeSkillMap()
 * @returns {Object} Adjusted exercise config
 */
export function calibrateDifficulty(exerciseConfig, skillMap) {
  if (!exerciseConfig || !skillMap) return exerciseConfig;

  const config = clone(exerciseConfig);
  const level = getRelevantSkillLevel(config, skillMap);
  const tier = getTier(level);

  // --- Sequence exercises: adjust tempo and pattern ---
  if (config.type === 'sequence') {
    calibrateSequence(config, tier, level);
  }

  // --- Sustained exercises: adjust hold requirements ---
  if (config.type === 'sustained') {
    calibrateSustained(config, tier);
  }

  // --- Reactive exercises: adjust hold time ---
  if (config.type === 'reactive') {
    calibrateReactive(config, tier);
  }

  // --- Echo exercises: adjust difficulty and phrase count ---
  if (config.type === 'echo') {
    calibrateEcho(config, tier, level, skillMap);
  }

  // --- Trend adjustment ---
  applyTrendAdjustment(config, skillMap);

  return config;
}

/**
 * Calibrate a sequence exercise.
 * @param {Object} config - Mutable config
 * @param {string} tier - Skill tier
 * @param {number} level - Raw skill level
 */
function calibrateSequence(config, tier, level) {
  const tempoConfig = TEMPO_BY_TIER[tier];

  // Only adjust tempo for auto-tempo or fixed-tempo modes
  if (config.timing?.mode === 'auto-tempo' || config.timing?.mode === 'fixed-tempo') {
    config.timing.tempoBpm = tempoConfig.tempoBpm;
    config.timing.noteDuration = tempoConfig.noteDuration;
  }

  // For player-driven mode, adjust hold time
  if (config.timing?.mode === 'player-driven') {
    config.timing.holdMs = HOLD_BY_TIER[tier];
  }
}

/**
 * Calibrate a sustained exercise.
 * @param {Object} config - Mutable config
 * @param {string} tier - Skill tier
 */
function calibrateSustained(config, tier) {
  // Beginners get longer tolerance for stability detection
  // (this is informational — the seismograph renderer handles display)
  if (tier === 'beginner') {
    config.timing.holdMs = 500;
  }
}

/**
 * Calibrate a reactive exercise.
 * @param {Object} config - Mutable config
 * @param {string} tier - Skill tier
 */
function calibrateReactive(config, tier) {
  if (config.timing) {
    config.timing.holdMs = HOLD_BY_TIER[tier];
  }
}

/**
 * Calibrate an echo exercise.
 * @param {Object} config - Mutable config
 * @param {string} tier - Skill tier
 * @param {number} level - Raw skill level
 * @param {Object} skillMap - Full skill map for ear training level
 */
function calibrateEcho(config, tier, level, skillMap) {
  const earLevel = skillMap.earTraining?.level ?? 0;
  const earTier = getTier(earLevel);

  // Map ear training tier to echo difficulty
  let echoDifficulty = ECHO_DIFFICULTY_BY_TIER[earTier];

  // Mix in medium for developing players above 0.45
  if (earTier === 'developing' && earLevel >= 0.45) {
    echoDifficulty = Math.random() < 0.5 ? 'easy' : 'medium';
  }

  // Mix in hard for competent players above 0.7
  if (earTier === 'competent' && earLevel >= 0.7) {
    echoDifficulty = Math.random() < 0.5 ? 'medium' : 'hard';
  }

  // Store difficulty for display/regeneration
  config._echoDifficulty = echoDifficulty;
  config._phraseCount = PHRASE_COUNT_BY_TIER[earTier];
}

/**
 * Apply trend-based micro-adjustments.
 * Improving trend → nudge difficulty up slightly.
 * Declining trend → nudge difficulty down.
 *
 * @param {Object} config - Mutable config
 * @param {Object} skillMap - Skill map
 */
function applyTrendAdjustment(config, skillMap) {
  const skills = config.skills ?? [];
  if (skills.length === 0) return;

  const primary = skills[0];
  const entry = skillMap[primary];
  if (!entry) return;

  const { trend } = entry;

  if (trend === 'improving' && config.timing) {
    // Nudge tempo up 10% for improving players
    if (config.timing.tempoBpm) {
      config.timing.tempoBpm = Math.round(config.timing.tempoBpm * 1.1);
    }
    if (config.timing.noteDuration) {
      config.timing.noteDuration = Math.round(config.timing.noteDuration * 0.9);
    }
    if (config.timing.holdMs) {
      config.timing.holdMs = Math.max(150, Math.round(config.timing.holdMs * 0.9));
    }
  }

  if (trend === 'declining' && config.timing) {
    // Ease off 10% for declining players
    if (config.timing.tempoBpm) {
      config.timing.tempoBpm = Math.round(config.timing.tempoBpm * 0.9);
    }
    if (config.timing.noteDuration) {
      config.timing.noteDuration = Math.round(config.timing.noteDuration * 1.1);
    }
    if (config.timing.holdMs) {
      config.timing.holdMs = Math.round(config.timing.holdMs * 1.1);
    }
  }
}

/**
 * Get the available patterns for a given skill level.
 * Used by the session generator to pick appropriate patterns.
 *
 * @param {number} level - 0-1 skill level
 * @returns {string[]} Available patterns
 */
export function getPatternsForLevel(level) {
  const tier = getTier(level);
  return [...PATTERN_BY_TIER[tier]];
}

/**
 * Get the echo difficulty string for a given ear training level.
 *
 * @param {number} level - 0-1 ear training skill level
 * @returns {'easy'|'medium'|'hard'}
 */
export function getEchoDifficultyForLevel(level) {
  const tier = getTier(level);
  let difficulty = ECHO_DIFFICULTY_BY_TIER[tier];

  if (tier === 'developing' && level >= 0.45) {
    difficulty = Math.random() < 0.5 ? 'easy' : 'medium';
  }
  if (tier === 'competent' && level >= 0.7) {
    difficulty = Math.random() < 0.5 ? 'medium' : 'hard';
  }

  return difficulty;
}
