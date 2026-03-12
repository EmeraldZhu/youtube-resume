/**
 * YouTubeUtils Module
 *
 * Purpose: Pure utility functions for URL and page-type inspection.
 * No side effects.
 *
 * Public API:
 *   youtubeUtils.isWatchPage() → boolean
 *   youtubeUtils.getVideoId()  → string | null
 *   youtubeUtils.isShorts()    → boolean
 *   youtubeUtils.isLive(video) → boolean
 */

const youtubeUtils = {
  /**
   * Returns true if the current page is a YouTube watch page
   * (pathname is /watch and the v query param is present).
   */
  isWatchPage() {
    return window.location.pathname === '/watch' &&
           new URLSearchParams(window.location.search).has('v');
  },

  /**
   * Extracts and returns the video ID (v query param) from the current URL.
   * Returns null if the param is absent.
   */
  getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v') ?? null;
  },

  /**
   * Returns true if the current page is a YouTube Shorts page.
   */
  isShorts() {
    return window.location.pathname.startsWith('/shorts/');
  },

  /**
   * Returns true if the given video element is a live stream
   * (duration is Infinity).
   */
  isLive(video) {
    return video.duration === Infinity;
  },
};

console.log('[YTResume] youtubeUtils.js loaded');
