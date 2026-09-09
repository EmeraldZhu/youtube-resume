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
 *   progressTracker.protectCheckpoint(time)         → void
 *   progressTracker.markUserDirected()              → void
 *   progressTracker.notifyExternalReset()           → void
 */

const progressTracker = (() => {
  // No setInterval of its own (D-059) — navigationManager already runs a
  // permanent 1000ms poll for the life of the content script; tick() rides
  // on that instead of a second concurrent interval.
  // ticksSinceSave counts to 5 to preserve the original 5000ms save cadence
  // under ordinary operation, where each tick genuinely represents ~1000ms
  // of real elapsed time. Phase 6 (6.6) adds lastSaveCheckAt/SAVE_INTERVAL_MS
  // as an ADDITIONAL, wall-clock-measured early trigger alongside it (see
  // tick() below) — a suspended/throttled background tab can call tick()
  // far less often than once per second, so waiting on the count alone
  // would silently stretch the cadence to many multiples of 5s; measuring
  // real elapsed time catches that case without changing behavior for the
  // ordinary one (or for tests that drive tick() manually without
  // advancing the clock in between — the count condition still fires
  // exactly as before there).
  let ticksSinceSave = 0;
  const SAVE_INTERVAL_MS = 5000;
  let lastSaveCheckAt = 0;
  // Phase 6 (6.5) — the most recent settled (not mid-seek), non-ad, valid
  // sample observed for the CURRENT session, tied to activeVideoId. Kept
  // fresh opportunistically (tick, and after seeked/pause/ended) so
  // flushBeforeTeardown() below always has a genuinely good position to
  // fall back on even if the video happens to be mid-seek at the exact
  // moment teardown runs (R10/6.7 — a pending seek is never persisted as
  // "completed").
  let lastGoodSample = null;
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
  // Roadmap 7.1/D-104 — true from a 'seeked' event that landed within
  // LEGACY_COMPLETION_TOLERANCE_S of the end, until either the next
  // 'seeked' event recomputes it or a real 'ended' event consumes it. Lets
  // handleEnded (below) distinguish a genuine playthrough finish from a
  // seek-to-end: the schema's `ended` field is only ever set true for the
  // former ("a real ended event, not a seek-to-end" — Roadmap 7.1).
  let pendingSeekToEnd = false;
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
  // Phase 5 (task 5.4/F05/R8) — how recent a keydown/pointerdown/mousedown
  // must be for a 'seeked' event to count as corroborated user intent,
  // exempting it from the backward-jump guard. Wider than resumeManager's
  // 800ms window (F08's native-vs-user distinction during a short 400ms
  // delay) since a real scrubber drag can take a couple of seconds from
  // first touch to the eventual 'seeked' event.
  const SEEK_CORROBORATION_WINDOW_MS = 2000;

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
   * @param {boolean} [bypassBackwardJumpGuard=bypassDelta] - If true, skip
   *   the backward-jump guard too. Defaults to bypassDelta (preserving the
   *   original one-flag behavior for pause/ended/visibility/pagehide — a
   *   passive lifecycle event, never a seek). The 'seeked' call site passes
   *   this explicitly false (Phase 5, F05/R8): a native jump immediately
   *   followed by a synthetic 'seeked' must still be caught by the
   *   backward-jump guard, not waved through just because it's an event
   *   trigger.
   * @param {boolean} [markEnded=false] - Roadmap 7.1/D-104: true only from
   *   handleEnded when this 'ended' event represents a genuine playthrough
   *   finish, not a seek-to-end. Forwarded to storageManager.saveProgress
   *   as ownership.ended; the writer sets the schema's `ended` field
   *   (sticky) only when this is true.
   * @returns {{ok: boolean, reason?: string}}
   */
  function attemptSave(bypassDelta, trigger, bypassBackwardJumpGuard = bypassDelta, markEnded = false) {
    // Phase 0 (v3) diagnostic — logged on every call, before any guard can
    // return early, per Roadmap v3 0.3 (videoId, trigger, position-to-write).
    debugLogger.log('attemptSave:entry', {
      videoId: activeVideoId,
      trigger,
      currentTime: activeVideo ? activeVideo.currentTime : null,
    });

    if (!activeVideo || !activeVideoId) return { ok: false, reason: 'noActiveVideo' };
    if (!armed) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'disarmed' });
      return { ok: false, reason: 'disarmed' }; // Roadmap 3.1 — no write until the resume lifecycle has resolved
    }
    // Phase 6 (6.7) — a pending/in-flight seek is never persisted as a
    // completed playback position, regardless of trigger: currentTime reads
    // as numerically anything mid-seek, so a save landing exactly then would
    // record a position that was never actually watched.
    if (activeVideo.seeking) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'seekInFlight' });
      return { ok: false, reason: 'seekInFlight' };
    }
    if (playerObserver.isAdPlaying()) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'adPlaying' });
      return { ok: false, reason: 'adPlaying' };
    }
    if (activeVideo.duration === Infinity) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'liveStream' });
      return { ok: false, reason: 'liveStream' }; // live stream guard
    }

    const current = Math.floor(activeVideo.currentTime);
    const duration = Math.floor(activeVideo.duration);

    if (Number.isNaN(current) || current < 0 || Number.isNaN(duration) || current > duration) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'invalidPosition', current, duration });
      return { ok: false, reason: 'invalidPosition' }; // invalid position guard
    }

    if (!timeUtils.meetsMinimumWatched(current, minWatchSeconds)) {
      debugLogger.log('attemptSave:skipped', { videoId: activeVideoId, trigger, reason: 'belowMinWatch', current, minWatchSeconds });
      return { ok: false, reason: 'belowMinWatch' }; // Roadmap 7.5 — no storage entry for a video watched less than this
    }

    // Roadmap 3.6 — regression guard: a save landing far below the last
    // known-good position is treated as a spurious read (defect C's
    // mechanism, Phase 0 finding 0.8) and rejected outright. Interval saves
    // are never exempt; event triggers are exempt only when
    // bypassBackwardJumpGuard is true — pause/ended/visibility/pagehide
    // represent a session boundary, not a position claim, but 'seeked'
    // (Phase 5/F05/R8) is a position claim and stays subject to this guard
    // unless corroborated elsewhere.
    if (!bypassBackwardJumpGuard && (lastAttemptedTime - current) > BACKWARD_JUMP_THRESHOLD_S) {
      debugLogger.log('attemptSave:skipped', {
        videoId: activeVideoId, trigger, reason: 'backwardJumpRejected', current, lastAttemptedTime,
      });
      return { ok: false, reason: 'backwardJumpRejected' };
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
    if (deltaBlocked) return { ok: false, reason: 'deltaBlocked' };

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
      ended: markEnded,
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

    return { ok: true };
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
   * Phase 6 (6.5) — records the current position as `lastGoodSample`
   * whenever it's genuinely trustworthy: not mid-seek, not an ad, and a
   * valid (non-NaN, in-bounds) position. Cheap, called opportunistically
   * from tick() and the seeked/pause/ended handlers — never from a save
   * attempt itself, so it stays independent of the delta/backward-jump
   * guards below (this is a raw "last known-good" cache, not a save log).
   */
  function captureGoodSampleIfClean() {
    if (!activeVideo || !activeVideoId) return;
    if (activeVideo.seeking) return;
    if (playerObserver.isAdPlaying()) return;
    const current = Math.floor(activeVideo.currentTime);
    const duration = Math.floor(activeVideo.duration);
    if (Number.isNaN(current) || current < 0 || Number.isNaN(duration) || current > duration) return;
    lastGoodSample = { time: current, duration };
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
    lastSaveCheckAt = Date.now();
    lastGoodSample = null;
    pendingSeekToEnd = false;
    armed = false; // Roadmap 3.1 — disarmed on every load; bootstrap.js calls arm() once the resume lifecycle resolves

    // Event-based triggers — all save unconditionally (D-024)
    handlePause = () => attemptSave(true, 'pause');
    handleSeeked = () => {
      hasUserSeek = true;
      recordActivity();
      const current = Math.floor(video.currentTime);
      // Phase 5 (task 5.4/5.8/F05/R8) — a 'seeked' event corroborated by
      // recent keyboard/pointer input (a real scrubber drag or arrow-key
      // seek) is genuine user intent and stays exempt from the backward-
      // jump guard, same as before (CLAUDE.md: deliberate rewind must keep
      // working even to a position well above minWatchSeconds — a large,
      // real rewind is common and legitimate). An UNcorroborated 'seeked'
      // (a native jump with no input behind it) no longer gets that
      // exemption for free — it's now subject to the same guard an
      // interval save would face.
      const corroborated = userIntent.wasRecentInput(SEEK_CORROBORATION_WINDOW_MS);
      const result = attemptSave(true, 'seeked', corroborated);
      // Phase 5 (task 5.5/F08/R9) — reset the backward-jump guard's baseline
      // to the new position on every seeked event, EVEN when the save
      // itself was rejected (e.g. below minWatchSeconds) — otherwise a
      // deliberate rewind leaves a stale high baseline that rejects the
      // next legitimate interval save once playback crosses the threshold
      // again. The one exception is an UNcorroborated 'backwardJumpRejected'
      // result (Phase 5/F05/R8): that means this looked like unattributed
      // native interference, not a deliberate seek, so the baseline must
      // stay put to keep protecting against a follow-up low-position
      // interval save.
      if (corroborated || result.reason !== 'backwardJumpRejected') {
        lastAttemptedTime = current;
      }
      // Roadmap 7.1/D-104 — a seek landing at (or within tolerance of) the
      // end means any 'ended' event that follows is a seek-to-end, not a
      // genuine playthrough finish; recomputed on every seek so a seek away
      // from the end afterward correctly clears it.
      const seekDuration = Math.floor(video.duration);
      pendingSeekToEnd = Number.isFinite(seekDuration) && seekDuration > 0
        && (seekDuration - current) <= storageValidation.LEGACY_COMPLETION_TOLERANCE_S;
      captureGoodSampleIfClean();
    };
    handleEnded = () => {
      recordActivity();
      // Consumed here, not left for the next seek to clear — a later
      // genuine finish (e.g. a replay) must not be suppressed by a
      // seek-to-end from earlier in the session.
      const genuineCompletion = !pendingSeekToEnd;
      pendingSeekToEnd = false;
      attemptSave(true, 'ended', true, genuineCompletion);
      captureGoodSampleIfClean();
    };
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
   * Advances the tick counter by one beat (driven by navigationManager's
   * poll interval, D-059) — a no-op when tracking isn't active. Fires
   * attemptSave on the 5th tick (the ordinary cadence), OR as soon as
   * SAVE_INTERVAL_MS of real wall-clock time has elapsed since the last
   * save check, whichever comes first (Phase 6/6.6) — the wall-clock arm
   * only ever fires first when tick() itself has been called unusually
   * infrequently relative to real time (a suspended/throttled background
   * tab), which is exactly the case a pure tick count can't detect.
   */
  function tick() {
    if (!activeVideo || !activeVideoId) return;
    // Genuine playback progressing is "meaningfully active" (Roadmap 3.2);
    // a paused video ticking along in the background is not — that's
    // exactly the passive case F07 protects a fresher checkpoint from.
    if (!activeVideo.paused) recordActivity();
    captureGoodSampleIfClean();
    ticksSinceSave += 1;
    if (ticksSinceSave >= 5 || (Date.now() - lastSaveCheckAt) >= SAVE_INTERVAL_MS) {
      ticksSinceSave = 0;
      lastSaveCheckAt = Date.now();
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
   * Phase 5 (task 5.7/F05/R7) — seeds the backward-jump guard's baseline
   * (and the delta guard's committedTime) to a known checkpoint instead of
   * the actual (low) playback position start() captured. Called by
   * bootstrap.js between start() and arm() whenever a resume attempt did
   * not reach a verified, established outcome for an existing saved
   * checkpoint — protects that checkpoint through a pending/recoverable
   * failure: an ordinary interval save at the real (low) startup position
   * now reads as a large backward jump against the protected baseline and
   * is rejected, instead of silently overwriting a much higher stored
   * value. Released the normal way once playback genuinely catches up past
   * the checkpoint, or by a real user-directed seek (notifyExternalReset,
   * or a corroborated 'seeked').
   */
  function protectCheckpoint(time) {
    const t = Math.floor(time);
    committedTime = t;
    lastAttemptedTime = t;
    debugLogger.log('progressTracker:checkpointProtected', { videoId: activeVideoId, time: t });
  }

  /**
   * Phase 5 (task 5.10/F20) — marks this session as explicitly user-
   * directed without touching the position baselines protectCheckpoint
   * seeds or resetting them the way notifyExternalReset does. Called by
   * bootstrap.js for a t= timestamp navigation: there is no native
   * 'seeked' DOM event to set hasUserSeek the normal way (the video simply
   * starts at that position — nothing was seeked away from), but
   * storageManager's write-ownership/freshness check (Phase 3) still needs
   * `explicitUserSeek: true` to treat this session's saves as
   * authoritative rather than stale against an older stored `updated`.
   */
  function markUserDirected() {
    hasUserSeek = true;
    recordActivity();
    debugLogger.log('progressTracker:markedUserDirected', { videoId: activeVideoId });
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
   * Phase 6 (6.5/R10) — flushes a last-known-good sample synchronously as
   * the very first step of stop(), before any state is cleared or the
   * caller moves on to (possibly) tearing down/replacing the video element.
   * This is what "before navigation teardown, instead of reading a
   * possibly-repurposed element afterward" means in practice: the flush
   * happens here, now, using state this closure still owns, rather than
   * some later async callback that might run after a new video has already
   * taken this element's place.
   *
   * If the video is currently mid-seek (a pending seek at the exact moment
   * of teardown), its live position is not trustworthy (6.7) — fall back to
   * `lastGoodSample` instead of skipping the flush entirely.
   */
  function flushBeforeTeardown() {
    if (!activeVideo || !activeVideoId || !armed) return;
    if (!activeVideo.seeking) {
      attemptSave(true, 'teardown-flush', true);
      return;
    }
    if (lastGoodSample && timeUtils.meetsMinimumWatched(lastGoodSample.time, minWatchSeconds)) {
      const title = youtubeUtils.getTitle();
      const channel = youtubeUtils.getChannelName();
      storageManager.saveProgress(activeVideoId, lastGoodSample.time, lastGoodSample.duration, title, channel, {
        sessionId,
        lastActiveAt,
        explicitUserSeek: hasUserSeek,
        trigger: 'teardown-flush-fallback',
      }).catch(err => console.warn('[YTResume] Teardown flush failed:', err.message));
    }
  }

  /**
   * Removes all event listeners and resets internal state. Idempotent —
   * safe to call multiple times or before start().
   */
  function stop() {
    flushBeforeTeardown();
    armed = false;
    ticksSinceSave = 0;

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
    lastSaveCheckAt = 0;
    lastGoodSample = null;
    pendingSeekToEnd = false;
    minWatchSeconds = 30;
  }

  return { start, stop, tick, arm, protectCheckpoint, markUserDirected, notifyExternalReset };
})();


