'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom, setAdPlaying } = require('../lib/playerDom');

/**
 * T4.2 (Phase 4 roadmap) — a resume is deferred behind an ad wait when the
 * user leaves the watch page. The ad-wait loop must notice the navigation
 * is stale within one poll tick (250ms), not keep polling for up to the
 * full 60s ceiling, and must never seek/save/show UI for the abandoned
 * navigation once its ad eventually clears.
 */
module.exports = {
  id: 'T4.2',
  title: 'Leaving a watch page during an ad settles the pending resume promptly',
  finding: 'F03',
  async run() {
    const idA = 'vidA0000042';
    const h = loadExtension({
      href: 'https://www.youtube.com/',
      loadBootstrap: true,
      seedStorage: { youtubeResume: { [idA]: { time: 500, duration: 4000, updated: 1 } } },
    });

    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    const { moviePlayer } = buildPlayerDom(h.document, { withVideo: video });
    setAdPlaying(moviePlayer, true); // ad showing at load — tryResume blocks in the ad wait

    h.window._setHref(`https://www.youtube.com/watch?v=${idA}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(500); // resume is now parked in waitForAdClear's poll loop

    // Leave the watch page entirely — teardown runs, generation advances.
    h.window._setHref('https://www.youtube.com/');
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });

    // Advance just past one ad-poll tick (250ms), far short of the 60s
    // ceiling, then clear the ad and let the loop resolve.
    await h.clock.advance(300);
    setAdPlaying(moviePlayer, false);
    await h.clock.advance(60000); // if it were NOT cancelled, this would let it finish and seek

    const toast = h.document.querySelector('#yt-resume-toast');
    const button = h.document.querySelector('#yt-resume-restart-btn');
    const seeked = video.currentTime !== 0;

    if (!toast && !button && !seeked) {
      return {
        verdict: 'not-reproduced',
        evidence: 'Abandoned navigation never seeked, saved, or drew UI after the ad cleared post-teardown.',
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `Stale navigation acted after teardown: toast=${!!toast} button=${!!button} currentTime=${video.currentTime}`,
    };
  },
};
