/**
 * StorageManager Module
 *
 * Purpose: Typed abstraction over chrome.storage.local.
 * Owns all storage read/write/eviction logic.
 *
 * Public API:
 *   storageManager.getProgress(videoId)    → Promise<VideoProgress | null>
 *   storageManager.saveProgress(videoId, time, duration) → Promise<void>
 *   storageManager.deleteProgress(videoId) → Promise<void>
 *
 * Types:
 *   VideoProgress = { time: number, duration: number, updated: number }
 *
 * Storage shape:
 *   { youtubeResume: { [videoId]: VideoProgress } }
 */

const storageManager = (() => {
  const STORAGE_KEY = 'youtubeResume';
  const MAX_ENTRIES = 200;

  /**
   * Returns the VideoProgress object for the given videoId,
   * or null if no entry exists.
   */
  async function getProgress(videoId) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    return store[videoId] ?? null;
  }

  /**
   * Upserts a progress entry for the given videoId.
   * After upsert, evicts oldest entries if count exceeds MAX_ENTRIES.
   */
  async function saveProgress(videoId, time, duration) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};

    store[videoId] = {
      time,
      duration,
      updated: Math.floor(Date.now() / 1000),
    };

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
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    delete store[videoId];
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  }

  return { getProgress, saveProgress, deleteProgress };
})();

console.log('[YTResume] storageManager.js loaded');
