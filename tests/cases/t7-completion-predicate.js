'use strict';

const { loadExtension } = require('../lib/harness');

/**
 * Phase 7 case (Roadmap 7.1/7.2, D-104): storageValidation.isCompleteEntry
 * is the single completion predicate shared by display, "Only at the end",
 * and "Remove completed". Exercises: a genuine `ended:true` marker (always
 * complete regardless of position); the legacy inference boundary
 * (Math.floor(time) >= duration - 1) on both sides, including a fractional
 * duration; and mergeEntryPair's OR-preserve semantics for `ended` (a
 * duplicate row must not lose a genuine completion fact across a repair
 * merge, same as `pinned`).
 */
module.exports = {
  id: 'T7-completion-predicate',
  title: 'isCompleteEntry: ended marker, legacy boundary (incl. fractional duration), and merge preservation',
  finding: 'F14/F15',
  async run() {
    const h = loadExtension();
    const sv = h.storageValidation;
    const evidence = [];
    let allOk = true;

    function check(label, actual, expected) {
      const ok = actual === expected;
      allOk = allOk && ok;
      evidence.push(`${label}=${actual} (expected ${expected}) ${ok ? 'OK' : 'FAIL'}`);
    }

    // Genuine marker wins regardless of position.
    check('ended-true-low-position', sv.isCompleteEntry({ time: 5, duration: 4000, ended: true }), true);

    // Legacy boundary, integer duration: duration=100 -> threshold 99.
    check('legacy-just-below', sv.isCompleteEntry({ time: 98, duration: 100 }), false);
    check('legacy-at-boundary', sv.isCompleteEntry({ time: 99, duration: 100 }), true);
    check('legacy-at-duration', sv.isCompleteEntry({ time: 100, duration: 100 }), true);

    // Fractional duration must not throw or misclassify: duration=125.7 -> threshold 124.7.
    check('legacy-fractional-below', sv.isCompleteEntry({ time: 124, duration: 125.7 }), false);
    check('legacy-fractional-at', sv.isCompleteEntry({ time: 125, duration: 125.7 }), true);

    // No duration at all — never complete, never throws.
    check('no-duration', sv.isCompleteEntry({ time: 500 }), false);

    // Merge preserves ended via OR, same as pinned (repairStore path).
    const { store: merged } = sv.repairStore({
      dupOneOfTwo: { time: 10, duration: 4000, updated: 1, ended: true },
      ' dupOneOfTwo ': { time: 20, duration: 4000, updated: 2 }, // trims to the same canonical id
    }, undefined, 100);
    check('merge-preserves-ended', !!merged.dupOneOfTwo.ended, true);

    return {
      verdict: allOk ? 'not-reproduced' : 'reproduces',
      evidence: evidence.join(' | '),
    };
  },
};
