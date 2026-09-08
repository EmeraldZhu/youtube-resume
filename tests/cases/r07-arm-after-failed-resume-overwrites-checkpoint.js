'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R7: a saved 3600s checkpoint exists; the resume attempt never settles
 * (media stays seeking=true — same unresolvable condition as R1) so it
 * gives up without ever reaching the target. Audit observed: bootstrap.js's
 * unconditional `finally` armed the tracker anyway with no memory of the
 * target it failed to reach, so ordinary playback at 60s afterward looked
 * like unremarkable forward progress and the first interval save overwrote
 * the stored 3600s checkpoint. Exercised through the real bootstrap.js
 * pipeline (not progressTracker in isolation) since the fix spans both the
 * typed outcome bootstrap receives and the checkpoint-protection it applies
 * before arming.
 */
module.exports = {
  id: 'R7',
  title: 'First interval save after a failed resume overwrites the target checkpoint',
  finding: 'F05',
  async run() {
    const videoId = 'vid0000007a';
    const h = loadExtension({
      href: 'https://www.youtube.com/',
      loadBootstrap: true,
      seedStorage: {
        youtubeResume: { [videoId]: { time: 3600, duration: 4000, updated: 1000 } },
      },
    });
    // seeking never clears -> seekWithVerification exhausts its attempts and
    // gives up without ever verifying the resume (same condition as R1).
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 1, seeking: true });
    buildPlayerDom(h.document, { withVideo: video });

    h.window._setHref(`https://www.youtube.com/watch?v=${videoId}`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(3000); // resume attempt fully plays out and gives up; tracker arms

    // Ordinary playback since — the resume never reached 3600.
    video.seeking = false;
    video.readyState = 4;
    video.currentTime = 60;
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);

    const stored = h.chromeStorage._raw().youtubeResume[videoId];

    if (stored && stored.time === 60) {
      return {
        verdict: 'reproduces',
        evidence: `Stored entry overwritten: time=${stored.time} (was 3600). Tracker had no record of the failed-resume target.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `stored=${JSON.stringify(stored)}` };
  },
};
