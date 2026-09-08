'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * Phase 2 case (Roadmap v4 2.4/T2.4, D-102): 19 entries already pinned (one
 * short of the 20-pin cap), then two more pin() calls fire concurrently for
 * two different unpinned entries. Before the serialized writer, each call
 * read the same pre-pin snapshot (pinnedCount=19) and both would pass the
 * `pinnedCount >= MAX_PINNED` check, landing at 21 pinned regardless of
 * which one "arrived" first. The worker's single queue means the second
 * call's read reflects the first call's already-applied write.
 */
module.exports = {
  id: 'T2.4',
  title: 'Concurrent pin operations near the cap never exceed it, regardless of arrival order',
  finding: 'F06',
  async run() {
    const youtubeResume = {};
    for (let i = 1; i <= 19; i++) {
      youtubeResume[`p${String(i).padStart(10, '0')}`] = { time: 10, duration: 100, updated: i, pinned: true };
    }
    const idA = 'unpinnedA01';
    const idB = 'unpinnedB01';
    youtubeResume[idA] = { time: 10, duration: 100, updated: 100 };
    youtubeResume[idB] = { time: 10, duration: 100, updated: 200 };

    const h = loadExtension({ seedStorage: { youtubeResume } });
    await h.clock.advance(1000); // let startup (migrate + repair) settle first

    // Promise.allSettled() must wrap both promises *before* the clock
    // advances — it attaches its own handler synchronously, so neither
    // promise is ever briefly unhandled between rejecting (mid-advance)
    // and being inspected (Node's default unhandledRejection is fatal).
    const settledPromise = Promise.allSettled([
      h.storageManager.pinProgress(idA),
      h.storageManager.pinProgress(idB),
    ]);
    await h.clock.advance(1000);
    const results = await settledPromise;

    const store = h.chromeStorage._raw().youtubeResume;
    const pinnedCount = Object.values(store).filter((e) => e.pinned).length;
    const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;

    const capRespected = pinnedCount <= 20;
    const exactlyOneWon = fulfilledCount === 1 && pinnedCount === 20;

    if (capRespected && exactlyOneWon) {
      return {
        verdict: 'not-reproduced',
        evidence: `pinnedCount=${pinnedCount} (cap respected), exactly one of the two concurrent pin() calls succeeded (the other rejected: pin cap reached).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `pinnedCount=${pinnedCount}, fulfilledCount=${fulfilledCount} (expected exactly 1 fulfilled and pinnedCount=20)`,
    };
  },
};
