'use strict';

const { loadExtension } = require('../lib/harness');
const { settle } = require('../lib/settle');

/**
 * Phase 1 case (roadmap 1.2/1.3/T1.1/T1.3): confirms the repair pass's
 * quarantine claim directly, rather than only inferring it from the raw
 * entry's absence (as R16/R17 do) — a malformed-value row and an
 * unresolved-key row must both still be readable from
 * youtubeResumeQuarantine after repair, not merely gone from youtubeResume.
 */
module.exports = {
  id: 'T1-quarantine-visible',
  title: 'Quarantined rows remain inspectable under youtubeResumeQuarantine',
  finding: 'F11/F12',
  async run() {
    const nullKey = 'nullkey0002';
    const badKey = 'bbbbbbbbbbbb'; // 12 chars, unresolved
    const h = loadExtension({
      seedStorage: {
        youtubeResume: {
          [nullKey]: null,
          [badKey]: { time: 5, duration: 50, updated: 9 },
        },
      },
    });

    await h.clock.advance(1000);
    await settle(h.clock, h.storageManager.getAllProgress());

    const raw = h.chromeStorage._raw();
    const quarantine = raw.youtubeResumeQuarantine;
    const nullEntryQuarantined = quarantine && quarantine.entries && quarantine.entries[nullKey]
      && quarantine.entries[nullKey].reason === 'malformed-value';
    const badKeyQuarantined = quarantine && quarantine.entries && quarantine.entries[badKey]
      && quarantine.entries[badKey].reason === 'unresolved-key'
      && quarantine.entries[badKey].entry.time === 5;
    const notInLiveStore = !raw.youtubeResume || (!(nullKey in raw.youtubeResume) && !(badKey in raw.youtubeResume));

    if (nullEntryQuarantined && badKeyQuarantined && notInLiveStore) {
      return {
        verdict: 'not-reproduced',
        evidence: `Both rows quarantined and inspectable: ${JSON.stringify(quarantine.entries)}`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `quarantine=${JSON.stringify(quarantine)}, youtubeResume=${JSON.stringify(raw.youtubeResume)}`,
    };
  },
};
