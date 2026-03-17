import { bus } from '../utils/event-bus.js';
import { qs } from '../utils/dom.js';
import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { createSessionRunner } from '../core/session-runner.js';
import { SCALE_LABELS } from '../utils/scales.js';
import { recordSession } from '../profile/history.js';

const MOTIVATIONAL_MESSAGES = [
  'Every session builds your skills',
  'Consistency is the key to progress',
  'You showed up \u2014 that\u2019s what matters',
  'Small steps, big results',
  'Your ears are getting sharper every day',
];

class SessionView {
  #viewEl;
  #progressEl;
  #labelEl;
  #canvasEl;
  #transitionEl;
  #transitionTextEl;
  #controlsEl;
  #pauseBtn;
  #pauseIconEl;
  #pauseTextEl;
  #skipBtn;
  #endBtn;
  #summaryEl;
  #summaryTimeEl;
  #summaryExercisesEl;
  #summaryMessageEl;
  #backBtn;
  #tabBar;

  #runner = null;
  #blockResults = [];
  #paused = false;
  #micStarted = false;
  #blocks = [];

  // Bus unsubscribe handles
  #unsubs = [];

  init() {
    this.#viewEl = qs('#session-view');
    this.#progressEl = qs('.session-progress');
    this.#labelEl = qs('.session-label');
    this.#canvasEl = qs('#session-canvas');
    this.#transitionEl = qs('.session-transition');
    this.#transitionTextEl = qs('.session-transition-text');
    this.#controlsEl = qs('.session-controls');
    this.#pauseBtn = qs('#session-pause');
    this.#pauseIconEl = this.#pauseBtn.querySelector('.session-btn-icon');
    this.#pauseTextEl = this.#pauseBtn.querySelector('.session-btn-text');
    this.#skipBtn = qs('#session-skip');
    this.#endBtn = qs('#session-end');
    this.#summaryEl = qs('.session-summary');
    this.#summaryTimeEl = qs('.session-summary-time');
    this.#summaryExercisesEl = qs('.session-summary-exercises');
    this.#summaryMessageEl = qs('.session-summary-message');
    this.#backBtn = qs('#session-back');
    this.#tabBar = qs('.view-switcher');

    this.#pauseBtn.addEventListener('click', () => this.#togglePause());
    this.#skipBtn.addEventListener('click', () => this.#skip());
    this.#endBtn.addEventListener('click', () => this.#end());
    this.#backBtn.addEventListener('click', () => this.#backToPractice());
  }

