/**
 * ResumeManager Module
 *
 * Purpose: Validate saved progress against resume conditions
 * and execute the seek. Coordinates with uiInjector.
 *
 * Public API:
 *   resumeManager.tryResume(video, saved, videoId, settings) → Promise<Outcome>
 *   resumeManager.OUTCOME → { VERIFIED, PENDING, DEFERRED, CANCELLED,
 *                             USER_OVERRIDDEN, INELIGIBLE, FAILED }
 *
 * Outcome shape (Roadmap v4 Phase 5, task 5.6): every seek attempt produces
 * exactly one of these instead of a bare boolean/void —
 *   { status, reason, target, observed, attemptId }
 * status is one of OUTCOME's values; reason is a short machine-readable
 * string explaining it; target is the position resume was attempting to
 * reach (saved.time), observed is the video's position when the outcome was
 * decided, attemptId identifies this specific tryResume() call for
 * diagnostics (debugLogger only — never surfaced to the user).
 */

const resumeManager = (() => {
  const RESUME_DELAY_MS = 400;
  const AD_WAIT_CEILING_MS = 60000; // D-020
  const AD_POLL_MS = 250;
  const AD_ROUND_MAX_ATTEMPTS = 3; // Tier 2 pick — bounds the ad-reappears-mid-delay loop
  const DRIFT_TOLERANCE_S = 10; // D-021 — also the settled-position tolerance (Phase 5)
  const SEEK_VERIFY_DELAY_MS = 250; // D-022
  const SEEK_TOLERANCE_S = 3; // D-022
  const SEEK_MAX_ATTEMPTS = 3; // D-022
  const NATIVE_OVERRIDE_CHECK_DELAY_MS = 500; // Tier 2 pick — Roadmap 3.4
  // Phase 5 (D-155) — bounded post-verification monitoring window (R2): a
  // few more checks beyond the existing 500ms one, not an unbounded fight
  // with YouTube's own restore cue.
  const MONITOR_ROUNDS = 4;
  const MONITOR_INTERVAL_MS = 500;
  // Phase 5 (D-156) — how recent a keydown/pointerdown/mousedown must be to
  // treat a position change as genuine user intent rather than native
  // interference (F08/task 5.4).
  const USER_INPUT_WINDOW_MS = 800;
  // HTMLMediaElement.HAVE_CURRENT_DATA — the minimum readiness a settled
  // seek must show; below this the frame the position claims to be on
  // hasn't actually loaded yet (R1).
  const HAVE_CURRENT_DATA = 2;

  const OUTCOME = {
    VERIFIED: 'verified',
    PENDING: 'pending',
    DEFERRED: 'deferred',
    CANCELLED: 'cancelled',
    USER_OVERRIDDEN: 'user-overridden',
    INELIGIBLE: 'ineligible',
    FAILED: 'failed',
  };

  let attemptCounter = 0;
  function nextAttemptId() {
    attemptCounter += 1;
    return `attempt-${Date.now()}-${attemptCounter}`;
  }

  function outcome(status, reason, target, observed, attemptId) {
    return { status, reason, target, observed, attemptId };
  }

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
   * Whether video's current position/readiness counts as "settled" on
   * resumeTime — genuinely landed, not merely sampled once mid-seek (R1).
   * A pending seek (`seeking === true`) or a frame that hasn't actually
   * loaded (`readyState < HAVE_CURRENT_DATA`) is never settled regardless
   * of how close currentTime numerically reads.
   */
  function isPositionSettled(video, target) {
    if (video.seeking) return false;
    if (typeof video.readyState === 'number' && video.readyState < HAVE_CURRENT_DATA) return false;
    return Math.abs(video.currentTime - target) <= SEEK_TOLERANCE_S;
  }

  /**
   * Assigns video.currentTime = resumeTime, then re-checks readiness and
   * position stability after SEEK_VERIFY_DELAY_MS (R1 — checking `seeking`/
   * `readyState`, not just numeric proximity, since a pending seek can read
   * as numerically close while never having actually landed). Re-assigns if
   * not settled, up to SEEK_MAX_ATTEMPTS (D-022). Never an unbounded retry
   * loop.
   *
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  async function seekWithVerification(video, resumeTime, isCurrent) {
    for (let attempt = 1; attempt <= SEEK_MAX_ATTEMPTS; attempt++) {
      try {
        video.currentTime = resumeTime;
      } catch (err) {
        console.warn('[YTResume] Seek failed:', err.message);
        debugLogger.log('tryResume:seekFailed', { attempt, error: err.message });
        return { ok: false, reason: 'seek-threw' };
      }

      await delay(SEEK_VERIFY_DELAY_MS);
      if (!isCurrent()) return { ok: false, reason: 'cancelled' };

      const settled = isPositionSettled(video, resumeTime);
      debugLogger.log('tryResume:seekVerify', {
        attempt,
        currentTime: video.currentTime,
        seeking: video.seeking,
        readyState: video.readyState,
        settled,
      });
      if (settled) return { ok: true };
    }
    return { ok: false, reason: 'seek-not-settled' };
  }

  /**
   * The existing 500ms post-seek check (Roadmap 3.4), now producing a typed
   * result instead of swallowing a thrown corrective re-seek (R3): a drift
   * that turns out to correlate with recent user input is accepted as a
   * deliberate override, not corrected over (task 5.4); otherwise it's
   * treated as native interference and re-asserted once. A throw here is a
   * real failure, never masked by success UI.
   *
   * @returns {Promise<{ok: boolean, reason?: string, userOverride?: boolean}>}
   */
  async function verifyAndReassert(video, resumeTime, isCurrent) {
    await delay(NATIVE_OVERRIDE_CHECK_DELAY_MS);
    if (!isCurrent()) return { ok: false, reason: 'cancelled' };

    if (isPositionSettled(video, resumeTime)) return { ok: true };

    if (userIntent.wasRecentInput(USER_INPUT_WINDOW_MS)) {
      debugLogger.log('tryResume:userOverrideAtReassert', { currentTime: video.currentTime });
      return { ok: true, userOverride: true };
    }

    try {
      video.currentTime = resumeTime;
      debugLogger.log('tryResume:nativeOverrideReasserted', { resumeTime });
      return { ok: true };
    } catch (err) {
      console.warn('[YTResume] Re-assert seek failed:', err.message);
      debugLogger.log('tryResume:nativeOverrideReassertFailed', { error: err.message });
      return { ok: false, reason: 'reassert-threw' };
    }
  }

  /**
   * Phase 5 (R2/task 5.1) — bounded background monitoring beyond the single
   * 500ms reassert check: YouTube's own restore cue can override a verified
   * seek several seconds later, with nothing watching for it. Fire-and-
   * forget (not part of tryResume's awaited chain — bootstrap.js must not
   * wait on this to arm tracking), bounded to MONITOR_ROUNDS checks so this
   * never fights YouTube indefinitely, and stands down the moment genuine
   * user input is observed (task 5.4).
   */
  function monitorForLateOverride(video, resumeTime, isCurrent) {
    let round = 0;
    function tick() {
      round += 1;
      if (!isCurrent() || round > MONITOR_ROUNDS) return;
      if (userIntent.wasRecentInput(USER_INPUT_WINDOW_MS)) {
        debugLogger.log('tryResume:monitorStoodDown', { round, reason: 'userInput' });
        return;
      }
      if (!isPositionSettled(video, resumeTime) && !video.seeking) {
        try {
          video.currentTime = resumeTime;
          debugLogger.log('tryResume:lateOverrideCorrected', { round, resumeTime });
        } catch (err) {
          debugLogger.log('tryResume:lateOverrideCorrectFailed', { round, error: err.message });
          return; // give up silently — bounded, no fighting indefinitely
        }
      }
      setTimeout(tick, MONITOR_INTERVAL_MS);
    }
    setTimeout(tick, MONITOR_INTERVAL_MS);
  }

  /**
   * Phase 5 (task 5.3/5.4, F08) — checks whether video's position drifted
   * away from the expected pre-delay trajectory (accounting for elapsed
   * time and playback rate; paused media isn't expected to move at all).
   * A drift that correlates with recent keyboard/pointer/accessible-control
   * input is genuine user intent — direction and magnitude alone no longer
   * decide this, closing the gap where small forward jumps and all
   * backward jumps previously went unchecked (F08).
   *
   * @returns {{jumped: boolean, userSeek: boolean}}
   */
  function checkStabilization(video, preDelayTime, elapsedMs) {
    const expected = video.paused
      ? preDelayTime
      : preDelayTime + (elapsedMs / 1000) * (video.playbackRate || 1);
    const jumped = Math.abs(video.currentTime - expected) > DRIFT_TOLERANCE_S;
    const userSeek = jumped && userIntent.wasRecentInput(USER_INPUT_WINDOW_MS);
    return { jumped, userSeek };
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
   * @returns {Promise<{status, reason, target, observed, attemptId}>}
   */
  async function tryResume(video, saved, videoId, settings = {}, isCurrent = () => true, forceMetadataRefresh = false) {
    const attemptId = nextAttemptId();
    const minWatchSeconds = settings.minWatchSeconds ?? 30;
    const completionThreshold = settings.completionThreshold ?? 0.95;
    const rewindSeconds = settings.rewindSeconds ?? 2;
    const showToast = settings.showToast ?? true;
    const showRestartButton = settings.showRestartButton ?? true;

    debugLogger.log('tryResume:entry', {
      attemptId,
      videoId,
      savedTime: saved.time,
      videoDurationAtEntry: video.duration,
    });

    // Duration-independent short-circuit: below the minimum watched threshold,
    // no duration value could make shouldResume() true, so don't pay for the
    // metadata wait (D-038) just to fail the bounds check anyway.
    if (!timeUtils.meetsMinimumWatched(saved.time, minWatchSeconds)) {
      debugLogger.log('tryResume:belowMinimum', { attemptId, savedTime: saved.time });
      return outcome(OUTCOME.INELIGIBLE, 'below-minimum', saved.time, video.currentTime, attemptId);
    }

    // F04/R5 — resolve current content identity (defer through ads, obtain
    // real content metadata) BEFORE evaluating eligibility. A short ad's
    // duration must never disqualify a long saved content position.
    const metadataResult = await establishContentMetadata(video, isCurrent, forceMetadataRefresh);
    if (!isCurrent()) return outcome(OUTCOME.CANCELLED, 'generation-superseded', saved.time, video.currentTime, attemptId);
    debugLogger.log('tryResume:metadataResolved', {
      attemptId,
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
      return outcome(OUTCOME.FAILED, metadataResult.reason, saved.time, video.currentTime, attemptId);
    }

    // Validate resume conditions against real, post-ad content metadata
    const shouldResumeResult = timeUtils.shouldResume(saved.time, video.duration, minWatchSeconds, completionThreshold);
    debugLogger.log('tryResume:shouldResume', {
      attemptId,
      result: shouldResumeResult,
      savedTime: saved.time,
      duration: video.duration,
    });
    if (!shouldResumeResult) {
      return outcome(OUTCOME.INELIGIBLE, 'not-eligible', saved.time, video.currentTime, attemptId);
    }

    const eligibleDuration = video.duration;

    debugLogger.log('tryResume:isAdPlaying:beforeWait', {
      attemptId,
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
      if (!isCurrent()) return outcome(OUTCOME.CANCELLED, 'generation-superseded', saved.time, video.currentTime, attemptId);

      if (playerObserver.isAdPlaying()) {
        const adCleared = await waitForAdClear(isCurrent);
        if (!isCurrent()) return outcome(OUTCOME.CANCELLED, 'generation-superseded', saved.time, video.currentTime, attemptId);
        debugLogger.log('tryResume:adWait', { attemptId, cleared: adCleared });
        if (!adCleared) {
          console.warn('[YTResume] Resume abandoned: ad did not clear within 60s');
          return outcome(OUTCOME.FAILED, 'ad-timeout', saved.time, video.currentTime, attemptId);
        }

        // F04 — a mid-roll can swap the media source. Revalidate that the
        // content metadata we evaluated eligibility against still holds
        // before proceeding; don't seek against a stale decision.
        const revalidated = await establishContentMetadata(video, isCurrent);
        if (!isCurrent()) return outcome(OUTCOME.CANCELLED, 'generation-superseded', saved.time, video.currentTime, attemptId);
        if (!revalidated.ok || Math.abs(video.duration - eligibleDuration) > 1) {
          debugLogger.log('tryResume:revalidationFailed', {
            attemptId,
            ok: revalidated.ok,
            durationNow: video.duration,
            eligibleDuration,
          });
          return outcome(OUTCOME.FAILED, 'revalidation-failed', saved.time, video.currentTime, attemptId);
        }
      }

      // D-021: baseline currentTime immediately before the delay, not after —
      // the guard below measures drift from here, not an absolute threshold.
      preDelayTime = video.currentTime;

      // Buffer for YouTube player initialization race
      await delay(RESUME_DELAY_MS);
      if (!isCurrent()) return outcome(OUTCOME.CANCELLED, 'generation-superseded', saved.time, video.currentTime, attemptId);

      debugLogger.log('tryResume:isAdPlaying:afterDelay', {
        attemptId,
        isAdPlaying: playerObserver.isAdPlaying(),
        currentTime: video.currentTime,
      });

      if (!playerObserver.isAdPlaying()) break;

      round += 1;
      debugLogger.log('tryResume:adDuringDelay', { attemptId, round });
      if (round >= AD_ROUND_MAX_ATTEMPTS) {
        console.warn('[YTResume] Resume abandoned: ad kept reappearing during resume delay');
        return outcome(OUTCOME.FAILED, 'ad-flapping', saved.time, video.currentTime, attemptId);
      }
      // loop: re-defer to the ad wait, then re-baseline preDelayTime
    }

    // Phase 5 (task 5.3/5.4, F08) — a bounded stabilization check that
    // distinguishes native interference (proceed with the resume anyway,
    // overriding it) from genuine user intent (cancel outright and let this
    // become a normal, user-directed session) using direction-agnostic
    // drift plus a recent-input correlation, not fixed forward magnitude.
    const stabilization = checkStabilization(video, preDelayTime, RESUME_DELAY_MS);
    debugLogger.log('tryResume:stabilizationCheck', {
      attemptId,
      currentTime: video.currentTime,
      preDelayTime,
      jumped: stabilization.jumped,
      userSeek: stabilization.userSeek,
    });
    if (stabilization.userSeek) {
      return outcome(OUTCOME.CANCELLED, 'user-seek', saved.time, video.currentTime, attemptId);
    }

    const resumeTime = timeUtils.getResumeTime(saved.time, rewindSeconds);
    debugLogger.log('tryResume:resumeTime', { attemptId, resumeTime });

    const seekResult = await seekWithVerification(video, resumeTime, isCurrent);
    if (!isCurrent()) return outcome(OUTCOME.CANCELLED, 'generation-superseded', saved.time, video.currentTime, attemptId);

    // PRD §5.6: the Restart button (and, by the same logic, the toast) must
    // appear only when the seek was successfully applied AND verified — not
    // on a best-effort basis. Showing them after a failed verification is
    // actively misleading.
    if (!seekResult.ok) {
      console.warn('[YTResume] Seek could not be verified after 3 attempts');
      debugLogger.log('tryResume:seekUnverified', { attemptId, currentTime: video.currentTime, reason: seekResult.reason });
      const status = seekResult.reason === 'seek-threw' ? OUTCOME.FAILED : OUTCOME.PENDING;
      return outcome(status, seekResult.reason, saved.time, video.currentTime, attemptId);
    }

    // Roadmap 3.4 — YouTube's own native resume can override our verified
    // seek shortly after; re-assert once against it before showing UI. A
    // throw here is a real failure now (R3), never swallowed into success.
    const reassertResult = await verifyAndReassert(video, resumeTime, isCurrent);
    if (!isCurrent()) return outcome(OUTCOME.CANCELLED, 'generation-superseded', saved.time, video.currentTime, attemptId);
    if (!reassertResult.ok) {
      debugLogger.log('tryResume:reassertFailed', { attemptId, reason: reassertResult.reason });
      return outcome(OUTCOME.FAILED, reassertResult.reason, saved.time, video.currentTime, attemptId);
    }
    if (reassertResult.userOverride) {
      // The user moved playback themselves during the reassert window —
      // that's not our resume succeeding, and not a failure either; no
      // success UI, and the session becomes normal user-directed playback.
      return outcome(OUTCOME.USER_OVERRIDDEN, 'user-override', saved.time, video.currentTime, attemptId);
    }

    // Phase 5 (R2) — the single 500ms check above is not the end of native-
    // override risk; keep watching a bounded while longer, in the
    // background, without blocking this outcome or bootstrap's arm().
    monitorForLateOverride(video, resumeTime, isCurrent);

    if (debugLogger.DEBUG) {
      setTimeout(() => {
        debugLogger.log('tryResume:after1000ms', { attemptId, currentTime: video.currentTime });
      }, 1000);
    }

    // T7.7/T7.8/T7.9: the seek itself is unconditional — only the UI is
    // settings-gated. Off means zero injected DOM, not "resume disabled".
    if (showRestartButton) uiInjector.showRestartButton(video, videoId);
    if (showToast) uiInjector.showToast(resumeTime);

    return outcome(OUTCOME.VERIFIED, 'ok', saved.time, video.currentTime, attemptId);
  }

  return { tryResume, OUTCOME };
})();

