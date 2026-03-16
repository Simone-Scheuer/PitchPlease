import { bus } from '../utils/event-bus.js';
import { qs } from '../utils/dom.js';
import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { createSessionRunner } from '../core/session-runner.js';

class SessionView {
  #viewEl;
  #progressEl;
  #labelEl;
  #canvasEl;
  #transitionEl;
  #transitionTextEl;
  #controlsEl;
  #pauseBtn;
  #skipBtn;
  #endBtn;
  #summaryEl;
  #summaryStatsEl;
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
    this.#skipBtn = qs('#session-skip');
    this.#endBtn = qs('#session-end');
    this.#summaryEl = qs('.session-summary');
    this.#summaryStatsEl = qs('.session-summary-stats');
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
    this.#controlsEl.hidden = false;
    this.#pauseBtn.textContent = '\u23F8';
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
    this.#labelEl.textContent = data.label ?? '';
    this.#transitionEl.hidden = true;
  }

  #onBlockEnd(data) {
    this.#blockResults.push({
      blockIndex: data.blockIndex,
      label: data.label,
      measurements: data.measurements,
    });
  }

  #onTransition(data) {
    this.#transitionTextEl.textContent = `Next: ${data.nextLabel}`;
    this.#transitionEl.hidden = false;
  }

  #onComplete(data) {
    this.#showSummary(data);
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  #togglePause() {
    if (!this.#runner) return;

    if (this.#paused) {
      this.#runner.resume();
      this.#paused = false;
      this.#pauseBtn.textContent = '\u23F8';
    } else {
      this.#runner.pause();
      this.#paused = true;
      this.#pauseBtn.textContent = '\u25B6';
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
    this.#transitionEl.hidden = true;

    const blocksCompleted = data.blockResults?.length ?? this.#blockResults.length;
    const totalMs = data.totalDuration ?? 0;
    const totalSec = Math.round(totalMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const timeStr = mins > 0
      ? `${mins}m ${secs}s`
      : `${secs}s`;

    this.#summaryStatsEl.innerHTML = '';
    const lines = [
      `Blocks completed: ${blocksCompleted} / ${this.#blocks.length}`,
      `Total duration: ${timeStr}`,
    ];
    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      this.#summaryStatsEl.appendChild(div);
    }

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
