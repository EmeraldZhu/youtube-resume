/**
 * UIInjector Module
 *
 * Purpose: Inject the Restart button into YouTube's player controls,
 * manage its visibility lifecycle, and handle click behavior.
 *
 * Public API:
 *   uiInjector.showRestartButton(video, videoId) → void
 *   uiInjector.cleanup()                         → void
 */

const uiInjector = (() => {
  let buttonElement = null;
  let dismissTimer = null;
  const DISMISS_DELAY_MS = 7000; // 7 seconds, within the 5–10s spec range

  /**
   * Injects the Restart button into YouTube's player controls bar,
   * adjacent to the time display. Auto-dismisses after 7 seconds.
   *
   * @param {HTMLVideoElement} video
   * @param {string} videoId
   */
  function showRestartButton(video, videoId) {
    cleanup(); // Remove any existing button first

    const button = document.createElement('button');
    button.id = 'yt-resume-restart-btn';
    button.textContent = '↺ Restart';
    button.title = 'Restart video from the beginning';
    button.setAttribute('aria-label', 'Restart video from the beginning');

    // Styling — match YouTube's control bar aesthetics (UX Spec §4.3)
    Object.assign(button.style, {
      background:     'none',
      border:         'none',
      color:          '#ffffff',
      fontSize:       '12px',
      fontFamily:     'Roboto, Arial, sans-serif',
      fontWeight:     '500',
      cursor:         'pointer',
      padding:        '0 8px',
      lineHeight:     '1',
      opacity:        '0.9',
      verticalAlign:  'middle',
      letterSpacing:  '0.01em',
    });

    // Hover behavior
    button.addEventListener('mouseover', () => { button.style.opacity = '1'; });
    button.addEventListener('mouseout',  () => { button.style.opacity = '0.9'; });

    // Click behavior — reset to beginning, delete storage, remove button
    button.addEventListener('click', () => {
      video.currentTime = 0;
      storageManager.deleteProgress(videoId)
        .catch(err => console.warn('[YTResume] Delete failed:', err.message));
      cleanup();
    });

    // Inject adjacent to the time display
    const timeDisplay = document.querySelector('.ytp-time-display');
    if (timeDisplay && timeDisplay.parentNode) {
      timeDisplay.parentNode.insertBefore(button, timeDisplay.nextSibling);
      buttonElement = button;
    } else {
      console.warn('[YTResume] Could not find .ytp-time-display — Restart button not injected');
      return;
    }

    // Auto-dismiss after 7 seconds
    dismissTimer = setTimeout(() => cleanup(), DISMISS_DELAY_MS);
  }

  /**
   * Removes the Restart button from the DOM and clears the dismiss timer.
   * Idempotent — safe to call multiple times.
   */
  function cleanup() {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    if (buttonElement && buttonElement.parentNode) {
      buttonElement.parentNode.removeChild(buttonElement);
    }
    buttonElement = null;
  }

  return { showRestartButton, cleanup };
})();

console.log('[YTResume] uiInjector.js loaded');
