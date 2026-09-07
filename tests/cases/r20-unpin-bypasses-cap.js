'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * R20: 200 unpinned entries plus one pinned entry; unpin that entry.
 * Audit observed: 201 unpinned entries remain — eviction only runs inside
 * saveProgress(), so unpinning past the cap doesn't trim anything until a
 * later save happens to occur.
 */
module.exports = {
  id: 'R20',
  title: 'Unpinning into a full library leaves the unpinned cap exceeded',
  finding: 'F13',
  async run() {
    const pinnedId = 'v0000000000';
    const youtubeResume = { [pinnedId]: { time: 10, duration: 100, updated: 0, pinned: true } };
    for (let i = 1; i <= 200; i++) {
      const id = `v${String(i).padStart(10, '0')}`;
      youtubeResume[id] = { time: 10, duration: 100, updated: i };
    }
    const h = loadExtension({ seedStorage: { youtubeResume } });

    await h.clock.advance(1000); // let automatic repair settle first
    const p = h.storageManager.unpinProgress(pinnedId);
    await h.clock.advance(1000);
    await p;

    const store = h.chromeStorage._raw().youtubeResume;
    const unpinnedCount = Object.values(store).filter((e) => !e.pinned).length;

    if (unpinnedCount === 201) {
      return {
        verdict: 'reproduces',
        evidence: `201 unpinned entries remain immediately after unpinning — the 200-entry cap is not enforced until the next saveProgress().`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `unpinnedCount=${unpinnedCount}` };
  },
};
