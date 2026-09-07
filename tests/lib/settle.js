'use strict';

/**
 * Awaits a promise that only resolves via the fake clock, by repeatedly
 * advancing the clock until it settles. Needed whenever a case awaits a
 * storageManager call directly (`await h.storageManager.getSettings()`)
 * instead of first capturing the promise and driving the clock — otherwise
 * the await and the clock advance deadlock, since nothing else drives the
 * virtual timers forward.
 */
async function settle(clock, promise, { stepMs = 50, maxMs = 20000 } = {}) {
  let settled = false;
  let result;
  let error;
  promise.then(
    (r) => { settled = true; result = r; },
    (e) => { settled = true; error = e; },
  );
  let elapsed = 0;
  while (!settled && elapsed < maxMs) {
    // eslint-disable-next-line no-await-in-loop
    await clock.advance(stepMs);
    elapsed += stepMs;
  }
  if (!settled) throw new Error(`settle() timed out waiting ${maxMs}ms of virtual time`);
  if (error) throw error;
  return result;
}

module.exports = { settle };
