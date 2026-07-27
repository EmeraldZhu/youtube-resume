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
| 8 | Saved Videos Panel | AWAITING VERIFICATION | — |
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
- Resume reliability (Phase 2) and progress tracking (Phase 3) fixed, owner-verified: ad gating,
  drift guard, verified seek, `ended` handler, `pagehide` over `beforeunload`, invalid-position
  guards (D-019 through D-025, D-036 through D-038, D-040 through D-043).
- Restart button/toast visuals re-calibrated against measured live DOM (Phase 5, awaiting
  verification): runtime-derived toast offset and pill fill (D-027/D-028/D-046).
- Settings panel built and owner-verified (Phase 6): second popup view, six controls, Clear/Reset
  with key independence confirmed (T6.7/T6.9).
- Settings wired into runtime, owner-verified (Phase 7): thresholds are arguments (D-049); saves
  below `minWatchSeconds` skipped (D-050); settings-read failure falls back to defaults silently.
  T7.1–T7.11 run live via `chrome-devtools-mcp` (D-051/D-052).
- Saved videos panel built, awaiting verification (Phase 8): `#view-list` renders every entry via
  `document.createElement` only (T8.13). Thumbnails gated on `loadThumbnails` — the `<img>` element
  itself doesn't exist when off (T8.8 zero requests, verified live). Per-row remove deletes in
  place (T8.9). List region clamps via static `max-height`, not flexbox `flex:1` (D-053 — the flex
  approach silently failed to clamp). T8.1–T8.12, T8.14 run live via `chrome-devtools-mcp` against
  seeded 200-entry storage; T8.4 confirmed on a real open YouTube tab.
- Post-Phase-8 owner-requested polish, verified live: title capture strips a leading `(3)`-style
  notification-count prefix (D-057); schema gains optional `channel`, captured via new
  `youtubeUtils.getChannelName()` (D-056); thumbnail grows 120×68 → 144×81 (D-055) and gains a
  YouTube-style duration badge + watched-progress line that render even with thumbnails off, since
  they're text/CSS, not an image (D-054); header gains a centered icon-only Ko-fi link, inline SVG
  rather than a second emoji exception (D-058, CP-61).

## Next action

Phase 5 awaiting owner verification (T5.1–T5.12, see phase report). Phases 6–7 DONE. Phase 8
(saved videos panel) awaiting owner verification (T8.1–T8.14, see phase report). Phase 9 next up.
D-034 (ship reliability as a v1.1 patch?) remains OPEN, owned by Human.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD still 1.0.0** (updated per phase, reaches 2.0.0 in
Phase 9 — see D-030; treat as stale for anything Phase 2+ has changed).
