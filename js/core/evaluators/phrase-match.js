/**
 * phrase-match.js — Evaluator for echo/phrase-reproduction exercises.
 *
 * Manages the full listen → attempt → review cycle internally. The exercise
 * runtime feeds it pitch events as usual; this evaluator decides when to
 * play the phrase (via synth), when to record the player's attempt, and
 * when to show the comparison review.
 *
 * Note segmentation:
 *   - A new note is detected when pitch jumps >50 cents from the current
 *     detected note for >80ms continuously
 *   - A silence gap >150ms also segments notes
 *   - Each detected note is snapped to the nearest semitone
 *
 * Scoring:
 *   - Per-note accuracy: cents distance from the target note at that position
 *   - Sequence accuracy: correct notes in the correct order
 *   - Lenient matching: extra notes and brief hesitations are forgiven
 *
 * Pure logic module — no DOM. Uses synth for phrase playback.
 */

import { playPhrase as playSynthPhrase } from '../../audio/synth.js';
import { NOTE_NAMES } from '../../utils/constants.js';
import { formatNote } from '../../audio/note-math.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEGMENTATION_CENTS_THRESHOLD = 50;   // cents jump to trigger new note
const SEGMENTATION_TIME_MS = 80;           // ms of sustained jump before new note
const SILENCE_GAP_MS = 150;                // silence gap to segment notes
const DEFAULT_ATTEMPT_MULTIPLIER = 1.8;    // attempt time = phrase duration * this
const REVIEW_DURATION_MS = 3500;           // how long to show review overlay
const LISTEN_PRE_DELAY_MS = 500;           // brief pause before phrase plays

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

