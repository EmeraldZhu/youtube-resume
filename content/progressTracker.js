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
    storageManager.saveProgress(activeVideoId, current, duration, title)
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
  }

  return { start, stop };
})();


