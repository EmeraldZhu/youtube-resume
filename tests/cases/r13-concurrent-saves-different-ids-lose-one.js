'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * R13: two concurrent saves for separate valid IDs, both reading the
 * initial (empty) store before either writes. Audit observed: only the
 * second entry survives — each save does its own read-modify-write of the
 * whole youtubeResume object, so the later set() clobbers the earlier one.
 */
module.exports = {
  id: 'R13',
  title: 'Concurrent saves for two different video IDs lose one entry',
  finding: 'F06',
  async run() {
    const h = loadExtension();
    const idA = 'vidA0000013';
    const idB = 'vidB0000013';

    const pA = h.storageManager.saveProgress(idA, 100, 4000, 'Video A', 'Chan A');
    const pB = h.storageManager.saveProgress(idB, 200, 4000, 'Video B', 'Chan B');
    await h.clock.advance(1000);
    await Promise.all([pA, pB]);

    const store = h.chromeStorage._raw().youtubeResume || {};
    const hasA = !!store[idA];
    const hasB = !!store[idB];

    if (hasA !== hasB) { // exactly one survived
      return {
        verdict: 'reproduces',
        evidence: `Only one entry survived the concurrent saves: A present=${hasA}, B present=${hasB}. Both saves read the same empty snapshot and each wrote the whole map back.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `A present=${hasA}, B present=${hasB}` };
  },
};
