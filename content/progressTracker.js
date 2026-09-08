/**
 * ProgressTracker Module
 *
 * Purpose: Track playback progress continuously and save it
 * to storage on defined triggers.
 *
 * Public API:
 *   progressTracker.start(video, videoId, settings) → void
 *   progressTracker.stop()                          → void
 *   progressTracker.tick()                          → void
 *   progressTracker.arm()                           → void
 *   progressTracker.notifyExternalReset()           → void
 */

const progressTracker = (() => {
  // No setInterval of its own (D-059) — navigationManager already runs a
  // permanent 1000ms poll for the life of the content script; tick() rides
  // on that instead of a second concurrent interval. ticksSinceSave counts
  // to 5 to preserve the original 5000ms save cadence exactly.
  let ticksSinceSave = 0;
  // committedTime: the position actually confirmed saved (a successful
  // write acknowledgement), never advanced optimistically before that
  // (Roadmap 3.5 — closes R24). Seeded from the starting position in
  // start() purely to avoid an immediate redundant save of the resume
  // target itself; see `dirty` below for why that seed alone doesn't
  // suppress a real retry.
  let committedTime = 0;
  // dirty: true whenever a write has been judged necessary but not yet
  // confirmed committed (Roadmap 3.5/3.6 — "dirty sample for bounded
  // retry"). Sends every event-triggered save through untouched
  // (bypassDelta already exempts those); its job is to stop the
  // interval-trigger delta guard from mistaking "position unchanged since
  // the last *attempt*" for "position already saved" when that attempt
  // never actually succeeded.
  let dirty = false;
  // lastAttemptedTime: updated synchronously the instant any write is
  // *issued* (unlike committedTime, which waits for its ack). This is the
  // baseline the backward-jump guard below compares against — a real
  // rewind's own 'seeked'-triggered save must exempt the very next
  // interval tick from looking like a spurious drop even if that seeked
  // save's ack hasn't landed yet (pre-existing design intent; ack-gating
  // committedTime for the retry/delta-guard fix, Roadmap 3.5, must not
  // regress this).
  let lastAttemptedTime = 0;
  // writeSeq/lastAckedSeq: local per-session ordering for save attempts.
  // A resolving write only updates committedTime if its own seq is still
  // the newest one acknowledged so far — an out-of-order (stale, slower)
  // ack can never regress state a faster later write already committed
  // (Roadmap 3.6/T3.5).
  let writeSeq = 0;
  let lastAckedSeq = 0;
  // Per-playback-session identity (Roadmap 3.1) — the storage-ownership
  // half of the generation/session concept Phase 4 extends to the full
  // navigation lifecycle. Regenerated on every start().
  let sessionId = null;
  // lastActiveAt: wall-clock ms of this session's last *meaningfully
  // active* moment — genuine playback progressing, an explicit seek, or
  // playback reaching its end (Roadmap 3.2). Deliberately NOT updated by
  // a mere lifecycle event (pause/visibilitychange/pagehide) — those are
  // exactly the events F07 found could clobber a fresher checkpoint from
  // another, actually-active tab. The writer compares this against the
  // stored entry's own `updated` timestamp (storageWriter.js) to decide
  // whether this session is stale.
  let lastActiveAt = 0;
  // hasUserSeek: true once this session has produced a real 'seeked'
  // event. Sent with every save from this session as the freshness
  // check's explicit-override flag (Roadmap 3.3) — a session that has
  // shown genuine user intent can keep saving through subsequent passive
  // lifecycle events, not just through continued playback.
  let hasUserSeek = false;
  let activeVideo = null;
  let activeVideoId = null;
  let minWatchSeconds = 30; // read once per navigation in start() (Roadmap 7.3)
  // Disarmed on every start() (Roadmap 3.1) — no write (interval or event) is
  // accepted until arm() is called once bootstrap.js's resume lifecycle for
  // this video has resolved (Roadmap 3.2).
  let armed = false;
  // Tier 2 pick (Roadmap 3.6) — a backward jump larger than this on an
  // interval-triggered save is treated as a spurious read (defect C), not a
  // real seek. Real backward seeks are exempt structurally: their own
  // 'seeked'-triggered save already updates lastAttemptedTime to the new
  // position before the next interval tick runs, so no separate "recent
  // seek" flag is needed.
  const BACKWARD_JUMP_THRESHOLD_S = 30;

  // Bound handler references for proper removal
  let handlePause = null;
  let handleSeeked = null;
  let handleEnded = null;
  let handleVisibility = null;
  let handlePagehide = null;

  /**
   * Core save logic with guards.
   * Skips save if: ad playing, live stream, invalid position, or
   * (interval trigger only) delta < 5.
   *
   * @param {boolean} bypassDelta - If true, skip the delta guard.
   *   Only the interval trigger passes false (D-024); every event
   *   trigger (pause/seeked/ended/visibilitychange/pagehide) saves
   *   unconditionally.
   */
  function attemptSave(bypassDelta, trigger) {
    // Phase 0 (v3) diagnostic — logged on every call, before any guard can
    // return early, per Roadmap v3 0.3 (videoId, trigger, position-to-write).
    debugLogger.log('attemptSave:entry', {
      videoId: activeVideoId,
      trigger,
      currentTime: activeVideo ? activeVideo.currentTime : null,
    });

    if (!activeVideo || !activeVideoId) return;
    if (!armed) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'disarmed' });
      return; // Roadmap 3.1 — no write until the resume lifecycle has resolved
    }
    if (playerObserver.isAdPlaying()) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'adPlaying' });
      return;
    }
    if (activeVideo.duration === Infinity) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'liveStream' });
      return; // live stream guard
    }

    const current = Math.floor(activeVideo.currentTime);
    const duration = Math.floor(activeVideo.duration);

    if (Number.isNaN(current) || current < 0 || Number.isNaN(duration) || current > duration) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'invalidPosition', current, duration });
      return; // invalid position guard
    }

    if (!timeUtils.meetsMinimumWatched(current, minWatchSeconds)) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'belowMinWatch', current, minWatchSeconds });
      return; // Roadmap 7.5 — no storage entry for a video watched less than this
    }

    // Roadmap 3.6 — regression guard: an interval-triggered save landing far
    // below the last known-good position is treated as a spurious read
    // (defect C's mechanism, Phase 0 finding 0.8) and rejected outright.
    // Interval-only: every event trigger (seeked/pause/ended/visibility/
    // pagehide) represents observed user intent or a session boundary and is
    // exempt by construction (D-024's bypassDelta=true already marks them).
    if (!bypassDelta && (lastAttemptedTime - current) > BACKWARD_JUMP_THRESHOLD_S) {
      debugLogger.log('attemptSave:skipped', {
        videoId: activeVideoId, trigger, reason: 'backwardJumpRejected', current, lastAttemptedTime,
      });
      return;
    }

    // Delta guard — interval trigger only (D-024) — but only while the
    // last write we believe matches `current` is actually confirmed
    // committed. `dirty` stays true across a failed/unacknowledged
    // attempt, so an unchanged position at the same value we already
    // *tried* (but never confirmed) to save still retries here instead of
    // looking like "nothing changed" (Roadmap 3.5/3.6 — closes R24).
    const deltaBlocked = !bypassDelta && !dirty && Math.abs(current - committedTime) < 5;
    debugLogger.log('attemptSave', {
      videoId: activeVideoId,
      trigger,
      bypassDelta: !!bypassDelta,
      deltaBlocked,
      current,
      committedTime,
      dirty,
    });
    if (deltaBlocked) return;

    dirty = true;
    lastAttemptedTime = current;
    const seq = ++writeSeq;
    const title = youtubeUtils.getTitle();
    const channel = youtubeUtils.getChannelName();
    storageManager.saveProgress(activeVideoId, current, duration, title, channel, {
      sessionId,
      lastActiveAt,
      explicitUserSeek: hasUserSeek,
      trigger,
    }).then(() => {
      // Out-of-order ack guard (Roadmap 3.6/T3.5): a slower earlier write
      // resolving after a faster later one must not regress state the
      // later write already committed.
      if (seq <= lastAckedSeq) return;
      lastAckedSeq = seq;
      committedTime = current;
      // Only clear dirty if nothing newer has been attempted since this
      // write was issued — a still-in-flight or not-yet-issued newer
      // attempt keeps the sample dirty for its own eventual ack.
      if (seq === writeSeq) dirty = false;
    }).catch(err => console.warn('[YTResume] Save failed:', err.message));
  }

  /**
   * Marks this session as meaningfully active right now (Roadmap 3.2) —
   * called only from genuine playback progress, an explicit user seek, or
   * playback reaching its end. Never called from a passive lifecycle event
   * (pause/visibility/pagehide) — see `lastActiveAt` above.
   */
  function recordActivity() {
    lastActiveAt = Date.now();
  }

  /**
   * Initializes interval-based and event-based progress tracking
   * for the given video element and videoId.
   *
   * @param {Settings} settings - read once per navigation by bootstrap.js
   *   (Roadmap 7.3); never re-read inside the interval below.
   */
  function start(video, videoId, settings = {}) {
    // Safety: stop any existing tracking first
    stop();

    activeVideo = video;
    activeVideoId = videoId;
    minWatchSeconds = settings.minWatchSeconds ?? 30;
    committedTime = Math.floor(video.currentTime);
    lastAttemptedTime = committedTime;
    dirty = false;
    writeSeq = 0;
    lastAckedSeq = 0;
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    hasUserSeek = false;
    lastActiveAt = Date.now(); // Roadmap 3.2 — a fresh session starts "active"
    ticksSinceSave = 0;
    armed = false; // Roadmap 3.1 — disarmed on every load; bootstrap.js calls arm() once the resume lifecycle resolves

    // Event-based triggers — all save unconditionally (D-024)
    handlePause = () => attemptSave(true, 'pause');
    handleSeeked = () => { hasUserSeek = true; recordActivity(); attemptSave(true, 'seeked'); };
    handleEnded = () => { recordActivity(); attemptSave(true, 'ended'); };
    handleVisibility = () => {
      if (document.hidden) attemptSave(true, 'visibility');
    };
    // pagehide, not beforeunload (D-025) — best-effort, chrome.storage.local
    // cannot save synchronously during teardown.
    handlePagehide = () => attemptSave(true, 'pagehide');

    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ended', handleEnded);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePagehide);
  }

  /**
   * Advances the tick counter by one 1000ms beat (driven by
   * navigationManager's poll interval, D-059) and fires attemptSave every
   * 5th tick — a no-op when tracking isn't active.
   */
  function tick() {
    if (!activeVideo || !activeVideoId) return;
    // Genuine playback progressing is "meaningfully active" (Roadmap 3.2);
    // a paused video ticking along in the background is not — that's
    // exactly the passive case F07 protects a fresher checkpoint from.
    if (!activeVideo.paused) recordActivity();
    ticksSinceSave += 1;
    if (ticksSinceSave >= 5) {
      ticksSinceSave = 0;
      attemptSave(false, 'interval');
    }
  }

  /**
   * Arms tracking, allowing attemptSave() to actually write. Called by
   * bootstrap.js once the resume lifecycle for the current video has
   * resolved — a completed tryResume() (success or verified give-up) or,
   * for a fresh video with no saved entry, immediately (Roadmap 3.2).
   */
  function arm() {
    armed = true;
    debugLogger.log('progressTracker:armed', { videoId: activeVideoId });
  }

  /**
   * Called by uiInjector's Restart control immediately after it forces
   * video.currentTime to 0 directly. Resets the backward-jump guard's
   * baseline to 0 so replaying past minWatchSeconds afterward isn't
   * mistaken for a spurious near-zero overwrite (Roadmap 3.6) — an
   * explicit exemption for this specific path, not a reliance on whatever
   * native 'seeked' behavior a programmatic currentTime assignment does or
   * doesn't trigger.
   */
  function notifyExternalReset() {
    committedTime = 0;
    lastAttemptedTime = 0;
    dirty = false;
    hasUserSeek = true; // an explicit user-driven action, same spirit as a real seek
    recordActivity();
    debugLogger.log('progressTracker:externalReset', { videoId: activeVideoId });
  }

  /**
   * Removes all event listeners and resets internal state. Idempotent —
   * safe to call multiple times or before start().
   */
  function stop() {
    ticksSinceSave = 0;
    armed = false;

    if (activeVideo) {
      if (handlePause) activeVideo.removeEventListener('pause', handlePause);
      if (handleSeeked) activeVideo.removeEventListener('seeked', handleSeeked);
      if (handleEnded) activeVideo.removeEventListener('ended', handleEnded);
    }
    if (handleVisibility) document.removeEventListener('visibilitychange', handleVisibility);
    if (handlePagehide) window.removeEventListener('pagehide', handlePagehide);

    handlePause = null;
    handleSeeked = null;
    handleEnded = null;
    handleVisibility = null;
    handlePagehide = null;

    activeVideo = null;
    activeVideoId = null;
    committedTime = 0;
    lastAttemptedTime = 0;
    dirty = false;
    writeSeq = 0;
    lastAckedSeq = 0;
    sessionId = null;
    hasUserSeek = false;
    lastActiveAt = 0;
    minWatchSeconds = 30;
  }

  return { start, stop, tick, arm, notifyExternalReset };
})();


