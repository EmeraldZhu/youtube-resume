# Project State Summary — YouTube Resume

**Target:** v4.0.0 · **Live:** v3.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v4.md` (v3 history: `docs/ROADMAP_v3.md`) · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v4.0.0

Roadmap v4 drafted from `docs/EXTENSION_AUDIT_2026-09-07.md` (21 findings, F01–F21). Phases 0–3 have
shipped code (harness, boundary validation/repair, serialized writer, write ownership/freshness);
Phases 4–9 are still planning only.

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Reproduction & Harness Foundation | DONE | — |
| 1 | Boundary Validation & Safe Repair | DONE | — |
| 2 | Serialized Storage Writer | DONE | — |
| 3 | Write Ownership, Freshness & Durable Saves | DONE | — |
| 4 | Resume Identity & Cancellation | AWAITING VERIFICATION | — |
| 5 | Verified Resume Outcomes | DONE | — |
| 6 | Deferred Recovery Lifecycle | AWAITING VERIFICATION | — |
| 7 | Completion Policy & Remove Completed | AWAITING VERIFICATION | — |
| 8 | Popup Reconciliation & Accessibility | NOT STARTED | — |
| 9 | Regression, Docs & Store Release | NOT STARTED | — |

Ship gates: **A closed** after Phase 3 (storage correctness — D-144), B after Phase 6 (resume
reliability), C after Phase 8 (product completeness). Phases 0–3 are independently releasable
(Roadmap v4 §3). Key decisions logged D-100–D-144 — see `docs/DECISIONS.md` for the full ledger;
notable: service-worker storage writer (D-102, Phase 2), write-ownership/freshness via the existing
`updated` field, no schema change (D-139, Phase 3), new additive `youtubeResumeQuarantine` root key
(D-127), committed `tests/` regression harness (D-108). UX Spec 4.0.0 copy IDs CP-68–CP-79 assigned
(D-110); CP-80 is next free.

## Prior releases (shipped, owner-confirmed DONE)

- **v3.0.0** (7 phases): defect diagnosis (title/legacy-import defects not reproduced; near-zero
  overwrite confirmed and fixed), identity hardening, storage integrity, resume gate/write
  protection, pinning (data layer + UI, 20-pin cap). `manifest.json` reads 3.0.0; permissions
  unchanged since v2.0.0. Full history: `docs/ROADMAP_v3.md`, `docs/DECISIONS.md`.
- **v2.0.0** (10 phases): settings view, saved-videos panel, settings store, hardened resume,
  re-calibrated in-player UI, single-`setInterval` fix. Full history: `docs/ROADMAP_v2.md`.

**Status values:** NOT STARTED · IN PROGRESS · BLOCKED · AWAITING VERIFICATION · DONE.
A phase is `DONE` only when the owner confirms it. Claude Code never writes `DONE` itself.

## Next action

Phase 6 AWAITING VERIFICATION (Gate B): deferred recovery lifecycle (visibility/pageshow re-attempt,
`OUTCOME.DEFERRED`/`PENDING` self-heal, single-observer replacement watch, teardown flush). Self- and
live-verified (D-168–D-176); full end-to-end recovery/bfcache/freeze-discard not witnessed live —
sandbox limits, not code defects (D-176).

Phase 7 AWAITING VERIFICATION: completion is now a fact (`ended: boolean`, schema v4, additive;
D-104), decoupled from the resume cutoff. Legacy inference `floor(time) >= duration-1`
(`storageValidation.isCompleteEntry`, the one predicate shared by display/resume/removal — D-180).
Popup caps displayed percent at 99 unless complete (D-117); "Only at the end" is a fourth
`completionThreshold` segment (sentinel `1`, D-106). "Remove completed" ships in the list header
(D-116): live count, pinned excluded by default (opt-in checkbox, D-118), inline confirm (CP-71/72),
one batched `REMOVE_COMPLETED` writer command that re-derives the match set server-side (D-181) and
integrates deletion-revision (7.6). `meetsMinimumWatched` fixed to inclusive `>=`, matching CP-42h's
"less than this" (D-179). `pendingSeekToEnd` distinguishes a genuine finish from a seek-to-end for the
`ended` write (D-178). Self-verified: `node tests/run.js` — 56 cases, zero regressions, 6 new Phase 7
cases (D-182). **Live-verified via `chrome-devtools-mcp` (D-183):** precondition-wrote a mixed
5-entry library and drove the real popup — row display, live count, include-pinned toggle,
confirm/cancel/commit (both scopes), and the "Only at the end" segment all matched exactly; storage
read back confirmed only the intended rows were removed. Real playback reaching a genuine `ended`
event was not exercised live (sandbox network limits, D-051/D-060/D-176 precedent) — covered by the
harness instead. Decisions D-104–D-106, D-116–D-120, D-177–D-183.

## Doc versions

PRD **4.0.0** · UX Spec **4.0.0** · TDD **4.0.0-draft** (§1/§1.2/§2/§4.6 updated for the v4
service-worker architecture; §4.2/§4.3 for Phase 6's deferred-recovery lifecycle; §4.5/§4.6/§4.6a/§4.9/§4.11
updated for Phase 7's completion policy/Remove-completed; remaining sections pending per-phase updates) ·
Roadmap v2 2.0.0 · Roadmap v3 3.0.0 (shipped) · Roadmap v4 (draft).

**Constraint amendment (D-125):** CLAUDE.md's storage-access rule now permits two modules to touch
`chrome.storage.local` — `storageManager.js` (sole read path) and `background/storageWriter.js`
(sole write path, D-102). Not a violation to rediscover.
