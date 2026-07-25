# Project State Summary — YouTube Resume

**Target:** v2.0.0 · **Live:** v1.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v2.md` · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v2.0.0

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Phase 0 — Guardrails & Tracking Setup | DONE | — |
| 1 | Reliability Audit & Instrumentation | NOT STARTED | — |
| 2 | Resume Engine Hardening | NOT STARTED | D-017 must close |
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
- Resume fires unreliably. Root cause unconfirmed; hypotheses H1–H8 in Roadmap §4, closing via D-017.
- Restart button and toast don't match YouTube's current UI. Toast overlaps the progress bar (D-028);
  button is bare text among pill controls (D-027).
- No settings, no saved-videos panel, no video titles in storage.

## Next action

Run the guardrails prompt, then Phase 1. Phase 1 is instrumentation only — no behaviour changes.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD still 1.0.0** (updated per phase, reaches 2.0.0 in
Phase 9 — see D-030; treat as stale for anything Phase 2+ has changed).
