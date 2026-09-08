/**
 * StorageValidation Module
 *
 * Purpose: Pure, side-effect-free schema/validation/repair logic shared by
 * storage/storageManager.js (the read client, loaded into every content
 * script and the popup) and background/storageWriter.js (the sole writer,
 * running in the service worker's own realm). No chrome.storage access, no
 * DOM — a pure-functions module in the same spirit as utils/, kept under
 * storage/ instead so CLAUDE.md's existing "storage -> utils -> content"
 * manifest load order doesn't need reordering around this new dependency
 * (v4 Phase 2, D-102).
 *
 * background/storageWriter.js loads this file via importScripts() — a
 * classic (non-"module") service worker can do that; storageManager.js
 * loads it as an ordinary manifest content-script/popup <script> entry,
 * listed immediately before it.
 */
const storageValidation = (() => {
  const STORAGE_KEY = 'youtubeResume';
  const SCHEMA_KEY = 'youtubeResumeSchema';
  const SETTINGS_KEY = 'youtubeResumeSettings';
  const QUARANTINE_KEY = 'youtubeResumeQuarantine'; // v4 Phase 1, D-127
  const MAX_ENTRIES = 200;
  const MAX_TITLE_LENGTH = 200;
  const MAX_PINNED = 20; // v3 Phase 4, D-067 — refused past this, never auto-unpinned
  const MAX_REPAIR_LOG = 20; // v4 Phase 1, D-127/1.4 — bounded local retention, not a permanent audit log
  const CURRENT_SCHEMA_VERSION = 3;

  const DEFAULT_SETTINGS = {
    minWatchSeconds: 30,
    completionThreshold: 0.95,
    rewindSeconds: 2,
    showToast: true,
    showRestartButton: true,
    loadThumbnails: true,
  };

  // Allowed presets for each setting (v4 Phase 1, 1.6/R18). completionThreshold's
  // `1` is Phase 7's future "Only at the end" sentinel (D-106) — validated as
  // allowed now so an early write of it is never rejected as invalid once
  // Phase 7 ships.
  const ALLOWED_MIN_WATCH_SECONDS = [10, 30, 60, 120];
  const ALLOWED_COMPLETION_THRESHOLD = [0.9, 0.95, 0.98, 1];
  const ALLOWED_REWIND_SECONDS = [0, 2, 5, 10];
  const BOOLEAN_SETTING_KEYS = ['showToast', 'showRestartButton', 'loadThumbnails'];

  // YouTube video IDs are always an 11-char [A-Za-z0-9_-] token.
  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  // Explicitly supported URL forms (v4 Phase 1, 1.1) — a proven identity,
  // not a guess, because each pattern anchors the ID to a specific,
  // unambiguous position in a known URL shape.
  const WATCH_URL_PATTERN = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?.*\bv=([A-Za-z0-9_-]{11})(?:&|$)/;
  const SHORT_URL_PATTERN = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?/]|$)/;

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function nonBlank(value) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  function isValidVideoId(videoId) {
    return typeof videoId === 'string' && VIDEO_ID_PATTERN.test(videoId);
  }

  /**
   * Resolves a raw youtubeResume key to the canonical video ID it
   * represents, or null if none can be found. Only ever returns an
   * identity actually proven by exact parsing — surrounding whitespace, or
   * one of the explicitly supported URL forms above (v4 Phase 1, 1.1).
   * Never guesses at a malformed token (e.g. a 12+ character key) by
   * pattern-matching a substring out of it — that risks manufacturing a
   * different, unproven identity (F11/R16). A key this can't resolve is
   * quarantined by the caller, never rewritten to a guess.
   */
  function resolveVideoId(key) {
    if (typeof key !== 'string') return null;
    const trimmed = key.trim();
    if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;
    const watchMatch = trimmed.match(WATCH_URL_PATTERN);
    if (watchMatch) return watchMatch[1];
    const shortMatch = trimmed.match(SHORT_URL_PATTERN);
    if (shortMatch) return shortMatch[1];
    return null;
  }

  /**
   * Combines two entries known to represent the same video ID: the
   * furthest playback position wins (paired with its own duration), the
   * most recently updated entry's title/channel win, falling back to
   * whichever entry has a value if the more recent one is missing one
   * (same preserve-if-omitted spirit as D-045).
   *
   * `pinned` uses OR semantics (v4 Phase 1, 1.3/D-127): if either side of a
   * merge is pinned, the merged entry stays pinned. A pinned duplicate must
   * never lose its pin protection by being on the "other" side of a merge
   * (F11/R15). Any other unknown/future field is preserved via the object
   * spread below rather than named explicitly, so a compatible field this
   * function doesn't know about still survives a merge.
   *
   * KNOWN LIMITATION (v4 Phase 1, 1.5 — documented, not resolved here):
   * furthest-time-wins can revive an old position. If the user deliberately
   * rewound the canonical entry to an earlier point, a still-unmerged
   * duplicate row sitting at the old, further-along position will win this
   * comparison and undo the rewind. Resolving this needs the session/
   * revision evidence Phase 3 introduces (was this a deliberate seek, and
   * which entry is actually newer in intent, not just in `updated`) — not
   * available at this layer yet.
   */
  function mergeEntryPair(a, b) {
    const furthest = safeNumber(a.time, 0) >= safeNumber(b.time, 0) ? a : b;
    const recent = safeNumber(a.updated, 0) >= safeNumber(b.updated, 0) ? a : b;
    const other = recent === a ? b : a;

    const merged = { ...other, ...recent };
    merged.time = furthest.time;
    merged.duration = furthest.duration;
    merged.updated = recent.updated;

    const title = nonBlank(recent.title) || nonBlank(other.title);
    if (title) merged.title = title; else delete merged.title;
    const channel = nonBlank(recent.channel) || nonBlank(other.channel);
    if (channel) merged.channel = channel; else delete merged.channel;

    if (a.pinned || b.pinned) merged.pinned = true; else delete merged.pinned;
    return merged;
  }

  /**
   * Enforces the 200-unpinned-entry cap in place on `store` (v4 Phase 1,
   * 1.8/D-112): evicts the oldest-by-`updated` unpinned entries down to
   * MAX_ENTRIES. Shared by every operation that can change eligibility
   * (save, unpin, repair) so the invariant holds immediately after each one,
   * not only inside saveProgress. Non-plain-object rows are excluded from
   * both the count and the eviction candidates — they're not valid unpinned
   * entries to begin with (defensive; repair should already have quarantined
   * them, but this must not throw if it hasn't run yet).
   */
  function enforceUnpinnedCap(store) {
    const unpinnedKeys = Object.keys(store).filter((k) => isPlainObject(store[k]) && !store[k].pinned);
    if (unpinnedKeys.length <= MAX_ENTRIES) return false;
    const sorted = unpinnedKeys.sort((a, b) => safeNumber(store[a].updated, 0) - safeNumber(store[b].updated, 0));
    const toRemove = sorted.slice(0, unpinnedKeys.length - MAX_ENTRIES);
    toRemove.forEach((k) => delete store[k]);
    return toRemove.length > 0;
  }

  /**
   * Defensive repair pass (Roadmap v3 Phase 2.2, hardened v4 Phase 1).
   * Scans a youtubeResume-shaped `store` for keys that don't resolve to a
   * proven video ID (1.1) and for rows whose value isn't a usable object
   * (R17-class), and quarantines both rather than guessing at an identity,
   * leaving them mixed into youtubeResume, or dropping them (1.2). Duplicate
   * rows for the SAME resolved video ID are merged (mergeEntryPair); every
   * merge is recorded in a bounded repair log (1.4) so the pre-merge values
   * remain inspectable. Never removes a distinct video's entry. Pure —
   * takes and returns plain objects, no chrome.storage access; the caller
   * (background/storageWriter.js) does the actual read/write.
   */
  function repairStore(store, existingQuarantine, nowSeconds) {
    const merged = {};
    const quarantineEntries = { ...(isPlainObject(existingQuarantine) && isPlainObject(existingQuarantine.entries) ? existingQuarantine.entries : {}) };
    const repairLog = isPlainObject(existingQuarantine) && Array.isArray(existingQuarantine.repairLog)
      ? [...existingQuarantine.repairLog]
      : [];
    let storeChanged = false;
    let quarantineChanged = false;

    function quarantine(key, entry, reason) {
      if (!quarantineEntries[key]) {
        quarantineEntries[key] = { entry, reason, quarantinedAt: nowSeconds };
        quarantineChanged = true;
      }
      storeChanged = true; // the row leaves youtubeResume either way
    }

    for (const [key, entry] of Object.entries(store)) {
      if (!isPlainObject(entry)) {
        quarantine(key, entry, 'malformed-value');
        continue;
      }

      const canonicalId = resolveVideoId(key);
      if (!canonicalId) {
        quarantine(key, entry, 'unresolved-key');
        continue;
      }
      if (canonicalId !== key) storeChanged = true;

      const existing = merged[canonicalId];
      if (!existing) {
        merged[canonicalId] = entry;
      } else {
        const mergedEntry = mergeEntryPair(existing, entry);
        repairLog.unshift({
          rawKey: key, canonicalId, before: { existing, incoming: entry }, after: mergedEntry, at: nowSeconds,
        });
        if (repairLog.length > MAX_REPAIR_LOG) repairLog.length = MAX_REPAIR_LOG;
        merged[canonicalId] = mergedEntry;
        storeChanged = true;
      }
    }

    if (enforceUnpinnedCap(merged)) storeChanged = true;

    return {
      store: merged,
      quarantine: { entries: quarantineEntries, repairLog },
      storeChanged,
      quarantineChanged,
    };
  }

  /**
   * Validates and normalizes a single stored entry at the read boundary
   * (v4 Phase 1, 1.6): finite non-negative `time`, a positive `duration`
   * (else 0 — an unwatchable/unknown duration, not a crash), a plausible
   * `updated` timestamp (finite, non-negative, not further in the future
   * than a day of clock-skew slack), and string-typed `title`/`channel`
   * (same trim+cap rule saveProgress applies on write). This is read-side
   * defense independent of the repair pass — it must hold even before
   * repair has had a chance to run. Caller must only pass entries that
   * already passed isPlainObject().
   */
  function sanitizeEntry(raw, nowSeconds = Math.floor(Date.now() / 1000)) {
    const maxPlausibleUpdated = nowSeconds + 86400;

    const time = safeNumber(raw.time, 0);
    const sanitized = {
      time: time >= 0 ? time : 0,
      duration: safeNumber(raw.duration, 0) > 0 ? raw.duration : 0,
      updated: Number.isFinite(raw.updated) && raw.updated >= 0 && raw.updated <= maxPlausibleUpdated ? raw.updated : 0,
    };
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (title) sanitized.title = title.slice(0, MAX_TITLE_LENGTH);
    const channel = typeof raw.channel === 'string' ? raw.channel.trim() : '';
    if (channel) sanitized.channel = channel.slice(0, MAX_TITLE_LENGTH);
    if (raw.pinned === true) sanitized.pinned = true;
    return sanitized;
  }

  /**
   * Validates each setting field individually against its allowed preset
   * set / boolean type (v4 Phase 1, 1.6/R18): a stored value outside its
   * allowed set (a string where a number is expected, `"false"` where a
   * boolean is expected, an unlisted number, etc.) falls back to that
   * field's own default rather than passing through unvalidated. Applied
   * per field, not per object, so one bad field never invalidates the
   * others.
   */
  function sanitizeSettingsValue(raw) {
    const valid = isPlainObject(raw) ? raw : {};
    const out = { ...DEFAULT_SETTINGS };

    if (ALLOWED_MIN_WATCH_SECONDS.includes(valid.minWatchSeconds)) out.minWatchSeconds = valid.minWatchSeconds;
    if (ALLOWED_COMPLETION_THRESHOLD.includes(valid.completionThreshold)) out.completionThreshold = valid.completionThreshold;
    if (ALLOWED_REWIND_SECONDS.includes(valid.rewindSeconds)) out.rewindSeconds = valid.rewindSeconds;
    for (const key of BOOLEAN_SETTING_KEYS) {
      if (typeof valid[key] === 'boolean') out[key] = valid[key];
    }
    return out;
  }

  /**
   * Migration chain (Roadmap v3 Phase 2, D-068). Each step is keyed by the
   * schema version it advances the store TO, and each is independently
   * idempotent — safe to re-run from any starting version, including one
   * already at or past a step's target. Phase 4 (D-071) is the only place
   * that introduced schema v3 (pinned). Pure data — background/
   * storageWriter.js's migrate() is what actually reads/writes storage.
   */
  const MIGRATION_STEPS = [
    {
      to: 2,
      // v1 -> v2 is purely additive (PRD §7.6): title became optional, so
      // every existing youtubeResume entry is already valid under v2
      // as-is. No entry transform runs here — only the schema version
      // advances.
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

  return {
    STORAGE_KEY,
    SCHEMA_KEY,
    SETTINGS_KEY,
    QUARANTINE_KEY,
    MAX_ENTRIES,
    MAX_TITLE_LENGTH,
    MAX_PINNED,
    MAX_REPAIR_LOG,
    CURRENT_SCHEMA_VERSION,
    DEFAULT_SETTINGS,
    ALLOWED_MIN_WATCH_SECONDS,
    ALLOWED_COMPLETION_THRESHOLD,
    ALLOWED_REWIND_SECONDS,
    BOOLEAN_SETTING_KEYS,
    VIDEO_ID_PATTERN,
    WATCH_URL_PATTERN,
    SHORT_URL_PATTERN,
    isPlainObject,
    safeNumber,
    nonBlank,
    isValidVideoId,
    resolveVideoId,
    mergeEntryPair,
    enforceUnpinnedCap,
    repairStore,
    sanitizeEntry,
    sanitizeSettingsValue,
    MIGRATION_STEPS,
  };
})();
