/**
 * skill-model.js — Derives skill levels from practice history.
 *
 * Consumes session records (from history.js) and computes a skill map
 * with 6 dimensions. Each dimension has a level (0-1), a trend
 * (improving / plateau / declining), and a last-practiced date.
 *
 * Uses a rolling 14-session window for level computation and compares
 * two halves (first 7 vs last 7) for trend detection.
 *
 * Pure computation module — no persistence, no side effects.
 * Named exports only.
 */

import { SKILL_DIMENSIONS } from '../core/exercise-schema.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_SIZE = 14;
const TREND_THRESHOLD = 0.05; // 5% improvement/decline threshold

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract skill delta values for a given dimension from session blocks.
 * Returns an array of { value, date } objects from newest to oldest.
 *
 * @param {Object[]} sessions - Session records (newest first)
 * @param {string} dimension - Skill dimension key
 * @returns {{ value: number, date: string }[]}
 */
function extractDimensionValues(sessions, dimension) {
  const values = [];

  for (const session of sessions) {
    for (const block of (session.blocks ?? [])) {
      const skills = block.measurements?.skills;
      if (skills && skills[dimension] != null) {
        values.push({
          value: skills[dimension],
          date: session.date,
        });
      }
    }
  }

  return values;
}

/**
 * Compute the average of an array of numbers.
 * @param {number[]} nums
 * @returns {number}
 */
