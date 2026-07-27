# Project State Summary — YouTube Resume

**Target:** v2.0.0 · **Live:** v1.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v2.md` · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v2.0.0

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0–4 | Guardrails through Storage Schema v2 | DONE | — |
| 5 | In-Player UI Re-Calibration | DONE | — |
| 6–7 | Settings Store & Runtime Wiring | DONE | — |
| 8 | Saved Videos Panel | DONE | — |
| 9 | Integration, Regression & Store Resubmission | DONE | — |

**Status values:** NOT STARTED · IN PROGRESS · BLOCKED · AWAITING VERIFICATION · DONE.
A phase is `DONE` only when the owner confirms it. Claude Code never writes `DONE` itself.

## Phase 9 — what's done vs. outstanding

**Done:** instrumentation confirmed off (DEBUG=false, all logging gated); copy audited clean against
UX Spec §7 (no drift); permissions/network audits clean (only `i.ytimg.com` thumbnail GET, gated on
`loadThumbnails`); manifest bumped to `2.0.0`; Dev Checklist §6.2 arithmetic fixed (D-031); TDD
brought to v2.0.0, reconciled against shipped code (D-030); PRD/UX Spec/Dev Checklist confirmed
already current. Privacy policy and store listing **drafted** at
`docs/PRIVACY_POLICY_DRAFT.md` / `docs/STORE_LISTING_DRAFT.md` — D-032/D-033 reviewed and closed by
the owner. D-059: live-testing found two concurrent `setInterval`s (pre-existing since v1.0, not a v2
regression) — **fixed**, not just documented: `progressTracker` no longer owns a timer, it clocks
its 5s save cadence off `navigationManager`'s existing 1s poll via a new `tick()` method. Only one
`setInterval` is alive anywhere in the extension now, matching CLAUDE.md's constraint literally.
**Live-verified** post-fix: resume still seeks correctly (198 from a 200s save, drift 0), and the
interval-trigger save fired ~30 times over 131s (≈1 per 4.4s, matching the 5s cadence) — confirmed
via a temporary `DEBUG=true` flip, reverted before finishing (never committed true).

**Live-tested and passing:** T9.2 (fresh install), T9.6 (10/10 cold-load resume), T9.8 (silent on
Shorts/live/embed/playlist/homepage), T9.9 (disable mid-session), T9.10 (zip reload). Restart-button
click-clears-storage-and-seeks-to-0 (D-061: resumed to 198s → click → seeked to ~0 → storage
entry deleted, all in one run). T9.4 25-navigation stress (D-062: 25 synthetic SPA navigations,
zero leaked UI elements, single-interval design holds).
**Scoped down this session (D-060):** T9.3 (30-min soak) and T9.7 (20-rep SPA-nav resume) hit real
`googlevideo.com` CDN 403s / playback resets in this sandbox's automated Chrome instance — an
environment/network limitation, not an extension defect (no correlated `[YTResume]` errors). The
underlying mechanisms they'd exercise were verified by substitute means instead (see D-060/D-062).
**Owner-verified:** T9.1 (real v1.0.0 profile upgrade), the real-video 30-min soak (T9.3), and the
real 20-rep SPA-nav resume sample (T9.7) — all confirmed passing by the owner, closing out the gaps
this session's sandboxed browser couldn't reach.
**Housekeeping:** synthetic test entries left by live-testing have been cleared from
`chrome.storage.local` on the dev-loaded extension.

## Shipped state (v1.0.0 → v2.0.0)

All 13 v1.0 source files plus popup's second (settings) view, saved-videos panel, and settings
store. Resume reliability hardened (ad gating, drift guard, verified seek, retry on metadata
timeout — Phases 1–3, owner-verified). In-player UI re-calibrated against measured live DOM (Phase
5, owner-verified). Settings store + panel + runtime wiring done and owner-verified (Phases
6–7). Saved videos panel with thumbnails/duration/progress overlays, channel name, Ko-fi link (Phase
8 + polish, owner-verified). Full decision history in `docs/DECISIONS.md`.

## Next action

v2.0.0 is verified end to end and ready for the owner to submit to the Chrome Web Store. No
outstanding Phase 9 items remain.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD 2.0.0** (reconciled Phase 9, D-030 closed).
