/**
 * instruments.test.js — Run with: node --test js/utils/
 * Covers native label maps, harp positions, ranges, and calibration math.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNativeMap, getDefaultRange, harpPosition, describePitch, a4FromOffset,
} from './instruments.js';

// --- Harmonica label map (C harp: hole 1 blow = C4 = MIDI 60) ---------------

test('C harp: blow and draw tokens land on the right midis', () => {
  const map = getNativeMap('harmonica', 'C');
  assert.equal(map.get(60).token, '1');    // C4 blow 1
  assert.equal(map.get(62).token, '-1');   // D4 draw 1
  assert.equal(map.get(72).token, '4');    // C5 blow 4
  assert.equal(map.get(74).token, '-4');   // D5 draw 4
  assert.equal(map.get(96).token, '10');   // C7 blow 10
});

test('C harp: bends get tick marks and bend kind', () => {
  const map = getNativeMap('harmonica', 'C');
  assert.equal(map.get(61).token, "-1'");   // C#4 = draw 1 half-step bend
  assert.equal(map.get(73).token, "-4'");   // C#5 = draw 4 half-step bend
  assert.equal(map.get(73).kind, 'bend');
  assert.equal(map.get(70).token, "-3'");   // Bb4
  assert.equal(map.get(69).token, "-3''");  // A4
  assert.equal(map.get(68).token, "-3'''"); // Ab4
  assert.equal(map.get(90).token, "9'");    // F#6 blow bend
});

test('C harp: duplicated pitch shows both enharmonic holes', () => {
  const map = getNativeMap('harmonica', 'C');
  // G4 (67) is hole 3 blow AND hole 2 draw (blows registered first)
  assert.equal(map.get(67).token, '3/-2');
});

test('C harp: true richter gaps have no token', () => {
  const map = getNativeMap('harmonica', 'C');
  assert.equal(map.get(63), undefined); // Eb4 unplayable without overblow
});

test('A harp map transposes with the key', () => {
  const map = getNativeMap('harmonica', 'A');
  assert.equal(map.get(57).token, '1');  // A3 blow 1
  assert.equal(map.get(69).token, '4');  // A4 blow 4
});

// --- Whistle fingerings ------------------------------------------------------

test('D whistle: bell note and scale fingerings', () => {
  const map = getNativeMap('whistle', 'D');
  assert.equal(map.get(74).token, '●●●●●●'); // D5 all closed
  assert.equal(map.get(76).token, '●●●●●○'); // E5
  assert.equal(map.get(78).token, '●●●●○○'); // F#5
  assert.equal(map.get(83).token, '●○○○○○'); // B5
  assert.equal(map.get(85).token, '○○○○○○'); // C#6
  assert.equal(map.get(84).token, '○●●○○○'); // C natural cross-fingering
  assert.equal(map.get(86).token, '○●●●●●'); // 2nd octave D vents top hole
  assert.equal(map.get(75), undefined);      // Eb5 = half-holed, no token
});

test('Low D whistle sits an octave under soprano D', () => {
  const map = getNativeMap('whistle', 'Low D');
  assert.equal(map.get(62).token, '●●●●●●'); // D4
});

// --- Ranges ------------------------------------------------------------------

test('default ranges hug the instrument', () => {
  const harp = getDefaultRange('harmonica', 'C');
  assert.equal(harp.low, 58);
  assert.equal(harp.high, 98);
  const whistle = getDefaultRange('whistle', 'D');
  assert.equal(whistle.low, 72);
  assert.equal(whistle.high, 100);
  const voice = getDefaultRange('voice', null);
  assert.ok(voice.high - voice.low >= 24);
});

// --- Harp positions ------------------------------------------------------------

test('harp positions follow the circle of fifths', () => {
  assert.deepEqual(harpPosition('C', 'C'), { position: 1, label: '1st' });
  assert.deepEqual(harpPosition('C', 'G'), { position: 2, label: '2nd' });
  assert.deepEqual(harpPosition('C', 'D'), { position: 3, label: '3rd' });
  assert.deepEqual(harpPosition('C', 'A'), { position: 4, label: '4th' });
  assert.deepEqual(harpPosition('C', 'F'), { position: 12, label: '12th' });
  assert.deepEqual(harpPosition('A', 'E'), { position: 2, label: '2nd' });
  // Flat-named harp keys resolve too
  assert.deepEqual(harpPosition('Bb', 'F'), { position: 2, label: '2nd' });
});

// --- describePitch -------------------------------------------------------------

test('describePitch returns HUD-ready info', () => {
  const d = describePitch('harmonica', 'C', 74);
  assert.equal(d.token, '-4');
  assert.equal(d.desc, 'draw 4');
  assert.equal(describePitch('voice', null, 74), null);
  assert.equal(describePitch('harmonica', 'C', 63), null);
});

// --- Calibration ----------------------------------------------------------------

test('a4FromOffset moves the reference by the measured cents', () => {
  assert.ok(Math.abs(a4FromOffset(440, 0) - 440) < 1e-9);
  const sharp12 = a4FromOffset(440, 12);   // instrument reads +12¢ → raise ref
  assert.ok(sharp12 > 442.9 && sharp12 < 443.2);
  const flat25 = a4FromOffset(440, -25);
  assert.ok(flat25 > 433.5 && flat25 < 433.8);
});
