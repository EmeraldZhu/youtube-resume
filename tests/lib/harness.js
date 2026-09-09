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
const { createFakeRuntime } = require('./fakeRuntime');

const ROOT = path.join(__dirname, '..', '..');

const STORAGE_WRITER_FILE = 'background/storageWriter.js';

// Manifest content_scripts order (manifest.json) — significant, per
// CLAUDE.md ("Load order in manifest.json is significant: storage -> utils
// -> content"). popup.js is intentionally excluded: no R1-R24 case touches
// the popup layer. storage/storageWriter.js (the background service worker)
// is loaded into this same vm context too (v4 Phase 2) — the harness models
// content-script and worker as sharing one process, which is close enough
// for what these cases test (command serialization, idempotent retry) even
// though real Chrome runs them in separate realms connected only by
// chrome.runtime; storageManager.js/storageWriter.js talk to each other
// exclusively through the fake chrome.runtime port below, never by reaching
// into each other's closures, so this simplification doesn't let a case
// pass by accident via shared state that wouldn't exist in real Chrome.
const MODULE_FILES = [
  'storage/storageValidation.js',
  'storage/storageManager.js',
  STORAGE_WRITER_FILE,
  'utils/debugLogger.js',
  'utils/youtubeUtils.js',
  'utils/timeUtils.js',
  'utils/userIntent.js',
  'content/playerObserver.js',
  'content/uiInjector.js',
  'content/resumeManager.js',
  'content/navigationManager.js',
  'content/progressTracker.js',
];

const BOOTSTRAP_FILE = 'content/bootstrap.js';

const MODULE_GLOBAL_NAMES = [
  'storageValidation',
  'storageManager',
  'debugLogger',
  'youtubeUtils',
  'timeUtils',
  'userIntent',
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
  const fakeRuntime = createFakeRuntime(clock);

  const warnings = [];
  const logs = [];
  const fakeConsole = {
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    log: (...args) => logs.push(args.map(String).join(' ')),
    error: (...args) => warnings.push(args.map(String).join(' ')),
  };

  const sandbox = {
    console: fakeConsole,
    chrome: { storage: { local: chromeStorage.local }, runtime: fakeRuntime.runtime },
    // storageWriter.js importScripts()'s storageValidation.js, which the
    // harness already loads directly into this same context (see
    // MODULE_FILES) — a no-op here is faithful enough for what these cases
    // exercise (real Chrome's classic-worker importScripts is not itself
    // under test).
    importScripts: () => {},
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

  /**
   * Simulates the service worker being terminated and, after some virtual
   * time, respawning (v4 Phase 2, T2.5): drops every live port (so
   * storageManager's onDisconnect/retry path fires, same as a real port
   * dropping) and re-runs storageWriter.js in this same context, exactly
   * like the browser spinning up a fresh worker instance — a fresh queue,
   * startup (migrate + repair) run again (idempotent), no onConnect
   * listener until the new script registers one.
   */
  function restartWorker() {
    fakeRuntime._terminateWorker();
    fakeRuntime._reviveWorker();
    const code = fs.readFileSync(path.join(ROOT, STORAGE_WRITER_FILE), 'utf8');
    new vm.Script(code, { filename: STORAGE_WRITER_FILE }).runInContext(context);
  }

  return {
    context,
    clock,
    document,
    window,
    chromeStorage,
    fakeRuntime,
    terminateWorker: () => fakeRuntime._terminateWorker(),
    restartWorker,
    warnings,
    logs,
    // Convenience accessors, populated after exportCode ran above.
    storageValidation: context.storageValidation,
    storageManager: context.storageManager,
    debugLogger: context.debugLogger,
    youtubeUtils: context.youtubeUtils,
    timeUtils: context.timeUtils,
    userIntent: context.userIntent,
    playerObserver: context.playerObserver,
    uiInjector: context.uiInjector,
    resumeManager: context.resumeManager,
    navigationManager: context.navigationManager,
    progressTracker: context.progressTracker,
  };
}

module.exports = { loadExtension, ROOT };
