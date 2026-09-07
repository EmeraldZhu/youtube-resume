'use strict';

/**
 * Deterministic virtual clock replacing setTimeout/setInterval/Date.now for
 * the vm sandbox. Timing-sensitive source (400ms resume delay, 250ms seek
 * verify, 10s player-discovery timeout, etc.) runs against this instead of
 * real wall-clock time so R1-R24 are fast and reproducible.
 *
 * advance(ms) fires every due timer in time order, flushing real microtasks
 * (via setImmediate) between each so chained promises settle before the next
 * timer fires — matching real event-loop ordering (macrotask -> microtasks
 * drained -> next macrotask).
 */
function createClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map(); // id -> { time, fn, interval }

  function setTimeoutFake(fn, ms) {
    const id = nextId++;
    timers.set(id, { time: now + (ms || 0), fn, interval: null });
    return id;
  }

  function clearTimeoutFake(id) {
    timers.delete(id);
  }

  function setIntervalFake(fn, ms) {
    const id = nextId++;
    timers.set(id, { time: now + ms, fn, interval: ms });
    return id;
  }

  function clearIntervalFake(id) {
    timers.delete(id);
  }

  function flushMicrotasks() {
    return new Promise((resolve) => setImmediate(resolve));
  }

  function dueEntries() {
    return [...timers.entries()].sort((a, b) => a[1].time - b[1].time || a[0] - b[0]);
  }

  /**
   * Advances the virtual clock by ms, firing every timer due along the way,
   * in time order, flushing microtasks after each fire.
   */
  async function advance(ms) {
    const target = now + ms;
    await flushMicrotasks();
    for (;;) {
      const due = dueEntries().filter(([, t]) => t.time <= target);
      if (due.length === 0) break;
      const [id, timer] = due[0];
      now = timer.time;
      if (timer.interval != null) {
        timer.time = now + timer.interval;
      } else {
        timers.delete(id);
      }
      timer.fn();
      await flushMicrotasks();
    }
    now = target;
  }

  /** Fires timers with no upper time bound until none remain due — used to drain a bounded ceiling (e.g. the 60s ad wait) without hand-computing exact ms. */
  async function advanceUntilIdle(maxMs = 120000) {
    await advance(maxMs);
  }

  return {
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    setInterval: setIntervalFake,
    clearInterval: clearIntervalFake,
    now: () => now,
    advance,
    advanceUntilIdle,
    flushMicrotasks,
    pendingCount: () => timers.size,
  };
}

module.exports = { createClock };
