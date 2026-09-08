'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T5.4 (buffering variant, Roadmap v4 Phase 5) — media stays unready
 * (readyState below HAVE_CURRENT_DATA, as a slow-buffering connection
 * would show) for several seconds, well past SEEK_MAX_ATTEMPTS' bounded
 * ~750ms verify window (D-022's "never an unbounded retry loop" — Phase 5
 * does not add unbounded retrying; a session that never settles within the
 * bounded window is Phase 6's "Deferred Recovery Lifecycle" to pick back
 * up, not this phase's). What Phase 5 owns here is the outcome typing: no
 * success UI must appear while unready, and the outcome must be reported
 * as PENDING (still might resolve later) — never a false VERIFIED, and
 * never an outright FAILED that would suggest retrying is pointless.
 */
module.exports = {
  id: 'T5.4-buffering',
  title: 'Several seconds of buffering never yields a premature success and reports a typed pending outcome',
  finding: 'F01',
  async run() {
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 0 });
    buildPlayerDom(h.document, { withVideo: video });

    // Buffering clears only after 3s of real elapsed time — long after the
    // bounded seek-verify window (3 attempts * 250ms after the 400ms delay
    // = ~1150ms) has already given up.
    h.clock.setTimeout(() => { video.readyState = 4; }, 3000);

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vidT54buf', {});
    await h.clock.advance(4000);
    const result = await p;

    const toast = h.document.querySelector('#yt-resume-toast');
    const noSuccessUi = !toast;
    const pendingNotFailedOrFalseSuccess = result.status === 'pending';

    if (noSuccessUi && pendingNotFailedOrFalseSuccess) {
      return {
        verdict: 'not-reproduced',
        evidence: `No premature success UI; typed outcome status=${result.status} reason=${result.reason} (Phase 6 owns resuming this later once buffering actually clears).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `toast=${!!toast} status=${result.status} reason=${result.reason}`,
    };
  },
};
