# Song Library — raw staging

> Staging area for harmonica song tabs destined for the tab trainer's library.
> Source: harptabs.com (community tabs), all for **C diatonic harp**.
> Tab data only — lyrics intentionally omitted (copyright; the hole numbers are
> what the trainer needs).

## How to read these

Standard notation: plain number = **blow**, `-N` = **draw**, `'` = bend step.
Sections are labelled neutrally (verse/chorus/line) — no lyrics.

## Conversion status — read before importing any of these

The trainer is **monophonic single-note** (PRD: no chord/polyphonic detection),
and `parseTab` wants clean space-separated single tokens. So before a song
becomes a playable tab it needs:

- **No double-stops.** Tokens like `67` / `-56` (two holes at once) can't be
  pitch-verified. Songs that lean on them need a single-note melody version.
- **Whitespace cleanup.** Run-together tokens (`5-3`, `6-55`) must be split into
  `5 -3`, `6 -5 5`.
- **Playability check.** Every token must pass `parseTab` for a C harp.

Status legend: ✅ usable after whitespace cleanup · ⚠️ needs a single-note rewrite · ❌ not viable mono.

---

## Piano Man — Billy Joel 
	6   6  6   6     -5 5 -5  5 4
its nine o-clock on a sa-turday
 4   4 4 4    4     4  -4  -4
the regular crowd shuffles in
   6    6  6   6   -5  5   -5  5  4
theres an old man sitting next to me
 3  3    3  -5  -5 -5 5   4   4
making love to his tonic and gin
 9   9   9   9   9    9  -9 8 -9 8 7
he says son can you play me a memory
 7  7   7  7   7   -8  -8 -8 
im not really sure how it goes
 8  -9   9   9   9    9   -9  8  -9   8   8   8
but its sad and its sweet and I knew it complete 
  7  7  7   8  -9  8   7      7
when I wore a younger mans clothes
-6   -6   -6   -7    7  -7-7
da - da - da - de - de - d-a
-6   -6   -7   7    -7   -6   6
da - da - de - de - da - da - da 
  9  9  9  9
sing us a song 
 -9    8   -9 8  7
youre the piano man
-6    7 7  7    -8  -8 
sing us a song tonight
 8    8    9   9  9   9   -9  8 -9 87
well were all in the mood for a melody 
 7    -6   7  7   -9  8    7  7
and youve got us feeling alright.


## Take Me Home, Country Roads — John Denver ✅
```
v1: 6 6 -6 6 -6 6 -6 7
v2: -8 -8 8 -8 -6 -6 -6 6 6 -6 7
v3: 6 6 -6 6 -6 7 7 8 8
v4: -8 -8 -8 -8 8 -8
v5: -6 7 7 -8 7
chorus1: 7 -8 8 8 7 -8 8 -8 7 8 9 -10
chorus2: -10 -10 9 8 8 -8 7 -8
chorus3: 8 -8 7 7 -8 7
bridge1: 7 7 7 -7 7 -8 8 8 8 8 8 7
bridge2: 7 -9 -9 -9 -9 -9 8 -8 7 -8 8 8 -8
bridge3: -8 8 8 8 8 -8 -8 -8 -8 7 7
bridge4: 7 7 7 7 7 7
bridge5: -8 8 -8 -8 8 -9
```

## Hey Jude — The Beatles ✅ (split run-together tokens)
```
l1: 6 5 5 6 -6 -4 -4 5 -5 7 7 -7 6 -6 6 -5 5
l2: 6 -6 -6 -6 -8 7 -7 7 -6 6 4 -4 5 -6 6 6 -5 5 -3 4 4
l3: 6 5 5 6 -6 -4 -4 5 -5 7 7 -7 6 6 6 -5 5
l4: 6 -6 -6 -6 -8 7 -7 7 -6 6 4 -4 5 -6 6 -5 5 -3 -3 4
br1: 4 7 -7 -6 6 6 -5 -6 7 -6 7 -5
br2: 7 -6 6 -5 6 -6 6 -5 5 -4 4
br3: 4 7 -6 -6 6 6 -5 -6 7 -6 7 -5
br4: 7 -6 6 -5 6 -6 6 -5 5 -4 4 4 6 -6 -7 -6 -7 -7 7 -8 -8
```

## Somewhere Over the Rainbow — Harold Arlen ✅
```
l1: 4 7 -7 6 -6 -7 7
l2: 4 -6 6
l3: 4 -6 6
l4: 5 -5 6 -6
l5: -4 -3 4 -4 5 4
l6: 6 5 6 5 6 5 6 5
l7: 6 -5 6 -5
l8: 6 -5 6 -5 6 -6 -7
l9: 6 5 6 5 6 5 6 5
l10: 6 -5 6 -5 6 -5 6 -5
l11: 6 -5 6 -6 -7
bridge: 4 7 -7 6 -6 -7 7 | 4 -6 6 | 5 -6 5 4 -4 5 -5 | -4 -3 4 5 4
tail: 6 5 6 5 6 5 6 5 | 6 -5 6 -5 6 | -5 6 -6 -7 7
```

## Blowin' in the Wind — Bob Dylan ✅
```
l1: 6 6 6 -6 6 -5 6 5 -4 4
l2: 5 6 6 -6 6 -5 6
l3: 5 -5 6 6 6 -6
l4: 6 -5 6 5 -4 4
l5: 5 6 5 -5 -5 5 -4
l6: 5 -5 6 6 6 -6
l7: 6 -5 6 6 5 -4 4
l8: 5 6 6 -6 6 -5 6
l9: 5 -5 -5 5 -4
l10: -4 5 5 5 -4 4
l11: 5 -5 -5 5 -4 -4 4 -4 4
```

## Bohemian Rhapsody — Queen ✅ (intro/ballad; split run-together tokens)
```
l1: -6 -6 -6 -6 -6 6 6 -6 6 -5 5
l2: -5 -5 -5 6 -5 3 3 5 5 -5 5 -4 4
l3: 5 5 -5 5 5 5 5 -5 6 4 -6
l4: -6 -6 -6 -6 -6 6 6 -6 6 -5 5
l5: 6 6 6 -6 -6 6 -5 -5 6
l6: 6 -6 -6 6 -5 -5 6
l7: 5 5 5 5 -4 6 4 4 4 4 -4 -4
l8: -4 -4 -3 4
```
(Full song continues — long; import the ballad section first.)

## House of the Rising Sun — The Animals ✅
```
l1: 5 -6 -7 7 8 -8 -6 -6
l2: -10 -10 -10 9 8 8
l3: -10 -10 -10 -7 7 8 -8 -6 -6 -6 -6
l4: -6 -6 -6 6 5 6 -6
v2a: -10 10 -10 9 7 -8 -6
v2b: -10 -10 9 8 8
v2c: -10 -10 -10 9 7 -8 -6 -6 -6 7
v2d: -6 -6 6 5 6 -6
```

---

## Provenance & rights
Community transcriptions from harptabs.com, reproduced as functional hole-number
data (no lyrics). Personal-use practice tool, no redistribution. If the trainer
ever ships publicly, revisit whether bundling these is appropriate.
