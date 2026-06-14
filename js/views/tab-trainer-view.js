/**
 * tab-trainer-view.js — Harmonica tab-reading trainer.
 *
 * Two states in one view:
 *   - Menu:    pick a source (starter tab, random run, or pasted notation).
 *   - Playing: read the tab on the breath-ribbon; the ball advances each note
 *              you hit, reusing the exercise-runtime + bend-accuracy verify loop.
 *
 * Modeled on the post-P0-fix session-view: activation token guards every async
 * continuation, mic acquired with a visible wait + timeout before the engine
 * starts, one visibility mechanism, all bus subs and audio torn down on exit.
 */

import { qs } from '../utils/dom.js';
import { bus } from '../utils/event-bus.js';
import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { getHarmonicaKey } from '../profile/profile.js';
import { STARTER_TABS, randomSequence } from '../utils/harmonica-tabs.js';
import { parseTab, stringifyTab, TabParseError } from '../utils/harmonica-tab.js';
import { createExerciseRuntime } from '../core/exercise-runtime.js';
import { createBendAccuracyEvaluator } from '../core/evaluators/bend-accuracy.js';
import { createTabReaderRenderer } from '../renderers/tab-reader.js';

const MIC_TIMEOUT_MS = 10000;
const HOLD_MS = 175; // sustained-in-tune to advance — the "bouncing ball" feel

class TabTrainerView {
  #viewEl = null;
  #menuEl = null;
  #playEl = null;
  #starterCardsEl = null;
  #randomBtn = null;
  #pasteInput = null;
  #pasteError = null;
  #pastePlayBtn = null;
  #harpKeyEl = null;
  #playTitleEl = null;
  #playProgressEl = null;
  #canvasEl = null;
  #statusEl = null;
  #backBtn = null;
  #restartBtn = null;
  #pauseBtn = null;

  #key = 'C';
  #activationId = 0;
  #unsubs = [];
  #micStarted = false;
  #runtime = null;
  #renderer = null;
  #noteCount = 0;
  #currentTokens = null;
  #currentTitle = '';

  init() {
    this.#viewEl = qs('#tab-trainer-view');
    this.#menuEl = qs('#tt-menu');
    this.#playEl = qs('#tt-play');
    this.#starterCardsEl = qs('#tt-starter-cards');
    this.#randomBtn = qs('#tt-random');
    this.#pasteInput = qs('#tt-paste-input');
    this.#pasteError = qs('#tt-paste-error');
    this.#pastePlayBtn = qs('#tt-paste-play');
    this.#harpKeyEl = qs('#tt-harp-key');
    this.#playTitleEl = qs('#tt-play-title');
    this.#playProgressEl = qs('#tt-play-progress');
    this.#canvasEl = qs('#tt-canvas');
    this.#statusEl = qs('#tt-status');
    this.#backBtn = qs('#tt-back');
    this.#restartBtn = qs('#tt-restart');
    this.#pauseBtn = qs('#tt-pause');

    this.#randomBtn.addEventListener('click', () => this.#startRandom());
    this.#pastePlayBtn.addEventListener('click', () => this.#startPaste());
    this.#pasteInput.addEventListener('input', () => this.#clearPasteError());
    this.#backBtn.addEventListener('click', () => this.#toMenu());
    this.#restartBtn.addEventListener('click', () => this.#restart());
    this.#pauseBtn.addEventListener('click', () => this.#togglePause());
  }

  activate() {
    this.#key = getHarmonicaKey();
    this.#harpKeyEl.textContent = `${this.#key} harp`;
    this.#renderStarters();
    this.#toMenu();
    this.#viewEl.classList.add('active');
  }

  deactivate() {
    this.#teardownEngine();
    this.#viewEl.classList.remove('active');
    this.#showMenu();
  }

  // --- menu ---------------------------------------------------------------

