/**
 * measurements.js — Standardized measurement format for exercise results.
 *
 * This is the contract between the exercise layer and the profile/history
 * layer.  Every evaluator's output gets normalized into this format so the
 * skill model, journal, and session summaries can consume any exercise type
 * without special-casing.
 *
 * Pure data module — format definitions and computation, no persistence.
 */

import { SKILL_DIMENSIONS } from './exercise-schema.js';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} NoteResult
 * @property {string}  note       - Note name, e.g. "C4"
 * @property {number}  midi       - Target MIDI number
 * @property {number}  score      - 0-100
 * @property {number}  avgCents   - Average absolute cents deviation
 * @property {number}  bestCents  - Best (lowest) absolute cents deviation
 * @property {number}  holdPct    - Percentage of frames in tune (0-100)
 * @property {number}  timeToHitMs - Time to first in-tune frame (-1 if never hit)
 * @property {number}  holdTimeMs  - Total time spent in-tune
 */

/**
 * @typedef {Object} Measurement
 * @property {string}  exerciseId   - Config id of the exercise
 * @property {string}  exerciseType - Config type (sequence, sustained, etc.)
 * @property {number}  timestamp    - When the measurement was taken (Date.now())
 * @property {number}  duration     - Exercise duration in ms
 * @property {Object}  metrics      - Standardized metric values
 * @property {NoteResult[]} perNote - Per-note results
 * @property {Object}  skills       - Skill delta map { dimension: delta }
 */

// ---------------------------------------------------------------------------
// Create measurement from exercise completion data
// ---------------------------------------------------------------------------

/**
 * Build a standardized Measurement from an exercise config and evaluator output.
 *
 * @param {import('./exercise-schema.js').ExerciseConfig} config
 * @param {Object} evaluatorOutput - From evaluator.getMeasurements()
 * @param {number} elapsed - Exercise duration in ms
 * @returns {Measurement}
 */
export function createMeasurement(config, evaluatorOutput, elapsed) {
  const rawPerNote = evaluatorOutput?.perNote ?? [];
  const perNote = normalizePerNote(rawPerNote);
  const metrics = extractMetrics(evaluatorOutput, perNote, elapsed);
  const skills = computeSkillDeltas(metrics, config);

  return {
    exerciseId: config.id,
    exerciseType: config.type,
    timestamp: Date.now(),
    duration: Math.round(elapsed),
    metrics,
    perNote,
    skills,
  };
}

// ---------------------------------------------------------------------------
// Metric extraction
// ---------------------------------------------------------------------------

/**
 * Extract standardized metrics from evaluator output.
 *
 * @param {Object} evaluatorOutput
 * @param {NoteResult[]} perNote
 * @param {number} elapsed
 * @returns {Object}
 */
/**
 * Normalize per-note data from different evaluator formats into a
 * consistent shape that the rest of the pipeline can consume.
 *
 * Target-accuracy evaluator uses: avgCents, holdTimeMs, timeToHitMs, score, midi
 * Stability evaluator uses: avgDeviation, maxSteadyMs, timeLockedPct, midi
 *
 * @param {Object[]} rawPerNote
 * @returns {Object[]}
 */
function normalizePerNote(rawPerNote) {
  return rawPerNote.map(n => ({
    ...n,
    // Map stability field names to standard names (keep originals if present)
    avgCents: n.avgCents ?? n.avgDeviation ?? 0,
    holdTimeMs: n.holdTimeMs ?? n.maxSteadyMs ?? undefined,
    score: n.score ?? (n.timeLockedPct != null ? (n.timeLockedPct > 0 ? n.timeLockedPct : 0) : undefined),
    midi: n.midi ?? undefined,
  }));
}

