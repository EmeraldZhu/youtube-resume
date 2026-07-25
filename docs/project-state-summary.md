# Project State Summary — YouTube Resume

**Target:** v2.0.0 · **Live:** v1.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v2.md` · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v2.0.0

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Phase 0 — Guardrails & Tracking Setup | DONE | — |
| 1 | Reliability Audit & Instrumentation | DONE | — |
| 2 | Resume Engine Hardening | AWAITING VERIFICATION | — |
| 3 | Progress Tracking Hardening | NOT STARTED | — |
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

**Known broken — the reason for v2.0.0:**
- Resume reliability fixes are built (Phase 2, awaiting owner verification): ad-aware resume with
  60s ceiling (D-019/D-020), drift-based guard replacing `currentTime > 5` (D-021/D-037),
  verified/retried seek (D-022), non-rejecting `waitForVideo()` (D-023), navigation teardown +
  same-video re-entry fix (D-036), metadata-wait retry (D-038). H6 (no `ended` handler) remains,
  deferred to Phase 3 per roadmap scope.
- Restart button and toast don't match YouTube's current UI. Toast overlaps the progress bar (D-028);
  button is bare text among pill controls (D-027).
- No settings, no saved-videos panel, no video titles in storage.

## Next action

Owner to verify Phase 2 (see checklist in session report), then Phase 3 — Progress Tracking
Hardening, scoped by D-024/D-025.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD still 1.0.0** (updated per phase, reaches 2.0.0 in
Phase 9 — see D-030; treat as stale for anything Phase 2+ has changed).
