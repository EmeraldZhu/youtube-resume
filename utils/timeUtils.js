/**
 * TimeUtils Module
 *
 * Purpose: Pure utility functions for resume threshold logic
 * and time calculations. No side effects.
 *
 * Thresholds are settings-driven (Phase 7) — every function takes them as
 * arguments. The module constants below are defaults only, used when a
 * caller omits the argument (e.g. settings unavailable, see D-049).
 *
 * Public API:
 *   timeUtils.shouldResume(savedTime, duration, minWatchSeconds?, completionThreshold?) → boolean
 *   timeUtils.meetsMinimumWatched(savedTime, minWatchSeconds?)                          → boolean
 *   timeUtils.getResumeTime(savedTime, rewindSeconds?)                                  → number
 */

const timeUtils = (() => {
  const MIN_RESUME_SECONDS   = 30;
  const COMPLETION_THRESHOLD = 0.95;
  const ROLLBACK_SECONDS     = 2;

  /**
   * The duration-independent half of shouldResume(). Exposed separately so
   * resumeManager can reject a too-short saved time before paying for the
   * metadata wait (D-038) — no duration value could flip this to true.
   */
  function meetsMinimumWatched(savedTime, minWatchSeconds = MIN_RESUME_SECONDS) {
    return savedTime > minWatchSeconds;
  }

  return {
    /**
     * Determines whether a video should be resumed from savedTime.
     * Returns true only when:
     *   - duration is a valid, finite, positive number
     *   - savedTime is greater than minWatchSeconds (default 30s)
     *   - savedTime is less than duration * completionThreshold (default 95%)
     */
    shouldResume(savedTime, duration, minWatchSeconds = MIN_RESUME_SECONDS, completionThreshold = COMPLETION_THRESHOLD) {
      if (!duration || isNaN(duration) || duration === Infinity) return false;
      return meetsMinimumWatched(savedTime, minWatchSeconds) && savedTime < duration * completionThreshold;
    },

    meetsMinimumWatched,

    /**
     * Returns the resume seek target: savedTime minus rewindSeconds
     * (default 2s), floored at 0.
     */
    getResumeTime(savedTime, rewindSeconds = ROLLBACK_SECONDS) {
      return Math.max(0, savedTime - rewindSeconds);
    },
  };
})();


