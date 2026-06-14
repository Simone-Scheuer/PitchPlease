/**
 * tab-runner.js — Advancement controller for the harmonica tab trainer.
 *
 * Purpose-built for reading practice; deliberately NOT the shared
 * exercise-runtime (which advances on play, scores, plays reference tones, and
 * can't step backward). This owns just the cursor + the onset-gated advance
 * logic, plus manual nav and a live hold dial.
 *
 * Onset gating — the release requirement comes from the AUDIO, not the tab:
 *   A note only starts counting once the player *arrives* at it (a transition
 *   into the target pitch from silence or a different pitch). So a different
 *   next note flows on the pitch change, but a repeated same note requires a
 *   release + re-attack — no sustaining one breath through six identical notes.
 *
 * Pure logic: no DOM, no audio, no event bus, no rAF. The view feeds it pitch /
 * silence frames and reads render state back. `now` is injectable for tests.
 */

const DEFAULT_TOLERANCE = 40;     // cents — reading is hole-finding, generous
const DEFAULT_HOLD_MS = 250;
const MAX_JUMP_SEMITONES = 5;     // reject single-frame detector spikes

/**
 * @param {import('../utils/harmonica-tab.js').TabToken[]} tokens
 * @param {Object} [opts]
 * @param {number} [opts.tolerance=40]   - cents window for "on this note"
 * @param {number} [opts.holdMs=250]     - sustained-on-note time to advance
 * @param {() => number} [opts.now]      - clock (injectable for tests)
 * @param {(cursor:number, count:number) => void} [opts.onAdvance]
 * @param {(count:number) => void} [opts.onComplete] - reached the end
 */
export function createTabRunner(tokens, opts = {}) {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const now = opts.now ?? (() => performance.now());
  const onAdvance = opts.onAdvance ?? (() => {});
  const onComplete = opts.onComplete ?? (() => {});

  let holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
  let cursor = 0;
  let armed = false;          // have we detected an onset for the current note?
  let prevInZone = false;     // was the last frame inside the current target zone
  let inTuneSince = null;     // start of the current continuous in-zone streak
  let lastPlayerMidi = null;  // for the jump filter and re-arm on nav
  let absCents = null;        // last measured deviation (for rendering)
  let hasPitch = false;
  let done = false;

  function target() {
    return cursor < tokens.length ? tokens[cursor] : null;
  }

  function centsTo(playerMidi, tgt) {
    return Math.abs((playerMidi - tgt.midi) * 100);
  }

  /** Reset per-note gate state. prevInZone seeds from the held pitch so a
   *  repeat of the same note stays gated until the player releases. */
  function rearm() {
    armed = false;
    inTuneSince = null;
    const tgt = target();
    prevInZone = tgt != null && lastPlayerMidi != null
      ? centsTo(lastPlayerMidi, tgt) <= tolerance
      : false;
  }

  function advance() {
    cursor += 1;
    if (cursor >= tokens.length) {
      done = true;
      onComplete(tokens.length);
      return;
    }
    rearm();
    onAdvance(cursor, tokens.length);
  }

  return {
    /** Feed one detected pitch frame. */
    feedPitch(pitchData) {
      hasPitch = true;
      const tgt = target();
      if (done || tgt == null) return;

      const playerMidi = pitchData.midi + (pitchData.cents || 0) / 100;

      // Reject single-frame spikes (octave jumps / detector glitches).
      if (lastPlayerMidi != null
        && Math.abs(playerMidi - lastPlayerMidi) > MAX_JUMP_SEMITONES) {
        return;
      }
      lastPlayerMidi = playerMidi;

      const cents = centsTo(playerMidi, tgt);
      absCents = cents;
      const inZone = cents <= tolerance;
      const cursorBefore = cursor;

      // Onset: arrived in the zone from outside it (silence or another pitch).
      if (!armed && inZone && !prevInZone) {
        armed = true;
        inTuneSince = now();
      }

      if (armed) {
        if (inZone) {
          if (inTuneSince == null) inTuneSince = now();
          else if (now() - inTuneSince >= holdMs) advance();
        } else {
          inTuneSince = null; // hold must be continuous; stays armed
        }
      }

      // Don't clobber the gate state advance()/rearm() just set for a new note —
      // inZone here was measured against the old target.
      if (cursor === cursorBefore) prevInZone = inZone;
    },

    /** Feed a silence frame — releases the gate so the next note can onset. */
    feedSilence() {
      hasPitch = false;
      absCents = null;
      prevInZone = false;
      inTuneSince = null;
      lastPlayerMidi = null;
    },

    /** Manual nav — step without playing. Lands disarmed (won't auto-fire). */
    next() {
      if (cursor < tokens.length - 1) { cursor += 1; done = false; rearm(); }
    },
    prev() {
      if (cursor > 0) { cursor -= 1; done = false; rearm(); }
      else if (done) { done = false; rearm(); }
    },

    setHoldMs(ms) { holdMs = ms; },

    /** Restart from the top. */
    reset() {
      cursor = 0;
      done = false;
      lastPlayerMidi = null;
      absCents = null;
      hasPitch = false;
      rearm();
      prevInZone = false; // first note needs no pre-release
    },

    getCursor() { return cursor; },
    getNoteCount() { return tokens.length; },
    isDone() { return done; },

    /** Snapshot for the renderer each frame. */
    getRenderState() {
      const elapsed = armed && inTuneSince != null ? now() - inTuneSince : 0;
      return {
        cursor,
        noteCount: tokens.length,
        done,
        hasPitch,
        absCents,
        armed,
        holdProgress: Math.max(0, Math.min(1, elapsed / holdMs)),
      };
    },
  };
}
