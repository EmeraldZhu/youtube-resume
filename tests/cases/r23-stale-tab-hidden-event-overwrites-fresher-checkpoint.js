'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * R23: shared checkpoint at 3600s (representing a fresher tab's recent
 * write); a stale paused tab at 120s emits a hidden (visibilitychange)
 * event. Audit observed: the shared checkpoint is overwritten with 120s —
 * there is no writer-ownership or freshness check, so any tab's lifecycle
 * event can clobber a much-further-along checkpoint from another tab.
 */
module.exports = {
  id: 'R23',
  title: "A stale tab's hidden event overwrites a fresher shared checkpoint",
  finding: 'F07',
  async run() {
    const videoId = 'vid0000023a';
    const h = loadExtension({
      seedStorage: {
        youtubeResume: { [videoId]: { time: 3600, duration: 4000, updated: 5000 } },
      },
    });
    const staleVideo = new MockVideo({ currentTime: 120, duration: 4000, readyState: 4 });

    h.progressTracker.start(staleVideo, videoId, {});
    h.progressTracker.arm();

    h.document.hidden = true;
    h.document.dispatchEvent({ type: 'visibilitychange' });
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume[videoId];

    if (stored && stored.time === 120) {
      return {
        verdict: 'reproduces',
        evidence: `Shared checkpoint overwritten: time=${stored.time} (was 3600) — the stale tab's hidden-event save has no freshness/ownership check against it.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `stored=${JSON.stringify(stored)}` };
  },
};
