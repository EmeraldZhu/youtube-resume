'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * T6 (Roadmap v4 Phase 6, 6.5/6.7) — an SPA exit (progressTracker.stop(),
 * as bootstrap.js's teardown calls it) lands exactly while a seek is
 * in-flight (video.seeking === true). The live position must not be
 * persisted as a completed sample (6.7); instead the last known-good
 * sample recorded before the seek started must be flushed (6.5).
 */
module.exports = {
  id: 'T6.spaExitPendingSeek',
  title: 'SPA exit during a pending seek retains the last confirmed sample, not the mid-seek one',
  finding: 'F09',
  async run() {
    const videoId = 'vid0t6spaex';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 100, duration: 4000, readyState: 4 });

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    // A clean tick records 100 as the last known-good sample.
    h.progressTracker.tick();

    // A seek begins (e.g. the user scrubbed) but hasn't settled yet when
    // the SPA navigation away happens.
    video.seeking = true;
    video.currentTime = 3000; // wherever the scrubber currently reads — not a real, settled position

    h.progressTracker.stop();
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (stored && stored.time === 100) {
      return {
        verdict: 'not-reproduced',
        evidence: `Teardown flushed the last known-good sample (100), not the mid-seek position (3000): ${JSON.stringify(stored)}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `Teardown did not retain the last-good sample correctly — stored=${JSON.stringify(stored)}.`,
    };
  },
};
