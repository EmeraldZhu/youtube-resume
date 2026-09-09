/**
 * StorageWriter — MV3 service worker, sole writer for chrome.storage.local
 * (v4 Phase 2, D-102). Every mutation storage/storageManager.js used to
 * apply itself now arrives here as a command over a `chrome.runtime`
 * port and is processed one at a time through a single in-memory queue —
 * that serialization is what fixes F06's concurrent-write races (R13, R14,
 * R19): two commands never interleave their own read-modify-write of the
 * shared store.
 *
 * Restart-safety (hard requirement, not a nice-to-have): the browser can
 * terminate an idle MV3 service worker at any moment, including mid-queue.
 * This file holds no state whose loss would corrupt correctness — the
 * queue itself is just an ordering mechanism, not a durability boundary.
 * Every command is fully described by its own parameters plus whatever is
 * already in chrome.storage.local, so a worker restart simply starts a
 * fresh, empty queue; nothing "in flight" needed the old one to survive.
 * The client (storageManager.js) is what retries a command whose outcome
 * is unknown because the port dropped before a response arrived — safe
 * because every command here is idempotent (replaying it is always safe).
 *
 * Migration and repair (Phase 1 logic) now run exactly once per worker
 * lifetime, here, before any queued command is processed — never once per
 * tab/popup instance the way the old per-load self-invocation did.
 *
 * Classic (non-"module") service worker — manifest.json's
 * `background.service_worker` names this file with no `"type": "module"`,
 * so importScripts() is available to load the pure logic this file shares
 * with storageManager.js.
 */
importScripts('../storage/storageValidation.js');

