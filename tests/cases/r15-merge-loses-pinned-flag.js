'use strict';

const { loadExtension } = require('../lib/harness');
const { settle } = require('../lib/settle');

/**
 * R15: repair merges a pinned canonical entry with a whitespace-duplicate
 * key for the same video ID. Audit observed: the merged entry loses
 * `pinned` — mergeEntryPair() only copies time/duration/updated/title/
 * channel, never the pin flag.
 */
module.exports = {
  id: 'R15',
  title: 'Duplicate-key repair merge drops the pinned flag',
  finding: 'F11',
  async run() {
    const canonicalId = 'vid0000015a';
    const dupKey = ` ${canonicalId} `; // whitespace-wrapped duplicate, resolves to the same ID
    const h = loadExtension({
      seedStorage: {
        youtubeResume: {
          [canonicalId]: { time: 100, duration: 4000, updated: 100, pinned: true },
          [dupKey]: { time: 50, duration: 4000, updated: 200 },
        },
      },
    });

    await h.clock.advance(1000); // let the automatic migrate().then(repairDuplicates) run

    const all = await settle(h.clock, h.storageManager.getAllProgress());
    const merged = all[canonicalId];

    if (merged && !merged.pinned && Object.keys(all).filter((k) => k.trim() === canonicalId).length === 1) {
      return {
        verdict: 'reproduces',
        evidence: `Merged entry: ${JSON.stringify(merged)} — pinned flag from the canonical entry is gone.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `all=${JSON.stringify(all)}` };
  },
};
