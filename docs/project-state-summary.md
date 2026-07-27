# Project State Summary — YouTube Resume

**Target:** v2.0.0 · **Live:** v1.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v2.md` · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v2.0.0

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0–4 | Guardrails through Storage Schema v2 | DONE | — |
| 5 | In-Player UI Re-Calibration | AWAITING VERIFICATION | — |
| 6–7 | Settings Store & Runtime Wiring | DONE | — |
| 8 | Saved Videos Panel | AWAITING VERIFICATION | — |
| 9 | Integration, Regression & Store Resubmission | AWAITING VERIFICATION | D-032, D-033 |

**Status values:** NOT STARTED · IN PROGRESS · BLOCKED · AWAITING VERIFICATION · DONE.
A phase is `DONE` only when the owner confirms it. Claude Code never writes `DONE` itself.

## Phase 9 — what's done vs. outstanding

**Done:** instrumentation confirmed off (DEBUG=false, all logging gated); copy audited clean against
UX Spec §7 (no drift); permissions/network audits clean (only `i.ytimg.com` thumbnail GET, gated on
`loadThumbnails`); manifest bumped to `2.0.0`; Dev Checklist §6.2 arithmetic fixed (D-031); TDD
brought to v2.0.0, reconciled against shipped code (D-030); PRD/UX Spec/Dev Checklist confirmed
already current. Privacy policy and store listing **drafted** (not published) at
`docs/PRIVACY_POLICY_DRAFT.md` / `docs/STORE_LISTING_DRAFT.md` — D-032/D-033 remain OPEN, owned by
Human. D-059: live-testing found two concurrent `setInterval`s (pre-existing since v1.0, not a v2
regression) — **fixed**, not just documented: `progressTracker` no longer owns a timer, it clocks
its 5s save cadence off `navigationManager`'s existing 1s poll via a new `tick()` method. Only one
`setInterval` is alive anywhere in the extension now, matching CLAUDE.md's constraint literally.
**Live-verified** post-fix: resume still seeks correctly (198 from a 200s save, drift 0), and the
interval-trigger save fired ~30 times over 131s (≈1 per 4.4s, matching the 5s cadence) — confirmed
via a temporary `DEBUG=true` flip, reverted before finishing (never committed true).

**Live-tested and passing:** T9.2 (fresh install), T9.6 (10/10 cold-load resume), T9.8 (silent on
Shorts/live/embed/playlist/homepage), T9.9 (disable mid-session), T9.10 (zip reload).
**Partial:** T9.5 (v1.0 regression — several items covered opportunistically, several not
re-verified this pass); T9.7 (SPA-nav resume — 2/4 clean, 2 explained by real ads mid-test, smaller
sample than planned).
**Not completed — needs a follow-up session:** Restart-button click-clears-storage-and-seeks-to-0
check (was interrupted mid-verification, inconclusive result, needs re-run with the sampler
technique); T9.3 dedicated 5–10min soak with memory sampling; T9.4 25-navigation stress run (only
code-reviewed, not live-stress-tested, ~20 navigations covered incidentally with no errors).
**Owner-only, not attempted:** T9.1 — upgrading a real v1.0.0 profile with real saved data. Requires
the owner's actual browser profile.
**Housekeeping:** synthetic test entries left by live-testing have been cleared from
`chrome.storage.local` on the dev-loaded extension.

## Shipped state (v1.0.0 → v2.0.0)

All 13 v1.0 source files plus popup's second (settings) view, saved-videos panel, and settings
store. Resume reliability hardened (ad gating, drift guard, verified seek, retry on metadata
timeout — Phases 1–3, owner-verified). In-player UI re-calibrated against measured live DOM (Phase
5, awaiting verification). Settings store + panel + runtime wiring done and owner-verified (Phases
6–7). Saved videos panel with thumbnails/duration/progress overlays, channel name, Ko-fi link (Phase
8 + polish, awaiting verification). Full decision history in `docs/DECISIONS.md`.

## Next action

Owner: run T9.1 (real v1.0 profile upgrade) and verify Phases 5/8/9. A follow-up session should
close the remaining Phase 9 test gaps listed above before final sign-off. See the release checklist
handed over alongside this summary.

## Doc versions

PRD 2.0.0 · UX Spec 2.0.0 · Roadmap 2.0.0 · **TDD 2.0.0** (reconciled Phase 9, D-030 closed).
