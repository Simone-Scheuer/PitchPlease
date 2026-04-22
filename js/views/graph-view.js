import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { pitchBuffer } from '../audio/pitch-buffer.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast } from '../utils/dom.js';
import { PitchGraph } from '../components/pitch-graph.js';
import { SCALE_LABELS, ROOT_NAMES, isInScale } from '../utils/scales.js';
import { scalePlayer } from '../audio/scale-player.js';

// In-key tracking: rolling window of recent pitch samples
const IN_KEY_WINDOW_MS = 30_000;
const IN_KEY_UPDATE_MS = 250;

// Play-scale icons
const PLAY_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

// Mic toggle icons
const MIC_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

class GraphView {
  #graph;
  #micToggle;
  #speedBtn;

  #scaleRootSelect;
  #scaleTypeSelect;
  #currentNoteEl;
  #inKeyEl;
  #inKeyValueEl;
  #playScaleBtn;

  // Scale settings
  #scaleSettingsEl;
  #noteDurSelect;
  #gapDurSelect;
  #directionSelect;
  #loopBtn;
  #loop = false;

  #active = false;
  #hasAutoStarted = false;

  // In-key rolling window: array of { t, inKey }
  #inKeySamples = [];
  #inKeyTimer = null;

  init() {
    const canvas = qs('#graph-canvas');
    this.#graph = new PitchGraph(canvas, pitchBuffer);

    this.#micToggle = qs('#graph-mic-toggle');
    this.#speedBtn = qs('#graph-speed-btn');

    this.#scaleRootSelect = qs('#scale-root');
    this.#scaleTypeSelect = qs('#scale-type');
    this.#currentNoteEl = qs('#graph-current-note');
    this.#inKeyEl = qs('#graph-in-key');
    this.#inKeyValueEl = qs('#graph-in-key-value');
    this.#playScaleBtn = qs('#graph-play-scale-btn');

    // Scale playback settings
    this.#scaleSettingsEl = qs('#graph-scale-settings');
    this.#noteDurSelect = qs('#scale-note-dur');
    this.#gapDurSelect = qs('#scale-gap-dur');
    this.#directionSelect = qs('#scale-direction');
    this.#loopBtn = qs('#scale-loop-btn');

    this.#micToggle.addEventListener('click', () => this.#toggleMic());
    this.#speedBtn.addEventListener('click', () => this.#cycleSpeed());

    this.#scaleRootSelect.addEventListener('change', () => this.#updateScale());
    this.#scaleTypeSelect.addEventListener('change', () => this.#updateScale());
    this.#playScaleBtn.addEventListener('click', () => this.#togglePlayScale());

    this.#loopBtn.addEventListener('click', () => {
      this.#loop = !this.#loop;
      this.#loopBtn.classList.toggle('active', this.#loop);
    });

    this.#populateScaleSelects();

    bus.on('pitch', (data) => this.#onPitch(data));
    bus.on('silence', () => this.#onSilence());

    this.#speedBtn.textContent = this.#graph.speedLabel;
    this.#playScaleBtn.innerHTML = PLAY_ICON;
  }

  activate() {
    this.#graph.resize();
    this.#graph.drawStatic();

    if (this.#active) {
      this.#graph.start();
    } else if (!this.#hasAutoStarted) {
      this.#hasAutoStarted = true;
      this.#startAll();
    }
  }

  deactivate() {
    this.#graph.stopRendering();
    this.#stopPlayScale();
  }

  #populateScaleSelects() {
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'Off';
    this.#scaleRootSelect.appendChild(noneOpt);

    for (const name of ROOT_NAMES) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.#scaleRootSelect.appendChild(opt);
    }

    for (const [key, label] of Object.entries(SCALE_LABELS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      this.#scaleTypeSelect.appendChild(opt);
    }
  }

  #updateScale() {
    const root = this.#scaleRootSelect.value;
    const type = this.#scaleTypeSelect.value;
    if (root) {
      this.#graph.setScale(root, type);
      this.#inKeyEl.hidden = false;
      this.#playScaleBtn.hidden = false;
      this.#scaleSettingsEl.hidden = false;
    } else {
      this.#graph.setScale(null, null);
      this.#inKeyEl.hidden = true;
      this.#playScaleBtn.hidden = true;
      this.#scaleSettingsEl.hidden = true;
    }
    this.#resetInKey();
    this.#stopPlayScale();
  }

  #resetInKey() {
    this.#inKeySamples = [];
    this.#inKeyValueEl.textContent = '--';
  }

  #startInKeyTimer() {
    if (this.#inKeyTimer) return;
    this.#inKeyTimer = setInterval(() => this.#refreshInKey(), IN_KEY_UPDATE_MS);
  }

  #stopInKeyTimer() {
    if (this.#inKeyTimer) {
      clearInterval(this.#inKeyTimer);
      this.#inKeyTimer = null;
    }
  }

  #refreshInKey() {
    const cutoff = performance.now() - IN_KEY_WINDOW_MS;
    let trimIdx = 0;
    while (trimIdx < this.#inKeySamples.length && this.#inKeySamples[trimIdx].t < cutoff) {
      trimIdx++;
    }
    if (trimIdx > 0) this.#inKeySamples.splice(0, trimIdx);

    if (this.#inKeySamples.length < 5) {
      this.#inKeyValueEl.textContent = '--';
      return;
    }

    let hits = 0;
    for (const s of this.#inKeySamples) if (s.inKey) hits++;
    const pct = Math.round((hits / this.#inKeySamples.length) * 100);
    this.#inKeyValueEl.textContent = `${pct}%`;
  }

  #togglePlayScale() {
    if (scalePlayer.isPlaying) {
      this.#stopPlayScale();
    } else {
      this.#startPlayScale();
    }
  }

  async #startPlayScale() {
    const root = this.#scaleRootSelect.value;
    const type = this.#scaleTypeSelect.value;
    if (!root) return;

    if (!this.#active) {
      await this.#startAll();
      if (!this.#active) return;
    }

    this.#playScaleBtn.classList.add('playing');
    this.#playScaleBtn.innerHTML = STOP_ICON;
    this.#playScaleBtn.setAttribute('aria-label', 'Stop scale');

    const noteMs = parseInt(this.#noteDurSelect.value, 10);
    const gapMs = parseInt(this.#gapDurSelect.value, 10);
    const direction = this.#directionSelect.value;

    await scalePlayer.start({
      rootName: root,
      scaleKey: type,
      noteMs,
      gapMs,
      loop: this.#loop,
      direction,
      onNoteStart: (midi) => this.#graph.setGuideMidi(midi),
      onFinish: () => this.#handlePlayScaleFinish(),
    });
  }

  #stopPlayScale() {
    if (scalePlayer.isPlaying) scalePlayer.stop();
    this.#handlePlayScaleFinish();
  }

  #handlePlayScaleFinish() {
    this.#graph.setGuideMidi(null);
    this.#playScaleBtn.classList.remove('playing');
    this.#playScaleBtn.innerHTML = PLAY_ICON;
    this.#playScaleBtn.setAttribute('aria-label', 'Play scale');
  }

  async #toggleMic() {
    if (this.#active) {
      this.#stopAll();
    } else {
      await this.#startAll();
    }
  }

  async #startAll() {
    try {
      await mic.start();
      detector.start();
      pitchBuffer.start();
      this.#graph.start();
      this.#active = true;

      this.#micToggle.classList.add('active');
      this.#micToggle.innerHTML = PAUSE_ICON;
      this.#micToggle.setAttribute('aria-label', 'Pause listening');

      this.#resetInKey();
      this.#startInKeyTimer();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        showToast('Microphone access denied.');
      } else if (err.name === 'NotFoundError') {
        showToast('No microphone found.');
      } else {
        showToast('Could not access microphone.');
      }
    }
  }

  #stopAll() {
    detector.stop();
    mic.stop();
    pitchBuffer.stop();
    this.#graph.stop();
    this.#active = false;

    this.#micToggle.classList.remove('active');
    this.#micToggle.innerHTML = MIC_ICON;
    this.#micToggle.setAttribute('aria-label', 'Start listening');

    this.#currentNoteEl.innerHTML = '--';
    this.#currentNoteEl.classList.remove('detected');

    this.#stopInKeyTimer();
    this.#resetInKey();
    this.#stopPlayScale();

    this.#graph.drawStatic();
  }

  #cycleSpeed() {
    const next = (this.#graph.speedIndex + 1) % 5;
    this.#graph.setSpeed(next);
    this.#speedBtn.textContent = this.#graph.speedLabel;
  }

  #onPitch(data) {
    this.#currentNoteEl.innerHTML = `${data.note}<span class="octave">${data.octave}</span>`;
    this.#currentNoteEl.classList.add('detected');

    const root = this.#scaleRootSelect.value;
    const type = this.#scaleTypeSelect.value;
    if (root && this.#active) {
      const inKey = isInScale(Math.round(data.midi), root, type);
      this.#inKeySamples.push({ t: performance.now(), inKey });
    }
  }

  #onSilence() {
    this.#currentNoteEl.classList.remove('detected');
  }
}

export const graphView = new GraphView();
