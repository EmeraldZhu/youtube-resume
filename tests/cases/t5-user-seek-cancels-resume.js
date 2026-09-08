'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T5.5 (Roadmap v4 Phase 5, F08 task 5.3/5.4) — a position change during
 * the resume delay that correlates with real keyboard input is genuine
 * user intent, not native interference: automatic resume must cancel
 * outright (never override the user's own seek) and report a typed
 * 'cancelled'/'user-seek' outcome, distinct from R4's uncorroborated
 * native-jump case (which proceeds with the resume instead).
 */
module.exports = {
  id: 'T5.5',
  title: 'A user seek (corroborated by real input) during the resume delay cancels resume outright',
  finding: 'F08',
  async run() {
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    h.clock.setTimeout(() => {
      h.document.dispatchEvent({ type: 'keydown' }); // real user input
      video.currentTime = 200; // the seek it drove
    }, 200);

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vidT55user1', {});
    await h.clock.advance(2000);
    const result = await p;

    const toast = h.document.querySelector('#yt-resume-toast');
    const cancelledCorrectly = result.status === 'cancelled' && result.reason === 'user-seek';
    const userPositionRespected = video.currentTime === 200; // never overridden back to 3598

    if (!toast && cancelledCorrectly && userPositionRespected) {
      return {
        verdict: 'not-reproduced',
        evidence: `Resume cancelled on corroborated user input: status=${result.status} reason=${result.reason}, position left at ${video.currentTime}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `toast=${!!toast} status=${result.status} reason=${result.reason} currentTime=${video.currentTime}`,
    };
  },
};
