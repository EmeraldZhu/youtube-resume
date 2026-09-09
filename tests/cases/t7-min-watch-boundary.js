'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * Phase 7 case (Roadmap 7.4): UX Spec CP-42h says minWatchSeconds excludes
 * videos watched "for less than this" — i.e. exactly at the threshold
 * counts as watched enough. meetsMinimumWatched() previously used a strict
 * `>`, excluding the exact boundary and contradicting its own copy. Now
 * `>=`. Exercises both the pure function and the real save path
 * (progressTracker's pause-save, gated by the same function) landing
 * exactly on a preset boundary (30s).
 */
module.exports = {
  id: 'T7-min-watch-boundary',
  title: 'meetsMinimumWatched is inclusive, matching "less than this" copy',
  finding: 'F14/F15',
  async run() {
    const h = loadExtension();
    const evidence = [];
    let allOk = true;

    function check(label, actual, expected) {
      const ok = actual === expected;
      allOk = allOk && ok;
      evidence.push(`${label}=${actual} (expected ${expected}) ${ok ? 'OK' : 'FAIL'}`);
    }

    check('exactly-at-30', h.timeUtils.meetsMinimumWatched(30, 30), true);
    check('just-below-30', h.timeUtils.meetsMinimumWatched(29, 30), false);
    check('above-30', h.timeUtils.meetsMinimumWatched(31, 30), true);

    // Real save path: a pause at exactly 30s (the default minWatchSeconds
    // preset) must produce a stored entry, not be silently dropped.
    const videoId = 'vidT7minwat';
    const video = new MockVideo({ currentTime: 30, duration: 4000, readyState: 4 });
    video.paused = true;
    h.progressTracker.start(video, videoId, { minWatchSeconds: 30 });
    h.progressTracker.arm();
    video.fire('pause');
    await h.clock.advance(500);

    const stored = (h.chromeStorage._raw().youtubeResume || {})[videoId];
    check('boundary-save-persisted', !!stored, true);

    return {
      verdict: allOk ? 'not-reproduced' : 'reproduces',
      evidence: evidence.join(' | '),
    };
  },
};
