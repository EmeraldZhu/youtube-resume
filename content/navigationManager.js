/**
 * NavigationManager Module
 *
 * Purpose: Detect YouTube SPA navigation events and emit
 * a normalized videoChange callback.
 *
 * Public API:
 *   navigationManager.start(onVideoChange) → void
 *   navigationManager.stop()               → void
 */

const navigationManager = (() => {
  let currentVideoId = null;
  let fallbackPollInterval = null;
  let onVideoChangeCallback = null;
  let navigationHandler = null;

  /**
   * Attempts to extract the current videoId and emit if it has changed.
   * Returns true if a new videoId was emitted, false otherwise.
   */
  function checkAndEmit() {
    const newId = youtubeUtils.getVideoId();
    if (newId && newId !== currentVideoId) {
      currentVideoId = newId;
      onVideoChangeCallback(newId);
      return true;
    }
    return false;
  }

  /**
   * Begins listening for YouTube SPA navigation events.
   * On cold load to a watch page, emits immediately.
   *
   * @param {(videoId: string) => void} onVideoChange
   */
  function start(onVideoChange) {
    onVideoChangeCallback = onVideoChange;

    // Primary detection — yt-navigate-finish
    navigationHandler = () => {
      checkAndEmit();
    };
    document.addEventListener('yt-navigate-finish', navigationHandler);

    // Fallback detection — URL polling (every 1000ms)
    // Catches edge cases where yt-navigate-finish may not fire
    let lastPolledHref = window.location.href;
    fallbackPollInterval = setInterval(() => {
      const currentHref = window.location.href;
      if (currentHref !== lastPolledHref) {
        lastPolledHref = currentHref;
        // Only emit via fallback if yt-navigate-finish hasn't already handled it
        checkAndEmit();
      }
    }, 1000);

    // Cold load handling — if already on a watch page, emit immediately
    checkAndEmit();
  }

  /**
   * Removes all event listeners and clears the fallback poll interval.
   */
  function stop() {
    if (navigationHandler) {
      document.removeEventListener('yt-navigate-finish', navigationHandler);
      navigationHandler = null;
    }

    if (fallbackPollInterval !== null) {
      clearInterval(fallbackPollInterval);
      fallbackPollInterval = null;
    }

    currentVideoId = null;
    onVideoChangeCallback = null;
  }

  return { start, stop };
})();

console.log('[YTResume] navigationManager.js loaded');
