'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T5.12 (Roadmap v4 Phase 5, D-107/F20) — a malformed `t=` value must be
 * ignored, not treated as a valid precedence signal; automatic saved-
 * position resume must proceed exactly as if no timestamp were present.
 */
module.exports = {
  id: 'T5.12',
  title: 'An invalid t= value is ignored and automatic resume proceeds normally',
  finding: 'F20',
  async run() {
    const videoId = 'vidT512bad1';
    const h = loadExtension({
      href: 'https://www.youtube.com/',
      loadBootstrap: true,
      seedStorage: {
        youtubeResume: { [videoId]: { time: 3600, duration: 4000, updated: 1000 } },
      },
    });
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    h.window._setHref(`https://www.youtube.com/watch?v=${videoId}&t=notatime`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(2000);

    const toast = h.document.querySelector('#yt-resume-toast');
    const resumedNearTarget = Math.abs(video.currentTime - 3598) <= 3; // getResumeTime(3600, 2)

    if (toast && resumedNearTarget) {
      return {
        verdict: 'not-reproduced',
        evidence: `Malformed t= ignored; automatic resume proceeded normally (currentTime=${video.currentTime}).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `toast=${!!toast} currentTime=${video.currentTime}`,
    };
  },
};
