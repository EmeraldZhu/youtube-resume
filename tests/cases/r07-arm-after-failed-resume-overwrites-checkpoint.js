'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * R7: tracker starts at zero (as if resume never reached the saved 3600s
 * target), arms per bootstrap.js's unconditional `finally`, then playback
 * reaches 60s. Audit observed: the first interval save writes 60s over the
 * stored 3600s checkpoint — the tracker has no knowledge of the target it
 * failed to reach, so a recoverable failure becomes a destructive overwrite.
 */
module.exports = {
  id: 'R7',
  title: 'First interval save after a failed resume overwrites the target checkpoint',
  finding: 'F05',
  async run() {
    const videoId = 'vid0000007a';
    const h = loadExtension({
      seedStorage: {
        youtubeResume: { [videoId]: { time: 3600, duration: 4000, updated: 1000 } },
      },
    });
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm(); // bootstrap.js's finally — unconditional regardless of resume outcome

    video.currentTime = 60; // ordinary playback since
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume[videoId];

    if (stored && stored.time === 60) {
      return {
        verdict: 'reproduces',
        evidence: `Stored entry overwritten: time=${stored.time} (was 3600). Tracker had no record of the failed-resume target.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `stored=${JSON.stringify(stored)}` };
  },
};
