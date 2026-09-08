/**
 * PlayerObserver Module
 *
 * Purpose: Detect when the <video> element is available inside
 * #movie_player. Also exposes ad state detection.
 *
 * Public API:
 *   playerObserver.waitForVideo()              → Promise<HTMLVideoElement>
 *   playerObserver.isAdPlaying()               → boolean
 *   playerObserver.watchForReplacement(cb)     → void
 *   playerObserver.stopWatchingForReplacement() → void
 *   playerObserver.disconnect()                → void
 */

const playerObserver = (() => {
  // Phase 6 (D-1xx/6.3) — this single MutationObserver, once created, is
  // never torn down again: it is re-targeted for every generation's
  // waitForVideo() call AND doubles as the persistent player-element-
  // replacement watch (watchForReplacement). CLAUDE.md's "exactly one
  // MutationObserver alive at any time... re-target, never duplicate" is
  // satisfied trivially this way — there is only ever the one instance,
  // for the life of the content script.
  let observer = null;
  let timeoutHandle = null;
  // R12/F03 — the reject() of whatever waitForVideo() call is currently
  // pending. disconnect() must settle it (never leave it hanging forever)
  // since only one call is ever in flight at a time (bootstrap.js always
  // disconnects the previous generation before starting a new wait).
  let pendingReject = null;
  let pendingResolve = null;
  // Phase 6 (6.1) — a persistent callback bootstrap.js registers once a
  // generation has a confirmed video element, so a later swap of that
  // element (YouTube replacing it without a v= change) can be detected and
  // acted on even while no waitForVideo() call is in flight. Cleared by
  // disconnect() at the top of every navigation's teardown; a still-current
  // generation re-registers its own right after re-confirming its video.
  let replacementCallback = null;
  let lastKnownVideo = null;

  function resolveVideo() {
    const container = document.querySelector('#movie_player');
    return container ? container.querySelector('video') : null;
  }

  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(handleMutation);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function handleMutation() {
    const video = resolveVideo();
    if (video && pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingReject = null;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      lastKnownVideo = video;
      debugLogger.log('waitForVideo:resolved', { path: 'observer' });
      resolve(video);
      return; // don't also treat this discovery as a "replacement"
    }
    if (replacementCallback && video && video !== lastKnownVideo) {
      lastKnownVideo = video;
      replacementCallback(video);
    }
  }

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

    ensureObserver();

    return new Promise((resolve, reject) => {
      const existing = resolveVideo();
      if (existing) {
        lastKnownVideo = existing;
        debugLogger.log('waitForVideo:resolved', {
          path: 'immediate',
          elapsedMs: Date.now() - startTime,
        });
        resolve(existing);
        return;
      }

      pendingReject = reject;
      pendingResolve = resolve;

      // Timeout after 10 seconds
      timeoutHandle = setTimeout(() => {
        pendingResolve = null;
        pendingReject = null;
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
   * Phase 6 (6.1) — registers a persistent callback fired whenever the
   * <video> element resolved inside #movie_player changes identity from
   * the one last seen (a real replacement, not merely a re-render of the
   * same element). Reuses the single shared MutationObserver rather than
   * creating a second one. Call once a generation has confirmed its video
   * element; bootstrap.js's own isCurrent() check inside the callback is
   * what actually decides whether to act on it.
   */
  function watchForReplacement(callback) {
    ensureObserver();
    replacementCallback = callback;
    lastKnownVideo = resolveVideo();
  }

  function stopWatchingForReplacement() {
    replacementCallback = null;
  }

  /**
   * Cancels whatever waitForVideo() call is currently pending (rejecting it
   * instead of leaving it unsettled forever, R12) and clears the
   * replacement watch. Does NOT tear down the shared MutationObserver
   * itself (Phase 6) — it stays alive for the next generation's
   * waitForVideo()/watchForReplacement() to re-target. Idempotent — safe to
   * call even before waitForVideo() has ever been called.
   */
  function disconnect() {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    pendingResolve = null;
    if (pendingReject) {
      const reject = pendingReject;
      pendingReject = null;
      reject(new Error('Cancelled: playerObserver disconnected'));
    }
    replacementCallback = null;
  }

  return { waitForVideo, isAdPlaying, watchForReplacement, stopWatchingForReplacement, disconnect };
})();


