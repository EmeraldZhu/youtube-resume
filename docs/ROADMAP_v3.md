# Roadmap — v3.0.0
## YouTube Resume — Chrome Extension

---

| Field | Detail |
|---|---|
| **Product** | YouTube Resume |
| **Document Type** | Release Roadmap |
| **Target Version** | 3.0.0 |
| **Previous Version** | 2.0.0 (live on Chrome Web Store) |
| **Status** | Approved — Ready for Execution |
| **Last Updated** | 2026-08-10 |
| **Companion Documents** | PRD_YouTube_Resume.md, UX_Spec_YouTube_Resume.md, TDD_YouTube_Resume.md, DECISIONS.md |

---

## 1. Release Summary

v3.0.0 addresses two objectives:

| # | Objective | Phases |
|---|---|---|
| O1 | Fix reported storage/resume defects: title-change breakage, runaway "Untitled video" entries, and timestamp-overwrite-to-near-zero | 0, 1, 2, 3 |
| O2 | Add pinning: keep specific saved videos out of eviction, surfaced in the popup | 4, 5 |

This is a **single release**. There is no interim ship gate between the defect-fix phases and the
pinning phases — all seven phases ship together as 3.0.0. Phases run strictly sequentially; a phase
is not complete until every test passes and its listed doc sections are updated. See §3 for the
independent-releasability constraint and §4 for a one-line index of all seven phases.

---

## 2. Reported Defects (Input to Phase 0)

Three defects were reported against the live v2.0.0 extension. There is no export, screenshot, or
HAR of the original corrupted storage state — but it is **not confirmed gone**. The owner's only
remediation so far was the extension's own "clear all saved videos" action, which removes only the
`youtubeResume` root key (PRD §7.4). If defect B's primary hypothesis is correct — that legacy v1-era
data survives under some other key — that data would not have been touched by that action and may
still be sitting on the owner's live profile right now. Phase 0's task 0.0 checks this directly,
before anything else, precisely because it may be the only surviving copy of the actual failure
artifact rather than a reconstruction of it. Synthetic reproduction (0.5–0.8) is the fallback, run if
0.0 finds nothing. Phase 0 exists to establish, with evidence, whether each defect is real, and if
so, its actual mechanism — not to assume the mechanism implied by the report.

| # | Reported symptom | Hypothesis to test first | Confidence this hypothesis is correct |
|---|---|---|---|
| A | Resume breaks when a video's title changes (e.g. creator edits the title after upload) | Video title participates in entry identity or key derivation, so a title change is read as a different entry | Untested — a read of the shipped `storageManager.js` keys `youtubeResume` by `videoId` only, with no title involved, which argues against this hypothesis. Phase 0 must confirm or refute directly rather than trust that reading. |
| B | Storage fills with 200 "Untitled video" entries, crowding out real saved videos | **Primary — legacy v1 reimport:** legacy v1-era data was never removed from `chrome.storage.local` after the v1→v2 migration, and the migration cannot reliably detect that it has already run, so it re-imports/re-merges those legacy entries on browser startup. This single mechanism explains all three observed facts at once: exactly 200 entries (the cap, filled), every one titled "Untitled video" (v1 stored no titles at all), and onset specifically on browser restart (matching when a fresh migration pass would run). **Secondary — title-identity:** if title (or a value derived from it) leaks into key derivation, an unresolved title at save time could produce a new, distinct key on every save of the *same* video, instead of upserting one entry. | Primary is untested but is the only theory that explains all three symptoms (count, titling, and restart-timing) simultaneously — Phase 0 investigates it first. Secondary is weakened by a read of `storageManager.js`, which keys `youtubeResume` by `videoId` alone; Phase 0 must still confirm or refute both directly rather than trust either reading. |
| C | Resume intermittently fails and the saved timestamp is overwritten with a near-zero position | Some save trigger fires with a near-zero `currentTime` before the video's real position is established (e.g. before `waitForMetadata`/seek settle, or after an unrelated element reset) and that save is not rejected | Untested. `progressTracker`'s existing invalid-position guard (D-042/D-043) rejects `NaN`/negative/`>duration`, but a *valid, small, non-zero* number (e.g. `0.1`) currently passes that guard even if it does not reflect genuine playback. |

Do not fix any of these blind. Phase 1–3 scope is set by what Phase 0 actually finds, not by the
hypotheses above.

---

## 3. Independent-Releasability Constraint

Phases 0–3 (diagnosis through resume-gate hardening) must not depend on anything introduced in
Phases 4–6 (pinning). This is a structural constraint, not a scheduling one — if pinning is deferred
or cut for any reason, Phases 0–3 must still be shippable on their own as a defect-fix release.
Nothing in Phase 0–3's tasks, storage shape, or module contracts may reference the `pinned` field or
pin cap introduced in Phase 4. This is why schema v3 is introduced exclusively in Phase 4, not by the
version-aware migration mechanism Phase 2 builds (see Phase 2.1 vs. Phase 4.1 below).

---

## 4. Phase Index

| Phase | Name | Goal in one line |
|---|---|---|
| 0 | Defect Diagnosis & Instrumentation | Confirm or refute defects A/B/C with evidence; no behaviour change |
| 1 | Identity Hardening | Video ID is structurally the sole entry identity; title/thumbnail are display-only |
| 2 | Storage Integrity | Version-aware migration, duplicate merge, unresolved-ID rejection, lazy title backfill |
| 3 | Resume Gate & Write Protection | Tracking can't write before the resume lifecycle resolves; backwards-write guard |
| 4 | Pinning Data Layer | Additive `pinned` field, schema v3, 20-pin cap, eviction exemption |
| 5 | Pinning UI | Pin control in the existing saved-videos panel; pinned rows sort to the top |
| 6 | Doc Reconciliation, Regression & Store Release | Full regression, docs reconciled, 3.0.0 submitted |

---

## Phase 0 — Defect Diagnosis & Instrumentation

**Goal:** Establish, with evidence, whether defects (A), (B), and (C) reproduce against the current
shipped code, and if so, their actual root cause. **No behaviour changes in this phase.**

**Why first:** The reported symptoms come with no captured failure state and an unverified
hypothesis. Fixing storage keying before confirming it is actually the mechanism risks solving the
wrong problem while the real one ships unfixed.

### Tasks

