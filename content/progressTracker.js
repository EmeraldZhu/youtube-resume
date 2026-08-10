/**
 * ProgressTracker Module
 *
 * Purpose: Track playback progress continuously and save it
 * to storage on defined triggers.
 *
 * Public API:
 *   progressTracker.start(video, videoId, settings) → void
 *   progressTracker.stop()                          → void
 *   progressTracker.tick()                          → void
 *   progressTracker.arm()                           → void
 *   progressTracker.notifyExternalReset()           → void
 */

const progressTracker = (() => {
  // No setInterval of its own (D-059) — navigationManager already runs a
  // permanent 1000ms poll for the life of the content script; tick() rides
  // on that instead of a second concurrent interval. ticksSinceSave counts
  // to 5 to preserve the original 5000ms save cadence exactly.
  let ticksSinceSave = 0;
  let lastSavedTime = 0;
  let activeVideo = null;
  let activeVideoId = null;
  let minWatchSeconds = 30; // read once per navigation in start() (Roadmap 7.3)
  // Disarmed on every start() (Roadmap 3.1) — no write (interval or event) is
  // accepted until arm() is called once bootstrap.js's resume lifecycle for
  // this video has resolved (Roadmap 3.2).
  let armed = false;
  // Tier 2 pick (Roadmap 3.6) — a backward jump larger than this on an
  // interval-triggered save is treated as a spurious read (defect C), not a
  // real seek. Real backward seeks are exempt structurally: their own
  // 'seeked'-triggered save already updates lastSavedTime to the new
  // position before the next interval tick runs, so no separate "recent
  // seek" flag is needed.
  const BACKWARD_JUMP_THRESHOLD_S = 30;

  // Bound handler references for proper removal
  let handlePause = null;
  let handleSeeked = null;
  let handleEnded = null;
  let handleVisibility = null;
  let handlePagehide = null;

  /**
   * Core save logic with guards.
   * Skips save if: ad playing, live stream, invalid position, or
   * (interval trigger only) delta < 5.
   *
   * @param {boolean} bypassDelta - If true, skip the delta guard.
   *   Only the interval trigger passes false (D-024); every event
   *   trigger (pause/seeked/ended/visibilitychange/pagehide) saves
   *   unconditionally.
   */
  function attemptSave(bypassDelta, trigger) {
    // Phase 0 (v3) diagnostic — logged on every call, before any guard can
    // return early, per Roadmap v3 0.3 (videoId, trigger, position-to-write).
    debugLogger.log('attemptSave:entry', {
      videoId: activeVideoId,
      trigger,
      currentTime: activeVideo ? activeVideo.currentTime : null,
    });

    if (!activeVideo || !activeVideoId) return;
    if (!armed) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'disarmed' });
      return; // Roadmap 3.1 — no write until the resume lifecycle has resolved
    }
    if (playerObserver.isAdPlaying()) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'adPlaying' });
      return;
    }
    if (activeVideo.duration === Infinity) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'liveStream' });
      return; // live stream guard
    }

    const current = Math.floor(activeVideo.currentTime);
    const duration = Math.floor(activeVideo.duration);

    if (Number.isNaN(current) || current < 0 || Number.isNaN(duration) || current > duration) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'invalidPosition', current, duration });
      return; // invalid position guard
    }

    if (!timeUtils.meetsMinimumWatched(current, minWatchSeconds)) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'belowMinWatch', current, minWatchSeconds });
      return; // Roadmap 7.5 — no storage entry for a video watched less than this
    }

    // Roadmap 3.6 — regression guard: an interval-triggered save landing far
    // below the last known-good position is treated as a spurious read
    // (defect C's mechanism, Phase 0 finding 0.8) and rejected outright.
    // Interval-only: every event trigger (seeked/pause/ended/visibility/
    // pagehide) represents observed user intent or a session boundary and is
    // exempt by construction (D-024's bypassDelta=true already marks them).
    if (!bypassDelta && (lastSavedTime - current) > BACKWARD_JUMP_THRESHOLD_S) {
      debugLogger.log('attemptSave:skipped', {
        videoId: activeVideoId, trigger, reason: 'backwardJumpRejected', current, lastSavedTime,
      });
      return;
    }

    const deltaBlocked = !bypassDelta && Math.abs(current - lastSavedTime) < 5;
    debugLogger.log('attemptSave', {
      videoId: activeVideoId,
      trigger,
      bypassDelta: !!bypassDelta,
      deltaBlocked,
      current,
      lastSavedTime,
    });
    if (deltaBlocked) return; // delta guard — interval trigger only (D-024)

    lastSavedTime = current;
    const title = youtubeUtils.getTitle();
    const channel = youtubeUtils.getChannelName();
    storageManager.saveProgress(activeVideoId, current, duration, title, channel)
      .catch(err => console.warn('[YTResume] Save failed:', err.message));
  }

  /**
   * Initializes interval-based and event-based progress tracking
   * for the given video element and videoId.
   *
   * @param {Settings} settings - read once per navigation by bootstrap.js
   *   (Roadmap 7.3); never re-read inside the interval below.
   */
  function start(video, videoId, settings = {}) {
    // Safety: stop any existing tracking first
    stop();

    activeVideo = video;
    activeVideoId = videoId;
    minWatchSeconds = settings.minWatchSeconds ?? 30;
    lastSavedTime = Math.floor(video.currentTime);
    ticksSinceSave = 0;
    armed = false; // Roadmap 3.1 — disarmed on every load; bootstrap.js calls arm() once the resume lifecycle resolves

    // Event-based triggers — all save unconditionally (D-024)
    handlePause = () => attemptSave(true, 'pause');
    handleSeeked = () => attemptSave(true, 'seeked');
    handleEnded = () => attemptSave(true, 'ended');
    handleVisibility = () => {
      if (document.hidden) attemptSave(true, 'visibility');
    };
    // pagehide, not beforeunload (D-025) — best-effort, chrome.storage.local
    // cannot save synchronously during teardown.
    handlePagehide = () => attemptSave(true, 'pagehide');

    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ended', handleEnded);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePagehide);
  }

  /**
   * Advances the tick counter by one 1000ms beat (driven by
   * navigationManager's poll interval, D-059) and fires attemptSave every
   * 5th tick — a no-op when tracking isn't active.
   */
  function tick() {
    if (!activeVideo || !activeVideoId) return;
    ticksSinceSave += 1;
    if (ticksSinceSave >= 5) {
      ticksSinceSave = 0;
      attemptSave(false, 'interval');
    }
  }

  /**
   * Arms tracking, allowing attemptSave() to actually write. Called by
   * bootstrap.js once the resume lifecycle for the current video has
   * resolved — a completed tryResume() (success or verified give-up) or,
   * for a fresh video with no saved entry, immediately (Roadmap 3.2).
   */
  function arm() {
    armed = true;
    debugLogger.log('progressTracker:armed', { videoId: activeVideoId });
  }

  /**
   * Called by uiInjector's Restart control immediately after it forces
   * video.currentTime to 0 directly. Resets the backward-jump guard's
   * baseline to 0 so replaying past minWatchSeconds afterward isn't
   * mistaken for a spurious near-zero overwrite (Roadmap 3.6) — an
   * explicit exemption for this specific path, not a reliance on whatever
   * native 'seeked' behavior a programmatic currentTime assignment does or
   * doesn't trigger.
   */
  function notifyExternalReset() {
    lastSavedTime = 0;
    debugLogger.log('progressTracker:externalReset', { videoId: activeVideoId });
  }

  /**
   * Removes all event listeners and resets internal state. Idempotent —
   * safe to call multiple times or before start().
   */
  function stop() {
    ticksSinceSave = 0;
    armed = false;

    if (activeVideo) {
      if (handlePause) activeVideo.removeEventListener('pause', handlePause);
      if (handleSeeked) activeVideo.removeEventListener('seeked', handleSeeked);
      if (handleEnded) activeVideo.removeEventListener('ended', handleEnded);
    }
    if (handleVisibility) document.removeEventListener('visibilitychange', handleVisibility);
    if (handlePagehide) window.removeEventListener('pagehide', handlePagehide);

    handlePause = null;
    handleSeeked = null;
    handleEnded = null;
    handleVisibility = null;
    handlePagehide = null;

    activeVideo = null;
    activeVideoId = null;
    lastSavedTime = 0;
    minWatchSeconds = 30;
  }

  return { start, stop, tick, arm, notifyExternalReset };
})();


