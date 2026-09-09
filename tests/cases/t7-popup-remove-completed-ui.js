'use strict';

const { loadPopup } = require('../lib/popupHarness');

/**
 * Phase 7 case (Roadmap 7.3/7.5, UX Spec §6.3 "Completion Display"/"Remove
 * Completed"): exercises the popup end to end against a mixed library —
 * a genuinely-ended row, a legacy-boundary row, a near-end-but-not-complete
 * row (99.5%, must show a capped percentage, never "Completed" or 100%),
 * and a pinned-complete row (excluded from the default count). Also drives
 * the inline confirm/cancel/commit flow and checks the live count updates
 * after the include-pinned checkbox toggles.
 */
module.exports = {
  id: 'T7-popup-remove-completed-ui',
  title: 'Popup: completion display capping/labeling and the Remove-completed confirm flow',
  finding: 'F14/F15',
  async run() {
    const evidence = [];
    let allOk = true;
    function check(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      allOk = allOk && ok;
      evidence.push(`${label}=${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${ok ? 'OK' : 'FAIL'}`);
    }

    const endedId = 'endedRow001';
    const legacyId = 'legacyRow01';
    const nearEndId = 'nearEndRow1'; // 995/1000 = 99.5%, NOT within the 1s legacy tolerance
    const pinnedCompleteId = 'pinnedDone1';

    const h = loadPopup({
      seedStorage: {
        youtubeResume: {
          [endedId]: { time: 5, duration: 4000, updated: 4, ended: true },
          [legacyId]: { time: 999, duration: 1000, updated: 3 },
          [nearEndId]: { time: 995, duration: 1000, updated: 2 },
          [pinnedCompleteId]: { time: 1000, duration: 1000, updated: 1, pinned: true },
        },
      },
    });

    await h.clock.advance(2000);
    await h.clock.flushMicrotasks();
    await h.clock.flushMicrotasks();

    function metaTextFor(videoId) {
      const row = [...h.dom.listEl.children].find((li) => li.dataset.id === videoId);
      const meta = row && row.querySelector('.row-meta');
      return meta ? meta.textContent : null;
    }

    check('ended-shows-completed-label', metaTextFor(endedId), 'Completed');
    check('legacy-boundary-shows-completed-label', metaTextFor(legacyId), 'Completed');
    check('near-end-shows-capped-percent-not-100', metaTextFor(nearEndId), '16:35 / 16:40 · 99% watched');

    // Default scope (pinned excluded): only the two unpinned complete rows count.
    check('default-remove-completed-count', h.dom.removeCompletedCountEl.textContent, '2 completed videos');
    check('default-remove-completed-enabled', h.dom.removeCompletedBtn.disabled, false);

    // Include pinned: now 3 match.
    h.dom.includePinnedCheckbox.checked = true;
    h.dom.includePinnedCheckbox.dispatchEvent({ type: 'change' });
    check('include-pinned-count', h.dom.removeCompletedCountEl.textContent, '3 completed videos');

    // Confirm flow: click opens the inline confirmation naming the same count.
    h.dom.removeCompletedBtn.dispatchEvent({ type: 'click' });
    check('confirm-panel-visible', h.dom.removeCompletedConfirmPanel.classList.contains('hidden'), false);
    check('confirm-body-names-live-count', h.dom.removeCompletedBodyEl.textContent, 'This will permanently remove 3 completed videos. This cannot be undone.');

    // Cancel restores the controls without mutating anything.
    h.dom.removeCompletedCancelBtn.dispatchEvent({ type: 'click' });
    check('cancel-restores-panel-hidden', h.dom.removeCompletedConfirmPanel.classList.contains('hidden'), true);
    check('cancel-leaves-rows-untouched', h.dom.listEl.children.length, 4);

    // Re-open and commit — all 3 (includePinned still checked) should be removed.
    h.dom.removeCompletedBtn.dispatchEvent({ type: 'click' });
    h.dom.removeCompletedConfirmBtn.dispatchEvent({ type: 'click' });
    await h.clock.advance(2000);
    await h.clock.flushMicrotasks();
    await h.clock.flushMicrotasks();

    check('commit-removes-matching-rows', h.dom.listEl.children.length, 1);
    check('commit-leaves-incomplete-row', !!metaTextFor(nearEndId), true);
    check('commit-count-updates', h.dom.countEl.textContent, '1 saved video');
    check('commit-remove-completed-now-zero', h.dom.removeCompletedCountEl.textContent, 'No completed videos to remove');
    check('commit-remove-completed-disabled', h.dom.removeCompletedBtn.disabled, true);

    return {
      verdict: allOk ? 'not-reproduced' : 'reproduces',
      evidence: evidence.join(' | '),
    };
  },
};
