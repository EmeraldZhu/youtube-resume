'use strict';

/**
 * Dependency-free regression harness runner (Phase 0, D-108).
 * Invocation: `node tests/run.js` (add `--json` for machine-readable output).
 *
 * Each file in tests/cases/ exports { id, title, finding, run() }. run()
 * returns { verdict, evidence } where verdict is one of:
 *   'reproduces' | 'not-reproduced' | 'reproduces-differently'
 * This is a reproduction harness, not a pass/fail suite — "reproduces" is
 * the expected outcome for an unfixed defect, not a failure of this script.
 * The runner only fails (non-zero exit) if a case throws instead of
 * returning a verdict, which is a harness/case bug, never silently skipped.
 *
 * File naming: `rNN-*.js` are the audit's original R1-R24 appendix cases
 * (fixed set, never renumbered). `tN-*.js` (v4 Phase 1 onward) are cases a
 * later phase adds for something the appendix never covered — phase-specific
 * regressions, not audit findings — kept in the same runnable suite per each
 * phase's "extend the harness with this phase's own cases" instruction.
 */

const fs = require('fs');
const path = require('path');

const CASES_DIR = path.join(__dirname, 'cases');
const jsonMode = process.argv.includes('--json');

async function main() {
  const files = fs.readdirSync(CASES_DIR)
    .filter((f) => /^(r\d{2}|t\d+)-.*\.js$/.test(f))
    .sort();

  const results = [];
  let harnessErrors = 0;

  for (const file of files) {
    const mod = require(path.join(CASES_DIR, file));
    const label = `${mod.id} — ${mod.title}`;
    try {
      const { verdict, evidence } = await mod.run();
      results.push({ id: mod.id, title: mod.title, finding: mod.finding, file, verdict, evidence });
    } catch (err) {
      harnessErrors += 1;
      results.push({
        id: mod.id, title: mod.title, finding: mod.finding, file,
        verdict: 'HARNESS ERROR', evidence: `${err.name}: ${err.message}`,
      });
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`Ran ${results.length} case(s) from tests/cases/\n`);
    for (const r of results) {
      console.log(`[${r.id}] ${r.title}  ->  ${r.verdict}`);
      console.log(`    finding: ${r.finding}`);
      console.log(`    evidence: ${r.evidence}`);
      console.log('');
    }
    const rCaseCount = results.filter((r) => /^r\d{2}-/.test(r.file)).length;
    if (rCaseCount !== 24) {
      console.log(`WARNING: expected 24 R1-R24 cases, found ${rCaseCount}.`);
    }
  }

  // Set the exit code rather than calling process.exit(): forcing an
  // immediate exit can truncate stdout that hasn't finished flushing yet
  // when stdout is a pipe rather than a TTY (observed on Windows).
  process.exitCode = harnessErrors > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Runner crashed:', err);
  process.exitCode = 1;
});
