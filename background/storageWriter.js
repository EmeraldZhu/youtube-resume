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

  async function handleSaveProgress({ videoId, time, duration, title, channel }) {
    if (!isValidVideoId(videoId)) {
      const message = `saveProgress rejected: unresolved videoId (${JSON.stringify(videoId)})`;
      console.warn('[YTResume]', message);
      throw new Error(message);
    }
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] ?? {};
    const existingRaw = store[videoId];
    const existing = isPlainObject(existingRaw) ? existingRaw : null;

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

  async function handleClearAll() {
    await chrome.storage.local.remove(STORAGE_KEY);
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
