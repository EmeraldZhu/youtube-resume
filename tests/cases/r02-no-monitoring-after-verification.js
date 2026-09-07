'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R2: verification completes successfully; a native jump to 120s happens
 * afterward. Audit observed: position remains 120s with no correction
 * during another 10 seconds — nothing monitors post-verification overrides.
 */
module.exports = {
  id: 'R2',
  title: 'A later native override goes uncorrected after verification completes',
  finding: 'F01',
  async run() {
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4, seeking: false });
    buildPlayerDom(h.document, { withVideo: video });

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vid00000002', {});
    await h.clock.advance(2000);
    await p;

    // tryResume has fully resolved (seek verified, one native-override check
    // already passed). Simulate a later native jump the extension has no
    // further hook for.
    video.currentTime = 120;
    await h.clock.advance(10000);

    if (video.currentTime === 120) {
      return {
        verdict: 'reproduces',
        evidence: 'Position stayed at 120s for 10s after tryResume() resolved; no observer corrected it.',
      };
    }
    return { verdict: 'not-reproduced', evidence: `currentTime=${video.currentTime}` };
  },
};
