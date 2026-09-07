# Extension audit and proposed remediation

Date: 2026-09-07  
Reviewed: local v3.0.0 source at commit `e1e232a`, including all 11 JavaScript files, manifest, popup HTML/CSS, and relevant specifications, decisions, and previous findings.  
Scope: findings and recommendations only. No implementation, manifest, settings, or saved-user-data changes were made.

## Assessment

The reported resume problems remain plausible in the current implementation despite the earlier resume-hardening work. Several underlying failure paths are reproducible directly against the source:

- A success toast can appear while a seek is still pending, after a corrective seek throws, or before a later native restore undoes the extension's seek.
- Initialization is essentially one attempt per video ID. Readiness timeouts, later activation of a restored tab, and replacement of the media element have no coordinated recovery path.
- A failed resume can be followed by saving a much earlier position over the checkpoint needed for recovery.
- Concurrent library mutations can lose unrelated entries or restore entries that were just deleted.

This audit identifies **21 findings: eight P1, eleven P2, and two P3**. P1 means a core resume or data-integrity defect; P2 means a functional gap or important reliability issue; P3 means a narrower UI or accessibility defect. Priority is separate from how frequently a condition occurs.

### Evidence and limitations

**Reproduced** means an isolated Node `vm` experiment executed the actual source with controlled media, timers, DOM events, or asynchronous storage. Twenty-four such checks reproduced the behavior recorded in the appendix. These establish code behavior under the supplied conditions; they do not measure how often YouTube produces those conditions.

**Code-confirmed** means the implementation directly exposes the path, but this audit did not reproduce it in a real browser. **Product gap** means an absent capability or policy rather than an accidental implementation error.

All 11 JavaScript files and the manifest parsed successfully. The experiments used synthetic in-memory data and ran from standard input; no test files or dependencies were added. The pre-existing untracked `.claude/settings.local.json` was left untouched.

No live Chrome restart, signed-in YouTube session, throttled playback, ad delivery, or rendered-popup accessibility test was performed. The user's observations are the live symptom report; this document does not claim to have reproduced those exact sessions. Browser behavior cited below was checked against primary documentation.

## Mapping the reported symptoms

| Observation | Most relevant findings | Explanation supported by the source |
|---|---|---|
| Long or slowly loading videos show success before actually resuming | F01, F04, F05 | The check samples a media property, does not wait for settled playback, and accepts an unverified final correction. |
| YouTube's native restore wins | F01, F08 | A native jump can cancel the attempt during the first delay; an override after the brief final check is not monitored. |
| The active YouTube tab fails after Chrome restores a session | F02, F03, F05, F09 | Cold injection does run initialization, but an early failure is not recovered and the saved checkpoint may also be stale or subsequently overwritten. |
| Clicking another restored YouTube tab does not recover resume | F02, F07 | Becoming visible is not a resume trigger; other tabs can also overwrite the shared checkpoint. |
| Opening from the popup works more consistently | F02 | Popup links open a new watch-page tab, creating another cold-load attempt. There is no special timestamp or more reliable resume protocol in the popup link. |
| Failures are not recognized and success is misleading | F01, F05 | Some failures are warned about, but outcomes are not returned to the caller, and final/native-override failure can still become success UI. |
| Bulk removal of fully watched videos is missing | F14, F15 | Only individual removal and clear-all exist; displayed 100% is not a safe completion predicate. |

Long duration itself has no separate failure branch. Slow readiness, media replacement, ad metadata, native restore timing, and completion thresholds are the mechanisms to test. Increasing a delay alone would not address all of them.

## Findings

### F01 — P1: Resume success is declared before the outcome is established

**Evidence:** [resumeManager.js:83](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:83), [resumeManager.js:109](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:109), [resumeManager.js:264](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:264). **Reproduced: R1–R3.**

`seekWithVerification()` accepts one `currentTime` sample within three seconds of the target after 250ms. It never checks `seeking`, readiness, or whether target media is available. The following 500ms native-override check can assign `currentTime` again, but never verifies that assignment. It catches errors without returning failure, so the caller still shows the toast and Restart button. Later overrides have no observer.

With saved time 3600s, the harness displayed success for 3598s at 1150ms while `seeking=true` and `readyState=1`. It also displayed that same success after the final assignment threw and the position remained 120s. A subsequent override to 120s was left untouched.

