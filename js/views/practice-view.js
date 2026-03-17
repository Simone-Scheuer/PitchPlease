import { bus } from '../utils/event-bus.js';
import { qs } from '../utils/dom.js';
import { store } from '../utils/store.js';
import { ROOT_NAMES, SCALE_LABELS } from '../utils/scales.js';
import { SESSION_TEMPLATES, getTemplate, buildSustainedExercise, buildReactiveExercise, buildFreePlayExercise } from '../core/session-templates.js';
import { createSequenceExercise, createEchoExercise, applyDefaults } from '../core/exercise-schema.js';
import { hasProfile, ensureProfile, getOctaveRange, setOctaveRange, getHarmonicaKey, setHarmonicaKey, getHoldDuration, setHoldDuration, getExerciseOptions, setExerciseOptions } from '../profile/profile.js';
import { HARMONICA_KEYS, getBendTargets } from '../utils/harmonica.js';
import { generateSession, summarizeSession } from '../generation/session-generator.js';
import { getHistory } from '../profile/history.js';

const QUICK_START_KEY = 'quick-start';
const TODAY_SESSION_KEY = 'today-session';

const STANDALONE_EXERCISES = [
  { id: 'long-tone',    label: 'Long Tone',     desc: 'Hold notes steady',         builder: 'sustained' },
  { id: 'drone-match',  label: 'Drone Match',    desc: 'Match a drone tone',        builder: 'sustained-drone' },
  { id: 'scale-runner', label: 'Scale Runner',   desc: 'Play through a scale',      builder: 'sequence' },
  { id: 'random-note',  label: 'Random Note',    desc: 'Find notes by ear',         builder: 'reactive' },
  { id: 'echo-mode',    label: 'Echo Mode',      desc: 'Listen and repeat',         builder: 'echo' },
  { id: 'free-play',    label: 'Free Play',      desc: 'Play freely with graph',    builder: 'free' },
  { id: 'bend-trainer', label: 'Bend Trainer',   desc: 'Practice harmonica bends',  builder: 'bend' },
  { id: 'pitch-trace',  label: 'Pitch Trace',    desc: 'Follow a pitch shape',      builder: 'trace' },
];

