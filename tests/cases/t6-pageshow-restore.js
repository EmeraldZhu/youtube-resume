'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T6 (Roadmap v4 Phase 6, 6.1) — a bfcache/back-forward restore (or a
 * discarded-and-reloaded tab firing pageshow instead of a fresh cold load)
 * must also recover a stalled player-discovery timeout, not just a
 * visibilitychange. Same scenario as R11 but driven by 'pageshow' alone —
 * the tab never actually goes hidden/visible in this case.
 */
module.exports = {
  id: 'T6.pageshow',
  title: 'A pageshow restore recovers a stalled player-discovery timeout',
  finding: 'F02/F09',
  async run() {
    const videoId = 'vid000t6pgs';
    const h = loadExtension({
      href: `https://www.youtube.com/watch?v=${videoId}`,
      loadBootstrap: true,
    });

    // No #movie_player yet — player discovery times out.
    await h.clock.advance(10000);

    const video = new MockVideo({ currentTime: 40, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    // bfcache restore — pageshow, not visibilitychange.
    h.window.dispatchEvent({ type: 'pageshow' });
    await h.clock.advance(200);

    video.currentTime = 60;
    await h.clock.advance(5200);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (stored && stored.time === 60) {
      return {
        verdict: 'not-reproduced',
        evidence: `pageshow recovered the stalled navigation and tracking saved normally: ${JSON.stringify(stored)}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `No recovery occurred after pageshow — stored=${JSON.stringify(stored)}.`,
    };
  },
};
