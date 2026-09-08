'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T5.7 (Roadmap v4 Phase 5) — storageManager.getProgress() rejects for this
 * navigation (a transient storage-read error). Resume must degrade
 * gracefully (CLAUDE.md: "if resume fails, tracking still runs") rather
 * than crashing bootstrap.js's pipeline or leaving tracking permanently
 * disarmed. Note: since the read itself failed, this navigation never
 * learns whether a checkpoint even exists to protect — full recovery
 * (retry the read, then protect/resume against whatever it finds) is
 * Phase 6's Deferred Recovery Lifecycle, not this phase's; what Phase 5
 * guarantees is that the failure is contained and ordinary tracking still
 * works afterward.
 */
module.exports = {
  id: 'T5.7-storage-read-failure',
  title: 'A storage-read failure degrades gracefully instead of crashing the resume pipeline',
  finding: 'F05',
  async run() {
    const videoId = 'vidT57read1';
    const h = loadExtension({ href: 'https://www.youtube.com/', loadBootstrap: true });
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    h.storageManager.getProgress = () => Promise.reject(new Error('storage unavailable'));

    h.window._setHref(`https://www.youtube.com/watch?v=${videoId}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(2000);

    const warned = h.warnings.some((w) => /storage unavailable|Resume pipeline failed/i.test(w));

    // Tracking must still work after the failure — ordinary playback and an
    // interval save should succeed normally.
    video.currentTime = 60;
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);
    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (warned && stored && stored.time === 60) {
      return {
        verdict: 'not-reproduced',
        evidence: `Storage-read failure logged (${warned}) and contained; tracking still armed and saved normally afterward (time=${stored.time}).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `warned=${warned} stored=${JSON.stringify(stored)}`,
    };
  },
};
