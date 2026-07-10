/**
 * settings-drawer.js — Instrument, reference pitch (with calibrate flow),
 * skin, and drone voice. Persists via settings and updates the chrome meta.
 */

import { qs, qsa, showToast } from '../utils/dom.js';
import { bus } from '../utils/event-bus.js';
import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { settings } from '../utils/settings.js';
import { INSTRUMENTS, a4FromOffset } from '../utils/instruments.js';

const SKIN_THEME_COLOR = {
  press: '#e9e5d8',
  neon: '#0b0b10',
  riso: '#ece7dc',
};

const INSTRUMENT_NOTES = {
  harmonica: 'Richter 10-hole. The graph’s left rail shows hole numbers: 4 = blow, -4 = draw, ticks = bend depth (-3’’).',
  whistle: 'Six-hole fingerings on the left rail: filled = closed, open = open. Second octave repeats overblown.',
  voice: 'No fingerings to show — note names on both rails. For singing, whistling, mouth trumpet.',
};

const CAL_MIN_SAMPLES = 40;
const CAL_WINDOW = 120;

class SettingsDrawer {
  #drawer;
  #scrim;
  #metaEl;
  #a4ValueEl;

  // Calibration state
  #calActive = false;
  #calStartedMic = false;
  #calSamples = [];
  #calMean = null;
  #calReadingEl;
  #calHintEl;
  #calApplyBtn;
  #calBlock;

