/**
 * Tests for harmonica-tab.js. Run with: node --test js/utils/harmonica-tab.test.js
 *
 * No test framework — Node's built-in runner + assert. Modules are pure ES
 * modules with no DOM/audio at import, so they load directly under Node.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTab, stringifyTab, TabParseError } from './harmonica-tab.js';

test('plain blow note → correct hole and MIDI', () => {
  const [t] = parseTab('4');
  assert.equal(t.direction, 'blow');
  assert.equal(t.hole, 4);
  assert.equal(t.bendSteps, 0);
  assert.equal(t.midi, 72); // C5 on a C harp
  assert.equal(t.note, 'C5');
  assert.equal(t.label, 'Blow 4');
});

test('plain draw note → correct hole and MIDI', () => {
  const [t] = parseTab('-4');
  assert.equal(t.direction, 'draw');
  assert.equal(t.hole, 4);
  assert.equal(t.midi, 74); // D5
  assert.equal(t.note, 'D5');
});

test('draw bend, one step', () => {
  const [t] = parseTab('-3\'');
  assert.equal(t.direction, 'draw');
  assert.equal(t.hole, 3);
  assert.equal(t.bendSteps, 1);
  assert.equal(t.midi, 70); // A#4 — one semitone below the draw note (B4)
  assert.equal(t.label, 'Draw 3 ↓1');
});

test('draw bend, two steps', () => {
  const [t] = parseTab('-3\'\'');
  assert.equal(t.bendSteps, 2);
  assert.equal(t.midi, 69); // A4
});

test('blow bend on a high hole', () => {
  const [t] = parseTab('9\'');
  assert.equal(t.direction, 'blow');
  assert.equal(t.hole, 9);
  assert.equal(t.bendSteps, 1);
  assert.equal(t.midi, 90); // F#6 — one below blow G6 (91)
});

test('sequence of mixed tokens', () => {
  const tokens = parseTab('4 -4 -3\'');
  assert.equal(tokens.length, 3);
  assert.deepEqual(tokens.map(t => t.direction), ['blow', 'draw', 'draw']);
});

test('bar lines are ignored', () => {
  const tokens = parseTab('4 | -4 | 4');
  assert.equal(tokens.length, 3);
});

test('newlines and extra whitespace tolerated', () => {
  const tokens = parseTab('  4\n-4   4  ');
  assert.equal(tokens.length, 3);
});

test('empty string parses to no tokens', () => {
  assert.deepEqual(parseTab(''), []);
  assert.deepEqual(parseTab('   \n  '), []);
});

test('different key transposes targets', () => {
  const [c] = parseTab('1', 'C'); // C4 = 60
  const [a] = parseTab('1', 'A'); // A3 = 57
  assert.equal(c.midi, 60);
  assert.equal(a.midi, 57);
});

test('round-trips through stringifyTab', () => {
  const src = '4 -4 -3\' 9\'';
  assert.equal(stringifyTab(parseTab(src)), src);
});

// --- error cases: the parser must reject, not silently mangle ---

test('garbage token throws TabParseError', () => {
  assert.throws(() => parseTab('4 x -4'), TabParseError);
});

test('hole out of range throws', () => {
  assert.throws(() => parseTab('11'), TabParseError);
  assert.throws(() => parseTab('0'), TabParseError);
});

test('physically impossible bend depth throws', () => {
  // hole 4 draw bends only 1 step on a C harp
  assert.throws(() => parseTab('-4\'\''), TabParseError);
});

test('blow bend on a low hole throws', () => {
  // blow bends live on holes 7–10; hole 4 blow can\'t bend
  assert.throws(() => parseTab('4\''), TabParseError);
});

test('error carries the offending token and index', () => {
  try {
    parseTab('4 -4 zzz');
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e instanceof TabParseError);
    assert.equal(e.token, 'zzz');
    assert.equal(e.index, 2);
  }
});

test('unknown harp key throws', () => {
  assert.throws(() => parseTab('4', 'H'));
});
