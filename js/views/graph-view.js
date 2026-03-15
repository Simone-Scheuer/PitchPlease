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
  #pauseBtn;
  #speedBtn;
  #compactBtn;
  #scaleRootSelect;
  #scaleTypeSelect;
  #currentNoteEl;
  #active = false;

  init() {
    const canvas = qs('#graph-canvas');
    this.#graph = new PitchGraph(canvas, pitchBuffer);

    this.#micBtn = qs('#graph-mic-btn');
    this.#pauseBtn = qs('#graph-pause-btn');
    this.#speedBtn = qs('#graph-speed-btn');
    this.#compactBtn = qs('#graph-compact-btn');
    this.#scaleRootSelect = qs('#scale-root');
    this.#scaleTypeSelect = qs('#scale-type');
    this.#currentNoteEl = qs('#graph-current-note');

    this.#micBtn.addEventListener('click', () => this.#toggleMic());
    this.#pauseBtn.addEventListener('click', () => this.#togglePause());
    this.#speedBtn.addEventListener('click', () => this.#cycleSpeed());
    this.#compactBtn.addEventListener('click', () => this.#toggleCompact());
    this.#scaleRootSelect.addEventListener('change', () => this.#updateScale());
    this.#scaleTypeSelect.addEventListener('change', () => this.#updateScale());

    // Populate scale selects
    this.#populateScaleSelects();

    bus.on('pitch', (data) => this.#onPitch(data));
    bus.on('silence', () => this.#onSilence());

    // Set initial speed label
    this.#speedBtn.textContent = this.#graph.speedLabel;
  }

  activate() {
    // If mic is already running (from tuner), start the graph
    if (this.#active) {
      this.#graph.start();
    }
  }

  deactivate() {
    // Keep graph data but pause rendering
    this.#graph.stop();
  }

  #populateScaleSelects() {
    // Root selector
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

    // Scale type selector
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

  async #toggleMic() {
    if (this.#active) {
      this.#stopMic();
    } else {
      await this.#startMic();
    }
  }

  async #startMic() {
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

  #stopMic() {
    detector.stop();
    mic.stop();
    pitchBuffer.stop();
    this.#graph.stop();
    this.#active = false;
    this.#micBtn.classList.remove('active');
    this.#pauseBtn.classList.remove('active');
    this.#compactBtn.classList.remove('active');
    this.#currentNoteEl.innerHTML = '--';
    this.#currentNoteEl.classList.remove('detected');
  }

  #togglePause() {
    this.#graph.togglePause();
    this.#pauseBtn.classList.toggle('active', this.#graph.isPaused);
  }

  #cycleSpeed() {
    const next = (this.#graph.speedIndex + 1) % 5;
    this.#graph.setSpeed(next);
    this.#speedBtn.textContent = this.#graph.speedLabel;
  }

  #toggleCompact() {
    this.#graph.toggleCompact();
    this.#compactBtn.classList.toggle('active', this.#graph.isCompact);
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
