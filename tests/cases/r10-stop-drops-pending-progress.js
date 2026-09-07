'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * R10: tracker at 100s; position reaches 104s; stop() is called before the
 * next interval tick. Audit observed: no final save — stop() removes
 * listeners/resets state without flushing the last observed sample.
 */
module.exports = {
  id: 'R10',
  title: 'stop() drops pending progress with no flush',
  finding: 'F09',
  async run() {
    const videoId = 'vid0000010a';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 100, duration: 4000, readyState: 4 });

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    video.currentTime = 104; // playback continued a little, but no tick/event fired
    h.progressTracker.stop();
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (!stored) {
      return {
        verdict: 'reproduces',
        evidence: 'stop() ran with the position at 104s and no save occurred — the sample was silently dropped.',
      };
    }
    return { verdict: 'not-reproduced', evidence: `stored=${JSON.stringify(stored)}` };
  },
};
