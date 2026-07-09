/**
 * drone-sheet.js — Chord drone panel: radial dial + progressions + voice.
 *
 * Non-modal bottom sheet over the graph. The drone keeps sounding when the
 * sheet closes or the tab switches; state is announced on the bus as
 * `drone:state` so the graph can mark chord tones and label its button.
 */

import { qs, qsa } from '../utils/dom.js';
import { bus } from '../utils/event-bus.js';
import { settings } from '../utils/settings.js';
import {
  droneSynth, PROGRESSIONS, CHORD_QUALITIES, chordLabel, chordNoteClasses,
} from '../audio/drone-synth.js';
import { ChordDial } from '../components/chord-dial.js';
import { ROOT_NAMES } from '../utils/scales.js';

class DroneSheet {
  #sheet;
  #dial;
  #nextEl;

  init() {
    this.#sheet = qs('#drone-sheet');
    this.#nextEl = qs('#drone-next');

    this.#dial = new ChordDial(qs('#chord-dial'), {
      onSelect: (rootIndex, quality) => this.#select(rootIndex, quality),
      onCenterTap: () => this.#togglePlay(),
    });

    qs('#drone-sheet-close').addEventListener('click', () => this.close());

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

    // Bar length
    const barSelect = qs('#drone-bar');
    barSelect.value = String(settings.get('droneBarMs'));
    barSelect.addEventListener('change', () => {
      settings.set('droneBarMs', Number(barSelect.value));
      if (droneSynth.progressionKey) this.#restartProgression();
    });

    // Voice
    for (const btn of qsa('#drone-voice-seg .seg__btn')) {
      btn.addEventListener('click', () => {
        settings.set('droneVoice', btn.dataset.voice);
        this.#renderControls();
        // Re-voice a sounding held chord right away
        if (droneSynth.isPlaying && !droneSynth.progressionKey) {
          const { rootIndex, quality } = this.#dial.selection;
          droneSynth.play(rootIndex, quality);
        }
      });
    }

    // Volume
    const volume = qs('#drone-volume');
    volume.value = String(settings.get('droneVolume'));
    volume.addEventListener('input', () => droneSynth.setVolume(Number(volume.value)));

    // Scale root marker follows the graph's key selection
    bus.on('settings:changed', ({ key }) => {
      if (key === 'scaleRoot') this.#syncScaleRoot();
      if (key === 'droneVoice') this.#renderControls();
    });

    this.#dial.setSelection(settings.get('droneChordRoot'), settings.get('droneChordQuality'));
    this.#dial.setCenterLabel(chordLabel(settings.get('droneChordRoot'), settings.get('droneChordQuality')));
    this.#syncScaleRoot();
    this.#renderControls();
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
      if (idx >= 0 && idx !== this.#dial.selection.rootIndex) {
        this.#dial.setSelection(idx, this.#dial.selection.quality);
        this.#persistSelection();
        this.#dial.setCenterLabel(chordLabel(idx, this.#dial.selection.quality));
      }
    }
    this.#sheet.classList.add('open');
  }

  close() {
    this.#sheet.classList.remove('open');
  }

  // -------------------------------------------------------------------------
  // Selection + playback
  // -------------------------------------------------------------------------

  #persistSelection() {
    const { rootIndex, quality } = this.#dial.selection;
    settings.set('droneChordRoot', rootIndex);
    settings.set('droneChordQuality', quality);
  }

  async #select(rootIndex, quality) {
    this.#dial.setSelection(rootIndex, quality);
    this.#persistSelection();
    this.#dial.setCenterLabel(chordLabel(rootIndex, quality));

    if (!droneSynth.isPlaying) return;
    if (droneSynth.progressionKey) {
      // New root re-keys the running progression
      this.#restartProgression();
    } else {
      await droneSynth.play(rootIndex, quality);
      this.#announce();
    }
  }

  async #togglePlay() {
    if (droneSynth.isPlaying) {
      droneSynth.stop();
      this.#dial.setPlaying(false);
      const { rootIndex, quality } = this.#dial.selection;
      this.#dial.setCenterLabel(chordLabel(rootIndex, quality));
      this.#nextEl.innerHTML = '&nbsp;';
      this.#announce();
      return;
    }

    const prog = settings.get('droneProgression');
    const { rootIndex, quality } = this.#dial.selection;
    if (prog === 'hold') {
      await droneSynth.play(rootIndex, quality);
      this.#announce();
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
      const { rootIndex, quality } = this.#dial.selection;
      await droneSynth.play(rootIndex, quality);
      this.#nextEl.innerHTML = '&nbsp;';
      this.#announce();
    } else {
      await this.#startProgression(key);
    }
  }

  async #startProgression(key) {
    const home = settings.get('droneChordRoot');
    await droneSynth.startProgression(key, home, settings.get('droneBarMs'),
      (stepIndex, chord) => this.#onProgChord(key, stepIndex, chord));
  }

  #restartProgression() {
    const key = droneSynth.progressionKey ?? settings.get('droneProgression');
    if (key && key !== 'hold') this.#startProgression(key);
  }

  #onProgChord(progKey, stepIndex, chord) {
    this.#dial.setSelection(chord.rootIndex, chord.quality);
    this.#dial.setCenterLabel(chordLabel(chord.rootIndex, chord.quality));
    const steps = PROGRESSIONS[progKey]?.steps;
    if (steps) {
      const next = steps[(stepIndex + 1) % steps.length];
      const home = settings.get('droneChordRoot');
      this.#nextEl.textContent =
        `NEXT: ${chordLabel((home + next.offset) % 12, next.quality)}`;
    }
    // Announce from the scheduler's chord, not droneSynth.current — play()
    // is async and current lags a beat behind the boundary.
    bus.emit('drone:state', {
      playing: true,
      label: chordLabel(chord.rootIndex, chord.quality),
      noteClasses: chordNoteClasses(chord.rootIndex, chord.quality),
    });
  }

  // -------------------------------------------------------------------------
  // State out
  // -------------------------------------------------------------------------

  #announce() {
    const current = droneSynth.current;
    bus.emit('drone:state', {
      playing: droneSynth.isPlaying,
      label: current ? chordLabel(current.rootIndex, current.quality) : null,
      noteClasses: current ? chordNoteClasses(current.rootIndex, current.quality) : null,
    });
  }

  #syncScaleRoot() {
    const root = settings.get('scaleRoot');
    this.#dial.setScaleRoot(root ? ROOT_NAMES.indexOf(root) : null);
  }

  #renderControls() {
    const prog = settings.get('droneProgression');
    for (const btn of qsa('#drone-prog-chips .btn')) {
      btn.classList.toggle('active', btn.dataset.prog === prog);
    }
    for (const btn of qsa('#drone-voice-seg .seg__btn')) {
      btn.classList.toggle('active', btn.dataset.voice === settings.get('droneVoice'));
    }
  }
}

export const droneSheet = new DroneSheet();
