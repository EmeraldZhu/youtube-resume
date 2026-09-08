'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * T5.6 (Roadmap v4 Phase 5, F05/F08 — CLAUDE.md hard constraint: "Deliberate
 * rewind and Restart keep working") — R8's fix (Phase 5) makes an
 * UNcorroborated 'seeked' save subject to the backward-jump guard, closing
 * the native-jump-plus-synthetic-seeked hole. That fix must not also catch
 * a REAL deliberate rewind landing well above minWatchSeconds (e.g. a user
 * scrubbing back from 3600s to 500s) — corroborated by real keyboard/
 * pointer input, that save must still go through.
 */
module.exports = {
  id: 'T5.6-deliberate-rewind',
  title: 'A real, corroborated large rewind above minWatchSeconds still saves',
  finding: 'F05/F08',
  async run() {
    const videoId = 'vidT56rew01';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 3600, duration: 4000, readyState: 4 });

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    h.document.dispatchEvent({ type: 'mousedown' }); // real scrubber drag
    video.currentTime = 500; // the user's deliberate rewind, well above minWatchSeconds
    video.fire('seeked');
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (stored && stored.time === 500) {
      return {
        verdict: 'not-reproduced',
        evidence: `Corroborated deliberate rewind saved normally (time=${stored.time}), unaffected by the R8 guard on uncorroborated seeks.`,
      };
    }
    return { verdict: 'reproduces', evidence: `stored=${JSON.stringify(stored)}` };
  },
};
