'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * T3.2 (Roadmap v4 Phase 3): the previously-stale tab from R23 is not
 * permanently locked out. Once it shows genuine renewed activity (real
 * playback progressing, tracked via progressTracker.tick() while
 * !video.paused), its next save should succeed and take ownership of the
 * checkpoint — staleness protection (F07's fix) must not become a
 * permanent block on a tab that was merely backgrounded a moment ago.
 */
module.exports = {
  id: 'T3.2',
  title: 'A previously-stale tab regains write ownership once it shows genuine activity',
  finding: 'F07',
  async run() {
    const videoId = 'vid00003t2a';
    const h = loadExtension({
      seedStorage: {
        youtubeResume: { [videoId]: { time: 3600, duration: 4000, updated: 5000 } },
      },
    });
    const video = new MockVideo({ currentTime: 120, duration: 4000, readyState: 4 });
    video.paused = true;

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    // First attempt, still stale (mirrors R23) — rejected by the writer.
    video.fire('pause');
    await h.clock.advance(500);
    const storedAfterFirstAttempt = h.chromeStorage._raw().youtubeResume[videoId];

    // Genuine renewed activity: playback resumes and progresses.
    video.paused = false;
    video.currentTime = 120;
    await h.clock.advance(6000000); // past the seeded checkpoint's 5000s `updated`
    for (let i = 0; i < 5; i++) {
      h.progressTracker.tick();
      await h.clock.advance(10);
    }
    await h.clock.advance(500);

    const storedAfterActivity = h.chromeStorage._raw().youtubeResume[videoId];

    if (storedAfterFirstAttempt.time === 3600 && storedAfterActivity && storedAfterActivity.time === 120) {
      return {
        verdict: 'not-reproduced',
        evidence: `First attempt correctly rejected (still 3600); after genuine renewed activity, ownership was regained: ${JSON.stringify(storedAfterActivity)}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `afterFirstAttempt=${JSON.stringify(storedAfterFirstAttempt)} afterActivity=${JSON.stringify(storedAfterActivity)}`,
    };
  },
};
