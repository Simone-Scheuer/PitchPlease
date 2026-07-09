# PitchPlease — Product Requirements Document v3

> v3 (2026-07-09) replaces the v2 "guided practice sessions" thesis, which three
> product generations of real use disproved. Sections marked [VALIDATED] have
> been tested in use; [SHIPPED] is built and verified in-browser but awaiting
> real-device feel checks.

## Thesis

**The graph is the app.** PitchPlease is a pitch mirror that knows your
instruments. It listens, and it tells you what you just played — in note names
AND in your instrument's own language (harp hole numbers, whistle fingerings).
Everything else is a layer on that mirror, not a sibling product next to it.

What the app is for, in the player's words: *"I'm always wanting to see which
note I'm playing, or which harmonica position it is."* Tuning, calibrating,
and pitch practice for harmonica, tin whistle, whistling, and mouth trumpet.

**Practice room, not arcade** still governs: no fail states, no scores,
silence is never penalized. Feedback is data.

### What v3 explicitly rejects
- Guided sessions, skill profiles, session generators, curriculum arcs
  (built in v2, never validated, cut 2026-07-09).
- Timed/scrolling challenge pressure (confirmed annoying 2026-06-12).
- In-app tab reading (tab trainer v1 shipped 2026-06-15, didn't stick —
  reading real tabs on paper is already pleasant; the app's edge is its ears).

## Product surface (3 tabs + settings drawer)

### 1. Graph — the pitch mirror [SHIPPED]
- Scrolling pitch trail, noise-filtered, auto-ranging to the instrument.
- **Native rails**: left rail speaks the instrument (harp: `4` blow, `-4`
  draw, `-3''` bends; whistle: six-hole fingering dots; voice: note names),
  right rail speaks note names. In-scale rows emphasized.
- **Corner HUD**: big current note + native token, signed cents, hold stats
  (`HELD 2.3S / AVG +4¢`), instrument description (`DRAW 4`).
- **Position chip**: harp key × scale root → `2ND POS` (circle of fifths).
- Scale overlay with in-key % (rolling 30 s), scale player with guide band.
- **Drone layer**: press-hold any rail label to drone it; DRONE button locks
  a drone on the scale root. No separate drone tab.
- **Pause holds the trace** (tap center or mic button); resume reconnects.
- Rail tap-to-drone, wheel Y-pan, scroll speed control.

### 2. Tuner [SHIPPED]
Median-steadied readout: big note + native token, sliding chromatic strip
(fixed-center crosshair), signed cents, Hz, instrument description.

### 3. Bends [SHIPPED]
The proven-loved bend trainer, standalone: pick any bend target for the
current harp key (difficulty-ordered), zoomed ±2-semitone meter, hold in the
±10¢ pocket to lock. Reference tone on demand. No score, no auto-advance.

### Settings drawer [SHIPPED]
- **Instrument profile**: Harmonica (12 keys) / Tin whistle (C, D, Eb, F, G,
  Bb, Low D) / Voice. Sets rails, range, HUD language.
- **Reference pitch**: A4 stepper (415–466 Hz) + **calibration flow** — play
  one steady note, the app measures your mean offset and moves A4 to match
  ("your harp runs +12¢ sharp"). Threads through detection AND synth.
- **Skin**: Press / Neon / Riso (below).
- Drone voice (sine/tri/square/saw).

## Design language [SHIPPED]

Dithered-print aesthetic: halftone dot textures, humanist-pixel type
(Departure Mono, OFL, bundled), boxed mono microcopy (`STATUS / LIVE`),
square corners, 1.5px ink borders. Three whole-app **skins** (`data-skin`):

| Skin | Look | Trail |
|---|---|---|
| `press` (default) | Ecru paper, warm ink, chartreuse | Ink halftone dots |
| `neon` | Near-black, chartreuse + magenta | Glowing line |
| `riso` | Violet ink duotone on paper, fluoro-red second drum | Ink dots + misregistered ghost pass |

Trail color encodes accuracy everywhere: in-tune (≤10¢), close (≤25¢), off.

## Technical constraints (unchanged)
Client-side only, no backend, localStorage (`pp:` keys, one `pp:settings`
object), offline PWA, no build step, mic constraints raw (no echo
cancellation/NS/AGC), <50 ms perceived latency, 60 fps canvas.

Structural rules earned by scar tissue:
- `[hidden]` always wins (`!important` in reset.css) — retired the
  display-defeats-hidden bug class.
- One view mechanism: `.view.active`, registry-driven in app.js.
- Leaving a tab releases the mic; `mic.start()` is idempotent.
- `?dev` URL param skips the service worker during local iteration.

## Open by design (build only when real use asks)
- Whistle fingering half-holings / third octave; overblows for harp.
- Trace scrub-back after pause (pitch history exists in the graph buffer).
- Per-instrument saved calibration offsets (currently one global A4).
- Tab-as-target-layer on the graph (only if paper tabs + hole rail prove
  insufficient).
