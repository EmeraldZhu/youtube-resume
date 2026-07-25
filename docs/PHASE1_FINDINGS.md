# Phase 1 Findings — Reliability Audit

Closes the evidence-gathering half of D-017. Instrumentation only, `DEBUG = false` in the
committed code (`utils/debugLogger.js`). Testing below was run live on youtube.com with
`DEBUG = true` temporarily, then reverted before commit.

Test video for most scenarios: `P7sOz55Ey1E` ("2+ Hours Of Engineering Facts To Fall Asleep
To", 2:39:03, signed-in session) unless noted. T1.6 used `jNQXAC9IVRw` ("Me at the zoo", 19s).

## Hypothesis verdicts

| # | Hypothesis | Verdict | Evidence | File:line |
|---|---|---|---|---|
| H1 | `currentTime > 5` guard fires on ad position | **Confirmed, different trigger** | Never observed a live pre-roll ad long enough to test the ad case directly (see Untested, below). But the *same* guard mechanism was tripped on nearly every cold load by a cause outside H1's original description — see Finding B. | `content/resumeManager.js:75` |
| H2 | `tryResume()` never checks `isAdPlaying()` before seeking | **Confirmed** | Source reads `isAdPlaying()` only for logging (added this phase); the actual abort guard (`video.currentTime > 5`) never references it. No PRD §5.7 ad-gating exists in the guard logic. | `content/resumeManager.js:75` (guard), contrast with `content/playerObserver.js:68` (`isAdPlaying`, never called by the guard) |
| H3 | `waitForVideo()` rejects immediately if `#movie_player` absent | **Confirmed by code, not reproduced live** | Every live run resolved via the `path: "immediate"` branch — `#movie_player` already existed at call time (`document_idle` injection was late enough in all my runs). The reject-on-absent branch is real in source but I could not force a cold load slow enough to hit it. | `content/playerObserver.js:24-28` |
| H4 | Seek is fire-and-forget, never verified | **Confirmed, and rarely reached in practice** | The one time the guard didn't abort (short-video test, saved 50s), `currentTime` was re-read at +1000ms and matched the assignment (48 → 48.2) — no built-in verification exists, it just happened to hold. In the long-video tests, the guard aborted *before* the assignment ever ran (see H1/Finding B), so the fire-and-forget seek path barely executes for a repeat signed-in viewer. | `content/resumeManager.js:79-90` |
| H5 | Delta guard / pause-seeked bypass contradiction | **Not reproduced** | `pause` and `seeked` triggers consistently logged `bypassDelta:true, deltaBlocked:false` and saved unconditionally, exactly as `attemptSave(bypassDelta)` implements. Runtime behavior is internally consistent — the contradiction flagged in Roadmap §4 is a **TDD documentation** issue, not a code bug. | `content/progressTracker.js:31-44` |
| H6 | No `ended` handler; stale mid-video position stored on completion | **Confirmed, low impact** | Watching the 19s test video to completion produced a `pause` event at `currentTime` equal to the final position (19/19), saved unconditionally — no `ended` listener exists. However `timeUtils.shouldResume()`'s 95%-of-duration cutoff would reject resuming from a near-final saved position anyway, so this doesn't yet manifest as a bad resume — it's stale data, not a broken resume. | `content/progressTracker.js` (no `ended` listener); `utils/timeUtils.js:25-29` |
| H7 | `beforeunload` claims a synchronous save that can't complete | **Inconclusive — tooling limit** | Closed the tab via automation mid-playback and reopened; I could not read the closing tab's console one more time after `tabs_close_mcp` to see whether the `beforeunload` handler fired or whether `storageManager.saveProgress()` resolved before teardown. The last *confirmed* save was the prior manual pause, several seconds before close. Can't confirm or deny H7 from this session's evidence; code inspection alone supports the hypothesis (fire-and-forget `chrome.storage.local.set` inside a synchronous-looking handler). | `content/progressTracker.js:67,72` |
| H8 | Replaying the same video doesn't re-emit | **Confirmed** | SPA-navigated home then back (browser history back) to the identical video: `checkAndEmit` logged `{"newId":"P7sOz55Ey1E","currentVideoId":"P7sOz55Ey1E","emitted":false}`. No new `videoChange` fires, so `bootstrap.onVideoChange` (and therefore `resumeManager.tryResume`) never re-runs for a return trip to the same video. | `content/navigationManager.js:23-24` |

## Failure modes outside H1–H8 (in scope for D-018 / Phase 2)

**Finding A — leaving a watch page never tears down tracking.**
`checkAndEmit()` only emits when `youtubeUtils.getVideoId()` returns a truthy id
(`content/navigationManager.js:23`). Navigating from a video to a non-watch page (home, search)
yields `newId = null`, so the condition is never true — `bootstrap.onVideoChange` (which owns all
teardown: `progressTracker.stop()`, `uiInjector.cleanup()`, `playerObserver.disconnect()`) never
runs. Live evidence: after clicking the YouTube logo away from a playing video, `attemptSave`
still fired on the old 5s interval against the stale video reference, reporting `current: 0`
against a `lastSavedTime` in the thousands — the interval and event listeners from the old video
were still alive on the homepage. Combined with H8, a user who leaves a video and returns to it
gets neither a re-teardown nor a re-init; tracking silently free-rides on whatever state is left
over from the original `progressTracker.start()` call.

**Finding B — YouTube's own native resume masks (and defeats) this extension's resume.**
On a signed-in account, reloading a previously-watched video restores `video.currentTime` to
very near the last-remembered position *before* this extension's 400ms delay elapses — independent
of this extension's own storage. Live trace on repeated cold loads:
`tryResume:isAdPlaying:afterDelay {"isAdPlaying":false,"currentTime":1962.48}` immediately followed
by `tryResume:guardCheck {"currentTime":1962.48,"aborted":true}`, with no ad present. The
`currentTime > 5` guard (H1's mechanism) fires here for the same structural reason it would fire
during an ad: something *other than user input* moved `currentTime` before the delay finished.
Practically, this means: for a signed-in repeat viewer, YouTube's own feature — not this
extension — usually lands the video in the right spot, and this extension's guard silently exits
before ever reaching the seek, the toast, or the restart button. This is very likely a real
contributor to "resume fires unreliably" reports: the video position looks fine, but the
extension's own visible affordances (toast/restart button) never appear because the code path
that shows them is skipped.

**Finding C — `waitForMetadata`'s 5-second timeout is reachable on ordinary (non-throttled)
connections.** One cold load in roughly ten produced
`Metadata wait failed: Timeout: video metadata not loaded after 5s`, silently skipping the entire
resume attempt (`resumeManager.js:59-64`) with only a console warning. This wasn't induced by
DevTools throttling — it happened under normal conditions. It's adjacent to H3 (both are
player-readiness races) but distinct: H3 is about `#movie_player` not existing yet; this is about
`video.duration` not resolving in time even once the video element exists.

## Untested (S4 — could not force the condition in this session)

- **T1.2** (pre-roll ad longer than 5s): no video in this session served a long enough forced ad
  to observe the guard's original ad-based failure mode directly. Finding B above demonstrates the
  same guard code path failing for a different real trigger, which is the closest live evidence
  available without a way to guarantee an ad.
- **T1.3** (DevTools "Slow 4G" throttling on cold load): the browser automation tool refuses to
  interact with `chrome://` pages and has no primitive for DevTools network-condition overrides,
  so I could not reliably reproduce a throttled cold load. Finding C is the closest live evidence
  of a player-readiness race under ordinary conditions.

## Recommendation for Phase 2 scoping (D-018)

Phase 2 should fix H2/H4/H6/H8 as designed, and treat Findings A and B as first-class scope
additions:
- Finding A (teardown on leaving a watch page) is arguably more impactful than several of the
  original H1–H8 items, since it can leave stale intervals/listeners running indefinitely during
  ordinary browsing.
- Finding B doesn't require a code fix by itself (YouTube's own resume is out of this extension's
  control) but changes how "success" should be measured in Phase 2/3 — the guard's *purpose*
  (don't clobber a user's manual seek) needs a design that doesn't also block on YouTube's own
  native resume landing near the same spot.
