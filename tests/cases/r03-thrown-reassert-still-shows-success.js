'use strict';

const { loadExtension } = require('../lib/harness');
const { MockVideo } = require('../lib/mockVideo');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * R3: initial seek verifies; a native jump to 120s happens before the
 * post-verify native-override check; that check's corrective re-assignment
 * throws. Audit observed: a warning AND the success toast both occur, and
 * position stays at 120s — the thrown corrective seek is swallowed, not
 * surfaced as failure.
 */
function makeThrowingVideo() {
  let t = 0;
  let assignCount = 0;
  const video = new MockVideo({ duration: 4000, readyState: 4 });
  Object.defineProperty(video, 'currentTime', {
    get() { return t; },
    set(v) {
      assignCount += 1;
      if (assignCount === 2) {
        throw new Error('InvalidStateError: seek failed');
      }
      t = v;
    },
    configurable: true,
  });
  video._nativeJump = (v) => { t = v; };
  return video;
}

module.exports = {
  id: 'R3',
  title: 'Thrown corrective re-assignment still yields a success toast',
  finding: 'F01',
  async run() {
    const h = loadExtension();
    const video = makeThrowingVideo();
    buildPlayerDom(h.document, { withVideo: video });

    const p = h.resumeManager.tryResume(video, { time: 3600 }, 'vid00000003', {});
    await h.clock.advance(700); // past the 400ms delay + 250ms seek-verify; seek reported OK
    video._nativeJump(120); // native restore lands, ahead of the 500ms reassert check
    await h.clock.advance(1000); // past the reassert check at +500ms, where the re-seek throws
    await p;

    const toast = h.document.querySelector('#yt-resume-toast');
    const warned = h.warnings.some((w) => /seek failed|Re-assert seek failed/i.test(w));

    if (toast && warned && video.currentTime === 120) {
      return {
        verdict: 'reproduces',
        evidence: `Toast shown ("${toast.textContent}") and a warning logged, but currentTime stayed 120 — the throw from the corrective re-seek never turns into failure UI.`,
      };
    }
    return {
      verdict: 'not-reproduced',
      evidence: `toast=${!!toast} warned=${warned} currentTime=${video.currentTime}`,
    };
  },
};
