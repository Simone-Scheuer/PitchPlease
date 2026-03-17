/**
 * session-runner.js — Orchestrates a sequence of exercise blocks into
 * a practice session.
 *
 * Sits one layer above exercise-runtime.js. Takes a session config
 * (from session-templates.js) containing an array of exercise blocks,
 * creates an exercise runtime for each block, manages transitions
 * between them, and collects measurements.
 *
 * State machine: idle → running → transitioning → complete
 */

import { bus } from '../utils/event-bus.js';
import { createExerciseRuntime } from './exercise-runtime.js';
import { createTargetAccuracyEvaluator } from './evaluators/target-accuracy.js';
import { createStabilityEvaluator } from './evaluators/stability.js';
import { createPhraseMatchEvaluator } from './evaluators/phrase-match.js';
import { createBendAccuracyEvaluator } from './evaluators/bend-accuracy.js';
import { createScrollTargetsRenderer } from '../renderers/scroll-targets.js';
import { createSeismographRenderer } from '../renderers/seismograph.js';
import { createFlashCardRenderer } from '../renderers/flash-card.js';
import { createOverlayComparisonRenderer } from '../renderers/overlay-comparison.js';
import { createBendMeterRenderer } from '../renderers/bend-meter.js';
import { createPitchTraceRenderer } from '../renderers/pitch-trace.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATES = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  TRANSITIONING: 'transitioning',
  COMPLETE: 'complete',
});

const TRANSITION_MS = 1500;
const DEFAULT_COUNTDOWN = 3;

// ---------------------------------------------------------------------------
// Evaluator registry
// ---------------------------------------------------------------------------

/**
 * Map evaluator type strings from exercise configs to factory functions.
 * Each factory receives the exercise config and returns an evaluator
 * instance (or null for no evaluation).
 */
const EVALUATOR_REGISTRY = {
  'target-accuracy': (config) => createTargetAccuracyEvaluator(config),
  'stability': (config) => createStabilityEvaluator(config?.evaluatorOptions),
  'reaction-time': () => createTargetAccuracyEvaluator({ tolerance: 40, holdMs: 300 }),
  'phrase-match': (config) => createPhraseMatchEvaluator(config),
  'bend-accuracy': (config) => createBendAccuracyEvaluator(config?.evaluatorOptions),
  'none': () => null,
  // Phase 5 placeholder
  'interval-accuracy': () => null,
};

// ---------------------------------------------------------------------------
// Renderer registry
// ---------------------------------------------------------------------------

/**
 * Map renderer type strings from exercise configs to factory functions.
 * Each factory returns a renderer instance (or null for headless).
 */
