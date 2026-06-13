# Fixes — running inbox — PitchPlease

*Quick-capture for small fixes that don't need a full SPEC. ☐ reported · ◐ fixing · ✅ shipped.*

---

- ✅ **P0 "app fries" bug — diagnosed AND fixed 2026-06-12** (verified in Chrome: mic-wait state with live tab bar, error message on 10s timeout, End Session exits from any state, mid-wait escape leaves no zombie, triple-fire re-entry yields one clean session, drone/session views truly `display:none` when inactive). Happy path (mic granted) still needs one manual session on Simone's machine. Original diagnosis below: Root cause chain in `session-view.js activate()` (line 85-135): view is shown and tab bar hidden FIRST, then `await mic.start()` (line 117) with no timeout/catch/cancellation, and only THEN is the runner created. Consequences, all verified:
  1. **Bricked session**: mic prompt pending/denied → blank session screen, tab bar hidden, and Pause/Skip/End all silently no-op because `#end()` guards `if (!this.#runner) return` (line 338) and the runner never got created. No escape except killing the app.
  2. **Zombie resurrection** ("all screens at once"): `deactivate()` doesn't cancel the pending `activate()` — a late mic grant resumes it, starting a runner + bus subscriptions UNDER whatever view is now active. A second session then runs two runners concurrently toggling summary/transition/controls against each other.
  3. Compounding fragility: `#drone-view`/`#session-view` ID selectors force `display:flex`, defeating `.view { display:none }` (specificity); three visibility mechanisms coexist (`.active` class, ID overrides, `[hidden]` vestiges); `session:activate` handler in `app.js:120-133` duplicates switchView but omits `sessionView.deactivate()` for an already-running session.
  Fix shape: activation token (stale continuations abort), mic acquisition with timeout + visible error state BEFORE entering session UI, End Session works unconditionally, collapse to one visibility mechanism.
- ☐ Tuner screen UX (Simone, 2026-06-12): giant empty void, unlabeled gray mic circle ("Tap to start") buried at bottom, on/off state unclear. Wants a sliding chromatic visualizer (see whole scale, watch yourself drift over/under the target) — the colors alone don't help her tune.
- ☐ Session with no mic shows blank exercise area with zero feedback — needs an explicit "waiting for microphone…" state (falls out of the P0 fix).
