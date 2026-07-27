/**
 * YouTubeUtils Module
 *
 * Purpose: Pure utility functions for URL, page-type, and title
 * inspection. No side effects — reads only.
 *
 * Public API:
 *   youtubeUtils.isWatchPage() → boolean
 *   youtubeUtils.getVideoId()  → string | null
 *   youtubeUtils.isShorts()    → boolean
 *   youtubeUtils.isLive(video) → boolean
 *   youtubeUtils.getTitle()    → string | null
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

  /**
   * Returns the current video's title, or null if unavailable.
   * Prefers document.title (D-015: far more stable across YouTube
   * redesigns than metadata selectors) with the trailing " - YouTube"
   * suffix stripped, falling back to a DOM selector, then to null.
   * Never throws — a missing title must never block a save.
   */
  getTitle() {
    const raw = document.title;
    if (typeof raw === 'string') {
      const stripped = raw.replace(/ - YouTube$/, '').trim();
      if (stripped) return stripped;
    }

    try {
      const el = document.querySelector(
        '#title h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string'
      );
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch (err) {
      // Fall through to null — DOM fallback is best-effort.
    }

    return null;
  },
};


