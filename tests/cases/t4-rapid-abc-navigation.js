'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T4.1 (Phase 4 roadmap) — rapid A -> B -> C navigation, extending R21's
 * two-navigation shape to three. A's settings read is gated open; B and C
 * both fully initialize and complete while A is still blocked; A's read
 * then resolves last. Only C (the newest, currently-active navigation) may
 * ever own the tracker or receive a save.
 */
module.exports = {
  id: 'T4.1',
  title: 'Rapid A->B->C navigation leaves only the newest navigation active',
  finding: 'F03',
  async run() {
    const idA = 'vidA0000041';
    const idB = 'vidB0000041';
    const idC = 'vidC0000041';
    const h = loadExtension({ href: 'https://www.youtube.com/', loadBootstrap: true });

    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

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
    h.document.dispatchEvent({ type: 'yt-navigate-finish' }); // A starts, blocks
    await h.clock.advance(50);

    h.window._setHref(`https://www.youtube.com/watch?v=${idB}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' }); // B starts and fully completes
    await h.clock.advance(200);

    h.window._setHref(`https://www.youtube.com/watch?v=${idC}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' }); // C starts and fully completes
    await h.clock.advance(200);

    releaseA(); // A's settings read finally resolves, long after B and C finished
    await h.clock.advance(2000);

    video.currentTime = 500;
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);

    const store = h.chromeStorage._raw().youtubeResume || {};
    const savedForA = !!store[idA];
    const savedForB = !!store[idB];
    const savedForC = !!store[idC];

    if (!savedForA && !savedForB && savedForC) {
      return {
        verdict: 'not-reproduced',
        evidence: `Only C ever owned the tracker: savedForA=${savedForA} savedForB=${savedForB} savedForC=${savedForC}`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `Stale navigation leaked into the active tracker: savedForA=${savedForA} savedForB=${savedForB} savedForC=${savedForC}`,
    };
  },
};
