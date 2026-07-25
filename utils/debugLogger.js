/**
 * DebugLogger Module
 *
 * Purpose: Phase 1 reliability-audit instrumentation. No-ops when
 * DEBUG is false so shipped behaviour is identical to v1.0.
 *
 * Public API:
 *   debugLogger.DEBUG          → boolean
 *   debugLogger.log(stage, data) → void
 */

const debugLogger = (() => {
  const DEBUG = false;

  function log(stage, data) {
    if (!DEBUG) return;
    if (data !== undefined) {
      console.log(`[YTResume] ${stage}`, JSON.stringify(data));
    } else {
      console.log(`[YTResume] ${stage}`);
    }
  }

  return { DEBUG, log };
})();
