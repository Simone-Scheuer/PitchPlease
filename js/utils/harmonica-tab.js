/**
 * harmonica-tab.js — Harmonica tab notation parser.
 *
 * Owns the notation; `harmonica.js` owns the music math. Converts a tab
 * string into an ordered list of target tokens the trainer can verify against,
 * and back again.
 *
 * Notation (Harp Tab / tomlin convention):
 *   - Whitespace-separated tokens. `|` bar lines are ignored.
 *   - Plain number = blow.            "4"    → blow hole 4
 *   - Leading "-"   = draw.           "-4"   → draw hole 4
 *   - Trailing "'"  = bend depth in semitone steps (direction comes from the
 *     sign, so apostrophes only encode how deep).
 *                                     "-3'"  → draw hole 3, bent down 1
 *                                     "-3''" → draw hole 3, bent down 2
 *                                     "9'"   → blow hole 9, bent down 1
 *
 * Pure module — no DOM, no audio, no event bus.
 */

import { getHoleLayout, getBendsForHole } from './harmonica.js';

/** One token's matched form: optional `-`, hole 1–10, optional apostrophes. */
const TOKEN_RE = /^(-?)(10|[1-9])('*)$/;

/**
 * Error thrown when a tab string can't be parsed. Carries the offending token
 * and its position so callers (e.g. the paste box) can show a precise message.
 */
export class TabParseError extends Error {
  constructor(message, token, index) {
    super(message);
    this.name = 'TabParseError';
    this.token = token;
    this.index = index;
  }
}

/**
 * @typedef {Object} TabToken
 * @property {string} raw        - Canonical notation for this token (e.g. "-3'")
 * @property {number} hole       - 1–10
 * @property {'blow'|'draw'} direction
 * @property {number} bendSteps  - 0 = no bend, 1 = one semitone down, …
 * @property {number} midi       - Target MIDI note (resolved for the key)
 * @property {string} note       - Note name with octave (e.g. "A#4")
 * @property {string} label      - Short human label (e.g. "Draw 3 ↓1")
 */

/**
 * Parse a tab string into target tokens for a given harp key.
 *
 * @param {string} str        - Tab notation
 * @param {string} [key='C']  - Harp key (one of HARMONICA_KEYS)
 * @returns {TabToken[]} Empty array if the string has no tokens.
 * @throws {TabParseError} On malformed or physically-impossible tokens.
 */
export function parseTab(str, key = 'C') {
  const layout = getHoleLayout(key); // throws on unknown key
  const tokens = [];

  const rawTokens = String(str).trim().split(/\s+/).filter(Boolean);
  let index = 0;
  for (const raw of rawTokens) {
    if (raw === '|') continue; // bar line — skip
    tokens.push(parseToken(raw, index, key, layout));
    index++;
  }
  return tokens;
}

/**
 * Parse a single token. Internal.
 *
 * @param {string} raw
 * @param {number} index
 * @param {string} key
 * @param {Array} layout - getHoleLayout(key) result, passed in to avoid recompute
 * @returns {TabToken}
 */
function parseToken(raw, index, key, layout) {
  const match = TOKEN_RE.exec(raw);
  if (!match) {
    throw new TabParseError(
      `"${raw}" isn't valid tab. Use e.g. 4 (blow 4), -4 (draw 4), -3' (draw 3 bent).`,
      raw,
      index,
    );
  }

  const direction = match[1] === '-' ? 'draw' : 'blow';
  const hole = Number(match[2]);
  const bendSteps = match[3].length;
  const holeData = layout[hole - 1];

  if (bendSteps === 0) {
    const midi = direction === 'blow' ? holeData.blowMidi : holeData.drawMidi;
    const note = direction === 'blow' ? holeData.blowNote : holeData.drawNote;
    return {
      raw: canonical(direction, hole, 0),
      hole,
      direction,
      bendSteps,
      midi,
      note,
      label: `${cap(direction)} ${hole}`,
    };
  }

  // Bent note: must be a bend that physically exists on this hole + direction.
  const bend = getBendsForHole(key, hole).find(
    b => b.type === direction && b.stepDown === bendSteps,
  );
  if (!bend) {
    throw new TabParseError(
      `${direction} hole ${hole} can't bend ${bendSteps} step${bendSteps > 1 ? 's' : ''} on a ${key} harp.`,
      raw,
      index,
    );
  }

  return {
    raw: canonical(direction, hole, bendSteps),
    hole,
    direction,
    bendSteps,
    midi: bend.midi,
    note: bend.note,
    label: `${cap(direction)} ${hole} ↓${bendSteps}`,
  };
}

/**
 * Serialize tokens back to canonical notation (round-trips with parseTab).
 *
 * @param {TabToken[]} tokens
 * @returns {string}
 */
export function stringifyTab(tokens) {
  return tokens.map(t => canonical(t.direction, t.hole, t.bendSteps)).join(' ');
}

/** Canonical notation string for a token's parts. */
function canonical(direction, hole, bendSteps) {
  return `${direction === 'draw' ? '-' : ''}${hole}${"'".repeat(bendSteps)}`;
}

/** Capitalize 'blow'/'draw'. */
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
