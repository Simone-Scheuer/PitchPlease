# Harmonica Tab Trainer — Feature PRD v1

> Feature-level PRD. Extends the master `PRD.md`, doesn't replace it. Sections marked [DRAFT] are designed but untested; promote to [VALIDATED] once proven in real practice. Update as reading practice reveals what works.
>
> Status: [DRAFT] — spec'd 2026-06-13 via /build. Scope confirmed with Simone (bends in parser + gentle built-ins, paste-a-tab textarea in v1, `-`/plain/`'` notation).

## Why This Exists

The loved core (tuner, pitch viewer, bend trainer) trains *pitch* — hitting and holding a note. None of it trains *reading*: looking at a tab number and knowing, without hesitation, which hole and breath direction it means. Fluent tab reading is an explicit North Star success criterion ("reading tabs fluently") and nothing in the app touches it today.

The need, in the player's words: **show me a tab, tell me if I played it, move to the next one.** Untimed, repeatable, a "bouncing ball" walk through a sequence. Eventually: my own tabs and random drills, not a fixed playlist.

## What It Is

A new practice mode that reads a harmonica tab — an ordered sequence of holes/breaths/bends — and walks the player through it one token at a time, using the app's *existing* pitch-verification loop. Play the right note, the ball advances. No clock, no fail state, no score in v1.

It is **not** a new engine. ~80% already exists:
- `js/utils/harmonica.js` — complete C-diatonic Richter model, all 12 keys, hole→MIDI, every bend target (fractional MIDI).
- `bend-accuracy` evaluator + `exercise-runtime` — already verify a played pitch against a fractional-MIDI target and advance player-driven.

The genuinely new primitive is **tab notation**: a representation, a parser, and a display. That's the gap this feature fills.

## Design Principles

Inherits all master-PRD principles (player-driven timing, no fail states, exercises-are-data). Three are load-bearing here:

1. **The tab source is a seam, not a feature.** A *tab source* is anything that produces a token sequence: a built-in tab, a random generator, a pasted string, a future file upload, a future visual builder. The trainer consumes `Token[]` blind to where it came from. This is how the feature is a *platform* without building every input surface now — new sources slot in behind the same seam at near-zero structural cost. (Direct application of master principle #5, "Exercises Are Data, Not Code.")
2. **Reading is hole-finding, not microtonal sculpting.** Tolerance for plain blow/draw notes is generous (~±40¢ — did you hit the right hole?). Bends are tighter (~±15–20¢ — a bend is *defined* by its pitch) but looser than the bend trainer's ±10¢ microscope. The goal is fluency, not intonation drilling; that's what the bend trainer is for.
3. **Bouncing ball, not sustained lock.** A token clears on a short in-tune hold (~300–400ms), not the bend trainer's 2s lock. Reading practice should feel like moving, not like freezing on each note.

## Tab Notation Spec [DRAFT]

The most common online convention (Harp Tab / tomlin style). Chosen because anyone who's read harmonica tabs on the web already knows it.

A tab is **whitespace-separated tokens**. Each token:

```
[-] <hole 1–10> ['…]
```

- **No prefix = blow.** `-` prefix = **draw**. The sign carries breath direction.
- **Trailing apostrophes = bend depth** in semitone steps. Because the sign already says blow vs draw, apostrophes only encode *how deep* — never direction.

| Token | Meaning | Example on C harp |
|---|---|---|
| `4` | blow hole 4 | C5 |
| `-4` | draw hole 4 | D5 |
| `-3'` | draw hole 3, bent down 1 semitone | Bb4 |
| `-3''` | draw hole 3, bent down 2 semitones | A4 |
| `9'` | blow hole 9, bent down 1 (blow bends live on holes 7–10) | F#6 |

**Validation rules** (parse-time, key-aware):
- Hole must be 1–10. Otherwise: parse error naming the offending token.
- Bend depth must be physically available on that hole + direction (cross-checked against `getBendsForHole`). E.g. `-4''` is invalid on a C harp (hole 4 draw bends only 1 step) → parse error.
- Unknown characters → parse error with the token and position.
- v1 has **no rhythm, rests, or articulation** — just pitch tokens. (A rest token is a likely v2 addition; the model leaves room.)

## Token Data Model [DRAFT]

`parseTab(str, key = 'C')` → `Token[]`, where each token:

```
{
  raw:       string,            // "-3'"        — exactly as written, for display/round-trip
  hole:      number,            // 3
  direction: 'blow' | 'draw',
  bendSteps: number,            // 0 = no bend, 1 = one semitone, …
  midi:      number,            // fractional target MIDI, resolved for `key`
  note:      string,            // "Bb4"
  label:     string,            // "Draw 3 ↓1" — short, for the renderer
}
```

`stringifyTab(tokens)` → the canonical notation string (round-trips; used for display and for saving custom tabs later). Built entirely on `harmonica.js` — the parser owns notation, `harmonica.js` owns the music math.

## Tab Sources [DRAFT]

v1 ships three; all return `Token[]` (or a string the parser turns into `Token[]`):

1. **Built-in tabs** (`js/utils/harmonica-tabs.js`) — 2–3 short starter melodies written in the notation. Mostly blow/draw with **one gentle hole-4 draw bend**, so a beginner isn't wall-climbing on day one but bends aren't hidden either.
2. **Random sequence** — `randomSequence({ holeRange, includeBends = false, length })`. Generates a fresh token sequence within constraints. Cheap (pure config generation) and high-value for drilling. `includeBends` defaults off.
3. **Paste-a-tab** — a textarea where the player types/pastes notation and hits go; feeds `parseTab` directly with a visible parse-error state. ~20 lines, but it's what makes "run your own tab" real in v1 without a file-format rabbit hole.

**Deferred behind the same seam** (none blocked, all structurally free later): file upload, visual tab builder, saving custom tabs to localStorage, a tab library.

## Verification & Advance [DRAFT]

Reuses the existing fractional-MIDI comparison (from `bend-accuracy`), not a new evaluator engine — with two parameters made config-driven if they aren't already:
- **Per-token tolerance**: plain note ~±40¢, bend ~±15–20¢.
- **Hold-to-advance**: ~300–400ms in-tune (the "bouncing ball"), vs the bend trainer's 2s.

No `session-runner` — a tab is one continuous untimed sequence, so it drives `exercise-runtime` directly (no blocks, phases, or timer). Silence is never penalized; the ball just waits. On reaching the end: loop back to the start (the master-PRD default) or show a quiet "done."

## Renderer — Tab Reader [DRAFT]

New `tab-reader` renderer. A horizontal strip of tokens, "bouncing ball" cursor on the current one:
- Each token shows **hole number** + **breath direction** (blow vs draw distinguished by position or color) + **bend marks**.
- Current token highlighted; cleared tokens dim behind, upcoming ahead.
- Live in-tune feedback on the current token using the shared color language (`--color-in-tune` / `--color-close` / `--color-off`) — token locks green when matched.
- Honors the existing dark default and token-based styling; no hardcoded colors.

## View & Navigation [DRAFT]

New `tab-trainer-view.js`, reachable from the primary navigation. Modeled on the **fixed** `session-view` pattern — activation token, mic acquisition with timeout + visible error state *before* entering the UI, exit-always-works — explicitly **not** the pre-fix path that caused the session-freeze P0. Exact nav placement (own bottom tab vs. under Practice) is a small open call; leaning toward its own entry since it's a distinct mode.

## Out of Scope (v1)

File upload, visual builder, saved custom-tab library, rhythm/timing notation, scoring/streaks/stars, multi-key tab transposition UI (the math supports any key; the v1 UI just reads the profile's harp key). All deferred on purpose — none structurally blocked.

## Open Questions / Validation Plan

- **Does reading practice actually stick?** This is the bet behind the whole harmonica pivot. v1 is deliberately minimal so we find out cheaply before building the import/builder surfaces. Promote sections to [VALIDATED] only after real sessions on a real harp.
- **Is ±40¢ / 300ms the right feel?** Guesses. Tune against real-mic use; the params are config-driven precisely so this is a one-line change.
- **Nav placement** — own tab vs. nested under Practice. Decide when wiring the view.
- **Random generator musicality** — pure-random may feel unmusical (awkward leaps). If so, constrain to a scale or to stepwise motion. Defer until the plain generator is in hand.
