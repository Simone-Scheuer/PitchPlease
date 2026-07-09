/**
 * drone-sheet.js — Chord drone panel: radial dial + progressions + synth.
 *
 * Non-modal bottom sheet over the graph. Everything is live: tapping a
 * root during a progression re-keys it from the NEXT bar (no restart),
 * voice/register/warmth/space changes land on the sounding chord, and
 * bar length applies from the next boundary. The home key stays visible
 * ("KEY OF G" + a marked ring segment) while the progression's moving
 * highlight walks the chords.
 *
 * State goes out on the bus as `drone:state`.
 */

import { qs, qsa } from '../utils/dom.js';
import { bus } from '../utils/event-bus.js';
import { settings } from '../utils/settings.js';
import {
  droneSynth, PROGRESSIONS, chordLabel, chordNoteClasses,
} from '../audio/drone-synth.js';
import { ChordDial } from '../components/chord-dial.js';
import { ROOT_NAMES } from '../utils/scales.js';
import { NOTE_NAMES } from '../utils/constants.js';

class DroneSheet {
  #sheet;
  #dial;
  #nextEl;
  #keyEl;
  #keyPop;
  #barValEl;

  init() {
    this.#sheet = qs('#drone-sheet');
    this.#nextEl = qs('#drone-next');
    this.#keyEl = qs('#drone-key');
    this.#barValEl = qs('#drone-bar-val');

    this.#dial = new ChordDial(qs('#chord-dial'), {
      onSelect: (rootIndex, quality) => this.#select(rootIndex, quality),
      onCenterTap: () => this.#togglePlay(),
    });

    qs('#drone-sheet-close').addEventListener('click', () => this.close());

    // Key control — arrows step by fifths; tapping the value opens a
    // 12-key popover grid (custom, no native picker modal).
    const stepKey = (fifths) => {
      const next = ((settings.get('droneChordRoot') + fifths * 7) % 12 + 12) % 12;
      this.#select(next, settings.get('droneChordQuality'));
    };
    qs('#drone-key-prev').addEventListener('click', () => stepKey(-1));
    qs('#drone-key-next').addEventListener('click', () => stepKey(1));

    this.#keyPop = qs('#drone-key-pop');
    const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    for (const rootIndex of FIFTHS) {
      const btn = document.createElement('button');
      btn.className = 'keypop__btn';
      btn.dataset.root = String(rootIndex);
      btn.textContent = NOTE_NAMES[rootIndex];
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#select(rootIndex, settings.get('droneChordQuality'));
        this.#keyPop.hidden = true;
      });
      this.#keyPop.appendChild(btn);
    }
    this.#keyEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#keyPop.hidden = !this.#keyPop.hidden;
      this.#renderKey();
    });
    document.addEventListener('click', () => { this.#keyPop.hidden = true; });

    // Progression chips
    const chips = qs('#drone-prog-chips');
    const addChip = (key, label) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.dataset.prog = key;
      btn.textContent = label;
      btn.addEventListener('click', () => this.#setProgression(key));
      chips.appendChild(btn);
    };
    addChip('hold', 'HOLD');
    for (const [key, prog] of Object.entries(PROGRESSIONS)) addChip(key, prog.label);

    // Bar length — continuous slider, live from the next boundary
    const bar = qs('#drone-bar');
    bar.value = String(settings.get('droneBarMs'));
    bar.addEventListener('input', () => {
      const ms = Number(bar.value);
      settings.set('droneBarMs', ms);
      droneSynth.setBarMs(ms);
      this.#renderBarVal();
    });

    // Voice (samples + waves) — revoices the sounding chord immediately
    for (const btn of qsa('#drone-sample-seg .seg__btn, #drone-voice-seg .seg__btn')) {
      btn.addEventListener('click', () => {
        settings.set('droneVoice', btn.dataset.voice);
        this.#renderControls();
        droneSynth.revoice();
      });
    }

    // Register — low/high octave, live
    for (const btn of qsa('#drone-register-seg .seg__btn')) {
      btn.addEventListener('click', () => {
        settings.set('droneRegister', btn.dataset.register);
        this.#renderControls();
        droneSynth.revoice();
      });
    }

    // Warmth (lowpass), space (reverb), volume — all live
    const cutoff = qs('#drone-cutoff');
    cutoff.value = String(settings.get('droneCutoff'));
    cutoff.addEventListener('input', () => droneSynth.setCutoff(Number(cutoff.value)));

    const space = qs('#drone-space');
    space.value = String(settings.get('droneSpace'));
    space.addEventListener('input', () => droneSynth.setSpace(Number(space.value)));

    const volume = qs('#drone-volume');
    volume.value = String(settings.get('droneVolume'));
    volume.addEventListener('input', () => droneSynth.setVolume(Number(volume.value)));

    bus.on('settings:changed', ({ key }) => {
      if (key === 'scaleRoot') this.#syncScaleRoot();
      if (key === 'droneVoice' || key === 'droneRegister') this.#renderControls();
    });

    const home = settings.get('droneChordRoot');
    this.#dial.setSelection(home, settings.get('droneChordQuality'));
    this.#dial.setCenterLabel(chordLabel(home, settings.get('droneChordQuality')));
    this.#dial.setHomeRoot(home);
    this.#syncScaleRoot();
    this.#renderControls();
    this.#renderBarVal();
    this.#renderKey();
  }

  // -------------------------------------------------------------------------
  // Open / close (audio is independent of visibility)
  // -------------------------------------------------------------------------

  toggle() {
    this.#sheet.classList.contains('open') ? this.close() : this.open();
  }

  open() {
    // First open with a key selected: meet the player at their scale root
    if (!droneSynth.isPlaying && settings.get('scaleRoot')) {
      const idx = ROOT_NAMES.indexOf(settings.get('scaleRoot'));
      if (idx >= 0 && idx !== settings.get('droneChordRoot')) {
        this.#setHome(idx, this.#dial.selection.quality);
        this.#dial.setSelection(idx, this.#dial.selection.quality);
        this.#dial.setCenterLabel(chordLabel(idx, this.#dial.selection.quality));
      }
    }
    this.#sheet.classList.add('open');
  }

  close() {
    this.#sheet.classList.remove('open');
  }

  // -------------------------------------------------------------------------
  // Selection — home key + live re-keying
  // -------------------------------------------------------------------------

  #setHome(rootIndex, quality) {
    settings.set('droneChordRoot', rootIndex);
    settings.set('droneChordQuality', quality);
    this.#dial.setHomeRoot(rootIndex);
    this.#renderKey();
  }

  async #select(rootIndex, quality) {
    this.#setHome(rootIndex, quality);

    if (droneSynth.isPlaying && droneSynth.progressionKey) {
      // Re-key the running progression from the NEXT bar — keep the groove
      droneSynth.setProgressionRoot(rootIndex);
      return;
    }

    this.#dial.setSelection(rootIndex, quality);
    this.#dial.setCenterLabel(chordLabel(rootIndex, quality));
    if (droneSynth.isPlaying) {
      await droneSynth.play(rootIndex, quality);
      this.#announceChord({ rootIndex, quality });
    }
  }

  async #togglePlay() {
    if (droneSynth.isPlaying) {
      droneSynth.stop();
      this.#dial.setPlaying(false);
      const root = settings.get('droneChordRoot');
      const quality = settings.get('droneChordQuality');
      this.#dial.setSelection(root, quality);
      this.#dial.setCenterLabel(chordLabel(root, quality));
      this.#nextEl.innerHTML = '&nbsp;';
      bus.emit('drone:state', { playing: false, label: null, noteClasses: null });
      return;
    }

    const prog = settings.get('droneProgression');
    const root = settings.get('droneChordRoot');
    const quality = settings.get('droneChordQuality');
    if (prog === 'hold') {
      await droneSynth.play(root, quality);
      this.#announceChord({ rootIndex: root, quality });
    } else {
      await this.#startProgression(prog);
    }
    this.#dial.setPlaying(true);
  }

  async #setProgression(key) {
    settings.set('droneProgression', key);
    this.#renderControls();
    if (!droneSynth.isPlaying) return;
    if (key === 'hold') {
      droneSynth.stopProgression();
      const root = settings.get('droneChordRoot');
      const quality = settings.get('droneChordQuality');
      await droneSynth.play(root, quality);
      this.#dial.setSelection(root, quality);
      this.#dial.setCenterLabel(chordLabel(root, quality));
      this.#nextEl.innerHTML = '&nbsp;';
      this.#announceChord({ rootIndex: root, quality });
    } else {
      await this.#startProgression(key);
    }
  }

  async #startProgression(key) {
    await droneSynth.startProgression(
      key, settings.get('droneChordRoot'), settings.get('droneBarMs'),
      (stepIndex, chord) => this.#onProgChord(key, stepIndex, chord),
    );
  }

  #onProgChord(progKey, stepIndex, chord) {
    this.#dial.setSelection(chord.rootIndex, chord.quality);
    this.#dial.setCenterLabel(chordLabel(chord.rootIndex, chord.quality));
    const steps = PROGRESSIONS[progKey]?.steps;
    let nextLabel = null;
    if (steps) {
      const numeral = steps[stepIndex]?.numeral ?? '';
      const next = steps[(stepIndex + 1) % steps.length];
      const home = settings.get('droneChordRoot');
      nextLabel = chordLabel((home + next.offset) % 12, next.quality);
      this.#nextEl.textContent = `${numeral} · NEXT: ${nextLabel}`;
    }
    this.#announceChord(chord, nextLabel);
  }

  // -------------------------------------------------------------------------
  // State out + rendering
  // -------------------------------------------------------------------------

  /** Announce from the given chord (droneSynth.current lags async play). */
  #announceChord(chord, nextLabel = null) {
    bus.emit('drone:state', {
      playing: true,
      label: chordLabel(chord.rootIndex, chord.quality),
      rootIndex: chord.rootIndex,
      quality: chord.quality,
      nextLabel,
      noteClasses: chordNoteClasses(chord.rootIndex, chord.quality),
    });
  }

  #syncScaleRoot() {
    const root = settings.get('scaleRoot');
    this.#dial.setScaleRoot(root ? ROOT_NAMES.indexOf(root) : null);
  }

  #renderKey() {
    const root = ((settings.get('droneChordRoot') % 12) + 12) % 12;
    this.#keyEl.textContent = `KEY OF ${NOTE_NAMES[root]}`;
    for (const btn of qsa('#drone-key-pop .keypop__btn')) {
      btn.classList.toggle('active', Number(btn.dataset.root) === root);
    }
    // Progression chips speak in actual chords for this key, named on-chip
    for (const btn of qsa('#drone-prog-chips .btn')) {
      const prog = PROGRESSIONS[btn.dataset.prog];
      if (!prog) continue; // HOLD
      const seen = new Set();
      const chords = [];
      for (const step of prog.steps) {
        const label = chordLabel((root + step.offset) % 12, step.quality);
        if (!seen.has(label)) { seen.add(label); chords.push(label); }
      }
      btn.innerHTML = `<span class="chips__name">${prog.label}</span><span>${chords.join('·')}</span>`;
      btn.title = `${prog.label} — ${prog.steps.map(s => s.numeral).join(' ')}`;
    }
  }

  #renderBarVal() {
    this.#barValEl.textContent = `${(settings.get('droneBarMs') / 1000).toFixed(2).replace(/\.?0+$/, '')}s`;
  }

  #renderControls() {
    const prog = settings.get('droneProgression');
    for (const btn of qsa('#drone-prog-chips .btn')) {
      btn.classList.toggle('active', btn.dataset.prog === prog);
    }
    for (const btn of qsa('#drone-sample-seg .seg__btn, #drone-voice-seg .seg__btn')) {
      btn.classList.toggle('active', btn.dataset.voice === settings.get('droneVoice'));
    }
    for (const btn of qsa('#drone-register-seg .seg__btn')) {
      btn.classList.toggle('active', btn.dataset.register === settings.get('droneRegister'));
    }
  }
}

export const droneSheet = new DroneSheet();
