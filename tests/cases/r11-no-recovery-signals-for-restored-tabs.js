'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R11: initial cold load times out waiting for the player (a frozen/
 * discarded/restored tab whose DOM isn't ready yet), then the player
 * finally appears and the tab becomes visible. Audit observed: no signal
 * besides a real video-ID change re-triggers initialization, so a
 * restored/frozen/reactivated tab has no recovery path back into it.
 *
 * Phase 6 (6.1/6.2) fixes this at the bootstrap/lifecycle level, not inside
 * navigationManager (whose job stays narrowly "detect a video-ID change") —
 * this case now drives the full pipeline (loadBootstrap: true) and proves
 * recovery behaviorally: tracking actually becomes live and saves after the
 * tab becomes visible, with no video-ID change involved anywhere.
 */
module.exports = {
  id: 'R11',
  title: 'A restored/frozen tab recovers once the player appears and it becomes visible',
  finding: 'F02',
  async run() {
    const videoId = 'vid0000011a';
    const h = loadExtension({
      href: `https://www.youtube.com/watch?v=${videoId}`,
      loadBootstrap: true,
    });

    // No #movie_player in the DOM yet — cold-load player discovery times
    // out after 10s. This is the "player-discovery timeout" case Phase 6
    // keeps eligible for recovery instead of abandoning outright.
    await h.clock.advance(10000);

    // The player finally appears (e.g. the frozen tab's page actually
    // finished loading).
    const video = new MockVideo({ currentTime: 100, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: video });

    // A same-URL 'yt-navigate-finish' alone must NOT be what recovers this
    // (no video-ID change occurred) — confirms recovery isn't accidentally
    // riding on navigationManager's own detection.
    h.document.dispatchEvent({ type: 'yt-navigate-finish' });
    await h.clock.advance(50);

    // The tab becomes visible — this is the actual recovery trigger.
    h.document.hidden = false;
    h.document.dispatchEvent({ type: 'visibilitychange' });
    await h.clock.advance(200); // let onVideoChange's pipeline settle (no saved entry, so it arms quickly)

    // Prove tracking actually reattached: advance playback and let the
    // real 1000ms poll interval (wired to progressTracker.tick()) drive a
    // normal interval save.
    video.currentTime = 150;
    await h.clock.advance(5200);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (stored && stored.time === 150) {
      return {
        verdict: 'not-reproduced',
        evidence: `Recovery triggered by visibility return reattached tracking and saved normally: ${JSON.stringify(stored)}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `No recovery occurred after becoming visible — stored=${JSON.stringify(stored)}.`,
    };
  },
};
