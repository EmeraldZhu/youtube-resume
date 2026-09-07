# Phase 0 Findings — v4.0.0 Reproduction & Harness Foundation

**Date:** 2026-09-08
**Reviewed against:** local source at commit `da8fa14` plus this phase's own `tests/` addition. No
production file (`content/`, `storage/`, `utils/`, `popup/`, `manifest.json`) changed.
**Harness:** `node tests/run.js` (add `--json` for machine-readable output). Dependency-free — Node
built-ins only (`fs`, `path`, `vm`). See `docs/ROADMAP_v4.md` Phase 0 Findings for the harness design
writeup; this document is the per-finding (F01–F21) companion to that per-case (R1–R24) table.

Verdict values used below: **Reproduced** (the harness confirmed the defect), **Reproduced via the
harness's synthetic technique, not a live browser** (still confirmed at the code level, per the
audit's own "Reproduced" evidentiary bar), **Not applicable — no R-case** (the audit itself never
classified this finding as "Reproduced"; it's a product gap, policy gap, or code-confirmed-but-
untested finding, and this phase did not attempt to newly reproduce it), **Could not confirm beyond
the audit's own evidence tier** (used only where this phase found a genuine gap — see the note at the
end).

---

## F01 — P1: Resume success is declared before the outcome is established

**Verdict: Reproduced.** Supported by R1, R2, R3.

- R1 confirms the toast fires while `seeking=true`/`readyState=1` — `seekWithVerification()` checks
  only numeric proximity, never seek state.
- R2 confirms nothing monitors for a native override after `tryResume()` resolves — a jump 10 seconds
  later is never corrected.
- R3 confirms a thrown corrective re-seek is swallowed: a warning is logged, but the success toast
  still appears and the actual position (post-override) is never reflected in it.

## F02 — P1: Restored or delayed tabs have no same-video recovery lifecycle

**Verdict: Reproduced** (the same-video-recovery half). Supported by R6, R11.

- R11 confirms `onVideoChange` fires exactly once despite a same-URL navigate-finish,
  visibilitychange, pageshow, and repeated poll ticks — none of those are wired to re-initialize.
- R6 confirms a player-discovery/metadata timeout has no later recovery path even when the awaited
  condition (metadata) eventually arrives.
- The audit's own "browser session-restoration attribution remains unverified" caveat is carried
  forward unchanged (see the closing note) — this phase did not attempt a real Chrome
  restore/discard/freeze test, which needs a live browser, not a Node harness.

## F03 — P1: Old asynchronous initialization can take control of a newer video

**Verdict: Reproduced.** Supported by R12, R21, R22.

- R12 confirms `playerObserver.disconnect()` clears the pending timeout without settling the
  `waitForVideo()` promise it was guarding — still unresolved 20 (virtual) seconds later.
- R21 confirms a stale navigation (A) whose settings read is deferred past a newer navigation's (B)
  full initialization still replaces B as the active tracker once it resolves — no generation check.
- R22 confirms A completing its own resume calls the shared `progressTracker.arm()`, arming B's
  tracker (B is now active, having superseded A) while B's own resume is still pending.

## F04 — P1: Completion validation can run against an ad or previous video's duration

**Verdict: Reproduced for the supplied-ad-metadata case; live YouTube-player-behavior dependence
carried forward unverified**, matching the audit's own qualifier. Supported by R5.

- R5 confirms `shouldResume()` evaluates and fails against a 30s ad-sized `video.duration` before
  `isAdPlaying()` is ever consulted — the ad-wait/deferral loop is never reached.
- The audit's caveat that live occurrence "depends on YouTube's current player behavior" (i.e.,
  whether `video.duration` genuinely reads the ad's duration during a real pre-roll) is a real-browser
  question this Node harness cannot settle and is not re-litigated here.

## F05 — P1: Failed resume and successful resume both unlock destructive checkpoint updates

**Verdict: Reproduced.** Supported by R7, R8.

- R7 confirms a tracker armed per bootstrap's unconditional `finally` (regardless of resume
  success/failure) overwrites a 3600s stored checkpoint with 60s on its first interval save.
- R8 confirms a native jump to 120s followed by a `seeked` event saves 120 through the event-trigger
  bypass of the backward-jump guard.

## F06 — P1: Concurrent storage operations overwrite one another

