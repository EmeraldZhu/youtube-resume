'use strict';

const { loadExtension } = require('../lib/harness');
const { settle } = require('../lib/settle');

/**
 * R16: repair encounters key `aaaaaaaaaaab` (12 characters, invalid).
 * Audit observed: rewritten to a DIFFERENT key `aaaaaaaaaaa` (an unproven
 * 11-char substring match), reassigning the data to an identity the
 * original key never actually specified.
 */
module.exports = {
  id: 'R16',
  title: 'A malformed 12-char key is truncated into an unproven different identity',
  finding: 'F11',
  async run() {
    const badKey = 'aaaaaaaaaaab';
    const guessedId = 'aaaaaaaaaaa';
    const h = loadExtension({
      seedStorage: { youtubeResume: { [badKey]: { time: 10, duration: 100, updated: 5 } } },
    });

    await h.clock.advance(1000);
    const all = await settle(h.clock, h.storageManager.getAllProgress());

    if (all[guessedId] && !all[badKey]) {
      return {
        verdict: 'reproduces',
        evidence: `Key '${badKey}' was rewritten to '${guessedId}' — resolveVideoId's substring fallback truncated an unproven identity instead of quarantining it.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `all=${JSON.stringify(all)}` };
  },
};
