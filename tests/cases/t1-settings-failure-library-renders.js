'use strict';

const { loadPopup } = require('../lib/popupHarness');

/**
 * Phase 1 case (roadmap 1.7/T1.6, D-121): the settings read fails while the
 * progress (library) read succeeds. Before this phase, popup.js awaited
 * both in one Promise.all — a settings failure threw before any row was
 * rendered, so the popup fell back to updateCount(0), which shows the
 * "No saved videos yet" empty state even though real saved videos exist.
 */
module.exports = {
  id: 'T1-settings-failure-library-renders',
  title: 'A settings-read failure does not hide a valid saved-videos library',
  finding: 'F12',
  async run() {
    const videoId = 'vid0000t001';
    const h = loadPopup({
      seedStorage: {
        youtubeResume: { [videoId]: { time: 30, duration: 100, updated: 1000 } },
      },
      patchStorageManager(storageManager) {
        storageManager.getSettings = () => Promise.reject(new Error('simulated settings read failure'));
      },
    });

    await h.clock.advance(2000);
    // getSettings() is patched to reject synchronously (no timer involved),
    // so its .catch() and the subsequent DOM-building code resume via a
    // plain microtask, not a fired timer — pump a few extra microtask
    // rounds to be sure that chain has fully settled before inspecting DOM.
    await h.clock.flushMicrotasks();
    await h.clock.flushMicrotasks();
    await h.clock.flushMicrotasks();

    const rowCount = h.dom.listEl.children.length;
    const listHidden = h.dom.listEl.classList.contains('hidden');
    const emptyStateHidden = h.dom.emptyStateEl.classList.contains('hidden');
    const loadFailureHidden = h.dom.loadFailureEl.classList.contains('hidden');

    const rendersLibrary = rowCount === 1 && !listHidden && emptyStateHidden && loadFailureHidden;

    if (rendersLibrary) {
      return {
        verdict: 'not-reproduced',
        evidence: `Library rendered (${rowCount} row) using safe setting defaults despite the settings-read failure; neither the empty state nor the load-failure state shown.`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `rowCount=${rowCount}, listHidden=${listHidden}, emptyStateHidden=${emptyStateHidden}, loadFailureHidden=${loadFailureHidden}`,
    };
  },
};
