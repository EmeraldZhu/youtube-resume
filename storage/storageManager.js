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
 */
console.log('[YTResume] storageManager.js loaded');
