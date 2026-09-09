# Project State Summary — YouTube Resume

**Target:** v4.0.0 · **Live:** v3.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v4.md` (v3 history: `docs/ROADMAP_v3.md`) · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v4.0.0

Roadmap v4 drafted from `docs/EXTENSION_AUDIT_2026-09-07.md` (21 findings, F01–F21). All 10 phases
(0–9) now have shipped code; every phase is AWAITING VERIFICATION pending the owner's own-browser
confirmation — Claude Code never writes `DONE` itself.

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Reproduction & Harness Foundation | AWAITING VERIFICATION | — |
| 1 | Boundary Validation & Safe Repair | AWAITING VERIFICATION | — |
| 2 | Serialized Storage Writer | AWAITING VERIFICATION | — |
| 3 | Write Ownership, Freshness & Durable Saves | AWAITING VERIFICATION | — |
| 4 | Resume Identity & Cancellation | AWAITING VERIFICATION | — |
| 5 | Verified Resume Outcomes | AWAITING VERIFICATION | — |
| 6 | Deferred Recovery Lifecycle | AWAITING VERIFICATION | — |
| 7 | Completion Policy & Remove Completed | AWAITING VERIFICATION | — |
| 8 | Popup Reconciliation & Accessibility | AWAITING VERIFICATION | — |
| 9 | Regression, Docs & Store Release | AWAITING VERIFICATION | — |

Ship gates A/B/C (Phases 3/6/8) all closed. `node tests/run.js` — 58/58 cases `not-reproduced`
(R1–R24 plus every phase's added cases), zero regressions. `manifest.json` reads **4.0.0**;
`permissions`/`host_permissions` byte-identical to v3.0.0 (only `background.service_worker`, D-102,
added since). Zipped build (`manifest.json`, `assets`, `content`, `storage`, `utils`, `popup`,
`background` — `tests/`/`docs/` excluded by construction) installs clean, no warnings, live-verified
via `chrome-devtools-mcp`. DEBUG confirmed `false` and gated; no `innerHTML`/`eval`; exactly one
`setInterval` (`navigationManager`) and one `MutationObserver` (`playerObserver`); storage access
confined to `storageManager.js`(read)/`storageWriter.js`(write). Copy audit: CP-01–CP-84 all verbatim
in source, including CP-68+ and the dynamic CP-80–84 templates.

**Phase 9 live regression (F21's own bar — see D-063+):** popup surface (library render, live
reconciliation, batch Remove-completed, pin-exclusion, thumbnails-off stops new requests, zero
non-thumbnail network) executed live end-to-end with a synthetic seeded library, all passing. Content-
script resume mechanism re-verified live via reload+precondition (D-052 technique) on a real YouTube
video: seek landed exactly on the rewound target, and — critically — no success UI or storage write
fired when playback verification couldn't complete, matching F01's fix under a genuine (sandbox
network) failure condition. Full multi-hour soak, real freeze/discard/crash, and 25-repetition
real-video SPA navigation remain outside this tooling's reach (Roadmap v4 K7) and are deferred to the
owner, per the same substitution pattern v3.0.0's Phase 9 used (D-059–D-062) — never silently skipped.

## Prior releases (shipped, owner-confirmed DONE)

- **v3.0.0** (7 phases): defect diagnosis, identity hardening, storage integrity, resume gate/write
  protection, pinning (data layer + UI, 20-pin cap). Full history: `docs/ROADMAP_v3.md`.
- **v2.0.0** (10 phases): settings view, saved-videos panel, hardened resume, recalibrated in-player
  UI, single-`setInterval` fix. Full history: `docs/ROADMAP_v2.md`.

**Status values:** NOT STARTED · IN PROGRESS · BLOCKED · AWAITING VERIFICATION · DONE.
A phase is `DONE` only when the owner confirms it.

## Next action

**Owner: confirm all 10 phases for v4.0.0.** Everything self-verifiable (harness, live popup/content
checks via `chrome-devtools-mcp`, permissions/network/copy audits, zip load) is done — see
`docs/DECISIONS.md` D-063+ for exactly what was and wasn't executed live. What's left needs your own
browser/eyes: real multi-hour playback soak, a real device sleep/discard/crash-relaunch, ~20–25 real
video loads via normal browsing, and a final visual pass. Store submission itself is a separate,
explicit step (S3) not taken here — `docs/STORE_LISTING_DRAFT.md` has a new v4.0.0 changelog draft
for your review.

## Doc versions

PRD **4.0.0** · UX Spec **4.0.0** · TDD **4.0.0** (promoted from draft this phase — every module
section and the storage schema, §6.2, reconciled against shipped code) · Roadmap v2 2.0.0 · Roadmap
v3 3.0.0 (shipped) · Roadmap v4 **4.0.0** (all 10 phases have shipped code).

**Constraint amendment (D-125):** CLAUDE.md's storage-access rule permits two modules to touch
`chrome.storage.local` — `storageManager.js` (sole read path) and `background/storageWriter.js`
(sole write path, D-102). Not a violation to rediscover.
