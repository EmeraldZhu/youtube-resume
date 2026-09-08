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
 *     youtubeResumeSchema: 3,
 *     youtubeResumeQuarantine: { entries: { [rawKey]: QuarantineEntry }, repairLog: RepairLogEntry[] }
 *   }
 *
 * youtubeResumeSchema and youtubeResumeSettings are separate root keys,
 * never nested inside youtubeResume — its keys are counted for the
 * 200-entry eviction cap (D-013). Pinned entries (v3 Phase 4) are exempt
 * from that cap — see saveProgress's eviction step below.
 *
 * youtubeResumeQuarantine (v4 Phase 1, D-127) is a fourth, additive root
 * key holding data the repair pass could not safely resolve: a raw
 * youtubeResume key/value pair it can neither prove an identity for nor
 * trust the shape of. It is never read by any resume/tracking/popup code
 * path and never auto-emptied — quarantining is this phase's non-destructive
 * alternative to guessing at or dropping malformed data (F11/F12).
 */

const storageManager = (() => {
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

  // Allowed presets for each setting (v4 Phase 1, 1.6/R18): getSettings()
  // rejects any stored value outside these sets, falling back to the
  // per-field default rather than passing a string/NaN/out-of-range value
  // through unchanged. completionThreshold's `1` is Phase 7's future
  // "Only at the end" sentinel (D-106) — validated as allowed now so an
  // early write of it is never rejected as invalid once Phase 7 ships.
  const ALLOWED_MIN_WATCH_SECONDS = [10, 30, 60, 120];
  const ALLOWED_COMPLETION_THRESHOLD = [0.9, 0.95, 0.98, 1];
  const ALLOWED_REWIND_SECONDS = [0, 2, 5, 10];
  const BOOLEAN_SETTING_KEYS = ['showToast', 'showRestartButton', 'loadThumbnails'];

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
  // Explicitly supported URL forms (v4 Phase 1, 1.1) — a proven identity,
  // not a guess, because each pattern anchors the ID to a specific,
  // unambiguous position in a known URL shape.
  const WATCH_URL_PATTERN = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?.*\bv=([A-Za-z0-9_-]{11})(?:&|$)/;
  const SHORT_URL_PATTERN = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?/]|$)/;

  function isValidVideoId(videoId) {
    return typeof videoId === 'string' && VIDEO_ID_PATTERN.test(videoId);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
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
   */
  function nonBlank(value) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  /**
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
   * Scans youtubeResume for keys that don't resolve to a proven video ID
   * (1.1) and for rows whose value isn't a usable object (R17-class), and
   * quarantines both under youtubeResumeQuarantine rather than guessing at
   * an identity, leaving them mixed into youtubeResume, or dropping them
   * (1.2). Duplicate rows for the SAME resolved video ID are merged
   * (mergeEntryPair); every merge is recorded in a bounded repair log (1.4)
   * so the pre-merge values remain inspectable. Never removes a distinct
   * video's entry. No-op if the store has nothing to repair.
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
   * Runs repairStore() against the live store and persists whatever
   * actually changed (the store, the quarantine, or both). Called once per
   * load, after migrate() — cheap enough to run unconditionally rather than
   * gate on Phase 0 having found malformed keys.
   */
  async function repairDuplicates() {
    try {
      assertStorageAvailable();
      const result = await chrome.storage.local.get([STORAGE_KEY, QUARANTINE_KEY]);
      const store = result[STORAGE_KEY] ?? {};
      const nowSeconds = Math.floor(Date.now() / 1000);
      const { store: repaired, quarantine, storeChanged, quarantineChanged } =
        repairStore(store, result[QUARANTINE_KEY], nowSeconds);

      const toWrite = {};
      if (storeChanged) toWrite[STORAGE_KEY] = repaired;
      if (quarantineChanged) toWrite[QUARANTINE_KEY] = quarantine;

      if (Object.keys(toWrite).length > 0) {
        await chrome.storage.local.set(toWrite);
        debugLogger.log('repairDuplicates', {
          beforeCount: Object.keys(store).length,
          afterCount: Object.keys(repaired).length,
          quarantinedCount: Object.keys(quarantine.entries).length,
        });
      }
    } catch (err) {
      // Repair must never block resume/tracking — leave the store as-is.
      console.warn('[YTResume] Duplicate repair failed:', err.message);
    }
  }

  /**
   * Validates and normalizes a single stored entry at the read boundary
   * (v4 Phase 1, 1.6): finite non-negative `time`, a positive `duration`
   * (else 0 — an unwatchable/unknown duration, not a crash), a plausible
   * `updated` timestamp (finite, non-negative, not further in the future
   * than a day of clock-skew slack), and string-typed `title`/`channel`
   * (same trim+cap rule saveProgress already applies on write). This is
   * read-side defense independent of the repair pass — it must hold even
   * before repairDuplicates has had a chance to run this load. Caller must
   * only pass entries that already passed isPlainObject().
   */
  function sanitizeEntry(raw) {
    const nowSeconds = Math.floor(Date.now() / 1000);
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
   * omitted from what's returned (v4 Phase 1, 1.6).
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
    const existingRaw = store[videoId];
    const existing = isPlainObject(existingRaw) ? existingRaw : null;

    // Boundary validation (v4 Phase 1, 1.6): a finite non-negative time and
    // a positive duration, defaulting to 0 rather than writing NaN/negative
    // garbage that would corrupt downstream percent/duration math.
    const safeTime = safeNumber(time, 0);
    const safeDuration = safeNumber(duration, 0);
    const entry = {
      time: safeTime >= 0 ? safeTime : 0,
      duration: safeDuration > 0 ? safeDuration : 0,
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
    // toward the cap and is never a candidate for removal by it. Malformed
    // rows are excluded defensively (R17-class) — see enforceUnpinnedCap.
    enforceUnpinnedCap(store);

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
    if (!isPlainObject(entry)) {
      const message = `pinProgress rejected: no entry for videoId (${JSON.stringify(videoId)})`;
      console.warn('[YTResume]', message);
      throw new Error(message);
    }
    if (entry.pinned) return;

    const pinnedCount = Object.values(store).filter((e) => isPlainObject(e) && e.pinned).length;
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
   * unpinning is never a rejection case. Immediately re-enforces the
   * 200-unpinned-entry cap (v4 Phase 1, 1.9/D-112): unpinning into an
   * already-full library evicts the oldest eligible unpinned entry right
   * away rather than leaving 201 unpinned entries until the next save
   * happens to occur (R20).
   */
  async function unpinProgress(videoId) {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const entry = store[videoId];
    if (!isPlainObject(entry) || !entry.pinned) return;

    const { pinned, ...rest } = entry; // pinned key is only ever present when true
    store[videoId] = rest;
    enforceUnpinnedCap(store);
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
   * Returns Settings, validated field by field (1.6) so a missing,
   * corrupt, or wrong-typed stored value — whole object or individual
   * field — can never produce anything but a default or an allowed preset.
   */
  async function getSettings() {
    assertStorageAvailable();
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    return sanitizeSettingsValue(result[SETTINGS_KEY]);
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


