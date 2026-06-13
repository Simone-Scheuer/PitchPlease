# Long-term memory — PitchPlease

*Durable facts and preferences that outlive any single feature — about the stakeholder, the domain, the constraints, the world. Distinct from `DECISIONS_log.md` (which is dated calls we made). This is "what's true that we carry forward." Append-only; dating optional.*

---

- Stakeholder: Simone — personal project, she is both builder and primary user.
- Guiding philosophy (from PRD): **practice room, not arcade**. No fail states, silence is never penalized, scoring measures where you are — not pass/fail. Any feature that introduces judgment-flavored feedback violates this.
- Exercises are data, not code: declarative configs interpreted by a shared runtime. New exercise type ≈ new config, not new app code.
- Hard constraints: fully client-side, no backend, no accounts, no data leaves the device. Works offline as a PWA. No build step (native ES modules).
- Deployed on Netlify; ships under the "made by mona" credit (simonescheuer.com).
- Target instruments are monophonic: harmonica, voice, whistle, guitar (single-note), trumpet.
