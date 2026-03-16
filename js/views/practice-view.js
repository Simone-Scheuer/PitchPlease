import { bus } from '../utils/event-bus.js';
import { qs } from '../utils/dom.js';
import { store } from '../utils/store.js';
import { ROOT_NAMES, SCALE_LABELS } from '../utils/scales.js';
import { SESSION_TEMPLATES, getTemplate } from '../core/session-templates.js';
import { createSequenceExercise } from '../core/exercise-schema.js';

const QUICK_START_KEY = 'quick-start';

const DEFAULTS = {
  root: 'C',
  scale: 'major',
  octaveLow: 3,
  octaveHigh: 5,
};

class PracticeView {
  #viewEl;
  #todayBtn;
  #templatesEl;
  #rootSelect;
  #scaleSelect;
  #octaveLowSelect;
  #octaveHighSelect;
  #goBtn;
  #settings;

  init() {
    this.#viewEl = qs('#practice-view');
    this.#todayBtn = qs('#practice-start-today');
    this.#templatesEl = qs('#practice-templates');
    this.#rootSelect = qs('#practice-root');
    this.#scaleSelect = qs('#practice-scale');
    this.#octaveLowSelect = qs('#practice-octave-low');
    this.#octaveHighSelect = qs('#practice-octave-high');
    this.#goBtn = qs('#practice-quick-go');

    this.#settings = store.get(QUICK_START_KEY) || { ...DEFAULTS };

    this.#populateRootSelect();
    this.#populateScaleSelect();
    this.#populateOctaveSelects();
    this.#applySettings();
    this.#renderTemplates();

    // Wire event listeners
    this.#rootSelect.addEventListener('change', () => this.#saveSettings());
    this.#scaleSelect.addEventListener('change', () => this.#saveSettings());
    this.#octaveLowSelect.addEventListener('change', () => this.#saveSettings());
    this.#octaveHighSelect.addEventListener('change', () => this.#saveSettings());
    this.#todayBtn.addEventListener('click', () => this.#startToday());
    this.#goBtn.addEventListener('click', () => this.#startQuick());
  }

  activate() {
    this.#viewEl.hidden = false;
    this.#viewEl.classList.add('active');
  }

  deactivate() {
    this.#viewEl.classList.remove('active');
    this.#viewEl.hidden = true;
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
    const { root, scale, octaveLow, octaveHigh } = this.#settings;
    const config = getTemplate('morning-practice', root, scale, octaveLow, octaveHigh);
    if (config) {
      bus.emit('session:activate', { config });
    }
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
