'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * R11: initial same-ID cold load, then a same-URL 'yt-navigate-finish', a
 * visibilitychange, a pageshow, and an unchanged-URL poll tick. Audit
 * observed: the initialization callback count stays at one — none of
 * those signals re-trigger onVideoChange, so a restored/frozen/reactivated
 * tab has no recovery path back into initialization.
 */
module.exports = {
  id: 'R11',
  title: 'No signal besides a real video-ID change re-triggers initialization',
  finding: 'F02',
  async run() {
    const h = loadExtension({ href: 'https://www.youtube.com/watch?v=vid0000011a' });
    let callCount = 0;
    h.navigationManager.start(() => { callCount += 1; }, () => {});

    // Cold load already emitted once synchronously inside start().
    h.document.dispatchEvent({ type: 'yt-navigate-finish' }); // same URL
    h.document.dispatchEvent({ type: 'visibilitychange' });    // not listened for at all
    h.window.dispatchEvent({ type: 'pageshow' });               // not listened for at all
    await h.clock.advance(3000); // several unchanged-URL poll ticks

    if (callCount === 1) {
      return {
        verdict: 'reproduces',
        evidence: `onVideoChange fired exactly once (the cold load) despite a same-URL navigate-finish, visibilitychange, pageshow, and 3 poll ticks — none of those are wired to re-initialize.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: `callCount=${callCount}` };
  },
};
