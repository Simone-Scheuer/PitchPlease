/**
 * harmonica-tabs.js — Built-in starter tabs and the random-sequence generator.
 *
 * Two of the three v1 tab *sources* (the third is the paste box, which lives in
 * the view). Both produce material the trainer consumes the same way: built-in
 * tabs are notation strings parsed on demand; randomSequence returns tokens
 * directly. Everything routes through parseTab, so the parser stays the single
 * source of validation.
 *
 * Pure module — no DOM, no audio, no event bus.
 */

import { getBendsForHole } from './harmonica.js';
import { parseTab } from './harmonica-tab.js';

/**
 * @typedef {Object} StarterTab
 * @property {string} id
 * @property {string} title
 * @property {string} key        - Harp key the notation is written for
 * @property {'easy'|'medium'} difficulty
 * @property {string} tab        - Notation string (parse with parseTab(tab, key))
 * @property {string} [note]     - Optional teaching note shown before play
 */

/**
 * Starter tabs. Mostly clean blow/draw so a beginner isn't wall-climbing, plus
 * one gentle hole-4 draw bend to introduce bending without throwing them in the
 * deep end. All written for a C harp (the default / Simone's harp).
 *
 * @type {StarterTab[]}
 */
export const STARTER_TABS = [
  {
    id: 'mary-had-a-little-lamb',
    title: 'Mary Had a Little Lamb',
    key: 'C',
    difficulty: 'easy',
    // E D C D E E E | D D D | E G G | E D C D | E E E E | D D E D | C
    tab: '2 -1 1 -1 2 2 2 -1 -1 -1 2 -2 -2 2 -1 1 -1 2 2 2 2 -1 -1 2 -1 1',
    note: 'All blow and draw on holes 1 and 2. Get comfortable moving between them.',
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    key: 'C',
    difficulty: 'easy',
    // E E F G G F E D C C D E E D D
    tab: '5 5 -5 6 6 -5 5 -4 4 4 -4 5 5 -4 -4',
    note: 'Sits in the middle of the harp, holes 4 to 6. Clean blow/draw, no bends.',
  },
  {
    id: 'first-bend',
    title: 'First Bend',
    key: 'C',
    difficulty: 'medium',
    // walk into the hole-4 draw bend (C#5) and back out
    tab: "4 -4 -4' -4 4 -4 -4' 4",
    note: "The -4' is a hole-4 draw bend down a semitone. Ease into it, then release.",
  },
  {
    id: 'country-roads',
    title: 'Country Roads',
    key: 'C',
    difficulty: 'easy',
    // "Country roads, take me home…" chorus, from harptabs. Ear-check.
    tab: '7 -8 8 8 7 -8 8 -8 7 8 9 -10 -10 -10 9 8 8 -8 7 -8 8 -8 7 7 -8 7',
    note: 'The chorus, up in holes 7–10. Big jumps to -10 — take them slow.',
  },
  {
    id: 'hallelujah',
    title: 'Hallelujah',
    key: 'C',
    difficulty: 'easy',
    // Full first verse + chorus, from harptabs. Ear-check.
    tab: '5 6 6 6 6 -6 -6 -6 5 6 6 6 6 6 -6 -6 -6 6 -6 -6 -6 -6 -6 6 6 -5 6 6 5 6 6 6 6 -6 -6 -7 6 7 7 -6 7 7 -8 7 -8 -8 -8 -8 8 8 8 -8 -8 7 7 5 6 -6 -6 -6 6 5 5 5 6 -6 -6 -6 6 5 -5 5 -4 4 -3 4',
    note: 'Long one. Sits mostly on 6 and -6 — clean single notes are the whole game.',
  },
  {
    id: 'piano-man',
    title: 'Piano Man',
    key: 'C',
    difficulty: 'easy',
    // Single-note melody (verses + chorus), from harptabs. Ear-check.
    tab: '6 6 6 6 -5 5 -5 5 4 4 4 4 4 4 4 -4 -4 6 6 6 6 -5 5 -5 5 4 3 3 3 -5 -5 -5 5 4 4 9 9 9 9 9 9 -9 8 -9 8 7 7 7 7 7 7 -8 -8 -8',
    note: 'Quick blow/draw flips like -5→5. The high run (9 9 9…-9) needs steady breath.',
  },
  {
    id: 'over-the-rainbow',
    title: 'Over the Rainbow',
    key: 'C',
    difficulty: 'easy',
    // From harptabs. Ear-check.
    tab: '4 7 -7 6 -6 -7 7 4 -6 6 4 -6 6 5 -5 6 -6 -4 -3 4 -4 5 4 6 5 6 5 6 5 6 5 6 -5 6 -5 6 -5 6 -5 6 -5 6 -6 -7',
    note: 'That octave leap up to 7 at the start is the signature — nail the jump.',
  },
  {
    id: 'blowin-in-the-wind',
    title: "Blowin' in the Wind",
    key: 'C',
    difficulty: 'easy',
    // From harptabs. Ear-check.
    tab: '6 6 6 -6 6 -5 6 5 -4 4 5 6 6 -6 6 -5 6 5 -5 6 6 6 -6 6 -5 6 5 -4 4 5 6 5 -5 -5 5 -4 5 -5 6 6 6 -6 6 -5 6 6 5 -4 4',
    note: 'Gentle, stepwise — good for smooth hole-to-hole movement.',
  },
  {
    id: 'house-of-the-rising-sun',
    title: 'House of the Rising Sun',
    key: 'C',
    difficulty: 'easy',
    // First verse, from harptabs. Ear-check.
    tab: '5 -6 -7 7 8 -8 -6 -6 -10 -10 -10 9 8 8 -10 -10 -10 -7 7 8 -8 -6 -6 -6 -6 -6 -6 -6 6 5 6 -6',
    note: 'Ranges from hole 5 up to -10 — covers most of the harp.',
  },
];

/** Look up a starter tab by id. */
export function getStarterTab(id) {
  return STARTER_TABS.find(t => t.id === id) ?? null;
}

/**
 * Generate a random tab sequence within constraints.
 *
 * Builds candidate notation per hole and parses the result, so every token is
 * validated and canonical exactly like a built-in or pasted tab.
 *
 * @param {Object} [opts]
 * @param {string}  [opts.key='C']
 * @param {[number, number]} [opts.holeRange=[1, 6]] - Inclusive hole bounds
 * @param {number}  [opts.length=8]      - Number of tokens
 * @param {boolean} [opts.includeBends=false]
 * @param {() => number} [opts.rng=Math.random] - Injectable for deterministic tests
 * @returns {import('./harmonica-tab.js').TabToken[]}
 */
export function randomSequence({
  key = 'C',
  holeRange = [1, 6],
  length = 8,
  includeBends = false,
  rng = Math.random,
} = {}) {
  const [lo, hi] = holeRange;
  const raws = [];

  for (let i = 0; i < length; i++) {
    const hole = lo + Math.floor(rng() * (hi - lo + 1));
    const candidates = [`${hole}`, `-${hole}`]; // blow, draw — always available

    if (includeBends) {
      for (const bend of getBendsForHole(key, hole)) {
        candidates.push(
          `${bend.type === 'draw' ? '-' : ''}${hole}${"'".repeat(bend.stepDown)}`,
        );
      }
    }

    raws.push(candidates[Math.floor(rng() * candidates.length)]);
  }

  return parseTab(raws.join(' '), key);
}
