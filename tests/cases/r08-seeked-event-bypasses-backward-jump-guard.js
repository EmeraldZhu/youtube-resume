'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * R8: armed tracker at 3600s; a programmatic move to 120s plus a 'seeked'
 * event. Audit observed: saves 120 through the event bypass — the
 * backward-jump guard (BACKWARD_JUMP_THRESHOLD_S) only runs when
 * bypassDelta is false, and every event trigger (including 'seeked',
 * which a native override can also fire) passes bypassDelta=true.
 */
module.exports = {
  id: 'R8',
  title: "A native jump followed by 'seeked' saves through the backward-jump guard",
  finding: 'F05',
  async run() {
    const videoId = 'vid0000008a';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 3600, duration: 4000, readyState: 4 });

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    video.currentTime = 120; // native/programmatic jump
    video.fire('seeked');
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (stored && stored.time === 120) {
      return {
        verdict: 'reproduces',
        evidence: `Entry saved with time=120 via the 'seeked' event despite a 3480s backward jump — bypassDelta=true skips the backward-jump guard entirely for event triggers.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `stored=${JSON.stringify(stored)}` };
  },
};
