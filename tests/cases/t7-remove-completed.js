'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * Phase 7 case (Roadmap 7.5/7.6, D-105): storageManager.removeCompleted()
 * against a mixed library — incomplete, complete-unpinned, complete-pinned,
 * and a malformed row. Default call (includePinned=false) must remove only
 * the complete-unpinned entry, never touch the incomplete or pinned-complete
 * entries, and never throw on the malformed row. A second call with
 * includePinned=true must then also remove the complete-pinned entry. A
 * zero-match call must report removedCount 0 and mutate nothing. Also
 * verifies 7.6's deletion-revision integration: a stale save for a
 * just-removed video (no explicit user seek, no recent activity) is
 * rejected, same mechanism as an ordinary deleteProgress (R23/T3.3).
 */
module.exports = {
  id: 'T7-remove-completed',
  title: 'removeCompleted matches only the completion predicate, respects pinned scope, integrates deletion revision',
  finding: 'F14/F15',
  async run() {
    const evidence = [];
    let allOk = true;
    function check(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      allOk = allOk && ok;
      evidence.push(`${label}=${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${ok ? 'OK' : 'FAIL'}`);
    }

    // Video-ID-shaped keys (11 chars) so the repair pass never quarantines
    // them before this test's own assertions run.
    const incompleteId = 'incompleteV'; // 11 chars
    const completeUnpinnedId = 'completeUnp'; // 11 chars
    const completePinnedId = 'completePin'; // 11 chars
    const malformedId = 'malformedRw'; // 11 chars, value injected after startup below

    const youtubeResume = {
      [incompleteId]: { time: 50, duration: 4000, updated: 1 },
      [completeUnpinnedId]: { time: 3999, duration: 4000, updated: 2 }, // legacy boundary
      [completePinnedId]: { time: 100, duration: 100, updated: 3, pinned: true },
    };
    const h = loadExtension({ seedStorage: { youtubeResume } });
    await h.clock.advance(1000); // let startup (migrate + repair) settle first

    // Inject a malformed row AFTER startup repair has already run, so it's
    // present for handleRemoveCompleted's own defensive isPlainObject guard
    // to skip (T7.1's "malformed entries" case) rather than being quarantined
    // away by repair before this test can exercise that guard.
    const postRepair = h.chromeStorage._raw();
    postRepair.youtubeResume[malformedId] = null;
    const pInject = h.chromeStorage.local.set({ youtubeResume: postRepair.youtubeResume });
    await h.clock.advance(1000);
    await pInject;

    // Default call: pinned excluded.
    const pDefault = h.storageManager.removeCompleted(false);
    await h.clock.advance(1000);
    const resultDefault = await pDefault;
    let store = h.chromeStorage._raw().youtubeResume;
    check('default-removedIds', resultDefault.removedIds.sort(), [completeUnpinnedId]);
    check('default-incomplete-survives', !!store[incompleteId], true);
    check('default-pinned-survives', !!store[completePinnedId], true);
    check('default-unpinned-removed', !store[completeUnpinnedId], true);
    check('default-malformed-row-untouched-no-throw', Object.prototype.hasOwnProperty.call(store, malformedId), true);

    // Second call, includePinned=true: now removes the pinned-complete entry.
    const pIncludePinned = h.storageManager.removeCompleted(true);
    await h.clock.advance(1000);
    const resultIncludePinned = await pIncludePinned;
    store = h.chromeStorage._raw().youtubeResume;
    check('include-pinned-removedIds', resultIncludePinned.removedIds, [completePinnedId]);
    check('pinned-now-removed', !store[completePinnedId], true);
    check('incomplete-still-survives', !!store[incompleteId], true);

    // Zero-match call: nothing left to remove.
    const pZero = h.storageManager.removeCompleted(true);
    await h.clock.advance(1000);
    const resultZero = await pZero;
    check('zero-match-count', resultZero.removedCount, 0);
    check('zero-match-mutates-nothing', Object.keys(h.chromeStorage._raw().youtubeResume).sort(), [incompleteId, malformedId].sort());

    // 7.6 — deletion-revision integration: a stale (no explicit seek,
    // inactive-since-before) save for the just-removed video must be
    // rejected, exactly like an ordinary deleteProgress (R23/T3.3).
    // .catch() attached synchronously, before the clock advances — the
    // rejection fires mid-advance and must never go a turn unhandled
    // (same reasoning as T2.4's Promise.allSettled note).
    const pStale = h.storageManager.saveProgress(completeUnpinnedId, 10, 4000, undefined, undefined, {
      sessionId: 'stale-session', lastActiveAt: 0, explicitUserSeek: false, trigger: 'visibility',
    }).then(() => null, (err) => err);
    await h.clock.advance(1000);
    const staleResult = await pStale;
    // Cross-realm note: staleResult is an Error constructed inside the vm
    // sandbox's own realm, so `instanceof Error` (this file's outer-realm
    // Error) would false-negative — duck-type on .message instead.
    const staleSaveRejected = !!staleResult && typeof staleResult.message === 'string'
      && /stale session/.test(staleResult.message);
    check('stale-save-after-removal-rejected', staleSaveRejected, true);

    return {
      verdict: allOk ? 'not-reproduced' : 'reproduces',
      evidence: evidence.join(' | '),
    };
  },
};
