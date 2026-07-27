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

    // Styling — measured against live YouTube DOM (docs/YT_DOM_AUDIT.md, D-046).
    // Font/color match .ytp-time-display exactly. No native inline text button exists
    // to copy for the pill treatment, so the fill borrows the measured .ytp-menuitem
    // hover intensity and the radius is derived from the 40px control-row height.
    // alignSelf: 'center' is required — .ytp-left-controls is a flex row with
    // align-items: normal (stretch), and a fixed-height child without it collapses
    // to flex-start, sitting flush against the progress bar instead of centered
    // like the native 40px-tall buttons (D-047).
    const REST_BG = 'rgba(255, 255, 255, 0.1)';
    const HOVER_BG = 'rgba(255, 255, 255, 0.2)';
    Object.assign(button.style, {
      background:     REST_BG,
      border:         'none',
      borderRadius:   '20px',
      color:          '#eeeeee',
      fontSize:       '14px',
      fontFamily:     '"YouTube Noto", Roboto, Arial, Helvetica, sans-serif',
      fontWeight:     '500',
      cursor:         'pointer',
      padding:        '0 12px',
      height:         '40px',
      lineHeight:     '40px',
      display:        'inline-block',
      boxSizing:      'border-box',
      verticalAlign:  'middle',
      letterSpacing:  'normal',
      alignSelf:      'center',
      transition:     'background-color 0.1s cubic-bezier(0, 0, 0.2, 1)',
    });

    // Hover behavior
    button.addEventListener('mouseover', () => { button.style.background = HOVER_BG; });
    button.addEventListener('mouseout',  () => { button.style.background = REST_BG; });

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

    // Styling — measured against live YouTube DOM (docs/YT_DOM_AUDIT.md, D-046).
    // Background/radius match the measured .ytp-settings-menu overlay-chip treatment.
    Object.assign(toast.style, {
      background:     'rgba(0, 0, 0, 0.6)',
      color:          '#eeeeee',
      fontFamily:     '"YouTube Noto", Roboto, Arial, Helvetica, sans-serif',
      fontSize:       '13px',
      fontWeight:     '500',
      padding:        '8px 14px',
      borderRadius:   '12px',
      position:       'absolute',
      left:           '16px',
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

    // Derive the vertical offset from the measured control-bar height (D-028) instead
    // of a hard-coded value — this self-corrects if YouTube resizes the control bar,
    // and holds across default/theater since the bar's height doesn't change with them.
    const CONTROL_BAR_CLEARANCE_PX = 12;
    const chromeBottom = player.querySelector('.ytp-chrome-bottom');
    const controlBarHeight = chromeBottom ? chromeBottom.getBoundingClientRect().height : 59;
    toast.style.bottom = `${controlBarHeight + CONTROL_BAR_CLEARANCE_PX}px`;

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


