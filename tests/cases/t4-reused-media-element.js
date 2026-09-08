'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T4.4 (Phase 4 roadmap) — the SAME <video> element is reused across two
 * navigations and still carries the FIRST video's exact duration when the
 * second navigation's resume begins (a stale-but-valid number, not NaN —
 * the harder case: nothing about it looks obviously wrong). F04's evidence
 * warns SPA reuse can expose previous-content metadata this way. The new
 * generation must not evaluate eligibility against that carried-over
 * value; once real 'loadedmetadata' arrives for the second video, that
 * duration must be what resume actually uses.
 */
module.exports = {
  id: 'T4.4',
  title: 'A reused element carrying over a stale-but-valid duration does not resume against it',
  finding: 'F03/F04',
  async run() {
    const idShort = 'vidS0000044';
    const idLong = 'vidL0000044';
    const h = loadExtension({
      href: 'https://www.youtube.com/',
      loadBootstrap: true,
      seedStorage: {
        youtubeResume: {
          // Saved against the LONG video's real duration (5000s) — would be
          // wrongly disqualified (4000 > 100*0.95) if evaluated against the
          // short video's carried-over duration (100s) instead.
          [idLong]: { time: 4000, duration: 5000, updated: 1 },
        },
      },
    });

    const video = new MockVideo({ currentTime: 55, duration: 100, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    // First navigation: short video, no saved entry — resume skipped,
    // tracker arms immediately. This is what seeds lastVideoElement/
    // lastVideoDuration in bootstrap.js.
    h.window._setHref(`https://www.youtube.com/watch?v=${idShort}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(100);

    // Second navigation reuses the SAME element; YouTube hasn't updated
    // .duration yet at the moment navigation fires (still reads 100).
    h.window._setHref(`https://www.youtube.com/watch?v=${idLong}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(50); // resume is now in the forced-refresh window

    // Real metadata for the long video arrives before the 1s refresh window closes.
    video.duration = 5000;
    video.currentTime = 0;
    video.fire('loadedmetadata');
    await h.clock.advance(2000);

    const toast = h.document.querySelector('#yt-resume-toast');
    const seekedNearTarget = Math.abs(video.currentTime - 3998) <= 3; // getResumeTime(4000, 2)

    if (toast && seekedNearTarget) {
      return {
        verdict: 'not-reproduced',
        evidence: `Resumed against the long video's real duration (5000), not the reused element's carried-over 100: currentTime=${video.currentTime}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `Resume used stale carried-over metadata or failed: currentTime=${video.currentTime}, toast=${!!toast}`,
    };
  },
};
