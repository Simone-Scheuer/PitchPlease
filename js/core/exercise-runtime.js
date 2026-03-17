/**
 * exercise-runtime.js — Central engine that interprets exercise configs,
 * connects to the pitch event stream, runs evaluators, drives renderers,
 * and manages exercise lifecycle.
 *
 * The runtime is agnostic to which evaluator and renderer it uses — it calls
 * their interface methods, never their internals.
 *
 * State machine: idle → countdown → running → paused → complete
 *
 * Pure orchestration module — imports only the event bus.
 */

import { bus } from '../utils/event-bus.js';
import { NOTE_NAMES } from '../utils/constants.js';
import { startDrone as startSynthDrone, playPhrase as playSynthPhrase } from '../audio/synth.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATES = Object.freeze({
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETE: 'complete',
});

const DEFAULT_COUNTDOWN_SECONDS = 3;
const AUTO_TEMPO_INCREASE_THRESHOLD = 85;
const AUTO_TEMPO_DECREASE_THRESHOLD = 60;
const AUTO_TEMPO_STEP_FACTOR = 1.08;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an exercise runtime instance.
 *
 * @param {import('./exercise-schema.js').ExerciseConfig} config
 * @param {Object|null} evaluator - Evaluator instance (e.g. from createTargetAccuracyEvaluator)
 * @param {Object|null} renderer  - Renderer instance (optional, null for headless)
 * @returns {{
 *   start: (countdownSeconds?: number) => void,
 *   pause: () => void,
 *   resume: () => void,
 *   stop: () => Object,
 *   destroy: () => void,
 *   getState: () => string,
 *   getCursor: () => number,
 *   getElapsed: () => number,
 * }}
 */
