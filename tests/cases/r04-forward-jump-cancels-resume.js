'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R4: native position jumps 0->120s halfway through the initial 400ms
 * delay. Audit observed: the extension returns without seeking to the
 * saved 3600s checkpoint at all (the >10.4s-forward guard treats any large
 * forward movement as a user seek, magnitude alone, no direction/intent check).
 */
module.exports = {
  id: 'R4',
  title: 'A native forward jump during the resume delay cancels resume outright',
  finding: 'F08',
  async run() {
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    h.clock.setTimeout(() => { video.currentTime = 120; }, 200); // "halfway" through the 400ms delay

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vid00000004', {});
    await h.clock.advance(1000);
    await p;

    const toast = h.document.querySelector('#yt-resume-toast');
    if (!toast && video.currentTime === 120) {
      return {
        verdict: 'reproduces',
        evidence: 'No seek to the saved 3600s checkpoint occurred; the guard aborted resume entirely on the forward jump.',
      };
    }
    return { verdict: 'not-reproduced', evidence: `toast=${!!toast} currentTime=${video.currentTime}` };
  },
};
