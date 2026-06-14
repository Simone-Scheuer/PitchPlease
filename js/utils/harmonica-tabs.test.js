/**
 * Tests for harmonica-tabs.js. Run with: node --test js/utils/harmonica-tabs.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_TABS, getStarterTab, randomSequence } from './harmonica-tabs.js';
import { parseTab } from './harmonica-tab.js';

/** Deterministic RNG so generator tests are reproducible. */
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

test('every starter tab is valid notation that parses to ≥1 token', () => {
  for (const tab of STARTER_TABS) {
    const tokens = parseTab(tab.tab, tab.key); // throws if any token is bad
    assert.ok(tokens.length > 0, `${tab.id} produced no tokens`);
  }
});

test('getStarterTab looks up by id', () => {
  assert.equal(getStarterTab('ode-to-joy').title, 'Ode to Joy');
  assert.equal(getStarterTab('nope'), null);
});

test('the "first-bend" starter actually contains a bend', () => {
  const tokens = parseTab(getStarterTab('first-bend').tab, 'C');
  assert.ok(tokens.some(t => t.bendSteps > 0), 'expected at least one bent token');
});

test('randomSequence honors length and hole range', () => {
  const tokens = randomSequence({ length: 20, holeRange: [2, 5], rng: seededRng(7) });
  assert.equal(tokens.length, 20);
  for (const t of tokens) {
    assert.ok(t.hole >= 2 && t.hole <= 5, `hole ${t.hole} out of range`);
  }
});

test('randomSequence omits bends unless asked', () => {
  const tokens = randomSequence({ length: 40, includeBends: false, rng: seededRng(3) });
  assert.ok(tokens.every(t => t.bendSteps === 0));
});

test('randomSequence can produce bends when includeBends is on', () => {
  const tokens = randomSequence({
    length: 40,
    holeRange: [1, 6],
    includeBends: true,
    rng: seededRng(3),
  });
  assert.ok(tokens.some(t => t.bendSteps > 0), 'expected some bends over 40 tokens');
});

test('randomSequence is deterministic for a fixed rng', () => {
  const a = randomSequence({ length: 12, rng: seededRng(99) });
  const b = randomSequence({ length: 12, rng: seededRng(99) });
  assert.deepEqual(a, b);
});

test('generated tokens are themselves valid (round-trip through the parser)', () => {
  const tokens = randomSequence({ length: 15, includeBends: true, rng: seededRng(42) });
  // raw strings should re-parse identically — proves canonical, valid output
  const reparsed = parseTab(tokens.map(t => t.raw).join(' '), 'C');
  assert.deepEqual(reparsed, tokens);
});