This distinction is real browser behavior: assigning `currentTime` updates the reported position before seeking finishes; the media seeking algorithm separately waits for target data and decoding. See the [HTML media seeking specification](https://html.spec.whatwg.org/multipage/media.html#seeking).

**Address:** Make each seek attempt produce an explicit verified outcome. Establish content readiness and seekability, await seek completion or confirm an already-settled position, and check readiness plus position stability before success UI. Verify every corrective seek. During a bounded startup stabilization period, distinguish native interference from explicit user intent and allow recovery without an endless seek fight. Account for actual elapsed time and playback rate, and support paused media without forcing playback.

**Acceptance:** No success toast for pending, rejected, or overwritten seeks. Test native overrides before, during, and after the present 1150ms path, and buffering lasting several seconds.

### F02 — P1: Restored or delayed tabs have no same-video recovery lifecycle

**Evidence:** [navigationManager.js:27](C:/Users/emera/Documents/Dev/youtube-resume/content/navigationManager.js:27), [playerObserver.js:24](C:/Users/emera/Documents/Dev/youtube-resume/content/playerObserver.js:24), [resumeManager.js:155](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:155). **Reproduced: R6, R11; browser session-restoration attribution remains unverified.**

The navigation callback only runs when `v` changes. Player discovery gives up after ten seconds; metadata gets two five-second waits. After failure, later metadata, same-ID navigation events, or tab activation do not restart initialization. The visibility listener saves only when hidden. There are no resume hooks for `pageshow`, lifecycle `resume`, or replacement of an already-discovered video element.

This does **not** mean restored pages never receive content scripts: a fresh document can run the cold-load path. The defect is that success depends on that one path completing before its timeouts. A popup row simply opens `/watch?v=...` in a new tab, giving initialization another chance.

**Address:** Maintain an idempotent per-video lifecycle with deferred recovery. Re-evaluate failed/pending sessions on visibility return, relevant page lifecycle events, and actual media readiness/replacement. Reuse one observer and the existing scheduling mechanism. Give each attempt a deadline, but preserve a pending checkpoint for a later meaningful readiness event. Do not re-seek on every tab switch after successful normal playback.

**Acceptance:** Restore Chrome with a saved video active and others inactive; activate the latter after 30–120 seconds. Also test frozen, discarded/reloaded, back-forward-restored, and player-replaced pages. Resume should recover without opening the popup. Chrome documents the distinction between frozen, resumed, and discarded pages in its [Page Lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

### F03 — P1: Old asynchronous initialization can take control of a newer video

**Evidence:** [bootstrap.js:14](C:/Users/emera/Documents/Dev/youtube-resume/content/bootstrap.js:14), [navigationManager.js:33](C:/Users/emera/Documents/Dev/youtube-resume/content/navigationManager.js:33), [playerObserver.js:98](C:/Users/emera/Documents/Dev/youtube-resume/content/playerObserver.js:98). **Reproduced: R12, R21, R22.**

Navigation launches asynchronous work without a generation token or cancellation signal. Teardown does not cancel an in-flight settings read, metadata/ad wait, or seek. An old invocation can later start tracking the current element under the previous ID, seek a reused element, insert stale UI, or call the global `arm()` for a newer invocation. Player discovery accepts any existing video immediately without establishing that it belongs to the requested content.

In one experiment, delayed initialization for A resumed after B finished and replaced B's tracker with A's. In another, A completing armed B while B's resume was still pending. Separately, `playerObserver.disconnect()` clears its timeout and observer without settling the associated promise; the experiment remained unresolved after 20 seconds.

**Address:** Give each navigation/media lifecycle an identity and cancellation signal. Check identity after every await and before seeks, saves, arming, and UI. Make tracking operations session-specific. Cancellation must settle pending promises and remove listeners/timers. Confirm content identity and element ownership before using existing metadata.

**Acceptance:** Rapid A→B→C navigation, leaving a watch page during an ad, delayed settings reads, and reused/replaced media elements must never cause stale seeks, wrong-ID saves, unresolved waits, or premature arming.

### F04 — P1: Completion validation can run against an ad or previous video's duration

**Evidence:** [resumeManager.js:178](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:178), [resumeManager.js:200](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:200), [playerObserver.js:38](C:/Users/emera/Documents/Dev/youtube-resume/content/playerObserver.js:38). **Reproduced: R5 for supplied ad metadata; live occurrence depends on YouTube's current player behavior.**

`shouldResume(saved.time, video.duration)` runs before the ad wait. If the video element currently describes a 30-second pre-roll and the saved content position is 3600s, validation returns false immediately: ad deferral is never reached. Metadata is not reacquired and revalidated after ad clearance. Similarly, SPA reuse can expose previous-content metadata. An ad beginning during verification is also outside the last ad check.

**Address:** Resolve the current content identity, defer through ads, obtain current content metadata, then validate eligibility. Revalidate if the media source or ad state changes during seeking. Do not classify a saved content position using an ad duration.

**Acceptance:** Test a saved long video with a pre-roll, consecutive ads, an ad beginning during verification, and SPA transition from a short video to a long video. No content seek or save should target ad media.

### F05 — P1: Failed resume and successful resume both unlock destructive checkpoint updates

**Evidence:** [bootstrap.js:53](C:/Users/emera/Documents/Dev/youtube-resume/content/bootstrap.js:53), [progressTracker.js:54](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:54), [progressTracker.js:135](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:135). **Reproduced: R7, R8.**

`tryResume()` returns no result distinguishing success, failure, cancellation, or intentional ineligibility. Bootstrap always arms tracking in `finally`, including after a failed storage read or resume. The tracker knows the element's initial position, not the stored recovery target. After a failed 3600s resume, playback reaching 60s can overwrite the target with 60s. A native jump from 3600s to 120s followed by `seeked` also saves 120s: event writes bypass the backward-jump guard.

There are console warnings for some failures, so failure handling is not entirely absent. However, no durable outcome or retry state exists, and `DEBUG=false` removes most diagnostic detail. Failure, skip, and success all look alike to the caller.

**Address:** Return typed outcomes with reason, target, observed position, and attempt identity. Preserve the last good checkpoint during pending/recoverable failure; release protection only after verified resume or established user-directed playback. Keep legitimate backwards seeks and restarting supported. Record bounded local diagnostics for failures, with an optional popup status/retry surface; avoid success UI or intrusive playback errors on failure. A permanent highest-time-wins rule would break intentional rewinds and is not a suitable fix.

**Acceptance:** Failed loads, native overrides, and storage-read errors cannot replace a known checkpoint with startup position. Successful recovery and deliberate restart must eventually save normally. Diagnostics must distinguish timeout, seek failure, user override, completion skip, and cancellation.

### F06 — P1: Concurrent storage operations overwrite one another

**Evidence:** [storageManager.js:221](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:221), [storageManager.js:278](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:278), [storageManager.js:350](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:350), [storageManager.js:431](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:431). **Reproduced: R13, R14, R19.**

Save, delete, pin, unpin, and repair independently read and then replace the entire `youtubeResume` object. Interleaving two saves for different IDs left only the second entry in the harness. Interleaving delete-A with save-B restored A. Settings writes have the same problem: simultaneous changes to rewind and toast lost the rewind change.

Every content-script instance and popup runs its own migration/repair initialization. The comment suggesting repair runs in whichever context loads first does not establish mutual exclusion. An individual `set()` does not make the preceding read-modify-write sequence transactional; the experiments model separate asynchronous operations from the [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).

**Address:** Route all mutations, including migration, repair, settings, and clearing, through one serialized extension-owned writer, for example an MV3 service worker receiving commands. Await its initialization before mutations and design for worker restarts. A promise queue inside each tab is insufficient. Per-video storage keys can reduce unrelated-key contention but still need coordination for caps, pinning, clearing, and same-video conflicts. Any architecture or schema change should get a compatibility and migration review before implementation.

**Acceptance:** Simultaneous saves across tabs preserve every entry; delete/pin/clear/repair races have deterministic results; concurrent settings changes survive. Include worker restart/retry cases if that design is adopted.

### F07 — P1: A stale duplicate tab can overwrite newer progress even with serialized storage

**Evidence:** [progressTracker.js:140](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:140), [storageManager.js:289](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:289), [popup.js:276](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:276). **Reproduced: R23; deletion recreation is code-confirmed.**

There is no writer ownership or freshness check for the same video. A paused tab at 120s can overwrite another tab's 3600s checkpoint when the old tab becomes hidden. The new `updated` timestamp makes the stale position look fresh. This is independent of F06: strictly sequential writes still do it.

Likewise, removing an entry or clearing the library does not inform open trackers. A later pause, visibility event, or playback save can recreate the entry. A completed paused tab can therefore undermine the requested bulk cleanup unless deletion behavior is defined.

**Address:** Track playback-session identity, meaningful activity, revisions, and explicit user seek intent. Give the actively used playback session an ownership policy; do not let inactive stale sessions supersede it just because a lifecycle event fired. Communicate deletion/reset revisions to open trackers and suppress recreation from unchanged stale state. Define when genuinely resumed watching creates a new entry again. Do not globally choose maximum time.

**Acceptance:** With two tabs of the same video, switching or closing a stale paused tab preserves the newer checkpoint. Explicit playback in the other tab can take ownership. Deleted completed entries stay deleted while unchanged tabs remain open.

### F08 — P2: Seek direction and magnitude are mistaken for user intent

**Evidence:** [resumeManager.js:233](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:233), [progressTracker.js:88](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:88), [progressTracker.js:141](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:141). **Reproduced: R4, R9; other directions are code-confirmed.**

A forward native jump larger than 10.4s during the initial delay is treated as a user seek and cancels resume. Genuine backwards seeks and smaller user seeks do not trigger that guard. The later corrective seek can also undo a deliberate user seek. `seeked` alone cannot distinguish user activity from extension or YouTube programmatic seeking.

There is a second concrete gap: after seeking from 1000s to 0s, the below-minimum guard prevents the seek event from resetting `lastSavedTime`. Interval saves at 60s are then rejected as large backwards jumps. A later pause/visibility event can recover saving, but the claimed interval exemption does not hold.

**Address:** Model extension-owned seeks and user interaction separately, including keyboard, pointer, and accessible controls. Cancel automatic correction on established user intent. Reset the tracker baseline for deliberate backwards movement even when the new position is below the saving threshold; clearing an old saved checkpoint needs an explicit policy. Use measured elapsed time and playback rate for natural-drift allowances.

**Acceptance:** Native jumps do not falsely count as user input; deliberate forward/backward/small seeks are respected. After a user rewind below the threshold, interval saves resume when the threshold is crossed.

### F09 — P2: Navigation teardown drops pending progress; shutdown saving remains best-effort

**Evidence:** [bootstrap.js:16](C:/Users/emera/Documents/Dev/youtube-resume/content/bootstrap.js:16), [progressTracker.js:162](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:162), [progressTracker.js:200](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:200). **Reproduced: R10; browser shutdown durability was not tested.**

`stop()` removes tracking without flushing or preserving the last valid sample. SPA navigation does not itself guarantee a pause/pagehide event before the element changes. The harness discarded a 104s position on stop with no save. Also, the nominal five-second cadence is five interval callbacks, so it is not a wall-clock guarantee when a page is suspended or timers are delayed. No save guard rejects an in-progress seek.

Visibility/pagehide saving is useful and already implemented, but the asynchronous read then write may not finish during shutdown. Abrupt termination cannot guarantee saving the final frame; Chrome notes that [discard is not observable when it occurs](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

**Address:** Keep a last valid, non-ad, settled sample tied to content identity. Flush that snapshot before navigation teardown rather than reading a possibly repurposed element afterward. Schedule/coalesce saves using elapsed time and playback activity, retain hidden-page flushing, and avoid relying on shutdown as the primary checkpoint. Specify a realistic checkpoint-loss budget rather than promising exact recovery after every crash.

**Acceptance:** SPA exit just before the periodic save retains the latest confirmed sample; pending seeks are not persisted as completed playback. Measure ordinary close/reopen separately from crash/kill and discard cases.

### F10 — P2: Failed writes advance the last-saved marker and may never retry

**Evidence:** [progressTracker.js:114](C:/Users/emera/Documents/Dev/youtube-resume/content/progressTracker.js:114). **Reproduced: R24.**

`lastSavedTime` is assigned before `saveProgress()` resolves. A transient failed pause save at 1100s therefore makes later interval checks believe 1100s was saved. In the harness, twenty ticks produced no retry while paused at that position.

**Address:** Separate last observed, pending, and last successfully persisted positions. Update the committed marker only on acknowledgment; keep a dirty sample for bounded retry. Coalesce pending writes and reject obsolete completions using the session identity from F03.

**Acceptance:** Inject a single storage failure on pause; after storage recovers, the same checkpoint is persisted without requiring another user action. Out-of-order acknowledgments cannot regress the committed marker.

### F11 — P1: Automatic duplicate repair can change identity and erase pin protection

**Evidence:** [storageManager.js:144](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:144), [storageManager.js:163](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:163), [storageManager.js:189](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:189). **Reproduced: R15, R16; requires malformed/duplicate stored data.**

`resolveVideoId()` accepts the single 11-character substring of an invalid 12-character token. The synthetic key `aaaaaaaaaaab` became `aaaaaaaaaaa`, assigning data to a different identity without proof. If that destination already exists, unrelated data can merge. `mergeEntryPair()` copies only time, duration, updated, title, and channel: a pinned duplicate loses its pin and becomes eligible for eviction. It also pairs the furthest position with the newest update time, potentially reviving old progress after a deliberate rewind.

Invalid non-object entries are skipped while constructing the repaired map; if another key makes `changed=true`, those skipped entries disappear from the persisted map. Without any other change, invalid entries remain. This undermines the documented non-destructive repair claim.

**Address:** Only canonicalize identities proved by exact parsing, such as surrounding whitespace or an explicitly supported URL format. Preserve unresolved data separately rather than guessing or silently dropping it. Preserve pin state and compatible unknown fields in merges. Revisit furthest-time merge semantics using revision/session evidence, and retain a reversible original-data snapshot before repair. Serialize repair with normal writes as in F06.

**Acceptance:** Invalid 12+ character tokens are not truncated; ambiguous identities remain recoverable; duplicate pins survive; malformed values are not silently deleted; intentional newer rewinds are not mistaken for inferior data.

### F12 — P2: Stored entries and settings are not validated field by field

**Evidence:** [storageManager.js:254](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:254), [storageManager.js:325](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:325), [storageManager.js:419](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:419), [popup.js:304](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:304). **Reproduced: R17, R18; malformed-data precondition.**

One `null` library entry makes an otherwise valid save throw while reading `.pinned`; it can also break popup sorting/rendering. `getSettings()` accepts arrays and arbitrary object fields. For example, `minWatchSeconds: "broken"` survives defaults and prevents the numeric comparisons from passing, while `showToast: "false"` is truthy. Write-time numeric progress validation is also absent in the storage abstraction.

Popup list loading combines settings and progress in one `Promise.all`. Failure of either read is rendered as “No saved videos yet,” which conflates unavailable data with a genuinely empty library.

**Address:** Validate root shapes, canonical IDs, finite non-negative times, positive durations, timestamps, metadata types, allowed setting presets, and real booleans at the boundary. Apply per-field defaults and isolate bad rows without deleting originals. Let valid library data render when settings fail, using safe defaults; distinguish load failure from empty state.

**Acceptance:** Null rows, arrays, bad numeric fields, and string booleans cannot disable healthy saving or rendering. Settings read failure does not hide valid saved videos.

### F13 — P2: Unpinning bypasses the unpinned-entry limit

**Evidence:** [storageManager.js:325](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:325), [storageManager.js:392](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:392). **Reproduced: R20.**

Eviction runs only in `saveProgress()`. With 200 unpinned entries plus one pinned entry, unpinning leaves 201 unpinned entries until a later progress save. More unpins can exceed the limit further. Concurrent pin operations can also violate the pin cap unless F06 is addressed.

**Address:** Enforce retention invariants in the shared mutation transaction after every operation that changes eligibility. Explicitly define whether unpinning into a full library immediately evicts the oldest eligible entry and communicate that behavior. Preserve pin exemption.

**Acceptance:** Test full-cap unpinning, repeated unpins, and concurrent pin operations. The chosen cap policy must hold after the operation resolves, not just after a later playback save.

### F14 — P2: No bulk removal of completed videos

**Evidence:** [popup.js:276](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:276), [popup.js:319](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:319), [storageManager.js:409](C:/Users/emera/Documents/Dev/youtube-resume/storage/storageManager.js:409). **Product gap, requested by the user.**

The popup offers one-row removal or clear-all in Settings. Neither efficiently removes fully watched videos while keeping unfinished ones.

**Address:** Add a clearly discoverable “Remove completed” action in the saved-videos view, with a matching count. Preview the exact removal count and make pin behavior explicit; recommended default is to preserve pinned videos with a separate opt-in to include them. Perform one coordinated batch mutation, preserve settings/schema and unrelated entries, and update list/count/focus only after acknowledgment. An undo window is preferable if practical. Integrate deletion revisions from F07 so open completed tabs do not immediately restore the rows.

Use verified completion data, not the rounded displayed percentage or the configurable 90/95/98% resume cutoff. For new saves, an additive end-of-playback marker with its associated duration/revision would be clearer. For old entries, document a conservative inference rule and the ambiguity from integer-second storage. Do not silently turn a “100%” cleanup request into deletion of everything above 95%.

**Acceptance:** Mixed incomplete, complete, pinned-complete, and malformed entries; zero matches; filtered/large libraries; concurrent playback; cancellation and storage failure. Only the explicitly eligible set is removed.

### F15 — P2: Completion semantics conceal meaningful unfinished portions of long videos

**Evidence:** [popup.js:194](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:194), [popup.html:66](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.html:66), [timeUtils.js:39](C:/Users/emera/Documents/Dev/youtube-resume/utils/timeUtils.js:39). **Code-confirmed and product-policy gap.**

The default 95% cutoff deliberately suppresses resume for the last 18 minutes of a six-hour video. The highest available setting, 98%, still excludes the final 7.2 minutes; there is no “only when actually finished” option. This explains some missing resumes, but does not explain a false success toast because the cutoff returns before showing UI.

Separately, `Math.round()` reports 100% at 99.5%. A six-hour video can show 100% with 108 seconds left. The data represents the current playhead fraction, not proof that all preceding content was watched; seeking to the end also raises the percentage. Flooring time and duration before saving introduces further end-boundary ambiguity.

**Address:** Separate resume eligibility, completion detection, and display. Offer an actual-ended/100% policy or a clearly described remaining-time rule for long videos. Reserve the completed label for the chosen completion predicate; otherwise cap approximate percentages below 100. Describe progress as position unless the product starts tracking watched coverage. Also reconcile the minimum-time boundary: the UI says “less than,” but `meetsMinimumWatched()` uses strict `>` and excludes equality.

**Acceptance:** Test 94.9/95/98/99.5/100% of long videos, fractional durations, explicit seeks to the end, and each exact minimum-time preset. Bulk cleanup must use the documented predicate.

### F16 — P2: Popup state can diverge from storage and overlapping actions miscount rows

**Evidence:** [popup.js:246](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:246), [popup.js:276](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:276), [popup.js:295](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:295). **Code-confirmed; rapid interaction not live-tested.**

The list is a one-time snapshot and has no storage-change subscription. While it remains open, playback can change progress, metadata, retention, and counts. Pinning re-sorts using the row's old `updated` value. Buttons remain enabled while asynchronous actions are pending: two queued remove clicks can both decrement the counter; two pin clicks can both increment `pinnedCount` after idempotent storage operations. A clear-all racing with a row action can leave local counts inconsistent even after storage serialization is fixed.

**Address:** Disable/coalesce pending actions per entry, sequence clear-all against row actions, and derive counters from acknowledged state. Subscribe through the storage abstraction to relevant changes and reconcile rows without losing focus. Distinguish external deletion from failed mutation.

**Acceptance:** Rapid double clicks, playback updates while the popup stays open, eviction, and pin/remove/clear overlap produce correct rows and counts with no negative or phantom totals.

### F17 — P2: Turning thumbnails off does not remove existing or queued image loads

**Evidence:** [popup.js:169](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:169), [popup.js:300](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:300), [popup.js:362](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:362). **Code-confirmed; subsequent network timing not measured.**

`loadThumbnails` is read once when building rows. Changing the toggle only updates button states; existing lazy images retain their `src`. Returning to the list and scrolling can therefore initiate previously deferred image requests after the setting was switched off. Reopening the popup does honor the setting, so this is an in-session application gap, not a total failure of the off switch. Resetting settings has the same stale-row issue.

**Address:** Apply changes to the thumbnail DOM immediately: remove image elements/sources when disabled and restore eligible images when enabled. Cancel pending work where possible; requests already sent cannot be recalled. Make the privacy wording match that boundary. Separately, content-script settings intentionally apply on the next navigation according to the TDD; either explain that behavior in the popup or deliberately add live propagation.

**Acceptance:** Open a long list, turn thumbnails off, return and scroll without closing the popup. No new thumbnail requests should start. Repeat with reset-to-defaults and external settings changes.

### F18 — P3: Popup actions do not consistently preserve keyboard focus and context

**Evidence:** [popup.js:107](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:107), [popup.js:285](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:285), [popup.js:319](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.js:319), [popup.html:52](C:/Users/emera/Documents/Dev/youtube-resume/popup/popup.html:52). **Code-confirmed handling gaps; assistive-technology behavior not tested.**

Removing a focused row, detaching/reinserting it during pinning, or hiding the focused clear/reset button has no explicit focus handoff. Clear/reset cancellation does not restore focus either. Setting-group labels are visual spans without a programmatic association to their segmented controls. Row action labels do not identify the video, and deletion/count changes have no dedicated announcement.

**Address:** Move focus predictably to the next row/control, retain it during sorting, focus confirmation controls, and restore the trigger on cancellation. Associate setting groups with their labels and announce meaningful list changes. Test keyboard-only operation and a screen reader, including an empty list and pin-cap message. Respect reduced-motion preferences for decorative animation where appropriate.

### F19 — P3: Toast cleanup does not cancel its pending animation callback

**Evidence:** [uiInjector.js:168](C:/Users/emera/Documents/Dev/youtube-resume/content/uiInjector.js:168), [uiInjector.js:205](C:/Users/emera/Documents/Dev/youtube-resume/content/uiInjector.js:205). **Code-confirmed race; not browser-reproduced.**

`showToast()` schedules `requestAnimationFrame()` without retaining its handle. If cleanup or a newer toast happens before that callback runs, the old callback can still schedule timers and overwrite the shared `toastTimeout`. Its later `removeToast()` can remove the newer toast. Navigation and delayed/background animation frames make this more relevant than the short normal timing suggests.

**Address:** Cancel pending animation callbacks and capture a toast generation/element identity in every timer. Callbacks should only change or remove their own still-current UI. Apply the navigation cancellation contract from F03.

**Acceptance:** Show→cleanup→show before the next frame; repeat with delayed frames and navigation. The old toast must not remove or schedule work for the new one.

### F20 — P2: Explicit timestamp links have no defined precedence over saved progress

**Evidence:** [youtubeUtils.js:32](C:/Users/emera/Documents/Dev/youtube-resume/utils/youtubeUtils.js:32), [navigationManager.js:27](C:/Users/emera/Documents/Dev/youtube-resume/content/navigationManager.js:27), [resumeManager.js:246](C:/Users/emera/Documents/Dev/youtube-resume/content/resumeManager.js:246). **Code-confirmed policy gap.**

Only the `v` parameter participates in navigation identity; resume never inspects an explicit requested start time. Opening a shared timestamp link with an existing checkpoint can therefore get overwritten by automatic resume, or accidentally win because its native seek trips the magnitude guard. Behavior depends on timing rather than an explicit policy. Changing only the timestamp for the same video does not initialize another lifecycle.

**Address:** Define and document precedence. Recommended: an explicit valid user-requested timestamp wins for that navigation, cancels automatic saved-position restoration, and becomes a normal user-directed playback session. Parse supported timestamp forms carefully, and distinguish them from the extension's own internal navigation if one is introduced later.

**Acceptance:** Saved checkpoint plus timestamp link, timestamp changes on the same ID, invalid timestamps, and playlist navigation all behave consistently without competing seeks.

### F21 — P2: Existing verification does not cover the failure modes behind the reliability claim

**Evidence:** [ROADMAP_v3.md:601](C:/Users/emera/Documents/Dev/youtube-resume/docs/ROADMAP_v3.md:601), [ROADMAP_v3.md:609](C:/Users/emera/Documents/Dev/youtube-resume/docs/ROADMAP_v3.md:609), [ROADMAP_v3.md:885](C:/Users/emera/Documents/Dev/youtube-resume/docs/ROADMAP_v3.md:885), [project-state-summary.md:26](C:/Users/emera/Documents/Dev/youtube-resume/docs/project-state-summary.md:26). **Document-confirmed.**

The prior phase notes record four cold loads against a ten-load test, no live execution of the native-correction branch, and an unperformed twenty-cold-load release check. Some “pass” conclusions were structural review or earlier evidence rather than execution of the stated scenario. That does not invalidate owner confirmation, but it does not demonstrate restored-session or slow-network reliability. No committed runnable regression suite exists in the reviewed tree.

There are also stale working instructions: `CLAUDE.md` still targets v2, describes the TDD as v1, and states a simple 200-entry cap while current code implements 200 unpinned plus up to 20 pinned. Earlier decisions describe mitigations whose remaining holes are F01/F02/F08; those should be recorded as incomplete coverage rather than rediscovered as wholly absent features.

**Address:** Preserve historical results, but distinguish executed-pass, code-reviewed, deferred, and owner-observed checks. Add a small deterministic regression harness for the failure cases below, plus an actual Chrome session-restoration/network matrix. Reconcile current instructions and release claims with observed coverage. Keep test hooks local and production debugging off by default.

**Acceptance:** A future release records the exact tested revision, conditions, attempt counts, results, and remaining limitations. “Pass” must not stand in for an unexecuted critical scenario.

## Proposed remediation order

1. **Protect saved data first:** F06/F07/F11/F12, coordinated with F05. Stabilize mutation ordering and retain recoverable checkpoints before adding more automatic retries or deletion tools.
2. **Establish a cancellable resume lifecycle:** F01–F05 and F08. Keep the existing 400ms initial delay if that remains a product constraint; add readiness, outcome verification, identity, and deferred recovery around it. Merely extending fixed waits is insufficient.
3. **Make checkpoint saving durable and observable:** F09/F10, with explicit local failure outcomes from F05.
4. **Add completed-video cleanup:** F14/F15, using the safe mutation/deletion behavior above. Address F13/F16/F17 alongside it.
5. **Finish interaction policies, accessibility, and regression coverage:** F18–F21. Verification for the earlier steps should be written as those steps are implemented.

This is an implementation proposal, not authorization to execute changes. It does not require an always-running polling loop, remote telemetry, or an infinite battle with YouTube. An MV3 writer, if selected, would change the architecture and manifest configuration and needs deliberate design, even if existing permissions suffice.

## Required live regression matrix

| Scenario | Variations | Required observation |
|---|---|---|
| Ordinary resume | Short, 1-hour, 3-hour, and 6-hour videos; signed in/out; paused/autoplay; supported playback rates | Position reaches saved target minus configured rewind; success is shown only after verification. |
| Slow readiness | Player or metadata after 5/10/30 seconds; delayed seek completion; offline then reconnect | Pending state preserves checkpoint; later readiness recovers without popup interaction. |
| Native competition | Native target earlier/later than extension target; override during 400ms wait, verification, and several seconds afterward | Consistent precedence, verified correction or honest deferred/failure outcome; no misleading success. |
| Chrome restore | Video active on close; inactive video tabs activated later; duplicate-video tabs; normal exit/relaunch | Background resume works with preserved positions and no stale-tab overwrites. |
| Browser lifecycle | Freeze/resume, discard/reload, history restore, player replacement; separate crash/kill runs | Correct reattachment and bounded checkpoint loss; no claims of guaranteed final-frame saving. |
| Ads and navigation | Pre-roll, sequential ads, source change during verification, rapid A→B→C, watch→home→same video | Only current content is resumed/tracked; all cancelled work settles. |
| User intent | Forward/backward/short seeks, rewind below minimum, Restart, timestamp links | Explicit intent wins; saves resume normally after thresholds are met. |
| Storage contention | Multiple videos, duplicate-video tabs, concurrent save/pin/delete/clear/repair/settings, transient write failures | No unrelated data loss, stale resurrection, false write acknowledgment, or pin-cap breach. |
| Completion cleanup | 99.5% vs ended; fractional duration; pinned completed entries; open paused completed tabs | Previewed matches only; unfinished/preserved-pinned entries survive; no immediate stale recreation. |
| Popup and privacy | Rapid clicks, live changes, keyboard/screen reader, thumbnails disabled before scrolling | Correct count/focus/state, no new image requests after opt-out is applied. |

Use synthetic library fixtures in an isolated test profile for destructive scenarios. Capture attempt identity, expected/actual position, media readiness/seeking state, outcome, and acknowledged checkpoint. Run a meaningful number of repetitions of each timing-sensitive case; a few healthy cold loads cannot substitute for the restoration and throttling cases.

## Appendix: isolated reproduction results

All results below were observed while executing the reviewed source against controlled mocks. “Reproduced” here means the assertion confirmed the existing defect, not that a fix passed. These are scenario specifications for a future committed regression suite; the one-off harness itself was not added to the repository.

| Check | Input or ordering | Observed result |
|---|---|---|
| R1 | Saved 3600s; media stays `seeking=true`, readiness 1 | Toast for 3598s at 1150ms despite pending seek. |
| R2 | Complete current verification; native position changes to 120s afterward | Position remains 120s with no correction during another 10 seconds. |
| R3 | Initial seek verifies; native jump to 120s; final assignment throws | Warning and success toast both occur; position stays 120s. |
| R4 | Native position jumps 0→120s halfway through the 400ms delay | Extension returns without seeking to the saved 3600s checkpoint. |
| R5 | Saved 3600s; current media is a 30s ad | Eligibility returns immediately before any ad wait. |
| R6 | Metadata remains absent for both five-second waits, then appears | Later metadata does not seek; position remains zero. |
| R7 | Tracker starts at zero, then arms after failed-resume-equivalent lifecycle; position reaches 60s | First interval save writes 60s; tracker has no knowledge of the prior 3600s target. |
| R8 | Armed tracker at 3600s; programmatic move to 120s plus `seeked` | Saves 120s through the event bypass. |
| R9 | Armed tracker at 1000s; user-seek-equivalent move to zero plus `seeked`; playback reaches 60s | Next interval save rejected; no save occurred. |
| R10 | Tracker at 100s; position reaches 104s; `stop()` before next tick | No final save. |
| R11 | Initial same-ID load, then navigation-finish, visibility, pageshow, unchanged-URL tick | Initialization callback count stays one. |
| R12 | Pending player discovery, then `disconnect()` | Promise still unsettled after 20 seconds; timeout removed. |
| R13 | Two concurrent saves for separate valid IDs, both reading the initial store | Only the second entry survives. |
| R14 | Delete A and save B concurrently from an A-containing snapshot | A is restored by B's later whole-store write. |
| R15 | Merge pinned canonical entry with whitespace duplicate | Merged entry loses `pinned`. |
| R16 | Repair key `aaaaaaaaaaab` | Rewritten to different key `aaaaaaaaaaa`. |
| R17 | Library contains one null row; save a healthy new row | Save rejects while reading null `.pinned`. |
| R18 | Settings contain string minimum and string boolean | Invalid values returned unchanged instead of defaults. |
| R19 | Save rewind=10 and showToast=false concurrently | Rewind reverts to default 2; toast change survives. |
| R20 | 200 unpinned entries plus one pinned; unpin that entry | 201 unpinned entries remain. |
| R21 | A settings read deferred; B initialization completes; A read resolves | A replaces B as the active tracker. |
| R22 | A resume pending; B starts and remains pending; A finishes | Global tracker for B becomes armed before B's resume finishes. |
| R23 | Shared checkpoint 3600s; stale paused tab at 120s emits hidden event | Shared checkpoint overwritten with 120s. |
| R24 | Pause write at 1100s rejects; twenty later ticks at same position | Only one write attempt; no periodic retry. |

### Areas checked without a separate finding

The manifest uses the stated storage permission and YouTube host scope. Runtime storage access remains centralized in `storageManager.js`; content code contains no outbound request path. Popup thumbnails are the identified automatic image-request path. Titles/channel names are inserted as text rather than HTML; no runtime `eval`, dynamic script loading, or `innerHTML` use was found. There is one interval creation site and one mutation-observer creation site; concurrency and cancellation still need F03. Production debugging is off. These are source-review results, not a guarantee against future YouTube DOM changes or every browser-specific issue.
