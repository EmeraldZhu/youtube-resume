/**
 * TimeUtils Module
 *
 * Purpose: Pure utility functions for resume threshold logic
 * and time calculations. No side effects.
 *
 * Public API:
 *   timeUtils.shouldResume(savedTime, duration) → boolean
 *   timeUtils.getResumeTime(savedTime)          → number
 */

const timeUtils = (() => {
  const MIN_RESUME_SECONDS   = 30;
  const COMPLETION_THRESHOLD = 0.95;
  const ROLLBACK_SECONDS     = 2;

  return {
    /**
     * Determines whether a video should be resumed from savedTime.
     * Returns true only when:
     *   - duration is a valid, finite, positive number
     *   - savedTime is greater than MIN_RESUME_SECONDS (30s)
     *   - savedTime is less than duration * COMPLETION_THRESHOLD (95%)
     */
    shouldResume(savedTime, duration) {
      if (!duration || isNaN(duration) || duration === Infinity) return false;
      return savedTime > MIN_RESUME_SECONDS &&
             savedTime < duration * COMPLETION_THRESHOLD;
    },

    /**
     * Returns the resume seek target: savedTime minus a 2-second rollback,
     * floored at 0.
     */
    getResumeTime(savedTime) {
      return Math.max(0, savedTime - ROLLBACK_SECONDS);
    },
  };
})();


