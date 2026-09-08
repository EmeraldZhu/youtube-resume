'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * Phase 2 case (Roadmap v4 2.4/T2.7, D-102): storageManager.js's exported
 * function names must be unchanged from v3.0.0, and every function's arity
 * must be unchanged EXCEPT saveProgress, which Phase 3 (Roadmap 3.1/3.3,
 * D-141) extends with a 6th, optional `ownership` parameter carrying the
 * calling session's write-ownership/freshness metadata — additive and
 * backward compatible (every existing call site that omits it is
 * unaffected; storageManager.js defaults each field via `?.`), so this
 * case now asserts arity 6 for saveProgress specifically rather than
 * flagging the intentional change as a regression.
 */
const EXPECTED_API = {
  getProgress: 1,
  getAllProgress: 0,
  saveProgress: 6,
  deleteProgress: 1,
  clearAllProgress: 0,
  pinProgress: 1,
  unpinProgress: 1,
  getSettings: 0,
  saveSettings: 1,
  resetSettings: 0,
  getDefaultSettings: 0,
};

module.exports = {
  id: 'T2.7',
  title: "storageManager.js's exported function names/arity are unchanged from v3.0.0",
  finding: 'D-102',
  async run() {
    const h = loadExtension();
    await h.clock.advance(1000);

    const actualNames = Object.keys(h.storageManager).sort();
    const expectedNames = Object.keys(EXPECTED_API).sort();
    const namesMatch = JSON.stringify(actualNames) === JSON.stringify(expectedNames);

    const arityMismatches = [];
    for (const name of expectedNames) {
      const actualArity = typeof h.storageManager[name] === 'function' ? h.storageManager[name].length : null;
      if (actualArity !== EXPECTED_API[name]) {
        arityMismatches.push(`${name}: expected ${EXPECTED_API[name]}, got ${actualArity}`);
      }
    }

    if (namesMatch && arityMismatches.length === 0) {
      return {
        verdict: 'not-reproduced',
        evidence: `Public API unchanged: ${actualNames.join(', ')}`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `namesMatch=${namesMatch} (actual=${actualNames.join(',')}) arityMismatches=${arityMismatches.join('; ')}`,
    };
  },
};
