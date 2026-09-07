'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * R14: delete A and save B concurrently, both starting from an
 * A-containing snapshot. Audit observed: A is restored by B's later
 * whole-store write — B's read-modify-write never saw the delete.
 */
module.exports = {
  id: 'R14',
  title: 'Concurrent delete + save resurrects the deleted entry',
  finding: 'F06',
  async run() {
    const idA = 'vidA0000014';
    const idB = 'vidB0000014';
    const h = loadExtension({
      seedStorage: { youtubeResume: { [idA]: { time: 500, duration: 4000, updated: 1 } } },
    });

    const pDel = h.storageManager.deleteProgress(idA);
    const pSave = h.storageManager.saveProgress(idB, 200, 4000, 'Video B', 'Chan B');
    await h.clock.advance(1000);
    await Promise.all([pDel, pSave]);

    const store = h.chromeStorage._raw().youtubeResume || {};

    if (store[idA] && store[idB]) {
      return {
        verdict: 'reproduces',
        evidence: `Deleted entry ${idA} is back in the store alongside ${idB} — B's write, sourced from the pre-delete snapshot, restored it.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `A present=${!!store[idA]} B present=${!!store[idB]}` };
  },
};
