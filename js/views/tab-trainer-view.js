/**
 * tab-trainer-view.js — Harmonica tab-reading trainer.
 *
 *   Menu:    searchable song list + random run + paste-your-own.
 *   Playing: read the tab on the breath-ribbon, driven by tab-runner (onset-
 *            gated advance), with a live note-length dial and manual nav.
 *
 * Modeled on the post-P0-fix session-view: activation token guards every async
 * continuation, mic acquired with a visible wait + timeout before the engine
 * starts, one visibility mechanism, all bus subs and audio torn down on exit.
 */

import { qs } from '../utils/dom.js';
import { bus } from '../utils/event-bus.js';
import { store } from '../utils/store.js';
import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { getHarmonicaKey } from '../profile/profile.js';
import { STARTER_TABS, randomSequence } from '../utils/harmonica-tabs.js';
import { parseTab, TabParseError } from '../utils/harmonica-tab.js';
import { createTabRunner } from '../core/tab-runner.js';
import { createTabReaderRenderer } from '../renderers/tab-reader.js';

const MIC_TIMEOUT_MS = 10000;
const HOLD_MIN = 100;
const HOLD_MAX = 800;
const HOLD_DEFAULT = 250;
const HOLD_KEY = 'tab-hold-ms';
const TOLERANCE = 40; // cents — reading is hole-finding, not microtonal

class TabTrainerView {
  #viewEl = null;
  #menuEl = null;
  #playEl = null;
  #searchEl = null;
  #songListEl = null;
  #emptyEl = null;
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
  #prevBtn = null;
  #nextBtn = null;
  #holdRange = null;
  #holdValEl = null;

  #key = 'C';
  #holdMs = HOLD_DEFAULT;
  #activationId = 0;
  #unsubs = [];
  #micStarted = false;
  #runner = null;
  #renderer = null;
  #rafId = null;
  #paused = false;
  #lastPitchData = null;
  #currentTokens = null;
  #currentTitle = '';
  #onKeydown = null;

