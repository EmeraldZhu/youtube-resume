/**
 * StorageManager Module
 *
 * Purpose: Typed abstraction over chrome.storage.local. Reads happen
 * directly here (no round trip); every mutation is sent as a command to
 * background/storageWriter.js, the sole writer (v4 Phase 2, D-102) — this
 * module never calls chrome.storage.local.set/remove itself.
 *
 * Public API (unchanged since v3.0.0 — every mutating function keeps its
 * exact signature and Promise contract; callers need no code change):
 *   storageManager.getProgress(videoId)    → Promise<VideoProgress | null>
 *   storageManager.getAllProgress()        → Promise<Record<string, VideoProgress>>
 *   storageManager.saveProgress(videoId, time, duration, title?, channel?) → Promise<void>
 *     (rejects if videoId is not a plausible YouTube video ID shape)
 *   storageManager.deleteProgress(videoId) → Promise<void>
 *   storageManager.clearAllProgress()      → Promise<void>
 *   storageManager.pinProgress(videoId)    → Promise<void>
 *     (rejects if no entry exists, or the 20-pin cap is already reached — never auto-unpins)
 *   storageManager.unpinProgress(videoId)  → Promise<void>
 *   storageManager.removeCompleted(includePinned?) → Promise<{removedCount, removedIds}>
 *     (v4 Phase 7 — one coordinated batch mutation; the writer re-derives the
 *     matching set itself at commit time via storageValidation.isCompleteEntry,
 *     never trusting a client-supplied id list)
 *   storageManager.getSettings()           → Promise<Settings>
 *   storageManager.saveSettings(partial)   → Promise<Settings>
 *   storageManager.resetSettings()         → Promise<Settings>
 *   storageManager.getDefaultSettings()    → Settings (sync, no storage access)
 *
 * Types:
 *   VideoProgress = { time: number, duration: number, updated: number, title?: string, channel?: string, pinned?: boolean, ended?: boolean }
 *
 * Storage shape (schema v4) — see storage/storageValidation.js for the
 * shared constants/validation/repair logic this module and
 * background/storageWriter.js both use:
 *   {
 *     youtubeResume: { [videoId]: VideoProgress },
 *     youtubeResumeSettings: Settings,
 *     youtubeResumeSchema: 4,
 *     youtubeResumeQuarantine: { entries: { [rawKey]: QuarantineEntry }, repairLog: RepairLogEntry[] }
 *   }
 *
 * youtubeResumeSchema and youtubeResumeSettings are separate root keys,
 * never nested inside youtubeResume — its keys are counted for the
 * 200-entry eviction cap (D-013). Pinned entries are exempt from that cap.
 * youtubeResumeQuarantine (v4 Phase 1, D-127) is a fourth, additive root
 * key holding data the repair pass could not safely resolve; never read by
 * any resume/tracking/popup code path and never auto-emptied.
 */

