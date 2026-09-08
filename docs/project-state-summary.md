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
| 6 | Deferred Recovery Lifecycle | NOT STARTED | — |
| 7 | Completion Policy & Remove Completed | NOT STARTED | — |
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

Phase 5 AWAITING VERIFICATION: `tryResume()` returns a typed outcome (`resumeManager.OUTCOME`) instead
of void; seek verification checks `seeking`/`readyState`, not just proximity (R1); a bounded background
monitor catches a late native override (R2); a thrown corrective re-seek is a typed failure, never a
swallowed success (R3). The fixed-magnitude jump guard is replaced by a stabilization check gated on
real input (new `utils/userIntent.js`) — an uncorroborated jump no longer cancels resume outright (R4).
`progressTracker`'s backward-jump guard now applies to an uncorroborated `'seeked'` too (R8) while still
letting a corroborated deliberate rewind through regardless of size; its baseline resets on every
`'seeked'` so a below-minimum rewind doesn't block the next interval save (R9). New
`protectCheckpoint()`/`markUserDirected()` protect a checkpoint through a non-established outcome (R7)
and mark a `t=` timestamp navigation (D-107/F20) or established user-directed outcome authoritative.
Self-verified via `node tests/run.js`: R1/R2/R3/R4/R7/R8/R9 flip to `not-reproduced`; 7 new T5 cases
pass; zero regressions (46 cases total; R6/R10/R11 remain `reproduces` — Phase 6 scope). Decisions
D-155–D-166. Nothing else blocking (DECISIONS.md "Currently blocking", D-034, non-blocking).

## Doc versions

PRD **4.0.0** · UX Spec **4.0.0** · TDD **4.0.0-draft** (§1/§1.2/§2/§4.6 updated for the v4
service-worker architecture; remaining sections pending per-phase updates) ·
Roadmap v2 2.0.0 · Roadmap v3 3.0.0 (shipped) · Roadmap v4 (draft).

**Constraint amendment (D-125):** CLAUDE.md's storage-access rule now permits two modules to touch
`chrome.storage.local` — `storageManager.js` (sole read path) and `background/storageWriter.js`
(sole write path, D-102). Not a violation to rediscover.
