# Project State Summary — YouTube Resume

**Target:** v3.0.0 · **Live:** v2.0.0 on the Chrome Web Store (real users, real saved data)
**Plan:** `docs/ROADMAP_v3.md` (v2 history: `docs/ROADMAP_v2.md`) · **Decisions:** `docs/DECISIONS.md`

<!-- Keep this file under ~50 lines. It loads at the start of every session. -->

## Phase Status — v3.0.0

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0 | Defect Diagnosis & Instrumentation | AWAITING VERIFICATION | — |
| 1 | Identity Hardening | DONE | — |
| 2 | Storage Integrity | AWAITING VERIFICATION | — |
| 3 | Resume Gate & Write Protection | AWAITING VERIFICATION | — |
| 4 | Pinning Data Layer | DONE | — |
| 5 | Pinning UI | NOT STARTED | — |
| 6 | Doc Reconciliation, Regression & Store Release | NOT STARTED | — |
| — | `docs/ROADMAP_v3.md` (latest revision: task 0.0 rewritten headless-first (owner pastes one storage export), 0.0-vs-T0.8 evidence-precedence table, T0.6 baseline fix) | AWAITING VERIFICATION | — |
| — | `docs/PRD_YouTube_Resume.md` bumped to 3.0.0 (§5.10 defect guarantees, §5.11 pinning, G12/G13, §6.1/§6.3 debugLogger fix, NG8 pinning exception) | AWAITING VERIFICATION | — |
| — | `docs/UX_Spec_YouTube_Resume.md` bumped to 3.0.0 (pin control/badge, two-tier sort, limit-reached message, clear-all pinned disclosure, CP-62/63/65/66/67 — CP-64 removed, gap left open) | AWAITING VERIFICATION | — |

Single release, no interim ship gate; Phases 0–3 are structurally independent of Phases 4–6 (see
ROADMAP_v3.md §3). **Phase 0 is executed and AWAITING VERIFICATION** (D-085; full evidence in
ROADMAP_v3.md's "Phase 0 Findings"): defect A not reproduced, defect B primary (legacy reimport)
**refuted** — 0.0's live export of the owner's real profile found no legacy key, and no code path has
ever existed to reimport one (outcome (b) of D-082's evidence table) — defect B secondary
(title-identity) not reproduced, defect C **confirmed** (`saveProgress()` overwrites unconditionally,
no guard). Schema v3 (`pinned` field) is introduced **only in Phase 4** (D-071) — landed this session,
`CURRENT_SCHEMA_VERSION` now 3. PRD §5.10 states defect fixes as symptom+guarantee only — mechanism
stays with Phase 0/TDD.

## Phase Status — v2.0.0 (shipped)

| Phase | Name | Status | Blocked By |
|---|---|---|---|
| 0–4 | Guardrails through Storage Schema v2 | DONE | — |
| 5 | In-Player UI Re-Calibration | DONE | — |
| 6–7 | Settings Store & Runtime Wiring | DONE | — |
| 8 | Saved Videos Panel | DONE | — |
| 9 | Integration, Regression & Store Resubmission | DONE | — |

**Status values:** NOT STARTED · IN PROGRESS · BLOCKED · AWAITING VERIFICATION · DONE.
A phase is `DONE` only when the owner confirms it. Claude Code never writes `DONE` itself.

## v2.0.0 summary (shipped, owner-verified)

Settings view, saved-videos panel, settings store, hardened resume (Phases 1–3), re-calibrated
in-player UI (Phase 5), single-`setInterval` fix (D-059). Full history in `docs/DECISIONS.md`.

## Next action

Phases 0/2/3/4 AWAITING VERIFICATION (owner review needed for Phase 0's visual-facing implications; 2,
3, and 4 self-verified — 2/3 live via `chrome-devtools-mcp`, 4 via a Node `vm` harness against the real
`storageManager.js` since it has no DOM/UI surface this phase — no owner action needed; see
ROADMAP_v3.md's "Phase N Findings" per phase). **Phase 1 DONE** (owner-confirmed). Phase 3:
`progressTracker` disarms on load, arms only once `tryResume()` settles (D-066/D-091); one
native-override re-assert (D-090); interval-only backward-jump write guard closes defect C
structurally (D-090); Restart button needed and got an explicit baseline-reset call — a real
false-positive bug found and fixed live (D-092), not just insurance. Phase 4: schema bumped 2→3
(D-071), `pinProgress`/`unpinProgress` added, 20-pin cap enforced with no auto-unpin (D-067), eviction
now excludes pinned entries from both count and candidates, `clearAllProgress` still removes pins
(T4.1–T4.8 all pass, D-093). Phase 5 (pinning UI) next. **Drift fixed:** TDD §4.4/§4.5/§4.6 now cover
the arm/disarm gate, write guards, and pinning; TDD still stale on the rest of `debugLogger.js`.

## Doc versions

PRD **3.0.0** · UX Spec **3.0.0** · Roadmap v2 2.0.0 · Roadmap v3 (draft) · TDD 2.0.0 (stale for v3).
