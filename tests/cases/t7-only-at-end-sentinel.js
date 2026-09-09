'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * Phase 7 case (Roadmap 7.7/D-106): completionThreshold's sentinel value (1,
 * "Only at the end") must route shouldResume through the completion
 * predicate (storageValidation.isCompleteEntry) instead of percentage
 * arithmetic. A saved entry at 99.98% of a long video, with no `ended`
 * marker and outside the legacy 1s tolerance, must still resume under this
 * setting even though every percentage-based threshold (90/95/98%) would
 * already refuse it. A genuinely-ended entry must not resume regardless of
 * position.
 */
module.exports = {
  id: 'T7-only-at-end-sentinel',
  title: '"Only at the end" (completionThreshold=1) resumes an unfinished near-end video and refuses a genuinely-ended one',
  finding: 'F14/F15',
  async run() {
    const h = loadExtension();
    const settings = { minWatchSeconds: 30, completionThreshold: 1 };

    // Case A: 3998/4000 — 99.95% by position, well past every percentage
    // threshold, but not within the legacy 1s tolerance (4000-1=3999) and no
    // `ended` marker. "Only at the end" must still allow this to resume.
    const videoA = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    const domA = buildPlayerDom(h.document, { withVideo: videoA });
    const pA = h.resumeManager.tryResume(videoA, { time: 3998, duration: 4000 }, 'videoAAAAAA', settings);
    await h.clock.advance(2500);
    const outcomeA = await pA;
    domA.moviePlayer.remove(); // detach case A's player DOM so case B's #movie_player lookup finds only its own

    // Case B: a genuinely-ended entry — must never resume under this setting,
    // regardless of position.
    const videoB = new MockVideo({ currentTime: 0, duration: 4000, readyState: 4 });
    buildPlayerDom(h.document, { withVideo: videoB });
    const pB = h.resumeManager.tryResume(videoB, { time: 3998, duration: 4000, ended: true }, 'videoBBBBBB', settings);
    await h.clock.advance(2500);
    const outcomeB = await pB;

    const aResumed = outcomeA.status === 'verified' || outcomeA.status === 'pending';
    const bRefused = outcomeB.status === 'ineligible';

    if (aResumed && bRefused) {
      return {
        verdict: 'not-reproduced',
        evidence: `Unfinished near-end entry resumed (status=${outcomeA.status}); genuinely-ended entry refused (status=${outcomeB.status}, reason=${outcomeB.reason}).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `outcomeA=${JSON.stringify(outcomeA)} outcomeB=${JSON.stringify(outcomeB)}`,
    };
  },
};
