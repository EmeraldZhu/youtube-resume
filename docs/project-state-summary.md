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
| 8 | Popup Reconciliation & Accessibility | AWAITING VERIFICATION | — |
| 9 | Regression, Docs & Store Release | NOT STARTED | — |

Ship gates: **A closed** after Phase 3 (storage correctness — D-144), B after Phase 6 (resume
reliability), **C closed** after Phase 8 (product completeness — D-194). Phases 0–3 are independently
releasable (Roadmap v4 §3). Key decisions logged D-100–D-144 — see `docs/DECISIONS.md` for the full ledger;
notable: service-worker storage writer (D-102, Phase 2), write-ownership/freshness via the existing
`updated` field, no schema change (D-139, Phase 3), new additive `youtubeResumeQuarantine` root key
(D-127), committed `tests/` regression harness (D-108). UX Spec 4.0.0 copy IDs CP-68–CP-84 assigned
(D-110, Phase 8's CP-80–84 retiring CP-36/62/63); CP-85 is next free.

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

**Phase 8 AWAITING VERIFICATION — Gate C closed (D-194).** Popup now subscribes to live storage
changes and reconciles in place (`storageManager.subscribeProgress`, D-184/D-185); pin/remove
double-clicks and batch-vs-row races are coalesced (D-186); per-video accessible names, a dedicated
list announcer, and programmatic settings-group labelling ship (D-191/D-192); thumbnails-off applies
live (D-193); toast rAF/generation cancellation closes F19 (D-189); reduced motion respected in both
surfaces (D-190). **Real-Chrome gotcha caught only by live testing (D-187/D-188):** disabling a
focused button blurs it, and `.focus()` on a disabled element no-ops — broke focus retention/handoff
until fixed; `tests/lib/fakeDom.js` hardened to catch this class of bug in the node harness too.
`node tests/run.js` — 58 cases, zero regressions; live-verified via `chrome-devtools-mcp`. Decisions
D-184–D-194, plus D-123/D-124 moved to DONE.

Phase 6 AWAITING VERIFICATION (Gate B): deferred recovery lifecycle — self- and live-verified
(D-168–D-176); full end-to-end recovery/bfcache/freeze-discard not witnessed live (sandbox limits,
D-176). Phase 7 AWAITING VERIFICATION: completion is a fact (`ended`, schema v4 additive, D-104),
"Remove completed" batched/deletion-revision-integrated (D-105/D-181), percent capped at 99 unless
complete (D-117). Self- and live-verified (D-177–D-183).

## Doc versions

PRD **4.0.0** · UX Spec **4.0.0** · TDD **4.0.0-draft** (§1/§1.2/§2/§4.6 updated for the v4
service-worker architecture; §4.2/§4.3 for Phase 6's deferred-recovery lifecycle; §4.5/§4.6/§4.6a/§4.9/§4.11
updated for Phase 7's completion policy/Remove-completed; remaining sections pending per-phase updates) ·
Roadmap v2 2.0.0 · Roadmap v3 3.0.0 (shipped) · Roadmap v4 (draft).

**Constraint amendment (D-125):** CLAUDE.md's storage-access rule now permits two modules to touch
`chrome.storage.local` — `storageManager.js` (sole read path) and `background/storageWriter.js`
(sole write path, D-102). Not a violation to rediscover.
