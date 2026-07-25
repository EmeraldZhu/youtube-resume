# Project State Summary — YouTube Resume

**Target:** v2.0.0 · **Live:** v1.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v2.md` · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v2.0.0

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Phase 0 — Guardrails & Tracking Setup | DONE | — |
| 1 | Reliability Audit & Instrumentation | AWAITING VERIFICATION | — |
| 2 | Resume Engine Hardening | NOT STARTED | — |
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
- Resume fires unreliably. Root cause confirmed in `docs/PHASE1_FINDINGS.md` (D-017 closed): H2/H4/
  H6/H8 confirmed, H5 was a doc-only contradiction, plus 3 new failure modes (D-036/D-037/D-038)
  scoped into Phase 2.
- Restart button and toast don't match YouTube's current UI. Toast overlaps the progress bar (D-028);
  button is bare text among pill controls (D-027).
- No settings, no saved-videos panel, no video titles in storage.

## Next action

Owner to verify Phase 1 (see PHASE1_FINDINGS.md + this session's report), then Phase 2 —
Resume Engine Hardening, scoped by D-019 through D-025 plus D-036/D-037/D-038.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD still 1.0.0** (updated per phase, reaches 2.0.0 in
Phase 9 — see D-030; treat as stale for anything Phase 2+ has changed).
