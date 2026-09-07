'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R1 (audit appendix): saved 3600s; media stays seeking=true, readyState 1.
 * Audit observed: toast shown for 3598s at 1150ms despite the pending seek.
 */
module.exports = {
  id: 'R1',
  title: 'Toast shown while seek is still pending (seeking=true, readyState=1)',
  finding: 'F01',
  async run() {
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 1, seeking: true });
    buildPlayerDom(h.document, { withVideo: video });

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vid00000001', {});
    await h.clock.advance(2000);
    await p;

    const toast = h.document.querySelector('#yt-resume-toast');
    const stillPending = video.seeking === true && video.readyState === 1;

    if (toast && stillPending) {
      return {
        verdict: 'reproduces',
        evidence: `Toast text="${toast.textContent}" injected while video.seeking=true, readyState=1 (never checked by seekWithVerification).`,
      };
    }
    return {
      verdict: 'not-reproduced',
      evidence: `toast=${!!toast} seeking=${video.seeking} readyState=${video.readyState}`,
    };
  },
};
