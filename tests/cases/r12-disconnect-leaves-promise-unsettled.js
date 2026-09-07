'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * R12: pending player discovery, then disconnect() is called. Audit
 * observed: the waitForVideo() promise is still unsettled 20 seconds
 * later — disconnect() clears the observer and timeout without settling
 * the promise it was guarding, leaving the caller's await hung forever.
 */
module.exports = {
  id: 'R12',
  title: 'playerObserver.disconnect() leaves a pending waitForVideo() promise unsettled',
  finding: 'F03',
  async run() {
    const h = loadExtension();
    // No #movie_player/video in the DOM — waitForVideo() takes the
    // MutationObserver + 10s-timeout branch.
    const p = h.playerObserver.waitForVideo();
    let settled = false;
    p.then(() => { settled = true; }, () => { settled = true; });

    h.playerObserver.disconnect();
    await h.clock.advance(20000);

    if (!settled) {
      return {
        verdict: 'reproduces',
        evidence: 'waitForVideo() promise never resolved or rejected after disconnect() + 20s — the timeout that would have rejected it was cleared by disconnect().',
      };
    }
    return { verdict: 'not-reproduced', evidence: `settled=${settled}` };
  },
};
