'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R6: metadata stays absent through both 5-second waits (D-038's one
 * retry), then finally arrives. Audit observed: the later metadata does
 * not trigger a seek — position remains zero, no recovery path exists
 * once both waits have timed out.
 */
module.exports = {
  id: 'R6',
  title: 'Metadata arriving after both 5s waits time out never seeks',
  finding: 'F02',
  async run() {
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 0, duration: NaN, readyState: 0 });
    buildPlayerDom(h.document, { withVideo: video });

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vid00000006', {});
    await h.clock.advance(11000); // both 5s metadata waits time out
    await p;

    // Metadata finally "arrives" — too late, listeners are already gone.
    video.duration = 4000;
    video.fire('loadedmetadata');
    await h.clock.advance(2000);

    const toast = h.document.querySelector('#yt-resume-toast');
    if (!toast && video.currentTime === 0) {
      return {
        verdict: 'reproduces',
        evidence: 'Both 5s metadata waits timed out and returned; the later loadedmetadata event had no effect — position stayed at 0.',
      };
    }
    return { verdict: 'not-reproduced', evidence: `toast=${!!toast} currentTime=${video.currentTime}` };
  },
};