(function () {
  const {
    STORAGE_KEY,
    SCHEMA_KEY,
    SETTINGS_KEY,
    QUARANTINE_KEY,
    DEFAULT_SETTINGS,
    MAX_PINNED,
    MAX_TITLE_LENGTH,
    isPlainObject,
    safeNumber,
    isValidVideoId,
    sanitizeSettingsValue,
    repairStore,
    MIGRATION_STEPS,
  } = storageValidation;

  const PORT_NAME = 'storageWriter';

  // -----------------------------------------------------------------
  // Write ownership / freshness (v4 Phase 3, D-139/D-140). In-memory only,
  // worker-lifetime state (Roadmap 3.4 says "in the worker" deliberately —
  // this is not a durability boundary; see the file header's restart-safety
  // note. A worker restart losing this narrow window is an accepted
  // tradeoff, not a silent data-loss risk: the worst case is a few seconds
  // of the pre-Phase-3 F07/F10 behaviour reappearing for that one video
  // until fresh activity re-establishes ownership, not incorrect data).
  //
  // deletionRevisionAt: videoId -> ms epoch of its most recent
  // DELETE_PROGRESS. globalRevisionAt: ms epoch of the most recent
  // CLEAR_ALL. Both feed the same freshness check SAVE_PROGRESS already
  // needs for F07 (a stale session's save vs. a fresher session's
  // checkpoint) — a deletion/clear is modeled as "the freshest possible
  // event for this video (or all videos) just happened," so the exact same
  // comparison also stops a stale, unchanged tab from resurrecting what it
  // just deleted (Roadmap 3.4/T3.3), while a session showing genuine new
  // activity since the deletion (continued playback or a real seek) can
  // still legitimately recreate the entry — that IS "genuinely resumed
  // watching."
  // -----------------------------------------------------------------
  const deletionRevisionAt = new Map();
  let globalRevisionAt = 0;

  /**
   * Roadmap 3.3 — true if `payload` (this save's ownership metadata) is
   * stale relative to the given reference wall-clock time: this session
   * hasn't been meaningfully active since before that reference, and it
   * isn't carrying the explicit-user-seek override. A session with no
   * ownership metadata at all (lastActiveAt not a finite number) is never
   * treated as stale — only progressTracker sends this metadata; nothing
   * else calls SAVE_PROGRESS, but this keeps the check from misfiring on
   * some future/unknown caller instead of silently blocking it.
   */
  function isStaleSave(payload, referenceAtMs) {
    if (payload.explicitUserSeek) return false;
    if (!Number.isFinite(payload.lastActiveAt)) return false;
    return payload.lastActiveAt < referenceAtMs;
  }

  // -----------------------------------------------------------------
  // Migration + repair (moved here verbatim from the old storageManager
  // self-invocation — Phase 1's validation/repair logic, now run once
  // per worker lifetime instead of once per tab/popup, 2.5).
  // -----------------------------------------------------------------

  async function migrate() {
    try {
      const result = await chrome.storage.local.get([SCHEMA_KEY, SETTINGS_KEY]);
      let version = result[SCHEMA_KEY] ?? 1;
      const toWrite = {};

      for (const step of MIGRATION_STEPS) {
        if (version < step.to) {
          // eslint-disable-next-line no-await-in-loop
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

  async function repairDuplicates() {
    try {
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
      }
    } catch (err) {
      // Repair must never block resume/tracking — leave the store as-is.
      console.warn('[YTResume] Duplicate repair failed:', err.message);
    }
  }

  async function runStartup() {
    await migrate();
    await repairDuplicates();
  }

  // -----------------------------------------------------------------
  // Command handlers. Each applies its mutation fully from scratch —
  // no delta/increment commands — so resending one after an unknown
  // outcome (client retry, 2.7) is always safe.
  // -----------------------------------------------------------------

  async function handleSaveProgress({ videoId, time, duration, title, channel, sessionId, lastActiveAt, explicitUserSeek, trigger, ended }) {
    if (!isValidVideoId(videoId)) {
      const message = `saveProgress rejected: unresolved videoId (${JSON.stringify(videoId)})`;
      console.warn('[YTResume]', message);
      throw new Error(message);
    }
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const existingRaw = store[videoId];
    const existing = isPlainObject(existingRaw) ? existingRaw : null;

    // Freshness/ownership check (v4 Phase 3, F07/R23, Roadmap 3.3/3.4).
    // referenceAtMs is the most recent
    // "something fresher already happened for this video" moment this
    // worker knows of: another session's last write, this video's last
    // deletion, or the last clear-all — whichever is latest. A save whose
    // own session hasn't been active since before that, and isn't an
    // explicit user seek, is rejected rather than blindly applied.
    const referenceAtMs = Math.max(
      existing && Number.isFinite(existing.updated) ? existing.updated * 1000 : 0,
      deletionRevisionAt.get(videoId) || 0,
      globalRevisionAt || 0,
    );
    if (isStaleSave({ lastActiveAt, explicitUserSeek }, referenceAtMs)) {
      const message = `saveProgress rejected: stale session (video ${JSON.stringify(videoId)}, trigger ${JSON.stringify(trigger)})`;
      console.warn('[YTResume]', message);
      throw new Error(message);
    }

    const safeTime = safeNumber(time, 0);
    const safeDuration = safeNumber(duration, 0);
    const entry = {
      time: safeTime >= 0 ? safeTime : 0,
      duration: safeDuration > 0 ? safeDuration : 0,
      updated: Math.floor(Date.now() / 1000),
    };

    // A whitespace-only string is treated the same as omitted — a naive
    // truthy check would let it through and overwrite a real stored
    // title/channel with blank-looking text (Roadmap v3 2.4).
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    const resolvedTitle = trimmedTitle ? trimmedTitle.slice(0, MAX_TITLE_LENGTH) : existing?.title;
    if (resolvedTitle) entry.title = resolvedTitle;

    const trimmedChannel = typeof channel === 'string' ? channel.trim() : '';
    const resolvedChannel = trimmedChannel ? trimmedChannel.slice(0, MAX_TITLE_LENGTH) : existing?.channel;
    if (resolvedChannel) entry.channel = resolvedChannel;

    // Identity invariant (Roadmap v3 Phase 1 / TDD §4.6): videoId is the
    // sole identity for a stored entry. A save never changes an existing
    // entry's pinned state.
    if (existing?.pinned) entry.pinned = true;

    // ended (v4 Phase 7, D-104): sticky once true, same OR/preserve
    // semantics as pinned — a later save (e.g. a replay from the start)
    // must not erase a previously-recorded genuine completion.
    if (ended || existing?.ended) entry.ended = true;

    store[videoId] = entry;

    // Eviction: trim to the unpinned cap (Roadmap v3 4.3, D-067) — a
    // pinned entry never counts toward it and is never a removal
    // candidate. Malformed rows are excluded defensively (R17-class).
    storageValidation.enforceUnpinnedCap(store);

    await chrome.storage.local.set({ [STORAGE_KEY]: store });

    return { existingEntryFound: !!existing, entryCountAfterWrite: Object.keys(store).length };
  }

  async function handleDeleteProgress({ videoId }) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    delete store[videoId];
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
    // Roadmap 3.4 — an open, unchanged tab for this video must not
    // recreate the row it just lost on its next passive lifecycle event.
    deletionRevisionAt.set(videoId, Date.now());
  }

  async function handlePin({ videoId }) {
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

  async function handleUnpin({ videoId }) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const entry = store[videoId];
    if (!isPlainObject(entry) || !entry.pinned) return;

    const { pinned, ...rest } = entry; // pinned key is only ever present when true
    store[videoId] = rest;
    storageValidation.enforceUnpinnedCap(store);
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  }

  /**
   * Roadmap 7.5/7.6, D-105 — one coordinated batch mutation. The matching
   * set is derived here, against current storage, at commit time: never a
   * client-supplied id list (T7.4's concurrent-playback case, T7.5's
   * mid-batch-failure case both need this to be a single atomic
   * read-modify-write like every other mutation here, not a sequence of
   * per-id DELETE_PROGRESS commands that could interleave with an
   * unrelated write). Pinned entries are excluded unless includePinned is
   * true (§6.3 "Remove Completed" — pinning already means "keep this").
   * Each removed id also bumps deletionRevisionAt (7.6/Roadmap 3.4), the
   * same mechanism handleDeleteProgress uses, so an open, unchanged tab for
   * a just-removed completed video doesn't recreate the row on its next
   * passive lifecycle event.
   */
  async function handleRemoveCompleted({ includePinned }) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const removedIds = [];

    for (const [key, entry] of Object.entries(store)) {
      if (!isPlainObject(entry)) continue;
      if (!includePinned && entry.pinned) continue;
      if (storageValidation.isCompleteEntry(entry)) removedIds.push(key);
    }

    if (removedIds.length === 0) {
      return { removedCount: 0, removedIds: [] };
    }

    removedIds.forEach((id) => delete store[id]);
    await chrome.storage.local.set({ [STORAGE_KEY]: store });

    const now = Date.now();
    removedIds.forEach((id) => deletionRevisionAt.set(id, now));

    return { removedCount: removedIds.length, removedIds };
  }

  async function handleClearAll() {
    await chrome.storage.local.remove(STORAGE_KEY);
    // Roadmap 3.4 — same reasoning as handleDeleteProgress, applied to
    // every video at once; per-video deletionRevisionAt entries are
    // subsumed by this and don't need clearing (max() already covers it).
    globalRevisionAt = Date.now();
  }

  async function handleSetSettings({ partial }) {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    const current = sanitizeSettingsValue(result[SETTINGS_KEY]);
    const updated = { ...current, ...partial };
    await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
    return updated;
  }

  async function handleResetSettings() {
    const defaults = { ...DEFAULT_SETTINGS };
    await chrome.storage.local.set({ [SETTINGS_KEY]: defaults });
    return defaults;
  }

  async function applyCommand(command, payload) {
    switch (command) {
      case 'SAVE_PROGRESS': return handleSaveProgress(payload);
      case 'DELETE_PROGRESS': return handleDeleteProgress(payload);
      case 'PIN': return handlePin(payload);
      case 'UNPIN': return handleUnpin(payload);
      case 'REMOVE_COMPLETED': return handleRemoveCompleted(payload);
      case 'CLEAR_ALL': return handleClearAll();
      case 'SET_SETTINGS': return handleSetSettings(payload);
      case 'RESET_SETTINGS': return handleResetSettings();
      case 'REPAIR': return repairDuplicates();
      case 'MIGRATE': return migrate();
      default: throw new Error(`Unknown storageWriter command: ${command}`);
    }
  }

  // -----------------------------------------------------------------
  // Single serialized queue (2.3). Startup runs as the queue's first
  // link, so every real command implicitly awaits it ("await writer
  // readiness before any mutation") without the client needing its own
  // readiness handshake. The queue is not itself a durability boundary
  // (see file header) — it exists purely to stop two commands from
  // interleaving their read-modify-write.
  // -----------------------------------------------------------------
  let queueTail = runStartup().catch((err) => {
    console.warn('[YTResume] Worker startup failed:', err.message);
  });

  function enqueue(task) {
    const result = queueTail.then(task, task);
    // Keep the chain alive regardless of whether this link rejected —
    // otherwise every command after a failure would inherit the rejection
    // instead of running.
    queueTail = result.then(() => {}, () => {});
    return result;
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;
    port.onMessage.addListener((msg) => {
      enqueue(() => applyCommand(msg.command, msg.payload))
        .then((result) => {
          try {
            port.postMessage({ id: msg.id, ok: true, result });
          } catch (err) {
            // Port died before the response could be sent — the client's
            // own onDisconnect handling covers this; nothing else to do.
          }
        })
        .catch((err) => {
          try {
            port.postMessage({ id: msg.id, ok: false, error: err.message });
          } catch (_err) {
            // Same as above.
          }
        });
    });
  });
})();
