/**
 * tab-trainer-view.js — Harmonica tab-reading trainer.
 *
 * Two states in one view:
 *   - Menu:    pick a source (starter tab, random run, or pasted notation).
 *   - Playing: read the tab on a scrolling breath-ribbon, ball advances on each
 *              note you hit. (Engine wiring lands in step 3b.)
 *
 * Modeled on the post-P0-fix session-view: activation token guards every async
 * continuation, mic acquired with a visible wait + timeout before entering the
 * playing UI, one visibility mechanism (.active), all bus subs torn down.
 */

import { qs } from '../utils/dom.js';
import { getHarmonicaKey } from '../profile/profile.js';
import { STARTER_TABS, randomSequence } from '../utils/harmonica-tabs.js';
import { parseTab, stringifyTab, TabParseError } from '../utils/harmonica-tab.js';

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
  }

  activate() {
    this.#key = getHarmonicaKey();
    this.#harpKeyEl.textContent = `${this.#key} harp`;
    this.#renderStarters();
    this.#toMenu();
    this.#viewEl.classList.add('active');
  }

  deactivate() {
    // Engine teardown (mic/detector/runner/bus) lands in 3b; menu state is sync.
    this.#viewEl.classList.remove('active');
    this.#toMenu();
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
    // Starter tabs are written for C; honor their own key, not the profile's.
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
   * Enter the playing state with a parsed token sequence.
   * 3a: swaps to the play panel and shows the source. The mic/runtime/renderer
   * wiring lands in 3b — for now this proves the menu→play transition.
   *
   * @param {import('../utils/harmonica-tab.js').TabToken[]} tokens
   * @param {string} title
   */
  #start(tokens, title) {
    this.#playTitleEl.textContent = title;
    this.#playProgressEl.textContent = `0 / ${tokens.length}`;
    this.#statusEl.textContent = stringifyTab(tokens);
    this.#menuEl.hidden = true;
    this.#playEl.hidden = false;
    // eslint-disable-next-line no-console
    console.log('[tab-trainer] start', title, tokens);
  }

  #toMenu() {
    this.#playEl.hidden = true;
    this.#menuEl.hidden = false;
  }
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