const RENDERER_REGISTRY = {
  'scroll-targets': () => createScrollTargetsRenderer(),
  'seismograph': () => createSeismographRenderer(),
  'flash-card': () => createFlashCardRenderer(),
  'overlay-comparison': () => createOverlayComparisonRenderer(),
  'bend-meter': () => createBendMeterRenderer(),
  'pitch-trace': () => createPitchTraceRenderer(),
  'pitch-trail': () => null,  // placeholder
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a session runner that orchestrates exercise blocks.
 *
 * @param {import('./session-templates.js').SessionConfig} sessionConfig
 * @returns {{
 *   start: (canvasElement: HTMLCanvasElement) => void,
 *   pause: () => void,
 *   resume: () => void,
 *   skip: () => void,
 *   stop: () => Object,
 *   getState: () => string,
 *   getCurrentBlock: () => Object|null,
 *   getProgress: () => Object,
 * }}
 */
export function createSessionRunner(sessionConfig) {
  const blocks = sessionConfig.blocks ?? [];

  // --- Internal state ---
  let state = STATES.IDLE;
  let canvasEl = null;
  let blockIndex = 0;
  let blockResults = [];

  // --- Current block runtime ---
  let currentRuntime = null;
  let currentRenderer = null;
  let currentEvaluator = null;

  // --- Block timer ---
  let blockTimerId = null;
  let blockStartTime = 0;
  let blockElapsed = 0;
  let blockRemainingMs = 0;   // for pause/resume
  let blockPauseTime = 0;

  // --- Session timer ---
  let sessionStartTime = 0;
  let sessionPausedMs = 0;
  let sessionPauseTime = 0;

  // --- Transition timer ---
  let transitionTimerId = null;

  // --- Bus subscription for early exercise completion ---
  let exerciseCompleteUnsub = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function currentBlock() {
    if (blockIndex >= blocks.length) return null;
    return blocks[blockIndex];
  }

  function sessionElapsed() {
    if (state === STATES.IDLE || sessionStartTime === 0) return 0;
    if (sessionPauseTime > 0) {
      return sessionPauseTime - sessionStartTime - sessionPausedMs;
    }
    return performance.now() - sessionStartTime - sessionPausedMs;
  }

  // ---------------------------------------------------------------------------
  // Evaluator / Renderer lookup
  // ---------------------------------------------------------------------------

  function lookupEvaluator(exercise) {
    const type = exercise.evaluator ?? 'none';
    const factory = EVALUATOR_REGISTRY[type];
    if (!factory) return null;
    return factory(exercise);
  }

  function lookupRenderer(exercise) {
    const type = exercise.renderer ?? 'scroll-targets';
    const factory = RENDERER_REGISTRY[type];
    if (!factory) return null;
    return factory();
  }

  // ---------------------------------------------------------------------------
  // Block lifecycle
  // ---------------------------------------------------------------------------

  function startBlock() {
    const block = currentBlock();
    if (!block) {
      completeSession();
      return;
    }


    state = STATES.RUNNING;
    const exercise = block.exercise;

    try {
      // Look up evaluator and renderer
      currentEvaluator = lookupEvaluator(exercise);
      currentRenderer = lookupRenderer(exercise);

      // Create the exercise runtime
      currentRuntime = createExerciseRuntime(exercise, currentEvaluator, currentRenderer);

      // Initialize renderer with the canvas
      if (currentRenderer && canvasEl) {
        currentRenderer.init(canvasEl, exercise);
      }
    } catch (err) {
      console.error(`[session-runner] Failed to initialize block ${blockIndex}:`, err);
      // Skip this block and try the next
      blockIndex++;
      if (blockIndex < blocks.length) {
        startBlock();
      } else {
        completeSession();
      }
      return;
    }

    // Subscribe to exercise:complete for early completion
    exerciseCompleteUnsub = bus.on('exercise:complete', onExerciseComplete);

    // Emit block start
    bus.emit('session:block-start', {
      blockIndex,
      label: block.label,
      exercise,
      blockCount: blocks.length,
    });

    // Start the exercise runtime with countdown
    currentRuntime.start(DEFAULT_COUNTDOWN);

    // Start block duration timer
    blockRemainingMs = block.duration;
    blockStartTime = performance.now();
    blockElapsed = 0;
    scheduleBlockTimer(blockRemainingMs);
  }

  function scheduleBlockTimer(ms) {
    clearBlockTimer();
    blockTimerId = setTimeout(() => {
      blockTimerId = null;
      endCurrentBlock();
    }, ms);
  }

  function clearBlockTimer() {
    if (blockTimerId != null) {
      clearTimeout(blockTimerId);
      blockTimerId = null;
    }
  }

  function clearTransitionTimer() {
    if (transitionTimerId != null) {
      clearTimeout(transitionTimerId);
      transitionTimerId = null;
    }
  }

  /**
   * Handle early exercise completion (exercise finishes before block timer).
   */
  function onExerciseComplete(data) {
    // Only act if we are in the running state for this block

    if (state !== STATES.RUNNING) return;
    endCurrentBlock();
  }

  /**
   * Stop the current block, collect measurements, and advance.
   */
  function endCurrentBlock() {
    if (state !== STATES.RUNNING) return;

    clearBlockTimer();

    // Unsubscribe from exercise:complete
    if (exerciseCompleteUnsub) {
      exerciseCompleteUnsub();
      exerciseCompleteUnsub = null;
    }

    // Stop the exercise runtime and collect measurements
    const measurements = currentRuntime ? currentRuntime.stop() : {};

    // Compute how long this block actually ran
    const now = performance.now();
    blockElapsed = now - blockStartTime;

    // Destroy renderer
    if (currentRenderer) {
      currentRenderer.destroy();
    }

    // Store block result
    const block = currentBlock();
    const result = {
      blockIndex,
      label: block?.label ?? '',
      phase: block?.phase ?? '',
      measurements,
      elapsed: Math.round(blockElapsed),
    };
    blockResults.push(result);

    // Emit block end
    bus.emit('session:block-end', {
      blockIndex,
      label: block?.label ?? '',
      measurements,
    });

    // Clean up current block state
    currentRuntime?.destroy();
    currentRuntime = null;
    currentRenderer = null;
    currentEvaluator = null;

    // Advance to next block or complete
    blockIndex++;

    if (blockIndex < blocks.length) {
      // Enter transition state
      state = STATES.TRANSITIONING;
      const nextBlock = blocks[blockIndex];

      bus.emit('session:transition', {
        nextBlockIndex: blockIndex,
        nextLabel: nextBlock.label,
        nextExercise: nextBlock.exercise,
      });

      transitionTimerId = setTimeout(() => {
        transitionTimerId = null;
        startBlock();
      }, TRANSITION_MS);
    } else {
      completeSession();
    }
  }

  // ---------------------------------------------------------------------------
  // Session completion
  // ---------------------------------------------------------------------------

  function completeSession() {

    state = STATES.COMPLETE;

    const totalDuration = Math.round(sessionElapsed());

    bus.emit('session:complete', {
      totalDuration,
      blockResults,
      sessionConfig,
    });
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  function cleanup() {
    clearBlockTimer();
    clearTransitionTimer();

    if (exerciseCompleteUnsub) {
      exerciseCompleteUnsub();
      exerciseCompleteUnsub = null;
    }

    if (currentRuntime) {
      currentRuntime.destroy();
      currentRuntime = null;
    }

    if (currentRenderer) {
      currentRenderer.destroy();
      currentRenderer = null;
    }

    currentEvaluator = null;
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  return {
    /**
     * Begin the session. Stores the canvas reference for passing to renderers.
     *
     * @param {HTMLCanvasElement} canvasElement
     */
    start(canvasElement) {
      if (state !== STATES.IDLE) return;

      canvasEl = canvasElement;
      blockIndex = 0;
      blockResults = [];
      sessionStartTime = performance.now();
      sessionPausedMs = 0;
      sessionPauseTime = 0;


      bus.emit('session:start', { sessionConfig });

      startBlock();
    },

    /**
     * Pause the current exercise and block timer.
     */
    pause() {
      if (state === STATES.RUNNING) {
        // Pause the exercise runtime
        currentRuntime?.pause();

        // Pause block timer — capture remaining time
        const now = performance.now();
        blockElapsed = now - blockStartTime;
        blockRemainingMs = Math.max(0, currentBlock().duration - blockElapsed);
        clearBlockTimer();

        // Track session pause
        sessionPauseTime = now;
        blockPauseTime = now;

      } else if (state === STATES.TRANSITIONING) {
        // Pause during transition — clear transition timer, track remaining
        clearTransitionTimer();
        sessionPauseTime = performance.now();
        blockPauseTime = performance.now();
      }
    },

    /**
     * Resume from paused state.
     */
    resume() {
      const now = performance.now();

      if (state === STATES.RUNNING && sessionPauseTime > 0) {
        // Accumulate paused duration
        const pausedMs = now - sessionPauseTime;
        sessionPausedMs += pausedMs;
        sessionPauseTime = 0;

        // Adjust block start time to account for pause
        blockStartTime += pausedMs;
        blockPauseTime = 0;

        // Resume exercise runtime
        currentRuntime?.resume();

        // Re-schedule block timer with remaining time
        scheduleBlockTimer(blockRemainingMs);

      } else if (state === STATES.TRANSITIONING && sessionPauseTime > 0) {
        const pausedMs = now - sessionPauseTime;
        sessionPausedMs += pausedMs;
        sessionPauseTime = 0;
        blockPauseTime = 0;

        // Re-start transition timer (approximate remaining)
        transitionTimerId = setTimeout(() => {
          transitionTimerId = null;
          startBlock();
        }, TRANSITION_MS);
      }
    },

    /**
     * Skip the current block and advance to the next.
     */
    skip() {
      if (state === STATES.RUNNING) {
        endCurrentBlock();
      } else if (state === STATES.TRANSITIONING) {
        clearTransitionTimer();
        startBlock();
      }
    },

    /**
     * Stop the session early. Finalizes the current exercise if running,
     * collects all results, and cleans up.
     *
     * @returns {{ totalDuration: number, blockResults: Object[], sessionConfig: Object }}
     */
    stop() {
      if (state === STATES.IDLE || state === STATES.COMPLETE) {
        return { totalDuration: 0, blockResults: [...blockResults], sessionConfig };
      }

      // If currently running a block, finalize it
      if (state === STATES.RUNNING && currentRuntime) {
        clearBlockTimer();

        if (exerciseCompleteUnsub) {
          exerciseCompleteUnsub();
          exerciseCompleteUnsub = null;
        }

        const measurements = currentRuntime.stop();
        const block = currentBlock();
        blockElapsed = performance.now() - blockStartTime;

        blockResults.push({
          blockIndex,
          label: block?.label ?? '',
          phase: block?.phase ?? '',
          measurements,
          elapsed: Math.round(blockElapsed),
        });
      }

      const totalDuration = Math.round(sessionElapsed());
      const results = {
        totalDuration,
        blockResults: [...blockResults],
        sessionConfig,
      };

      cleanup();
      state = STATES.COMPLETE;

      bus.emit('session:complete', {
        totalDuration,
        blockResults: results.blockResults,
        sessionConfig,
      });

      return results;
    },

    /**
     * @returns {string} Current state: idle, running, transitioning, complete
     */
    getState() {
      return state;
    },

    /**
     * @returns {{ blockIndex: number, label: string, phase: string, exercise: Object }|null}
     */
    getCurrentBlock() {
      const block = currentBlock();
      if (!block || state === STATES.IDLE || state === STATES.COMPLETE) return null;

      return {
        blockIndex,
        label: block.label,
        phase: block.phase,
        exercise: block.exercise,
      };
    },

    /**
     * @returns {{
     *   blockIndex: number,
     *   blockCount: number,
     *   blockElapsed: number,
     *   blockDuration: number,
     *   sessionElapsed: number,
     *   sessionDuration: number,
     * }}
     */
    getProgress() {
      const block = currentBlock();
      const now = performance.now();

      let currentBlockElapsed = 0;
      if (state === STATES.RUNNING && blockStartTime > 0) {
        currentBlockElapsed = now - blockStartTime;
      }

      return {
        blockIndex,
        blockCount: blocks.length,
        blockElapsed: Math.round(currentBlockElapsed),
        blockDuration: block?.duration ?? 0,
        sessionElapsed: Math.round(sessionElapsed()),
        sessionDuration: sessionConfig.totalDuration ?? 0,
      };
    },
  };
}
