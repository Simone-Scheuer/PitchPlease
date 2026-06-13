# Code Project — PitchPlease

This folder is a software repository. Operating defaults:

- **Capture intent.** When the user describes a constraint, an aesthetic preference, or a stakeholder quote, preserve the wording. Don't paraphrase a verbatim client quote in the decisions log; quote it.
- **Preserve nuance.** When ambiguity matters, keep it explicit instead of collapsing it to a decision.
- **Append, don't rewrite.** Logs (`DECISIONS_log`, `DONE_log`, `LONGTERM_memory`) are append-only, newest on top. History is never edited; supersession is a new entry pointing at the old one.

## File and naming conventions

TYPE-prefixed uppercase filenames in `context/` and `research/` — same-kind docs sort together on `ls`.

| Prefix | Purpose | Default location |
|---|---|---|
| `PRD_` | Product requirements | `context/` |
| `SPEC_` | Feature specs | `context/` |
| `NOTES_` | Session / call / meeting notes | `context/` |
| `RESEARCH_` | External research | `research/` |

Other prefixes (`DOSSIER_`, `DESIGN_`, `ROADMAP_`, `SOURCES_`, etc.) may emerge as needed — declare a new prefix here when you first use it, so the taxonomy stays self-documenting. Don't pre-specify prefixes that have no content yet.

**Retrofit exception:** `PRD.md`, `IMPLEMENTATION_PLAN.md`, and `CLAUDE.md` predate this scaffold and stay at repo root — archived `do-work/` REQs reference them by path. New docs follow the conventions above.

**Date suffix** when a doc is a snapshot in time: `SPEC_payment_flow_2026-06-15.md`. Skip the date for living documents (e.g. `PRD.md`).

**Versioning:** `_v01`, `_v02` for major rewrites where the prior version stays in `context/archive/` for posterity. Minor edits in place — git history is enough.

## Archive policy

- A document moves to `context/archive/` (not deleted) when superseded by a major rewrite or when its initiative is shelved.
- A project enters `status: archived` in `AGENTS.md` front-matter when it's been silent 60+ days with no realistic restart path, and moves to `~/Projects-Root/Projects/_archive/<name>/`. The rollup dashboard ignores `_archive/`.
- Files in `context/dump/` are not load-bearing — periodic clearing is fine. It's an inbox, not a record.
- Feature requests flow through `do-work/` (user-requests → working → archive) — that queue predates this scaffold and stays in service.

## Where things live (so there's never a "where does this go?" question)

| Question it answers | File |
|---|---|
| Where is this project right now? (state, changes every session) | `AGENTS.md` |
| How do we work here? (conventions, stable) | this file |
| Tech stack, architecture, code style | `CLAUDE.md` |
| What are we building? (product spec) | `PRD.md` |
| What did we decide, and when? (dated history) | `context/DECISIONS_log.md` |
| What durable facts/preferences do we carry? | `context/LONGTERM_memory.md` |
| What shipped? | `context/DONE_log.md` |

The operating frame (senior eng + PM, the build loop, verification gates) lives in the global `/session-start` command — it's about how the agent behaves, not about this project, so it's not duplicated here.
