/**
 * Bootstrap Module
 *
 * Purpose: Entry point. Owns no logic of its own. Wires all
 * modules together and starts the system.
 */

(() => {
  /**
   * Orchestrates the initialization pipeline for a new video load.
   *
   * @param {string} videoId - The 11-character YouTube video ID
   */
  async function onVideoChange(videoId) {
    // 1. Teardown previous state
    progressTracker.stop();
    uiInjector.cleanup();
    playerObserver.disconnect();

    // 2. Context Check
    if (!youtubeUtils.isWatchPage()) {
      return; // Exit silently — tracking only applies to watch pages
    }

    // Settings are read once per navigation, here, and passed down — never
    // re-read inside progressTracker's 5-second interval (Roadmap 7.3). A
    // settings read failure (corrupt/missing/unreadable) must never block
    // resume (7.7) — fall back to defaults silently, warn only.
    let settings;
    try {
      settings = await storageManager.getSettings();
    } catch (err) {
      console.warn('[YTResume] Settings read failed, using defaults:', err.message);
      settings = storageManager.getDefaultSettings();
    }

    try {
      // 3. Wait for reliable player state
      const video = await playerObserver.waitForVideo();

      // Guards for unsupported formats (safety nets, though isWatchPage
      // usually covers this, YouTube sometimes plays Shorts in standard player)
      if (youtubeUtils.isShorts() || youtubeUtils.isLive(video)) {
        return;
      }

      // 4. Try Resume
      try {
        const saved = await storageManager.getProgress(videoId);
        if (saved) {
          await resumeManager.tryResume(video, saved, videoId, settings);
        }
      } catch(err) {
        // Log but do not crash — resume failure shouldn't kill tracking
        console.warn('[YTResume] Resume pipeline failed:', err.message);
      }

      // 5. Start Progress Tracking
      // This is called whether resume succeeded, failed, or didn't occur
      progressTracker.start(video, videoId, settings);

    } catch(err) {
      console.warn('[YTResume] Player initialization failed:', err.message);
    }
  }

  /**
   * Initializes the extension. Self-executing on inject.
   */
  function init() {
    // navigationManager owns the single 1000ms interval (D-059); its tick
    // also drives progressTracker's 5s save cadence, so only one setInterval
    // is ever alive.
    navigationManager.start(onVideoChange, () => progressTracker.tick());
  }

  init();
})();
