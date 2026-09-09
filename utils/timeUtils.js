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
 *   timeUtils.shouldResume(savedTime, duration, minWatchSeconds?, completionThreshold?, isComplete?) → boolean
 *   timeUtils.meetsMinimumWatched(savedTime, minWatchSeconds?)                                       → boolean
 *   timeUtils.getResumeTime(savedTime, rewindSeconds?)                                               → number
 */

const timeUtils = (() => {
  const MIN_RESUME_SECONDS   = 30;
  const COMPLETION_THRESHOLD = 0.95;
  const ROLLBACK_SECONDS     = 2;
  // Roadmap 7.7/D-106 — completionThreshold's sentinel value for "Only at
  // the end": routes shouldResume through the caller-supplied completion
  // predicate (storageValidation.isCompleteEntry, the same one Phase 7's
  // display/Remove-completed logic uses) instead of percentage arithmetic.
  const ONLY_AT_END_SENTINEL = 1;

  /**
   * The duration-independent half of shouldResume(). Exposed separately so
   * resumeManager can reject a too-short saved time before paying for the
   * metadata wait (D-038) — no duration value could flip this to true.
   *
   * Inclusive (>=), matching UX Spec CP-42h's "less than this" wording
   * (Roadmap 7.4/D-11x): a saved time exactly equal to minWatchSeconds is
   * "at least" the minimum, not "less than" it, so it must not be excluded.
   */
  function meetsMinimumWatched(savedTime, minWatchSeconds = MIN_RESUME_SECONDS) {
    return savedTime >= minWatchSeconds;
  }

  return {
    /**
     * Determines whether a video should be resumed from savedTime.
     * Returns true only when:
     *   - duration is a valid, finite, positive number
     *   - savedTime is at least minWatchSeconds (default 30s)
     *   - either completionThreshold is the "Only at the end" sentinel (1)
     *     and isComplete is false (Roadmap 7.7 — routes through the
     *     ended/legacy-inference predicate, not percentage arithmetic), or
     *     savedTime is less than duration * completionThreshold (default 95%)
     *
     * @param {boolean} [isComplete=false] - the caller's precomputed
     *   completion predicate for this entry (storageValidation.isCompleteEntry),
     *   only consulted when completionThreshold is the sentinel value.
     */
    shouldResume(savedTime, duration, minWatchSeconds = MIN_RESUME_SECONDS, completionThreshold = COMPLETION_THRESHOLD, isComplete = false) {
      if (!duration || isNaN(duration) || duration === Infinity) return false;
      if (!meetsMinimumWatched(savedTime, minWatchSeconds)) return false;
      if (completionThreshold >= ONLY_AT_END_SENTINEL) return !isComplete;
      return savedTime < duration * completionThreshold;
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


