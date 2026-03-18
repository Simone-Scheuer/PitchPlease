/**
 * bend-accuracy.js — Evaluator for microtonal bend exercises.
 *
 * Evaluates accuracy to fractional MIDI targets (e.g., midi 58.5 for a
 * half-step bend on harmonica). Tracks time-at-target, time-to-reach,
 * and per-target statistics. Uses a generous ±10 cents threshold for
 * "in tune" and requires 300ms sustained lock.
 *
 * Designed for: harmonica bend trainer, microtonal exercises, pitch
 * bending practice on any instrument.
 *
 * Pure logic module — no DOM, no audio, no event bus.
 */

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_IN_TUNE_CENTS = 10;    // ±10 cents = "in tune" for bends
const DEFAULT_CLOSE_CENTS = 25;      // ±25 cents = "close"
const DEFAULT_LOCK_MS = 300;         // ms of sustained in-tune to be "locked"
const MAX_JUMP_SEMITONES = 5;        // reject pitch spikes larger than this

// Scoring weights
const ACCURACY_WEIGHT = 0.5;
const LOCK_WEIGHT = 0.3;
const REACH_WEIGHT = 0.2;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BendAccuracyConfig
 * @property {number}  [inTuneCents=10]  - Cents threshold for "in tune"
 * @property {number}  [closeCents=25]   - Cents threshold for "close"
 * @property {number}  [lockMs=300]      - Sustained in-tune time for "locked"
 * @property {number}  [holdMs=2000]     - Sustained in-tune time to signal advance
 * @property {boolean} [playerDriven=true] - Whether evaluator signals note advance
 */

/**
 * @typedef {Object} BendTargetResult
 * @property {string|null} note       - Note name (e.g., "Bb3") or label
 * @property {number}      midi       - Target fractional MIDI
 * @property {number}      avgCents   - Average absolute cents deviation
 * @property {number}      bestCents  - Best (lowest) absolute cents deviation
 * @property {boolean}     locked     - Whether the player achieved lock
 * @property {number}      holdMs     - Total time within ±inTuneCents
 * @property {number}      timeToReachMs - Time from note start to first in-tune (-1 = never)
 * @property {number}      totalFrames
 * @property {number}      inTuneFrames
 */

/**
 * Create a bend-accuracy evaluator instance.
 *
 * @param {BendAccuracyConfig} [config]
 * @returns {{
 *   onPitch:         (pitchData: Object, targetNote: Object) => { inTune: boolean, close: boolean, absCents: number, locked: boolean, holdMs: number, timeToReachMs: number, advance: boolean },
 *   onSilence:       () => void,
 *   advanceNote:     () => BendTargetResult|null,
 *   getMeasurements: () => Object,
 *   getScore:        () => number,
 *   reset:           () => void,
 * }}
 */
