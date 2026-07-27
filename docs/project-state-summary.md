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
| 3 | Progress Tracking Hardening | DONE | — |
| 4 | Storage Schema v2, Title Capture & Migration | DONE | — |
| 5 | In-Player UI Re-Calibration | AWAITING VERIFICATION | — |
| 6 | Settings Store & Settings Panel | DONE | — |
| 7 | Wire Settings Into Runtime | DONE | — |
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
- Progress tracking (Phase 3) fixed, owner-verified: delta guard on interval only (D-024),
  `ended` handler added (H6 fixed), `pagehide` replaces `beforeunload` (D-025), invalid-position
  guard incl. NaN-duration hole (D-042/D-043).
- Restart button/toast visuals re-calibrated against measured live DOM (Phase 5, awaiting
  verification): toast offset derived at runtime from control-bar height (D-028), button gets a
  measured pill fill (D-027/D-046).
- Settings panel built and owner-verified (Phase 6): second popup view, six controls under
  `youtubeResumeSettings`, Clear/Reset with inline confirmation, key independence confirmed
  (T6.7/T6.9). Saved-videos panel UI still pending (Phase 8; storage side done Phase 4).
- Settings wired into runtime, owner-verified (Phase 7): thresholds are now arguments (D-049);
  `bootstrap.js` reads settings once per navigation, never re-reads inside the interval; toast/
  button gated on their toggles; saves below `minWatchSeconds` skipped (D-050); settings-read
  failure falls back to defaults silently. T7.1–T7.11 run live against real YouTube playback via
  `chrome-devtools-mcp` (D-051/D-052), not just code review — see phase report for the run log.

## Next action

Phase 5 awaiting owner verification (T5.1–T5.12, see phase report). Phases 6–7 DONE. Phase 8
(saved videos panel) is next up.
D-034 (ship reliability as a v1.1 patch?) remains OPEN, owned by Human.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD still 1.0.0** (updated per phase, reaches 2.0.0 in
Phase 9 — see D-030; treat as stale for anything Phase 2+ has changed).
