'use strict';

/**
 * Loads the real, unmodified popup/popup.js (plus storage/storageManager.js
 * and utils/debugLogger.js, matching popup.html's own <script> load order)
 * into a fresh vm context, wired to a minimal fake DOM built to match
 * popup.html's actual element ids/classes (v4 Phase 1 — the main harness
 * deliberately excludes the popup layer; this is a separate, narrower one
 * for the popup-specific cases this phase's roadmap 1.7/T1.6 requires).
 *
 * Only the elements popup.js actually touches (grep for getElementById /
 * querySelectorAll) are built. Segmented/toggle setting controls are
 * intentionally omitted — no case using this harness exercises the
 * Settings view — so `.segmented`/`.toggle` queries correctly resolve to
 * empty NodeLists, same as they would on a real settings-free render.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { createClock } = require('./fakeClock');
const { createDocument, createWindow } = require('./fakeDom');
const { createMockChromeStorage } = require('./mockChromeStorage');
const { createFakeRuntime } = require('./fakeRuntime');

const ROOT = path.join(__dirname, '..', '..');

const MODULE_FILES = [
  'storage/storageValidation.js',
  'storage/storageManager.js',
  'background/storageWriter.js',
  'utils/debugLogger.js',
];
const POPUP_FILE = 'popup/popup.js';

function el(document, tag, id, className) {
  const e = document.createElement(tag);
  if (id) e.setAttribute('id', id);
  if (className) e.className = className;
  return e;
}

/** Builds the subset of popup.html's DOM tree popup.js reads by id/class. */
function buildPopupDom(document) {
  const body = document.body;

  const viewList = el(document, 'div', 'view-list');
  const viewSettings = el(document, 'div', 'view-settings');
  const settingsBtn = el(document, 'button', 'settings-btn');
  const backBtn = el(document, 'button', 'back-btn');
  body.appendChild(viewList);
  body.appendChild(viewSettings);
  body.appendChild(settingsBtn);
  body.appendChild(backBtn);

  const countEl = el(document, 'span', 'saved-count');
  const listEl = el(document, 'ul', 'video-list');
  const emptyStateEl = el(document, 'div', 'empty-state');
  emptyStateEl.classList.add('hidden');
  const loadFailureEl = el(document, 'div', 'load-failure-state');
  loadFailureEl.classList.add('hidden');
  // v4 Phase 8, 8.9 — dedicated list/count-change announcement region.
  const listAnnouncerEl = el(document, 'div', 'list-announcer');
  viewList.appendChild(countEl);
  viewList.appendChild(listAnnouncerEl);
  viewList.appendChild(listEl);
  viewList.appendChild(emptyStateEl);
  viewList.appendChild(loadFailureEl);

  // Remove completed (v4 Phase 7, Roadmap 7.5/D-105) — mirrors popup.html's
  // list-actions-row structure closely enough for popup.js's getElementById/
  // closest('.include-pinned-label') calls to resolve correctly.
  const listActionsRow = el(document, 'div', null, 'list-actions-row');
  const removeCompletedBtn = el(document, 'button', 'remove-completed-btn');
  removeCompletedBtn.disabled = true;
  const removeCompletedCountEl = el(document, 'span', 'remove-completed-count');
  const includePinnedLabel = el(document, 'label', null, 'include-pinned-label');
  const includePinnedCheckbox = el(document, 'input', 'include-pinned-checkbox');
  includePinnedCheckbox.setAttribute('type', 'checkbox');
  includePinnedLabel.appendChild(includePinnedCheckbox);
  const removeCompletedConfirmPanel = el(document, 'div', 'remove-completed-confirm-panel');
  removeCompletedConfirmPanel.classList.add('hidden');
  const removeCompletedBodyEl = el(document, 'p', 'remove-completed-body');
  const removeCompletedCancelBtn = el(document, 'button', 'remove-completed-cancel-btn');
  const removeCompletedConfirmBtn = el(document, 'button', 'remove-completed-confirm-btn');
  removeCompletedConfirmPanel.appendChild(removeCompletedBodyEl);
  removeCompletedConfirmPanel.appendChild(removeCompletedCancelBtn);
  removeCompletedConfirmPanel.appendChild(removeCompletedConfirmBtn);
  listActionsRow.appendChild(removeCompletedBtn);
  listActionsRow.appendChild(removeCompletedCountEl);
  listActionsRow.appendChild(includePinnedLabel);
  listActionsRow.appendChild(removeCompletedConfirmPanel);
  viewList.appendChild(listActionsRow);

  const confirmCountEl = el(document, 'span', 'confirm-count');
  const confirmPinnedNoteEl = el(document, 'p', 'confirm-pinned-note');
  confirmPinnedNoteEl.classList.add('hidden');
  const clearBtn = el(document, 'button', 'clear-btn');
  const confirmPanel = el(document, 'div', 'confirm-panel');
  confirmPanel.classList.add('hidden');
  const cancelBtn = el(document, 'button', 'cancel-btn');
  const confirmBtn = el(document, 'button', 'confirm-btn');
  confirmPanel.appendChild(confirmCountEl);
  confirmPanel.appendChild(confirmPinnedNoteEl);
  confirmPanel.appendChild(cancelBtn);
  confirmPanel.appendChild(confirmBtn);
  viewSettings.appendChild(clearBtn);
  viewSettings.appendChild(confirmPanel);

  const resetBtn = el(document, 'button', 'reset-btn');
  const resetConfirmPanel = el(document, 'div', 'reset-confirm-panel');
  resetConfirmPanel.classList.add('hidden');
  const resetCancelBtn = el(document, 'button', 'reset-cancel-btn');
  const resetConfirmBtn = el(document, 'button', 'reset-confirm-btn');
  resetConfirmPanel.appendChild(resetCancelBtn);
  resetConfirmPanel.appendChild(resetConfirmBtn);
  viewSettings.appendChild(resetBtn);
  viewSettings.appendChild(resetConfirmPanel);

  return {
    listEl, emptyStateEl, loadFailureEl, clearBtn, countEl, listAnnouncerEl,
    settingsBtn, removeCompletedBtn, removeCompletedCountEl, includePinnedCheckbox,
    removeCompletedConfirmPanel, removeCompletedBodyEl,
    removeCompletedCancelBtn, removeCompletedConfirmBtn,
  };
}

