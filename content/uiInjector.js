/**
 * UIInjector Module
 *
 * Purpose: Inject the Restart button into YouTube's player controls,
 * manage its visibility lifecycle, and handle click behavior.
 *
 * Public API:
 *   uiInjector.showRestartButton(video, videoId) → void
 *   uiInjector.cleanup()                         → void
 *
 * NOTE: Stub implementation for Phase 6. Full implementation in Phase 8.
 */

const uiInjector = {
  showRestartButton(video, videoId) {
    console.log('[YTResume] Restart button would be shown (stub) for video:', videoId);
  },

  cleanup() {
    // No-op stub — will be implemented in Phase 8
  },
};

console.log('[YTResume] uiInjector.js loaded');
