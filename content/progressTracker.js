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
    if (!activeVideo || !activeVideoId) return;
    if (playerObserver.isAdPlaying()) {
      debugLogger.log('attemptSave:skipped', { trigger, reason: 'adPlaying' });
      return;
    }
    if (activeVideo.duration === Infinity) {
      debugLogger.log('attemptSave:skipped', { trigger, reason: 'liveStream' });
      return; // live stream guard
    }

    const current = Math.floor(activeVideo.currentTime);
    const duration = Math.floor(activeVideo.duration);

    if (Number.isNaN(current) || current < 0 || Number.isNaN(duration) || current > duration) {
      debugLogger.log('attemptSave:skipped', { trigger, reason: 'invalidPosition', current, duration });
      return; // invalid position guard
    }

    if (!timeUtils.meetsMinimumWatched(current, minWatchSeconds)) {
      debugLogger.log('attemptSave:skipped', { trigger, reason: 'belowMinWatch', current, minWatchSeconds });
      return; // Roadmap 7.5 — no storage entry for a video watched less than this
    }

    const deltaBlocked = !bypassDelta && Math.abs(current - lastSavedTime) < 5;
    debugLogger.log('attemptSave', {
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
   * Removes all event listeners and resets internal state. Idempotent —
   * safe to call multiple times or before start().
   */
  function stop() {
    ticksSinceSave = 0;

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

  return { start, stop, tick };
})();