export function createExerciseRuntime(config, evaluator, renderer) {
  // --- Internal state ---
  let state = STATES.IDLE;
  let cursor = 0;                   // index into config.context.notes[]
  let startTime = 0;                // timestamp when running state began
  let elapsed = 0;                  // ms elapsed in running state (excludes pauses)
  let pauseTime = 0;               // timestamp when paused
  let totalPausedMs = 0;           // accumulated pause duration
  let rafId = null;                 // requestAnimationFrame handle
  let countdownTimer = null;        // countdown interval handle
  let loopGapTimer = null;          // loop gap timeout handle
  let fixedTempoTimer = null;       // fixed-tempo note advance timeout
  let lastPitchData = null;         // most recent pitch event data
  let lastEvaluatorResult = null;   // most recent evaluator result
  let hasPitch = false;             // true if last event was pitch (not silence)
  let iterationCount = 0;          // loop iteration counter
  let currentTempoBpm = 0;         // for auto-tempo mode
  let currentNoteDuration = 0;     // for auto-tempo mode (ms)

  // --- Unsub tracking ---
  const unsubs = [];

  // --- Synth state ---
  let droneHandle = null;  // { stop, pause, resume } from startDrone

  // --- Derived from config ---
  const notes = config.context?.notes ?? [];
  const timingMode = config.timing?.mode ?? 'player-driven';
  const hasNotes = notes.length > 0;

  // For sustained/free exercises without explicit notes, derive a target
  // from context.root so the evaluator and renderer have something to work with.
  const fallbackTarget = deriveFallbackTarget(config);

  function deriveFallbackTarget(cfg) {
    const root = cfg.context?.root;
    if (!root) return null;
    const rootIndex = NOTE_NAMES.indexOf(root);
    if (rootIndex === -1) return null;
    const octave = cfg.context?.octaveRange?.[0] ?? 4;
    const midi = (octave + 1) * 12 + rootIndex;
    return { note: `${root}${octave}`, midi };
  }

  function resolveDroneMidi(droneCfg) {
    // Drone can specify { midi } directly, or { note, octave }
    if (droneCfg.midi != null) return droneCfg.midi;
    const note = droneCfg.note ?? config.context?.root;
    if (!note) return null;
    const noteIndex = NOTE_NAMES.indexOf(note);
    if (noteIndex === -1) return null;
    const octave = droneCfg.octave ?? config.context?.octaveRange?.[0] ?? 4;
    return (octave + 1) * 12 + noteIndex;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function currentTarget() {
    if (hasNotes) {
      if (cursor >= notes.length) return null;
      return notes[cursor];
    }
    // Sustained/free: use root note as target
    return fallbackTarget;
  }

  function buildTickState() {
    return {
      pitchData: lastPitchData,
      targetNote: currentTarget(),
      cursor,
      noteCount: notes.length,
      elapsed,
      evaluatorResult: lastEvaluatorResult,
      exerciseState: state,
      iteration: iterationCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Note advancement
  // ---------------------------------------------------------------------------

  function advanceNote() {
    // Finalize current note in evaluator
    let noteResult = null;
    if (evaluator?.advanceNote) {
      noteResult = evaluator.advanceNote();
    }

    if (noteResult) {
      bus.emit('exercise:note-complete', {
        noteResult,
        cursor,
        noteCount: notes.length,
      });
    }

    cursor++;

    // Check if exercise is complete (all notes played)
    if (hasNotes && cursor >= notes.length) {
      completeExercise();
      return;
    }

    // For fixed-tempo / auto-tempo, schedule next advance
    if (state === STATES.RUNNING) {
      scheduleFixedTempoAdvance();
    }
  }

  function pickReactiveNote() {
    const pool = config.context?.pool;
    if (!pool) return null;

    if (Array.isArray(pool)) {
      // pool is NoteSpec[]
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // 'scale' or 'chromatic' — fall back to notes array if available
    if (hasNotes) {
      return notes[Math.floor(Math.random() * notes.length)];
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Fixed-tempo / auto-tempo scheduling
  // ---------------------------------------------------------------------------

  function scheduleFixedTempoAdvance() {
    clearFixedTempoTimer();

    if (timingMode === 'fixed-tempo') {
      const duration = config.timing?.noteDuration ?? 1000;
      fixedTempoTimer = setTimeout(() => {
        if (state === STATES.RUNNING) advanceNote();
      }, duration);

    } else if (timingMode === 'auto-tempo') {
      fixedTempoTimer = setTimeout(() => {
        if (state === STATES.RUNNING) {
          // Adapt tempo based on score
          adaptTempo();
          advanceNote();
        }
      }, currentNoteDuration);
    }
  }

  function clearFixedTempoTimer() {
    if (fixedTempoTimer != null) {
      clearTimeout(fixedTempoTimer);
      fixedTempoTimer = null;
    }
  }

  function adaptTempo() {
    if (!evaluator?.getScore) return;

    const score = evaluator.getScore();
    if (score > AUTO_TEMPO_INCREASE_THRESHOLD) {
      currentTempoBpm = Math.round(currentTempoBpm * AUTO_TEMPO_STEP_FACTOR);
      currentNoteDuration = Math.round(60000 / currentTempoBpm);
    } else if (score < AUTO_TEMPO_DECREASE_THRESHOLD) {
      currentTempoBpm = Math.max(30, Math.round(currentTempoBpm / AUTO_TEMPO_STEP_FACTOR));
      currentNoteDuration = Math.round(60000 / currentTempoBpm);
    }
  }

  // ---------------------------------------------------------------------------
  // Exercise completion and looping
  // ---------------------------------------------------------------------------

  function completeExercise() {
    if (state === STATES.COMPLETE) return;


    clearFixedTempoTimer();

    const shouldLoop = config.loop && state === STATES.RUNNING;

    state = STATES.COMPLETE;

    const measurements = evaluator?.getMeasurements?.() ?? {};
    const score = evaluator?.getScore?.() ?? 0;

    bus.emit('exercise:complete', {
      config,
      measurements,
      score,
      iteration: iterationCount,
      elapsed,
      willLoop: shouldLoop,
    });

    if (shouldLoop) {
      startLoopGap();
    } else {
      stopRafLoop();
      renderer?.stop?.();
    }
  }

  function startLoopGap() {
    const gapMs = config.loopGapMs ?? 3000;

    bus.emit('exercise:loop-gap', { gapMs, iteration: iterationCount });

    loopGapTimer = setTimeout(() => {
      loopGapTimer = null;
      restartForLoop();
    }, gapMs);
  }

  function restartForLoop() {
    iterationCount++;
    cursor = 0;
    lastEvaluatorResult = null;
    lastPitchData = null;
    hasPitch = false;

    evaluator?.reset?.();
    // Keep renderer alive across loops — just signal restart
    renderer?.onLoopRestart?.();

    state = STATES.RUNNING;
    startTime = performance.now();
    totalPausedMs = 0;
    elapsed = 0;

    bus.emit('exercise:start', {
      config,
      iteration: iterationCount,
    });

    scheduleFixedTempoAdvance();
    startRafLoop();
  }

  // ---------------------------------------------------------------------------
  // Pitch / silence event handlers
  // ---------------------------------------------------------------------------

  function onPitch(pitchData) {
    if (state !== STATES.RUNNING) return;

    lastPitchData = pitchData;
    hasPitch = true;

    const target = currentTarget();

    if (evaluator?.onPitch) {
      lastEvaluatorResult = evaluator.onPitch(pitchData, target);

      // Player-driven advance
      if (timingMode === 'player-driven' && lastEvaluatorResult?.advance && hasNotes) {
        advanceNote();
      }
    }
  }

  function onSilence() {
    if (state !== STATES.RUNNING) return;

    lastPitchData = null;
    hasPitch = false;

    evaluator?.onSilence?.();
    lastEvaluatorResult = null;
  }

  // ---------------------------------------------------------------------------
  // rAF loop — drives renderer and emits tick events
  // ---------------------------------------------------------------------------

  function tick() {
    if (state !== STATES.RUNNING && state !== STATES.COUNTDOWN) {
      rafId = null;
      return;
    }

    if (state === STATES.RUNNING) {
      elapsed = performance.now() - startTime - totalPausedMs;

      // Duration cap
      if (config.duration != null && elapsed >= config.duration) {
        completeExercise();
        return;
      }

      const tickState = buildTickState();

      // Drive renderer
      renderer?.update?.(tickState);

      // Emit tick
      bus.emit('exercise:tick', tickState);
    }

    rafId = requestAnimationFrame(tick);
  }

  function startRafLoop() {
    if (rafId != null) return;
    rafId = requestAnimationFrame(tick);
  }

  function stopRafLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Countdown
  // ---------------------------------------------------------------------------

  function startCountdown(seconds) {
    state = STATES.COUNTDOWN;
    let remaining = seconds;

    bus.emit('exercise:countdown', { secondsLeft: remaining });
    renderer?.onCountdown?.(remaining);

    startRafLoop();

    countdownTimer = setInterval(() => {
      remaining--;

      if (remaining <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        beginRunning();
      } else {
        bus.emit('exercise:countdown', { secondsLeft: remaining });
        renderer?.onCountdown?.(remaining);
      }
    }, 1000);
  }

  function beginRunning() {
    state = STATES.RUNNING;
    startTime = performance.now();
    totalPausedMs = 0;
    elapsed = 0;

    // Initialize auto-tempo
    if (timingMode === 'auto-tempo') {
      currentTempoBpm = config.timing?.tempoBpm ?? 80;
      currentNoteDuration = config.timing?.noteDuration ?? Math.round(60000 / currentTempoBpm);
    }

    // Handle reactive type — pick first random note
    if (config.type === 'reactive' && !hasNotes) {
      // For reactive with pool but no pre-built notes, this would need
      // a different approach. For now, reactive should have notes pre-generated.
    }

    // Start drone if configured
    if (config.audio?.drone && !droneHandle) {
      const droneCfg = config.audio.drone;
      const droneMidi = resolveDroneMidi(droneCfg);
      if (droneMidi != null) {
        droneHandle = startSynthDrone(droneMidi, {
          voice: droneCfg.voice ?? 'triangle',
          gain: droneCfg.gain ?? 0.8,
        });
      }
    }

    bus.emit('exercise:start', {
      config,
      iteration: iterationCount,
    });

    renderer?.start?.(config);

    // Schedule first fixed-tempo advance if applicable
    scheduleFixedTempoAdvance();

    startRafLoop();
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  function cleanup() {
    // Cancel all timers
    stopRafLoop();
    clearFixedTempoTimer();

    if (countdownTimer != null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (loopGapTimer != null) {
      clearTimeout(loopGapTimer);
      loopGapTimer = null;
    }

    // Stop drone
    if (droneHandle) {
      droneHandle.stop();
      droneHandle = null;
    }

    // Unsubscribe from all events
    for (const unsub of unsubs) {
      unsub();
    }
    unsubs.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Subscribe to pitch events
  // ---------------------------------------------------------------------------

  unsubs.push(bus.on('pitch', onPitch));
  unsubs.push(bus.on('silence', onSilence));

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Start the exercise, optionally with a countdown.
     * @param {number} [countdownSeconds] - Countdown duration (default 3, pass 0 to skip)
     */
    start(countdownSeconds) {
      if (state !== STATES.IDLE) return;

      iterationCount = 0;
      cursor = 0;
      lastPitchData = null;
      lastEvaluatorResult = null;
      hasPitch = false;

      evaluator?.reset?.();

      const seconds = countdownSeconds ?? DEFAULT_COUNTDOWN_SECONDS;

      if (seconds > 0) {
        startCountdown(seconds);
      } else {
        beginRunning();
      }
    },

    /**
     * Pause the exercise. Valid from running or countdown states.
     */
    pause() {
      if (state === STATES.RUNNING) {
        state = STATES.PAUSED;
        pauseTime = performance.now();
        clearFixedTempoTimer();
        stopRafLoop();
        droneHandle?.pause?.();
        bus.emit('exercise:paused', { elapsed });
      } else if (state === STATES.COUNTDOWN) {
        state = STATES.PAUSED;
        pauseTime = performance.now();
        if (countdownTimer != null) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        stopRafLoop();
        droneHandle?.pause?.();
        bus.emit('exercise:paused', { elapsed: 0 });
      }
    },

    /**
     * Resume from paused state.
     */
    resume() {
      if (state !== STATES.PAUSED) return;

      const pausedDuration = performance.now() - pauseTime;
      totalPausedMs += pausedDuration;

      state = STATES.RUNNING;
      droneHandle?.resume?.();
      bus.emit('exercise:resumed', { elapsed });

      // Reschedule fixed-tempo if needed
      scheduleFixedTempoAdvance();
      startRafLoop();
    },

    /**
     * Stop the exercise. Returns measurements from the evaluator.
     * Valid from any state except idle.
     * @returns {Object} measurements
     */
    stop() {
      if (state === STATES.IDLE) {
        return evaluator?.getMeasurements?.() ?? {};
      }

      // Finalize current note if running
      if (state === STATES.RUNNING && evaluator?.advanceNote) {
        evaluator.advanceNote();
      }

      const measurements = evaluator?.getMeasurements?.() ?? {};
      const score = evaluator?.getScore?.() ?? 0;

      cleanup();
      renderer?.stop?.();

      state = STATES.IDLE;
      cursor = 0;

      bus.emit('exercise:stopped', {
        measurements,
        score,
        elapsed,
        iteration: iterationCount,
      });

      return measurements;
    },

    /**
     * Destroy the runtime — unsubscribes from all events, cancels all timers.
     * Call this when the runtime is no longer needed.
     */
    destroy() {
      cleanup();
      renderer?.stop?.();
      state = STATES.IDLE;
    },

    /**
     * @returns {string} Current state (idle, countdown, running, paused, complete)
     */
    getState() {
      return state;
    },

    /**
     * @returns {number} Current note cursor index
     */
    getCursor() {
      return cursor;
    },

    /**
     * @returns {number} Elapsed running time in ms (excludes pauses)
     */
    getElapsed() {
      if (state === STATES.RUNNING) {
        return performance.now() - startTime - totalPausedMs;
      }
      return elapsed;
    },
  };
}
