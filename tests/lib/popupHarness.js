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

const ROOT = path.join(__dirname, '..', '..');

const MODULE_FILES = [
  'storage/storageManager.js',
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
  viewList.appendChild(countEl);
  viewList.appendChild(listEl);
  viewList.appendChild(emptyStateEl);
  viewList.appendChild(loadFailureEl);

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

  return { listEl, emptyStateEl, loadFailureEl, clearBtn, countEl };
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

  const warnings = [];
  const fakeConsole = {
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    log: () => {},
    error: (...args) => warnings.push(args.map(String).join(' ')),
  };

  const sandbox = {
    console: fakeConsole,
    chrome: { storage: { local: chromeStorage.local } },
    document,
    window,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
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
