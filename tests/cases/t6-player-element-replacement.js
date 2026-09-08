'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T6 (Roadmap v4 Phase 6, 6.1) — YouTube replaces the <video> element
 * inside #movie_player without a v= change (no yt-navigate-finish, no
 * video-ID change) — e.g. a quality/format switch that rebuilds the
 * player. Tracking must reattach to the new element instead of silently
 * going stale against a detached one.
 */
module.exports = {
  id: 'T6.playerElementReplacement',
  title: 'A player element replaced without a video-ID change reattaches tracking',
  finding: 'F02',
  async run() {
    const videoId = 'vid0t6elrep';
    const h = loadExtension({
      href: `https://www.youtube.com/watch?v=${videoId}`,
      loadBootstrap: true,
    });

    const video1 = new MockVideo({ currentTime: 10, duration: 4000, readyState: 4 });
    const { moviePlayer } = buildPlayerDom(h.document, { withVideo: video1 });

    // Let the cold-load pipeline resolve and arm (no saved entry).
    await h.clock.advance(200);

    // YouTube swaps the <video> element in place — same #movie_player
    // container, new element, no navigation event of any kind.
    moviePlayer.removeChild(video1);
    const video2 = new MockVideo({ currentTime: 200, duration: 4000, readyState: 4 });
    moviePlayer.appendChild(video2);

    await h.clock.advance(200); // let the replacement-watch callback re-run the pipeline and arm

    // Prove tracking reattached to video2, not the detached video1: advance
    // video2's position and let the real poll interval save it.
    video2.currentTime = 250;
    await h.clock.advance(5200);

    const stored = h.chromeStorage._raw().youtubeResume?.[videoId];

    if (stored && stored.time === 250) {
      return {
        verdict: 'not-reproduced',
        evidence: `Tracking reattached to the replacement element and saved its position: ${JSON.stringify(stored)}.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `Tracking did not reattach to the replacement element — stored=${JSON.stringify(stored)}.`,
    };
  },
};
