'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R5: saved 3600s; the current media element describes a 30s pre-roll ad
 * (video.duration=30). Audit observed: eligibility (shouldResume) returns
 * false immediately, before any ad-wait/deferral is even consulted —
 * validation runs against the ad's duration, not real content.
 */
module.exports = {
  id: 'R5',
  title: 'shouldResume evaluates against ad duration before any ad deferral',
  finding: 'F04',
  async run() {
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 0, duration: 30, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    let adCheckCalled = false;
    const origIsAdPlaying = h.playerObserver.isAdPlaying;
    h.playerObserver.isAdPlaying = (...args) => {
      adCheckCalled = true;
      return origIsAdPlaying(...args);
    };

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vid00000005', {});
    await h.clock.advance(500);
    await p;

    const toast = h.document.querySelector('#yt-resume-toast');

    if (!adCheckCalled && !toast) {
      return {
        verdict: 'reproduces',
        evidence: 'tryResume returned without ever consulting isAdPlaying() — shouldResume(3600, 30, ...) already failed against the ad-sized duration.',
      };
    }
    return { verdict: 'not-reproduced', evidence: `adCheckCalled=${adCheckCalled} toast=${!!toast}` };
  },
};
