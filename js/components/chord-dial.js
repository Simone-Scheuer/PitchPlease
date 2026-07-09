/**
 * chord-dial.js — Radial chord selector: two concentric rings + a center.
 *
 * Outer ring: 12 roots in circle-of-fifths order (C at 12 o'clock —
 * neighbors are musically adjacent, cross-harp keys sit next door).
 * Inner ring: 8 chord qualities. Center: play/stop + current chord name.
 *
 * Pure SVG, colored by CSS custom properties, so it reskins with the app.
 */

import { NOTE_NAMES } from '../utils/constants.js';
import { CHORD_QUALITIES } from '../audio/drone-synth.js';

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const ROOT_OUTER = 158;
const ROOT_INNER = 116;
const QUAL_OUTER = 112;
const QUAL_INNER = 70;
const CENTER_R = 62;

/** Circle of fifths, C at the top. */
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

const NS = 'http://www.w3.org/2000/svg';

function polar(r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** Annular sector path between two radii from a1 to a2 degrees. */
function sectorPath(rOuter, rInner, a1, a2) {
  const [x1, y1] = polar(rOuter, a1);
  const [x2, y2] = polar(rOuter, a2);
  const [x3, y3] = polar(rInner, a2);
  const [x4, y4] = polar(rInner, a1);
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} ` +
         `L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;
}

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export class ChordDial {
  #svg;
  #rootGroups = new Map();   // rootIndex -> <g>
  #qualGroups = new Map();   // qualityKey -> <g>
  #centerCircle;
  #centerLabel;
  #centerSub;
  #onSelect;
  #onCenterTap;
  #rootIndex = 0;
  #quality = 'maj';
  #scaleRoot = null;
  #scaleMarkers = new Map(); // rootIndex -> marker circle

  constructor(svg, { onSelect, onCenterTap } = {}) {
    this.#svg = svg;
    this.#onSelect = onSelect ?? null;
    this.#onCenterTap = onCenterTap ?? null;
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.classList.add('dial');
    this.#build();
    this.setSelection(0, 'maj');
  }

  #build() {
    // Roots ring — circle of fifths
    for (let i = 0; i < 12; i++) {
      const rootIndex = FIFTHS[i];
      const a1 = i * 30 - 15 + 1;
      const a2 = i * 30 + 15 - 1;
      const g = el('g', { class: 'dial__seg dial__seg--root' }, this.#svg);
      el('path', { d: sectorPath(ROOT_OUTER, ROOT_INNER, a1, a2) }, g);
      const [lx, ly] = polar((ROOT_OUTER + ROOT_INNER) / 2, i * 30);
      const label = el('text', { x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      label.textContent = NOTE_NAMES[rootIndex];
      // In-key marker dot (hidden unless this root is the selected scale root)
      const [mx, my] = polar(ROOT_INNER + 9, i * 30);
      const marker = el('circle', { cx: mx, cy: my, r: 2.5, class: 'dial__marker', opacity: 0 }, g);
      this.#scaleMarkers.set(rootIndex, marker);

      g.addEventListener('click', () => {
        this.#onSelect?.(rootIndex, this.#quality);
      });
      this.#rootGroups.set(rootIndex, g);
    }

    // Quality ring
    const qualities = Object.keys(CHORD_QUALITIES);
    const span = 360 / qualities.length;
    qualities.forEach((key, i) => {
      const a1 = i * span - span / 2 + 1.5;
      const a2 = i * span + span / 2 - 1.5;
      const g = el('g', { class: 'dial__seg dial__seg--qual' }, this.#svg);
      el('path', { d: sectorPath(QUAL_OUTER, QUAL_INNER, a1, a2) }, g);
      const [lx, ly] = polar((QUAL_OUTER + QUAL_INNER) / 2, i * span);
      const label = el('text', { x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      label.textContent = CHORD_QUALITIES[key].label;

      g.addEventListener('click', () => {
        this.#onSelect?.(this.#rootIndex, key);
      });
      this.#qualGroups.set(key, g);
    });

    // Center: play/stop
    const center = el('g', { class: 'dial__center' }, this.#svg);
    this.#centerCircle = el('circle', { cx: CX, cy: CY, r: CENTER_R }, center);
    this.#centerLabel = el('text', {
      x: CX, y: CY - 6, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dial__chord',
    }, center);
    this.#centerSub = el('text', {
      x: CX, y: CY + 20, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dial__sub',
    }, center);
    this.#centerSub.textContent = 'TAP TO PLAY';
    center.addEventListener('click', () => this.#onCenterTap?.());
  }

  /** Highlight the selection (does not trigger callbacks). */
  setSelection(rootIndex, quality) {
    this.#rootIndex = ((rootIndex % 12) + 12) % 12;
    this.#quality = quality;
    for (const [idx, g] of this.#rootGroups) {
      g.classList.toggle('selected', idx === this.#rootIndex);
    }
    for (const [key, g] of this.#qualGroups) {
      g.classList.toggle('selected', key === this.#quality);
    }
  }

  setCenterLabel(text) {
    this.#centerLabel.textContent = text;
  }

  setPlaying(playing) {
    this.#svg.classList.toggle('dial--playing', playing);
    this.#centerSub.textContent = playing ? 'TAP TO STOP' : 'TAP TO PLAY';
  }

  /** Mark the graph's selected scale root on the ring (null clears). */
  setScaleRoot(rootIndex) {
    this.#scaleRoot = rootIndex;
    for (const [idx, marker] of this.#scaleMarkers) {
      marker.setAttribute('opacity', idx === rootIndex ? 1 : 0);
    }
  }

  get selection() {
    return { rootIndex: this.#rootIndex, quality: this.#quality };
  }
}