const PHASES = Object.freeze({
  IDLE: 'idle',
  LISTEN: 'listen',
  ATTEMPT: 'attempt',
  REVIEW: 'review',
  COMPLETE: 'complete',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function midiToNoteStr(midi) {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return formatNote(NOTE_NAMES[noteIndex], octave);
}

/**
 * Snap a fractional MIDI value to the nearest integer semitone.
 */
function snapToSemitone(midiFloat) {
  return Math.round(midiFloat);
}

/**
 * Compute the total duration of a phrase in ms (notes + gaps).
 */
function phraseDurationMs(phraseNotes) {
  let total = 0;
  for (const n of phraseNotes) {
    total += n.durationMs + (n.gapMs ?? 50);
  }
  return total;
}

/**
 * Compare a detected note sequence against a target phrase.
 * Returns per-note accuracy and overall match metrics.
 *
 * Lenient matching strategy:
 *   - Walk through target notes in order
 *   - For each target note, find the first matching detected note
 *     (within ±1 semitone) that hasn't been matched yet
 *   - Allow skipping extra detected notes (non-penalizing)
 *   - Track cents distance for each matched pair
 */
function compareSequences(targetNotes, detectedNotes) {
  const results = [];
  let detectedIdx = 0;

  for (const target of targetNotes) {
    let bestMatch = null;
    let bestCents = Infinity;
    let bestDetectedIdx = -1;

    // Search forward through unmatched detected notes for a match
    // Allow a window of up to 3 extra notes ahead
    const searchEnd = Math.min(detectedIdx + 4, detectedNotes.length);
    for (let i = detectedIdx; i < searchEnd; i++) {
      const detected = detectedNotes[i];
      const semitoneDist = Math.abs(detected.midi - target.midi);
      if (semitoneDist <= 1) {
        const centsDist = Math.abs((detected.midi - target.midi) * 100 + (detected.avgCentsOffset || 0));
        if (centsDist < bestCents) {
          bestCents = centsDist;
          bestMatch = detected;
          bestDetectedIdx = i;
        }
      }
    }

    if (bestMatch) {
      results.push({
        targetMidi: target.midi,
        targetNote: midiToNoteStr(target.midi),
        detectedMidi: bestMatch.midi,
        detectedNote: midiToNoteStr(bestMatch.midi),
        centsOff: bestCents,
        matched: true,
      });
      detectedIdx = bestDetectedIdx + 1;
    } else {
      results.push({
        targetMidi: target.midi,
        targetNote: midiToNoteStr(target.midi),
        detectedMidi: null,
        detectedNote: null,
        centsOff: null,
        matched: false,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a phrase-match evaluator for echo exercises.
 *
 * @param {Object} config
 * @param {Array<{ midi: number, durationMs: number, gapMs?: number }>} config.phrases
 *   Array of phrases to play. Each phrase is an array of note objects.
 *   For simplicity, the current implementation plays one phrase at a time.
 * @param {string}  [config.synthVoice='sine']   - Synth voice for playback
 * @param {number}  [config.synthGain=0.8]        - Synth gain
 * @param {number}  [config.attemptMultiplier]    - Multiplier for attempt time
 * @param {number}  [config.reviewDurationMs]     - How long to show review
 * @param {boolean} [config.showReview=true]      - Whether to show review phase
 * @returns {Object} Evaluator instance
 */
export function createPhraseMatchEvaluator(config = {}) {
  const phrases = config.phrases ?? config.audio?.phrases ?? [];
  const synthVoice = config.synthVoice ?? config.audio?.synthVoice ?? 'sine';
  const synthGain = config.synthGain ?? config.audio?.synthGain ?? 0.8;
  const attemptMultiplier = config.attemptMultiplier ?? DEFAULT_ATTEMPT_MULTIPLIER;
  const reviewDurationMs = config.reviewDurationMs ?? REVIEW_DURATION_MS;
  const showReview = config.showReview !== false;

  // --- Phase state ---
  let phase = PHASES.IDLE;
  let phraseIndex = 0;            // which phrase we're on
  let phaseStartTime = 0;         // when current phase started
  let attemptTimerMs = 0;         // how long the attempt phase lasts

  // --- Current phrase ---
  let currentPhrase = [];         // the phrase being played/matched

  // --- Note segmentation state (for player's attempt) ---
  let currentDetectedMidi = null; // currently detected semitone
  let currentDetectedStart = 0;   // when this detected note started
  let pitchJumpStart = 0;         // when a pitch jump was first detected
  let jumpTargetMidi = null;      // what the jump is toward
  let lastSilenceTime = 0;        // when silence last started
  let isSilent = false;

  // --- Accumulated cents for current detected note ---
  let centsAccumulator = [];

  // --- Detected notes for this attempt ---
  let detectedNotes = [];

  // --- Pitch trail for renderer (raw pitch readings during attempt) ---
  let pitchTrail = [];

  // --- Comparison results ---
  let comparisonResults = null;

  // --- All phrase results across the exercise ---
  let allPhraseResults = [];

  // ---------------------------------------------------------------------------
  // Phase management
  // ---------------------------------------------------------------------------

  function currentPhraseNotes() {
    if (phraseIndex < phrases.length) {
      return phrases[phraseIndex];
    }
    return [];
  }

  function startListenPhase() {
    phase = PHASES.LISTEN;
    phaseStartTime = performance.now();
    currentPhrase = currentPhraseNotes();
    detectedNotes = [];
    pitchTrail = [];
    comparisonResults = null;
    currentDetectedMidi = null;
    centsAccumulator = [];

    // Play the phrase via synth (with a brief delay)
    setTimeout(() => {
      if (phase === PHASES.LISTEN) {
        playSynthPhrase(currentPhrase, { voice: synthVoice, gain: synthGain })
          .then(() => {
            // After phrase finishes, transition to attempt
            if (phase === PHASES.LISTEN) {
              startAttemptPhase();
            }
          });
      }
    }, LISTEN_PRE_DELAY_MS);
  }

  function startAttemptPhase() {
    phase = PHASES.ATTEMPT;
    phaseStartTime = performance.now();
    detectedNotes = [];
    pitchTrail = [];
    currentDetectedMidi = null;
    centsAccumulator = [];
    pitchJumpStart = 0;
    jumpTargetMidi = null;
    lastSilenceTime = 0;
    isSilent = false;

    // Attempt time is generous: phrase duration * multiplier
    const pDuration = phraseDurationMs(currentPhrase);
    attemptTimerMs = pDuration * attemptMultiplier;
  }

  function startReviewPhase() {
    // Finalize any in-progress detected note
    finalizeCurrentDetectedNote();

    // Compare detected notes to target
    comparisonResults = compareSequences(currentPhrase, detectedNotes);

    // Store results
    allPhraseResults.push({
      phraseIndex,
      targetPhrase: currentPhrase,
      detectedNotes: [...detectedNotes],
      pitchTrail: [...pitchTrail],
      comparison: comparisonResults,
    });

    if (showReview) {
      phase = PHASES.REVIEW;
      phaseStartTime = performance.now();
    } else {
      // Skip review, go directly to next phrase or complete
      advancePhrase();
    }
  }

  function advancePhrase() {
    phraseIndex++;
    if (phraseIndex < phrases.length) {
      startListenPhase();
    } else {
      phase = PHASES.COMPLETE;
      phaseStartTime = performance.now();
    }
  }

  // ---------------------------------------------------------------------------
  // Note segmentation
  // ---------------------------------------------------------------------------

  function finalizeCurrentDetectedNote() {
    if (currentDetectedMidi === null) return;
    if (centsAccumulator.length === 0) return;

    const avgCents = centsAccumulator.reduce((s, c) => s + c, 0) / centsAccumulator.length;
    const durationMs = performance.now() - currentDetectedStart;

    detectedNotes.push({
      midi: currentDetectedMidi,
      note: midiToNoteStr(currentDetectedMidi),
      avgCentsOffset: avgCents,
      durationMs: Math.round(durationMs),
      timestamp: currentDetectedStart,
    });

    currentDetectedMidi = null;
    centsAccumulator = [];
  }

  function processSegmentation(pitchData) {
    const now = performance.now();
    const snappedMidi = snapToSemitone(pitchData.midi);
    const centsFromSnapped = (pitchData.midi - snappedMidi) * 100 + (pitchData.cents || 0);

    // Record raw pitch for trail
    pitchTrail.push({
      midi: pitchData.midi + (pitchData.cents || 0) / 100,
      timestamp: now,
    });

    // Reset silence tracking
    if (isSilent) {
      isSilent = false;
      const silenceGap = now - lastSilenceTime;
      if (silenceGap >= SILENCE_GAP_MS && currentDetectedMidi !== null) {
        // Silence gap segments the note
        finalizeCurrentDetectedNote();
      }
    }

    if (currentDetectedMidi === null) {
      // Start a new detected note
      currentDetectedMidi = snappedMidi;
      currentDetectedStart = now;
      centsAccumulator = [centsFromSnapped];
      pitchJumpStart = 0;
      jumpTargetMidi = null;
      return;
    }

    // Check if this pitch is far from the current detected note
    const centsDist = Math.abs((snappedMidi - currentDetectedMidi) * 100 + centsFromSnapped);
    if (centsDist > SEGMENTATION_CENTS_THRESHOLD) {
      // Pitch has jumped
      if (jumpTargetMidi === snappedMidi && pitchJumpStart > 0) {
        // Same jump target — check if sustained long enough
        if (now - pitchJumpStart >= SEGMENTATION_TIME_MS) {
          // Confirmed new note
          finalizeCurrentDetectedNote();
          currentDetectedMidi = snappedMidi;
          currentDetectedStart = pitchJumpStart;
          centsAccumulator = [centsFromSnapped];
          pitchJumpStart = 0;
          jumpTargetMidi = null;
        }
      } else {
        // New jump direction
        pitchJumpStart = now;
        jumpTargetMidi = snappedMidi;
      }
    } else {
      // Still on the same note
      centsAccumulator.push(centsFromSnapped);
      pitchJumpStart = 0;
      jumpTargetMidi = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Score computation
  // ---------------------------------------------------------------------------

  function computeScore() {
    if (allPhraseResults.length === 0) return 0;

    let totalScore = 0;
    for (const result of allPhraseResults) {
      if (!result.comparison || result.comparison.length === 0) continue;

      const matched = result.comparison.filter(r => r.matched);
      const matchPct = matched.length / result.comparison.length;

      // Cents accuracy for matched notes (generous sqrt curve)
      let centsScore = 1;
      if (matched.length > 0) {
        const avgCents = matched.reduce((s, r) => s + r.centsOff, 0) / matched.length;
        const raw = Math.max(0, 1 - avgCents / 100);
        centsScore = Math.sqrt(raw);
      }

      // Blend: 60% note matching, 40% cents accuracy
      const phraseScore = matchPct * 0.6 + centsScore * 0.4;
      totalScore += phraseScore;
    }

    return Math.round((totalScore / allPhraseResults.length) * 100);
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Process a pitch frame. During the attempt phase, this feeds note
     * segmentation. During other phases, it's a no-op.
     *
     * @param {Object} pitchData - { midi, cents, note, octave, ... }
     * @param {Object|null} targetNote - Ignored for phrase-match (we manage targets internally)
     * @returns {Object} State object for the renderer
     */
    onPitch(pitchData, targetNote) {
      const now = performance.now();

      // Check phase transitions based on timers
      if (phase === PHASES.ATTEMPT) {
        const attemptElapsed = now - phaseStartTime;
        if (attemptElapsed >= attemptTimerMs) {
          startReviewPhase();
        } else {
          processSegmentation(pitchData);
        }
      }

      if (phase === PHASES.REVIEW) {
        const reviewElapsed = now - phaseStartTime;
        if (reviewElapsed >= reviewDurationMs) {
          advancePhrase();
        }
      }

      return {
        phase,
        phraseIndex,
        phraseCount: phrases.length,
        currentPhrase,
        detectedNotes: [...detectedNotes],
        pitchTrail: [...pitchTrail],
        comparisonResults,
        phaseStartTime,
        attemptTimerMs,
        reviewDurationMs,
        advance: phase === PHASES.COMPLETE,
      };
    },

    /**
     * Handle silence. During attempt phase, track silence for note segmentation.
     */
    onSilence() {
      const now = performance.now();

      if (phase === PHASES.ATTEMPT) {
        if (!isSilent) {
          isSilent = true;
          lastSilenceTime = now;
        }

        // Check if silence has lasted long enough to segment
        if (isSilent && now - lastSilenceTime >= SILENCE_GAP_MS) {
          finalizeCurrentDetectedNote();
        }

        // Check attempt timer
        const attemptElapsed = now - phaseStartTime;
        if (attemptElapsed >= attemptTimerMs) {
          startReviewPhase();
        }
      }

      if (phase === PHASES.REVIEW) {
        const reviewElapsed = now - phaseStartTime;
        if (reviewElapsed >= reviewDurationMs) {
          advancePhrase();
        }
      }
    },

    /**
     * Advance to the next phrase (called by runtime for looping).
     * For phrase-match, this is handled internally.
     * @returns {null}
     */
    advanceNote() {
      return null;
    },

    /**
     * Get measurements for the profile/history system.
     * @returns {Object}
     */
    getMeasurements() {
      const allComparisons = allPhraseResults.flatMap(r => r.comparison ?? []);
      const matched = allComparisons.filter(c => c.matched);
      const total = allComparisons.length;

      const notesCorrectPct = total > 0
        ? Math.round((matched.length / total) * 100)
        : 0;

      const avgCentsPerNote = matched.length > 0
        ? Math.round(matched.reduce((s, c) => s + c.centsOff, 0) / matched.length)
        : 0;

      // Interval accuracy: compare intervals between consecutive matched notes
      let intervalsCorrect = 0;
      let intervalTotal = 0;
      for (const result of allPhraseResults) {
        const comp = result.comparison ?? [];
        for (let i = 1; i < comp.length; i++) {
          if (comp[i].matched && comp[i - 1].matched) {
            const targetInterval = comp[i].targetMidi - comp[i - 1].targetMidi;
            const detectedInterval = comp[i].detectedMidi - comp[i - 1].detectedMidi;
            intervalTotal++;
            if (targetInterval === detectedInterval) {
              intervalsCorrect++;
            }
          }
        }
      }

      const intervalsCorrectPct = intervalTotal > 0
        ? Math.round((intervalsCorrect / intervalTotal) * 100)
        : 0;

      return {
        'notes-correct-pct': notesCorrectPct,
        'avg-cents-per-note': avgCentsPerNote,
        'intervals-correct-pct': intervalsCorrectPct,
        'phrase-accuracy': computeScore(),
        phraseResults: allPhraseResults.map(r => ({
          phraseIndex: r.phraseIndex,
          comparison: r.comparison,
        })),
      };
    },

    /**
     * Overall score: 0-100.
     * @returns {number}
     */
    getScore() {
      return computeScore();
    },

    /**
     * Clear all state for restart.
     */
    reset() {
      phase = PHASES.IDLE;
      phraseIndex = 0;
      phaseStartTime = 0;
      attemptTimerMs = 0;
      currentPhrase = [];
      currentDetectedMidi = null;
      currentDetectedStart = 0;
      centsAccumulator = [];
      pitchJumpStart = 0;
      jumpTargetMidi = null;
      lastSilenceTime = 0;
      isSilent = false;
      detectedNotes = [];
      pitchTrail = [];
      comparisonResults = null;
      allPhraseResults = [];
    },

    /**
     * Start the evaluator — kicks off the listen/attempt/review cycle.
     * Called by the exercise runtime when the exercise begins.
     */
    start() {
      if (phrases.length === 0) {
        phase = PHASES.COMPLETE;
        return;
      }
      phraseIndex = 0;
      startListenPhase();
    },

    /**
     * Get the current phase for the renderer.
     * @returns {string} 'idle' | 'listen' | 'attempt' | 'review' | 'complete'
     */
    getPhase() {
      return phase;
    },

    /**
     * Get the current state for the renderer (called via evaluatorResult).
     * @returns {Object}
     */
    getState() {
      return {
        phase,
        phraseIndex,
        phraseCount: phrases.length,
        currentPhrase,
        detectedNotes: [...detectedNotes],
        pitchTrail: [...pitchTrail],
        comparisonResults,
        phaseStartTime,
        attemptTimerMs,
        reviewDurationMs,
      };
    },
  };
}
