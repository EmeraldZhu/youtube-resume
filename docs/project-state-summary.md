# Project State Summary — YouTube Resume

**Target:** v2.0.0 · **Live:** v1.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v2.md` · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v2.0.0

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Phase 0 — Guardrails & Tracking Setup | DONE | — |
| 1 | Reliability Audit & Instrumentation | DONE | — |
| 2 | Resume Engine Hardening | DONE | — |
| 3 | Progress Tracking Hardening | AWAITING VERIFICATION | — |
| 4 | Storage Schema v2, Title Capture & Migration | NOT STARTED | — |
| 5 | In-Player UI Re-Calibration | NOT STARTED | — |
| 6 | Settings Store & Settings Panel | NOT STARTED | — |
| 7 | Wire Settings Into Runtime | NOT STARTED | — |
| 8 | Saved Videos Panel | NOT STARTED | — |
| 9 | Integration, Regression & Store Resubmission | NOT STARTED | D-032, D-033 |

**Status values:** NOT STARTED · IN PROGRESS · BLOCKED · AWAITING VERIFICATION · DONE

A phase is `DONE` only when the owner has run its verification checklist and confirmed it.
`AWAITING VERIFICATION` means the code is written but unconfirmed — **that is not done.**
Claude Code never writes `DONE` itself.

## Shipped state (v1.0.0)

All 13 source files implemented and loading cleanly: 9 content/storage/utils modules, 3 popup files,
`manifest.json`. Extension loads via Load Unpacked without errors.

**Working:** navigation detection (SPA, cold load, polling fallback), player detection, storage
read/write/delete/eviction, progress tracking (interval + events), Restart button, resume toast,
v1.0 popup, bootstrap orchestration.

**Known broken — remaining reasons for v2.0.0:**
- Resume reliability (Phase 2) fixed, owner-verified: ad gating (D-019/D-020/D-040), drift guard
  (D-021/D-037), verified seek gated to real UI (D-022/D-041), non-rejecting `waitForVideo()`
  (D-023), teardown/re-entry fix (D-036), metadata retry (D-038).
- Progress tracking (Phase 3) built, awaiting verification: delta guard on interval only (D-024),
  `ended` handler added (H6 fixed), `pagehide` replaces `beforeunload` (D-025), invalid-position guard.
- Restart button/toast don't match YouTube's current UI: toast overlaps progress bar (D-028),
  button is bare text among pill controls (D-027).
- No settings, no saved-videos panel, no video titles in storage.

## Next action

Phase 3 is built and awaiting owner verification (T3.1–T3.8). Once confirmed DONE, next is
Phase 4 — Storage Schema v2, Title Capture & Migration. D-034 (ship reliability as a v1.1 patch?)
is worth an owner decision now that Phases 1–3 are complete — see recommendation below.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD still 1.0.0** (updated per phase, reaches 2.0.0 in
Phase 9 — see D-030; treat as stale for anything Phase 2+ has changed).
