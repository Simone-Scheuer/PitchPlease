import { bus } from '../utils/event-bus.js';
import { qs } from '../utils/dom.js';
import { store } from '../utils/store.js';
import { ROOT_NAMES, SCALE_LABELS } from '../utils/scales.js';
import { SESSION_TEMPLATES, getTemplate } from '../core/session-templates.js';
import { createSequenceExercise } from '../core/exercise-schema.js';
import { hasProfile, ensureProfile, getOctaveRange, setOctaveRange } from '../profile/profile.js';
import { generateSession, summarizeSession } from '../generation/session-generator.js';
import { getHistory } from '../profile/history.js';

const QUICK_START_KEY = 'quick-start';
const TODAY_SESSION_KEY = 'today-session';

const DEFAULTS = {
  root: 'C',
  scale: 'major',
  octaveLow: 3,
  octaveHigh: 5,
};

/**
 * Get today's date as a string for cache key.
 * @returns {string} e.g. "2026-03-17"
 */
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class PracticeView {
  #viewEl;
  #onboardingOverlay;
  #onboardingStartBtn;
  #todayBtn;
  #todaySubEl;
  #todayExercisesEl;
  #shuffleBtn;
  #templatesEl;
  #rootSelect;
  #scaleSelect;
  #octaveLowSelect;
  #octaveHighSelect;
  #goBtn;
  #settings;
  #cachedSession = null;

  init() {
    this.#viewEl = qs('#practice-view');
    this.#onboardingOverlay = qs('#onboarding-overlay');
    this.#onboardingStartBtn = qs('#onboarding-start');
    this.#todayBtn = qs('#practice-start-today');
    this.#todaySubEl = qs('.practice-today-sub');
    this.#todayExercisesEl = qs('.practice-today-exercises');
    this.#shuffleBtn = qs('#practice-shuffle');
    this.#templatesEl = qs('#practice-templates');
    this.#rootSelect = qs('#practice-root');
    this.#scaleSelect = qs('#practice-scale');
    this.#octaveLowSelect = qs('#practice-octave-low');
    this.#octaveHighSelect = qs('#practice-octave-high');
    this.#goBtn = qs('#practice-quick-go');

    // Check for first launch: no profile AND no history
    const isFirstLaunch = !hasProfile() && getHistory(90).length === 0;

    // Ensure profile exists (auto-creates with defaults on first launch)
    ensureProfile();

    // Show onboarding overlay for first-time users
    if (isFirstLaunch && this.#onboardingOverlay) {
      this.#onboardingOverlay.hidden = false;
      if (this.#onboardingStartBtn) {
        this.#onboardingStartBtn.addEventListener('click', () => {
          this.#onboardingOverlay.hidden = true;
        });
      }
    }

    // Load settings, seeding octave range from profile if no quick-start saved
    this.#settings = store.get(QUICK_START_KEY) || { ...DEFAULTS };
    const profileRange = getOctaveRange();
    if (!store.get(QUICK_START_KEY)) {
      this.#settings.octaveLow = profileRange[0];
      this.#settings.octaveHigh = profileRange[1];
    }

    this.#populateRootSelect();
    this.#populateScaleSelect();
    this.#populateOctaveSelects();
    this.#applySettings();
    this.#renderTemplates();

    // Load or generate today's session
    this.#loadTodaySession();

    // Wire event listeners
    this.#rootSelect.addEventListener('change', () => this.#saveSettings());
    this.#scaleSelect.addEventListener('change', () => this.#saveSettings());
    this.#octaveLowSelect.addEventListener('change', () => this.#saveSettings());
    this.#octaveHighSelect.addEventListener('change', () => this.#saveSettings());
    this.#todayBtn.addEventListener('click', () => this.#startToday());
    this.#goBtn.addEventListener('click', () => this.#startQuick());

    if (this.#shuffleBtn) {
      this.#shuffleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent today button click
        this.#shuffleTodaySession();
      });
    }
  }

  activate() {
    this.#viewEl.hidden = false;
    this.#viewEl.classList.add('active');
    // Refresh today's session preview on re-activation (in case history changed)
    this.#loadTodaySession();
  }

  deactivate() {
    this.#viewEl.classList.remove('active');
    this.#viewEl.hidden = true;
  }

  // -------------------------------------------------------------------------
  // Today's Session — generation, caching, preview
  // -------------------------------------------------------------------------

  /**
   * Load today's cached session, or generate a new one.
   */
  #loadTodaySession() {
    const dateStr = todayDateStr();
    const cacheKey = `${TODAY_SESSION_KEY}-${dateStr}`;

    // Try sessionStorage first (per-tab, survives reloads within the day)
    const cached = this.#getSessionCache(cacheKey);
    if (cached) {
      this.#cachedSession = cached;
      this.#updateTodayPreview();
      return;
    }

    // Generate fresh session
    this.#generateAndCacheSession(cacheKey);
  }

  /**
   * Generate a new session and cache it.
   * @param {string} cacheKey
   */
  #generateAndCacheSession(cacheKey) {
    const { root, scale, octaveLow, octaveHigh } = this.#settings;

    const session = generateSession({
      root,
      scale,
      octaveLow,
      octaveHigh,
    });

    this.#cachedSession = session;
    this.#setSessionCache(cacheKey, session);
    this.#updateTodayPreview();
  }

  /**
   * Shuffle: regenerate today's session (explicit user action).
   */
  #shuffleTodaySession() {
    const dateStr = todayDateStr();
    const cacheKey = `${TODAY_SESSION_KEY}-${dateStr}`;

    // Clear cache and regenerate
    this.#clearSessionCache(cacheKey);

    const { root, scale, octaveLow, octaveHigh } = this.#settings;
    const session = generateSession({
      root,
      scale,
      octaveLow,
      octaveHigh,
    });

    this.#cachedSession = session;
    this.#setSessionCache(cacheKey, session);
    this.#updateTodayPreview();

    // Brief visual feedback on the shuffle button
    if (this.#shuffleBtn) {
      this.#shuffleBtn.classList.add('practice-shuffle-spin');
      setTimeout(() => {
        this.#shuffleBtn.classList.remove('practice-shuffle-spin');
      }, 400);
    }
  }

  /**
   * Update the Today's Practice card with session preview info.
   */
  #updateTodayPreview() {
    if (!this.#cachedSession) {
      this.#todaySubEl.textContent = 'Tap to generate';
      if (this.#todayExercisesEl) {
        this.#todayExercisesEl.innerHTML = '';
      }
      return;
    }

    const summary = summarizeSession(this.#cachedSession);
    this.#todaySubEl.textContent = `${summary.name} \u00B7 ${summary.duration}`;

    // Render exercise list preview
    if (this.#todayExercisesEl) {
      this.#todayExercisesEl.innerHTML = '';
      for (const exerciseName of summary.exercises) {
        const item = document.createElement('span');
        item.className = 'practice-today-exercise-item';
        item.textContent = exerciseName;
        this.#todayExercisesEl.appendChild(item);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Session cache helpers (sessionStorage)
  // -------------------------------------------------------------------------

  #getSessionCache(key) {
    try {
      const raw = sessionStorage.getItem(`pp:${key}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  #setSessionCache(key, session) {
    try {
      sessionStorage.setItem(`pp:${key}`, JSON.stringify(session));
    } catch {
      // sessionStorage full or unavailable — ignore
    }
  }

  #clearSessionCache(key) {
    try {
      sessionStorage.removeItem(`pp:${key}`);
    } catch {
      // ignore
    }
  }

  // -------------------------------------------------------------------------
  // Selectors
  // -------------------------------------------------------------------------

  #populateRootSelect() {
    this.#rootSelect.innerHTML = '';
    for (const name of ROOT_NAMES) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.#rootSelect.appendChild(opt);
    }
  }

  #populateScaleSelect() {
    this.#scaleSelect.innerHTML = '';
    for (const [key, label] of Object.entries(SCALE_LABELS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      this.#scaleSelect.appendChild(opt);
    }
  }

  #populateOctaveSelects() {
    for (const sel of [this.#octaveLowSelect, this.#octaveHighSelect]) {
      sel.innerHTML = '';
      for (let o = 1; o <= 7; o++) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = `${o}`;
        sel.appendChild(opt);
      }
    }
  }

  #applySettings() {
    this.#rootSelect.value = this.#settings.root;
    this.#scaleSelect.value = this.#settings.scale;
    this.#octaveLowSelect.value = this.#settings.octaveLow ?? DEFAULTS.octaveLow;
    this.#octaveHighSelect.value = this.#settings.octaveHigh ?? DEFAULTS.octaveHigh;
  }

  #saveSettings() {
    const octaveLow = parseInt(this.#octaveLowSelect.value, 10);
    let octaveHigh = parseInt(this.#octaveHighSelect.value, 10);
    if (octaveHigh < octaveLow) {
      octaveHigh = octaveLow;
      this.#octaveHighSelect.value = octaveHigh;
    }
    this.#settings = {
      root: this.#rootSelect.value,
      scale: this.#scaleSelect.value,
      octaveLow,
      octaveHigh,
    };
    store.set(QUICK_START_KEY, this.#settings);

    // Sync octave range to profile
    setOctaveRange(octaveLow, octaveHigh);

    // Invalidate today's cached session when settings change —
    // regenerate on next activation
    const dateStr = todayDateStr();
    const cacheKey = `${TODAY_SESSION_KEY}-${dateStr}`;
    this.#clearSessionCache(cacheKey);
    this.#generateAndCacheSession(cacheKey);
  }

  // -------------------------------------------------------------------------
  // Template cards
  // -------------------------------------------------------------------------

  #renderTemplates() {
    this.#templatesEl.innerHTML = '';
    for (const tmpl of SESSION_TEMPLATES) {
      const card = document.createElement('button');
      card.className = 'practice-template';
      card.addEventListener('click', () => this.#startTemplate(tmpl.id));

      const top = document.createElement('div');
      top.className = 'practice-template-top';

      const name = document.createElement('span');
      name.className = 'practice-template-name';
      name.textContent = tmpl.name;

      const badge = document.createElement('span');
      badge.className = 'practice-template-duration';
      badge.textContent = tmpl.duration;

      top.appendChild(name);
      top.appendChild(badge);

      const desc = document.createElement('div');
      desc.className = 'practice-template-desc';
      desc.textContent = tmpl.description;

      const tagsEl = document.createElement('div');
      tagsEl.className = 'practice-template-tags';
      for (const tag of tmpl.tags) {
        const pill = document.createElement('span');
        pill.className = 'practice-template-tag';
        pill.textContent = tag;
        tagsEl.appendChild(pill);
      }

      card.appendChild(top);
      card.appendChild(desc);
      card.appendChild(tagsEl);
      this.#templatesEl.appendChild(card);
    }
  }

  // -------------------------------------------------------------------------
  // Launch actions
  // -------------------------------------------------------------------------

  #startToday() {
    this.#saveSettings();

    // Use cached generated session
    if (this.#cachedSession) {
      bus.emit('session:activate', { config: this.#cachedSession });
      return;
    }

    // Fallback: generate now
    const { root, scale, octaveLow, octaveHigh } = this.#settings;
    const config = generateSession({ root, scale, octaveLow, octaveHigh });
    this.#cachedSession = config;
    bus.emit('session:activate', { config });
  }

  #startTemplate(templateId) {
    this.#saveSettings();
    const { root, scale, octaveLow, octaveHigh } = this.#settings;
    const config = getTemplate(templateId, root, scale, octaveLow, octaveHigh);
    if (config) {
      bus.emit('session:activate', { config });
    }
  }

  #startQuick() {
    this.#saveSettings();
    const { root, scale, octaveLow, octaveHigh } = this.#settings;

    const exercise = createSequenceExercise({
      root,
      scale,
      pattern: 'ascending',
      octaveLow,
      octaveHigh,
    });

    const config = {
      id: `quick-${root}-${scale}`,
      name: `Quick ${root} ${scale}`,
      description: `Scale runner in ${root} ${scale}`,
      tags: ['quick-start'],
      blocks: [
        {
          exercise,
          duration: 300_000,
          label: `${root} ${scale} Scale`,
          phase: 'develop',
        },
      ],
      transitions: 'none',
      totalDuration: 300_000,
    };

    bus.emit('session:activate', { config });
  }
}

export const practiceView = new PracticeView();
