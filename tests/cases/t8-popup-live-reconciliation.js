'use strict';

const { loadPopup } = require('../lib/popupHarness');

/**
 * Phase 8 case (Roadmap 8.1/8.2/8.7, F16/F17/F18): the popup must reconcile
 * an external storage change into the open list in place (no row rebuild,
 * no lost focus), coalesce a rapid double-click on the same row's pin
 * control into a single outcome, and hand focus off predictably when a
 * row is removed while one of its own controls is focused.
 */
module.exports = {
  id: 'T8.1-T8.2-T8.7',
  title: 'Popup: live reconciliation, coalesced double-clicks, and removal focus handoff',
  finding: 'F16/F17/F18',
  async run() {
    const evidence = [];
    let allOk = true;
    function check(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      allOk = allOk && ok;
      evidence.push(`${label}=${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${ok ? 'OK' : 'FAIL'}`);
    }

    const firstId = 'firstRow001';
    const secondId = 'secondRow01';
    const click = () => ({ type: 'click', preventDefault: () => {} });

    const h = loadPopup({
      seedStorage: {
        youtubeResume: {
          [firstId]: { time: 100, duration: 4000, updated: 2, title: 'First video' },
          [secondId]: { time: 50, duration: 4000, updated: 1, title: 'Second video' },
        },
      },
    });

    await h.clock.advance(200);
    await h.clock.flushMicrotasks();

    function rowFor(videoId) {
      return [...h.dom.listEl.children].find((li) => li.dataset.id === videoId);
    }

    // --- T8.1: an external write (e.g. playback continuing in an open YT
    // tab) must update the row in place, not duplicate or rebuild it.
    // Not awaited directly — the mock's set() only resolves once the fake
    // clock advances past its latency, so awaiting it before advancing
    // would deadlock (the clock never moves on its own).
    const pWrite = h.chromeStorage.local.set({
      youtubeResume: {
        [firstId]: { time: 200, duration: 4000, updated: 5, title: 'First video' },
        [secondId]: { time: 50, duration: 4000, updated: 1, title: 'Second video' },
      },
    });
    await h.clock.advance(200);
    await h.clock.flushMicrotasks();
    await pWrite;

    check('reconcile-row-count-unchanged', h.dom.listEl.children.length, 2);
    const firstMeta = rowFor(firstId)?.querySelector('.row-meta')?.textContent;
    check('reconcile-updates-progress-text', firstMeta, "3:20 / 1:06:40 · 5% watched");

    // --- T8.2: a rapid double-click on the same row's pin control must
    // not double-apply — the second click, synchronous with the first
    // still in flight, is a no-op because the control is already disabled.
    const firstRow = rowFor(firstId);
    const pinBtn = firstRow.querySelector('.pin-btn');
    pinBtn.focus(); // a real click focuses the button first — required to
    // exercise the exact bug a live-testing pass on this phase found:
    // disabling a focused control blurs it to <body> immediately, so any
    // focus-retention logic that re-checks document.activeElement only
    // after the fact (rather than capturing intent up front) silently fails.
    pinBtn.dispatchEvent(click());
    const disabledImmediatelyAfterFirstClick = pinBtn.disabled;
    pinBtn.dispatchEvent(click()); // should be swallowed by rowPending guard
    await h.clock.advance(200);
    await h.clock.flushMicrotasks();

    check('pin-disabled-during-request', disabledImmediatelyAfterFirstClick, true);
    check('pin-ends-up-pinned-exactly-once', firstRow.dataset.pinned, 'true');
    check('pin-control-reenabled-after-ack', pinBtn.disabled, false);
    check('no-warnings-from-double-click', h.warnings.length, 0);
    // 8.7 — pin re-sort must not drop focus, even though the click above
    // disabled (and so blurred) pinBtn before the ack ever arrived.
    check('focus-retained-through-pin-resort', h.document.activeElement === pinBtn, true);

    // --- T8.7: removing a row while one of its own controls has focus
    // hands focus to the next row's same-kind control; here, with no next
    // row after the first, it should land on the previous row's control.
    const secondRow = rowFor(secondId);
    const secondRemoveBtn = secondRow.querySelector('.remove-btn');
    secondRemoveBtn.focus();
    secondRemoveBtn.dispatchEvent(click());
    await h.clock.advance(200);
    await h.clock.flushMicrotasks();

    check('removed-row-gone', h.dom.listEl.children.length, 1);
    check('focus-handed-to-remaining-rows-remove-btn', h.document.activeElement === rowFor(firstId).querySelector('.remove-btn'), true);

    return {
      verdict: allOk ? 'not-reproduced' : 'reproduces',
      evidence: evidence.join(' | '),
    };
  },
};
