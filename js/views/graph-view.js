/**
 * graph-view.js — Controller for the pitch mirror.
 *
 * Wires the mic pipeline to the PitchGraph, drives the corner HUD
 * (note + native token + cents + hold stats + harp position), the
 * scale overlay with in-key tracking, the lockable root drone, and
 * the scale player. Pause keeps the trace on screen.
 */

import { mic } from '../audio/mic.js';
import { detector } from '../audio/detector.js';
import { bus } from '../utils/event-bus.js';
import { qs, showToast, setStatus } from '../utils/dom.js';
import { PitchGraph } from '../components/pitch-graph.js';
import { SCALE_LABELS, ROOT_NAMES, isInScale } from '../utils/scales.js';
import { scalePlayer } from '../audio/scale-player.js';
import { startDrone } from '../audio/synth.js';
import { settings } from '../utils/settings.js';
import { describePitch, harpPosition, getDefaultRange } from '../utils/instruments.js';

const IN_KEY_WINDOW_MS = 30_000;
const IN_KEY_UPDATE_MS = 250;
const HOLD_MIN_MS = 600;       // sustained this long counts as a hold
const HOLD_LINGER_MS = 2000;   // keep the last hold readout visible this long

const PLAY_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
const MIC_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

class GraphView {
  #graph;
  #micToggle;
  #speedBtn;
  #pauseFlashEl;
  #pausedTagEl;

  // HUD
  #hudEl;
  #hudNoteEl;
  #hudNativeEl;
  #hudSubEl;
  #hudHoldEl;

  // Scale + position
  #scaleRootSelect;
  #scaleTypeSelect;
  #posChipEl;
  #inKeyEl;
  #inKeyValueEl;
  #playScaleBtn;
  #scaleSettingsEl;
  #noteDurSelect;
  #gapDurSelect;
  #directionSelect;
  #loopBtn;
  #loop = false;

  // Drone
  #droneBtn;
  #droneHandle = null;

  #active = false;        // mic running
  #started = false;       // a session has begun (trace exists)
  #hasAutoStarted = false;

  #inKeySamples = [];
  #inKeyTimer = null;

  // Hold tracking
  #holdMidi = null;
  #holdStart = 0;
  #holdCentsSum = 0;
  #holdCount = 0;
  #holdClearTimer = null;

