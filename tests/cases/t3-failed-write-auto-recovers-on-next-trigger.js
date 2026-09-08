'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * T3.4 (Roadmap v4 Phase 3): a single injected storage failure on a pause
 * save must not strand the sample. Once storage recovers, the very next
 * natural save trigger (here, the interval tick) must retry and persist
 * the same checkpoint automatically — no separate user action required
 * (R24's failure-to-retry closed by the dirty/committed split; this case
 * additionally proves the *recovery* half once the failure clears).
 */
module.exports = {
  id: 'T3.4',
  title: 'A single failed write recovers automatically on the next natural trigger',
  finding: 'F10',
  async run() {
    const videoId = 'vid00003t4a';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 1100, duration: 4000, readyState: 4 });
    video.paused = false;

    let callCount = 0;
    const original = h.storageManager.saveProgress.bind(h.storageManager);
    h.storageManager.saveProgress = (...args) => {
      callCount += 1;
      if (callCount === 1) return Promise.reject(new Error('simulated storage failure'));
      return original(...args);
    };

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    video.fire('pause'); // write #1 — rejects
    await h.clock.advance(500);

    for (let i = 0; i < 5; i++) {
      h.progressTracker.tick(); // 5th tick triggers the interval save — write #2
      await h.clock.advance(1100);
    }
    await h.clock.advance(2000);

    const stored = (h.chromeStorage._raw().youtubeResume || {})[videoId];

    if (callCount >= 2 && stored && stored.time === 1100) {
      return {
        verdict: 'not-reproduced',
        evidence: `Recovered without any new user action: callCount=${callCount}, stored=${JSON.stringify(stored)}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `callCount=${callCount} stored=${JSON.stringify(stored)}`,
    };
  },
};