**Verdict: Reproduced.** Supported by R13, R14, R19.

- R13: two concurrent saves for different video IDs — only one entry survives the whole-object
  read-modify-write race.
- R14: concurrent delete-A/save-B — B's write, sourced from the pre-delete snapshot, resurrects A.
- R19: concurrent settings writes (rewind vs. toast) — one change is silently lost.

## F07 — P1: A stale duplicate tab can overwrite newer progress even with serialized storage

**Verdict: Reproduced for the overwrite case; deletion-recreation remains code-confirmed, not
independently reproduced this phase**, matching the audit's own split evidence. Supported by R23.

- R23 confirms a stale tab's hidden-triggered save (120s) overwrites a fresher shared checkpoint
  (3600s) — there is no writer-ownership or freshness check.
- The audit separately flagged "deletion recreation is code-confirmed" (an open tab recreating a
  just-deleted entry on its next lifecycle event) without a dedicated R-case; this phase did not add
  one, since Phase 0's job is to confirm the existing appendix, not expand it — Phase 3 owns building
  and testing the actual fix for both halves of F07 (write ownership *and* deletion-revision handling).

## F08 — P2: Seek direction and magnitude are mistaken for user intent

**Verdict: Reproduced for the two evidenced mechanisms; other seek directions remain code-confirmed
only**, matching the audit's own qualifier. Supported by R4, R9.

- R4 confirms a forward native jump during the initial delay cancels resume outright by magnitude
  alone, with no direction/intent check.
- R9 confirms a deliberate below-minimum rewind's `seeked` save doesn't reset `lastSavedTime`, so the
  next legitimate interval save is rejected as a false 940s backward jump.

## F09 — P2: Navigation teardown drops pending progress; shutdown saving remains best-effort

**Verdict: Reproduced for the teardown-drop mechanism; real browser-shutdown durability remains
untested**, matching the audit's own qualifier ("browser shutdown durability was not tested").
Supported by R10.

- R10 confirms `stop()` at 104s, with no prior save at that position, performs no flush — the sample
  is silently dropped.

## F10 — P2: Failed writes advance the last-saved marker and may never retry

**Verdict: Reproduced.** Supported by R24.

- R24 confirms a rejected pause-triggered save at 1100s still advances `lastSavedTime` to 1100 before
  the write's failure is known; 20 subsequent ticks at the same position never retry, because the
  delta guard now reads the position as "already saved."

## F11 — P1: Automatic duplicate repair can change identity and erase pin protection

**Verdict: Reproduced.** Supported by R15, R16.

- R15 confirms merging a pinned canonical entry with a whitespace-duplicate key drops `pinned` —
  `mergeEntryPair()` only ever copies time/duration/updated/title/channel.
- R16 confirms the invalid 12-character key `aaaaaaaaaaab` is rewritten to a different, unproven
  11-character key `aaaaaaaaaaa` via `resolveVideoId()`'s substring fallback.
- The audit's "requires malformed/duplicate stored data" precondition is exactly what both R-cases
  seed; this phase did not attempt to determine how often that precondition arises on real user
  profiles (Phase 0 of Roadmap v3 already investigated a related legacy-data hypothesis and found no
  evidence of it — see D-069/D-085 — a different question from whether the repair *logic* itself is
  safe, which is what F11/R15/R16 test).

## F12 — P2: Stored entries and settings are not validated field by field

**Verdict: Reproduced.** Supported by R17, R18.

- R17 confirms one `null` library row makes an otherwise-healthy `saveProgress()` for an unrelated
  video reject, throwing while reading the null row's `.pinned` during eviction's filter.
- R18 confirms `minWatchSeconds: "broken"` and `showToast: "false"` both pass through `getSettings()`
  unchanged — no field-level type validation.

## F13 — P2: Unpinning bypasses the unpinned-entry limit

**Verdict: Reproduced.** Supported by R20.

- R20 confirms unpinning the one pinned entry out of a 200-unpinned-plus-1-pinned library leaves 201
  unpinned entries — eviction only runs inside `saveProgress()`, not after `unpinProgress()`.

## F14 — P2: No bulk removal of completed videos

