/**
 * Tests for tab-runner.js. Run with: node --test js/core/tab-runner.test.js
 *
 * The onset gating is the whole point, so it gets the most coverage: a repeated
 * note must NOT advance without a release, a different note must flow without
 * one. An injectable clock makes the hold timing deterministic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTabRunner } from './tab-runner.js';
import { parseTab } from '../utils/harmonica-tab.js';

/** Controllable clock. */
function makeClock() {
  let t = 0;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  return fn;
}

/** Pitch frame at an exact MIDI (integer target → cents 0). */
function pf(midi) {
  const m = Math.round(midi);
  return { midi: m, cents: Math.round((midi - m) * 100) };
}

test('first note advances after the hold', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('4 -4', 'C'), { holdMs: 250, now: clock });
  r.feedPitch(pf(72));          // C5, onset
  clock.advance(300);
  r.feedPitch(pf(72));          // held long enough → advance
  assert.equal(r.getCursor(), 1);
});

test('repeated note does NOT advance without a release (the core fix)', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('4 4', 'C'), { holdMs: 250, now: clock });
  // play and hold the first 4 → advances to the second 4
  r.feedPitch(pf(72));
  clock.advance(300);
  r.feedPitch(pf(72));
  assert.equal(r.getCursor(), 1);

  // keep holding the SAME pitch — must not swipe through the second 4
  clock.advance(1000);
  r.feedPitch(pf(72));
  clock.advance(1000);
  r.feedPitch(pf(72));
  assert.equal(r.getCursor(), 1, 'sustained breath swiped through a repeat');

  // release, then re-attack → now it advances
  r.feedSilence();
  r.feedPitch(pf(72));          // onset after release
  clock.advance(300);
  r.feedPitch(pf(72));
  assert.ok(r.isDone(), 'second note never accepted after a clean re-attack');
});

test('different consecutive notes flow without an explicit release', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('4 -4', 'C'), { holdMs: 250, now: clock });
  r.feedPitch(pf(72));
  clock.advance(300);
  r.feedPitch(pf(72));          // advance to -4 (D5, 74)
  assert.equal(r.getCursor(), 1);
  // move straight to the new pitch — the change itself is the onset
  r.feedPitch(pf(74));
  clock.advance(300);
  r.feedPitch(pf(74));
  assert.ok(r.isDone());
});

test('leaving and returning to a different note re-onsets cleanly', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('-4 4 -4', 'C'), { holdMs: 200, now: clock });
  const seq = [74, 72, 74];
  let midiIdx = 0;
  for (const m of seq) {
    r.feedPitch(pf(m));
    clock.advance(250);
    r.feedPitch(pf(m));
    midiIdx++;
  }
  assert.ok(r.isDone(), 'a clean three-note run did not complete');
});

test('a single-frame spike does not break the hold', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('4', 'C'), { holdMs: 250, now: clock });
  r.feedPitch(pf(72));          // onset
  clock.advance(100);
  r.feedPitch(pf(84));          // +12 semitone glitch → ignored
  clock.advance(200);
  r.feedPitch(pf(72));          // 300ms total in-tune → advance/complete
  assert.ok(r.isDone());
});

test('manual next/prev steps the cursor without playing', () => {
  const r = createTabRunner(parseTab('4 -4 5', 'C'));
  assert.equal(r.getCursor(), 0);
  r.next();
  r.next();
  assert.equal(r.getCursor(), 2);
  r.prev();
  assert.equal(r.getCursor(), 1);
  assert.ok(!r.isDone());
});

test('next() does not auto-advance on its own', () => {
  const r = createTabRunner(parseTab('4 -4', 'C'));
  r.next();
  assert.equal(r.getCursor(), 1);
  assert.ok(!r.isDone(), 'manual nav should never complete the exercise');
});

test('setHoldMs changes the advance threshold live', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('4 -4', 'C'), { holdMs: 1000, now: clock });
  r.setHoldMs(100);
  r.feedPitch(pf(72));
  clock.advance(150);
  r.feedPitch(pf(72));
  assert.equal(r.getCursor(), 1, 'shorter hold should advance sooner');
});

test('reset returns to the top and clears gate state', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('4 -4', 'C'), { holdMs: 200, now: clock });
  r.feedPitch(pf(72));
  clock.advance(250);
  r.feedPitch(pf(72));
  assert.equal(r.getCursor(), 1);
  r.reset();
  assert.equal(r.getCursor(), 0);
  assert.ok(!r.isDone());
});

test('holdProgress reflects partial hold for the renderer', () => {
  const clock = makeClock();
  const r = createTabRunner(parseTab('4', 'C'), { holdMs: 400, now: clock });
  r.feedPitch(pf(72));          // onset at t=0
  clock.advance(200);
  r.feedPitch(pf(72));          // halfway
  const s = r.getRenderState();
  assert.ok(s.holdProgress > 0.4 && s.holdProgress < 0.6, `progress ${s.holdProgress}`);
});
