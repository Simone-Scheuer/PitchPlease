/**
 * stability.js — Evaluator for sustained pitch exercises.
 *
 * Measures how steadily a player holds a note over time. Tracks cents
 * deviation in a circular buffer, computes running statistics, and
 * reports "steady streak" (consecutive time within the generous
 * +/-15 cent threshold).
 *
 * Designed for: long tones, drone match, centering microscope.
 *
 * Generous by design:
 *   - "inTune" = within +/-5 cents
 *   - "close"  = within +/-15 cents (counts toward streaks and scoring)
 *   - "locked" = inTune continuously for >500ms
 *
 * Pure logic module — no DOM, no audio, no event bus.
 */

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const IN_TUNE_CENTS = 5;          // within this = green / "in tune"
const CLOSE_CENTS = 15;           // within this = yellow / "close" (generous)
const LOCKED_MS = 500;            // sustained inTune for this long = "locked"
const BUFFER_SIZE = 600;          // ~10 seconds at 60fps

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} StabilityConfig
 * @property {number} [inTuneCents=5]   - Cents threshold for "in tune"
 * @property {number} [closeCents=15]   - Cents threshold for "close" (generous)
 * @property {number} [lockedMs=500]    - Ms of continuous inTune to be "locked"
 * @property {number} [bufferSize=600]  - Circular buffer capacity
 */

/**
 * @typedef {Object} PerNoteStats
 * @property {string|null}  note          - Note name or null if auto-detected
 * @property {number}       midi          - Target MIDI
 * @property {number}       avgDeviation  - Average absolute cents
 * @property {number}       maxSteadyMs   - Longest steady streak for this note
 * @property {number}       timeLockedPct - Percent of frames in tune (<= inTuneCents)
 * @property {number}       timeClosePct  - Percent of frames close (<= closeCents)
 * @property {number}       totalFrames
 * @property {string}       driftDirection - 'sharp' | 'flat' | 'centered'
 */

/**
 * Create a stability evaluator instance.
 *
 * @param {StabilityConfig} [config]
 * @returns {{
 *   onPitch:          (pitchData: Object, targetNote: Object|null) => { inTune: boolean, close: boolean, absCents: number, locked: boolean, steadyStreakMs: number },
 *   onSilence:        () => void,
 *   advanceNote:      () => PerNoteStats|null,
 *   getMeasurements:  () => Object,
 *   getScore:         () => number,
 *   reset:            () => void,
 * }}
 */
