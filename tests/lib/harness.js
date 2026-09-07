'use strict';

/**
 * Loads the real, unmodified extension source into a fresh vm context per
 * test, wired to the fakes in this directory. Same technique the audit used
 * (EXTENSION_AUDIT_2026-09-07.md: "an isolated Node vm experiment executed
 * the actual source with controlled media, timers, DOM events, or
 * asynchronous storage"), now committed instead of one-off (D-108).
 *
 * IIFE modules assign to top-level `const` when a source file runs via
 * vm.Script#runInContext — those bindings live in the context's shared
 * lexical scope but are NOT own properties of the sandbox object, so
 * `context.storageManager` from outside the vm would be undefined. The
 * `exportGlobals` script below copies each module's IIFE-returned object
 * onto `this` (== the sandbox/global object in a non-strict top-level
 * script) so test code outside the vm can read them.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { createClock } = require('./fakeClock');
const { createDocument, createWindow, FakeMutationObserver } = require('./fakeDom');
const { createMockChromeStorage } = require('./mockChromeStorage');

const ROOT = path.join(__dirname, '..', '..');

// Manifest content_scripts order (manifest.json) — significant, per
// CLAUDE.md ("Load order in manifest.json is significant: storage -> utils
// -> content"). popup.js is intentionally excluded: no R1-R24 case touches
// the popup layer.
const MODULE_FILES = [
  'storage/storageManager.js',
  'utils/debugLogger.js',
  'utils/youtubeUtils.js',
  'utils/timeUtils.js',
  'content/playerObserver.js',
  'content/uiInjector.js',
  'content/resumeManager.js',
  'content/navigationManager.js',
  'content/progressTracker.js',
];

const BOOTSTRAP_FILE = 'content/bootstrap.js';

const MODULE_GLOBAL_NAMES = [
  'storageManager',
  'debugLogger',
  'youtubeUtils',
  'timeUtils',
  'playerObserver',
  'uiInjector',
  'resumeManager',
  'navigationManager',
  'progressTracker',
];

/**
 * @param {object} opts
 * @param {string} [opts.href] - initial window.location, default a non-watch page
 * @param {object} [opts.seedStorage] - pre-seeded chrome.storage.local contents
 * @param {boolean} [opts.loadBootstrap] - also load content/bootstrap.js, which
 *   self-executes init() and starts navigationManager's real 1000ms poll +
 *   'yt-navigate-finish' listener against the fake clock/document.
 * @param {object} [opts.storageLatency] - { getLatencyMs, setLatencyMs }
 */
function loadExtension(opts = {}) {
  const clock = createClock();
  const document = createDocument();
  const window = createWindow(document, opts.href || 'https://www.youtube.com/');
  const chromeStorage = createMockChromeStorage(clock, opts.storageLatency || {});
  if (opts.seedStorage) chromeStorage._seed(opts.seedStorage);

  const warnings = [];
  const logs = [];
  const fakeConsole = {
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    log: (...args) => logs.push(args.map(String).join(' ')),
    error: (...args) => warnings.push(args.map(String).join(' ')),
  };

  const sandbox = {
    console: fakeConsole,
    chrome: { storage: { local: chromeStorage.local } },
    document,
    window,
    MutationObserver: FakeMutationObserver,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    requestAnimationFrame: (fn) => clock.setTimeout(fn, 16),
    Date: { now: () => clock.now() },
    URL,
    URLSearchParams,
  };

  const context = vm.createContext(sandbox);

  const files = opts.loadBootstrap ? [...MODULE_FILES, BOOTSTRAP_FILE] : MODULE_FILES;
  for (const rel of files) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    new vm.Script(code, { filename: rel }).runInContext(context);
  }

  const exportCode = MODULE_GLOBAL_NAMES
    .map((name) => `if (typeof ${name} !== 'undefined') { this.${name} = ${name}; }`)
    .join('\n');
  new vm.Script(exportCode, { filename: '(export-globals)' }).runInContext(context);

  return {
    context,
    clock,
    document,
    window,
    chromeStorage,
    warnings,
    logs,
    // Convenience accessors, populated after exportCode ran above.
    storageManager: context.storageManager,
    debugLogger: context.debugLogger,
    youtubeUtils: context.youtubeUtils,
    timeUtils: context.timeUtils,
    playerObserver: context.playerObserver,
    uiInjector: context.uiInjector,
    resumeManager: context.resumeManager,
    navigationManager: context.navigationManager,
    progressTracker: context.progressTracker,
  };
}

module.exports = { loadExtension, ROOT };