/**
 * @param {object} opts
 * @param {object} [opts.seedStorage] - pre-seeded chrome.storage.local contents
 * @param {(storageManager: object) => void} [opts.patchStorageManager] -
 *   called with the real, loaded storageManager after it initializes, so a
 *   case can override one method (e.g. force getSettings() to reject)
 *   without needing storage-layer fault injection.
 */
function loadPopup(opts = {}) {
  const clock = createClock();
  const document = createDocument();
  const window = createWindow(document, 'chrome-extension://fake-id/popup/popup.html');
  const chromeStorage = createMockChromeStorage(clock, opts.storageLatency || {});
  if (opts.seedStorage) chromeStorage._seed(opts.seedStorage);
  const fakeRuntime = createFakeRuntime(clock);

  const warnings = [];
  const fakeConsole = {
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    log: () => {},
    error: (...args) => warnings.push(args.map(String).join(' ')),
  };

  const sandbox = {
    console: fakeConsole,
    chrome: {
      storage: { local: chromeStorage.local, onChanged: chromeStorage.onChanged },
      runtime: fakeRuntime.runtime,
    },
    importScripts: () => {},
    document,
    window,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    // v4 Phase 8 — popup.js's live-reconciliation announcer uses rAF to
    // force screen-reader re-announcement; not real animation timing here.
    requestAnimationFrame: (fn) => clock.setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clock.clearTimeout(id),
    Date: { now: () => clock.now() },
  };

  const context = vm.createContext(sandbox);

  for (const rel of MODULE_FILES) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    new vm.Script(code, { filename: rel }).runInContext(context);
  }
  new vm.Script('this.storageManager = storageManager;', { filename: '(export-globals)' }).runInContext(context);

  if (opts.patchStorageManager) opts.patchStorageManager(context.storageManager);

  const dom = buildPopupDom(document);

  const popupCode = fs.readFileSync(path.join(ROOT, POPUP_FILE), 'utf8');
  new vm.Script(popupCode, { filename: POPUP_FILE }).runInContext(context);

  // popup.js's real listener is async; give it room to run before the
  // caller inspects DOM state.
  document.dispatchEvent({ type: 'DOMContentLoaded' });

  return { context, clock, document, window, chromeStorage, warnings, dom, storageManager: context.storageManager };
}

module.exports = { loadPopup };
