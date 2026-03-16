import { bus } from '../utils/event-bus.js';
import { qs, qsa } from '../utils/dom.js';
import { STARTER_SONGS, songDuration } from '../utils/song-data.js';
import { SCALE_LABELS, ROOT_NAMES } from '../utils/scales.js';
import { generateExercise, PATTERNS, DURATION_PRESETS } from '../utils/exercise-generator.js';
import { store } from '../utils/store.js';

const DEFAULTS = {
  root: 'C',
  scale: 'major',
  octaveLow: 3,
  octaveHigh: 5,
  duration: 'long',
  pattern: 'ascending',
};

class LibraryView {
  #practicePanel;
  #songList;
  #tabBtns;
  #settings;

  // Practice controls
  #rootSelect;
  #scaleSelect;
  #octaveLowSelect;
  #octaveHighSelect;
  #durationSelect;
  #patternSelect;
  #startBtn;

  init() {
    this.#practicePanel = qs('#practice-panel');
    this.#songList = qs('#song-list');
    this.#tabBtns = qsa('.library__tab');

    // Load persisted settings or defaults
    this.#settings = store.get('practice-settings') || { ...DEFAULTS };

    // Tab switching
    for (const btn of this.#tabBtns) {
      btn.addEventListener('click', () => this.#switchTab(btn.dataset.tab));
    }

    // Practice controls
    this.#rootSelect = qs('#practice-root');
    this.#scaleSelect = qs('#practice-scale');
    this.#octaveLowSelect = qs('#practice-octave-low');
    this.#octaveHighSelect = qs('#practice-octave-high');
    this.#durationSelect = qs('#practice-duration');
    this.#patternSelect = qs('#practice-pattern');
    this.#startBtn = qs('#practice-start-btn');

    this.#populateSelects();
    this.#applySettings();

    // Save on change
    const onChange = () => this.#saveSettings();
    this.#rootSelect.addEventListener('change', onChange);
    this.#scaleSelect.addEventListener('change', onChange);
    this.#octaveLowSelect.addEventListener('change', onChange);
    this.#octaveHighSelect.addEventListener('change', onChange);
    this.#durationSelect.addEventListener('change', onChange);
    this.#patternSelect.addEventListener('change', onChange);

    this.#startBtn.addEventListener('click', () => this.#startPractice());

    // Render songs
    this.#renderSongs();

    // Listen for settings updates from game view (between loops)
    bus.on('practice:update-settings', (s) => {
      this.#settings = { ...this.#settings, ...s };
      store.set('practice-settings', this.#settings);
      this.#applySettings();
    });
  }

  get currentSettings() {
    return { ...this.#settings };
  }

  #populateSelects() {
    // Root
    for (const name of ROOT_NAMES) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.#rootSelect.appendChild(opt);
    }

    // Scale
    for (const [key, label] of Object.entries(SCALE_LABELS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      this.#scaleSelect.appendChild(opt);
    }

    // Octave low/high
    for (let o = 1; o <= 7; o++) {
      const optLow = document.createElement('option');
      optLow.value = o;
      optLow.textContent = `${o}`;
      this.#octaveLowSelect.appendChild(optLow);

      const optHigh = document.createElement('option');
      optHigh.value = o;
      optHigh.textContent = `${o}`;
      this.#octaveHighSelect.appendChild(optHigh);
    }

    // Duration
    for (const preset of DURATION_PRESETS) {
      const opt = document.createElement('option');
      opt.value = preset.key;
      opt.textContent = preset.label;
      this.#durationSelect.appendChild(opt);
    }

    // Pattern
    for (const p of PATTERNS) {
      const opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = p.label;
      this.#patternSelect.appendChild(opt);
    }
  }

  #applySettings() {
    this.#rootSelect.value = this.#settings.root;
    this.#scaleSelect.value = this.#settings.scale;
    this.#octaveLowSelect.value = this.#settings.octaveLow;
    this.#octaveHighSelect.value = this.#settings.octaveHigh;
    this.#durationSelect.value = this.#settings.duration;
    this.#patternSelect.value = this.#settings.pattern;
  }

  #saveSettings() {
    this.#settings = {
      root: this.#rootSelect.value,
      scale: this.#scaleSelect.value,
      octaveLow: parseInt(this.#octaveLowSelect.value, 10),
      octaveHigh: parseInt(this.#octaveHighSelect.value, 10),
      duration: this.#durationSelect.value,
      pattern: this.#patternSelect.value,
    };
    store.set('practice-settings', this.#settings);
  }

  #startPractice() {
    this.#saveSettings();
    const durationMs = DURATION_PRESETS.find(p => p.key === this.#settings.duration)?.ms ?? 1000;
    const exercise = generateExercise({
      root: this.#settings.root,
      scale: this.#settings.scale,
      octaveLow: this.#settings.octaveLow,
      octaveHigh: this.#settings.octaveHigh,
      noteDuration: durationMs,
      noteGap: 300,
      pattern: this.#settings.pattern,
    });
    bus.emit('song:select', { song: exercise, practiceSettings: this.#settings });
  }

  #switchTab(tab) {
    for (const btn of this.#tabBtns) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    this.#practicePanel.classList.toggle('hidden', tab !== 'practice');
    this.#songList.classList.toggle('hidden', tab !== 'songs');
  }

  #renderSongs() {
    // Filter out old hardcoded scales — keep only actual songs
    const songs = STARTER_SONGS.filter(s =>
      !s.id.includes('scale') && !s.id.includes('chromatic') && !s.id.includes('octave-jumps')
    );

    this.#songList.innerHTML = '';
    for (const song of songs) {
      const item = document.createElement('div');
      item.className = 'library__item';
      item.addEventListener('click', () => bus.emit('song:select', { song }));

      const info = document.createElement('div');
      info.className = 'library__item-info';

      const title = document.createElement('div');
      title.className = 'library__item-title';
      title.textContent = song.title;

      const meta = document.createElement('div');
      meta.className = 'library__item-meta';
      const dur = Math.ceil(songDuration(song) / 1000);
      const parts = [];
      if (song.artist) parts.push(song.artist);
      parts.push(`${song.notes.length} notes`);
      parts.push(`${dur}s`);
      meta.textContent = parts.join(' · ');

      info.appendChild(title);
      info.appendChild(meta);

      const badge = document.createElement('span');
      badge.className = `library__item-difficulty ${song.difficulty}`;
      badge.textContent = song.difficulty;

      item.appendChild(info);
      item.appendChild(badge);
      this.#songList.appendChild(item);
    }
  }
}

export const libraryView = new LibraryView();
