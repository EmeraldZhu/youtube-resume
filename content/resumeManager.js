/**
 * ResumeManager Module
 *
 * Purpose: Validate saved progress against resume conditions
 * and execute the seek. Coordinates with uiInjector.
 *
 * Public API:
 *   resumeManager.tryResume(video, saved, videoId, settings) → Promise<void>
 */

const resumeManager = (() => {
  const RESUME_DELAY_MS = 400;
  const AD_WAIT_CEILING_MS = 60000; // D-020
  const AD_POLL_MS = 250;
  const AD_ROUND_MAX_ATTEMPTS = 3; // Tier 2 pick — bounds the ad-reappears-mid-delay loop
  const DRIFT_TOLERANCE_S = 10; // D-021
  const SEEK_VERIFY_DELAY_MS = 250; // D-022
  const SEEK_TOLERANCE_S = 3; // D-022
  const SEEK_MAX_ATTEMPTS = 3; // D-022
  const NATIVE_OVERRIDE_CHECK_DELAY_MS = 500; // Tier 2 pick — Roadmap 3.4

  /**
   * Returns a Promise that resolves when video.duration is a
   * valid finite number. Listens for 'loadedmetadata' event
   * with a 5-second timeout fallback.
   */
  function waitForMetadata(video) {
    return new Promise((resolve, reject) => {
      if (video.duration && !isNaN(video.duration) && video.duration !== Infinity) {
        resolve();
        return;
      }

      const onLoaded = () => {
        clearTimeout(timeout);
        resolve();
      };

      const timeout = setTimeout(() => {
        video.removeEventListener('loadedmetadata', onLoaded);
        reject(new Error('Timeout: video metadata not loaded after 5s'));
      }, 5000);

      video.addEventListener('loadedmetadata', onLoaded, { once: true });
    });
  }

  /**
   * Returns a Promise that resolves after the specified milliseconds.
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const REUSED_ELEMENT_REFRESH_MS = 1000; // Tier 2 pick — F04/T4.4, see below

  /**
   * Waits briefly for a 'loadedmetadata' event, but never rejects — used
   * only to give a reused <video> element (F04: "SPA reuse can expose
   * previous-content metadata") one short chance to signal a real refresh
   * before establishContentMetadata trusts a duration value it already
   * carried over from the previous navigation. Timing out here is not a
   * failure: it means no new metadata event fired, so the current value is
   * used as-is (unlike waitForMetadata, whose timeout means "no valid
   * duration ever arrived").
   */
  function raceLoadedMetadataOrTimeout(video, ms) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', done);
        resolve();
      };
      const timeout = setTimeout(done, ms);
      video.addEventListener('loadedmetadata', done, { once: true });
    });
  }

  /**
   * Polls isAdPlaying() until it clears or AD_WAIT_CEILING_MS elapses.
   * Resolves true if the ad cleared, false if the ceiling was hit
   * (D-020 — abandon cleanly, never wait unbounded).
   *
   * Also checks isCurrent() on every poll tick (Phase 4 task 4.2) — leaving
   * a watch page during an ad must settle this within one AD_POLL_MS tick,
   * not leave it running for up to the full 60s ceiling. A recursive
   * setTimeout chain, not a second setInterval (CLAUDE.md's one-interval
   * constraint), so this stays compliant.
   */
  function waitForAdClear(isCurrent = () => true) {
    const start = Date.now();
    return new Promise((resolve) => {
      function poll() {
        if (!isCurrent()) {
          resolve(false);
          return;
        }
        if (!playerObserver.isAdPlaying()) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= AD_WAIT_CEILING_MS) {
          resolve(false);
          return;
        }
        setTimeout(poll, AD_POLL_MS);
      }
      poll();
    });
  }

  /**
   * F04/R5 — resolves current, real content metadata for eligibility
   * evaluation: defers through any ad first, then waits for duration to
   * become available, exactly like the old top-of-function logic did — but
   * run *before* shouldResume() instead of after, so a 30s pre-roll's
   * duration can never disqualify a saved position from real content.
   *
   * If an ad reappears while we were waiting for metadata (a mid-flight
   * source swap), loops back and defers again rather than handing back
   * ad metadata, bounded by AD_ROUND_MAX_ATTEMPTS rounds.
   *
   * @param {boolean} [forceRefresh] - F04/T4.4: true when bootstrap.js
   *   detected this navigation reused the same <video> element AND its
   *   duration hasn't changed since the previous navigation started — a
   *   signal the element may still be carrying the previous content's
   *   metadata even though it looks "valid" (non-NaN). Gives it one short
   *   bounded chance (REUSED_ELEMENT_REFRESH_MS) to fire a real
   *   'loadedmetadata' before trusting the carried-over value.
   * @returns {Promise<{ok: boolean, reason?: string, error?: Error}>}
   */
  async function establishContentMetadata(video, isCurrent, forceRefresh = false) {
    for (let round = 0; round < AD_ROUND_MAX_ATTEMPTS; round++) {
      if (!isCurrent()) return { ok: false, reason: 'cancelled' };

      if (playerObserver.isAdPlaying()) {
        const cleared = await waitForAdClear(isCurrent);
        if (!isCurrent()) return { ok: false, reason: 'cancelled' };
        if (!cleared) return { ok: false, reason: 'ad-timeout' };
      }

      if (!video.duration || isNaN(video.duration)) {
        // D-038: the 5s timeout is reachable under ordinary conditions, so
        // retry once before giving up.
        try {
          await waitForMetadata(video);
        } catch (err) {
          debugLogger.log('tryResume:metadataWaitFailed:retry', { error: err.message });
          try {
            await waitForMetadata(video);
          } catch (err2) {
            return { ok: false, reason: 'metadata-timeout', error: err2 };
          }
        }
        if (!isCurrent()) return { ok: false, reason: 'cancelled' };
      } else if (forceRefresh && round === 0) {
        await raceLoadedMetadataOrTimeout(video, REUSED_ELEMENT_REFRESH_MS);
        if (!isCurrent()) return { ok: false, reason: 'cancelled' };
      }

      // An ad may have started again while we waited for metadata — defer
      // and retry rather than evaluating eligibility against ad content.
      if (playerObserver.isAdPlaying()) continue;

      return { ok: true, duration: video.duration };
    }
    return { ok: false, reason: 'ad-flapping' };
  }

  /**
   * Assigns video.currentTime = resumeTime, then re-reads after
   * SEEK_VERIFY_DELAY_MS. Re-assigns if off by more than SEEK_TOLERANCE_S,
   * up to SEEK_MAX_ATTEMPTS (D-022). Never an unbounded retry loop.
   */
  async function seekWithVerification(video, resumeTime) {
    for (let attempt = 1; attempt <= SEEK_MAX_ATTEMPTS; attempt++) {
      try {
        video.currentTime = resumeTime;
      } catch (err) {
        console.warn('[YTResume] Seek failed:', err.message);
        debugLogger.log('tryResume:seekFailed', { attempt, error: err.message });
        return false;
      }

      await delay(SEEK_VERIFY_DELAY_MS);
      const drift = Math.abs(video.currentTime - resumeTime);
      debugLogger.log('tryResume:seekVerify', { attempt, currentTime: video.currentTime, drift });
      if (drift <= SEEK_TOLERANCE_S) {
        return true;
      }
    }
    return false;
  }

  /**
   * After a verified seek, waits briefly and checks whether YouTube's own
   * native "continue watching" restore moved currentTime again. If so,
   * re-asserts the resume position exactly once. A second override is
   * accepted silently — no further check, no unbounded loop (Roadmap 3.4).
   */
  async function reassertIfNativeOverride(video, resumeTime) {
    await delay(NATIVE_OVERRIDE_CHECK_DELAY_MS);
    const drift = Math.abs(video.currentTime - resumeTime);
    debugLogger.log('tryResume:nativeOverrideCheck', { currentTime: video.currentTime, resumeTime, drift });
    if (drift <= SEEK_TOLERANCE_S) return; // no override observed

    try {
      video.currentTime = resumeTime;
      debugLogger.log('tryResume:nativeOverrideReasserted', { resumeTime });
    } catch (err) {
      console.warn('[YTResume] Re-assert seek failed:', err.message);
      debugLogger.log('tryResume:nativeOverrideReassertFailed', { error: err.message });
    }
  }

  /**
   * Validates saved progress against resume conditions and
   * executes the seek if conditions are met.
   *
   * @param {HTMLVideoElement} video
   * @param {VideoProgress} saved - { time, duration, updated }
   * @param {string} videoId
   * @param {Settings} settings - read once per navigation by bootstrap.js
   *   (Roadmap 7.3); defaults here only guard direct/test callers that omit it.
   * @param {() => boolean} [isCurrent] - Phase 4 (F03) generation check,
   *   supplied by bootstrap.js. Checked after every await; a superseded
   *   navigation's resume silently stops instead of seeking, saving,
   *   arming, or drawing UI for whichever navigation is current now.
   *   Defaults to always-current for direct/test callers that omit it.
   * @param {boolean} [forceMetadataRefresh] - F04/T4.4: see
   *   establishContentMetadata's forceRefresh param.
   */
  async function tryResume(video, saved, videoId, settings = {}, isCurrent = () => true, forceMetadataRefresh = false) {
    const minWatchSeconds = settings.minWatchSeconds ?? 30;
    const completionThreshold = settings.completionThreshold ?? 0.95;
    const rewindSeconds = settings.rewindSeconds ?? 2;
    const showToast = settings.showToast ?? true;
    const showRestartButton = settings.showRestartButton ?? true;

    debugLogger.log('tryResume:entry', {
      videoId,
      savedTime: saved.time,
      videoDurationAtEntry: video.duration,
    });

    // Duration-independent short-circuit: below the minimum watched threshold,
    // no duration value could make shouldResume() true, so don't pay for the
    // metadata wait (D-038) just to fail the bounds check anyway.
    if (!timeUtils.meetsMinimumWatched(saved.time, minWatchSeconds)) {
      debugLogger.log('tryResume:belowMinimum', { savedTime: saved.time });
      return;
    }

    // F04/R5 — resolve current content identity (defer through ads, obtain
    // real content metadata) BEFORE evaluating eligibility. A short ad's
    // duration must never disqualify a long saved content position.
    const metadataResult = await establishContentMetadata(video, isCurrent, forceMetadataRefresh);
    if (!isCurrent()) return;
    debugLogger.log('tryResume:metadataResolved', {
      ok: metadataResult.ok,
      reason: metadataResult.reason,
      videoDuration: video.duration,
    });
    if (!metadataResult.ok) {
      if (metadataResult.reason === 'ad-timeout') {
        console.warn('[YTResume] Resume abandoned: ad did not clear within 60s');
      } else if (metadataResult.reason === 'metadata-timeout') {
        console.warn('[YTResume] Metadata wait failed:', metadataResult.error.message);
      }
      return;
    }

    // Validate resume conditions against real, post-ad content metadata
    const shouldResumeResult = timeUtils.shouldResume(saved.time, video.duration, minWatchSeconds, completionThreshold);
    debugLogger.log('tryResume:shouldResume', {
      result: shouldResumeResult,
      savedTime: saved.time,
      duration: video.duration,
    });
    if (!shouldResumeResult) {
      return; // Conditions not met — exit silently
    }

    const eligibleDuration = video.duration;

    debugLogger.log('tryResume:isAdPlaying:beforeWait', {
      isAdPlaying: playerObserver.isAdPlaying(),
      currentTime: video.currentTime,
    });

    // D-019/PRD §5.7: defer until no ad is present, including an ad that
    // starts mid-delay — loop back to the ad wait rather than evaluate the
    // guard against a stale pre-ad baseline. AD_ROUND_MAX_ATTEMPTS bounds it
    // so a pathologically ad-heavy load can't loop forever (Tier 2 pick).
    let preDelayTime;
    let round = 0;
    for (;;) {
      if (!isCurrent()) return;

      if (playerObserver.isAdPlaying()) {
        const adCleared = await waitForAdClear(isCurrent);
        if (!isCurrent()) return;
        debugLogger.log('tryResume:adWait', { cleared: adCleared });
        if (!adCleared) {
          console.warn('[YTResume] Resume abandoned: ad did not clear within 60s');
          return;
        }

        // F04 — a mid-roll can swap the media source. Revalidate that the
        // content metadata we evaluated eligibility against still holds
        // before proceeding; don't seek against a stale decision.
        const revalidated = await establishContentMetadata(video, isCurrent);
        if (!isCurrent()) return;
        if (!revalidated.ok || Math.abs(video.duration - eligibleDuration) > 1) {
          debugLogger.log('tryResume:revalidationFailed', {
            ok: revalidated.ok,
            durationNow: video.duration,
            eligibleDuration,
          });
          return;
        }
      }

      // D-021: baseline currentTime immediately before the delay, not after —
      // the guard below measures drift from here, not an absolute threshold.
      preDelayTime = video.currentTime;

      // Buffer for YouTube player initialization race
      await delay(RESUME_DELAY_MS);
      if (!isCurrent()) return;

      debugLogger.log('tryResume:isAdPlaying:afterDelay', {
        isAdPlaying: playerObserver.isAdPlaying(),
        currentTime: video.currentTime,
      });

      if (!playerObserver.isAdPlaying()) break;

      round += 1;
      debugLogger.log('tryResume:adDuringDelay', { round });
      if (round >= AD_ROUND_MAX_ATTEMPTS) {
        console.warn('[YTResume] Resume abandoned: ad kept reappearing during resume delay');
        return;
      }
      // loop: re-defer to the ad wait, then re-baseline preDelayTime
    }

    // Guard: abort only on genuine user seek — natural playback drift during
    // the delay (D-037: including YouTube's own native resume landing near
    // the saved position) must not trip this.
    const driftLimit = preDelayTime + RESUME_DELAY_MS / 1000 + DRIFT_TOLERANCE_S;
    const guardAborted = video.currentTime > driftLimit;
    debugLogger.log('tryResume:guardCheck', {
      currentTime: video.currentTime,
      preDelayTime,
      driftLimit,
      aborted: guardAborted,
    });
    if (guardAborted) return;

    const resumeTime = timeUtils.getResumeTime(saved.time, rewindSeconds);
    debugLogger.log('tryResume:resumeTime', { resumeTime });

    const seekOk = await seekWithVerification(video, resumeTime);
    if (!isCurrent()) return;

    if (debugLogger.DEBUG) {
      setTimeout(() => {
        debugLogger.log('tryResume:after1000ms', { currentTime: video.currentTime });
      }, 1000);
    }

    // PRD §5.6: the Restart button (and, by the same logic, the toast) must
    // appear only when the seek was successfully applied AND verified — not
    // on a best-effort basis. Showing them after a failed verification is
    // actively misleading: the toast claims a position the video never
    // actually landed on (observed live: toast said 19:58, playback
    // continued from 19:40 — YouTube's own resume cue kept overriding ours
    // during the verify window).
    if (!seekOk) {
      console.warn('[YTResume] Seek could not be verified after 3 attempts');
      debugLogger.log('tryResume:seekUnverified', { currentTime: video.currentTime });
      return;
    }

    // Roadmap 3.4 — YouTube's own native resume can override our verified
    // seek shortly after; re-assert once against it before showing UI.
    await reassertIfNativeOverride(video, resumeTime);
    if (!isCurrent()) return;

    // T7.7/T7.8/T7.9: the seek itself is unconditional — only the UI is
    // settings-gated. Off means zero injected DOM, not "resume disabled".
    if (showRestartButton) uiInjector.showRestartButton(video, videoId);
    if (showToast) uiInjector.showToast(resumeTime);
  }

  return { tryResume };
})();


