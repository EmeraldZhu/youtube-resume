/**
 * ResumeManager Module
 *
 * Purpose: Validate saved progress against resume conditions
 * and execute the seek. Coordinates with uiInjector.
 *
 * Public API:
 *   resumeManager.tryResume(video, saved, videoId) → Promise<void>
 */

const resumeManager = (() => {
  const RESUME_DELAY_MS = 400;

  /**
   * Returns a Promise that resolves when video.duration is a
   * valid finite number. Listens for 'loadedmetadata' event
   * with a 5-second timeout fallback.
   */
  function waitForMetadata(video) {
    return new Promise((resolve, reject) => {
      if (video.duration && !isNaN(video.duration) && video.duration !== Infinity) {
        resolve();
        return;
      }

      const onLoaded = () => {
        clearTimeout(timeout);
        resolve();
      };

      const timeout = setTimeout(() => {
        video.removeEventListener('loadedmetadata', onLoaded);
        reject(new Error('Timeout: video metadata not loaded after 5s'));
      }, 5000);

      video.addEventListener('loadedmetadata', onLoaded, { once: true });
    });
  }

  /**
   * Returns a Promise that resolves after the specified milliseconds.
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validates saved progress against resume conditions and
   * executes the seek if conditions are met.
   *
   * @param {HTMLVideoElement} video
   * @param {VideoProgress} saved - { time, duration, updated }
   * @param {string} videoId
   */
  async function tryResume(video, saved, videoId) {
    // Wait for duration to be available
    if (!video.duration || isNaN(video.duration)) {
      try {
        await waitForMetadata(video);
      } catch (err) {
        console.warn('[YTResume] Metadata wait failed:', err.message);
        return;
      }
    }

    // Validate resume conditions
    if (!timeUtils.shouldResume(saved.time, video.duration)) {
      return; // Conditions not met — exit silently
    }

    // Buffer for YouTube player initialization race
    await delay(RESUME_DELAY_MS);

    // Guard: if user has already manually seeked during delay, abort
    if (video.currentTime > 5) return;

    const resumeTime = timeUtils.getResumeTime(saved.time);

    try {
      video.currentTime = resumeTime;
    } catch (err) {
      console.warn('[YTResume] Seek failed:', err.message);
      return;
    }

    uiInjector.showRestartButton(video, videoId);
  }

  return { tryResume };
})();

console.log('[YTResume] resumeManager.js loaded');
