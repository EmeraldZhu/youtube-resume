/**
 * UIInjector Module
 *
 * Purpose: Inject the Restart button and Resume Toast into YouTube's
 * player controls, manage their visibility lifecycle, and handle behavior.
 *
 * Public API:
 *   uiInjector.showRestartButton(video, videoId) → void
 *   uiInjector.showToast(resumeTime)             → void
 *   uiInjector.cleanup()                         → void
 */

const uiInjector = (() => {
  let buttonElement = null;
  let dismissTimer = null;
  let toastElement = null;
  let toastTimeout = null;
  const DISMISS_DELAY_MS = 7000; // 7 seconds, within the 5–10s spec range

  /**
   * Formats a time in seconds to m:ss or h:mm:ss.
   * Videos under 1 hour use m:ss. Videos 1 hour or longer use h:mm:ss.
   *
   * @param {number} seconds
   * @returns {string}
   */
  function formatTime(seconds) {
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Injects the Restart button into YouTube's player controls bar,
   * adjacent to the time display. Auto-dismisses after 7 seconds.
   *
   * @param {HTMLVideoElement} video
   * @param {string} videoId
   */
  function showRestartButton(video, videoId) {
    // Remove any existing button (not full cleanup — preserve toast)
    removeButton();

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
    dismissTimer = setTimeout(() => removeButton(), DISMISS_DELAY_MS);
  }

  /**
   * Displays a non-interactive toast in the lower-left of the video
   * frame showing the resume timestamp. Fades in, holds, then fades out.
   *
   * @param {number} resumeTime — the seek target in seconds
   */
  function showToast(resumeTime) {
    removeToast(); // Remove any existing toast first

    const toast = document.createElement('div');
    toast.id = 'yt-resume-toast';
    toast.textContent = `Resumed from ${formatTime(resumeTime)}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    // Styling per UX Spec §5.4
    Object.assign(toast.style, {
      background:     'rgba(0, 0, 0, 0.75)',
      color:          '#ffffff',
      fontFamily:     'Roboto, Arial, sans-serif',
      fontSize:       '13px',
      fontWeight:     '400',
      padding:        '6px 12px',
      borderRadius:   '2px',
      position:       'absolute',
      bottom:         '48px',
      left:           '12px',
      zIndex:         '99',
      pointerEvents:  'none',
      opacity:        '0',
      transition:     'opacity 200ms ease-out',
    });

    // Inject into the player container
    const player = document.querySelector('#movie_player');
    if (!player) {
      console.warn('[YTResume] Could not find #movie_player — toast not injected');
      return;
    }

    player.appendChild(toast);
    toastElement = toast;

    // Animation: fade-in → hold → fade-out → remove
    // Trigger fade-in on next frame (allows the browser to register opacity: 0 first)
    requestAnimationFrame(() => {
      toast.style.opacity = '1';

      // Hold for 1600ms after fade-in completes (200ms)
      toastTimeout = setTimeout(() => {
        // Switch to fade-out easing
        toast.style.transition = 'opacity 400ms ease-in';
        toast.style.opacity = '0';

        // Remove from DOM after fade-out completes
        toastTimeout = setTimeout(() => {
          removeToast();
        }, 400);
      }, 200 + 1600); // 200ms fade-in + 1600ms hold
    });
  }

  /**
   * Removes the Restart button from the DOM and clears the dismiss timer.
   */
  function removeButton() {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    if (buttonElement && buttonElement.parentNode) {
      buttonElement.parentNode.removeChild(buttonElement);
    }
    buttonElement = null;
  }

  /**
   * Removes the toast from the DOM and clears its timeout.
   */
  function removeToast() {
    if (toastTimeout !== null) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }

    if (toastElement && toastElement.parentNode) {
      toastElement.parentNode.removeChild(toastElement);
    }
    toastElement = null;
  }

  /**
   * Removes all injected UI (button + toast) and clears all timers.
   * Idempotent — safe to call multiple times.
   */
  function cleanup() {
    removeButton();
    removeToast();
  }

  return { showRestartButton, showToast, cleanup };
})();

console.log('[YTResume] uiInjector.js loaded');
