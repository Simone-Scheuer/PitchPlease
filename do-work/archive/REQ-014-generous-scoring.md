---
id: REQ-014
title: Make scoring more generous
status: pending
created_at: 2026-03-15T17:40:00Z
user_request: UR-007
related: [REQ-012, REQ-013]
batch: practice-flow
---

# Make Scoring More Generous

## What
The current scoring is too strict. Make it more generous so players feel encouraged rather than punished. This is a practice tool — scoring should reward effort and progress, not demand perfection.

## Detailed Requirements
- Widen the "in tune" cent tolerance (currently 25 for medium — consider 35-40)
- Increase the "close" bonus in live score calculation (currently 50 — consider 70-75)
- The hold percentage calculation should be more forgiving — brief silences during a note shouldn't tank the score
- Overall: a player who's roughly hitting the right notes should score 60-70+, not 20-30

## Verification

**Source**: UR-007/input.md
**Pre-fix coverage**: 100% (1/1 items)
**Post-fix coverage**: 100% (1/1 items)

### Coverage Map

| # | Item | REQ Section | Status |
|---|------|-------------|--------|
| 1 | Make scoring more generous | What, Detailed Requirements | Full |

*Verified by verify-request action*

---
*Source: "Make scoring more generous overall"*