  init() {
    this.#drawer = qs('#settings-drawer');
    this.#scrim = qs('#scrim');
    this.#metaEl = qs('#chrome-meta');
    this.#a4ValueEl = qs('#a4-value');
    this.#calBlock = qs('#cal-block');
    this.#calReadingEl = qs('#cal-reading');
    this.#calHintEl = qs('#cal-hint');
    this.#calApplyBtn = qs('#cal-apply');

    qs('#settings-btn').addEventListener('click', () => this.open());
    qs('#drawer-close').addEventListener('click', () => this.close());
    this.#scrim.addEventListener('click', () => this.close());

    // Instrument segments
    for (const btn of qsa('#instrument-seg .seg__btn')) {
      btn.addEventListener('click', () => {
        settings.set('instrument', btn.dataset.instrument);
        this.#render();
      });
    }

    // Key select
    qs('#key-select').addEventListener('change', (e) => {
      const inst = settings.get('instrument');
      if (inst === 'harmonica') settings.set('harpKey', e.target.value);
      else if (inst === 'whistle') settings.set('whistleKey', e.target.value);
      this.#renderMeta();
    });

    // A4 stepper
    qs('#a4-down').addEventListener('click', () => this.#nudgeA4(-1));
    qs('#a4-up').addEventListener('click', () => this.#nudgeA4(1));
    qs('#a4-reset').addEventListener('click', () => {
      settings.set('a4', 440);
      this.#renderA4();
      showToast('Reference reset to A4 = 440 Hz');
    });

    // Calibration
    qs('#cal-start').addEventListener('click', () => this.#startCal());
    qs('#cal-cancel').addEventListener('click', () => this.#endCal());
    this.#calApplyBtn.addEventListener('click', () => this.#applyCal());
    bus.on('pitch', (data) => this.#onCalPitch(data));

    // Skin swatches
    for (const btn of qsa('#skin-swatches .swatch')) {
      btn.addEventListener('click', () => {
        applySkin(btn.dataset.skin);
        this.#render();
      });
    }

    // Drone voice
    for (const btn of qsa('#voice-seg .seg__btn')) {
      btn.addEventListener('click', () => {
        settings.set('droneVoice', btn.dataset.voice);
        this.#render();
      });
    }

    this.#render();
  }

  open() {
    this.#render();
    this.#drawer.classList.add('open');
    this.#scrim.classList.add('open');
  }

  close() {
    this.#endCal();
    this.#drawer.classList.remove('open');
    this.#scrim.classList.remove('open');
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  #render() {
    const inst = settings.get('instrument');

    for (const btn of qsa('#instrument-seg .seg__btn')) {
      btn.classList.toggle('active', btn.dataset.instrument === inst);
    }

    // Key row
    const profile = INSTRUMENTS[inst];
    const keyRow = qs('#key-row');
    if (profile.keys) {
      keyRow.hidden = false;
      qs('#key-label').textContent = inst === 'harmonica' ? 'HARP KEY' : 'WHISTLE KEY';
      const select = qs('#key-select');
      select.innerHTML = '';
      for (const key of profile.keys) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        select.appendChild(opt);
      }
      select.value = settings.instrumentKey;
    } else {
      keyRow.hidden = true;
    }

    qs('#instrument-note').textContent = INSTRUMENT_NOTES[inst] ?? '';

    for (const btn of qsa('#skin-swatches .swatch')) {
      btn.classList.toggle('active', btn.dataset.skin === settings.get('skin'));
    }
    for (const btn of qsa('#voice-seg .seg__btn')) {
      btn.classList.toggle('active', btn.dataset.voice === settings.get('droneVoice'));
    }

    this.#renderA4();
    this.#renderMeta();
  }

  #renderA4() {
    const a4 = settings.get('a4');
    this.#a4ValueEl.textContent = Number.isInteger(a4) ? String(a4) : a4.toFixed(1);
    this.#renderMeta();
  }

  #renderMeta() {
    const inst = settings.get('instrument');
    const a4 = settings.get('a4');
    const a4Str = Number.isInteger(a4) ? String(a4) : a4.toFixed(1);
    const key = settings.instrumentKey;
    const instStr = inst === 'harmonica' ? `${key} HARP`
      : inst === 'whistle' ? `${key} WHISTLE`
      : 'VOICE';
    this.#metaEl.textContent = `A4 ${a4Str} / ${instStr.toUpperCase()}`;
  }

  #nudgeA4(delta) {
    settings.set('a4', settings.get('a4') + delta);
    this.#renderA4();
  }

  // -------------------------------------------------------------------------
  // Calibration: play one steady note, we measure the mean offset
  // -------------------------------------------------------------------------

  async #startCal() {
    if (this.#calActive) return;
    this.#calSamples = [];
    this.#calMean = null;
    this.#calApplyBtn.disabled = true;
    this.#calReadingEl.textContent = '—';
    this.#calHintEl.textContent = 'Listening… play one steady note';

    try {
      if (!mic.audioContext || !mic.analyser) {
        await mic.start();
        detector.start();
        this.#calStartedMic = true;
      }
      this.#calActive = true;
      this.#calBlock.hidden = false;
      qs('#cal-start-row').hidden = true;
    } catch {
      showToast('Could not access microphone.');
    }
  }

  #onCalPitch(data) {
    if (!this.#calActive) return;
    this.#calSamples.push(data.cents);
    if (this.#calSamples.length > CAL_WINDOW) this.#calSamples.shift();
    if (this.#calSamples.length < CAL_MIN_SAMPLES) {
      this.#calReadingEl.textContent = '…';
      return;
    }
    const mean = this.#calSamples.reduce((a, b) => a + b, 0) / this.#calSamples.length;
    this.#calMean = mean;
    const rounded = Math.round(mean);
    this.#calReadingEl.textContent = `${rounded > 0 ? '+' : ''}${rounded}¢`;
    this.#calHintEl.textContent = rounded === 0
      ? 'Dead on. Nothing to fix.'
      : `Your instrument runs ${Math.abs(rounded)}¢ ${rounded > 0 ? 'sharp' : 'flat'} of A4 ${settings.get('a4')}`;
    this.#calApplyBtn.disabled = false;
  }

  #applyCal() {
    if (this.#calMean === null) return;
    const next = a4FromOffset(settings.get('a4'), this.#calMean);
    settings.set('a4', next);
    this.#renderA4();
    const a4 = settings.get('a4');
    showToast(`Reference set: A4 = ${Number.isInteger(a4) ? a4 : a4.toFixed(1)} Hz`);
    this.#endCal();
  }

  #endCal() {
    if (!this.#calActive) return;
    this.#calActive = false;
    this.#calBlock.hidden = true;
    qs('#cal-start-row').hidden = false;
    if (this.#calStartedMic) {
      detector.stop();
      mic.stop();
      this.#calStartedMic = false;
    }
  }
}

/** Set the skin on <html>, persist it, and sync the browser theme color. */
export function applySkin(skin) {
  if (!SKIN_THEME_COLOR[skin]) skin = 'press';
  document.documentElement.dataset.skin = skin;
  settings.set('skin', skin);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = SKIN_THEME_COLOR[skin];
}

export const settingsDrawer = new SettingsDrawer();
