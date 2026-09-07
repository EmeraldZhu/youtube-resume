'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R22: A's resume is pending; B starts (superseding A as the active
 * tracker) and its own resume also remains pending; A's resume then
 * finishes. Audit observed: the global tracker for B becomes armed before
 * B's own resume finishes — bootstrap.js's `finally { progressTracker.arm() }`
 * has no generation check, so A's completion arms whichever navigation
 * progressTracker currently points at, not necessarily A's own.
 */
module.exports = {
  id: 'R22',
  title: "A's resume finishing arms B's tracker while B's own resume is still pending",
  finding: 'F03',
  async run() {
    const idA = 'vidA0000022';
    const idB = 'vidB0000022';
    const h = loadExtension({
      href: 'https://www.youtube.com/',
      loadBootstrap: true,
      seedStorage: {
        youtubeResume: {
          [idA]: { time: 500, duration: 4000, updated: 1 },
          [idB]: { time: 500, duration: 4000, updated: 1 },
        },
      },
    });

    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    const gates = [];
    h.resumeManager.tryResume = () => new Promise((resolve) => { gates.push(resolve); });

    h.window._setHref(`https://www.youtube.com/watch?v=${idA}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(200); // A reaches its (stubbed) pending resume

    h.window._setHref(`https://www.youtube.com/watch?v=${idB}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(200); // B supersedes A as active tracker; B's resume also pending

    if (gates.length !== 2) {
      return { verdict: 'not-reproduced', evidence: `expected 2 pending tryResume calls, got ${gates.length}` };
    }

    gates[0](); // A's resume "finishes" — only A's, not B's
    await h.clock.advance(500);

    // B's own resume (gates[1]) is still unresolved. If progressTracker is
    // nonetheless armed, a save now should succeed and be attributed to B.
    video.currentTime = 800;
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);

    const store = h.chromeStorage._raw().youtubeResume || {};
    const savedForB = store[idB] && store[idB].time === 800;

    if (savedForB) {
      return {
        verdict: 'reproduces',
        evidence: `A save for ${idB} succeeded (time=800) after only A's resume resolved — B's tracker was armed by A's unrelated completion while B's own resume (still pending) had not finished.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `store[idB]=${JSON.stringify(store[idB])}` };
  },
};
