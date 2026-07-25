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
   * Returns a Promise that resolves with the <video> element inside
   * #movie_player. Observes document.body until #movie_player itself
   * appears (v1.0 rejected immediately in this case, guaranteeing a missed
   * resume on slow cold loads — D-023), then resolves once <video> shows up
   * inside it. Rejects only on the overall 10-second timeout.
   */
  function waitForVideo() {
    const startTime = Date.now();
    debugLogger.log('waitForVideo:entry', {
      containerExists: !!document.querySelector('#movie_player'),
    });

    return new Promise((resolve, reject) => {
      const resolveVideo = () => {
        const container = document.querySelector('#movie_player');
        return container ? container.querySelector('video') : null;
      };

      const existing = resolveVideo();
      if (existing) {
        debugLogger.log('waitForVideo:resolved', {
          path: 'immediate',
          elapsedMs: Date.now() - startTime,
        });
        resolve(existing);
        return;
      }

      // Observe document.body broadly: covers both #movie_player not yet
      // existing and <video> not yet existing inside it.
      observer = new MutationObserver(() => {
        const video = resolveVideo();
        if (video) {
          observer.disconnect();
          observer = null;
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
          debugLogger.log('waitForVideo:resolved', {
            path: 'observer',
            elapsedMs: Date.now() - startTime,
          });
          resolve(video);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Timeout after 10 seconds
      timeoutHandle = setTimeout(() => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        timeoutHandle = null;
        debugLogger.log('waitForVideo:resolved', {
          path: 'timeout',
          elapsedMs: Date.now() - startTime,
        });
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