**Verdict: Not applicable — no R-case.** The audit classifies this as a **product gap** ("requested
by the user"), not a reproducible code defect — there is no existing "Remove completed" behavior to
reproduce a failure of. Unchanged from the audit; Phase 7 owns building it.

## F15 — P2: Completion semantics conceal meaningful unfinished portions of long videos

**Verdict: Not applicable — no R-case.** The audit classifies this as **code-confirmed and a
product-policy gap** (the 95%/98% cutoffs and `Math.round()`'s 99.5%→100% rounding are read directly
from source, not exercised via a synthetic repro) rather than something a harness "reproduces" in the
R1–R24 sense. Unchanged from the audit; Phase 7 owns it.

## F16 — P2: Popup state can diverge from storage and overlapping actions miscount rows

**Verdict: Not applicable — no R-case.** Audit: **code-confirmed; rapid interaction not live-tested.**
This phase's harness doesn't load `popup.js` at all (no R1–R24 case touches the popup layer — see
`tests/lib/harness.js`'s module list) since the appendix contains no popup-layer R-case. Unchanged
from the audit; Phase 8 owns it and should extend the harness to cover the popup layer when it does.

## F17 — P2: Turning thumbnails off does not remove existing or queued image loads

**Verdict: Not applicable — no R-case.** Audit: **code-confirmed; subsequent network timing not
measured.** Same popup-layer scope note as F16. Phase 8 owns it.

## F18 — P3: Popup actions do not consistently preserve keyboard focus and context

**Verdict: Not applicable — no R-case.** Audit: **code-confirmed handling gaps; assistive-technology
behavior not tested** — inherently a real-browser/screen-reader question, not one a Node harness can
answer. Phase 8 owns it.

## F19 — P3: Toast cleanup does not cancel its pending animation callback

**Verdict: Not applicable — no R-case.** Audit: **code-confirmed race; not browser-reproduced.**
`requestAnimationFrame` behavior (and its interaction with a hidden/backgrounded tab throttling
frames) is real-browser-dependent; this phase's fake clock treats `requestAnimationFrame` as a plain
16ms timer (see `tests/lib/harness.js`), which is adequate for the phases that need it (none yet) but
not a substitute for the real race condition F19 describes. Phase 8 owns it.

## F20 — P2: Explicit timestamp links have no defined precedence over saved progress

**Verdict: Not applicable — no R-case.** Audit: **code-confirmed policy gap** — there is no existing
precedence behavior (defined or otherwise) to reproduce a failure of; `t=` parsing doesn't exist yet.
Unchanged from the audit; Phase 4/5 own building D-107's policy.

## F21 — P2: Existing verification does not cover the failure modes behind the reliability claim

**Verdict: Addressed by this phase's own existence**, not "reproduced" in the R1–R24 sense — F21 is
the audit's meta-finding that no committed regression suite existed. `tests/` (this phase's
deliverable) is the direct remediation: a dependency-free, committed, deterministic harness
reproducing all 24 appendix checks, runnable via one documented command (`node tests/run.js`), with
results that don't depend on session memory. The stale-`CLAUDE.md` half of F21's evidence
(targeting v2, describing the TDD as v1, stating a simple 200-entry cap) was already corrected before
this phase — see D-125 and the current `CLAUDE.md` header, which reads v4.0.0-in-progress /
v3.0.0-shipped-baseline with the 200-unpinned/20-pinned wording.

---

## What this phase could not confirm beyond the audit's own evidence tier

Nothing. Every finding the audit itself marked **"Reproduced"** in the appendix (F01–F13, plus F04's
partial and F08's partial) reproduced again against current HEAD via this phase's committed harness,
with the same mechanism the audit described in every case — no finding flipped to "reproduces
differently" or "not reproduced." Findings the audit did **not** mark as reproduced (F14–F21) are
carried forward with their original evidence tier unchanged (product gap / code-confirmed / policy
gap / document-confirmed, per finding above) — this phase did not attempt to newly reproduce any of
them, since doing so would require either a live browser (F02's session-restoration half, F04's live
ad-metadata half, F09's shutdown-durability half, F18's assistive-technology half, F19's real
`requestAnimationFrame`/backgrounding race) or a not-yet-built feature (F14, F20) or the popup layer,
which this phase's harness deliberately does not load (F16, F17). None of this is new information —
it restates the audit's own limitations section rather than resolving it, which is honest per F21's
own acceptance criterion ("'Pass' must not stand in for an unexecuted critical scenario").
