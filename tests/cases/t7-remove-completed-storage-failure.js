'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * Phase 7 case (Roadmap 7.5, T7.5): a storage write failure during
 * "Remove completed" must not leave a partial/inconsistent removal state.
 * Because handleRemoveCompleted does its read, compute-the-matching-set,
 * and single chrome.storage.local.set() as one pass through the writer's
 * serialized queue, a failure on that one set() call must leave every
 * entry — matched or not — exactly as it was; the caller's promise
 * rejects instead of reporting a partial removedIds list.
 */
module.exports = {
  id: 'T7-remove-completed-storage-failure',
  title: 'A storage failure mid-batch leaves no partial removal state',
  finding: 'F14/F15',
  async run() {
    const completeId = 'completeFai'; // 11 chars
    const incompleteId = 'incompleteF'; // 11 chars
    const youtubeResume = {
      [completeId]: { time: 999, duration: 1000, updated: 1 },
      [incompleteId]: { time: 50, duration: 1000, updated: 2 },
    };
    const h = loadExtension({ seedStorage: { youtubeResume } });
    await h.clock.advance(1000); // let startup settle

    const originalSet = h.chromeStorage.local.set;
    let setCalls = 0;
    h.chromeStorage.local.set = (...args) => {
      setCalls += 1;
      if (setCalls === 1) return Promise.reject(new Error('simulated storage failure'));
      return originalSet(...args);
    };

    let rejected = false;
    const pRemove = h.storageManager.removeCompleted(false).catch((err) => {
      rejected = !!err;
    });
    await h.clock.advance(1000);
    await pRemove;

    h.chromeStorage.local.set = originalSet; // restore for any further writer activity

    const store = h.chromeStorage._raw().youtubeResume;
    const bothSurvive = !!store[completeId] && !!store[incompleteId];

    if (rejected && bothSurvive) {
      return {
        verdict: 'not-reproduced',
        evidence: `removeCompleted() rejected on the injected write failure; both entries survive untouched: ${JSON.stringify(store)}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `rejected=${rejected} store=${JSON.stringify(store)}`,
    };
  },
};