export function createStabilityEvaluator(config = {}) {
  const inTuneCents = config.inTuneCents ?? IN_TUNE_CENTS;
  const closeCents = config.closeCents ?? CLOSE_CENTS;
  const lockedMs = config.lockedMs ?? LOCKED_MS;
  const bufferSize = config.bufferSize ?? BUFFER_SIZE;

  // --- Circular buffer ---
  // Entries: { cents: number, timestamp: number } | null (silence gap)
  let buffer = [];
  let bufferWriteIndex = 0;

  // --- Per-note accumulators (current note) ---
  let currentTarget = null;
  let totalFrames = 0;
  let inTuneFrames = 0;        // |cents| <= inTuneCents
  let closeFrames = 0;         // |cents| <= closeCents
  let centsSum = 0;            // sum of absolute cents (for average)
  let signedCentsSum = 0;      // sum of signed cents (for drift direction)

  // --- Streak tracking ---
  // "Steady streak" uses the GENEROUS threshold (closeCents = 15)
  let steadyStreakStartTime = 0;
  let steadyStreakActive = false;
  let currentSteadyStreakMs = 0;
  let maxSteadyStreakMs = 0;

  // "In-tune streak" uses the tight threshold (inTuneCents = 5)
  let inTuneStreakStartTime = 0;
  let inTuneStreakActive = false;
  let currentInTuneStreakMs = 0;

  // --- Completed notes ---
  let completedNotes = [];

  // --- Session-wide stats ---
  let sessionMaxSteadyStreakMs = 0;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Push an entry into the circular buffer.
   */
  function pushToBuffer(entry) {
    if (buffer.length < bufferSize) {
      buffer.push(entry);
    } else {
      buffer[bufferWriteIndex % bufferSize] = entry;
    }
    bufferWriteIndex++;
  }

  /**
   * Compute cents deviation from pitch data and target note.
   * Returns signed cents (positive = sharp, negative = flat).
   */
  function computeCents(pitchData, target) {
    if (!pitchData || !target || typeof pitchData.midi !== 'number' || target.midi == null) {
      return null;
    }
    return (pitchData.midi - target.midi) * 100 + (pitchData.cents || 0);
  }

  /**
   * Determine drift direction from signed cents sum.
   */
  function driftDirection(signedSum, count) {
    if (count === 0) return 'centered';
    const avg = signedSum / count;
    if (avg > 2) return 'sharp';
    if (avg < -2) return 'flat';
    return 'centered';
  }

  /**
   * Finalize current note and return per-note stats.
   */
  function finalizeCurrentNote() {
    if (!currentTarget && totalFrames === 0) return null;

    // End any active streaks
    const now = performance.now();
    if (steadyStreakActive) {
      currentSteadyStreakMs = now - steadyStreakStartTime;
      maxSteadyStreakMs = Math.max(maxSteadyStreakMs, currentSteadyStreakMs);
    }

    const avgDeviation = totalFrames > 0
      ? Math.round((centsSum / totalFrames) * 10) / 10
      : 0;

    const timeLockedPct = totalFrames > 0
      ? Math.round((inTuneFrames / totalFrames) * 100)
      : 0;

    const timeClosePct = totalFrames > 0
      ? Math.round((closeFrames / totalFrames) * 100)
      : 0;

    const drift = driftDirection(signedCentsSum, totalFrames);

    const result = {
      note: currentTarget?.note ?? null,
      midi: currentTarget?.midi ?? 0,
      avgDeviation,
      maxSteadyMs: Math.round(maxSteadyStreakMs),
      timeLockedPct,
      timeClosePct,
      totalFrames,
      driftDirection: drift,
    };

    // Track session-wide max
    sessionMaxSteadyStreakMs = Math.max(sessionMaxSteadyStreakMs, maxSteadyStreakMs);

    completedNotes.push(result);
    resetCurrentNote();
    return result;
  }

  /**
   * Reset per-note accumulators for the next note.
   */
  function resetCurrentNote() {
    currentTarget = null;
    totalFrames = 0;
    inTuneFrames = 0;
    closeFrames = 0;
    centsSum = 0;
    signedCentsSum = 0;

    steadyStreakStartTime = 0;
    steadyStreakActive = false;
    currentSteadyStreakMs = 0;
    maxSteadyStreakMs = 0;

    inTuneStreakStartTime = 0;
    inTuneStreakActive = false;
    currentInTuneStreakMs = 0;
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Process an incoming pitch frame against the target note.
     *
     * @param {Object} pitchData - From pitch event: { midi, cents, note, octave, ... }
     * @param {Object|null} targetNote - NoteSpec: { note, midi } or null
     * @returns {{ inTune: boolean, close: boolean, absCents: number, locked: boolean, steadyStreakMs: number }}
     */
    onPitch(pitchData, targetNote) {
      // When no target is provided, return neutral results
      // (the seismograph renderer handles auto-detection itself)
      if (!targetNote) {
        return {
          inTune: false,
          close: false,
          absCents: 0,
          locked: false,
          steadyStreakMs: 0,
        };
      }

      const now = performance.now();

      // Track target changes
      if (!currentTarget || currentTarget.midi !== targetNote.midi) {
        if (currentTarget && totalFrames > 0) {
          finalizeCurrentNote();
        }
        currentTarget = targetNote;
      }

      // Compute cents deviation
      const signedCents = computeCents(pitchData, targetNote);
      if (signedCents === null) {
        return {
          inTune: false,
          close: false,
          absCents: 0,
          locked: false,
          steadyStreakMs: currentSteadyStreakMs,
        };
      }

      const absCents = Math.abs(signedCents);

      // Push to circular buffer
      pushToBuffer({ cents: signedCents, timestamp: now });

      // Update frame counters
      totalFrames++;
      centsSum += absCents;
      signedCentsSum += signedCents;

      const inTune = absCents <= inTuneCents;
      const close = absCents <= closeCents;

      if (inTune) inTuneFrames++;
      if (close) closeFrames++;

      // --- Steady streak (generous: closeCents threshold) ---
      if (close) {
        if (!steadyStreakActive) {
          steadyStreakActive = true;
          steadyStreakStartTime = now;
        }
        currentSteadyStreakMs = now - steadyStreakStartTime;
        maxSteadyStreakMs = Math.max(maxSteadyStreakMs, currentSteadyStreakMs);
      } else {
        // Break steady streak
        steadyStreakActive = false;
        currentSteadyStreakMs = 0;
      }

      // --- In-tune streak (tight: inTuneCents threshold) ---
      if (inTune) {
        if (!inTuneStreakActive) {
          inTuneStreakActive = true;
          inTuneStreakStartTime = now;
        }
        currentInTuneStreakMs = now - inTuneStreakStartTime;
      } else {
        inTuneStreakActive = false;
        currentInTuneStreakMs = 0;
      }

      // "Locked" = in tune continuously for >= lockedMs
      const locked = inTuneStreakActive && currentInTuneStreakMs >= lockedMs;

      return {
        inTune,
        close,
        absCents: Math.round(absCents),
        locked,
        steadyStreakMs: Math.round(currentSteadyStreakMs),
      };
    },

    /**
     * Handle silence frame. Resets current streaks.
     * Silence is not penalized in frame counts (generous philosophy).
     */
    onSilence() {
      const now = performance.now();

      // Record the ended streaks before resetting
      if (steadyStreakActive) {
        currentSteadyStreakMs = now - steadyStreakStartTime;
        maxSteadyStreakMs = Math.max(maxSteadyStreakMs, currentSteadyStreakMs);
      }

      // Push null to buffer for silence gap
      pushToBuffer(null);

      // Break all streaks
      steadyStreakActive = false;
      currentSteadyStreakMs = 0;

      inTuneStreakActive = false;
      currentInTuneStreakMs = 0;
    },

    /**
     * Finalize the current note, return per-note stats, and reset
     * accumulators for the next note.
     *
     * @returns {PerNoteStats|null}
     */
    advanceNote() {
      return finalizeCurrentNote();
    },

    /**
     * Return aggregate stats across the session.
     *
     * @returns {{
     *   avgDeviation: number,
     *   maxSteadyStreakMs: number,
     *   timeLockedPct: number,
     *   timeClosePct: number,
     *   driftDirection: string,
     *   perNote: PerNoteStats[],
     * }}
     */
    getMeasurements() {
      // Include current (unfinalized) note in aggregation
      const allNotes = [...completedNotes];

      // If there is an in-progress note, include its stats too
      if (currentTarget && totalFrames > 0) {
        const now = performance.now();
        let currentMaxSteady = maxSteadyStreakMs;
        if (steadyStreakActive) {
          currentMaxSteady = Math.max(currentMaxSteady, now - steadyStreakStartTime);
        }

        allNotes.push({
          note: currentTarget?.note ?? null,
          midi: currentTarget?.midi ?? 0,
          avgDeviation: totalFrames > 0
            ? Math.round((centsSum / totalFrames) * 10) / 10
            : 0,
          maxSteadyMs: Math.round(currentMaxSteady),
          timeLockedPct: totalFrames > 0
            ? Math.round((inTuneFrames / totalFrames) * 100)
            : 0,
          timeClosePct: totalFrames > 0
            ? Math.round((closeFrames / totalFrames) * 100)
            : 0,
          totalFrames,
          driftDirection: driftDirection(signedCentsSum, totalFrames),
        });
      }

      if (allNotes.length === 0) {
        return {
          avgDeviation: 0,
          maxSteadyStreakMs: 0,
          timeLockedPct: 0,
          timeClosePct: 0,
          driftDirection: 'centered',
          perNote: [],
        };
      }

      // Aggregate across all notes
      const totalAllFrames = allNotes.reduce((s, n) => s + n.totalFrames, 0);
      const weightedDeviation = totalAllFrames > 0
        ? allNotes.reduce((s, n) => s + n.avgDeviation * n.totalFrames, 0) / totalAllFrames
        : 0;

      const weightedLockedPct = totalAllFrames > 0
        ? allNotes.reduce((s, n) => s + n.timeLockedPct * n.totalFrames, 0) / totalAllFrames
        : 0;

      const weightedClosePct = totalAllFrames > 0
        ? allNotes.reduce((s, n) => s + n.timeClosePct * n.totalFrames, 0) / totalAllFrames
        : 0;

      // Session-wide max steady streak
      const overallMaxSteady = Math.max(
        sessionMaxSteadyStreakMs,
        ...allNotes.map(n => n.maxSteadyMs),
      );

      // Overall drift direction (aggregate signed cents)
      const sharpCount = allNotes.filter(n => n.driftDirection === 'sharp').length;
      const flatCount = allNotes.filter(n => n.driftDirection === 'flat').length;
      let overallDrift = 'centered';
      if (sharpCount > flatCount && sharpCount > allNotes.length * 0.4) {
        overallDrift = 'sharp';
      } else if (flatCount > sharpCount && flatCount > allNotes.length * 0.4) {
        overallDrift = 'flat';
      }

      return {
        avgDeviation: Math.round(weightedDeviation * 10) / 10,
        maxSteadyStreakMs: Math.round(overallMaxSteady),
        timeLockedPct: Math.round(weightedLockedPct),
        timeClosePct: Math.round(weightedClosePct),
        driftDirection: overallDrift,
        perNote: allNotes,
      };
    },

    /**
     * Score 0-100 based on timeClosePct and avgDeviation.
     * Generous: heavily weighted toward "close" percentage, with a bonus
     * for tighter accuracy.
     *
     * @returns {number} 0-100
     */
    getScore() {
      const m = this.getMeasurements();
      if (m.perNote.length === 0) return 0;

      // Primary score: percentage of time within the generous close threshold
      // This makes up 70% of the score
      const closeScore = m.timeClosePct / 100;

      // Bonus: tighter accuracy reduces deviation penalty
      // avgDeviation of 0 = perfect, avgDeviation >= 30 = no bonus
      const deviationBonus = Math.max(0, 1 - m.avgDeviation / 30);

      // Combine: 70% close, 30% accuracy bonus
      const raw = closeScore * 0.7 + deviationBonus * 0.3;

      // Apply sqrt curve for generosity (being close counts for a lot)
      const score = Math.sqrt(raw) * 100;

      return Math.min(100, Math.max(0, Math.round(score)));
    },

    /**
     * Clear all state. Call between exercises.
     */
    reset() {
      buffer = [];
      bufferWriteIndex = 0;

      resetCurrentNote();

      completedNotes = [];
      sessionMaxSteadyStreakMs = 0;
    },
  };
}