  init() {
    this.#graph = new PitchGraph(qs('#graph-canvas'));
    this.#graph.setCenterTapHandler(() => this.#handleCenterTap());

    this.#micToggle = qs('#graph-mic-toggle');
    this.#speedBtn = qs('#graph-speed-btn');
    this.#pauseFlashEl = qs('#graph-pause-flash');
    this.#pausedTagEl = qs('#graph-paused-tag');

    this.#hudEl = qs('#graph-hud');
    this.#hudNoteEl = qs('#hud-note');
    this.#hudNativeEl = qs('#hud-native');
    this.#hudSubEl = qs('#hud-sub');
    this.#hudHoldEl = qs('#hud-hold');

    this.#scaleRootSelect = qs('#scale-root');
    this.#scaleTypeSelect = qs('#scale-type');
    this.#posChipEl = qs('#pos-chip');
    this.#inKeyEl = qs('#graph-in-key');
    this.#inKeyValueEl = qs('#graph-in-key-value');
    this.#playScaleBtn = qs('#graph-play-scale-btn');

    this.#scaleSettingsEl = qs('#graph-scale-settings');
    this.#noteDurSelect = qs('#scale-note-dur');
    this.#gapDurSelect = qs('#scale-gap-dur');
    this.#directionSelect = qs('#scale-direction');
    this.#loopBtn = qs('#scale-loop-btn');

    this.#droneBtn = qs('#drone-btn');

    this.#micToggle.addEventListener('click', () => this.#toggleMic());
    this.#speedBtn.addEventListener('click', () => this.#cycleSpeed());
    this.#scaleRootSelect.addEventListener('change', () => this.#onScaleSelect());
    this.#scaleTypeSelect.addEventListener('change', () => this.#onScaleSelect());
    this.#playScaleBtn.addEventListener('click', () => this.#togglePlayScale());
    this.#droneBtn.addEventListener('click', () => this.#toggleDrone());
    this.#loopBtn.addEventListener('click', () => {
      this.#loop = !this.#loop;
      this.#loopBtn.classList.toggle('active', this.#loop);
    });

    this.#populateScaleSelects();

    // Restore persisted scale
    const savedRoot = settings.get('scaleRoot');
    const savedType = settings.get('scaleType');
    if (savedRoot) this.#scaleRootSelect.value = savedRoot;
    if (savedType) this.#scaleTypeSelect.value = savedType;
    this.#applyScale();

    bus.on('pitch', (data) => this.#onPitch(data));
    bus.on('silence', () => this.#onSilence());
    bus.on('settings:changed', ({ key }) => this.#onSettingsChanged(key));

    this.#speedBtn.textContent = this.#graph.speedLabel;
    this.#playScaleBtn.innerHTML = PLAY_ICON;
  }

  /** Dev/test introspection. */
  get graph() {
    return this.#graph;
  }

  activate() {
    this.#graph.wake();
    if (!this.#hasAutoStarted) {
      this.#hasAutoStarted = true;
      this.#startAll();
    }
  }

  deactivate() {
    // Leaving the tab releases the mic (pause semantics: trace is held)
    if (this.#active) this.#pauseAll();
    this.#graph.stopRendering();
    this.#stopPlayScale();
    this.#stopDrone();
  }

  // -------------------------------------------------------------------------
  // Scale + position
  // -------------------------------------------------------------------------

  #populateScaleSelects() {
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'Key: off';
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

  #onScaleSelect() {
    settings.set('scaleRoot', this.#scaleRootSelect.value);
    settings.set('scaleType', this.#scaleTypeSelect.value);
    this.#applyScale();
  }

  #applyScale() {
    const root = this.#scaleRootSelect.value;
    const type = this.#scaleTypeSelect.value;
    const hasScale = !!root;

    this.#graph.setScale(hasScale ? root : null, hasScale ? type : null);
    this.#inKeyEl.hidden = !hasScale;
    this.#playScaleBtn.hidden = !hasScale;
    this.#scaleSettingsEl.hidden = !hasScale;
    this.#droneBtn.disabled = !hasScale;
    this.#updatePosChip();
    this.#resetInKey();
    this.#stopPlayScale();
    if (!hasScale) this.#stopDrone();
  }

  #updatePosChip() {
    const root = this.#scaleRootSelect.value;
    const isHarp = settings.get('instrument') === 'harmonica';
    if (root && isHarp) {
      const { label } = harpPosition(settings.get('harpKey'), root);
      this.#posChipEl.textContent = `${label} POS`;
      this.#posChipEl.hidden = false;
    } else {
      this.#posChipEl.hidden = true;
    }
  }

  #onSettingsChanged(key) {
    if (key === 'instrument' || key === 'harpKey' || key === 'whistleKey') {
      this.#graph.setInstrument(settings.get('instrument'), settings.instrumentKey);
      this.#updatePosChip();
      this.#stopDrone();
    }
    if (key === 'skin' && !this.#active) {
      // themeColors refreshes on the attribute flip; repaint the held frame
      requestAnimationFrame(() => this.#graph.drawStatic());
    }
  }

  // -------------------------------------------------------------------------
  // In-key tracking
  // -------------------------------------------------------------------------

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
    while (trimIdx < this.#inKeySamples.length && this.#inKeySamples[trimIdx].t < cutoff) trimIdx++;
    if (trimIdx > 0) this.#inKeySamples.splice(0, trimIdx);

    if (this.#inKeySamples.length < 5) {
      this.#inKeyValueEl.textContent = '--';
      return;
    }
    let hits = 0;
    for (const s of this.#inKeySamples) if (s.inKey) hits++;
    this.#inKeyValueEl.textContent = `${Math.round((hits / this.#inKeySamples.length) * 100)}%`;
  }

  // -------------------------------------------------------------------------
  // Scale player
  // -------------------------------------------------------------------------

  #togglePlayScale() {
    if (scalePlayer.isPlaying) this.#stopPlayScale();
    else this.#startPlayScale();
  }

  async #startPlayScale() {
    const root = this.#scaleRootSelect.value;
    const type = this.#scaleTypeSelect.value;
    if (!root) return;

    if (!this.#active) {
      await this.#startAll();
      if (!this.#active) return;
    }

    this.#playScaleBtn.classList.add('active');
    this.#playScaleBtn.innerHTML = STOP_ICON;

    const range = getDefaultRange(settings.get('instrument'), settings.instrumentKey);
    await scalePlayer.start({
      rootName: root,
      scaleKey: type,
      noteMs: parseInt(this.#noteDurSelect.value, 10),
      gapMs: parseInt(this.#gapDurSelect.value, 10),
      loop: this.#loop,
      direction: this.#directionSelect.value,
      bottomMidi: range.low + 2,
      topMidi: Math.min(range.low + 26, range.high - 2),
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
    this.#playScaleBtn.classList.remove('active');
    this.#playScaleBtn.innerHTML = PLAY_ICON;
  }

  // -------------------------------------------------------------------------
  // Drone
  // -------------------------------------------------------------------------

  async #toggleDrone() {
    if (this.#droneHandle) {
      this.#stopDrone();
      return;
    }
    const root = this.#scaleRootSelect.value;
    if (!root) return;

    await mic.ensureAudioContext();
    // Drone the scale root near the bottom of the instrument's range
    const range = getDefaultRange(settings.get('instrument'), settings.instrumentKey);
    const rootIndex = ROOT_NAMES.indexOf(root);
    let midi = Math.floor((range.low + 2) / 12) * 12 + rootIndex;
    if (midi < range.low) midi += 12;
    this.#droneHandle = startDrone(midi, { voice: settings.get('droneVoice'), gain: 0.55 });
    this.#droneBtn.classList.add('active');
  }

  #stopDrone() {
    if (this.#droneHandle) {
      this.#droneHandle.stop();
      this.#droneHandle = null;
    }
    this.#droneBtn.classList.remove('active');
  }

  // -------------------------------------------------------------------------
  // Mic lifecycle — pause holds the trace
  // -------------------------------------------------------------------------

  async #toggleMic() {
    if (this.#active) this.#pauseAll();
    else await this.#startAll();
  }

  async #handleCenterTap() {
    const wasActive = this.#active;
    await this.#toggleMic();
    if (this.#active !== wasActive) this.#showPauseFlash(this.#active);
  }

  #showPauseFlash(isPlaying) {
    if (!this.#pauseFlashEl) return;
    this.#pauseFlashEl.innerHTML = isPlaying ? PLAY_ICON : PAUSE_ICON;
    this.#pauseFlashEl.classList.remove('flash');
    void this.#pauseFlashEl.offsetWidth;
    this.#pauseFlashEl.classList.add('flash');
  }

  async #startAll() {
    try {
      await mic.start();
      detector.start();
      if (this.#started) {
        this.#graph.resume();
      } else {
        this.#graph.begin();
        this.#started = true;
      }
      this.#active = true;

      this.#micToggle.classList.add('active');
      this.#micToggle.innerHTML = PAUSE_ICON;
      this.#micToggle.setAttribute('aria-label', 'Pause listening');
      this.#pausedTagEl.hidden = true;
      setStatus('LIVE', true);
      this.#startInKeyTimer();
    } catch (err) {
      setStatus('MIC ERR', false);
      if (err.name === 'NotAllowedError') showToast('Microphone access denied.');
      else if (err.name === 'NotFoundError') showToast('No microphone found.');
      else showToast('Could not access microphone.');
    }
  }

  /** Pause: stop the mic, freeze the clock, keep the trace. */
  #pauseAll() {
    detector.stop();
    mic.stop();
    this.#graph.pause();
    this.#active = false;

    this.#micToggle.classList.remove('active');
    this.#micToggle.innerHTML = MIC_ICON;
    this.#micToggle.setAttribute('aria-label', 'Resume listening');
    this.#pausedTagEl.hidden = false;
    setStatus('PAUSED', false);

    this.#hudEl.classList.remove('lit');
    this.#stopInKeyTimer();
    this.#stopPlayScale();
  }

  #cycleSpeed() {
    this.#graph.setSpeed((this.#graph.speedIndex + 1) % 5);
    this.#speedBtn.textContent = this.#graph.speedLabel;
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  #onPitch(data) {
    if (!this.#active) return;

    // Note + native token
    this.#hudEl.classList.add('lit');
    this.#hudNoteEl.innerHTML = `${data.note}<span style="opacity:.55">${data.octave}</span>`;

    const inst = settings.get('instrument');
    const native = describePitch(inst, settings.instrumentKey, data.midi);
    this.#hudNativeEl.textContent = native ? native.token : '';
    this.#hudNativeEl.classList.toggle('hud__native--dots', native?.kind === 'fingering');

    // Sub line: signed cents + native description
    const centsClass = Math.abs(data.cents) <= 10 ? 'in-tune' : Math.abs(data.cents) <= 25 ? 'close' : 'off';
    const sign = data.cents > 0 ? '+' : '';
    const parts = [`<span class="${centsClass}">${sign}${data.cents}&cent;</span>`];
    if (native?.desc) parts.push(native.desc);
    this.#hudSubEl.innerHTML = parts.join(' &middot; ');

    // Hold tracking
    const now = performance.now();
    if (data.midi === this.#holdMidi) {
      this.#holdCentsSum += data.cents;
      this.#holdCount++;
      const heldMs = now - this.#holdStart;
      if (heldMs >= HOLD_MIN_MS) {
        const avg = Math.round(this.#holdCentsSum / this.#holdCount);
        const avgSign = avg > 0 ? '+' : '';
        this.#hudHoldEl.textContent = `HELD ${(heldMs / 1000).toFixed(1)}S / AVG ${avgSign}${avg}¢`;
      }
    } else {
      this.#holdMidi = data.midi;
      this.#holdStart = now;
      this.#holdCentsSum = data.cents;
      this.#holdCount = 1;
    }
    if (this.#holdClearTimer) {
      clearTimeout(this.#holdClearTimer);
      this.#holdClearTimer = null;
    }

    // In-key sampling
    const root = this.#scaleRootSelect.value;
    if (root) {
      this.#inKeySamples.push({ t: now, inKey: isInScale(data.midi, root, this.#scaleTypeSelect.value) });
    }
  }

  #onSilence() {
    if (!this.#active) return;
    this.#hudEl.classList.remove('lit');
    this.#holdMidi = null;
    if (!this.#holdClearTimer) {
      this.#holdClearTimer = setTimeout(() => {
        this.#hudHoldEl.textContent = '';
        this.#holdClearTimer = null;
      }, HOLD_LINGER_MS);
    }
  }
}

export const graphView = new GraphView();
