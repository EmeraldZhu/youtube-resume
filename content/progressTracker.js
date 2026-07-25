/**
 * ProgressTracker Module
 *
 * Purpose: Track playback progress continuously and save it
 * to storage on defined triggers.
 *
 * Public API:
 *   progressTracker.start(video, videoId) → void
 *   progressTracker.stop()                → void
 */

const progressTracker = (() => {
  let intervalId = null;
  let lastSavedTime = 0;
  let activeVideo = null;
  let activeVideoId = null;

  // Bound handler references for proper removal
  let handlePause = null;
  let handleSeeked = null;
  let handleVisibility = null;
  let handleUnload = null;

  /**
   * Core save logic with guards.
   * Skips save if: ad playing, live stream, or delta < 5.
   *
   * @param {boolean} bypassDelta - If true, skip the delta guard
   *   (used by pause and seeked handlers).
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

    const deltaBlocked = !bypassDelta && Math.abs(current - lastSavedTime) < 5;
    debugLogger.log('attemptSave', {
      trigger,
      bypassDelta: !!bypassDelta,
      deltaBlocked,
      current,
      lastSavedTime,
    });
    if (deltaBlocked) return; // delta guard

    lastSavedTime = current;
    storageManager.saveProgress(activeVideoId, current, duration)
      .catch(err => console.warn('[YTResume] Save failed:', err.message));
  }

  /**
   * Initializes interval-based and event-based progress tracking
   * for the given video element and videoId.
   */
  function start(video, videoId) {
    // Safety: stop any existing tracking first
    stop();

    activeVideo = video;
    activeVideoId = videoId;
    lastSavedTime = Math.floor(video.currentTime);

    // Core interval — every 5 seconds
    intervalId = setInterval(() => attemptSave(false, 'interval'), 5000);

    // Event-based triggers
    handlePause = () => attemptSave(true, 'pause');
    handleSeeked = () => attemptSave(true, 'seeked');
    handleVisibility = () => {
      if (document.hidden) attemptSave(true, 'visibility');
    };
    handleUnload = () => attemptSave(true, 'unload');

    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);
  }

  /**
   * Clears the interval, removes all event listeners, and resets
   * internal state. Idempotent — safe to call multiple times or
   * before start().
   */
  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (activeVideo) {
      if (handlePause) activeVideo.removeEventListener('pause', handlePause);
      if (handleSeeked) activeVideo.removeEventListener('seeked', handleSeeked);
    }
    if (handleVisibility) document.removeEventListener('visibilitychange', handleVisibility);
    if (handleUnload) window.removeEventListener('beforeunload', handleUnload);

    handlePause = null;
    handleSeeked = null;
    handleVisibility = null;
    handleUnload = null;

    activeVideo = null;
    activeVideoId = null;
    lastSavedTime = 0;
  }

  return { start, stop };
})();


