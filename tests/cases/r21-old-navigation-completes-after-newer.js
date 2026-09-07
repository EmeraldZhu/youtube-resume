'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R21: a settings read for navigation A is deferred; navigation B starts
 * and completes its own initialization while A is still pending; A's read
 * finally resolves. Audit observed: A replaces B as the active tracker —
 * there is no generation/cancellation check, so late-resolving async work
 * from an old navigation can still take over global module state after a
 * newer navigation has already finished initializing.
 */
module.exports = {
  id: 'R21',
  title: "A stale navigation's delayed settings read overwrites a newer, already-initialized tracker",
  finding: 'F03',
  async run() {
    const idA = 'vidA0000021';
    const idB = 'vidB0000021';
    const h = loadExtension({ href: 'https://www.youtube.com/', loadBootstrap: true });

    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    // Gate A's settings read open-ended; let every other getSettings() call
    // (B's, and A's own second call if any) resolve immediately via the
    // real implementation.
    const originalGetSettings = h.storageManager.getSettings;
    let releaseA;
    let gatedOnce = false;
    h.storageManager.getSettings = (...args) => {
      if (!gatedOnce) {
        gatedOnce = true;
        return new Promise((resolve) => { releaseA = () => resolve({}); });
      }
      return originalGetSettings(...args);
    };

    h.window._setHref(`https://www.youtube.com/watch?v=${idA}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' }); // A starts, blocks on the gated settings read
    await h.clock.advance(50);

    h.window._setHref(`https://www.youtube.com/watch?v=${idB}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' }); // B starts and fully completes
    await h.clock.advance(2000);

    releaseA(); // A's settings read finally resolves, after B already finished
    await h.clock.advance(2000);

    // Drive playback and let the interval save attribute it to whichever
    // videoId progressTracker.start() was called with last.
    video.currentTime = 500;
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);

    const store = h.chromeStorage._raw().youtubeResume || {};
    const savedForA = !!store[idA];
    const savedForB = !!store[idB];

    if (savedForA && !savedForB) {
      return {
        verdict: 'reproduces',
        evidence: `Playback after both navigations saved under ${idA} (the stale, later-resolving navigation), not ${idB} (the newer, already-fully-initialized one) — A's delayed start() call replaced B's active tracker.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `savedForA=${savedForA} savedForB=${savedForB}` };
  },
};
