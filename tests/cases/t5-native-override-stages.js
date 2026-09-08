'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * T5.4 (Roadmap v4 Phase 5) — a native override landing at three different
 * points relative to the ~1150ms resume pipeline (400ms delay + 250ms seek
 * verify + 500ms reassert check) must each still land on a correctly
 * verified position: before the delay elapses (folded into the
 * stabilization check, not a hard abort — R4's own case), during the seek-
 * verify window (corrected by the next verification attempt), and after
 * the reassert check settles (caught by the bounded background monitor,
 * R2's case). None of the three should leave the video away from the
 * resume target once the pipeline and its monitor window have run.
 */
module.exports = {
  id: 'T5.4',
  title: 'Native overrides before, during, and after the resume pipeline all land correctly',
  finding: 'F01/F08',
  async run() {
    const evidence = [];
    let allOk = true;

    // Stage 1: override during the initial 400ms delay (same shape as R4).
    {
      const h = loadExtension();
      const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
      buildPlayerDom(h.document, { withVideo: video });
      h.clock.setTimeout(() => { video.currentTime = 90; }, 200);
      const result = await (async () => {
        const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vidT54a', {});
        await h.clock.advance(2500);
        return p;
      })();
      const ok = result.status === 'verified' && Math.abs(video.currentTime - 3598) <= 3;
      allOk = allOk && ok;
      evidence.push(`before-delay: status=${result.status} currentTime=${video.currentTime} ok=${ok}`);
    }

    // Stage 2: override lands mid-seek-verify (between the 400ms delay and
    // the seek settling), so the first verify attempt sees it and retries.
    {
      const h = loadExtension();
      const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
      buildPlayerDom(h.document, { withVideo: video });
      h.clock.setTimeout(() => { video.currentTime = 90; }, 500); // after the 400ms delay, before the first 250ms verify completes
      const result = await (async () => {
        const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vidT54b', {});
        await h.clock.advance(2500);
        return p;
      })();
      const ok = result.status === 'verified' && Math.abs(video.currentTime - 3598) <= 3;
      allOk = allOk && ok;
      evidence.push(`during-verify: status=${result.status} currentTime=${video.currentTime} ok=${ok}`);
    }

    // Stage 3: override lands after the 500ms reassert check has already
    // passed (tryResume has resolved) — only the background monitor (R2)
    // can catch this one.
    {
      const h = loadExtension();
      const video = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
      buildPlayerDom(h.document, { withVideo: video });
      const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vidT54c', {});
      await h.clock.advance(1300); // past the ~1150ms pipeline; tryResume has resolved
      const result = await p;
      video.currentTime = 90; // late native override, after resolution
      await h.clock.advance(2500); // within the bounded monitor window
      const ok = result.status === 'verified' && Math.abs(video.currentTime - 3598) <= 3;
      allOk = allOk && ok;
      evidence.push(`after-resolve: status=${result.status} currentTime=${video.currentTime} ok=${ok}`);
    }

    if (allOk) {
      return { verdict: 'not-reproduced', evidence: evidence.join(' | ') };
    }
    return { verdict: 'reproduces', evidence: evidence.join(' | ') };
  },
};
