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
 *   storageManager.saveProgress(videoId, time, duration, title?) → Promise<void>
 *   storageManager.deleteProgress(videoId) → Promise<void>
 *   storageManager.clearAllProgress()      → Promise<void>
 *   storageManager.getSettings()           → Promise<Settings>
 *   storageManager.saveSettings(partial)   → Promise<Settings>
 *   storageManager.resetSettings()         → Promise<Settings>
 *   storageManager.getDefaultSettings()    → Settings (sync, no storage access)
 *
 * Types:
 *   VideoProgress = { time: number, duration: number, updated: number, title?: string }
 *
 * Storage shape (schema v2):
 *   {
 *     youtubeResume: { [videoId]: VideoProgress },
 *     youtubeResumeSettings: Settings,
 *     youtubeResumeSchema: 2
 *   }
 *
 * youtubeResumeSchema and youtubeResumeSettings are separate root keys,
 * never nested inside youtubeResume — its keys are counted for the
 * 200-entry eviction cap (D-013).
 */

const storageManager = (() => {
  const STORAGE_KEY = 'youtubeResume';
  const SCHEMA_KEY = 'youtubeResumeSchema';
  const SETTINGS_KEY = 'youtubeResumeSettings';
  const MAX_ENTRIES = 200;
  const MAX_TITLE_LENGTH = 200;
  const CURRENT_SCHEMA_VERSION = 2;

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
   * v1 -> v2 migration (PRD §7.6). Purely additive: writes the schema
   * version and default settings if missing, and never touches existing
   * youtubeResume entries. Idempotent — safe to run on every load.
   */
  async function migrate() {
    try {
      assertStorageAvailable();
      const result = await chrome.storage.local.get([SCHEMA_KEY, SETTINGS_KEY]);
      const toWrite = {};

      if (result[SCHEMA_KEY] !== CURRENT_SCHEMA_VERSION) {
        toWrite[SCHEMA_KEY] = CURRENT_SCHEMA_VERSION;
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
   */
  async function saveProgress(videoId, time, duration, title) {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const existing = store[videoId];

    const entry = {
      time,
      duration,
      updated: Math.floor(Date.now() / 1000),
    };

    const resolvedTitle = title ? title.slice(0, MAX_TITLE_LENGTH) : existing?.title;
    if (resolvedTitle) {
      entry.title = resolvedTitle;
    }

    store[videoId] = entry;

    // Eviction: trim to MAX_ENTRIES before writing
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => store[a].updated - store[b].updated);
      const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
      toRemove.forEach(k => delete store[k]);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: store });
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
   * Removes all saved progress entries. Leaves youtubeResumeSettings
   * and youtubeResumeSchema untouched (PRD §7.4).
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

  migrate();

  return {
    getProgress,
    getAllProgress,
    saveProgress,
    deleteProgress,
    clearAllProgress,
    getSettings,
    saveSettings,
    resetSettings,
    getDefaultSettings,
  };
})();