  init() {
    this.#viewEl = qs('#tab-trainer-view');
    this.#menuEl = qs('#tt-menu');
    this.#playEl = qs('#tt-play');
    this.#searchEl = qs('#tt-search');
    this.#songListEl = qs('#tt-song-list');
    this.#emptyEl = qs('#tt-empty');
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
    this.#prevBtn = qs('#tt-prev');
    this.#nextBtn = qs('#tt-next');
    this.#holdRange = qs('#tt-hold');
    this.#holdValEl = qs('#tt-hold-val');

    this.#holdMs = clampHold(store.get(HOLD_KEY) ?? HOLD_DEFAULT);
    this.#holdRange.min = String(HOLD_MIN);
    this.#holdRange.max = String(HOLD_MAX);
    this.#holdRange.value = String(this.#holdMs);
    this.#holdValEl.textContent = `${this.#holdMs}ms`;

    this.#searchEl.addEventListener('input', () => this.#renderList(this.#searchEl.value));
    this.#randomBtn.addEventListener('click', () => this.#startRandom());
    this.#pastePlayBtn.addEventListener('click', () => this.#startPaste());
    this.#pasteInput.addEventListener('input', () => this.#clearPasteError());
    this.#backBtn.addEventListener('click', () => this.#toMenu());
    this.#restartBtn.addEventListener('click', () => this.#restart());
    this.#pauseBtn.addEventListener('click', () => this.#togglePause());
    this.#prevBtn.addEventListener('click', () => this.#nav(-1));
    this.#nextBtn.addEventListener('click', () => this.#nav(1));
    this.#holdRange.addEventListener('input', () => this.#setHold(Number(this.#holdRange.value)));

    // Arrow keys step notes while playing (ignored in text fields).
    this.#onKeydown = (e) => {
      if (this.#playEl.hidden || !this.#viewEl.classList.contains('active')) return;
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.#nav(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.#nav(1); }
    };
    document.addEventListener('keydown', this.#onKeydown);
  }

  activate() {
    this.#key = getHarmonicaKey();
    this.#harpKeyEl.textContent = `${this.#key} harp`;
    this.#searchEl.value = '';
    this.#renderList('');
    this.#showMenu();
    this.#viewEl.classList.add('active');
  }

  deactivate() {
    this.#teardownEngine();
    this.#viewEl.classList.remove('active');
    this.#showMenu();
  }

  // --- menu ---------------------------------------------------------------

  #renderList(filter) {
    const q = filter.trim().toLowerCase();
    const matches = STARTER_TABS.filter(t => t.title.toLowerCase().includes(q));
    this.#songListEl.replaceChildren();
    for (const song of matches) {
      const li = document.createElement('li');
      const row = document.createElement('button');
      row.className = 'tt-row';
      row.dataset.id = song.id;

      const title = document.createElement('span');
      title.className = 'tt-row__title';
      title.textContent = song.title;

      const chips = document.createElement('span');
      chips.className = 'tt-row__chips';
      const keyChip = document.createElement('span');
      keyChip.className = 'tt-chip tt-chip--key';
      keyChip.textContent = song.key;
      const diffChip = document.createElement('span');
      diffChip.className = `tt-chip tt-chip--${song.difficulty}`;
      diffChip.textContent = song.difficulty;
      chips.append(keyChip, diffChip);

      row.append(title, chips);
      row.addEventListener('click', () => this.#startStarter(song.id));
      li.append(row);
      this.#songListEl.append(li);
    }
    this.#emptyEl.hidden = matches.length > 0;
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
    const song = STARTER_TABS.find(t => t.id === id);
    if (!song) return;
    this.#start(parseTab(song.tab, song.key), song.title, song.note ?? '');
  }

  #startRandom() {
    const tokens = randomSequence({ key: this.#key, holeRange: [1, 6], length: 8 });
    this.#start(tokens, 'Random run', 'A fresh random run each time.');
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
      if (err instanceof TabParseError) { this.#showPasteError(err.message); return; }
      throw err;
    }
    if (tokens.length === 0) { this.#showPasteError('No notes found.'); return; }
    this.#clearPasteError();
    this.#start(tokens, 'Your tab', '');
  }

  // --- playing ------------------------------------------------------------

  async #start(tokens, title, note) {
    const token = ++this.#activationId;
    this.#currentTokens = tokens;
    this.#currentTitle = title;

    this.#playTitleEl.textContent = title;
    this.#playProgressEl.textContent = `0 / ${tokens.length}`;
    this.#statusEl.textContent = 'Waiting for microphone…';
    this.#pauseBtn.textContent = 'Pause';
    this.#paused = false;
    this.#menuEl.hidden = true;
    this.#playEl.hidden = false;

    if (!this.#micStarted) {
      const micPromise = mic.start();
      try {
        await Promise.race([micPromise, rejectAfter(MIC_TIMEOUT_MS)]);
      } catch {
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

    // Let the now-visible canvas get its layout before measuring it.
    await new Promise(r => requestAnimationFrame(r));
    if (token !== this.#activationId) return;

    this.#statusEl.textContent = note;
    this.#buildAndStart();
  }

  /** Build a fresh runner + renderer and start the rAF loop. */
  #buildAndStart() {
    this.#teardownRuntime();
    const tokens = this.#currentTokens;

    this.#renderer = createTabReaderRenderer();
    this.#renderer.init(this.#canvasEl, { context: { notes: tokens }, timing: { holdMs: this.#holdMs } });

    this.#runner = createTabRunner(tokens, {
      tolerance: TOLERANCE,
      holdMs: this.#holdMs,
      onAdvance: () => this.#updateProgress(),
      onComplete: () => { this.#runner?.reset(); this.#renderer?.onLoopRestart?.(); this.#updateProgress(); },
    });

    this.#unsubs.push(
      bus.on('pitch', (data) => {
        if (this.#paused) return;
        this.#lastPitchData = data;
        this.#runner?.feedPitch(data);
      }),
      bus.on('silence', () => {
        if (this.#paused) return;
        this.#lastPitchData = null;
        this.#runner?.feedSilence();
      }),
    );

    this.#updateProgress();
    this.#startRaf();
  }

  #startRaf() {
    const loop = () => {
      this.#rafId = requestAnimationFrame(loop);
      if (!this.#renderer || !this.#runner) return;
      const rs = this.#runner.getRenderState();
      const target = this.#currentTokens[rs.cursor] ?? null;
      this.#renderer.update({
        cursor: rs.cursor,
        noteCount: rs.noteCount,
        targetNote: target,
        pitchData: this.#lastPitchData,
        holdProgress: rs.holdProgress,
        evaluatorResult: rs.absCents != null
          ? { absCents: rs.absCents, inTune: rs.absCents <= TOLERANCE }
          : null,
        exerciseState: this.#paused ? 'paused' : 'running',
      });
    };
    this.#rafId = requestAnimationFrame(loop);
  }

  #updateProgress() {
    if (!this.#runner) return;
    this.#playProgressEl.textContent = `${this.#runner.getCursor()} / ${this.#runner.getNoteCount()}`;
  }

  #togglePause() {
    this.#paused = !this.#paused;
    this.#pauseBtn.textContent = this.#paused ? 'Resume' : 'Pause';
  }

  #restart() {
    if (!this.#micStarted || !this.#runner) return;
    this.#runner.reset();
    this.#paused = false;
    this.#pauseBtn.textContent = 'Pause';
    this.#updateProgress();
  }

  #nav(dir) {
    if (!this.#runner) return;
    if (dir < 0) this.#runner.prev();
    else this.#runner.next();
    this.#updateProgress();
  }

  #setHold(value) {
    this.#holdMs = clampHold(value);
    this.#holdValEl.textContent = `${this.#holdMs}ms`;
    this.#runner?.setHoldMs(this.#holdMs);
    store.set(HOLD_KEY, this.#holdMs);
  }

  #toMenu() {
    this.#teardownEngine();
    this.#showMenu();
  }

  #showMenu() {
    this.#playEl.hidden = true;
    this.#menuEl.hidden = false;
  }

  /** Tear down the runner, renderer, rAF and bus subs (keeps the mic). */
  #teardownRuntime() {
    if (this.#rafId != null) { cancelAnimationFrame(this.#rafId); this.#rafId = null; }
    for (const unsub of this.#unsubs) unsub();
    this.#unsubs = [];
    this.#runner = null;
    if (this.#renderer) {
      try { this.#renderer.destroy(); } catch { /* already gone */ }
      this.#renderer = null;
    }
    this.#lastPitchData = null;
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

/** A promise that rejects after ms — for racing mic.start() against a timeout. */
function rejectAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

function clampHold(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return HOLD_DEFAULT;
  return Math.max(HOLD_MIN, Math.min(HOLD_MAX, Math.round(n / 50) * 50));
}

export const tabTrainerView = new TabTrainerView();