/** Which options each exercise type exposes in its options panel. */
const EXERCISE_OPTIONS_CONFIG = {
  'long-tone':    [{ key: 'drone', label: 'Drone', choices: [['off','Off'], ['root','Root Note']] }],
  'drone-match':  [
    { key: 'pattern', label: 'Pattern', choices: [['ascending','Ascending'], ['descending','Descending'], ['up-and-back','Up & Back']] },
    { key: 'drone', label: 'Drone', choices: [['follow','Follow Notes'], ['root','Root Only']] },
    { key: 'loop', label: 'Loop', choices: [['true','On'], ['false','Off']] },
  ],
  'scale-runner': [
    { key: 'pattern', label: 'Pattern', choices: [['ascending','Ascending'], ['descending','Descending'], ['up-and-back','Up & Back'], ['random','Random']] },
    { key: 'drone', label: 'Drone', choices: [['off','Off'], ['root','Root'], ['follow','Follow Notes']] },
    { key: 'loop', label: 'Loop', choices: [['true','On'], ['false','Off']] },
  ],
  'random-note':  [{ key: 'drone', label: 'Drone', choices: [['off','Off'], ['root','Root Note']] }],
  'echo-mode':    [{ key: 'difficulty', label: 'Difficulty', choices: [['easy','Easy'], ['medium','Medium'], ['hard','Hard']] }],
  'free-play':    [],
  'bend-trainer': [{ key: 'drone', label: 'Drone', choices: [['off','Off'], ['root','Root Note']] }],
  'pitch-trace':  [{ key: 'traceShape', label: 'Shape', choices: [['wave','Wave'], ['zigzag','Zigzag']] }],
};

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
  #harpKeySelect;
  #holdDurationSelect;
  #exercisesEl;
  #activeExerciseCard = null;
  #activeOptionsPanel = null;
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
    this.#harpKeySelect = qs('#practice-harp-key');
    this.#holdDurationSelect = qs('#practice-hold-duration');
    this.#exercisesEl = qs('#practice-exercises');
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
    this.#populateHarpKeySelect();
    this.#applySettings();
    this.#renderTemplates();
    this.#renderExercises();

    // Load or generate today's session
    this.#loadTodaySession();

    // Wire event listeners
    this.#rootSelect.addEventListener('change', () => this.#saveSettings());
    this.#scaleSelect.addEventListener('change', () => this.#saveSettings());
    this.#octaveLowSelect.addEventListener('change', () => this.#saveSettings());
    this.#octaveHighSelect.addEventListener('change', () => this.#saveSettings());
    if (this.#harpKeySelect) {
      this.#harpKeySelect.addEventListener('change', () => this.#saveHarpKey());
    }
    if (this.#holdDurationSelect) {
      this.#holdDurationSelect.addEventListener('change', () => this.#saveHoldDuration());
    }
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

  #populateHarpKeySelect() {
    if (!this.#harpKeySelect) return;
    this.#harpKeySelect.innerHTML = '';
    for (const key of HARMONICA_KEYS) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      this.#harpKeySelect.appendChild(opt);
    }
    // Set initial value from profile
    this.#harpKeySelect.value = getHarmonicaKey();
  }

  #applySettings() {
    this.#rootSelect.value = this.#settings.root;
    this.#scaleSelect.value = this.#settings.scale;
    this.#octaveLowSelect.value = this.#settings.octaveLow ?? DEFAULTS.octaveLow;
    this.#octaveHighSelect.value = this.#settings.octaveHigh ?? DEFAULTS.octaveHigh;
    if (this.#harpKeySelect) {
      this.#harpKeySelect.value = getHarmonicaKey();
    }
    if (this.#holdDurationSelect) {
      this.#holdDurationSelect.value = getHoldDuration();
    }
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

  #saveHarpKey() {
    if (!this.#harpKeySelect) return;
    const key = this.#harpKeySelect.value;
    setHarmonicaKey(key);

    // Invalidate today's cached session (it may include harmonica exercises)
    const dateStr = todayDateStr();
    const cacheKey = `${TODAY_SESSION_KEY}-${dateStr}`;
    this.#clearSessionCache(cacheKey);
    this.#generateAndCacheSession(cacheKey);
  }

  #saveHoldDuration() {
    if (!this.#holdDurationSelect) return;
    const ms = parseInt(this.#holdDurationSelect.value, 10);
    if ([300, 600, 1000, 2000].includes(ms)) {
      setHoldDuration(ms);
    }
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
  // Exercise cards
  // -------------------------------------------------------------------------

  #renderExercises() {
    if (!this.#exercisesEl) return;
    this.#exercisesEl.innerHTML = '';

    for (const ex of STANDALONE_EXERCISES) {
      const card = document.createElement('button');
      card.className = 'practice-exercise-card';
      card.dataset.exerciseId = ex.id;
      card.addEventListener('click', () => this.#toggleOptionsPanel(ex, card));

      const label = document.createElement('span');
      label.className = 'practice-exercise-label';
      label.textContent = ex.label;

      const desc = document.createElement('span');
      desc.className = 'practice-exercise-desc';
      desc.textContent = ex.desc;

      card.appendChild(label);
      card.appendChild(desc);
      this.#exercisesEl.appendChild(card);
    }
  }

  #toggleOptionsPanel(exerciseDef, card) {
    // Close existing panel if same card
    if (this.#activeExerciseCard === card) {
      this.#closeOptionsPanel();
      return;
    }
    this.#closeOptionsPanel();

    const optionsDef = EXERCISE_OPTIONS_CONFIG[exerciseDef.id] || [];
    const saved = getExerciseOptions(exerciseDef.id);

    // Mark card active
    card.classList.add('active');
    this.#activeExerciseCard = card;

    // Build panel
    const panel = document.createElement('div');
    panel.className = 'exercise-options-panel open';

    const grid = document.createElement('div');
    grid.className = 'exercise-options-grid';

    // Render option selects
    for (const opt of optionsDef) {
      const row = document.createElement('div');
      row.className = 'exercise-option-row';

      const lbl = document.createElement('label');
      lbl.className = 'exercise-option-label';
      lbl.textContent = opt.label;

      const sel = document.createElement('select');
      sel.className = 'exercise-option-select';
      sel.dataset.optionKey = opt.key;

      for (const [value, text] of opt.choices) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = text;
        sel.appendChild(o);
      }

      // Apply saved value
      const savedVal = saved[opt.key];
      if (savedVal != null) sel.value = String(savedVal);

      row.appendChild(lbl);
      row.appendChild(sel);
      grid.appendChild(row);
    }

    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'exercise-start-btn';
    startBtn.textContent = optionsDef.length > 0 ? 'Start' : `Start ${exerciseDef.label}`;
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#launchExercise(exerciseDef, panel);
    });

    grid.appendChild(startBtn);
    panel.appendChild(grid);

    // Insert panel after the card in the grid
    card.after(panel);
    this.#activeOptionsPanel = panel;
  }

  #closeOptionsPanel() {
    if (this.#activeOptionsPanel) {
      this.#activeOptionsPanel.remove();
      this.#activeOptionsPanel = null;
    }
    if (this.#activeExerciseCard) {
      this.#activeExerciseCard.classList.remove('active');
      this.#activeExerciseCard = null;
    }
  }

  #launchExercise(exerciseDef, panel) {
    this.#saveSettings();

    // Read options from panel selects
    const opts = {};
    for (const sel of panel.querySelectorAll('.exercise-option-select')) {
      const key = sel.dataset.optionKey;
      let val = sel.value;
      // Coerce booleans
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      opts[key] = val;
    }

    // Save to profile
    setExerciseOptions(exerciseDef.id, opts);

    const { root, scale, octaveLow, octaveHigh } = this.#settings;
    const harpKey = getHarmonicaKey();
    const oRange = [octaveLow, octaveHigh];

    const exerciseConfig = this.#buildStandaloneExercise(
      exerciseDef.id, root, scale, octaveLow, octaveHigh, harpKey, oRange, opts,
    );

    if (!exerciseConfig) return;

    this.#closeOptionsPanel();

    const sessionConfig = {
      id: `standalone-${exerciseDef.id}`,
      name: exerciseDef.label,
      description: exerciseDef.desc,
      blocks: [{
        exercise: exerciseConfig,
        duration: 300_000,
        label: exerciseDef.label,
        phase: 'play',
      }],
      transitions: 'none',
      totalDuration: 300_000,
    };

    bus.emit('session:activate', { config: sessionConfig });
  }

  #buildStandaloneExercise(id, root, scale, octaveLow, octaveHigh, harpKey, oRange, opts = {}) {
    const holdMs = getHoldDuration();

    switch (id) {
      case 'long-tone':
        return buildSustainedExercise('long-tone', root, scale, {
          label: 'Long Tone',
          description: 'Hold a comfortable note, focus on stability',
          octaveRange: oRange,
          drone: opts.drone || 'off',
        });

      case 'drone-match':
        return buildSustainedExercise('drone-match', root, scale, {
          label: 'Drone Match',
          description: `Match the ${root} drone — ${opts.pattern || 'ascending'} scale`,
          octaveRange: oRange,
          drone: opts.drone || 'follow',
          pattern: opts.pattern || 'ascending',
          loop: opts.loop !== false,
          holdMs,
        });

      case 'scale-runner':
        return createSequenceExercise({
          root,
          scale,
          pattern: opts.pattern || 'ascending',
          octaveLow,
          octaveHigh,
          drone: opts.drone || 'off',
          timing: { mode: 'player-driven', holdToAdvance: true, holdMs },
        });

      case 'random-note':
        return buildReactiveExercise('random-note', root, scale, {
          label: 'Random Note',
          description: `Find random notes from ${root} ${scale}`,
          octaveRange: oRange,
          holdMs,
          drone: opts.drone || 'off',
        });

      case 'echo-mode':
        return createEchoExercise({
          root,
          scale,
          difficulty: opts.difficulty || 'easy',
          phraseCount: 5,
          octaveLow,
          octaveHigh,
        });

      case 'free-play':
        return buildFreePlayExercise(root, scale, {
          label: 'Free Play',
          description: `Play freely in ${root} ${scale}`,
          octaveRange: oRange,
          drone: { voice: 'triangle', gain: 0.6 },
        });

      case 'bend-trainer': {
        const bendTargets = getBendTargets(harpKey, { maxStepDown: null });
        const bendNotes = bendTargets.map(b => ({
          note: b.note,
          midi: b.midi,
          label: b.label,
        }));

        if (bendNotes.length === 0) return null;

        const bendDrone = opts.drone === 'root'
          ? { note: root, octave: oRange[0], voice: 'triangle', gain: 0.6 }
          : undefined;

        return applyDefaults({
          id: `bend-standalone-${harpKey}`,
          type: 'sustained',
          name: `Bend Trainer (${harpKey} Harp)`,
          description: `Practice bends on ${harpKey} harmonica`,
          context: {
            notes: bendNotes,
            root,
            scale,
            octaveRange: oRange,
            harpKey,
          },
          evaluator: 'bend-accuracy',
          renderer: 'bend-meter',
          timing: { mode: 'player-driven', holdToAdvance: true, holdMs: 2000 },
          audio: bendDrone ? { drone: bendDrone } : undefined,
          loop: true,
          measures: ['cents-avg', 'hold-steady-ms'],
          skills: ['pitchAccuracy', 'pitchStability'],
        });
      }

      case 'pitch-trace':
        return applyDefaults({
          id: `trace-${root}-${scale}-${octaveLow}-${octaveHigh}`,
          type: 'sustained',
          name: `Pitch Trace — ${root} ${scale}`,
          description: `Follow a pitch contour in ${root} ${scale}`,
          context: {
            scale,
            root,
            octaveRange: oRange,
            traceShape: opts.traceShape || 'wave',
          },
          evaluator: 'stability',
          renderer: 'pitch-trace',
          timing: { mode: 'indefinite' },
          loop: false,
          measures: ['cents-avg', 'hold-steady-ms'],
          skills: ['pitchAccuracy', 'pitchStability'],
        });

      default:
        return null;
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
    const harpKey = getHarmonicaKey();
    const config = getTemplate(templateId, root, scale, octaveLow, octaveHigh, { harpKey });
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
      timing: { mode: 'player-driven', holdToAdvance: true, holdMs: getHoldDuration() },
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
