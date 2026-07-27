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

  /**
   * Polls isAdPlaying() until it clears or AD_WAIT_CEILING_MS elapses.
   * Resolves true if the ad cleared, false if the ceiling was hit
   * (D-020 — abandon cleanly, never wait unbounded).
   */
  function waitForAdClear() {
    const start = Date.now();
    return new Promise((resolve) => {
      function poll() {
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
   * Validates saved progress against resume conditions and
   * executes the seek if conditions are met.
   *
   * @param {HTMLVideoElement} video
   * @param {VideoProgress} saved - { time, duration, updated }
   * @param {string} videoId
   * @param {Settings} settings - read once per navigation by bootstrap.js
   *   (Roadmap 7.3); defaults here only guard direct/test callers that omit it.
   */
  async function tryResume(video, saved, videoId, settings = {}) {
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

    // Wait for duration to be available. D-038: the 5s timeout is reachable
    // under ordinary (non-throttled) conditions, so retry once before giving up.
    let metadataWaitOccurred = false;
    if (!video.duration || isNaN(video.duration)) {
      metadataWaitOccurred = true;
      try {
        await waitForMetadata(video);
      } catch (err) {
        debugLogger.log('tryResume:metadataWaitFailed:retry', { error: err.message });
        try {
          await waitForMetadata(video);
        } catch (err2) {
          console.warn('[YTResume] Metadata wait failed:', err2.message);
          debugLogger.log('tryResume:metadataWaitFailed', { error: err2.message });
          return;
        }
      }
    }
    debugLogger.log('tryResume:metadataWait', {
      occurred: metadataWaitOccurred,
      videoDuration: video.duration,
    });

    // Validate resume conditions
    const shouldResumeResult = timeUtils.shouldResume(saved.time, video.duration, minWatchSeconds, completionThreshold);
    debugLogger.log('tryResume:shouldResume', {
      result: shouldResumeResult,
      savedTime: saved.time,
      duration: video.duration,
    });
    if (!shouldResumeResult) {
      return; // Conditions not met — exit silently
    }

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
      if (playerObserver.isAdPlaying()) {
        const adCleared = await waitForAdClear();
        debugLogger.log('tryResume:adWait', { cleared: adCleared });
        if (!adCleared) {
          console.warn('[YTResume] Resume abandoned: ad did not clear within 60s');
          return;
        }
      }

      // D-021: baseline currentTime immediately before the delay, not after —
      // the guard below measures drift from here, not an absolute threshold.
      preDelayTime = video.currentTime;

      // Buffer for YouTube player initialization race
      await delay(RESUME_DELAY_MS);

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

    // T7.7/T7.8/T7.9: the seek itself is unconditional — only the UI is
    // settings-gated. Off means zero injected DOM, not "resume disabled".
    if (showRestartButton) uiInjector.showRestartButton(video, videoId);
    if (showToast) uiInjector.showToast(resumeTime);
  }

  return { tryResume };
})();