  async activate(sessionConfig) {
    this.#blockResults = [];
    this.#paused = false;
    this.#blocks = sessionConfig.blocks ?? [];

    // Hide tab bar
    if (this.#tabBar) {
      this.#tabBar.classList.add('tab-bar-hidden');
    }

    // Show session view
    this.#viewEl.hidden = false;
    this.#viewEl.classList.add('active');

    // Reset UI state
    this.#summaryEl.hidden = true;
    this.#transitionEl.hidden = true;
    this.#transitionEl.classList.remove('visible');
    this.#controlsEl.hidden = false;
    this.#pauseIconEl.innerHTML = '\u23F8';
    this.#pauseTextEl.textContent = 'Pause';
    this.#progressEl.innerHTML = '';
    this.#labelEl.textContent = '';

    // Build initial progress bar segments
    this.#buildProgressBar();

    // Start mic
    if (!this.#micStarted) {
      await mic.start();
      detector.start();
      this.#micStarted = true;
    }

    // Subscribe to session events
    this.#unsubs.push(
      bus.on('session:block-start', (data) => this.#onBlockStart(data)),
      bus.on('session:block-end', (data) => this.#onBlockEnd(data)),
      bus.on('session:transition', (data) => this.#onTransition(data)),
      bus.on('session:complete', (data) => this.#onComplete(data)),
    );

    // Create and start runner (wait one frame for canvas to get layout dimensions)
    this.#runner = createSessionRunner(sessionConfig);
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.#runner.start(this.#canvasEl);
  }

  deactivate() {
    // Stop runner if still active
    if (this.#runner) {
      const runnerState = this.#runner.getState();
      if (runnerState !== 'idle' && runnerState !== 'complete') {
        this.#runner.stop();
      }
      this.#runner = null;
    }

    // Stop mic
    if (this.#micStarted) {
      detector.stop();
      mic.stop();
      this.#micStarted = false;
    }

    // Unsubscribe bus listeners
    for (const unsub of this.#unsubs) {
      unsub();
    }
    this.#unsubs = [];

    // Show tab bar
    if (this.#tabBar) {
      this.#tabBar.classList.remove('tab-bar-hidden');
    }

    // Hide session view
    this.#viewEl.classList.remove('active');
    this.#viewEl.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // Progress bar
  // ---------------------------------------------------------------------------

  #buildProgressBar() {
    this.#progressEl.innerHTML = '';
    const totalDuration = this.#blocks.reduce((sum, b) => sum + (b.duration ?? 0), 0);
    if (totalDuration === 0) return;

    for (let i = 0; i < this.#blocks.length; i++) {
      const seg = document.createElement('div');
      seg.className = 'session-progress-segment upcoming';
      const pct = ((this.#blocks[i].duration ?? 0) / totalDuration) * 100;
      seg.style.width = `${pct}%`;
      seg.dataset.index = i;
      this.#progressEl.appendChild(seg);
    }
  }

  #updateProgressBar(activeIndex) {
    const segments = this.#progressEl.children;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      seg.classList.remove('active', 'completed', 'upcoming');
      if (i < activeIndex) {
        seg.classList.add('completed');
      } else if (i === activeIndex) {
        seg.classList.add('active');
      } else {
        seg.classList.add('upcoming');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Session event handlers
  // ---------------------------------------------------------------------------

  #onBlockStart(data) {
    this.#updateProgressBar(data.blockIndex);

    // Show phase + key context before the main label
    const root = data.exercise?.context?.root ?? '';
    const scaleKey = data.exercise?.context?.scale ?? '';
    const scaleLabel = SCALE_LABELS[scaleKey] ?? scaleKey;
    const phaseText = root && scaleLabel ? `${root} ${scaleLabel}` : '';

    // Animate label change with slide-in
    this.#labelEl.classList.remove('slide-in');
    // Force reflow to restart animation
    void this.#labelEl.offsetWidth;
    this.#labelEl.classList.add('slide-in');

    if (phaseText) {
      this.#labelEl.innerHTML = `<span class="session-phase">${phaseText}</span> ${data.label ?? ''}`;
    } else {
      this.#labelEl.textContent = data.label ?? '';
    }

    // Fade out transition overlay
    this.#transitionEl.classList.remove('visible');
    // Hide after fade completes
    setTimeout(() => { this.#transitionEl.hidden = true; }, 300);
  }

  #onBlockEnd(data) {
    this.#blockResults.push({
      blockIndex: data.blockIndex,
      label: data.label,
      measurements: data.measurements,
    });
  }

  #onTransition(data) {
    // Show structured transition with "Next" label, exercise name, and description
    const nextBlock = this.#blocks[data.nextBlockIndex];
    const desc = nextBlock?.exercise?.description ?? '';

    let html = `<div class="session-transition-next">Next</div><div class="session-transition-name">${data.nextLabel}</div>`;
    if (desc) {
      html += `<div class="session-transition-desc">${desc}</div>`;
    }

    this.#transitionTextEl.innerHTML = html;
    // Show and fade in the transition overlay
    this.#transitionEl.hidden = false;
    // Force reflow so the transition triggers
    void this.#transitionEl.offsetWidth;
    this.#transitionEl.classList.add('visible');
  }

  #onComplete(data) {
    this.#recordToHistory(data);
    this.#showSummary(data);
  }

  /**
   * Record the completed session to practice history.
   */
  #recordToHistory(data) {
    try {
      const config = data.sessionConfig ?? {};
      const results = data.blockResults ?? this.#blockResults;

      recordSession({
        sessionId: config.id ?? config.name ?? 'session',
        name: config.name ?? 'Practice Session',
        duration: data.totalDuration ?? 0,
        blocks: results.map(result => ({
          label: result.label ?? '',
          exerciseType: result.measurements?.exerciseType ?? result.phase ?? '',
          measurements: result.measurements ?? {},
        })),
      });
    } catch (err) {
      // History recording should never break the session flow
      console.warn('[session-view] Failed to record session to history:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  #togglePause() {
    if (!this.#runner) return;

    if (this.#paused) {
      this.#runner.resume();
      this.#paused = false;
      this.#pauseIconEl.innerHTML = '\u23F8';
      this.#pauseTextEl.textContent = 'Pause';
    } else {
      this.#runner.pause();
      this.#paused = true;
      this.#pauseIconEl.innerHTML = '\u25B6';
      this.#pauseTextEl.textContent = 'Resume';
    }
  }

  #skip() {
    if (!this.#runner) return;
    this.#runner.skip();
  }

  #end() {
    if (!this.#runner) return;
    const results = this.#runner.stop();
    // session:complete is emitted by the runner's stop(), which triggers #onComplete
    // If it didn't fire (already complete), show summary manually
    if (results && !this.#summaryEl.hidden === true) {
      this.#showSummary(results);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  #showSummary(data) {
    this.#controlsEl.hidden = true;
    this.#transitionEl.classList.remove('visible');
    this.#transitionEl.hidden = true;

    const totalMs = data.totalDuration ?? 0;
    const totalSec = Math.round(totalMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const timeStr = mins > 0
      ? `${mins}m ${secs}s`
      : `${secs}s`;

    // Time display
    this.#summaryTimeEl.textContent = timeStr;

    // Exercise list with checkmarks
    this.#summaryExercisesEl.innerHTML = '';
    const results = data.blockResults ?? this.#blockResults;
    for (const result of results) {
      const item = document.createElement('div');
      item.className = 'session-summary-exercise-item';

      const check = document.createElement('span');
      check.className = 'session-summary-exercise-check';
      check.textContent = '\u2713';

      const name = document.createElement('span');
      name.textContent = result.label;

      item.appendChild(check);
      item.appendChild(name);
      this.#summaryExercisesEl.appendChild(item);
    }

    // Motivational message (rotate)
    const msg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
    this.#summaryMessageEl.textContent = msg;

    // Mark all progress segments as completed
    this.#updateProgressBar(this.#blocks.length);

    this.#summaryEl.hidden = false;
  }

  #backToPractice() {
    this.deactivate();
    bus.emit('navigate', { view: 'play-view' });
  }
}

export const sessionView = new SessionView();
