'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T4.7 (Phase 4 roadmap) — SPA transition from a short video to a long one,
 * with a FRESH <video> element for the second navigation (unlike T4.4's
 * same-element-reuse case). Locks in that teardown + a fresh generation
 * leaves no state (settings, tracker baselines, video reference) bleeding
 * from the short video into the long video's eligibility decision.
 */
module.exports = {
  id: 'T4.7',
  title: 'SPA transition from a short video to a long video uses only the long video\'s own metadata',
  finding: 'F03/F04',
  async run() {
    const idShort = 'vidS0000047';
    const idLong = 'vidL0000047';
    const h = loadExtension({
      href: 'https://www.youtube.com/',
      loadBootstrap: true,
      seedStorage: {
        youtubeResume: {
          [idLong]: { time: 4000, duration: 5000, updated: 1 },
        },
      },
    });

    const shortVideo = new MockVideo({ currentTime: 55, duration: 100, readyState: 4 });
    const { moviePlayer } = buildPlayerDom(h.document, { withVideo: shortVideo });

    h.window._setHref(`https://www.youtube.com/watch?v=${idShort}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(100);

    // A fresh <video> element replaces the short video's — a full player
    // rebuild, not element reuse.
    moviePlayer.removeChild(shortVideo);
    const longVideo = new MockVideo({ currentTime: 0, duration: 5000, readyState: 4 });
    moviePlayer.appendChild(longVideo);

    h.window._setHref(`https://www.youtube.com/watch?v=${idLong}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(2000);

    const toast = h.document.querySelector('#yt-resume-toast');
    const seekedNearTarget = Math.abs(longVideo.currentTime - 3998) <= 3; // getResumeTime(4000, 2)
    const shortVideoUntouched = shortVideo.currentTime === 55;

    if (toast && seekedNearTarget && shortVideoUntouched) {
      return {
        verdict: 'not-reproduced',
        evidence: `Long video resumed correctly (currentTime=${longVideo.currentTime}); short video's element was never touched.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `longVideo.currentTime=${longVideo.currentTime} toast=${!!toast} shortVideo.currentTime=${shortVideo.currentTime}`,
    };
  },
};
