'use strict';

const { loadExtension } = require('../lib/harness');
const { settle } = require('../lib/settle');

/**
 * R19: concurrent saveSettings() calls, one setting rewindSeconds=10, the
 * other showToast=false. Audit observed: the rewind change is lost
 * (reverts to default 2) while the toast change survives — same
 * read-modify-write race as R13, applied to youtubeResumeSettings.
 */
module.exports = {
  id: 'R19',
  title: 'Concurrent settings writes lose one of the two changes',
  finding: 'F06',
  async run() {
    const h = loadExtension();

    const pA = h.storageManager.saveSettings({ rewindSeconds: 10 });
    const pB = h.storageManager.saveSettings({ showToast: false });
    await h.clock.advance(1000);
    await Promise.all([pA, pB]);

    const finalSettings = await settle(h.clock, h.storageManager.getSettings());

    if (finalSettings.rewindSeconds === 2 && finalSettings.showToast === false) {
      return {
        verdict: 'reproduces',
        evidence: `Final settings: rewindSeconds=${finalSettings.rewindSeconds} (default, change lost), showToast=${finalSettings.showToast} (survived) — one concurrent write clobbered the other.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: JSON.stringify(finalSettings) };
  },
};
