'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * R9: armed tracker at 1000s; a deliberate user-seek-equivalent move to 0s
 * plus 'seeked' (below minWatchSeconds, so it saves nothing and does not
 * reset lastSavedTime); playback then reaches 60s. Audit observed: the
 * next interval save is rejected — the claimed interval exemption for a
 * genuine rewind does not hold once the below-minimum guard blocks the
 * seeked-event save that would have reset the baseline.
 */
module.exports = {
  id: 'R9',
  title: 'A below-minimum rewind leaves a stale lastSavedTime baseline that rejects the next interval save',
  finding: 'F08',
  async run() {
    const videoId = 'vid0000009a';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 1000, duration: 4000, readyState: 4 });

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    video.currentTime = 0; // deliberate rewind
    video.fire('seeked'); // attemptSave(true,'seeked') -> belowMinWatch, no save, lastSavedTime untouched
    await h.clock.advance(100);

    video.currentTime = 60; // playback resumes and crosses the threshold again
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (!stored) {
      return {
        verdict: 'reproduces',
        evidence: `No entry ever saved for ${videoId}: the interval save at current=60 was rejected as a spurious 940s backward jump from the stale lastSavedTime=1000 baseline.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `stored=${JSON.stringify(stored)}` };
  },
};