const storageManager = (() => {
  const {
    STORAGE_KEY,
    SETTINGS_KEY,
    isPlainObject,
    sanitizeEntry,
    sanitizeSettingsValue,
    DEFAULT_SETTINGS,
  } = storageValidation;

  /**
   * chrome.storage is undefined when this content-script instance is a stale
   * one left running after the extension was reloaded (a dev-only Load-
   * Unpacked artifact — a real install never invalidates an already-injected
   * tab's context). Callers already end their promise chain in .catch(), so
   * this just makes the resulting warning diagnosable instead of a bare
   * TypeError.
   */
  function assertStorageAvailable() {
    if (!chrome?.storage?.local) {
      throw new Error('chrome.storage unavailable — extension context invalidated, reload the page');
    }
  }

  /** Same diagnosability guard as assertStorageAvailable(), for the messaging path every mutation now uses. */
  function assertRuntimeAvailable() {
    if (!chrome?.runtime?.connect) {
      throw new Error('chrome.runtime unavailable — extension context invalidated, reload the page');
    }
  }

  // ---------------------------------------------------------------------
  // Messaging client (v4 Phase 2, D-102). A long-lived port to
  // background/storageWriter.js, re-created lazily whenever it's missing
  // (first use, or after the worker terminated and dropped the previous
  // one). Requests are correlated by an incrementing id so responses can
  // arrive in any order.
  // ---------------------------------------------------------------------
  const PORT_NAME = 'storageWriter';
  // Bounded retry schedule for a command whose port disconnected before a
  // response arrived (the worker was terminated mid-flight and is
  // respawning) — three attempts, short and increasing. Every command is
  // idempotent (2.2), so resending after an unknown outcome is always safe;
  // an application-level rejection (the worker responded, just refusing the
  // request) is never retried here — see sendCommand().
  const RETRY_DELAYS_MS = [100, 300, 900]; // Tier 2 value pick (v4 Phase 2)

  let port = null;
  let nextRequestId = 1;
  const pending = new Map(); // requestId -> { resolve, reject }

  function getPort() {
    if (port) return port;
    port = chrome.runtime.connect({ name: PORT_NAME });
    port.onMessage.addListener((msg) => {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.ok) waiter.resolve(msg.result);
      else waiter.reject(new Error(msg.error));
    });
    port.onDisconnect.addListener(() => {
      port = null;
      // Every request still awaiting a response never got one — reject so
      // sendCommand()'s retry loop can reconnect and resend.
      for (const [id, waiter] of pending) {
        pending.delete(id);
        const err = new Error('storageWriter port disconnected before responding');
        err.transient = true;
        waiter.reject(err);
      }
    });
    return port;
  }

  function sendOnce(command, payload) {
    return new Promise((resolve, reject) => {
      const id = nextRequestId++;
      pending.set(id, { resolve, reject });
      try {
        getPort().postMessage({ id, command, payload });
      } catch (err) {
        pending.delete(id);
        err.transient = true;
        reject(err);
      }
    });
  }

  function delay(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  /**
   * Sends a mutation command to storageWriter, retrying with bounded
   * backoff only on a transient (transport-level) failure — a disconnected
   * port, or a postMessage that threw because the port was already dead.
   * An application-level rejection (e.g. the pin cap was reached) is never
   * retried: retrying it can't change the outcome, only delay reporting it.
   */
  async function sendCommand(command, payload) {
    for (let attempt = 0; ; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await sendOnce(command, payload);
      } catch (err) {
        if (!err.transient || attempt >= RETRY_DELAYS_MS.length) throw err;
        // eslint-disable-next-line no-await-in-loop
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Direct reads — unchanged contract, no round trip through the worker.
  // ---------------------------------------------------------------------

  /**
   * Returns the VideoProgress object for the given videoId,
   * or null if no entry exists or the stored row is malformed.
   */
  async function getProgress(videoId) {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const raw = store[videoId];
    return isPlainObject(raw) ? sanitizeEntry(raw) : null;
  }

  /**
   * Returns the full videoId -> VideoProgress map. A malformed row (not a
   * plain object — R17-class) is excluded from the result rather than
   * thrown on; it is not deleted from storage by this read-only call, only
   * omitted from what's returned.
   */
  async function getAllProgress() {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const sanitized = {};
    for (const [key, entry] of Object.entries(store)) {
      if (isPlainObject(entry)) sanitized[key] = sanitizeEntry(entry);
    }
    return sanitized;
  }

  /**
   * Returns Settings, validated field by field so a missing, corrupt, or
   * wrong-typed stored value — whole object or individual field — can
   * never produce anything but a default or an allowed preset.
   */
  async function getSettings() {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    return sanitizeSettingsValue(result[SETTINGS_KEY]);
  }

  /**
   * Synchronous copy of DEFAULT_SETTINGS, no storage access. Used by
   * callers (bootstrap.js, D-049) that need a fallback when getSettings()
   * itself rejects — e.g. chrome.storage unavailable — so a settings
   * failure can never block resume.
   */
  function getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  // ---------------------------------------------------------------------
  // Mutations — thin message clients. Each keeps its exact prior signature
  // and Promise contract; the actual read-modify-write now happens once,
  // serialized, inside background/storageWriter.js.
  // ---------------------------------------------------------------------

  /**
   * Upserts a progress entry for the given videoId.
   *
   * @param {string} title - Optional. Capped server-side. If omitted/falsy,
   *   an existing stored title (if any) is preserved rather than erased —
   *   title capture can fail transiently while a good title from an
   *   earlier save already exists (D-016).
   * @param {string} channel - Optional. Same preserve-if-omitted behaviour
   *   as title (D-016).
   * @param {object} [ownership] - v4 Phase 3 write-ownership/freshness
   *   metadata for the calling playback session (Roadmap 3.1-3.3):
   *   { sessionId, lastActiveAt: ms epoch of this session's last
   *   meaningfully-active moment, explicitUserSeek: boolean, trigger,
   *   ended: boolean }.
   *   The writer uses lastActiveAt/explicitUserSeek to reject a save from a
   *   session that has been inactive since before the entry's (or a
   *   deletion's) more recent timestamp — closes F07/R23. `ended` (v4
   *   Phase 7, D-104) marks a genuine finish (a real `ended` event, not a
   *   seek-to-end — content/progressTracker.js decides this) and is sticky
   *   once true, same preserve-if-omitted spirit as title/channel. Omitted
   *   entirely by a non-tracking caller (there are none today; every
   *   saveProgress call comes from progressTracker), in which case the
   *   writer applies no freshness check and no completion write.
   *
   * Rejects if videoId isn't a plausible YouTube video ID shape, or if the
   * writer's freshness check judges this session stale (Roadmap 3.3/3.4) —
   * no entry is written either way. Callers already end this call in
   * .catch() (progressTracker convention), so this surfaces as a logged,
   * silently-handled rejection, never an uncaught error.
   */
  async function saveProgress(videoId, time, duration, title, channel, ownership) {
    assertRuntimeAvailable();
    const result = await sendCommand('SAVE_PROGRESS', {
      videoId,
      time,
      duration,
      title,
      channel,
      sessionId: ownership?.sessionId ?? null,
      lastActiveAt: ownership?.lastActiveAt ?? null,
      explicitUserSeek: !!ownership?.explicitUserSeek,
      trigger: ownership?.trigger ?? null,
      ended: !!ownership?.ended,
    });
    // Phase 0 (v3) diagnostic — defects A/B (Roadmap v3 0.2). No-ops when DEBUG is false.
    debugLogger.log('saveProgress', {
      videoId,
      existingEntryFound: result.existingEntryFound,
      incomingTitle: title ?? null,
      entryCountAfterWrite: result.entryCountAfterWrite,
    });
  }

  /**
   * Removes the progress entry for the given videoId.
   * Handles missing keys gracefully (no-op if absent).
   */
  async function deleteProgress(videoId) {
    assertRuntimeAvailable();
    await sendCommand('DELETE_PROGRESS', { videoId });
  }

  /**
   * Pins an existing entry. Rejects if no entry exists for videoId, or if
   * the 20-pin cap is already reached — a pin attempt past the cap is
   * refused outright, never auto-unpinning an existing pin to make room
   * (D-067). No-op if the entry is already pinned.
   */
  async function pinProgress(videoId) {
    assertRuntimeAvailable();
    await sendCommand('PIN', { videoId });
  }

  /**
   * Unpins an entry. No-op if the entry is absent or already unpinned.
   * Immediately re-enforces the 200-unpinned-entry cap (D-112): unpinning
   * into an already-full library evicts the oldest eligible unpinned entry
   * right away rather than leaving 201 unpinned entries until the next
   * saveProgress() happens to occur (R20).
   */
  async function unpinProgress(videoId) {
    assertRuntimeAvailable();
    await sendCommand('UNPIN', { videoId });
  }

  /**
   * Removes every entry matching the completion predicate
   * (storageValidation.isCompleteEntry) in one coordinated batch mutation
   * (Roadmap 7.5, D-105). Pinned entries are excluded unless includePinned
   * is true. The matching set is re-derived by the writer at commit time,
   * never trusting a client-supplied id list — a concurrent save (T7.4)
   * changing an entry's completion state between the popup's preview and
   * the click is resolved against current storage, not a stale snapshot.
   *
   * @returns {Promise<{removedCount: number, removedIds: string[]}>}
   */
  async function removeCompleted(includePinned) {
    assertRuntimeAvailable();
    return sendCommand('REMOVE_COMPLETED', { includePinned: !!includePinned });
  }

  /**
   * Removes all saved progress entries, pinned or not — pinning protects
   * only against the 200-entry eviction cap, not against this explicit
   * user action. Leaves youtubeResumeSettings and youtubeResumeSchema
   * untouched (PRD §7.4).
   */
  async function clearAllProgress() {
    assertRuntimeAvailable();
    await sendCommand('CLEAR_ALL', {});
  }

  /**
   * Merges partial into the current settings and persists the result.
   * Never touches youtubeResume or youtubeResumeSchema (D-014).
   */
  async function saveSettings(partial) {
    assertRuntimeAvailable();
    return sendCommand('SET_SETTINGS', { partial });
  }

  /**
   * Restores settings to DEFAULT_SETTINGS. Leaves youtubeResume untouched
   * (PRD §7.4 / D-014).
   */
  async function resetSettings() {
    assertRuntimeAvailable();
    return sendCommand('RESET_SETTINGS', {});
  }

  // Wakes the worker on load (connect() alone does this in real Chrome) so
  // its one-time startup (migrate + repair, now running exclusively there
  // — v4 Phase 2, 2.5) isn't deferred until the first real mutation. This
  // replaces the old per-load `migrate().then(repairDuplicates)` self-
  // invocation, which ran once per tab/popup instance and raced its own
  // read-modify-write against every other open instance's copy (F06). A
  // failure here is non-fatal — reads already sanitize defensively
  // (storageValidation.sanitizeEntry) independent of whether repair has run.
  try {
    getPort();
  } catch (err) {
    console.warn('[YTResume] Could not reach storageWriter on load:', err.message);
  }

  return {
    getProgress,
    getAllProgress,
    saveProgress,
    deleteProgress,
    clearAllProgress,
    pinProgress,
    unpinProgress,
    removeCompleted,
    getSettings,
    saveSettings,
    resetSettings,
    getDefaultSettings,
  };
})();
