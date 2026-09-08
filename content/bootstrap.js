/**
 * Bootstrap Module
 *
 * Purpose: Entry point. Owns no logic of its own. Wires all
 * modules together and starts the system.
 */

(() => {
  // Phase 4 (F03/R21/R22) — a monotonically increasing generation token,
  // one per onVideoChange() call. Extends Phase 3's per-session storage
  // identity (progressTracker's sessionId) to the whole navigation
  // lifecycle: checked after every await, before any seek/save/arm/UI
  // action. A stale generation's late-resolving work (a delayed settings
  // read, a slow resume) can never take over from a newer navigation that
  // has already started, because equality against this shared counter is
  // race-free in single-threaded JS.
  let currentGeneration = 0;
  // F04/T4.4 — tracks the video element and duration seen at the START of
  // the previous navigation, so a reused element carrying over the exact
  // same (non-NaN) duration can be told apart from one whose metadata has
  // genuinely already refreshed for the new content.
  let lastVideoElement = null;
  let lastVideoDuration = null;

  /**
   * Orchestrates the initialization pipeline for a new video load.
   *
   * @param {string} videoId - The 11-character YouTube video ID
   */
  async function onVideoChange(videoId) {
    const generation = ++currentGeneration;
    const isCurrent = () => generation === currentGeneration;

    // 1. Teardown previous state — also settles any pending work still tied
    // to the previous generation (playerObserver.disconnect() now rejects
    // an in-flight waitForVideo() instead of leaving it unresolved, R12).
    progressTracker.stop();
    uiInjector.cleanup();
    playerObserver.disconnect();

    // 2. Context Check
    if (!youtubeUtils.isWatchPage()) {
      return; // Exit silently — tracking only applies to watch pages
    }

    // Settings are read once per navigation, here, and passed down — never
    // re-read inside progressTracker's 5-second interval (Roadmap 7.3). A
    // settings read failure (corrupt/missing/unreadable) must never block
    // resume (7.7) — fall back to defaults silently, warn only.
    let settings;
    try {
      settings = await storageManager.getSettings();
    } catch (err) {
      console.warn('[YTResume] Settings read failed, using defaults:', err.message);
      settings = storageManager.getDefaultSettings();
    }

    // R21 — a stale navigation's delayed settings read must never activate
    // as a newer, already-initialized navigation's tracker.
    if (!isCurrent()) return;

    try {
      // 3. Wait for reliable player state
      const video = await playerObserver.waitForVideo();

      // Identity/ownership check (F03 4.3) — confirm this generation is
      // still current AND the URL still names the video we were asked to
      // initialize for, before treating the resolved element as ready.
      if (!isCurrent() || youtubeUtils.getVideoId() !== videoId) return;

      // Guards for unsupported formats (safety nets, though isWatchPage
      // usually covers this, YouTube sometimes plays Shorts in standard player)
      if (youtubeUtils.isShorts() || youtubeUtils.isLive(video)) {
        return;
      }

      // F04/T4.4 — a reused element carrying over the exact same duration
      // it had when the PREVIOUS navigation started may still be showing
      // that previous content's metadata, even though it looks "valid"
      // (non-NaN). Recorded before this navigation's own resume runs.
      const forceMetadataRefresh = video === lastVideoElement &&
        Number.isFinite(video.duration) && video.duration === lastVideoDuration;
      lastVideoElement = video;
      lastVideoDuration = video.duration;

      // 4. Start Progress Tracking — disarmed (Roadmap 3.1). Event listeners
      // are live during the resume attempt below, but attemptSave() rejects
      // every write until arm() is called, so a resume-in-progress seek can
      // never be mistaken for a trackable position.
      progressTracker.start(video, videoId, settings);

      // D-107/F20/Phase 5 task 5.10 — an explicit, valid t= timestamp wins
      // outright for this navigation: automatic saved-position resume is
      // cancelled, and playback is tracked as a normal user-directed
      // session from the start. YouTube's own player performs the actual
      // timestamp seek; this extension's only job is to not fight it with
      // a competing saved-position seek, and to not withhold tracking.
      const timestampSeconds = youtubeUtils.getTimestampSeconds();
      if (timestampSeconds !== null) {
        debugLogger.log('bootstrap:timestampPrecedence', { videoId, timestampSeconds });
        if (isCurrent()) {
          progressTracker.markUserDirected();
          progressTracker.arm();
        }
        return;
      }

      // 5. Try Resume
      try {
        const saved = await storageManager.getProgress(videoId);
        if (!isCurrent()) return; // superseded while the storage read was in flight

        if (saved) {
          const result = await resumeManager.tryResume(video, saved, videoId, settings, isCurrent, forceMetadataRefresh);
          if (!isCurrent()) return;

          // Phase 5 (task 5.7/F05/R7) — a resume that did not reach a
          // verified success, and did not otherwise establish this as a
          // normal user-directed session (a genuine user seek cancelled
          // it, or the user overrode it during verification), leaves the
          // saved checkpoint at risk: ordinary playback from wherever the
          // video actually started would otherwise look like unremarkable
          // forward progress and silently overwrite it on the first
          // interval save. Protect it instead of arming blind.
          const userDirected = result.status === resumeManager.OUTCOME.USER_OVERRIDDEN ||
            (result.status === resumeManager.OUTCOME.CANCELLED && result.reason === 'user-seek');
          const established = result.status === resumeManager.OUTCOME.VERIFIED || userDirected;
          if (userDirected) {
            // Explicit, not left to the native 'seeked' event alone — the
            // freshness check (Phase 3) needs to know this session is
            // authoritative even if that event's own handler hasn't run yet.
            progressTracker.markUserDirected();
          } else if (!established) {
            progressTracker.protectCheckpoint(saved.time);
          }
        }
      } catch(err) {
        // Log but do not crash — resume failure shouldn't kill tracking
        console.warn('[YTResume] Resume pipeline failed:', err.message);
      } finally {
        // Roadmap 3.2, extended by R22 — arms once THIS generation's resume
        // lifecycle has resolved (success or verified give-up), and only if
        // this generation is still the current one. A's completion must
        // never arm B's tracker while B's own resume is still pending.
        // Phase 5 task 5.7 — arming itself stays unconditional here
        // (tracking must keep working even after a failed resume, per
        // CLAUDE.md's graceful-degradation rule); what changed is that a
        // non-established outcome now protects the checkpoint first (above)
        // instead of arming blind into an unconditional overwrite risk.
        if (isCurrent()) progressTracker.arm();
      }

    } catch(err) {
      console.warn('[YTResume] Player initialization failed:', err.message);
    }
  }

  /**
   * Initializes the extension. Self-executing on inject.
   */
  function init() {
    // navigationManager owns the single 1000ms interval (D-059); its tick
    // also drives progressTracker's 5s save cadence, so only one setInterval
    // is ever alive.
    navigationManager.start(onVideoChange, () => progressTracker.tick());
  }

  init();
})();
