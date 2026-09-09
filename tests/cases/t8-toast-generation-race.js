'use strict';

const { loadExtension } = require('../lib/harness');
const { buildPlayerDom } = require('../lib/playerDom');

/**
 * Phase 8 case (8.11/F19): uiInjector.showToast()'s pending
 * requestAnimationFrame callback must be retained and cancelled when a
 * newer toast replaces it, and every one of its chained setTimeout
 * callbacks must check the toast is still the current "generation" before
 * touching shared state. Before the fix, an old toast's rAF callback
 * (scheduled but not yet fired when a second showToast() call ran) would
 * still fire later, setting opacity/scheduling further timers against
 * whatever toast happened to be current by then — capable of yanking a
 * legitimate second toast's opacity to 0 early or removing it prematurely.
 */
module.exports = {
  id: 'T8.11',
  title: "showToast()'s superseded rAF/timers never touch a newer toast",
  finding: 'F19',
  async run() {
    const h = loadExtension();
    buildPlayerDom(h.document);

    // First toast: showToast() schedules its rAF (fires at +16ms per the
    // harness's requestAnimationFrame mapping) but nothing has advanced yet.
    h.uiInjector.showToast(100);
    const firstToast = h.document.querySelector('#yt-resume-toast');
    const firstToastText = firstToast && firstToast.textContent;

    // Second toast replaces it before the first one's rAF has ever fired —
    // removeToast() (called at the top of showToast()) must cancel that
    // pending rAF outright, and the generation bump must make it a no-op
    // even if something slipped through.
    h.uiInjector.showToast(200);
    const secondToast = h.document.querySelector('#yt-resume-toast');
    const secondToastText = secondToast && secondToast.textContent;
    const onlyOneToastNode = h.document.querySelectorAll('#yt-resume-toast').length === 1;

    // Run the full ~2.2s show/hide schedule to completion. If the first
    // toast's superseded callbacks ever fired, they would have removed the
    // second toast early or thrown trying to touch a detached node.
    await h.clock.advance(3000);

    const toastGoneAfterSchedule = !h.document.querySelector('#yt-resume-toast');
    const noWarnings = h.warnings.length === 0;

    const ok = firstToastText === 'Resumed from 1:40'
      && secondToastText === 'Resumed from 3:20'
      && onlyOneToastNode
      && toastGoneAfterSchedule
      && noWarnings;

    return {
      verdict: ok ? 'not-reproduced' : 'reproduces',
      evidence: `firstToastText=${JSON.stringify(firstToastText)} secondToastText=${JSON.stringify(secondToastText)} `
        + `onlyOneToastNode=${onlyOneToastNode} toastGoneAfterSchedule=${toastGoneAfterSchedule} warnings=${JSON.stringify(h.warnings)}`,
    };
  },
};