  #renderStarters() {
    this.#starterCardsEl.replaceChildren();
    for (const tab of STARTER_TABS) {
      const card = document.createElement('button');
      card.className = 'tt-card';
      card.dataset.id = tab.id;

      const title = document.createElement('span');
      title.className = 'tt-card__title';
      title.textContent = tab.title;

      const notation = document.createElement('span');
      notation.className = 'tt-card__notation';
      notation.append(notationFragment(tab.tab));

      const tag = document.createElement('span');
      tag.className = `tt-card__tag tt-card__tag--${tab.difficulty}`;
      tag.textContent = tab.difficulty;

      card.append(title, notation, tag);
      card.addEventListener('click', () => this.#startStarter(tab.id));
      this.#starterCardsEl.append(card);
    }
  }

  #clearPasteError() {
    this.#pasteError.textContent = '';
    this.#pasteInput.classList.remove('tt-paste__input--error');
  }

  #showPasteError(message) {
    this.#pasteError.textContent = message;
    this.#pasteInput.classList.add('tt-paste__input--error');
  }

  // --- source selection ---------------------------------------------------

  #startStarter(id) {
    const tab = STARTER_TABS.find(t => t.id === id);
    if (!tab) return;
    // Starter tabs are written for their own key, not the profile's.
    this.#start(parseTab(tab.tab, tab.key), tab.title);
  }

  #startRandom() {
    const tokens = randomSequence({ key: this.#key, holeRange: [1, 6], length: 8 });
    this.#start(tokens, 'Random run');
  }

  #startPaste() {
    const raw = this.#pasteInput.value.trim();
    if (!raw) {
      this.#showPasteError("Write some tab first — e.g. 4 -4 -4' 5");
      return;
    }
    let tokens;
    try {
      tokens = parseTab(raw, this.#key);
    } catch (err) {
      if (err instanceof TabParseError) {
        this.#showPasteError(err.message);
        return;
      }
      throw err;
    }
    if (tokens.length === 0) {
      this.#showPasteError('No notes found.');
      return;
    }
    this.#clearPasteError();
    this.#start(tokens, 'Your tab');
  }

  // --- playing ------------------------------------------------------------

  /**
   * Enter the playing state with a parsed token sequence: acquire the mic
   * (with timeout + visible state), build the engine, and start.
   *
   * @param {import('../utils/harmonica-tab.js').TabToken[]} tokens
   * @param {string} title
   */
  async #start(tokens, title) {
    const token = ++this.#activationId;
    this.#currentTokens = tokens;
    this.#currentTitle = title;
    this.#noteCount = tokens.length;

    this.#playTitleEl.textContent = title;
    this.#playProgressEl.textContent = `0 / ${tokens.length}`;
    this.#statusEl.textContent = 'Waiting for microphone…';
    this.#pauseBtn.textContent = 'Pause';
    this.#menuEl.hidden = true;
    this.#playEl.hidden = false;

    if (!this.#micStarted) {
      const micPromise = mic.start();
      try {
        await Promise.race([micPromise, rejectAfter(MIC_TIMEOUT_MS)]);
      } catch {
        // Release the stream if the prompt is granted after we gave up.
        micPromise.then(() => { if (!this.#micStarted) mic.stop(); }).catch(() => {});
        if (token === this.#activationId) {
          this.#statusEl.textContent = 'Microphone unavailable — check permissions, then go back and retry.';
        }
        return;
      }
      if (token !== this.#activationId) { mic.stop(); return; }
      detector.start();
      this.#micStarted = true;
    }

    // Let the now-visible canvas get its layout before measuring it (the
    // display:none-at-init → width-0 trap the tuner strip also hit).
    await new Promise(r => requestAnimationFrame(r));
    if (token !== this.#activationId) return;

    this.#buildAndStart();
  }

  /**
   * Build a fresh runtime + renderer for the current tokens and start it.
   * Used by both first start and restart — the runtime can't be reused after
   * stop() (its cleanup unsubscribes the pitch listener for good), so a clean
   * rebuild is the only correct restart. Assumes mic is already running and the
   * play canvas is laid out.
   */
  #buildAndStart() {
    this.#teardownRuntime();
    const tokens = this.#currentTokens;
    const config = buildConfig(tokens, this.#currentTitle, this.#key);
    const evaluator = createBendAccuracyEvaluator({
      inTuneCents: 18,   // reading is hole-finding, not microtonal sculpting
      closeCents: 45,
      lockMs: 90,
      holdMs: HOLD_MS,
      playerDriven: true,
    });
    this.#renderer = createTabReaderRenderer();
    this.#renderer.init(this.#canvasEl, config);
    this.#runtime = createExerciseRuntime(config, evaluator, this.#renderer);
    this.#unsubs.push(
      bus.on('exercise:note-complete', ({ cursor, noteCount }) => {
        this.#playProgressEl.textContent = `${Math.min(cursor, noteCount)} / ${noteCount}`;
      }),
    );
    this.#playProgressEl.textContent = `0 / ${tokens.length}`;
    this.#pauseBtn.textContent = 'Pause';
    this.#statusEl.textContent = stringifyTab(tokens);
    this.#runtime.start(0); // no countdown — player-driven waits on the first note
  }

  #togglePause() {
    if (!this.#runtime) return;
    const state = this.#runtime.getState();
    if (state === 'paused') {
      this.#runtime.resume();
      this.#pauseBtn.textContent = 'Pause';
    } else if (state === 'running' || state === 'countdown') {
      this.#runtime.pause();
      this.#pauseBtn.textContent = 'Resume';
    }
  }

  #restart() {
    if (!this.#micStarted || !this.#currentTokens) return;
    this.#buildAndStart();
  }

  #toMenu() {
    this.#teardownEngine();
    this.#showMenu();
  }

  #showMenu() {
    this.#playEl.hidden = true;
    this.#menuEl.hidden = false;
  }

  /** Tear down the runtime + renderer (keeps the mic running). Idempotent. */
  #teardownRuntime() {
    for (const unsub of this.#unsubs) unsub();
    this.#unsubs = [];
    if (this.#runtime) {
      try { this.#runtime.destroy(); } catch { /* already gone */ }
      this.#runtime = null;
    }
    if (this.#renderer) {
      try { this.#renderer.destroy(); } catch { /* already gone */ }
      this.#renderer = null;
    }
  }

  /** Stop and release everything the playing state owns, mic included. */
  #teardownEngine() {
    this.#activationId++; // abort any in-flight #start continuation
    this.#teardownRuntime();
    if (this.#micStarted) {
      detector.stop();
      mic.stop();
      this.#micStarted = false;
    }
  }
}

/** Build an exercise config the runtime can drive directly from tab tokens. */
function buildConfig(tokens, title, key) {
  return {
    id: `tab-${Date.now()}`,
    type: 'sequence',
    name: title,
    description: 'Read the tab — hit each note to advance.',
    context: { notes: tokens, harpKey: key },
    // Reading trainer: never sound the target — hearing it defeats the point,
    // and the blip was bleeding into the mic and auto-advancing the first note.
    audio: { playReference: false },
    evaluator: 'bend-accuracy',
    renderer: 'tab-reader',
    timing: { mode: 'player-driven', holdToAdvance: true, holdMs: HOLD_MS },
    loop: true,
    measures: [],
    skills: [],
  };
}

/** A promise that rejects after ms — for racing mic.start() against a timeout. */
function rejectAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

/**
 * Build a DOM fragment that renders tab notation with blow/draw/bend coloring —
 * the same visual language as the breath-ribbon, previewed in the menu.
 *
 * @param {string} notation
 * @returns {DocumentFragment}
 */
function notationFragment(notation) {
  const frag = document.createDocumentFragment();
  const tokens = notation.trim().split(/\s+/).filter(Boolean);
  for (const raw of tokens) {
    const span = document.createElement('span');
    const draw = raw.startsWith('-');
    span.className = `tt-tok tt-tok--${draw ? 'draw' : 'blow'}`;
    if (raw.includes("'")) span.classList.add('tt-tok--bend');
    span.textContent = raw;
    frag.append(span);
  }
  return frag;
}

export const tabTrainerView = new TabTrainerView();
