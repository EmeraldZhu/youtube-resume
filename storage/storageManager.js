/**
 * StorageManager Module
 *
 * Purpose: Typed abstraction over chrome.storage.local.
 * Owns all storage read/write/eviction logic — the ONLY module
 * that may touch chrome.storage.local.
 *
 * Public API:
 *   storageManager.getProgress(videoId)    → Promise<VideoProgress | null>
 *   storageManager.getAllProgress()        → Promise<Record<string, VideoProgress>>
 *   storageManager.saveProgress(videoId, time, duration, title?, channel?) → Promise<void>
 *     (rejects if videoId is not a plausible YouTube video ID shape — v3 Phase 2, D-065/2.3)
 *   storageManager.deleteProgress(videoId) → Promise<void>
 *   storageManager.clearAllProgress()      → Promise<void>
 *   storageManager.pinProgress(videoId)    → Promise<void> (v3 Phase 4)
 *     (rejects if no entry exists, or the 20-pin cap is already reached — never auto-unpins)
 *   storageManager.unpinProgress(videoId)  → Promise<void> (v3 Phase 4)
 *   storageManager.getSettings()           → Promise<Settings>
 *   storageManager.saveSettings(partial)   → Promise<Settings>
 *   storageManager.resetSettings()         → Promise<Settings>
 *   storageManager.getDefaultSettings()    → Settings (sync, no storage access)
 *
 * Types:
 *   VideoProgress = { time: number, duration: number, updated: number, title?: string, channel?: string, pinned?: boolean }
 *
 * Storage shape (schema v3):
 *   {
 *     youtubeResume: { [videoId]: VideoProgress },
 *     youtubeResumeSettings: Settings,
 *     youtubeResumeSchema: 3
 *   }
 *
 * youtubeResumeSchema and youtubeResumeSettings are separate root keys,
 * never nested inside youtubeResume — its keys are counted for the
 * 200-entry eviction cap (D-013). Pinned entries (v3 Phase 4) are exempt
 * from that cap — see saveProgress's eviction step below.
 */