function extractMetrics(evaluatorOutput, perNote, elapsed) {
  const metrics = {};

  // Direct pass-through from evaluator (target-accuracy format)
  if (evaluatorOutput?.['cents-avg'] != null) {
    metrics['cents-avg'] = evaluatorOutput['cents-avg'];
  }
  if (evaluatorOutput?.['notes-hit-pct'] != null) {
    metrics['notes-hit-pct'] = evaluatorOutput['notes-hit-pct'];
  }
  if (evaluatorOutput?.['time-to-hit-ms'] != null) {
    metrics['time-to-hit-ms'] = evaluatorOutput['time-to-hit-ms'];
  }

  // Pass-through from stability evaluator format
  if (evaluatorOutput?.avgDeviation != null && metrics['cents-avg'] == null) {
    metrics['cents-avg'] = Math.round(evaluatorOutput.avgDeviation);
  }
  if (evaluatorOutput?.maxSteadyStreakMs != null) {
    metrics['hold-steady-ms'] = evaluatorOutput.maxSteadyStreakMs;
  }

  // Compute from per-note data if evaluator didn't provide
  // perNote is expected to be already normalized via normalizePerNote()
  if (perNote.length > 0) {
    // cents-avg
    if (metrics['cents-avg'] == null) {
      const sum = perNote.reduce((s, n) => s + (n.avgCents ?? 0), 0);
      metrics['cents-avg'] = Math.round(sum / perNote.length);
    }

    // cents-variance
    const avg = metrics['cents-avg'] ?? 0;
    const varianceSum = perNote.reduce((s, n) => {
      const diff = (n.avgCents ?? 0) - avg;
      return s + diff * diff;
    }, 0);
    metrics['cents-variance'] = Math.round(varianceSum / perNote.length);

    // notes-hit-pct
    if (metrics['notes-hit-pct'] == null) {
      const hit = perNote.filter(n => n.score > 0).length;
      metrics['notes-hit-pct'] = Math.round((hit / perNote.length) * 100);
    }

    // hold-steady-ms (average hold time across notes)
    if (metrics['hold-steady-ms'] == null) {
      const holdTimes = perNote.filter(n => n.holdTimeMs != null);
      if (holdTimes.length > 0) {
        metrics['hold-steady-ms'] = Math.round(
          holdTimes.reduce((s, n) => s + n.holdTimeMs, 0) / holdTimes.length
        );
      }
    }

    // reaction-ms (average time-to-hit)
    const reactions = perNote.filter(n => n.timeToHitMs != null && n.timeToHitMs >= 0);
    if (reactions.length > 0) {
      metrics['reaction-ms'] = Math.round(
        reactions.reduce((s, n) => s + n.timeToHitMs, 0) / reactions.length
      );
    }

    // notes-per-minute
    if (elapsed > 0) {
      metrics['notes-per-minute'] = Math.round((perNote.length / elapsed) * 60000);
    }

    // time-per-note-avg
    if (perNote.length > 0 && elapsed > 0) {
      metrics['time-per-note-avg'] = Math.round(elapsed / perNote.length);
    }

    // range: lowest and highest MIDI hit accurately (score > 50)
    const accurate = perNote.filter(n => n.score > 50 && n.midi != null);
    if (accurate.length > 0) {
      const midis = accurate.map(n => n.midi);
      metrics['range-low'] = Math.min(...midis);
      metrics['range-high'] = Math.max(...midis);
    }
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Skill delta computation
// ---------------------------------------------------------------------------

/**
 * Compute skill dimension deltas from metrics.
 * Returns a map of { dimension: delta } where delta is a 0-1 score
 * representing how well the player performed on that dimension.
 *
 * These deltas are NOT the final skill level — the skill model in the
 * profile system uses these as inputs to update the rolling skill level.
 *
 * @param {Object} metrics
 * @param {import('./exercise-schema.js').ExerciseConfig} config
 * @returns {Object.<string, number>}
 */
export function computeSkillDeltas(metrics, config) {
  const skills = {};

  // Only compute for dimensions the exercise claims to train
  const trainedSkills = config.skills ?? [];

  // pitchAccuracy: derived from cents-avg (lower is better)
  // 0 cents = 1.0, 50+ cents = 0.0
  if (trainedSkills.includes('pitchAccuracy') && metrics['cents-avg'] != null) {
    skills.pitchAccuracy = Math.max(0, Math.min(1, 1 - metrics['cents-avg'] / 50));
  }

  // pitchStability: derived from cents-variance and hold-steady-ms
  // Low variance + high hold time = good stability
  if (trainedSkills.includes('pitchStability')) {
    let stability = 0;
    let count = 0;

    if (metrics['cents-variance'] != null) {
      // 0 variance = 1.0, 500+ variance = 0.0
      stability += Math.max(0, Math.min(1, 1 - metrics['cents-variance'] / 500));
      count++;
    }
    if (metrics['hold-steady-ms'] != null) {
      // 5000ms+ steady = 1.0, 0ms = 0.0
      stability += Math.max(0, Math.min(1, metrics['hold-steady-ms'] / 5000));
      count++;
    }

    if (count > 0) skills.pitchStability = stability / count;
  }

  // scaleFluency: derived from notes-hit-pct and time-per-note-avg
  // High accuracy + fast transitions = good fluency
  if (trainedSkills.includes('scaleFluency')) {
    let fluency = 0;
    let count = 0;

    if (metrics['notes-hit-pct'] != null) {
      fluency += metrics['notes-hit-pct'] / 100;
      count++;
    }
    if (metrics['time-per-note-avg'] != null) {
      // 500ms or less per note = 1.0, 5000ms+ = 0.0
      fluency += Math.max(0, Math.min(1, 1 - (metrics['time-per-note-avg'] - 500) / 4500));
      count++;
    }

    if (count > 0) skills.scaleFluency = fluency / count;
  }

  // reactionSpeed: derived from reaction-ms
  // 200ms = 1.0, 5000ms+ = 0.0
  if (trainedSkills.includes('reactionSpeed') && metrics['reaction-ms'] != null) {
    skills.reactionSpeed = Math.max(0, Math.min(1, 1 - (metrics['reaction-ms'] - 200) / 4800));
  }

  // earTraining: will be computed by phrase-match and interval-accuracy evaluators
  // Placeholder — return raw metric if present
  if (trainedSkills.includes('earTraining') && metrics['phrase-accuracy'] != null) {
    skills.earTraining = metrics['phrase-accuracy'] / 100;
  }

  // range: derived from range-low and range-high
  // 4 octaves (48 semitones) = 1.0, 0 = 0.0
  if (trainedSkills.includes('range') && metrics['range-low'] != null && metrics['range-high'] != null) {
    const span = metrics['range-high'] - metrics['range-low'];
    skills.range = Math.max(0, Math.min(1, span / 48));
  }

  return skills;
}
