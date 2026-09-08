'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T5.10 (Roadmap v4 Phase 5, D-107/F20) — a saved checkpoint exists for
 * this video, but the navigation URL carries an explicit, valid `t=`
 * timestamp. The timestamp must win outright: automatic saved-position
 * resume is cancelled (no extension-driven seek, no toast/button — YouTube
 * itself performs the timestamp seek), and playback is tracked as a normal
 * user-directed session from the start (armed immediately, not held back
 * by checkpoint protection — an ordinary low-position interval save must
 * succeed, not be rejected as though it were risking an overwrite).
 */
module.exports = {
  id: 'T5.10',
  title: 'An explicit t= timestamp cancels automatic resume and starts a normal tracked session',
  finding: 'F20',
  async run() {
    const videoId = 'vidT510ts01';
    const h = loadExtension({
      href: 'https://www.youtube.com/',
      loadBootstrap: true,
      seedStorage: {
        youtubeResume: { [videoId]: { time: 3600, duration: 4000, updated: 1000 } },
      },
    });
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    h.window._setHref(`https://www.youtube.com/watch?v=${videoId}&t=45s`);
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(2000);

    const toast = h.document.querySelector('#yt-resume-toast');
    const button = h.document.querySelector('#yt-resume-restart-btn');
    const noExtensionSeek = !toast && !button && video.currentTime === 0; // extension never touched currentTime

    // Tracked as a normal session: a low-position interval save must
    // succeed, not be rejected as an overwrite risk against the checkpoint.
    video.currentTime = 50;
    for (let i = 0; i < 5; i++) h.progressTracker.tick();
    await h.clock.advance(1000);
    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (noExtensionSeek && stored && stored.time === 50) {
      return {
        verdict: 'not-reproduced',
        evidence: `No extension-driven seek/UI for the timestamp navigation; tracked normally afterward (stored.time=${stored.time}).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `toast=${!!toast} button=${!!button} currentTime=${video.currentTime} stored=${JSON.stringify(stored)}`,
    };
  },
};
