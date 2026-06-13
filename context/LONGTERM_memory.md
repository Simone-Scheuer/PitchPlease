# Long-term memory — PitchPlease

*Durable facts and preferences that outlive any single feature — about the stakeholder, the domain, the constraints, the world. Distinct from `DECISIONS_log.md` (which is dated calls we made). This is "what's true that we carry forward." Append-only; dating optional.*

---

- Stakeholder: Simone — personal project, she is both builder and primary user.
- Guiding philosophy (from PRD): **practice room, not arcade**. No fail states, silence is never penalized, scoring measures where you are — not pass/fail. Any feature that introduces judgment-flavored feedback violates this.
- Exercises are data, not code: declarative configs interpreted by a shared runtime. New exercise type ≈ new config, not new app code.
- Hard constraints: fully client-side, no backend, no accounts, no data leaves the device. Works offline as a PWA. No build step (native ES modules).
- Deployed on Netlify; ships under the "made by mona" credit (simonescheuer.com).
- Target instruments are monophonic: harmonica, voice, whistle, guitar (single-note), trumpet.
- Simone's actual instruments: singing, mouth trumpet, and now primarily **harmonica (C diatonic, Richter tuning)**. Her practice goal: read harmonica tabs fluently — memorized hole numbers, effortless mouth movement across holes 1–10.
- Reliability is the adoption threshold: she stopped opening the app because of bugs (worst: all screens rendering at once), not missing features. A flaky feature is worse than no feature.
- Taste signal: untimed verify-then-advance games feel right; timed/scrolling pressure feels clunky and annoying. The bend trainer and pitch viewer are the proven-loved parts.
