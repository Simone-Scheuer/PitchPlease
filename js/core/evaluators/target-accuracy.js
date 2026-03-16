/**
 * target-accuracy.js — Evaluator for note-matching exercises.
 *
 * Scores player pitch against target notes using a generous accuracy
 * curve ported from song-engine.js.  Supports two timing modes:
 *
 *   - player-driven: tracks consecutive in-tune time, signals advance
 *     when the player sustains the target for holdMs
 *   - fixed-tempo: accumulates accuracy data, never signals advance
 *     (the runtime advances on timer)
 *
 * Pure logic module — no DOM, no audio, no event bus.
 */

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_TOLERANCE = 40;   // cents — "medium" difficulty
const DEFAULT_HOLD_MS = 300;    // ms of sustained in-tune before advance
const ACCURACY_WEIGHT = 0.7;
const HOLD_WEIGHT = 0.3;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TargetAccuracyConfig
 * @property {number}  [tolerance=40]     - Cents tolerance for "in tune"
 * @property {number}  [holdMs=300]       - Sustain time for player-driven advance
 * @property {boolean} [playerDriven=true] - Whether evaluator signals note advance
 */

/**
 * @typedef {Object} NoteResult
 * @property {string}  note       - Note name (e.g. "C4")
 * @property {number}  midi       - Target MIDI
 * @property {number}  score      - 0-100
 * @property {number}  avgCents   - Average absolute cents deviation
 * @property {number}  bestCents  - Best (lowest) absolute cents deviation
 * @property {number}  holdPct    - Percentage of frames in tune (0-100)
 * @property {number}  totalFrames
 * @property {number}  inTuneFrames
 * @property {number}  timeToHitMs - Time from note start to first in-tune frame (player-driven)
 * @property {number}  holdTimeMs  - Total time spent in-tune
 */

/**
 * Create a target-accuracy evaluator instance.
 *
 * @param {TargetAccuracyConfig} [config]
 * @returns {{
 *   onPitch: (pitchData: Object, targetNote: Object) => { inTune: boolean, close: boolean, absCents: number, advance: boolean },
 *   onSilence: () => void,
 *   advanceNote: () => NoteResult|null,
 *   getScore: () => number,
 *   getNoteScores: () => NoteResult[],
 *   getMeasurements: () => Object,
 *   reset: () => void,
 * }}
 */