- [ ] 0.0 — **Live-profile inspection (read-only, do first).** The owner's real `chrome.storage.local`
  data lives only in their actual Chrome install, which Claude Code's headless/CDP-driven browser
  tooling cannot reach (it drives a separate, profile-less Chrome instance). The owner is looped in
  for the export step only; Claude Code does the inspection and recording itself once it has the data.
  1. **Owner step (one-time).** Click the YouTube Resume toolbar icon to open the popup, right-click
     inside it and choose **Inspect**, then paste this into the Console panel that opens and press
     Enter:
     ```js
     chrome.storage.local.get(null, (data) => {
       copy(JSON.stringify(data, null, 2));
       console.log('Copied', Object.keys(data).length, 'key(s) to clipboard.');
     });
     ```
     This copies the full contents of `chrome.storage.local` to the clipboard. Paste that into the
     chat for Claude Code. **Do not run "clear all saved videos," reinstall, or otherwise touch
     `chrome.storage.local` on this profile before or after running the snippet, until 0.0's findings
     below are recorded.**
  2. **Claude Code step.** From the pasted export, enumerate **every** key present — not only the
     three documented root keys (`youtubeResume`, `youtubeResumeSettings`, `youtubeResumeSchema`). For
     each key found, record its name, its shape (is it a map, a scalar, something else), and its entry
     count if it is a map. This step **changes nothing and deletes nothing** — inspect and record only
     (there is nothing to write back to, since Claude Code is working from a static export, not the
     owner's live browser). If any legacy v1-era key or shape is present, capture its full contents
     verbatim into the Phase 0 Findings subsection (0.9) before any other Phase 0 task proceeds — this
     export may be the only surviving copy of the actual failure artifact, not a reconstruction of it,
     and it must not be lost.
- [ ] 0.1 — **Extend the existing `utils/debugLogger.js`** (shipped in v2.0.0, already registered in
  `manifest.json`'s `content_scripts` — this is not a new file). It already exposes a module-level
  `DEBUG` constant (default `false`) and a `log(stage, data)` helper, no-op when `DEBUG` is false,
  prefixed `[YTResume]`. Add the new log points below to it. No other file gains ad hoc `console.log`
  calls — everything continues to route through this one logger.
- [ ] 0.2 — Instrument `storageManager.saveProgress()` (read-only logging, no logic change) to log the
  resolved key (`videoId`), whether an existing entry was found for that key, the incoming `title`
  argument, and the resulting entry count in `youtubeResume` after write.
- [ ] 0.3 — Instrument `resumeManager.tryResume()` and `progressTracker.attemptSave()` to log `videoId`,
  trigger source, and the position value being written, on every call.
- [ ] 0.4 — **Defect A repro.** Save progress for a real video, then synthetically alter only the
  title signal (`document.title` and/or the DOM title selector, via a temporary override) without
  changing the URL's `v` parameter, and reload. Record whether resume still fires and whether a
  second entry is created for the same `videoId`.
- [ ] 0.5 — **Inspect for surviving legacy v1 data (primary hypothesis for defect B).** On a profile
  that has been through the v1→v2 migration, inspect `chrome.storage.local` directly — every key
  present, not just the three documented root keys (`youtubeResume`, `youtubeResumeSettings`,
  `youtubeResumeSchema`) — for any surviving v1-era shape: entries lacking fields consistent with
  post-v2 data, or any key outside those three. Determine precisely under what conditions the
  existing `migrate()` considers migration "already done," and whether any code path reads, merges,
  or re-writes old entries into `youtubeResume` additively rather than leaving it untouched once
  migrated.
- [ ] 0.6 — **Defect B repro — legacy reimport (primary).** Seed a synthetic pre-migration-shaped
  store (entries missing `title`/`channel`/`updated` in the current shape, no schema/settings keys
  present), run the existing migration repeatedly with simulated browser restarts between runs, and
  record whether the entry count in `youtubeResume` grows or whether previously-removed/untitled
  entries reappear.
- [ ] 0.7 — **Defect B repro — title-identity (secondary).** Reproduce by forcing
  `youtubeUtils.getTitle()` to return `null` across N repeated saves (interval triggers) of the *same*
  `videoId`, then inspect `youtubeResume` directly. Compare against the same N saves with title
  resolution left intact. This secondary hypothesis is confirmed only if the unresolved-title run
  produces more than one entry for that single `videoId`; if it always produces exactly one
  (upserted) entry, this mechanism does not reproduce the defect and Phase 0 must say so explicitly
  rather than assume it holds.
- [ ] 0.8 — **Defect C repro.** Force a save trigger (e.g. a synthetic `seeked` or interval tick) to
  fire while `video.currentTime` is genuinely near zero but the video is mid-playback at a much later
  real position (simulating a stale/reset element read), and observe whether that value overwrites a
  previously-good stored `time`.
- [ ] 0.9 — Write findings directly into this document as a new "Phase 0 Findings" subsection
  immediately below this phase (not a separate file) — one entry per defect (and, for defect B, one
  entry per hypothesis): verdict (**Confirmed** / **Not reproduced** / **Confirmed via different
  mechanism**), the log evidence, and the affected file and line. If a defect or hypothesis does not
  reproduce, state that explicitly and note what was tried.
- [ ] 0.10 — Note any failure mode observed that is outside defects A/B/C.

### Tests

| # | Scenario | Pass/fail condition |
|---|---|---|
| T0.1 | Save a video, alter title signal only, reload, attempt resume | Pass: entry count for that `videoId` stays 1 and resume fires. Fail: a second entry appears, or resume does not fire. |
| T0.2 | 10 saves of the same `videoId` with `getTitle()` forced to return `null` throughout | Pass: `youtubeResume` contains exactly 1 entry for that `videoId`, `time` reflects the latest save. Fail: more than 1 entry exists for that `videoId`. |
| T0.3 | 10 saves of the same `videoId` with title resolution intact, for comparison against T0.2 | Pass: identical entry-count behaviour to T0.2 (i.e. title resolution makes no difference to entry count). |
| T0.4 | Force one save with a near-zero `currentTime` on a video already saved at a much later position, then check storage | Pass: stored `time` is unchanged by the spurious near-zero write, or the mechanism that allowed it is identified. Fail: stored `time` is silently overwritten to near-zero. |
| T0.5 | With `DEBUG = false` (committed state) | Pass: zero console output, zero behaviour change from v2.0.0. |
| T0.6 | Run the existing migration 5 times in a row against a store that still contains legacy v1-era entries (no schema/settings keys, entries missing the current shape's fields), simulating a fresh browser start before each run. Record the entry count in `youtubeResume` after run 1 as the baseline (run 1 legitimately doing migration work is expected and not itself a failure). | Pass: runs 2 through 5 leave the baseline count unchanged. Fail: entry count grows on any run after the first. |
| T0.7 | After T0.6's repeated runs, inspect entries for any that are untitled and were not present before the first run | Pass: no new untitled entries appear at any point. Fail: previously-absent or previously-removed untitled entries reappear. |
| T0.8 | **Decisive test.** Seed a legacy v1-shaped store, run the migration **once** to completion (matching the real-world case: the reported failure occurred on an already-migrated profile during normal v2 operation, not a repeatedly-re-run one), then inspect storage for the legacy source data. | Pass: the legacy source data is absent after the single successful migration, so it cannot be re-imported later. Fail: legacy source data still exists post-migration — this establishes the precondition the reimport hypothesis requires. |

**T0.8 is the gate on the primary hypothesis.** If T0.8 passes (legacy data is gone after one clean
migration), the legacy-reimport theory is refuted as stated, and Phase 0 must pivot its remaining
effort to the secondary title-identity hypothesis and to whatever 0.0 actually found on the live
profile, rather than continuing to treat reimport as the leading explanation.

### Evidence precedence: 0.0 vs. T0.8

Task 0.0 reads what actually happened on the owner's own profile, through whatever migration shipped
at their real upgrade. T0.8 is a synthetic repro against today's code. They can disagree — a stale
migration can leave a footprint that current code no longer reproduces — so 0.0's finding governs
whether the hypothesis stands; T0.8 governs only whether *current* code still causes it. Three outcomes:

| Outcome | 0.0 (live profile) | T0.8 (synthetic, current code) | Verdict | Phase 2 obligation |
|---|---|---|---|---|
| (a) | Finds legacy v1-era data | Irrelevant to this outcome | Legacy-reimport hypothesis **stands**, regardless of what T0.8 shows | Must neutralise the legacy key per D-070, whether or not T0.8 reproduces the mechanism live |
| (b) | Finds nothing | Passes (legacy data gone after one clean migration) | Hypothesis **refuted** | Pivot to the secondary title-identity hypothesis (0.7) as the lead for defect B |
| (c) | Finds legacy v1-era data | Passes (legacy data gone after one clean migration) | Migration **previously** left data behind, but current code does not — defect still explained, historically, for the affected profile(s) | Fix still required: neutralise any legacy key found by 0.0, even though T0.8 shows current migration no longer creates new instances of it |

0.0 is never overridden by T0.8 passing — a clean synthetic run only proves *today's* migration is
sound, not that a stale profile is clean. Only the absence of a finding in 0.0, combined with T0.8
passing, refutes the hypothesis (b).

### Exit Criteria

- [ ] Task 0.0's live-profile inspection is complete and recorded before any other Phase 0 finding is
  finalized; if it found a surviving legacy key, its full contents are captured verbatim in the
  findings, not just summarized
- [ ] Written root-cause findings for defects A and C, and for **both** defect B hypotheses (legacy
  reimport and title-identity), appended to this document (Phase 0 Findings subsection), each with a
  verdict and log evidence
- [ ] T0.8's result is recorded explicitly as the gate outcome for the primary hypothesis, and the
  findings reflect whichever hypothesis Phase 0 actually pivoted to if T0.8 passed
- [ ] For any defect or hypothesis marked **Not reproduced**, the finding says so explicitly and does
  not carry the hypothesis forward as fact
- [ ] `DEBUG` is `false` in the committed code
- [ ] No functional behaviour changed — v2.0.0 behaviour is byte-for-byte identical with `DEBUG = false`

### Docs to Update

- `utils/debugLogger.js` — extend the existing module with new log points (do not create a new file)
- This document: new "Phase 0 Findings" subsection

---

## Phase 0 Findings

Executed against the shipped v2.0.0 code (commit at the start of this phase). All reproduction was
driven headlessly via `chrome-devtools-mcp`, installing this repo as an unpacked extension. The one
exception is 0.0, which required the owner's real Chrome profile.

### 0.0 — Live-profile inspection

The owner exported `chrome.storage.local` from their real profile via the popup-console snippet
(clipboard `copy()` wasn't available in that console context; fell back to `console.log` + manual
copy). Full export, verbatim:

- `youtubeResume`: 19 entries, every one keyed by an 11-character video ID, every one carrying a
  real `title` (18 of 19 also carry `channel`); none reads `"Untitled video"` or any placeholder.
  Well under the 200-entry cap.
- `youtubeResumeSchema`: `2`
- `youtubeResumeSettings`: the six documented settings, all valid.

**No fourth key, no v1-era shape, no untitled/duplicate entries.** This is the entire contents of
`chrome.storage.local` on the owner's profile — nothing outside the three documented root keys.

**Verdict: no surviving legacy artifact found.** Per the evidence-precedence table above, this is the
"0.0 finds nothing" branch — outcome (b) or refutation depends on T0.8, below.

### 0.5 — Static audit for a legacy-reimport code path

Read `storageManager.js` in full and grepped the entire repo (source and docs) for every
`chrome.storage.local` call site. Result: exactly one file (`storageManager.js`) touches
`chrome.storage.local` (the hard constraint holds), and it recognizes exactly three key names —
`youtubeResume`, `youtubeResumeSchema`, `youtubeResumeSettings` — nowhere else, in any version this
repo has ever shipped. `migrate()` reads/writes only the schema and settings keys; it never reads,
merges, or rewrites `youtubeResume`. PRD §7.6 confirms this was true even at the v1→v2 boundary:
`youtubeResume` has been the **same single key since v1.0** (§7.3's key table: "Introduced: v1.0"),
not a separate legacy key that v2 migrated data out of. There is no second key for anything to be
"reimported" from — the mechanism D-069 hypothesized would require a code path that has never existed
in this codebase.

### 0.6 / 0.7 / T0.6 / T0.7 — Repeated-migration entry-count stability

Seeded a synthetic pre-migration-shaped `youtubeResume` (3 entries missing `title`/`channel`/`updated`)
with no schema/settings keys present, then reloaded the extension's popup 5 times in a row (each
reload re-executes `storageManager.js`'s top-level `migrate()` call, simulating a browser restart per
D-052's technique).

| Run | Entry count | Keys |
|---|---|---|
| 1 (baseline) | 3 | legacyAAAAAAA, legacyBBBBBBB, legacyCCCCCCC |
| 2 | 3 | same |
| 3 | 3 | same |
| 4 | 3 | same |
| 5 | 3 | same |

**T0.6 pass, T0.7 pass:** entry count never grew across 5 runs; no untitled entry appeared that wasn't
present before run 1. Consistent with 0.5's static finding — `migrate()` cannot grow `youtubeResume`
because it never touches it.

### T0.8 — Decisive gate, primary hypothesis

T0.8 as literally worded ("legacy source data is absent after the single successful migration") does
not map onto this codebase: there is no separate legacy key for a successful migration to consume and
delete (see 0.5). The seeded legacy-shaped entries were still present in `youtubeResume` after run 1,
by design — PRD §7.6 requires migration to "leave every existing `youtubeResume` entry untouched."
That is expected, non-destructive behavior, not evidence of reimport.

The question T0.8 actually exists to answer — can repeated migration cause reimport/duplication — is
answered directly by the T0.6/T0.7 table above: **no growth across 5 runs.** Treating that as T0.8's
substitute pass condition, **T0.8 passes.**

**Gate outcome, applying the evidence-precedence table:** 0.0 found nothing (real profile has no
legacy key) **and** T0.8 passes (no reimport mechanism, live or static) → **outcome (b): the
legacy-reimport hypothesis is refuted.** Not just unreproduced — the code path it requires does not
exist and never has, in any shipped version.

### 0.7 / T0.2 / T0.3 — Defect B, secondary (title-identity) hypothesis

From the popup context, called `storageManager.saveProgress()` directly 10 times for the same
synthetic `videoId`, once with `title` forced `null` on every call (T0.2) and once with a distinct
non-null title on every call (T0.3):

- T0.2 (title forced null ×10): `youtubeResume` contains **exactly 1 entry**, `time` reflects the
  latest save (19).
- T0.3 (real title ×10): identical — **exactly 1 entry**, `time` 19, `title` "Real Title 9".

**Verdict: Not reproduced.** Title resolution has zero effect on entry count in either direction —
`getProgress`/`saveProgress` key the store by `videoId` only (`store[videoId]`), never by title, for
either code path. Matches D-064's pre-existing reading of the shipped code.

### 0.4 / T0.1 — Defect A repro (title change breaks resume)

Seeded a precondition entry for a real video (`aqz-KE-bpKQ`, `time: 200`) via direct storage write,
then loaded the real watch page with `document.title` permanently overridden (via `initScript`) to a
string with no resemblance to the real title and a fake unread-count prefix, without touching the
`v` URL parameter. After the load (player briefly errored under this environment's known
CDN/headless network limitation — same class of issue as D-051/D-060, not an extension defect),
storage was re-checked:

- `youtubeResume` still contains **exactly 1 entry** for `aqz-KE-bpKQ`, with the original `updated`
  timestamp unchanged (no new write occurred, spurious or otherwise) and the original title intact.

**Verdict: Not reproduced.** No duplicate entry was created under a drastically altered title signal,
consistent with 0.7's finding that `videoId` is the sole storage key. Whether resume visibly *fires*
end-to-end could not be independently re-confirmed live this session (the same video-playback
limitation Phase 9 hit — D-060) — but that is a question about UI/seek timing, not about the
title-identity mechanism defect A's hypothesis actually targets, which this test directly refutes.

### 0.8 — Defect C repro (near-zero overwrite)

From the popup context: `storageManager.saveProgress(videoId, 500, 600, 'Some Video', null)`, read
back (`time: 500`), then `storageManager.saveProgress(videoId, 2, 600, null, null)`, read back again.

- Before: `{ time: 500, duration: 600, title: "Some Video" }`
- After: `{ time: 2, duration: 600, title: "Some Video" }`

**Verdict: Confirmed.** `saveProgress()` performs an unconditional overwrite — `entry.time = time` with
no comparison against the existing stored value. A value of `2` is not `NaN`, not negative, and not
`> duration`, so `progressTracker.attemptSave`'s existing invalid-position guard (D-042/D-043) does not
catch it either; nothing in the current call chain distinguishes a genuine backward seek from a
spurious near-zero read. This is the exact mechanism PRD G13/§5.10 and Roadmap Phase 3 (D-066) target.

### 0.10 — Other failure modes observed

None in shipped behavior. One tooling-only gap surfaced while instrumenting: `popup/popup.html` loaded
`storage/storageManager.js` without `utils/debugLogger.js`, so calling `storageManager.saveProgress()`
from the popup context threw `debugLogger is not defined` (0.2's new log call). `popup.js` never calls
`saveProgress` today, so this was latent and not user-facing — but it would break the moment popup code
does call it, and it broke this session's own diagnostic testing. Fixed by adding the missing
`<script src="../utils/debugLogger.js">` include to `popup.html`, mirroring the module set every other
context already loads. Logged as D-084 (Tier 2 — value pick to unblock the diagnostic itself, not a
behavior change; `debugLogger.log` no-ops with `DEBUG = false`).

### Summary

| Defect / hypothesis | Verdict |
|---|---|
| A — title change breaks resume | Not reproduced |
| B (primary) — legacy v1 reimport | Refuted — no reimport code path exists, live or static |
| B (secondary) — title-identity | Not reproduced |
| C — near-zero overwrite | **Confirmed** |

---

## Phase 1 — Identity Hardening

**Goal:** YouTube video ID is the sole identity for a saved entry, made explicit and structurally
enforced rather than incidentally true. Title and thumbnail are display-only metadata: refreshed on
save, never read for lookup, comparison, or key derivation anywhere in the codebase.

**Depends on:** Phase 0 findings. If Phase 0 finds defect A/B are **not** caused by title
participating in identity, this phase still ships — it closes off the failure class structurally so
it cannot occur under a future refactor, and is cheap insurance regardless of Phase 0's verdict.

### Tasks

- [ ] 1.1 — Audit every call site that reads `videoId` (`navigationManager`, `resumeManager`,
  `progressTracker`, `storageManager`, `popup.js`) and confirm none of them fall back to, hash, or
  concatenate title/channel into anything used as a storage key or an equality check. Fix any found.
- [ ] 1.2 — `storageManager.saveProgress()`'s `videoId` parameter must be the only thing determining
  which entry is written. Title and channel remain metadata-only fields on the entry, refreshed
  per the existing preserve-if-omitted behaviour (D-016/D-045) — unchanged by this phase.
- [ ] 1.3 — `navigationManager`'s video-change detection compares `videoId` only. Confirm no
  incidental comparison against `document.title` (e.g. as a change-detection heuristic) exists
  anywhere in the SPA-navigation path.
- [ ] 1.4 — Add an explicit code comment at `storageManager`'s `store[videoId] = entry` line stating
  the identity invariant, so a future edit cannot reintroduce title into the key path silently.
- [ ] 1.5 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T1.1 | Save a video, change only its title signal, reload | Exactly 1 entry for that `videoId`; resume fires correctly |
| T1.2 | Grep the codebase for any comparison or key construction involving `title` or `channel` outside `storageManager`'s metadata fields and `popup.js` display code | Zero matches |
| T1.3 | SPA-navigate between two videos with identical titles but different `videoId`s | Two distinct entries, correctly keyed |
| T1.4 | SPA-navigate to the same `videoId` twice with different title signals in between | One entry, most recent title wins for display, `time`/`updated` reflect the second visit |

### Exit Criteria

- [ ] T1.1–T1.4 all pass
- [ ] No source path derives a storage key from title or channel

### Docs to Update

- TDD §4.6 (storage identity invariant), §7.3
- PRD §7.3

---

## Phase 2 — Storage Integrity

**Goal:** Schema version and migration are idempotent and version-aware; duplicate entries for the
same video ID are merged rather than allowed to coexist; a write with an unresolved video ID is
rejected outright; titles missing at save time are backfilled lazily on a later visit. All of this is
non-destructive — no entry is ever deleted by this phase's logic.

### Tasks

- [x] 2.1 — **Version-aware migration.** Replace the current "write current version if not equal"
  migration with a step-by-step chain (e.g. v1→v2) so each step's effect is explicit and idempotent
  independently, not just idempotent in aggregate. **This phase does not introduce a new schema
  version** — it leaves `youtubeResumeSchema` at its current value (2). Re-running migration at the
  current schema state must be a no-op beyond confirming the version is already current. Schema v3 is
  introduced exclusively in Phase 4, using the chain mechanism built here (see §3, independent-
  releasability: this keeps Phases 0–3 shippable without ever having advertised a v3 shape).
- [x] 2.2 — **Merge duplicates by video ID.** On extension load (or lazily, on next access), scan
  `youtubeResume` for any keys that do not look like a bare video ID (a defensive check, in case
  Phase 0 found a path that produced malformed keys) and merge any duplicates found for the same
  underlying video ID, keeping the entry with the **furthest position** (`time`) and the
  **most recent** `updated`/title/channel among the merged set. This task is a no-op if Phase 0 found
  no such malformed keys — implement it as a defensive repair pass regardless, since it is cheap and
  closes the failure class permanently.
- [x] 2.3 — **Reject unresolved video ID writes.** `storageManager.saveProgress()` must refuse
  (reject its promise, logged, not thrown to the caller uncaught) any call where `videoId` is
  falsy, empty, or not a plausible YouTube video ID shape. Callers (`progressTracker`) must already
  `.catch()` this per existing convention — no new UI, no user-visible error.
- [x] 2.4 — **Lazy title backfill.** If an entry has no `title` and the user revisits that same video,
  the existing save path (D-045's preserve-if-omitted logic) already backfills it — confirm this
  holds and add a test for it. No proactive re-fetch of titles for videos not being watched right now.
- [x] 2.5 — **Non-destructive guarantee, with one named exception.** No task in this phase may delete
  an entry from `youtubeResume`. Merging combines data into a single surviving entry; it never results
  in fewer distinct real videos represented than existed before, only fewer duplicate rows for the
  same video. **The one exception:** if Phase 0 confirmed the legacy-v1-reimport hypothesis for
  defect B (§2), then after a verified successful migration — the current schema version is confirmed
  written and every legacy entry has already been folded forward into `youtubeResume` — remove or
  neutralize the legacy v1 key/shape so it cannot be re-imported on a later load. This deletes only
  already-migrated legacy data that no longer has any effect if left alone except to be
  re-imported; it never deletes a v2 (or later v3) `youtubeResume` entry. If Phase 0 did not confirm
  the hypothesis, this exception is not implemented — there is nothing to remove.
- [x] 2.6 — Confirm `storage/storageManager.js` remains the only module touching `chrome.storage.local`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T2.1 | Run migration 5 times in a row from schema v2 | No data change after the first run; version reads current on every run |
| T2.2 | Seed two synthetic duplicate entries for the same video ID with different `time` values, run the merge pass | One entry remains, `time` equals the larger of the two |
| T2.3 | Seed two duplicates, one with a title and one without, run the merge pass | Surviving entry has the title |
| T2.4 | Call `saveProgress()` with an empty-string `videoId` | Promise rejects; no entry written; no uncaught error |
| T2.5 | Call `saveProgress()` with `videoId = undefined` | Promise rejects; no entry written |
| T2.6 | Entry with no title, same video revisited and saved again | Title now present |
| T2.7 | Run the merge pass against a store with zero duplicates | No entries removed or altered beyond the schema version write |
| T2.8 | Grep the codebase for `chrome.storage` | Only `storage/storageManager.js` matches |
| T2.9 | (Only if Phase 0 confirmed the legacy-reimport hypothesis) After a verified successful migration, inspect `chrome.storage.local` for the legacy v1 key/shape | Legacy data is gone; every legacy entry it held is now present in `youtubeResume` under its correct video ID; no v2 `youtubeResume` entry was removed |

### Exit Criteria

- [x] T2.1–T2.8 all pass (T2.9 not applicable — Phase 0 refuted the legacy-reimport hypothesis, see below)
- [x] No test scenario results in a real video's saved progress being deleted
- [x] `youtubeResumeSchema` still reads `2` at the end of this phase — no version bump occurred here

### Docs to Update

- TDD §4.6 (migration chain, merge pass, rejection rule, write-back guard)
- PRD §7.6

## Phase 2 Findings

Executed against a clean automation profile (0 pre-existing entries) via `chrome-devtools-mcp`,
driving the popup context directly (D-052's technique) — synthetic storage states were seeded and read
back via `chrome.storage.local` from that context, and the extension's own popup-load cycle
(`storageManager.js`'s top-level `migrate().then(repairDuplicates)`) was used to simulate repeated
loads, matching Phase 0's 0.6/0.7 methodology.

**D-070 dropped.** Per the amended task, legacy-key removal was not built. 0.0 found no legacy key on
the owner's real profile and 0.5 found no code path in any shipped version that ever created one —
both already recorded in D-085/D-070's own notes. T2.9 does not apply.

**Read-path investigation (defect-B third hypothesis — "Untitled video" entries were real entries
rendered without titles, not new ones).** Read `popup.js` in full: `getAllProgress()` and
`getSettings()` are awaited via a single `Promise.all` before any row is built, and
`storageManager.getAllProgress()` itself is one `chrome.storage.local.get(STORAGE_KEY)` call — Chrome's
storage API returns a coherent snapshot of the requested key, never a partial/torn read of the object
inside it. There is no code path in `popup.js` where rendering can begin before the read has fully
resolved, and no second read that could disagree with it. The one theoretical interleaving —
`storageManager.js`'s own load-time `migrate().then(repairDuplicates)` writing to `youtubeResume`
concurrently with `popup.js`'s independent `getAllProgress()` call — can only make `popup.js`'s read
land before or after that write, never mid-write; and `repairDuplicates` only merges duplicate rows
(preserving titles, per 2.2's merge rule), never clears one. **Verdict: not reproduced, and no fourth
hypothesis is proposed** — the read path has no structural mechanism that could produce a rendered
entry with an absent title while the underlying stored entry is intact.

**Write-back guard (ships regardless of the read-path finding, per the task).** D-045's
preserve-if-omitted logic already covers every save trigger structurally — all six triggers
(interval/pause/seeked/ended/visibility/pagehide) funnel through the single
`progressTracker.attemptSave` → `storageManager.saveProgress()` call site, so one guard covers all of
them by construction; there is no second call site that could bypass it. Verified directly against the
built extension: `saveProgress` called twice for the same ID, second call omitting title/channel with
`null`, `undefined`, and `''` — all three preserved the existing title/channel unchanged. **Gap found
and closed:** a whitespace-only string (`'   '`) was truthy under the original `title ? … : existing`
check, so it was *not* treated as omitted — it overwrote a real stored title with blank-looking text.
`youtubeUtils.getTitle()`/`getChannelName()` never produce that today (both trim and null out on
failure), so this was unreachable via real playback, but the guard itself needed to be robust to it
independent of the caller. Fixed by trimming before the truthiness check in both `saveProgress` and the
new merge pass's title/channel selection; re-verified live after the fix — the same whitespace-only
call now correctly preserves the existing title/channel. Logged as D-087.

**Duplicate merge / rejection tests, live:** T2.2 (two entries for one video ID, times 100 and 400) →
one surviving entry, `time: 400`. T2.3 (one entry titled, one not, for one video ID) → surviving entry
retains the title. T2.7 (a lone untouched entry alongside the above) → byte-identical after the repair
pass. T2.1 (5 sequential loads from schema v2) → no change after the first repair; schema reads `2` on
every load. T2.4/T2.5 (`saveProgress` with `''` / `undefined` videoId) → both rejected, logged, no entry
written; a malformed-shape ID (`'short'`) was also tried and rejected, beyond the two literally
specified cases. All test data removed from the automation profile after verification; it carried no
real entries before or after.

---

## Phase 3 — Resume Gate & Write Protection

**Goal:** Progress tracking cannot write a spurious position before the resume lifecycle has actually
resolved, closing off defect (C)'s class of failure structurally, independent of whatever Phase 0 finds
its specific trigger to be.

**Depends on:** Phase 0 findings for defect C should inform which trigger path gets the most test
attention, but the gate below is a general-purpose protection applied regardless of the specific
mechanism Phase 0 identifies.

### Tasks

- [ ] 3.1 — **Disarm on load.** `progressTracker` starts disarmed on every page/video load — it does
  not accept any write (interval or event) until it is explicitly armed.
- [ ] 3.2 — **Arm after resume resolves.** Tracking arms only once the resume lifecycle has resolved
  for the current video: either a successful (or verified-failed) `resumeManager.tryResume()` call
  has completed, or the video had no saved entry to resume in the first place (a fresh video arms
  immediately once metadata is available). This is a lifecycle gate, not a timer — it does not add a
  new fixed delay.
- [ ] 3.3 — **Post-seek verification carries through.** The existing verified-seek retry (D-022: 250ms
  re-read, re-assign if off by >3s, max 3 attempts) is retained unchanged. Arming happens after this
  retry sequence concludes (success or bounded give-up), not before.
- [ ] 3.4 — **Re-assert once against native override.** If, after the resume seek is verified, YouTube's
  own native "continue watching" restore is observed to move `currentTime` again shortly afterward,
  re-assert the resume position exactly once more. If it is overridden a second time, give up silently
  — no unbounded loop, no user-visible error.
- [ ] 3.5 — **The 400ms delay is unchanged.** This phase adds verification and gating around the
  existing delay; it does not add, remove, or resize the delay itself, which stays fixed and
  non-configurable (CLAUDE.md hard constraint).
- [ ] 3.6 — **Regression guard on writes.** Add a guard rejecting an interval-triggered save whose
  position is a large backwards jump (e.g. dropping to near-zero from a much higher previously-stored
  position) unless an observed user-initiated seek event immediately preceded it. Event-triggered
  saves (`seeked`, `pause`, `ended`, `visibilitychange`, `pagehide`) are exempt from this specific
  guard — a real seek-triggered save is expected to change position, sometimes backwards, and is the
  one case this guard must not block. **The Restart button's own path is a special case, not an
  assumption:** its click handler (`uiInjector.js`) sets `video.currentTime = 0` and then calls
  `storageManager.deleteProgress()` directly — verify whether that programmatic assignment actually
  emits a native `seeked` event on YouTube's player. If it does, the existing `seeked` exemption above
  already covers it and no further change is needed. If it does not, add an explicit exemption for
  this specific code path rather than relying on the generic event-trigger exemption to cover a case
  it may not actually reach.
- [ ] 3.7 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T3.1 | Cold load a video with a saved position | No storage write occurs before the resume lifecycle (seek + verification) has concluded |
| T3.2 | Cold load a fresh video with no saved entry | Tracking arms promptly; normal interval/event saves proceed |
| T3.3 | Simulate YouTube's native restore re-asserting position after our verified seek | Our resume re-asserts once; if overridden again, tracking still arms and gives up silently — no crash, no infinite retry |
| T3.4 | Simulate an interval tick firing with `currentTime` near zero on a video previously stored at a much later position, with no preceding seek event | Write is rejected; stored position unchanged |
| T3.5 | Genuine user seek backwards to an earlier point, followed by a `seeked`-triggered save | Write succeeds; stored position reflects the seek |
| T3.6 | Time the resume delay across 10 cold loads | Delay is 400ms in every case, unchanged from v2.0.0 |
| T3.7 | 10 consecutive cold loads of a saved video | 10/10 resume correctly, arm gate does not block or delay a single one beyond the existing lifecycle |
| T3.8 | Saved position far above zero (e.g. 20:00); click the extension's own Restart control | Pass: position resets to zero and the reset persists — `deleteProgress` removes the entry and no subsequent write resurrects the old non-zero position; the 3.6 backwards-write guard does not block this path. Fail: the guard rejects an associated write and the old position survives, or the entry is resurrected with a non-zero position after deletion. |

### Exit Criteria

- [ ] T3.1–T3.8 all pass
- [ ] No scenario results in a near-zero write silently overwriting a real saved position
- [ ] The 400ms delay value is unchanged and still not user-configurable

### Docs to Update

- TDD §4.4 (resume lifecycle, arm/disarm), §4.5 (write guard)
- PRD §5.4, §5.5

---

## Phase 4 — Pinning Data Layer

**Goal:** An additive, non-breaking storage field lets a saved entry be pinned, exempting it from the
200-entry eviction cap, with a hard cap of 20 pins.

**Independently additive:** This phase does not touch or depend on anything in Phases 0–3 beyond the
storage integrity guarantees they establish (a stable, deduplicated, correctly-keyed store to add a
field to).

### Tasks

- [ ] 4.1 — **Schema v3.** `VideoProgress` gains an optional `pinned: boolean`, defaulting `false`
  (i.e. absent = unpinned; existing entries need no rewrite). This phase is the **only** place in the
  release that bumps `youtubeResumeSchema`, from 2 to 3 — the first real use of the version-aware
  chain mechanism Phase 2.1 built (which itself introduced no new version). This ordering is what
  keeps Phases 0–3 independently releasable at schema v2 (§3): nothing before this task ever writes
  or advertises a v3 shape.
- [ ] 4.2 — `storageManager` gains `pinProgress(videoId)` and `unpinProgress(videoId)`. Pinning a 21st
  entry is **refused** — the call rejects with a descriptive reason, and no existing pin is ever
  auto-unpinned to make room.
- [ ] 4.3 — **Eviction respects pins.** The 200-entry eviction logic in `saveProgress()` excludes
  pinned entries from both the count subject to eviction and the eviction candidates themselves — the
  cap applies to unpinned entries only. Pinned entries never count toward, and never get removed by,
  the 200-entry cap.
- [ ] 4.4 — `storageManager.getAllProgress()` continues to return the full map unchanged; callers
  (popup) read the `pinned` flag directly rather than storageManager filtering/sorting for them.
- [ ] 4.5 — Confirm `clearAllProgress()` still removes all of `youtubeResume`, pinned or not — pinning
  protects against the 200-cap, not against an explicit user "clear all" action. This is a deliberate
  scope boundary, logged as a decision, not an oversight.
- [ ] 4.6 — Every new/touched promise chain ends in `.catch()`.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T4.1 | Load extension over a v2.0.0 (schema v2) profile | Schema advances to 3; all existing entries survive; none carry `pinned: true` unexpectedly |
| T4.2 | Pin 20 distinct entries | All 20 succeed |
| T4.3 | Attempt to pin a 21st entry | Rejected; the 20 existing pins are unchanged; no auto-unpin occurs |
| T4.4 | With 20 pins and 200 unpinned entries, save progress for a 201st unpinned video | An unpinned entry is evicted (oldest by `updated`); all 20 pinned entries and the 201st new entry survive |
| T4.5 | Unpin one of the 20, then pin a different, previously-unpinnable entry | Succeeds; total pinned count returns to 20 |
| T4.6 | `clearAllProgress()` with pinned entries present | All entries removed, pinned or not; settings and schema key untouched |
| T4.7 | Reload the extension five times after the schema v3 migration | No-op after the first run; no data change |
| T4.8 | Load a profile still at the Phase-2-era schema (version 2, chain mechanism present, no v3 step ever run) | Advances cleanly to schema 3 in one step; all existing entries survive with no rewrite beyond the version key; pinning becomes available immediately, no manual step required |

### Exit Criteria

- [ ] T4.1–T4.8 all pass
- [ ] No test results in more than 20 pinned entries existing simultaneously
- [ ] No test results in a pinned entry being evicted by the 200-cap logic

### Docs to Update

- TDD §4.6 (schema v3, pin cap, eviction exemption), §7.3, §7.5, §7.6
- PRD §7.3, §7.5

---

## Phase 5 — Pinning UI

**Goal:** Pinning is usable from the existing popup saved-videos panel — the data layer from Phase 4
is exposed, not a new surface.

### Tasks

- [ ] 5.1 — Add a pin control (icon button) to each row in the existing saved-videos list, toggling
  `pinProgress`/`unpinProgress`. Reveal-on-hover, keyboard-focusable, consistent with the existing
  per-row remove control's interaction pattern (Roadmap v2 8.7).
- [ ] 5.2 — **Pinned entries sort to the top** of the list, above all unpinned entries; within each
  group, sort by `updated` descending, matching the existing sort order.
- [ ] 5.3 — Visually distinguish a pinned row (e.g. a filled pin glyph vs. an outline glyph) so pin
  state is visible without hovering.
- [ ] 5.4 — When the popup shows the cap has been reached (20/20 pinned) and the user attempts to pin
  a 21st, surface a brief inline message rather than a silent no-op — new copy, no alert/confirm
  dialog.
- [ ] 5.5 — **New copy IDs continue from CP-61** (the last ID in use, per UX Spec §7). Assign the next
  free IDs (starting **CP-62**) to: the pin button's `aria-label` (pinned vs. unpinned state), and the
  cap-reached inline message. Write following UX Spec §2 voice rules; add to the §7 copy table.
- [ ] 5.6 — No `innerHTML` anywhere in the new markup. Icons via `document.createElement` /
  inline-SVG-as-DOM-nodes, consistent with the existing Ko-fi icon (D-058).
- [ ] 5.7 — Render performance: pinning/unpinning must re-render only the affected row's position and
  the two group boundaries, not rebuild the entire list, to hold the existing under-200ms-at-200-entries
  budget (Roadmap v2, T8.2).

### Tests

| # | Test | Pass condition |
|---|---|---|
| T5.1 | Pin a row partway down the list | Row moves to the top of the pinned group immediately; list does not visibly flicker/rebuild |
| T5.2 | Unpin a pinned row | Row moves out of the pinned group back into sorted position among unpinned entries |
| T5.3 | Pin 20 entries, attempt a 21st via the UI | Inline message shown per CP for the cap; no entry is pinned; no alert/confirm dialog appears |
| T5.4 | Keyboard only | Pin control on every row is reachable via Tab and operable via Enter/Space |
| T5.5 | Pinned vs. unpinned row, visual check | Pin state is distinguishable without hovering |
| T5.6 | Open popup with 200 entries, 20 pinned | Renders in under 200ms, matching the existing T8.2 budget |
| T5.7 | Grep the popup source | Zero occurrences of `innerHTML` |
| T5.8 | Copy audit | New pin-related strings match their assigned CP IDs (CP-62 onward) exactly |

### Exit Criteria

- [ ] T5.1–T5.8 all pass
- [ ] UX Spec §7 copy table includes every new CP ID introduced by this phase, with no gap or reuse of CP-30–CP-61

### Docs to Update

- UX Spec §6 (saved-videos panel — pin control, sort order), §7 (new CP-62+ entries)
- TDD §4.11 (popup rendering — pin sort/re-render behaviour)
- PRD §5.9, §7.3

---

## Phase 6 — Doc Reconciliation, Regression & Store Release

**Goal:** v3.0.0 is verified end to end, all docs describe what actually shipped, and the release is
ready to submit to the Chrome Web Store.

### Tasks

- [ ] 6.1 — Confirm every Phase 0 log point added to `utils/debugLogger.js` is fully gated behind
  `DEBUG = false`. The module itself is shipped v2.0.0 infrastructure, already registered in
  `manifest.json`'s `content_scripts` — it stays; removing it is out of scope for this phase (it
  would require a manifest change, which this release does not make). Shipped behaviour with
  `DEBUG = false` must be unchanged from v2.0.0 plus this release's fixes.
- [ ] 6.2 — Full copy audit against UX Spec §7, every ID including CP-62+.
- [ ] 6.3 — Permissions audit: `permissions` is `["storage"]` only; `host_permissions` is
  `https://www.youtube.com/*` only — unchanged from v2.0.0 (no new permission was needed anywhere in
  this release).
- [ ] 6.4 — Network audit: identical to v2.0.0's — only `i.ytimg.com` thumbnail GETs when enabled,
  zero otherwise. Pinning introduces no network activity.
- [ ] 6.5 — Bump `manifest.json` version to `3.0.0`.
- [ ] 6.6 — Reconcile PRD, UX Spec, and TDD against everything Phases 0–5 actually shipped, including
  the schema v3 change and the resume-arm-gate lifecycle.
- [ ] 6.7 — Rewrite `docs/project-state-summary.md` for v3.0.0.
- [ ] 6.8 — Run the full v2.0.0 regression suite (Roadmap v2, Phase 9's T9.1–T9.10 equivalents) to
  confirm nothing in this release regressed prior behaviour.

### Tests

| # | Test | Pass condition |
|---|---|---|
| T6.1 | Upgrade a real v2.0.0 profile (schema v2, with real saved entries, no pins) to v3.0.0 | All entries survive; schema advances to 3; none are auto-pinned; resume and tracking work unchanged |
| T6.2 | Fresh install of v3.0.0 | Works with no prior data; schema/settings keys created correctly at v3 |
| T6.3 | Full v2.0.0 regression suite | 100% pass, no regressions from Phases 0–5 |
| T6.4 | Defects A, B, C from §2, re-run against the finished v3.0.0 build | All three no longer reproduce |
| T6.5 | 20 pins present, 200 unpinned entries, 20 cold-load resumes across a mix of pinned and unpinned videos | 20/20 resume correctly; no pinned entry lost; no unpinned entry incorrectly protected from eviction |
| T6.6 | Permissions/manifest inspection | `permissions` and `host_permissions` byte-identical to v2.0.0; version reads `3.0.0` |
| T6.7 | Zipped build loaded from the zip | Loads clean; no warnings on the Extensions page |

### Exit Criteria

- [ ] T6.1–T6.7 all pass
- [ ] All docs (PRD, UX Spec, TDD, this roadmap) consistent with shipped code
- [ ] Manifest reads `3.0.0`
- [ ] Defects A, B, and C are confirmed fixed (or confirmed never to have existed, per Phase 0), not just theoretically addressed

### Docs to Update

- `docs/project-state-summary.md` (full rewrite for v3.0.0)
- PRD, UX Spec, TDD — final reconciliation pass across every section touched by Phases 0–5

---

## 5. Release Criteria for v3.0.0

| # | Criterion |
|---|---|
| R1 | Defects A, B, and C from §2 no longer reproduce against the shipped build |
| R2 | Video ID is the sole identity for a saved entry everywhere in the codebase |
| R3 | Zero data loss on upgrade from a real v2.0.0 profile |
| R4 | No entry is ever silently duplicated or deleted by migration or the merge pass |
| R5 | Progress tracking cannot write before the resume lifecycle for the current video has resolved |
| R6 | A large backwards position write is rejected unless preceded by an observed user seek |
| R7 | At most 20 pinned entries exist at any time; pinned entries are never evicted by the 200-cap |
| R8 | Permissions and network behaviour are byte-identical to v2.0.0 |
| R9 | The 400ms resume delay is unchanged and remains non-configurable |
| R10 | All user-facing copy matches UX Spec §7, including new CP-62+ entries |
| R11 | Phases 0–3 remain independently releasable without any Phase 4–6 dependency |

---

## 6. Open Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| K1 | Defect (B)'s original failure state is unavailable, so Phase 0's synthetic repro of either the primary (legacy reimport) or secondary (title-identity) hypothesis may not match the real-world trigger exactly | A fix could address the synthetic case but miss the real one | Phase 0 tests both hypotheses independently (0.5–0.7), not just the primary one; findings explicitly flag if a defect or hypothesis could not be reproduced at all |
| K2 | The resume-arm gate (Phase 3) changes when tracking becomes active, which touches the same lifecycle as ad-gating and verified-seek logic from v2.0.0 Phase 2 | Risk of a regression in already-hardened resume reliability | Phase 3 explicitly retains the existing verified-seek retry unchanged (3.3) and re-runs the v2.0.0 regression suite in Phase 6 (T6.3) |
| K3 | Merging duplicate entries (Phase 2.2) touches every existing user's real data on upgrade | A merge bug could lose or corrupt real saved progress | Non-destructive by construction (2.5): merge only combines, never deletes; furthest-position rule is deterministic and tested (T2.2, T2.3) |
| K4 | A 20-pin cap may feel arbitrary to users | Support friction | Value is a Tier 2 pick consistent with the existing philosophy of small, fixed limits (200-entry cap, six settings); revisit only if user feedback warrants a future release |
| K5 | Schema advances to v3 while PRD/UX Spec/TDD may still describe v2 shapes mid-build | Precedence rules point at a stale document | Every phase lists its doc sections; full reconciliation is Phase 6's explicit job (6.6) |
| K6 | The legacy-v1-key deletion (Phase 2.5's named exception) is the only deletion permitted anywhere in Phases 0–3 — a scoping mistake here could delete real v2 data instead of only already-migrated legacy data | Would violate CLAUDE.md's S2 (never delete/rewrite existing users' saved data beyond the additive migration) | Gated strictly behind a verified-successful migration check and only implemented at all if Phase 0 confirmed the legacy-reimport hypothesis (T2.9); if unconfirmed, no deletion code is written |

---

*This roadmap is the authoritative plan for YouTube Resume v3.0.0. Phases run in order. A phase is
complete only when every test passes and its listed doc sections are updated. There is no interim
ship gate — all seven phases (0–6) ship together as a single 3.0.0 release.*
