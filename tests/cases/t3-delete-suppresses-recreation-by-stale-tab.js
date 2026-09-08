'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * T3.3 (Roadmap v4 Phase 3): a completed entry is deleted (e.g. from the
 * popup) while an unrelated, unchanged tab for that same video stays open.
 * That tab's next passive lifecycle event (pause/visibility) must not
 * recreate the row it just lost — the deletion bumps a worker-side
 * revision the tab's own (stale) session hasn't been active since.
 */
module.exports = {
  id: 'T3.3',
  title: "Deleting an entry suppresses recreation from an unrelated, unchanged tab's next lifecycle event",
  finding: 'F07',
  async run() {
    const videoId = 'vid00003t3a';
    const h = loadExtension({
      seedStorage: {
        youtubeResume: { [videoId]: { time: 1800, duration: 4000, updated: 1000 } },
      },
    });
    const video = new MockVideo({ currentTime: 1800, duration: 4000, readyState: 4 });
    video.paused = true; // unchanged/passive tab, same as R23's stale tab

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();
    await h.clock.advance(100);

    // Delete via the same path the popup uses.
    const pDelete = h.storageManager.deleteProgress(videoId);
    await h.clock.advance(2000);
    await pDelete;

    const afterDelete = h.chromeStorage._raw().youtubeResume[videoId];

    // The unrelated, unchanged tab's next passive lifecycle event.
    h.document.hidden = true;
    h.document.dispatchEvent({ type: 'visibilitychange' });
    await h.clock.advance(2000);

    const afterStaleEvent = h.chromeStorage._raw().youtubeResume[videoId];

    if (afterDelete === undefined && afterStaleEvent === undefined) {
      return {
        verdict: 'not-reproduced',
        evidence: 'Entry stayed deleted after the unrelated tab\'s visibilitychange fired — no recreation.',
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `afterDelete=${JSON.stringify(afterDelete)} afterStaleEvent=${JSON.stringify(afterStaleEvent)}`,
    };
  },
};