export function createTargetAccuracyEvaluator(config = {}) {
  const tolerance = config.tolerance ?? DEFAULT_TOLERANCE;
  const holdMs = config.holdMs ?? DEFAULT_HOLD_MS;
  const playerDriven = config.playerDriven !== false;

  // --- Per-note accumulators (current note) ---
  let totalFrames = 0;
  let inTuneFrames = 0;
  let centsSum = 0;
  let centsCount = 0;
  let bestCents = Infinity;
  let noteStartTime = 0;        // timestamp when note became active
  let firstHitTime = null;       // timestamp of first in-tune frame
  let holdStartTime = null;      // timestamp of consecutive in-tune streak start
  let totalHoldTimeMs = 0;       // accumulated in-tune time

  // --- Completed notes ---
  let completedNotes = [];
  let currentTarget = null;

  // --- Helpers ---

  function computeNoteScore() {
    if (totalFrames === 0) return { score: 0, avgCents: 0, bestCents: 0, holdPct: 0 };

    const holdPct = inTuneFrames / totalFrames;
    const avgCents = centsCount > 0 ? centsSum / centsCount : tolerance * 2;

    // Generous sqrt curve — being close counts for a lot
    const rawAccuracy = Math.max(0, 1 - avgCents / (tolerance * 1.5));
    const accuracy = Math.sqrt(rawAccuracy);

    // 70/30 accuracy/hold blend
    const score = Math.round((accuracy * ACCURACY_WEIGHT + holdPct * HOLD_WEIGHT) * 100);

    return {
      score: Math.min(100, Math.max(0, score)),
      avgCents: Math.round(avgCents),
      bestCents: bestCents === Infinity ? 0 : Math.round(bestCents),
      holdPct: Math.round(holdPct * 100),
    };
  }

  function finalizeCurrentNote() {
    if (!currentTarget) return null;

    const computed = computeNoteScore();
    const timeToHitMs = firstHitTime != null
      ? Math.round(firstHitTime - noteStartTime)
      : -1;  // -1 = never hit

    const result = {
      note: currentTarget.note,
      midi: currentTarget.midi,
      score: computed.score,
      avgCents: computed.avgCents,
      bestCents: computed.bestCents,
      holdPct: computed.holdPct,
      totalFrames,
      inTuneFrames,
      timeToHitMs,
      holdTimeMs: Math.round(totalHoldTimeMs),
    };

    completedNotes.push(result);
    resetCurrentNote();
    return result;
  }

  function resetCurrentNote() {
    totalFrames = 0;
    inTuneFrames = 0;
    centsSum = 0;
    centsCount = 0;
    bestCents = Infinity;
    noteStartTime = performance.now();
    firstHitTime = null;
    holdStartTime = null;
    totalHoldTimeMs = 0;
    currentTarget = null;
  }

  // --- Public interface ---

  return {
    /**
     * Process a pitch frame against the current target note.
     *
     * @param {Object} pitchData - From pitch event: { midi, cents, note, octave, ... }
     * @param {Object} targetNote - NoteSpec: { note, midi }
     * @returns {{ inTune: boolean, close: boolean, absCents: number, advance: boolean }}
     */
    onPitch(pitchData, targetNote) {
      if (!targetNote) return { inTune: false, close: false, absCents: 0, advance: false };

      // Track target changes
      if (!currentTarget || currentTarget.midi !== targetNote.midi) {
        if (currentTarget) finalizeCurrentNote();
        currentTarget = targetNote;
        noteStartTime = performance.now();
      }

      const now = performance.now();

      // Compute cents distance from target
      // pitchData.midi is fractional (e.g., 60.15), targetNote.midi is integer
      const exactCents = (pitchData.midi - targetNote.midi) * 100 + (pitchData.cents || 0);
      const absCents = Math.abs(exactCents);

      // Update accumulators
      totalFrames++;
      centsSum += absCents;
      centsCount++;
      bestCents = Math.min(bestCents, absCents);

      const inTune = absCents <= tolerance;
      const close = absCents <= tolerance * 2;

      if (inTune) {
        inTuneFrames++;

        if (firstHitTime == null) firstHitTime = now;

        // Track consecutive in-tune streak
        if (holdStartTime == null) {
          holdStartTime = now;
        }
        totalHoldTimeMs = now - holdStartTime;
      } else {
        // Streak broken — accumulate what we had
        if (holdStartTime != null) {
          holdStartTime = null;
        }
      }

      // Player-driven advance: sustained in-tune for holdMs
      let advance = false;
      if (playerDriven && inTune && holdStartTime != null) {
        const streakMs = now - holdStartTime;
        if (streakMs >= holdMs) {
          advance = true;
        }
      }

      return { inTune, close, absCents: Math.round(absCents), advance };
    },

    /**
     * Handle silence frame. Silence does NOT penalize — only pitch frames count.
     * This preserves the generous scoring philosophy: breath pauses are fine.
     */
    onSilence() {
      // Break the hold streak — silence means the player stopped
      if (holdStartTime != null) {
        holdStartTime = null;
      }
    },

    /**
     * Manually advance to the next note. Finalizes and returns the
     * score for the current note.
     * @returns {NoteResult|null}
     */
    advanceNote() {
      return finalizeCurrentNote();
    },

    /**
     * Overall score: average of all completed note scores.
     * @returns {number} 0-100
     */
    getScore() {
      if (completedNotes.length === 0) return 0;
      const sum = completedNotes.reduce((acc, n) => acc + n.score, 0);
      return Math.round(sum / completedNotes.length);
    },

    /**
     * Per-note score results for all completed notes.
     * @returns {NoteResult[]}
     */
    getNoteScores() {
      return [...completedNotes];
    },

    /**
     * Standardized measurement output for the profile/history system.
     * @returns {Object}
     */
    getMeasurements() {
      const scores = completedNotes;
      const notesHit = scores.filter(n => n.score > 0).length;

      return {
        'cents-avg': scores.length > 0
          ? Math.round(scores.reduce((s, n) => s + n.avgCents, 0) / scores.length)
          : 0,
        'notes-hit-pct': scores.length > 0
          ? Math.round((notesHit / scores.length) * 100)
          : 0,
        'time-to-hit-ms': scores.length > 0
          ? Math.round(
              scores
                .filter(n => n.timeToHitMs >= 0)
                .reduce((s, n) => s + n.timeToHitMs, 0)
              / Math.max(1, scores.filter(n => n.timeToHitMs >= 0).length)
            )
          : 0,
        perNote: scores,
      };
    },

    /**
     * Clear all state. Call between exercises.
     */
    reset() {
      resetCurrentNote();
      completedNotes = [];
      currentTarget = null;
    },
  };
}
