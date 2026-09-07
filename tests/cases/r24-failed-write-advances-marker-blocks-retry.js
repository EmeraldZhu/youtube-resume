'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * R24: a pause write at 1100s rejects; twenty later ticks occur at the
 * same position. Audit observed: only one write attempt is ever made — no
 * periodic retry. lastSavedTime is assigned before saveProgress() resolves,
 * so a failed write still makes the delta guard believe 1100s was already
 * saved, silently suppressing every subsequent interval save attempt.
 */
module.exports = {
  id: 'R24',
  title: 'A failed pause save advances lastSavedTime and blocks all later retries',
  finding: 'F10',
  async run() {
    const videoId = 'vid0000024a';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 1100, duration: 4000, readyState: 4 });

    let saveCallCount = 0;
    h.storageManager.saveProgress = (...args) => {
      saveCallCount += 1;
      return Promise.reject(new Error('simulated storage failure'));
    };

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    video.fire('pause'); // write attempt #1, rejects
    await h.clock.advance(500);

    for (let i = 0; i < 20; i++) {
      h.progressTracker.tick();
      await h.clock.advance(100);
    }

    if (saveCallCount === 1) {
      return {
        verdict: 'reproduces',
        evidence: `saveProgress() was called exactly once despite 20 later ticks at the same position — the delta guard (|1100-1100|<5) suppressed every retry because lastSavedTime already advanced to 1100 before the write's rejection was known.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `saveCallCount=${saveCallCount}` };
  },
};