const storageManager = (() => {
  const STORAGE_KEY = 'youtubeResume';
  const SCHEMA_KEY = 'youtubeResumeSchema';
  const SETTINGS_KEY = 'youtubeResumeSettings';
  const MAX_ENTRIES = 200;
  const MAX_TITLE_LENGTH = 200;
  const MAX_PINNED = 20; // v3 Phase 4, D-067 — refused past this, never auto-unpinned
  const CURRENT_SCHEMA_VERSION = 3;

  const DEFAULT_SETTINGS = {
    minWatchSeconds: 30,
    completionThreshold: 0.95,
    rewindSeconds: 2,
    showToast: true,
    showRestartButton: true,
    loadThumbnails: true,
  };

  /**
   * chrome.storage is undefined when this content-script instance is a stale one
   * left running after the extension was reloaded (a dev-only Load-Unpacked
   * artifact — a real install never invalidates an already-injected tab's
   * context). Callers already end their promise chain in .catch(), so this just
   * makes the resulting warning diagnosable instead of a bare TypeError.
   */
  function assertStorageAvailable() {
    if (!chrome?.storage?.local) {
      throw new Error('chrome.storage unavailable — extension context invalidated, reload the page');
    }
  }

  /**
   * Migration chain (Roadmap v3 Phase 2, D-068). Each step is keyed by the
   * schema version it advances the store TO, and each is independently
   * idempotent — safe to re-run from any starting version, including one
   * already at or past a step's target. Phase 4 (D-071) is the only place
   * that introduces schema v3 (pinned) — appending its step below did not
   * require changing this chain's shape or re-deriving idempotency.
   */
  const MIGRATION_STEPS = [
    {
      to: 2,
      // v1 -> v2 is purely additive (PRD §7.6): title became optional, so
      // every existing youtubeResume entry is already valid under v2
      // as-is. No entry transform runs here — only the schema version
      // (below) and default settings advance.
      async run() {},
    },
    {
      to: 3,
      // v2 -> v3 (Roadmap v3 Phase 4, D-068/D-071) adds optional `pinned`,
      // defaulting to absent = unpinned. Purely additive — no existing
      // entry needs a rewrite, so this step is also a no-op.
      async run() {},
    },
  ];

  /**
   * Runs every migration step whose target version is still ahead of the
   * stored version, writes default settings if missing, and never touches
   * existing youtubeResume entries. Idempotent — safe to run on every load.
   */
  async function migrate() {
    try {
      assertStorageAvailable();
      const result = await chrome.storage.local.get([SCHEMA_KEY, SETTINGS_KEY]);
      let version = result[SCHEMA_KEY] ?? 1;
      const toWrite = {};

      for (const step of MIGRATION_STEPS) {
        if (version < step.to) {
          await step.run();
          version = step.to;
          toWrite[SCHEMA_KEY] = version;
        }
      }

      if (!result[SETTINGS_KEY]) {
        toWrite[SETTINGS_KEY] = { ...DEFAULT_SETTINGS };
      }

      if (Object.keys(toWrite).length > 0) {
        await chrome.storage.local.set(toWrite);
      }
    } catch (err) {
      // Migration must never block resume/tracking — continue with defaults.
      console.warn('[YTResume] Migration failed:', err.message);
    }
  }

  // YouTube video IDs are always an 11-char [A-Za-z0-9_-] token.
  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const VIDEO_ID_SUBSTRING_PATTERN = /[A-Za-z0-9_-]{11}/g;

  function isValidVideoId(videoId) {
    return typeof videoId === 'string' && VIDEO_ID_PATTERN.test(videoId);
  }

  /**
   * Resolves a raw youtubeResume key to the canonical video ID it
   * represents, or null if none can be found. Handles the common case
   * (key already is the ID) and a defensive fallback (ID embedded in a
   * malformed key, e.g. stray whitespace or a prefix) without ever
   * guessing across multiple equally-plausible candidate IDs.
   */
  function resolveVideoId(key) {
    if (typeof key !== 'string') return null;
    const trimmed = key.trim();
    if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;
    const matches = trimmed.match(VIDEO_ID_SUBSTRING_PATTERN);
    return matches && matches.length === 1 ? matches[0] : null;
  }

  /**
   * Combines two entries known to represent the same video ID: the
   * furthest playback position wins (paired with its own duration), the
   * most recently updated entry's title/channel win, falling back to
   * whichever entry has a value if the more recent one is missing one
   * (same preserve-if-omitted spirit as D-045).
   */
  function nonBlank(value) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  function mergeEntryPair(a, b) {
    const furthest = (a.time ?? 0) >= (b.time ?? 0) ? a : b;
    const recent = (a.updated ?? 0) >= (b.updated ?? 0) ? a : b;
    const other = recent === a ? b : a;

    const merged = {
      time: furthest.time,
      duration: furthest.duration,
      updated: recent.updated,
    };
    const title = nonBlank(recent.title) || nonBlank(other.title);
    const channel = nonBlank(recent.channel) || nonBlank(other.channel);
    if (title) merged.title = title;
    if (channel) merged.channel = channel;
    return merged;
  }

  /**
   * Defensive repair pass (Roadmap v3 Phase 2.2). Scans youtubeResume for
   * keys that don't look like a bare video ID and merges any duplicates
   * found for the same underlying video ID. Non-destructive: a key whose
   * video ID can't be resolved is left in place untouched rather than
   * dropped (2.5 forbids deleting an entry, resolved or not); merging only
   * ever collapses duplicate rows for the SAME video, never removes a
   * distinct one. No-op if the store has no malformed/duplicate keys.
   */
  function repairStore(store) {
    const merged = {};
    let changed = false;

    for (const [key, entry] of Object.entries(store)) {
      if (!entry || typeof entry !== 'object') continue;
      const canonicalId = resolveVideoId(key);
      if (!canonicalId) {
        merged[key] = entry;
        continue;
      }
      if (canonicalId !== key) changed = true;

      const existing = merged[canonicalId];
      if (!existing) {
        merged[canonicalId] = entry;
      } else {
        merged[canonicalId] = mergeEntryPair(existing, entry);
        changed = true;
      }
    }

    return { store: merged, changed };
  }

  /**
   * Runs repairStore() against the live store and persists the result
   * only if it actually changed anything. Called once per load, after
   * migrate() — cheap enough to run unconditionally rather than gate on
   * Phase 0 having found malformed keys (it found none; this closes the
   * failure class regardless, per Roadmap v3 2.2).
   */
  async function repairDuplicates() {
    try {
      assertStorageAvailable();
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const store = result[STORAGE_KEY] ?? {};
      const { store: repaired, changed } = repairStore(store);
      if (changed) {
        await chrome.storage.local.set({ [STORAGE_KEY]: repaired });
        debugLogger.log('repairDuplicates', {
          beforeCount: Object.keys(store).length,
          afterCount: Object.keys(repaired).length,
        });
      }
    } catch (err) {
      // Repair must never block resume/tracking — leave the store as-is.
      console.warn('[YTResume] Duplicate repair failed:', err.message);
    }
  }

  /**
   * Returns the VideoProgress object for the given videoId,
   * or null if no entry exists.
   */
  async function getProgress(videoId) {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    return store[videoId] ?? null;
  }

  /**
   * Returns the full videoId -> VideoProgress map.
   */
  async function getAllProgress() {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? {};
  }

  /**
   * Upserts a progress entry for the given videoId.
   * After upsert, evicts oldest entries if count exceeds MAX_ENTRIES.
   *
   * @param {string} title - Optional. Capped at MAX_TITLE_LENGTH. If
   *   omitted/falsy, an existing stored title (if any) is preserved
   *   rather than erased — title capture can fail transiently while a
   *   good title from an earlier save already exists (D-016).
   * @param {string} channel - Optional. Capped at MAX_TITLE_LENGTH, same
   *   preserve-if-omitted behaviour as title, for the same reason
   *   (D-016) — the channel name has no document.title fallback, so a
   *   transient DOM-selector miss is more likely, not less.
   *
   * Rejects (Roadmap v3 2.3) if videoId isn't a plausible YouTube video ID
   * shape — no entry is written. Callers already end this call in
   * .catch() (progressTracker convention), so this surfaces as a logged,
   * silently-handled rejection, never an uncaught error.
   */
  async function saveProgress(videoId, time, duration, title, channel) {
    assertStorageAvailable();
    if (!isValidVideoId(videoId)) {
      const message = `saveProgress rejected: unresolved videoId (${JSON.stringify(videoId)})`;
      console.warn('[YTResume]', message);
      throw new Error(message);
    }
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const existing = store[videoId];

    const entry = {
      time,
      duration,
      updated: Math.floor(Date.now() / 1000),
    };

    // A whitespace-only string is treated the same as omitted (Roadmap v3
    // 2.4 write-back guard) — a naive truthy check would let it through
    // and overwrite a real stored title/channel with blank-looking text.
    // youtubeUtils.getTitle()/getChannelName() never produce one today
    // (both trim and null out), but the guard must hold regardless of the
    // caller.
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    const resolvedTitle = trimmedTitle ? trimmedTitle.slice(0, MAX_TITLE_LENGTH) : existing?.title;
    if (resolvedTitle) {
      entry.title = resolvedTitle;
    }

    const trimmedChannel = typeof channel === 'string' ? channel.trim() : '';
    const resolvedChannel = trimmedChannel ? trimmedChannel.slice(0, MAX_TITLE_LENGTH) : existing?.channel;
    if (resolvedChannel) {
      entry.channel = resolvedChannel;
    }

    // Identity invariant (Roadmap v3 Phase 1 / TDD §4.6): videoId is the
    // sole identity for a stored entry. title/channel above are refreshed
    // display-only metadata on that entry — never fall back into this key,
    // never participate in an equality check, never get hashed/concatenated
    // into it. Do not reintroduce them into the key path here.
    // A save never changes an existing entry's pinned state.
    if (existing?.pinned) {
      entry.pinned = true;
    }

    store[videoId] = entry;

    // Eviction: trim to MAX_ENTRIES, counting and selecting from unpinned
    // entries only (Roadmap v3 4.3, D-067) — a pinned entry never counts
    // toward the cap and is never a candidate for removal by it.
    const unpinnedKeys = Object.keys(store).filter((k) => !store[k].pinned);
    if (unpinnedKeys.length > MAX_ENTRIES) {
      const sorted = unpinnedKeys.sort((a, b) => store[a].updated - store[b].updated);
      const toRemove = sorted.slice(0, unpinnedKeys.length - MAX_ENTRIES);
      toRemove.forEach(k => delete store[k]);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: store });

    // Phase 0 (v3) diagnostic — defects A/B (Roadmap v3 0.2). No-ops when DEBUG is false.
    debugLogger.log('saveProgress', {
      videoId,
      existingEntryFound: !!existing,
      incomingTitle: title ?? null,
      entryCountAfterWrite: Object.keys(store).length,
    });
  }

  /**
   * Removes the progress entry for the given videoId.
   * Handles missing keys gracefully (no-op if absent).
   */
  async function deleteProgress(videoId) {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    delete store[videoId];
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  }

  /**
   * Pins an existing entry (Roadmap v3 Phase 4). Rejects if no entry
   * exists for videoId, or if MAX_PINNED is already reached — a pin
   * attempt past the cap is refused outright, never auto-unpinning an
   * existing pin to make room (D-067). No-op if the entry is already
   * pinned.
   */
  async function pinProgress(videoId) {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const entry = store[videoId];
    if (!entry) {
      const message = `pinProgress rejected: no entry for videoId (${JSON.stringify(videoId)})`;
      console.warn('[YTResume]', message);
      throw new Error(message);
    }
    if (entry.pinned) return;

    const pinnedCount = Object.values(store).filter((e) => e.pinned).length;
    if (pinnedCount >= MAX_PINNED) {
      const message = `pinProgress rejected: pin cap (${MAX_PINNED}) reached`;
      console.warn('[YTResume]', message);
      throw new Error(message);
    }

    store[videoId] = { ...entry, pinned: true };
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  }

  /**
   * Unpins an entry. No-op if the entry is absent or already unpinned —
   * unpinning is never a rejection case.
   */
  async function unpinProgress(videoId) {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const entry = store[videoId];
    if (!entry || !entry.pinned) return;

    store[videoId] = { ...entry, pinned: false };
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  }

  /**
   * Removes all saved progress entries, pinned or not (Roadmap v3 4.5) —
   * pinning protects only against the 200-entry eviction cap, not against
   * this explicit user action. Leaves youtubeResumeSettings and
   * youtubeResumeSchema untouched (PRD §7.4).
   */
  async function clearAllProgress() {
    assertStorageAvailable();
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  /**
   * Returns Settings, merging stored values over DEFAULT_SETTINGS so a
   * missing or corrupt (e.g. non-object) stored value can never produce
   * an undefined setting.
   */
  async function getSettings() {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    const stored = result[SETTINGS_KEY];
    const valid = stored && typeof stored === 'object' ? stored : {};
    return { ...DEFAULT_SETTINGS, ...valid };
  }

  /**
   * Merges partial into the current settings and persists the result.
   * Never touches youtubeResume or youtubeResumeSchema (D-014).
   */
  async function saveSettings(partial) {
    assertStorageAvailable();
    const current = await getSettings();
    const updated = { ...current, ...partial };
    await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
    return updated;
  }

  /**
   * Restores settings to DEFAULT_SETTINGS. Leaves youtubeResume untouched
   * (PRD §7.4 / D-014).
   */
  async function resetSettings() {
    assertStorageAvailable();
    const defaults = { ...DEFAULT_SETTINGS };
    await chrome.storage.local.set({ [SETTINGS_KEY]: defaults });
    return defaults;
  }

  /**
   * Synchronous copy of DEFAULT_SETTINGS, no storage access. Used by callers
   * (bootstrap.js, D-049) that need a fallback when getSettings() itself
   * rejects — e.g. chrome.storage unavailable — so a settings failure can
   * never block resume (Roadmap 7.7).
   */
  function getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  // repairDuplicates runs after migrate() resolves, once per load, in
  // whichever context (content script or popup) loads this module first.
  migrate().then(repairDuplicates);

  return {
    getProgress,
    getAllProgress,
    saveProgress,
    deleteProgress,
    clearAllProgress,
    pinProgress,
    unpinProgress,
    getSettings,
    saveSettings,
    resetSettings,
    getDefaultSettings,
  };
})();


