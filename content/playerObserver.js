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
  // R12/F03 — the reject() of whatever waitForVideo() call is currently
  // pending. disconnect() must settle it (never leave it hanging forever)
  // since only one call is ever in flight at a time (bootstrap.js always
  // disconnects the previous generation before starting a new wait).
  let pendingReject = null;

  /**
   * Returns a Promise that resolves with the <video> element inside
   * #movie_player. Observes document.body until #movie_player itself
   * appears (v1.0 rejected immediately in this case, guaranteeing a missed
   * resume on slow cold loads — D-023), then resolves once <video> shows up
   * inside it. Rejects on the overall 10-second timeout, or immediately if
   * disconnect() is called while this is still pending (R12).
   */
  function waitForVideo() {
    const startTime = Date.now();
    debugLogger.log('waitForVideo:entry', {
      containerExists: !!document.querySelector('#movie_player'),
    });

    return new Promise((resolve, reject) => {
      pendingReject = reject;

      const resolveVideo = () => {
        const container = document.querySelector('#movie_player');
        return container ? container.querySelector('video') : null;
      };

      const existing = resolveVideo();
      if (existing) {
        pendingReject = null;
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
          pendingReject = null;
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
        pendingReject = null;
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
   * Disconnects the MutationObserver and cancels the timeout. Also settles
   * (rejects) any pending waitForVideo() promise instead of leaving it
   * unresolved forever (R12 — the audit found a 20s-later still-unsettled
   * promise here). Idempotent — safe to call even if already disconnected
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
    if (pendingReject) {
      const reject = pendingReject;
      pendingReject = null;
      reject(new Error('Cancelled: playerObserver disconnected'));
    }
  }

  return { waitForVideo, isAdPlaying, disconnect };
})();