export function createBendAccuracyEvaluator(config = {}) {
  const inTuneCents = config.inTuneCents ?? DEFAULT_IN_TUNE_CENTS;
  const closeCents = config.closeCents ?? DEFAULT_CLOSE_CENTS;
  const lockMs = config.lockMs ?? DEFAULT_LOCK_MS;
  const holdMsThreshold = config.holdMs ?? 2000;  // ms in-zone to signal advance
  const playerDriven = config.playerDriven !== false; // default true

  // --- Per-target accumulators (current target) ---
  let totalFrames = 0;
  let inTuneFrames = 0;
  let centsSum = 0;
  let bestCents = Infinity;
  let targetStartTime = 0;       // when this target became active
  let firstHitTime = null;        // first time within inTuneCents
  let holdStreakStart = null;     // start of current in-tune streak
  let totalHoldMs = 0;           // accumulated in-tune time
  let hasLocked = false;         // achieved lock for current target
  let currentLockMs = 0;         // current continuous in-tune streak ms

  // --- Jump filter ---
  let lastPlayerMidi = null;
  let lastResult = { inTune: false, close: false, absCents: 0, locked: false, holdMs: 0, timeToReachMs: -1, advance: false };

  // --- Completed targets ---
  let completedTargets = [];
  let skippedIndices = new Set();
  let currentTarget = null;

  // --- Helpers ---

  function resetCurrentTarget() {
    totalFrames = 0;
    inTuneFrames = 0;
    centsSum = 0;
    bestCents = Infinity;
    targetStartTime = performance.now();
    firstHitTime = null;
    holdStreakStart = null;
    totalHoldMs = 0;
    hasLocked = false;
    currentLockMs = 0;
    currentTarget = null;
    lastPlayerMidi = null;
  }

  function finalizeCurrentTarget() {
    if (!currentTarget && totalFrames === 0) return null;

    const avgCents = totalFrames > 0
      ? Math.round((centsSum / totalFrames) * 10) / 10
      : 0;

    const timeToReachMs = firstHitTime != null
      ? Math.round(firstHitTime - targetStartTime)
      : -1;

    // Flush any active hold streak
    if (holdStreakStart != null) {
      totalHoldMs += performance.now() - holdStreakStart;
    }

    const result = {
      note: currentTarget?.note ?? currentTarget?.label ?? null,
      midi: currentTarget?.midi ?? 0,
      avgCents,
      bestCents: bestCents === Infinity ? 0 : Math.round(bestCents * 10) / 10,
      locked: hasLocked,
      holdMs: Math.round(totalHoldMs),
      timeToReachMs,
      totalFrames,
      inTuneFrames,
    };

    completedTargets.push(result);
    resetCurrentTarget();
    return result;
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Process a pitch frame against the current bend target.
     *
     * targetNote.midi can be fractional (e.g., 58.5 for a half-step bend).
     * Cents distance is computed as: (playerMidi - targetMidi) * 100
     * where playerMidi = pitchData.midi + pitchData.cents/100 (fractional).
     *
     * @param {Object} pitchData  - { midi, cents, note, octave, ... }
     * @param {Object} targetNote - { note, midi (fractional), label? }
     * @returns {{ inTune: boolean, close: boolean, absCents: number, locked: boolean, holdMs: number, timeToReachMs: number, advance: boolean }}
     */
    onPitch(pitchData, targetNote) {
      if (!targetNote) {
        return { inTune: false, close: false, absCents: 0, locked: false, holdMs: 0, timeToReachMs: -1, advance: false };
      }

      const now = performance.now();

      // Track target changes — use a small epsilon for floating point comparison
      if (!currentTarget || Math.abs(currentTarget.midi - targetNote.midi) > 0.01) {
        if (currentTarget && totalFrames > 0) {
          finalizeCurrentTarget();
        }
        currentTarget = targetNote;
        targetStartTime = now;
      }

      // Compute precise cents distance
      // pitchData.midi is integer (nearest semitone), pitchData.cents is sub-semitone offset
      const playerMidi = pitchData.midi + (pitchData.cents || 0) / 100;

      // Reject pitch spikes — if the jump from last frame exceeds threshold,
      // treat as a detection glitch and return the previous result unchanged
      if (lastPlayerMidi != null && Math.abs(playerMidi - lastPlayerMidi) > MAX_JUMP_SEMITONES) {
        return lastResult;
      }
      lastPlayerMidi = playerMidi;

      const centsDistance = (playerMidi - targetNote.midi) * 100;
      const absCents = Math.abs(centsDistance);

      // Update accumulators
      totalFrames++;
      centsSum += absCents;
      bestCents = Math.min(bestCents, absCents);

      const inTune = absCents <= inTuneCents;
      const close = absCents <= closeCents;

      if (inTune) {
        inTuneFrames++;

        if (firstHitTime == null) firstHitTime = now;

        // Track continuous in-tune streak
        if (holdStreakStart == null) {
          holdStreakStart = now;
        }
        currentLockMs = now - holdStreakStart;

        // Check for lock
        if (currentLockMs >= lockMs) {
          hasLocked = true;
        }
      } else {
        // Streak broken — accumulate completed streak time
        if (holdStreakStart != null) {
          totalHoldMs += now - holdStreakStart;
          holdStreakStart = null;
        }
        currentLockMs = 0;
      }

      const timeToReachMs = firstHitTime != null
        ? Math.round(firstHitTime - targetStartTime)
        : -1;

      // Compute running hold ms including active streak
      let runningHoldMs = totalHoldMs;
      if (holdStreakStart != null) {
        runningHoldMs += now - holdStreakStart;
      }

      // Player-driven advance: signal when hold time exceeds threshold
      let advance = false;
      if (playerDriven && runningHoldMs >= holdMsThreshold) {
        advance = true;
      }

      lastResult = {
        inTune,
        close,
        absCents: Math.round(absCents * 10) / 10,
        locked: hasLocked,
        holdMs: Math.round(runningHoldMs),
        timeToReachMs,
        advance,
      };
      return lastResult;
    },

    /**
     * Handle silence frame. Breaks the current hold streak.
     * Silence is not penalized (generous philosophy).
     */
    onSilence() {
      if (holdStreakStart != null) {
        totalHoldMs += performance.now() - holdStreakStart;
        holdStreakStart = null;
      }
      currentLockMs = 0;
      lastPlayerMidi = null;  // reset jump filter — next pitch starts fresh
    },

    /**
     * Finalize the current target and return per-target stats.
     * @returns {BendTargetResult|null}
     */
    advanceNote() {
      return finalizeCurrentTarget();
    },

    /**
     * Aggregate measurements across all completed targets.
     * @returns {{ avgAccuracy: number, avgTimeToReach: number, avgHoldMs: number, targetsLocked: number, perNote: BendTargetResult[] }}
     */
    getMeasurements() {
      const targets = completedTargets.map((t, i) => ({
        ...t,
        skipped: skippedIndices.has(i),
      }));

      // Include in-progress target
      if (currentTarget && totalFrames > 0) {
        const avgCents = totalFrames > 0
          ? Math.round((centsSum / totalFrames) * 10) / 10
          : 0;
        const timeToReachMs = firstHitTime != null
          ? Math.round(firstHitTime - targetStartTime)
          : -1;

        let runningHoldMs = totalHoldMs;
        if (holdStreakStart != null) {
          runningHoldMs += performance.now() - holdStreakStart;
        }

        targets.push({
          note: currentTarget?.note ?? currentTarget?.label ?? null,
          midi: currentTarget?.midi ?? 0,
          avgCents,
          bestCents: bestCents === Infinity ? 0 : Math.round(bestCents * 10) / 10,
          locked: hasLocked,
          holdMs: Math.round(runningHoldMs),
          timeToReachMs,
          totalFrames,
          inTuneFrames,
          skipped: false,
        });
      }

      if (targets.length === 0) {
        return {
          avgAccuracy: 0,
          avgTimeToReach: 0,
          avgHoldMs: 0,
          targetsLocked: 0,
          'notes-skipped': 0,
          perNote: [],
        };
      }

      const played = targets.filter(t => !t.skipped);

      const avgAccuracy = played.length > 0
        ? Math.round(
            played.reduce((s, t) => s + t.avgCents, 0) / played.length * 10
          ) / 10
        : 0;

      const reachedTargets = played.filter(t => t.timeToReachMs >= 0);
      const avgTimeToReach = reachedTargets.length > 0
        ? Math.round(reachedTargets.reduce((s, t) => s + t.timeToReachMs, 0) / reachedTargets.length)
        : -1;

      const avgHoldMs = played.length > 0
        ? Math.round(
            played.reduce((s, t) => s + t.holdMs, 0) / played.length
          )
        : 0;

      const targetsLocked = played.filter(t => t.locked).length;

      return {
        avgAccuracy,
        avgTimeToReach,
        avgHoldMs,
        targetsLocked,
        'notes-skipped': skippedIndices.size,
        perNote: targets,
      };
    },

    /**
     * Mark a note index as skipped. Skipped notes are excluded from scoring.
     * @param {number} noteIndex
     */
    markSkipped(noteIndex) {
      skippedIndices.add(noteIndex);
    },

    /**
     * Score 0-100 based on locked targets, accuracy, and reach time.
     *
     * Generous sqrt curve applied to the raw score.
     *
     * @returns {number} 0-100
     */
    getScore() {
      const m = this.getMeasurements();
      const played = m.perNote.filter(n => !n.skipped);
      if (played.length === 0) return 0;

      // Lock percentage (0-1): how many targets did the player lock
      const playedLocked = played.filter(n => n.locked).length;
      const lockPct = playedLocked / played.length;

      // Accuracy score (0-1): lower cents = better, max 50 cents
      const accuracyRaw = Math.max(0, 1 - m.avgAccuracy / 50);

      // Reach speed bonus (0-1): faster = better, max 5000ms
      const reachRaw = m.avgTimeToReach >= 0
        ? Math.max(0, 1 - m.avgTimeToReach / 5000)
        : 0;

      // Weighted combination
      const raw = lockPct * LOCK_WEIGHT + accuracyRaw * ACCURACY_WEIGHT + reachRaw * REACH_WEIGHT;

      // Apply sqrt curve for generosity
      const score = Math.sqrt(raw) * 100;

      return Math.min(100, Math.max(0, Math.round(score)));
    },

    /**
     * Clear all state. Call between exercises.
     */
    reset() {
      resetCurrentTarget();
      completedTargets = [];
      skippedIndices = new Set();
      currentTarget = null;
    },
  };
}
