'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');

/**
 * T3.5 (Roadmap v4 Phase 3): two writes are issued back to back (pause at
 * 500s, then a real seek to 800s); their acknowledgements are made to
 * resolve out of order — the later (800s) write's ack lands first, the
 * earlier (500s) write's ack lands after. The stale, slower ack must not
 * regress the tracker's committed position back to 500s. Observed
 * indirectly: if committed state is correctly 800s, a subsequent interval
 * tick at 800s is blocked by the delta guard (no further write); if it
 * regressed to 500s, that tick sees a spurious 300s delta and issues an
 * unwanted third write.
 */
module.exports = {
  id: 'T3.5',
  title: 'An out-of-order (stale) write acknowledgement does not regress the committed position',
  finding: 'F10',
  async run() {
    const videoId = 'vid00003t5a';
    const h = loadExtension();
    const video = new MockVideo({ currentTime: 500, duration: 4000, readyState: 4 });
    video.paused = true;

    const pending = [];
    h.storageManager.saveProgress = (...args) => new Promise((resolve) => {
      pending.push(() => resolve({ existingEntryFound: false, entryCountAfterWrite: 1 }));
    });

    h.progressTracker.start(video, videoId, {});
    h.progressTracker.arm();

    video.currentTime = 500;
    video.fire('pause'); // write #1 (seq 1, target 500)

    video.currentTime = 800;
    video.fire('seeked'); // write #2 (seq 2, target 800)

    await h.clock.flushMicrotasks();

    // Resolve out of order: the later write's ack first, the earlier
    // write's (now stale) ack second.
    pending[1]();
    await h.clock.flushMicrotasks();
    pending[0]();
    await h.clock.flushMicrotasks();

    // If committed state correctly reflects 800 (not regressed to 500 by
    // write #1's late ack), an interval tick at the same 800 position
    // should be blocked by the delta guard and issue no further write.
    video.currentTime = 800;
    video.paused = false;
    for (let i = 0; i < 5; i++) {
      h.progressTracker.tick();
    }
    await h.clock.flushMicrotasks();

    if (pending.length === 2) {
      return {
        verdict: 'not-reproduced',
        evidence: `No spurious third write after the out-of-order ack — committed state correctly reflects 800 (${pending.length} total write attempts).`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `Committed state regressed: a spurious extra write was issued after the stale ack (${pending.length} total write attempts).`,
    };
  },
};