function avg(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/**
 * Clamp a value between 0 and 1.
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Determine trend from two halves of a data window.
 * Compares the average of the recent half to the older half.
 *
 * @param {number[]} values - Values in chronological order (oldest first)
 * @returns {'improving'|'plateau'|'declining'}
 */
function computeTrend(values) {
  if (values.length < 4) return 'plateau';

  const mid = Math.floor(values.length / 2);
  const older = values.slice(0, mid);
  const newer = values.slice(mid);

  const olderAvg = avg(older);
  const newerAvg = avg(newer);

  if (olderAvg === 0 && newerAvg === 0) return 'plateau';

  // Compute relative change
  const base = olderAvg || 0.01; // avoid division by zero
  const change = (newerAvg - olderAvg) / base;

  if (change > TREND_THRESHOLD) return 'improving';
  if (change < -TREND_THRESHOLD) return 'declining';
  return 'plateau';
}

// ---------------------------------------------------------------------------
// Dimension-specific level computation
// ---------------------------------------------------------------------------

/**
 * Compute pitchAccuracy level.
 * Formula: 1 - (avgCents / 50), clamped [0, 1]
 * Also considers direct skill delta values if available.
 *
 * @param {Object[]} sessions
 * @returns {{ level: number, values: number[] }}
 */
function computePitchAccuracy(sessions) {
  // First try skill deltas from measurements
  const deltas = extractDimensionValues(sessions, 'pitchAccuracy');
  const window = deltas.slice(0, WINDOW_SIZE);

  if (window.length > 0) {
    const values = window.map(d => d.value);
    return { level: clamp01(avg(values)), values };
  }

  // Fallback: compute from raw metrics
  const centValues = [];
  for (const session of sessions.slice(0, WINDOW_SIZE)) {
    for (const block of (session.blocks ?? [])) {
      const centsAvg = block.measurements?.metrics?.['cents-avg'];
      if (centsAvg != null) {
        centValues.push(clamp01(1 - centsAvg / 50));
      }
    }
  }

  return {
    level: centValues.length > 0 ? clamp01(avg(centValues)) : 0,
    values: centValues,
  };
}

/**
 * Compute pitchStability level.
 * Formula: avgSteadyStreak / 10000, clamped [0, 1] (10s max = 1.0)
 *
 * @param {Object[]} sessions
 * @returns {{ level: number, values: number[] }}
 */
function computePitchStability(sessions) {
  const deltas = extractDimensionValues(sessions, 'pitchStability');
  const window = deltas.slice(0, WINDOW_SIZE);

  if (window.length > 0) {
    const values = window.map(d => d.value);
    return { level: clamp01(avg(values)), values };
  }

  // Fallback: from raw metrics
  const holdValues = [];
  for (const session of sessions.slice(0, WINDOW_SIZE)) {
    for (const block of (session.blocks ?? [])) {
      const holdMs = block.measurements?.metrics?.['hold-steady-ms'];
      if (holdMs != null) {
        holdValues.push(clamp01(holdMs / 10000));
      }
    }
  }

  return {
    level: holdValues.length > 0 ? clamp01(avg(holdValues)) : 0,
    values: holdValues,
  };
}

/**
 * Compute earTraining level.
 * Uses phrase-accuracy metric (already 0-100, normalize to 0-1).
 *
 * @param {Object[]} sessions
 * @returns {{ level: number, values: number[] }}
 */
function computeEarTraining(sessions) {
  const deltas = extractDimensionValues(sessions, 'earTraining');
  const window = deltas.slice(0, WINDOW_SIZE);

  if (window.length > 0) {
    const values = window.map(d => d.value);
    return { level: clamp01(avg(values)), values };
  }

  // Fallback: from raw metrics
  const phraseValues = [];
  for (const session of sessions.slice(0, WINDOW_SIZE)) {
    for (const block of (session.blocks ?? [])) {
      const phraseAcc = block.measurements?.metrics?.['phrase-accuracy'];
      if (phraseAcc != null) {
        phraseValues.push(clamp01(phraseAcc / 100));
      }
    }
  }

  return {
    level: phraseValues.length > 0 ? clamp01(avg(phraseValues)) : 0,
    values: phraseValues,
  };
}

/**
 * Compute scaleFluency level.
 * Combination of accuracy + speed in scale exercises.
 *
 * @param {Object[]} sessions
 * @returns {{ level: number, values: number[] }}
 */
function computeScaleFluency(sessions) {
  const deltas = extractDimensionValues(sessions, 'scaleFluency');
  const window = deltas.slice(0, WINDOW_SIZE);

  if (window.length > 0) {
    const values = window.map(d => d.value);
    return { level: clamp01(avg(values)), values };
  }

  // Fallback: combine notes-hit-pct and time-per-note-avg
  const fluencyValues = [];
  for (const session of sessions.slice(0, WINDOW_SIZE)) {
    for (const block of (session.blocks ?? [])) {
      const metrics = block.measurements?.metrics;
      if (!metrics) continue;

      let score = 0;
      let components = 0;

      if (metrics['notes-hit-pct'] != null) {
        score += metrics['notes-hit-pct'] / 100;
        components++;
      }
      if (metrics['time-per-note-avg'] != null) {
        // 500ms or less = 1.0, 5000ms+ = 0.0
        score += clamp01(1 - (metrics['time-per-note-avg'] - 500) / 4500);
        components++;
      }

      if (components > 0) {
        fluencyValues.push(score / components);
      }
    }
  }

  return {
    level: fluencyValues.length > 0 ? clamp01(avg(fluencyValues)) : 0,
    values: fluencyValues,
  };
}

/**
 * Compute reactionSpeed level.
 * Formula: 1 - (avgReactionMs / 5000), clamped [0, 1]
 *
 * @param {Object[]} sessions
 * @returns {{ level: number, values: number[] }}
 */
function computeReactionSpeed(sessions) {
  const deltas = extractDimensionValues(sessions, 'reactionSpeed');
  const window = deltas.slice(0, WINDOW_SIZE);

  if (window.length > 0) {
    const values = window.map(d => d.value);
    return { level: clamp01(avg(values)), values };
  }

  // Fallback: from raw metrics
  const reactionValues = [];
  for (const session of sessions.slice(0, WINDOW_SIZE)) {
    for (const block of (session.blocks ?? [])) {
      const reactionMs = block.measurements?.metrics?.['reaction-ms'];
      if (reactionMs != null) {
        reactionValues.push(clamp01(1 - reactionMs / 5000));
      }
    }
  }

  return {
    level: reactionValues.length > 0 ? clamp01(avg(reactionValues)) : 0,
    values: reactionValues,
  };
}

/**
 * Compute range level.
 * Tracks highest/lowest accurate notes across all exercises.
 * 4 octaves (48 semitones) span = 1.0.
 *
 * @param {Object[]} sessions
 * @returns {{ level: number, values: number[], low: number|null, high: number|null }}
 */
function computeRange(sessions) {
  let globalLow = null;
  let globalHigh = null;
  const spanValues = [];

  for (const session of sessions.slice(0, WINDOW_SIZE)) {
    for (const block of (session.blocks ?? [])) {
      const metrics = block.measurements?.metrics;
      if (!metrics) continue;

      const low = metrics['range-low'];
      const high = metrics['range-high'];

      if (low != null && high != null) {
        if (globalLow === null || low < globalLow) globalLow = low;
        if (globalHigh === null || high > globalHigh) globalHigh = high;

        const span = high - low;
        spanValues.push(clamp01(span / 48));
      }
    }
  }

  const level = globalLow != null && globalHigh != null
    ? clamp01((globalHigh - globalLow) / 48)
    : 0;

  return { level, values: spanValues, low: globalLow, high: globalHigh };
}

// ---------------------------------------------------------------------------
// Dimension computation registry
// ---------------------------------------------------------------------------

const DIMENSION_COMPUTERS = {
  pitchAccuracy: computePitchAccuracy,
  pitchStability: computePitchStability,
  earTraining: computeEarTraining,
  scaleFluency: computeScaleFluency,
  reactionSpeed: computeReactionSpeed,
  range: computeRange,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the full skill map from practice history.
 *
 * Returns an object with one entry per skill dimension, each containing:
 * - level: 0-1 normalized skill level
 * - trend: 'improving' | 'plateau' | 'declining'
 * - lastPracticed: ISO date string or null
 *
 * For the 'range' dimension, also includes low/high MIDI values.
 *
 * @param {Object[]} history - Session records (from getHistory()), newest first
 * @returns {Object.<string, { level: number, trend: string, lastPracticed: string|null }>}
 */
export function computeSkillMap(history) {
  const skillMap = {};

  for (const dimension of SKILL_DIMENSIONS) {
    const computer = DIMENSION_COMPUTERS[dimension];
    if (!computer) {
      skillMap[dimension] = { level: 0, trend: 'plateau', lastPracticed: null };
      continue;
    }

    const result = computer(history);

    // Find last practiced date for this dimension
    const deltas = extractDimensionValues(history, dimension);
    const lastPracticed = deltas.length > 0 ? deltas[0].date : null;

    // Compute trend from values in chronological order (reverse for oldest-first)
    const chronological = [...result.values].reverse();
    const trend = computeTrend(chronological);

    const entry = {
      level: Math.round(result.level * 1000) / 1000, // 3 decimal places
      trend,
      lastPracticed,
    };

    // Add range-specific data
    if (dimension === 'range' && result.low != null) {
      entry.low = result.low;
      entry.high = result.high;
    }

    skillMap[dimension] = entry;
  }

  return skillMap;
}
