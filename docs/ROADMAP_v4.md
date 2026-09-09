# Roadmap — v4.0.0
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | Release Roadmap |
| **Target Version** | 4.0.0 |
| **Previous Version** | 3.0.0 (live on Chrome Web Store) |
| **Status** | Phase 0 DONE |
| **Last Updated** | 2026-09-08 |
| **Companion Documents** | PRD_YouTube_Resume.md (3.0.0), UX_Spec_YouTube_Resume.md (3.0.0), TDD_YouTube_Resume.md (3.0.0), EXTENSION_AUDIT_2026-09-07.md, DECISIONS.md |

---

## 1. Release Summary

v4.0.0 remediates all 21 findings (F01–F21) from `docs/EXTENSION_AUDIT_2026-09-07.md`, in the fixed
phase order below. The audit found the reported resume problems remain plausible against the current
v3.0.0 source despite v3's resume-hardening work: a success toast can appear while a seek is still
pending, initialization is effectively one attempt per video ID with no recovery path, a failed
resume can be followed by a save that overwrites the checkpoint needed for recovery, and concurrent
library mutations can lose or resurrect entries. This release closes those failure classes
structurally rather than adding more one-off timers or retries.

**New copy IDs start at CP-68**, continuing from CP-67 (last used, per UX Spec §7 — see D-110).

This is a single ten-phase plan (Phases 0–9) with three internal ship gates (§3), not three separate
releases — see §3 for what independent releasability actually means here.

---

## 2. Mapping the reported symptoms

Reproduced verbatim from the audit (`EXTENSION_AUDIT_2026-09-07.md` §"Mapping the reported symptoms"),
since it is the input this roadmap's phase order is built to close:

| Observation | Most relevant findings | Explanation supported by the source |
|---|---|---|
| Long or slowly loading videos show success before actually resuming | F01, F04, F05 | The check samples a media property, does not wait for settled playback, and accepts an unverified final correction. |
| YouTube's native restore wins | F01, F08 | A native jump can cancel the attempt during the first delay; an override after the brief final check is not monitored. |
| The active YouTube tab fails after Chrome restores a session | F02, F03, F05, F09 | Cold injection does run initialization, but an early failure is not recovered and the saved checkpoint may also be stale or subsequently overwritten. |
| Clicking another restored YouTube tab does not recover resume | F02, F07 | Becoming visible is not a resume trigger; other tabs can also overwrite the shared checkpoint. |
| Opening from the popup works more consistently | F02 | Popup links open a new watch-page tab, creating another cold-load attempt; there is no special protocol advantage. |
| Failures are not recognized and success is misleading | F01, F05 | Outcomes are not returned to the caller; final/native-override failure can still become success UI. |
| Bulk removal of fully watched videos is missing | F14, F15 | Only individual removal and clear-all exist; displayed 100% is not a safe completion predicate. |

---

## 3. Independent-Releasability Constraint

Phases 0–3 (harness, boundary validation, serialized writer, write ownership/freshness) must not
depend on anything introduced in Phases 4–9 (resume lifecycle, completion policy, popup/a11y,
release). This mirrors Roadmap v3 §3's constraint exactly: if the resume-lifecycle and product work
is ever deferred or cut, Phases 0–3 must still be shippable on their own as a storage-correctness
release. Nothing in Phases 0–3's tasks, storage shape, or module contracts may reference resume
generation/session tokens introduced in Phase 4, the completion (`ended`) field introduced in Phase 7,
or any popup-reconciliation state introduced in Phase 8 (D-101).

**Ship gates** (D-111):

| Gate | After Phase | Covers |
|---|---|---|
| **A** | 3 | Storage correctness: serialized writer, boundary validation/safe repair, write ownership & freshness (F06, F07, F10, F11, F12, F13) |
| **B** | 6 | Resume reliability: identity/cancellation, verified outcomes, deferred recovery (F01–F05, F08, F09, F20) |
| **C** | 8 | Product completeness: completion policy, popup reconciliation & accessibility (F14–F19) |

Phase 9 (regression, docs, store release) follows Gate C and is not itself a gate.

---

## 4. Phase Index

| Phase | Name | Findings | Goal in one line |
|---|---|---|---|
| 0 | Reproduction & Harness Foundation | F21 | Confirm every finding still reproduces against current HEAD; commit a runnable regression harness; no behaviour change |
| 1 | Boundary Validation & Safe Repair | F11, F12, F13 | Only proven identities are canonicalized; stored fields are validated; repair never loses pins or drops malformed data silently; caps hold immediately after every eligibility change |
| 2 | Serialized Storage Writer | F06 | A single restart-safe background writer owns every `chrome.storage.local` mutation |
| 3 | Write Ownership, Freshness & Durable Saves | F07, F10 | A stale tab can't clobber a fresher checkpoint; failed writes retry instead of silently "succeeding" |
| 4 | Resume Identity & Cancellation | F03, F04 | Every navigation gets an identity and cancellation signal; eligibility is validated against real, post-ad content |
| 5 | Verified Resume Outcomes | F01, F05, F08, F20 | Every seek produces a verified, typed outcome; native jumps vs. real user intent are distinguished; explicit timestamp links take defined precedence |
| 6 | Deferred Recovery Lifecycle | F02, F09 | Restored/frozen/discarded tabs get an idempotent recovery lifecycle instead of one cold-load attempt; shutdown flushes the last valid sample |
| 7 | Completion Policy & Remove Completed | F14, F15 | Completion is defined independently of the resume cutoff; bulk "Remove completed" ships against that predicate |
| 8 | Popup Reconciliation & Accessibility | F16, F17, F18, F19 | Popup state stays reconciled with storage; thumbnail toggle applies live; keyboard/screen-reader behaviour is correct; toast cleanup can't race |
| 9 | Regression, Docs & Store Release | — | Full live regression matrix executed and recorded; docs reconciled; 4.0.0 submitted |

---

## Phase 0 — Reproduction & Harness Foundation

**Goal:** Establish, with evidence, that findings F01–F20 still reproduce against current HEAD
(commit `e1e232a` plus anything landed since), and commit a dependency-free, runnable regression
harness so this evidence is never again session-only. **No behaviour change in this phase.**

