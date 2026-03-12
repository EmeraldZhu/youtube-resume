/**
 * PlayerObserver Module
 *
 * Purpose: Detect when the <video> element is available inside
 * #movie_player. Also exposes ad state detection.
 *
 * Public API:
 *   playerObserver.waitForVideo() → Promise<HTMLVideoElement>
 *   playerObserver.isAdPlaying()  → boolean
 *   playerObserver.disconnect()   → void
 */

const playerObserver = (() => {
  let observer = null;
  let timeoutHandle = null;

  /**
   * Returns a Promise that resolves with the <video> element
   * inside #movie_player. Rejects if #movie_player is not found
   * or if <video> does not appear within 10 seconds.
   */
  function waitForVideo() {
    return new Promise((resolve, reject) => {
      const container = document.querySelector('#movie_player');
      if (!container) {
        reject(new Error('Player container #movie_player not found'));
        return;
      }

      // Check if <video> is already present
      const existing = container.querySelector('video');
      if (existing) {
        resolve(existing);
        return;
      }

      // Observe for <video> appearing asynchronously
      observer = new MutationObserver(() => {
        const video = container.querySelector('video');
        if (video) {
          observer.disconnect();
          observer = null;
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
          resolve(video);
        }
      });

      observer.observe(container, { childList: true, subtree: true });

      // Timeout after 10 seconds
      timeoutHandle = setTimeout(() => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        timeoutHandle = null;
        reject(new Error('Timeout: <video> not found after 10s'));
      }, 10000);
    });
  }

  /**
   * Returns true if an ad is currently playing.
   * Checks for the presence of ad-showing or ad-interrupting
   * class on #movie_player.
   */
  function isAdPlaying() {
    const player = document.querySelector('#movie_player');
    if (!player) return false;
    return player.classList.contains('ad-showing') ||
           player.classList.contains('ad-interrupting');
  }

  /**
   * Disconnects the MutationObserver and cancels the timeout.
   * Idempotent — safe to call even if already disconnected
   * or before waitForVideo() has been called.
   */
  function disconnect() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }

  return { waitForVideo, isAdPlaying, disconnect };
})();

console.log('[YTResume] playerObserver.js loaded');
