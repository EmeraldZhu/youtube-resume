# Project State Summary — YouTube Resume

**Target:** v4.0.0 · **Live:** v3.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v4.md` (v3 history: `docs/ROADMAP_v3.md`) · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v4.0.0

Roadmap v4 drafted from `docs/EXTENSION_AUDIT_2026-09-07.md` (21 findings, F01–F21). All ten phases
below are planning only — no code written yet.

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Reproduction & Harness Foundation | NOT STARTED | — |
| 1 | Boundary Validation & Safe Repair | NOT STARTED | — |
| 2 | Serialized Storage Writer | NOT STARTED | — |
| 3 | Write Ownership, Freshness & Durable Saves | NOT STARTED | — |
| 4 | Resume Identity & Cancellation | NOT STARTED | — |
| 5 | Verified Resume Outcomes | NOT STARTED | — |
| 6 | Deferred Recovery Lifecycle | NOT STARTED | — |
| 7 | Completion Policy & Remove Completed | NOT STARTED | — |
| 8 | Popup Reconciliation & Accessibility | NOT STARTED | — |
| 9 | Regression, Docs & Store Release | NOT STARTED | — |

Ship gates: A after Phase 3 (storage correctness), B after Phase 6 (resume reliability), C after
Phase 8 (product completeness). Phases 0–3 are independently releasable (Roadmap v4 §3). Key
decisions logged D-100–D-116: background service worker as sole storage writer (D-102), per-video
keys rejected (D-103), additive `ended` completion field + legacy inference rule (D-104), "Remove
completed" behavior (D-105), fourth completion-threshold option (D-106), `t=` timestamp precedence
(D-107), committed `tests/` regression harness (D-108). UX Spec 4.0.0 copy IDs CP-68–CP-79 now
assigned (D-110); CP-80 is the next free ID.

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

Begin Roadmap v4 Phase 0 (Reproduction & Harness Foundation) when work resumes. Nothing is
blocking — see `docs/DECISIONS.md` "Currently blocking" for the one open, non-blocking item (D-034).

## Doc versions

PRD **4.0.0** · UX Spec **4.0.0** · TDD **4.0.0-draft** (§1/§1.2/§2/§4.6 updated for the v4
service-worker architecture; remaining sections pending per-phase updates) ·
Roadmap v2 2.0.0 · Roadmap v3 3.0.0 (shipped) · Roadmap v4 (draft).

**Constraint amendment (D-125):** CLAUDE.md's storage-access rule now permits two modules to touch
`chrome.storage.local` — `storageManager.js` (sole read path) and `background/storageWriter.js`
(sole write path, D-102). Not a violation to rediscover.
