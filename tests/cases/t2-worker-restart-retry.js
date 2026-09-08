'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * Phase 2 case (Roadmap v4 2.3/2.7/T2.5, D-102): the service worker is
 * terminated (simulating the browser killing an idle MV3 worker) while a
 * saveProgress() command is in flight, then respawns shortly after. The
 * client's outstanding request has no known outcome (the port dropped
 * before a response arrived) — it must retry with bounded backoff once the
 * worker is back, not lose the write and not leave the caller's promise
 * hanging forever. A second, independent command issued after the restart
 * must also succeed normally, proving the fresh worker instance is fully
 * functional (its own startup — migrate + repair — reran without issue).
 */
module.exports = {
  id: 'T2.5',
  title: 'A command in flight when the worker terminates survives via client-side retry after restart',
  finding: 'F06',
  async run() {
    const idA = 'termtest001';
    const idB = 'termtest002';
    const h = loadExtension();
    await h.clock.advance(1000); // let the initial connect + startup settle

    const pSave = h.storageManager.saveProgress(idA, 42, 999, 'Term Test', 'Chan');
    h.terminateWorker(); // kill mid-flight — the in-progress command's outcome is now unknown to the client
    await h.clock.advance(50); // still down: the client's first retry (100ms) hasn't fired yet
    h.restartWorker(); // browser respawns the worker
    await h.clock.advance(3000); // client's retry fires once the worker is back; should now succeed

    let saveSucceeded = true;
    let saveError = null;
    try {
      await pSave;
    } catch (err) {
      saveSucceeded = false;
      saveError = err.message;
    }

    const storeAfterFirst = h.chromeStorage._raw().youtubeResume || {};
    const firstEntryCorrect = storeAfterFirst[idA] && storeAfterFirst[idA].time === 42;

    // A second, independent command after the restart must also work —
    // proves the new worker instance is fully operational, not just that
    // the one retried command happened to land. Capture the promise before
    // advancing the clock (the clock is what drives its message delivery).
    const pSave2 = h.storageManager.saveProgress(idB, 7, 500, 'Term Test 2', 'Chan');
    await h.clock.advance(1000);
    await pSave2;
    const storeAfterSecond = h.chromeStorage._raw().youtubeResume || {};
    const secondEntryCorrect = storeAfterSecond[idB] && storeAfterSecond[idB].time === 7;

    if (saveSucceeded && firstEntryCorrect && secondEntryCorrect) {
      return {
        verdict: 'not-reproduced',
        evidence: `First save survived worker termination via retry (idA entry: ${JSON.stringify(storeAfterFirst[idA])}); a fresh command after restart also succeeded (idB entry: ${JSON.stringify(storeAfterSecond[idB])}).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `saveSucceeded=${saveSucceeded} saveError=${saveError} firstEntryCorrect=${firstEntryCorrect} secondEntryCorrect=${secondEntryCorrect}`,
    };
  },
};
