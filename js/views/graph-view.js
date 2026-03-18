import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { pitchBuffer } from '../audio/pitch-buffer.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast } from '../utils/dom.js';
import { PitchGraph } from '../components/pitch-graph.js';
import { SCALE_LABELS, ROOT_NAMES } from '../utils/scales.js';

class GraphView {
  #graph;
  #micBtn;
  #speedBtn;

  #scaleRootSelect;
  #scaleTypeSelect;
  #currentNoteEl;
  #active = false;

  init() {
    const canvas = qs('#graph-canvas');
    this.#graph = new PitchGraph(canvas, pitchBuffer);

    this.#micBtn = qs('#graph-mic-btn');
    this.#speedBtn = qs('#graph-speed-btn');

    this.#scaleRootSelect = qs('#scale-root');
    this.#scaleTypeSelect = qs('#scale-type');
    this.#currentNoteEl = qs('#graph-current-note');

    this.#micBtn.addEventListener('click', () => this.#toggle());
    this.#speedBtn.addEventListener('click', () => this.#cycleSpeed());

    this.#scaleRootSelect.addEventListener('change', () => this.#updateScale());
    this.#scaleTypeSelect.addEventListener('change', () => this.#updateScale());

    this.#populateScaleSelects();

    bus.on('pitch', (data) => this.#onPitch(data));
    bus.on('silence', () => this.#onSilence());

    this.#speedBtn.textContent = this.#graph.speedLabel;
  }

  activate() {
    // Always draw the grid/scale immediately when switching to graph tab
    this.#graph.drawStatic();

    // If recording was active, resume the animation loop
    if (this.#active) {
      this.#graph.start();
    }
  }

  deactivate() {
    // Stop animation but keep mic/buffer running if active
    this.#graph.stopRendering();
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
    } else {
      this.#graph.setScale(null, null);
    }
  }

  async #toggle() {
    if (this.#active) {
      this.#stopAll();
    } else {
      await this.#startAll();
    }
  }

  async #startAll() {
    try {
      this.#micBtn.classList.remove('error');
      await mic.start();
      detector.start();
      pitchBuffer.start();
      this.#graph.start();
      this.#active = true;
      this.#micBtn.classList.add('active');
    } catch (err) {
      this.#micBtn.classList.add('error');
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
    this.#micBtn.classList.remove('active');

    this.#currentNoteEl.innerHTML = '--';
    this.#currentNoteEl.classList.remove('detected');
    // Redraw static grid so it doesn't go blank
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
  }

  #onSilence() {
    this.#currentNoteEl.classList.remove('detected');
  }
}

export const graphView = new GraphView();
