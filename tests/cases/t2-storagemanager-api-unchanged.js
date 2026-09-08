'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * Phase 2 case (Roadmap v4 2.4/T2.7, D-102): storageManager.js's exported
 * function names and arity must be byte-identical to v3.0.0 — every
 * mutating function became a message client internally, but no caller
 * (content scripts, popup) should need any code change.
 */
const EXPECTED_API = {
  getProgress: 1,
  getAllProgress: 0,
  saveProgress: 5,
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
