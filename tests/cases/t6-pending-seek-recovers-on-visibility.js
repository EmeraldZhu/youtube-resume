'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T6 (Roadmap v4 Phase 6, 6.2) — a resume that reached the seek stage but
 * never settled within the bounded verify window (T5.4-buffering's
 * scenario: media stuck below HAVE_CURRENT_DATA for several seconds,
 * outcome PENDING/'seek-not-settled') is exactly the "pending... session"
 * 6.2 means to stay eligible for a later readiness event — found live
 * during Phase 6 verification (buffering under throttled conditions
 * produced PENDING, not a player-discovery/metadata timeout, and the
 * Phase 5 test that introduced PENDING already promised "Phase 6 owns
 * resuming this later once buffering actually clears").
 */
module.exports = {
  id: 'T6.pendingSeekRecovers',
  title: 'A pending (never-settled) seek recovers once the tab becomes visible again',
  finding: 'F01/F02',
  async run() {
    const videoId = 'vid0t6pend1';
    const h = loadExtension({
      href: `https://www.youtube.com/watch?v=${videoId}`,
      loadBootstrap: true,
      seedStorage: {
        youtubeResume: { [videoId]: { time: 3600, duration: 4000, updated: 1 } },
      },
    });

    // Media stays unready (readyState 0) through the whole bounded seek
    // window — the seek never settles, so tryResume() resolves PENDING.
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 0 });
    buildPlayerDom(h.document, { withVideo: video });

    await h.clock.advance(2000); // past the ~1150ms bounded seek-verify window

    // Now buffering genuinely clears.
    video.readyState = 4;
    video.currentTime = 3598; // where the seek had actually landed, numerically

    // The tab becomes visible — the actual recovery trigger.
    h.document.hidden = false;
    h.document.dispatchEvent({ type: 'visibilitychange' });
    // The recovery re-run reuses the SAME <video> element with the SAME
    // duration it had before (F04/T4.4's forceMetadataRefresh condition),
    // so it also pays the bounded ~1000ms reused-element refresh wait
    // before the normal ~1150ms delay+seek+reassert pipeline.
    await h.clock.advance(3000);

    const toast = h.document.querySelector('#yt-resume-toast');
    const settled = Math.abs(video.currentTime - 3598) <= 3;

    if (toast && settled) {
      return {
        verdict: 'not-reproduced',
        evidence: `Pending resume recovered on visibility return once buffering cleared: currentTime=${video.currentTime}, toast shown.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `No recovery after visibility return — toast=${!!toast}, currentTime=${video.currentTime}.`,
    };
  },
};
