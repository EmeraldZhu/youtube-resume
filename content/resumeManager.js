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
    debugLogger.log('tryResume:entry', {
      videoId,
      savedTime: saved.time,
      videoDurationAtEntry: video.duration,
    });

    // Wait for duration to be available
    let metadataWaitOccurred = false;
    if (!video.duration || isNaN(video.duration)) {
      metadataWaitOccurred = true;
      try {
        await waitForMetadata(video);
      } catch (err) {
        console.warn('[YTResume] Metadata wait failed:', err.message);
        debugLogger.log('tryResume:metadataWaitFailed', { error: err.message });
        return;
      }
    }
    debugLogger.log('tryResume:metadataWait', {
      occurred: metadataWaitOccurred,
      videoDuration: video.duration,
    });

    // Validate resume conditions
    const shouldResumeResult = timeUtils.shouldResume(saved.time, video.duration);
    debugLogger.log('tryResume:shouldResume', {
      result: shouldResumeResult,
      savedTime: saved.time,
      duration: video.duration,
    });
    if (!shouldResumeResult) {
      return; // Conditions not met — exit silently
    }

    debugLogger.log('tryResume:isAdPlaying:beforeDelay', {
      isAdPlaying: playerObserver.isAdPlaying(),
      currentTime: video.currentTime,
    });

    // Buffer for YouTube player initialization race
    await delay(RESUME_DELAY_MS);

    debugLogger.log('tryResume:isAdPlaying:afterDelay', {
      isAdPlaying: playerObserver.isAdPlaying(),
      currentTime: video.currentTime,
    });

    // Guard: if user has already manually seeked during delay, abort
    const guardAborted = video.currentTime > 5;
    debugLogger.log('tryResume:guardCheck', {
      currentTime: video.currentTime,
      aborted: guardAborted,
    });
    if (guardAborted) return;

    const resumeTime = timeUtils.getResumeTime(saved.time);
    debugLogger.log('tryResume:resumeTime', { resumeTime });

    try {
      video.currentTime = resumeTime;
    } catch (err) {
      console.warn('[YTResume] Seek failed:', err.message);
      debugLogger.log('tryResume:seekFailed', { error: err.message });
      return;
    }

    debugLogger.log('tryResume:afterAssign', { currentTime: video.currentTime });

    if (debugLogger.DEBUG) {
      setTimeout(() => {
        debugLogger.log('tryResume:after1000ms', { currentTime: video.currentTime });
      }, 1000);
    }

    uiInjector.showRestartButton(video, videoId);
    uiInjector.showToast(resumeTime);
  }

  return { tryResume };
})();