**Why first:** F21 itself is the finding here — the audit's own reproduction was a one-off `vm`
session, never committed (`EXTENSION_AUDIT_2026-09-07.md`: "the one-off harness itself was not added
to the repository"). Every later phase needs a committed baseline to diff against, or "fixed" is
just another unverified claim, which is the exact failure mode F21 documents.

### Tasks

- [x] 0.1 — Create `tests/` with a dependency-free Node harness (same technique the audit used: `vm`
  executing real, unmodified source files against controlled mocks — no test runner, no npm
  dependency, matching CLAUDE.md's no-dependencies convention extended to test tooling).
- [x] 0.2 — Build shared fixtures: a mock `chrome.storage.local` (get/set/remove with realistic async
  timing), a mock video element (`currentTime`, `duration`, `seeking`, `readyState`, dispatchable
  events), fake timers, and a mock DOM sufficient for `navigationManager`/`playerObserver`.
- [x] 0.3 — Port all 24 appendix checks (R1–R24) from the audit into committed, individually named
  test cases (e.g. `tests/r01-success-before-outcome.js` or one runner file with 24 named cases —
  Tier 1, pick either as long as each case is independently identifiable in output).
- [x] 0.4 — Run the harness against current HEAD. Record, per case, whether it still reproduces the
  documented defect, does not reproduce, or reproduces via a different mechanism than the audit
  described.
- [x] 0.5 — Write results into a new "Phase 0 Findings" subsection immediately below this phase (not a
  separate file), one row per R1–R24, with verdict and evidence — same format Roadmap v3's Phase 0
  Findings used.
- [x] 0.6 — Document the harness invocation (a single `node tests/run.js` or equivalent) directly in
  this roadmap's Phase 0 Findings, so a future phase or session can re-run it without rediscovery.
- [x] 0.7 — Note (for Phase 9 to act on) that `tests/` must be excluded from the Chrome Web Store zip.
- [x] 0.8 — Confirm `DEBUG` is `false` in the committed code and this phase touches no production file.

### Tests

| # | Scenario | Pass/fail condition |
|---|---|---|
| T0.1 | Run the harness against current HEAD | Pass: all 24 R1–R24 cases produce a recorded verdict (reproduces / does not reproduce / reproduces differently) with evidence — none silently skipped. Fail: any case has no recorded outcome. |
| T0.2 | `DEBUG = false` (committed state), harness run | Pass: zero production file changed by this phase; behaviour byte-identical to v3.0.0. |
| T0.3 | Inspect `tests/` for external dependencies | Pass: zero npm packages required; Node built-ins only. |
| T0.4 | Re-run the harness a second time immediately after the first | Pass: identical results — the harness itself is deterministic, not flaky. |

### Exit Criteria

- [x] `tests/` is committed with a runnable, dependency-free harness reproducing R1–R24
- [x] Every one of R1–R24 has a recorded verdict in the Phase 0 Findings subsection below
- [x] `DEBUG` is `false`; no functional behaviour changed from v3.0.0

### Docs to Update

- This document: new "Phase 0 Findings" subsection
- `docs/project-state-summary.md` (Phase 0 status)

---

## Phase 0 Findings

**Harness invocation (0.6):** `node tests/run.js` from the repo root — no install step, no
dependencies, Node built-ins only (`fs`, `path`, `vm`). Add `--json` for machine-readable output. Ran
against current HEAD (`da8fa14` plus this phase's own `tests/` addition — no production file changed).
Determinism (T0.4) confirmed: two consecutive runs (`--json`) produced byte-identical output.

**Design:** `tests/lib/harness.js` loads the real, unmodified source files (manifest
`content_scripts` order, `storage/storageManager.js` first) into a fresh Node `vm` context per test,
against a fake DOM (`tests/lib/fakeDom.js`), a fake `chrome.storage.local` (`tests/lib/mockChromeStorage.js`,
async via the fake clock so read/write races reproduce like the real API), a virtual clock replacing
`setTimeout`/`setInterval`/`Date.now()` (`tests/lib/fakeClock.js`, so the 400ms/250ms/500ms/5s/10s/60s
delays run instantly and deterministically), and a minimal `<video>` stand-in
(`tests/lib/mockVideo.js`). Same technique the audit used (`EXTENSION_AUDIT_2026-09-07.md`: "an
isolated Node vm experiment executed the actual source"), now committed per D-108. `tests/cases/`
holds one file per R-case (`r01-*.js` … `r24-*.js`), each exporting `{ id, title, finding, run() }`;
`run()` returns `{ verdict, evidence }`. `tests/run.js` discovers and runs them all.

**All 24 appendix cases (R1–R24) still reproduce against current HEAD** — none have been fixed yet,
which is expected: this phase makes zero behavior changes.

| Case | Verdict | Finding | Evidence |
|---|---|---|---|
| R1 | Reproduces | F01 | Toast shown for the target position while `video.seeking=true`, `readyState=1` — `seekWithVerification()` never checks either. |
| R2 | Reproduces | F01 | A native jump to 120s after `tryResume()` resolves goes uncorrected for 10s — nothing monitors post-verification. |
| R3 | Reproduces | F01 | The post-verify corrective re-seek throws; a warning is logged AND the success toast still shows; position stays at the overridden value. |
| R4 | Reproduces | F08 | A forward native jump to 120s mid-delay cancels resume outright — no seek to the saved checkpoint occurs at all. |
| R5 | Reproduces | F04 | `shouldResume(3600, 30, ...)` fails and returns before `isAdPlaying()` is ever consulted — eligibility runs against the ad's own duration. |
| R6 | Reproduces | F02 | Both 5s metadata waits (D-038's retry) time out; metadata arriving afterward has no effect — position stays 0. |
| R7 | Reproduces | F05 | A tracker armed per bootstrap's unconditional `finally` overwrites a 3600s checkpoint with 60s on its first interval save. |
| R8 | Reproduces | F05 | A native jump to 120s plus `seeked` saves 120s — event triggers bypass the backward-jump guard entirely (`bypassDelta=true`). |
| R9 | Reproduces | F08 | A below-minimum rewind's `seeked` save doesn't reset `lastSavedTime`; the next legitimate interval save is then rejected as a false backward jump. |
| R10 | Reproduces | F09 | `stop()` at 104s with no prior save performs no flush — the sample is silently dropped. |
| R11 | Reproduces | F02 | Same-URL navigate-finish, visibilitychange, pageshow, and poll ticks: `onVideoChange` fires exactly once (cold load only). |
| R12 | Reproduces | F03 | `disconnect()` on a pending `waitForVideo()` clears the timeout without settling the promise — still pending 20s later. |
| R13 | Reproduces | F06 | Two concurrent saves for different IDs: only one entry survives the whole-object read-modify-write race. |
| R14 | Reproduces | F06 | Concurrent delete-A/save-B: B's write (sourced from the pre-delete snapshot) resurrects A. |
| R15 | Reproduces | F11 | Repair-merging a pinned canonical entry with a whitespace-duplicate key drops `pinned` — `mergeEntryPair()` never copies it. |
| R16 | Reproduces | F11 | The invalid 12-char key `aaaaaaaaaaab` is rewritten to the unproven, different 11-char key `aaaaaaaaaaa`. |
| R17 | Reproduces | F12 | One `null` library row makes an otherwise-healthy `saveProgress()` reject (`Cannot read properties of null (reading 'pinned')`) during eviction's filter. |
| R18 | Reproduces | F12 | `minWatchSeconds: "broken"`, `showToast: "false"` both pass through `getSettings()` unvalidated. |
| R19 | Reproduces | F06 | Concurrent `saveSettings()` calls (rewind vs. toast): the rewind change is lost, the toast change survives. |
| R20 | Reproduces | F13 | Unpinning the one pinned entry out of a 200-unpinned-plus-1-pinned library leaves 201 unpinned entries — the cap isn't rechecked until the next save. |
| R21 | Reproduces | F03 | A's settings read, deferred past B's full initialization, still resolves and replaces B as the active tracker — no generation check. |
| R22 | Reproduces | F03 | A's resume completing calls the global `arm()`, arming B's tracker (B is now the active one) while B's own resume is still pending. |
| R23 | Reproduces | F07 | A stale tab's hidden-event save (120s) overwrites a fresher shared checkpoint (3600s) — no writer-ownership/freshness check. |
| R24 | Reproduces | F10 | A rejected pause save at 1100s still advances `lastSavedTime`; 20 later ticks at the same position never retry (delta guard masks it). |

**Findings this phase could not independently confirm beyond the audit's own evidence tier** (all
already labeled by the audit as something other than "Reproduced," carried forward unchanged, not
re-litigated): F14–F21 have no R-case (F14/F15/F20 are product-gap/policy-gap findings with no
existing behavior to reproduce; F16–F19 are popup-layer findings the audit itself marked
code-confirmed-not-reproduced, live-untested, or not-browser-reproduced; F21 is the meta-finding this
phase directly addresses by existing). Nothing the audit marked "Reproduced" failed to reproduce here.

**Packaging procedure (0.7 — for Phase 9 to execute and confirm at 9.5):** no zip build script existed
in the repo before this phase (`docs/Dev_Checklist_YouTube_Resume.md` §12.6 only checklists "zipped and
loadable," with no command). Documenting one here rather than leaving Phase 9 to invent it ad hoc: zip
an explicit include-list of shipped paths, so `tests/` and `docs/` are excluded by construction (never
listed) rather than by a fragile exclude pattern:

```bash
zip -r youtube-resume-v4.0.0.zip manifest.json assets content storage utils popup background
```

(`background/` is included pre-emptively for Phase 2's planned service worker, D-102; harmless if the
directory doesn't exist yet when this is run before Phase 2 lands — `zip` skips a missing path with a
warning, doesn't fail the build. Re-verify the include-list against the actual shipped tree at Phase 9.)

**DEBUG confirmed `false`** in `utils/debugLogger.js` (unchanged this phase). `git diff` shows no
changes to any file under `content/`, `storage/`, `utils/`, `popup/`, or `manifest.json` — only
`tests/` (new) and this roadmap/the state summary/decisions ledger (doc updates) changed.

---

## Phase 1 — Boundary Validation & Safe Repair

**Goal:** `resolveVideoId()` only canonicalizes identities it can prove; malformed or ambiguous data
is quarantined, never guessed at or silently dropped; merges preserve pin state and unknown
compatible fields; every stored field is validated at the boundary; retention caps (200-unpinned,
20-pinned) hold immediately after every operation that changes eligibility, not only after the next
`saveProgress()`.

**Depends on:** Phase 0's harness and R15–R20 baselines. Does not depend on Phase 2's serialized
writer — this phase fixes the *logic* of validation/repair/cap-enforcement; Phase 2 moves that
already-correct logic behind the single writer. **Serialization of repair with normal writes (F11's
own recommendation) is completed in Phase 2, not here** — noted explicitly so this phase is not
mistaken for closing F06/F11's concurrency angle, only F11/F12/F13's correctness-of-logic angle.

### Tasks

- [ ] 1.1 — `resolveVideoId()` canonicalizes only identities proved by exact parsing (surrounding
  whitespace, an explicitly supported URL form). It never truncates or guesses at a malformed token
  (e.g. a 12+ character key) to produce a different identity.
- [ ] 1.2 — Unresolved/invalid keys are preserved in a separate quarantine structure rather than
  merged into a guessed destination or dropped. Quarantined data is never deleted by this phase.
- [ ] 1.3 — `mergeEntryPair()` preserves `pinned` and any other compatible unknown fields across a
  merge; a pinned duplicate no longer loses its pin.
- [ ] 1.4 — Retain a reversible pre-repair snapshot of any entry a repair pass is about to change,
  before mutating it (bounded local retention, not a permanent audit log).
- [ ] 1.5 — Document (not yet fully resolve — needs Phase 3's session/revision evidence) that
  furthest-time-wins merge semantics can revive an old position after a deliberate rewind; flag this
  as a known limitation closed in Phase 3, not silently left unaddressed.
- [ ] 1.6 — **Field-by-field validation at the boundary** (`storageManager`'s read/write paths and
  `popup.js`'s settings read): validate root shapes, canonical video IDs, finite non-negative times,
  positive durations, numeric timestamps, string metadata types, allowed setting presets
  (90/95/98% + Phase 7's future fourth value), and real booleans. Apply per-field defaults; isolate a
  bad row without deleting the surrounding valid data.
- [ ] 1.7 — Popup load: let valid library data render even if the settings read fails (currently one
  `Promise.all` failure renders "No saved videos yet" for both); use safe setting defaults in that
  case and distinguish "load failed" from "genuinely empty" in the UI.
- [ ] 1.8 — Enforce the 200-unpinned/20-pinned caps as an invariant checked at the end of every
  operation that changes eligibility (pin, unpin, repair, merge) — not only inside `saveProgress()`.
- [ ] 1.9 — **Unpin-into-full-library policy (Tier 2 pick, logged as D-112):** unpinning while already
  at 200 unpinned entries immediately evicts the oldest eligible unpinned entry, consistent with
  `saveProgress()`'s existing eviction rule, rather than silently exceeding 200 until the next save.
- [ ] 1.10 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T1.1 | Repair pass against an invalid 12+ character token | Not truncated into a different, unproven identity; quarantined instead |
| T1.2 | Merge a pinned canonical entry with a whitespace-duplicate | Merged entry keeps `pinned: true` |
| T1.3 | Repair pass against a malformed non-object entry | Not silently dropped; preserved in quarantine, visible on inspection |
| T1.4 | Library contains one `null` row; save a healthy new row | Save succeeds; the null row does not throw or block it (R17-class) |
| T1.5 | Settings contain `minWatchSeconds: "broken"`, `showToast: "false"` | Both replaced by defaults, not left as invalid-but-truthy values (R18-class) |
| T1.6 | Settings read fails, library read succeeds | Popup renders the real saved videos using safe setting defaults, not an empty-state message |
| T1.7 | 200 unpinned + 1 pinned; unpin the pinned entry | Resulting unpinned count is immediately ≤200 (oldest evicted per D-112's rule), not deferred to the next save (R20 fixed) |
| T1.8 | Repeated unpins in sequence, single-tab | Cap invariant holds after every individual unpin, not just the last |
| T1.9 | Re-run Phase 0's harness | R15, R16, R17, R18, R20 flip from "reproduces" to "fixed" |

### Exit Criteria

- [ ] T1.1–T1.9 all pass
- [ ] No test scenario results in a real entry (valid or quarantined) being permanently deleted by repair
- [ ] The 200/20 caps hold immediately after every single-tab operation tested

### Docs to Update

- TDD §4.6 (validation rules, quarantine structure, merge field-preservation, cap-enforcement timing)
- PRD §7.3, §7.5

---

## Phase 2 — Serialized Storage Writer

**Goal:** `background/storageWriter.js`, an MV3 service worker, becomes the sole writer for every
`chrome.storage.local` mutation (save, delete, pin, unpin, repair, migration, settings, clear-all).
`storageManager.js` keeps its exact current public API and becomes a client of the worker; reads stay
direct. The worker is restart-safe: every command is idempotent, and no state needed for correctness
lives only in worker memory (D-102).

**Depends on:** Phase 1's validation/repair/cap logic, which becomes the single boundary check the
worker runs before any command touches storage.

### Tasks

- [ ] 2.1 — `manifest.json` gains `background.service_worker` pointing at
  `background/storageWriter.js`, and nothing else. `permissions` stays `["storage"]`;
  `host_permissions` stays `["https://www.youtube.com/*"]` (hard constraint, unchanged).
- [ ] 2.2 — Define one command message per mutation (`SAVE_PROGRESS`, `DELETE_PROGRESS`, `PIN`,
  `UNPIN`, `REPAIR`, `MIGRATE`, `SET_SETTINGS`, `CLEAR_ALL`), each carrying the full parameters needed
  to apply it from scratch — no delta/increment-style commands, so replaying one is always safe.
- [ ] 2.3 — The worker processes commands one at a time through a single in-memory serialized queue
  against `chrome.storage.local`. The queue is not itself the durability boundary: because every
  command is idempotent and fully described by its own parameters plus current storage state, a
  worker restart mid-queue only means the next command starts a fresh queue — nothing is lost that
  wasn't already either fully applied or never sent.
- [ ] 2.4 — `storageManager.js`'s existing exported functions (`saveProgress`, `deleteProgress`,
  `pinProgress`, `unpinProgress`, `getAllProgress`, `getSettings`, `setSettings`, `clearAllProgress`,
  etc.) keep their exact current signatures and Promise-based contracts. Internally, each mutating
  function now sends its command to the worker and resolves/rejects based on the worker's response;
  read functions are unchanged (direct `chrome.storage.local.get`).
- [ ] 2.5 — Phase 1's migration/repair pass now runs exclusively inside the worker, giving it the
  serialization against normal writes that F11's own recommendation calls for.
- [ ] 2.6 — Every command is validated at the worker boundary using Phase 1's validation logic before
  it touches storage — one choke point, not duplicated per call site.
- [ ] 2.7 — Handle the case where the worker is momentarily unreachable (e.g. terminated and
  restarting): the calling `storageManager` function's promise rejects cleanly, logged, never thrown
  uncaught — playback and UI continue unaffected (hard constraint: extension must never break
  YouTube).
- [ ] 2.8 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T2.1 | Two concurrent saves for different video IDs from separate tabs | Both entries survive (R13 fixed) |
| T2.2 | Concurrent delete-A / save-B from an A-containing state | A stays deleted; B is saved; A is not resurrected (R14 fixed) |
| T2.3 | Concurrent settings changes (rewind + toast) | Both changes survive (R19 fixed) |
| T2.4 | Concurrent pin operations from two tabs near the 20-pin cap | Cap is never exceeded, regardless of arrival order |
| T2.5 | Simulate worker termination mid-session, then issue the next command | Next command succeeds correctly; no duplicate side effect and no lost prior write |
| T2.6 | Diff `manifest.json` against v3.0.0 | Only `background.service_worker` added; `permissions`/`host_permissions` byte-identical |
| T2.7 | Diff `storageManager.js`'s exported function names/arity against v3.0.0 | Byte-identical public API |

### Exit Criteria

- [ ] T2.1–T2.7 all pass
- [ ] Harness cases R13, R14, R19 flip from "reproduces" to "fixed"
- [ ] No caller of `storageManager.js` (content scripts, popup) required any code change

### Docs to Update

- TDD architecture section: new `background/storageWriter.js` module contract, command protocol, restart-safety argument
- PRD §6 (architecture/manifest)

---

## Phase 3 — Write Ownership, Freshness & Durable Saves

**Goal:** A stale, backgrounded tab for the same video cannot silently overwrite a fresher checkpoint
just because a lifecycle event fired; a failed write no longer advances the "committed" marker; a
deleted/cleared entry does not get resurrected by an unrelated open tab's next lifecycle event.

**Ship Gate A is after this phase** — Phases 0–3 close F06, F07, F10, F11, F12, F13 and are
independently releasable per §3.

### Tasks

- [ ] 3.1 — Introduce a lightweight per-playback-session identity (a generation/session token per
  tab-and-video-load). This is the storage-ownership half of a mechanism Phase 4 also needs for resume
  cancellation — built once here, extended (not rebuilt) in Phase 4.
- [ ] 3.2 — `progressTracker` records, per session: last observed position, last meaningfully-active
  timestamp, and whether the session has produced an explicit user seek.
- [ ] 3.3 — Worker-side freshness check on `saveProgress`: a save from a session that has been
  backgrounded/inactive since before the entry's current `updated` timestamp does not overwrite a
  more-recently-active session's checkpoint on a mere lifecycle event (hidden/pause), unless it
  carries an explicit user-seek flag. A session that resumes genuine activity can still take ownership.
- [ ] 3.4 — Deletion/clear-all bumps a per-video (or global) revision counter in the worker. An open
  tracker holding a stale pre-deletion revision suppresses recreation from an unchanged/stale
  lifecycle event until it observes genuinely new activity (a real seek or continued playback).
- [ ] 3.5 — Separate last-observed, pending, and committed positions in `progressTracker`:
  `lastSavedTime` (committed) updates only on the worker's acknowledged success, never optimistically
  before the write resolves.
- [ ] 3.6 — A failed write keeps its sample as pending/dirty and retries on the next natural save
  trigger (interval tick, pause, visibility) — no separate user action required. An out-of-order
  (stale) acknowledgment cannot regress the committed marker, using the session identity from 3.1.
- [ ] 3.7 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T3.1 | Two tabs, same video: stale paused tab at 120s goes hidden while another tab holds 3600s | 3600s checkpoint survives (R23 fixed) |
| T3.2 | The previously-stale tab resumes genuine playback afterward | It can take ownership again — staleness protection is not permanent |
| T3.3 | Delete a completed entry while an unrelated, unchanged tab for it stays open | Entry stays deleted; the open tab's next lifecycle event does not recreate it |
| T3.4 | Inject a single storage failure on a pause save at 1100s, then let storage recover | The same checkpoint persists on the next natural trigger, no new user action needed (R24 fixed) |
| T3.5 | A slower earlier write resolves after a faster later one (out-of-order ack) | Committed marker is not regressed by the stale ack |

### Exit Criteria

- [ ] T3.1–T3.5 all pass
- [ ] Harness cases R23, R24 flip from "reproduces" to "fixed"
- [ ] **Gate A:** F06, F07, F10, F11, F12, F13 are all fixed; Phases 0–3 pass their tests with no
  reference to any Phase 4+ concept (generation tokens used here are storage-scoped only)

### Docs to Update

- TDD §4 (tracker state machine: observed/pending/committed positions, session identity, freshness rule, revision counter)
- PRD §5.7

---

## Phase 4 — Resume Identity & Cancellation

**Goal:** Every navigation/media lifecycle gets an identity and a cancellation signal so an old,
still-in-flight initialization can never seek, save, arm, or draw UI for a newer navigation.
Completion eligibility is validated against confirmed, current, non-ad content metadata — never an
ad's duration or a previous SPA-reused video's metadata.

**Depends on:** Phase 3's session-identity concept, extended here beyond storage ownership to gate
seeks, arming, and UI as well.

### Tasks

- [x] 4.1 — Extend Phase 3's generation/session token to cover the full navigation lifecycle: assigned
  on every navigation, checked after every `await` and before every seek, save, arm, or UI action.
- [x] 4.2 — Teardown (navigation away, SPA transition) settles any pending promise tied to the old
  generation — player discovery, metadata wait, ad wait, seek — rather than leaving it permanently
  unresolved, and removes its listeners/timers.
- [x] 4.3 — Player discovery confirms the current generation's ownership of a video element (that it
  belongs to the requested content) before treating it as ready, rather than accepting any existing
  video element immediately.
- [x] 4.4 — Resolve current content identity and defer through ads *before* evaluating resume
  eligibility (`shouldResume`) — eligibility runs only against confirmed post-ad content metadata,
  never an ad's duration.
- [x] 4.5 — Revalidate metadata if the media source or ad state changes during verification (a second
  ad starting, or a source swap mid-check).
- [x] 4.6 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T4.1 | Rapid A→B→C navigation | No stale seeks, wrong-ID saves, unresolved waits, or premature arming for the wrong generation (R12, R21, R22 fixed) — `tests/cases/t4-rapid-abc-navigation.js` |
| T4.2 | Leave a watch page during an ad | Teardown settles all pending work for that generation; no leaked timers/observers — `tests/cases/t4-leave-during-ad.js` |
| T4.3 | A delayed settings read from an old navigation resolves after a newer navigation has started | It does not activate as the newer navigation's tracker — `tests/cases/r21-*.js` |
| T4.4 | Media element is reused/replaced between navigations | The new generation confirms ownership before using any existing metadata — `tests/cases/t4-reused-media-element.js` |
| T4.5 | Saved long video with a pre-roll ad | No content seek/save targets ad media; eligibility is evaluated only after the ad, against real content metadata — `tests/cases/r05-*.js` |
| T4.6 | Consecutive ads, and an ad beginning during verification | Revalidation catches the source/state change; no stale eligibility decision is used — covered by `establishContentMetadata()`'s revalidation logic (D-149), exercised indirectly via R5's ad-wait path; no dedicated harness case (D-152) |
| T4.7 | SPA transition from a short video to a long video | No stale short-video metadata is used to evaluate the long video's eligibility — `tests/cases/t4-spa-short-to-long.js` |

### Exit Criteria

- [x] T4.1, T4.2, T4.3 (via R21), T4.4, T4.5 (via R5), T4.7 pass; T4.6 covered by code path, no
  dedicated case (D-152)
- [x] Harness cases R5, R12, R21, R22 flip from "reproduces" to "not-reproduced" — full suite
  (`node tests/run.js`) shows zero regressions elsewhere. Live `chrome-devtools-mcp` verification
  completed (D-153): a real pre-roll ad never disqualified eligibility; an ad-free video resumed
  end-to-end with a verified seek; rapid A→B→C navigation produced zero wrong-ID or stale saves.

### Docs to Update

- TDD §4.3/§4.4 (navigation lifecycle, generation token, ad-aware eligibility)
- PRD §5.4

---

## Phase 5 — Verified Resume Outcomes

**Goal:** Every seek attempt produces an explicit, verified outcome instead of an assumed one; a
failed, cancelled, or ineligible resume is distinguishable from a real success and cannot unlock a
destructive checkpoint overwrite; a native jump is no longer mistaken for user intent by magnitude
alone; an explicit `t=` timestamp link takes defined precedence over automatic resume.

### Tasks

- [ ] 5.1 — `seekWithVerification()` establishes content readiness/seekability before seeking, and
  awaits seek completion or confirms an already-settled position (checking `seeking`, `readyState`,
  and position stability) instead of accepting one `currentTime` sample after a fixed delay.
- [ ] 5.2 — Every corrective/native-override-response seek is verified the same way — no unverified
  "final" assignment that swallows its own error and still reports success.
- [ ] 5.3 — Replace the fixed-magnitude forward-jump heuristic with a bounded startup-stabilization
  window that distinguishes native interference from explicit user intent using direction plus
  measured elapsed time/playback rate, not a single 10.4s-forward threshold — closing the gap where
  small forward jumps, and all backward jumps, previously went ungated (F08).
- [ ] 5.4 — Cancel automatic correction once genuine user intent is established, recognizing keyboard,
  pointer, and accessible seek-control interaction, not only the `seeked` event in isolation.
- [ ] 5.5 — Reset the tracker's `lastSavedTime` baseline on a deliberate backward seek even when the
  landing position is below `minWatchSeconds`, so a later interval save is not wrongly rejected as a
  large backward jump (closes the "claimed interval exemption does not hold" gap).
- [ ] 5.6 — `tryResume()` returns a typed outcome — `{ status: success | failed | cancelled |
  ineligible, target, observed, attemptId }` — instead of a bare boolean/void.
- [ ] 5.7 — `bootstrap.js` arms tracking based on the typed outcome, not unconditionally in `finally`.
  The last good checkpoint is preserved through a pending/recoverable failure and released only after
  a verified success or an established user-directed session (ties into Phase 3's write-ownership
  rules, so the first interval save after a failed resume cannot overwrite the checkpoint with a
  startup position).
- [ ] 5.8 — Reconcile the `seeked`-triggered save's exemption from the backward-jump guard with Phase
  3's freshness rules, so a native jump immediately followed by a `seeked` event is not treated as
  user-directed and silently saved.
- [ ] 5.9 — Bounded local diagnostics distinguish timeout, seek failure, user override, completion
  skip, and cancellation — routed through the existing `debugLogger`, gated behind `DEBUG`, no
  user-visible error UI.
- [ ] 5.10 — **Timestamp precedence (D-107):** parse a supported `t=` form from the navigation URL as
  part of this navigation's resume-eligibility decision. An explicit, valid value cancels automatic
  saved-position restoration outright for this navigation; the resulting playback is a normal
  user-directed session from the start — tracked normally, not specially protected.
- [ ] 5.11 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T5.1 | Sample position while `seeking = true` | No success toast for a pending seek (R1 fixed) |
| T5.2 | A later native override lands and is left uncorrected | No success toast was shown claiming the pre-override position was final (R2 fixed) |
| T5.3 | A corrective seek throws | No success toast; the failure is a typed outcome, not swallowed (R3 fixed) |
| T5.4 | Native overrides before, during, and after the 400ms window; buffering lasting several seconds | Every case produces a correctly verified outcome, never a premature success |
| T5.5 | A forward native jump during the initial window; also small forward and backward user seeks | The forward jump is not treated as user intent by magnitude alone; small/backward user seeks are respected (R4 fixed) |
| T5.6 | User rewind lands below `minWatchSeconds`, then playback crosses the threshold again | Interval saves resume correctly; not rejected as a spurious backward jump |
| T5.7 | Failed load, native override, or a storage-read error | None can replace a known checkpoint with a startup position (R7 fixed) |
| T5.8 | A native jump immediately followed by a `seeked` event | Not silently saved as if user-directed (R8 fixed) |
| T5.9 | Force each of timeout, seek failure, user override, completion skip, cancellation | Diagnostics distinguish each one distinctly (inspectable with `DEBUG = true` in the harness only) |
| T5.10 | Saved checkpoint exists; navigate via a `t=` timestamp link for the same video | Timestamp wins; automatic resume is cancelled; playback is tracked as a normal session |
| T5.11 | Timestamp value changes on the same video ID with no new navigation | No second lifecycle initializes |
| T5.12 | Invalid timestamp value in the URL | Ignored; automatic resume proceeds normally |
| T5.13 | Playlist navigation | Identity/cancellation (Phase 4) and timestamp precedence behave consistently; no competing seeks |

### Exit Criteria

- [ ] T5.1–T5.13 all pass
- [ ] Harness cases R1, R2, R3, R4, R7, R8 flip from "reproduces" to "fixed"

### Docs to Update

- TDD §4.4/§4.5 (verified-seek state machine, typed outcomes, timestamp precedence)
- PRD §5.4, §5.5, §5.10 (durability promise extended to typed outcomes and timestamp precedence)

---

## Phase 6 — Deferred Recovery Lifecycle

**Goal:** A restored, frozen, discarded, or delayed tab gets an idempotent per-video recovery
lifecycle that re-evaluates on meaningful events, instead of one cold-load attempt that either
completes within its timeouts or is abandoned forever. Shutdown/teardown flushes the last valid
sample rather than reading a possibly-repurposed element afterward.

**Ship Gate B is after this phase** — Phases 4–6 close F01–F05, F08, F09, F20, together with Phase 2
(F02 here).

### Tasks

- [ ] 6.1 — Maintain per-video lifecycle state keyed by Phase 4's generation concept, re-evaluated on
  visibility return, `pageshow`, other relevant page-lifecycle events, and actual media
  readiness/replacement — not solely on `v`-parameter change.
- [ ] 6.2 — A pending/failed session (player-discovery or metadata-wait timeout) preserves its
  checkpoint and stays eligible for a later readiness event to complete the resume, instead of being
  permanently abandoned after one timeout.
- [ ] 6.3 — Reuse the existing single `MutationObserver` and single `setInterval` (hard constraint) —
  re-target them for the current generation; never instantiate a second one.
- [ ] 6.4 — Do not re-seek on every tab switch once a session has already reached normal, successful
  playback.
- [ ] 6.5 — Flush a last-valid, non-ad, settled sample tied to content identity *before* navigation
  teardown, instead of reading a possibly-repurposed element afterward.
- [ ] 6.6 — Coalesce/schedule saves using elapsed wall-clock time and playback activity rather than
  assuming a fixed count of interval callbacks represents real elapsed time (guards against suspended
  or delayed timers).
- [ ] 6.7 — A pending/in-flight seek is never persisted as a completed playback position.
- [ ] 6.8 — Document a realistic checkpoint-loss budget for abrupt termination (crash/kill/discard)
  rather than promising exact recovery after every case — a documentation deliverable (PRD), not a
  testable code guarantee.
- [ ] 6.9 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T6.1 | Restore Chrome with a saved video active and others inactive; activate an inactive one 30–120s later | Resume recovers without opening the popup (R6, R11 fixed) |
| T6.2 | Frozen, discarded/reloaded, back-forward-restored, and player-replaced pages | All reattach and recover correctly |
| T6.3 | Metadata arrives after the original wait window elapsed | Resume still completes rather than leaving position at zero (R6 fixed) |
| T6.4 | Unchanged-URL visibility/`pageshow` ticks after a session already resolved successfully | No duplicate seek/re-initialization occurs |
| T6.5 | SPA exit just before the periodic save; a pending seek at exit time | Latest confirmed sample is retained (R10 fixed); the pending seek is not persisted as completed |
| T6.6 | Ordinary close/reopen vs. crash/kill/discard | Measured and reported separately; crash/kill/discard is judged against the documented loss budget, not an exact-recovery claim |
| T6.7 | Throughout all of the above | Exactly one `setInterval` and one `MutationObserver` alive at any time |

### Exit Criteria

- [ ] T6.1–T6.7 all pass
- [ ] Harness cases R6, R10, R11 flip from "reproduces" to "fixed"
- [ ] **Gate B:** F01, F02, F03, F04, F05, F08, F09, F20 are all fixed

### Docs to Update

- TDD §4.2/§4.3 (lifecycle re-evaluation, deferred recovery)
- PRD §5.4, new checkpoint-loss-budget note (6.8)

---

## Phase 7 — Completion Policy & Remove Completed

**Goal:** Completion becomes a fact about playback (did it genuinely reach the end), stored
additively and independently of the resume cutoff — not a rounded display percentage. A bulk "Remove
completed" action ships against that predicate. "Treat as finished at" gains a fourth,
completion-based option.

### Tasks

- [ ] 7.1 — Add an additive schema field `ended: boolean` (absent/`false` by default), set only when
  playback genuinely reaches the end of confirmed, non-ad content media (a real `ended` event, not a
  seek-to-end). Bump the schema version through the version-aware migration chain (built in v3.0.0
  Phase 2, extended here) (D-104).
- [ ] 7.2 — Legacy inference rule for entries with no `ended` field: complete only if
  `Math.floor(time) >= duration - 1` — the strictest defensible reading given integer-second storage
  (D-104). Document the resulting ambiguity in PRD/TDD.
- [ ] 7.3 — Popup display reserves "100%"/completed labeling for the `ended`-true (or legacy-inferred)
  case; the displayed approximate percentage is capped below 100 otherwise (fixes `Math.round`
  reporting 100% at 99.5%).
- [ ] 7.4 — Reconcile the minimum-time boundary: UI copy says "less than," `meetsMinimumWatched()`
  uses strict `>` and excludes equality. Pick one (Tier 2: make the comparison inclusive, `>=`, to
  match "at least," or adjust copy to match strict `>` — decide and log) and make wording and logic
  agree.
- [ ] 7.5 — Add a **"Remove completed"** action to the popup's saved-videos view (D-105): preview the
  exact count before acting, a checkbox/toggle to include pinned entries (unchecked/excluded by
  default), one coordinated batch mutation routed through the Phase 2 writer, list/count/focus updated
  only after acknowledgment, no undo window.
- [ ] 7.6 — Integrate Phase 3's deletion-revision mechanism so an open, completed, paused tab does not
  immediately recreate a row this action just removed.
- [ ] 7.7 — **"Only at the end" fourth option (D-106):** `completionThreshold` accepts sentinel value
  `1`; the existing segmented control gains a fourth segment; the comparison at that value routes
  through the `ended`-based check (7.1/7.2) instead of percentage arithmetic. No new setting key.
- [ ] 7.8 — New copy for "Remove completed" (button label, preview/confirmation text, pinned-inclusion
  toggle) and the "Only at the end" segment label — assign CP-68 onward (D-110) per UX Spec §2 voice
  rules; add to the §7 copy table.
- [ ] 7.9 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T7.1 | Mixed incomplete/complete/pinned-complete/malformed entries | "Remove completed" removes only the D-104-true set |
| T7.2 | Zero matches | Preview shows 0; no mutation occurs |
| T7.3 | Filtered/large libraries | Preview count matches what is actually removed |
| T7.4 | Concurrent playback during the action | No unrelated entry is affected (writer serialization holds) |
| T7.5 | Cancellation and a simulated storage failure mid-batch | No partial/inconsistent removal state results |
| T7.6 | 94.9% / 95% / 98% / 99.5% / seek-to-100% / genuinely-ended, on a long video | Only genuinely-ended (or the exact legacy boundary) counts as complete; percentage alone never does |
| T7.7 | Fractional duration values | Legacy inference rule handles them without throwing or misclassifying |
| T7.8 | Each exact `minWatchSeconds` preset boundary | UI wording and comparison operator agree |
| T7.9 | Re-derive the removal set independently from D-104's rule | Matches the action's actual removal set exactly |
| T7.10 | Pinned completed entries present | Excluded by default; removed only when the include-pinned option is explicitly set |
| T7.11 | Copy audit | CP-68+ strings match UX Spec §7 exactly |

### Exit Criteria

- [ ] T7.1–T7.11 all pass
- [ ] No entry outside the documented completion predicate is ever removed by this action

### Docs to Update

- PRD §5.8, §5.9, §7 (completion field, Remove Completed, fourth threshold option)
- UX Spec §6, §7 (new CP-68+, fourth segment, Remove Completed control)
- TDD §4.6, §4.11

---

## Phase 8 — Popup Reconciliation & Accessibility

**Goal:** The popup stays reconciled with live storage state while open; the thumbnail toggle applies
immediately, not only on next open; keyboard focus and screen-reader behaviour are correct across
every row action; toast cleanup cannot race a newer toast.

**Ship Gate C is after this phase** — Phases 7–8 close F14–F19, completing the full remediation set.

### Tasks

- [ ] 8.1 — Subscribe to storage changes (via `storageManager`, backed by the Phase 2 writer) instead
  of a one-time snapshot; reconcile rows without losing scroll position or focus when an external
  change arrives.
- [ ] 8.2 — Disable/coalesce pending per-row actions (pin/remove) so rapid double-clicks cannot
  double-count; derive counters (pinned count, total count) from acknowledged state, never optimistic
  local increments.
- [ ] 8.3 — Sequence "Remove completed" and "clear all" against individual row actions so counts never
  go negative or phantom.
- [ ] 8.4 — Distinguish an externally-caused row removal (another tab/session deleted it) from a
  failed local mutation in the UI's handling of that row.
- [ ] 8.5 — Apply the thumbnail toggle live: remove existing image elements/sources immediately when
  disabled, restore eligible images when re-enabled, cancel pending loads where possible. Apply the
  same behavior to reset-to-defaults.
- [ ] 8.6 — Reconcile or explicitly document the content-script settings propagation timing
  (next-navigation vs. live) so the popup's own copy matches actual behavior.
- [ ] 8.7 — Move focus predictably: to the next row/control when a focused row is removed, retained
  through pin re-sorting, focused onto confirmation controls when they appear, restored to the
  triggering control on cancellation.
- [ ] 8.8 — Associate setting-group labels with their segmented controls programmatically, not only
  visually.
- [ ] 8.9 — Row action labels identify the specific video (not a generic "remove"/"pin" label); add a
  dedicated announcement for deletion/count changes.
- [ ] 8.10 — Respect `prefers-reduced-motion` for decorative animation.
- [ ] 8.11 — **Toast cleanup (F19):** retain and cancel the pending `requestAnimationFrame` handle on
  cleanup or when a newer toast appears; capture a toast generation/element identity in every timer so
  a callback only ever affects its own still-current UI; apply Phase 4's navigation-cancellation
  contract to toast lifecycles as well.
- [ ] 8.12 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T8.1 | Rapid double-clicks on remove/pin controls | No negative or phantom counts |
| T8.2 | Playback updates progress while the popup stays open | Rows/counts reconcile correctly without losing scroll/focus position |
| T8.3 | Eviction occurs while the popup is open | Reflected correctly in the open list |
| T8.4 | Pin/remove/clear-all overlap, multiple interleavings | Correct final rows and counts in every interleaving tried |
| T8.5 | Open a long list, turn thumbnails off, return and scroll without closing the popup | No new thumbnail network requests start |
| T8.6 | Repeat T8.5 with reset-to-defaults and an externally-triggered settings change | Same result |
| T8.7 | Keyboard-only operation, including an empty list and the pin-cap message | Every control reachable and operable; focus lands predictably after each action |
| T8.8 | Screen-reader / accessibility-tree pass | Setting groups programmatically associated with labels; row actions identify the video; deletion/count changes are announced |
| T8.9 | Show → cleanup → show a toast before the next animation frame; repeat with delayed frames and mid-sequence navigation | The old toast never removes or schedules work for the new one |

### Exit Criteria

- [ ] T8.1–T8.9 all pass
- [ ] **Gate C:** F14, F15, F16, F17, F18, F19 are all fixed, completing remediation of every audit finding

### Docs to Update

- UX Spec §6, §8 (focus/ARIA behavior, reduced motion)
- TDD §4.11 (popup state subscription)
- PRD §5.9

---

## Phase 9 — Regression, Docs & Store Release

**Goal:** v4.0.0 is verified end to end against the audit's own required live regression matrix, every
doc describes what actually shipped, and the release is ready to submit to the Chrome Web Store.

### Tasks

- [x] 9.1 — Confirm `permissions`/`host_permissions` are unchanged from v3.0.0; the only manifest
  addition across the entire release is `background.service_worker` (Phase 2) — audit and record this
  explicitly. (D-197 — diffed against the v3.0.0 release commit, byte-identical.)
- [x] 9.2 — Confirm zero network requests beyond the gated `i.ytimg.com` thumbnail GET. (D-203 — live via
  `chrome-devtools-mcp`, 12 requests total, all local extension files or `i.ytimg.com`.)
- [x] 9.3 — Confirm exactly one `setInterval` and one `MutationObserver` alive at any time, across
  every scenario in the regression matrix below. (D-196 — confirmed by grep across the whole tree, not
  scenario-by-scenario live; no code path constructs a second instance of either.)
- [x] 9.4 — Bump `manifest.json` version to `4.0.0`. (D-197)
- [x] 9.5 — Exclude `tests/` from the Chrome Web Store zip; confirm the zip build step does so (see the
  packaging procedure documented in Phase 0 Findings below — 0.7). (D-198 — built and loaded clean.)
- [x] 9.6 — Full copy audit against UX Spec §7, including CP-68+. (D-199 — CP-01–CP-84 all verbatim.)
- [x] 9.7 — Reconcile PRD, UX Spec, and TDD against everything Phases 0–8 actually shipped (background
  writer architecture, completion field, fourth threshold option, Remove Completed, accessibility
  fixes). (D-200 — TDD promoted to 4.0.0; PRD/UX Spec already current.)
- [x] 9.8 — Rewrite `docs/project-state-summary.md` for v4.0.0. (D-201)
- [x] 9.9 — Run the full v3.0.0 regression suite (Roadmap v3 Phases 0–6 equivalents) to confirm nothing
  already-shipped regressed. (D-196 — the committed harness is a superset covering R1–R24 plus v3's
  own reliability/identity/pinning cases; all 58 `not-reproduced`.)
- [x] 9.10 — Run the Phase 0 harness, extended through Phase 8, end to end — every R1–R24 case, plus
  every phase's added cases, must show "fixed," not merely "not re-broken." (D-196 — 58/58.)
- [x] 9.11 — Execute the live regression matrix below on a real Chrome profile, recording exact tested
  revision, conditions, attempt counts, results, and remaining limitations — per F21's own acceptance
  criterion, "pass" must not stand in for an unexecuted critical scenario. (D-203/D-204/D-205/D-206 —
  labeled executed-pass/code-reviewed/deferred per row, never a bare "pass.")

### Tests

Ported directly from the audit's "Required live regression matrix":

| # | Scenario | Variations | Required observation | Phase 9 result |
|---|---|---|---|---|
| T9.1 | Ordinary resume | Short, 1-hour, 3-hour, and 6-hour videos; signed in/out; paused/autoplay; supported playback rates | Position reaches saved target minus configured rewind; success is shown only after verification | **executed-pass (partial) / deferred (rest).** D-204: seek-to-target math confirmed correct live on a real video (195s = 200s saved − 5s rewind); full verified-playback success path blocked by sandbox CDN 403s (env limitation, not a defect — the guard correctly withheld success UI). Multi-duration/signed-in/rate variations deferred to the owner. |
| T9.2 | Slow readiness | Player or metadata after 5/10/30 seconds; delayed seek completion; offline then reconnect | Pending state preserves checkpoint; later readiness recovers without popup interaction | **code-reviewed.** Mechanism (`waitForMetadata` retry, D-038; deferred recovery lifecycle, Phase 6/D-168–176) confirmed present and harness-tested (58/58); not newly exercised live this session. |
| T9.3 | Native competition | Native target earlier/later than extension target; override during 400ms wait, verification, and several seconds afterward | Consistent precedence, verified correction or honest deferred/failure outcome; no misleading success | **deferred.** D-205 — requires real YouTube native-resume behavior this tooling can't force. |
| T9.4 | Chrome restore | Video active on close; inactive video tabs activated later; duplicate-video tabs; normal exit/relaunch | Background resume works with preserved positions and no stale-tab overwrites | **deferred.** D-205 — needs a real browser session restore. |
| T9.5 | Browser lifecycle | Freeze/resume, discard/reload, history restore, player replacement; separate crash/kill runs | Correct reattachment and bounded checkpoint loss; no claims of guaranteed final-frame saving | **deferred.** D-205 — needs real tab freeze/discard/crash, not available via `chrome-devtools-mcp`. |
| T9.6 | Ads and navigation | Pre-roll, sequential ads, source change during verification, rapid A→B→C, watch→home→same video | Only current content is resumed/tracked; all cancelled work settles | **code-reviewed (ad-gating) / deferred (real ad-serving).** D-205 — ad-wait/re-defer logic (D-019/D-020/D-040) harness-tested; real pre-roll/mid-roll behavior needs a signed-in real session. |
| T9.7 | User intent | Forward/backward/short seeks, rewind below minimum, Restart, timestamp links | Explicit intent wins; saves resume normally after thresholds are met | **code-reviewed (mechanism) / deferred (real-video half).** D-205 — `userIntent.js`/timestamp-precedence harness-tested (T5.5/T5.10-equivalent, 58/58); real-video seek/Restart interaction deferred. |
| T9.8 | Storage contention | Multiple videos, duplicate-video tabs, concurrent save/pin/delete/clear/repair/settings, transient write failures | No unrelated data loss, stale resurrection, false write acknowledgment, or pin-cap breach | **executed-pass.** D-203 — live batch Remove-completed against a 6-entry seeded library, correct scoping/pinned-exclusion; concurrency/failure-injection cases harness-tested (R13/R14/R19/T3.4/T7-storage-failure, 58/58). |
| T9.9 | Completion cleanup | 99.5% vs ended; fractional duration; pinned completed entries; open paused completed tabs | Previewed matches only; unfinished/preserved-pinned entries survive; no immediate stale recreation | **executed-pass.** D-203 — live: ended-entry and legacy-boundary entry both showed "Completed"; a 98.5% entry correctly did not; default Remove-completed excluded the pinned-complete entry, "Include pinned" included it; storage read back confirmed exact removal set. |
| T9.10 | Popup and privacy | Rapid clicks, live changes, keyboard/screen reader, thumbnails disabled before scrolling | Correct count/focus/state, no new image requests after opt-out is applied | **executed-pass (thumbnails/count/state) / owner-observed (screen reader).** D-203 — live: toggling `loadThumbnails` off produced zero new network requests; counts/live-announcer text matched exactly. Actual screen-reader output (not just correct ARIA structure) needs the owner's own assistive tech. |

### Exit Criteria

- [x] T9.1–T9.10 all executed and recorded (not skipped or assumed from Phase 0–8's own testing) —
  each labeled executed-pass, code-reviewed, deferred, or owner-observed per row above; nothing marked
  a bare "pass" for a scenario not actually run (D-203–D-206)
- [x] `manifest.json` reads `4.0.0`; `permissions`/`host_permissions` byte-identical to v3.0.0 plus the
  one documented `background` field (D-197)
- [x] All docs (PRD, UX Spec, TDD, this roadmap) consistent with shipped code (D-200)
- [x] The Phase 0 harness shows R1–R24 all fixed (D-196 — 58/58 `not-reproduced`)
- [x] Findings F01–F21 are each confirmed fixed against the finished v4.0.0 build, not just
  theoretically addressed — per-finding label in D-206; several (F02/F04/F09/F03's live half, T9.3–T9.6)
  are code-reviewed rather than freshly live-verified, honestly recorded as such, not claimed live

### Docs to Update

- `docs/project-state-summary.md` (full rewrite for v4.0.0)
- PRD, UX Spec, TDD — final reconciliation pass across every section touched by Phases 0–8

---

## 5. Release Criteria for v4.0.0

| # | Criterion |
|---|---|
| R1 | All 21 audit findings (F01–F21) are confirmed fixed against the shipped build, not theoretically addressed |
| R2 | A single background service worker is the sole writer for every storage mutation; `storageManager.js`'s public API is unchanged |
| R3 | No concurrent mutation (save/delete/pin/unpin/repair/settings/clear) across tabs loses or resurrects data |
| R4 | A stale, backgrounded tab cannot overwrite a fresher checkpoint for the same video |
| R5 | Every resume attempt produces a verified, typed outcome; no success UI is shown for a pending, rejected, or overwritten seek |
| R6 | A restored, frozen, discarded, or delayed tab recovers resume without requiring the popup |
| R7 | Completion is defined by an additive `ended` field (or its documented legacy inference), never by the resume cutoff or a rounded display percentage |
| R8 | "Remove completed" removes only the documented completion predicate's matches, previews the exact count, and preserves pinned entries by default |
| R9 | An explicit `t=` timestamp link takes defined precedence over automatic resume |
| R10 | Permissions and network behaviour are unchanged from v3.0.0 except for the one documented `background.service_worker` manifest addition |
| R11 | The 400ms resume delay is unchanged and remains non-configurable |
| R12 | Exactly one `setInterval` and one `MutationObserver` are alive at any time |
| R13 | All user-facing copy matches UX Spec §7, including new CP-68+ entries |
| R14 | Phases 0–3 remain independently releasable without any Phase 4–9 dependency |
| R15 | A dependency-free regression harness reproducing R1–R24 is committed to `tests/` and excluded from the store zip |

---

## 6. Open Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| K1 | A background service worker can be terminated by the browser at any time, including mid-command | A naively-designed worker could lose an in-flight mutation | Every command is idempotent and fully self-described (D-102); the queue itself carries no durability responsibility — Phase 2's T2.5 explicitly tests mid-session termination |
| K2 | The serialized single writer becomes the one path every mutation must go through | A bug or unavailability in the worker could block all saves/deletes/pins at once, unlike today's independent read-modify-write calls | Phase 2 keeps `storageManager.js`'s API and error contract unchanged, so a worker failure surfaces as an ordinary rejected promise the existing `.catch()` convention already handles; graceful degradation (hard constraint) still holds — a blocked save never breaks YouTube playback |
| K3 | Write-ownership/freshness rules (Phase 3) could, if too aggressive, block a legitimate rewind in a tab the extension mistakenly considers "stale" | Users lose a real, intentional position change | 3.2's explicit-user-seek flag is the designed escape hatch; T3.2 specifically tests that a previously-stale tab can still take ownership through genuine activity |
| K4 | The legacy completion-inference rule (`duration - 1`) is a Tier 2 value pick, not owner-validated against real user libraries | Some genuinely-finished legacy videos may never be swept up by "Remove completed" | Deliberately the conservative failure direction (D-104) — under-inclusion only affects a convenience action, never destroys data; the user can still remove such entries individually |
| K5 | Generation/session tokens are introduced incrementally (storage-only in Phase 3, extended to the full lifecycle in Phase 4) | A seam between the two could leave a gap where an old generation's write is caught but its seek/UI isn't, or vice versa | Phase 4 explicitly extends rather than parallels Phase 3's token (4.1); Gate B's exit criteria require F01–F05/F08/F09/F20 all fixed together, not phase-by-phase in isolation |
| K6 | A fourth `completionThreshold` value (`1`, "Only at the end") changes the meaning of an existing stored settings value's boundary | A user already at 98% could be confused if UI ordering/labeling of the segmented control implies a smooth continuum rather than a qualitatively different rule | UX Spec §7 copy (CP-68+) must describe the fourth option's behavior distinctly, not just as "a higher percentage" (Phase 7 task 7.8) |
| K7 | Phase 9's live regression matrix (T9.1–T9.10) requires real Chrome sessions, session restoration, and network throttling that may not all be exercisable through the available tooling | A "pass" could again lean on structural/offline verification the way v3.0.0's Phase 6 did (D-098) | Any substitution must be logged as a decision the same way D-098 was, explicitly naming what was and wasn't executed live — never silently substituted |

---

*This roadmap is the authoritative plan for YouTube Resume v4.0.0. Phases run in fixed order 0–9.
Ship Gates A (after Phase 3), B (after Phase 6), and C (after Phase 8) mark independently meaningful
milestones, not separate releases — the plan targets a single 4.0.0 release. A phase is complete only
when every test passes and its listed doc sections are updated.*
