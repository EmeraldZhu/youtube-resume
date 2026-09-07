'use strict';

/**
 * Mocks chrome.storage.local against the fake clock, so get()/set()/remove()
 * resolve asynchronously (like the real extension API) but deterministically.
 * Each get() resolves with a deep clone of the data as it stands at RESOLVE
 * time (not call time) — this is what makes two overlapping saves race the
 * same way real chrome.storage.local does (R13/R14/R19).
 */
function createMockChromeStorage(clock, { getLatencyMs = 10, setLatencyMs = 5 } = {}) {
  let data = {};

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function get(keys) {
    return new Promise((resolve) => {
      clock.setTimeout(() => {
        let result;
        if (keys == null) {
          result = clone(data);
        } else if (typeof keys === 'string') {
          result = Object.prototype.hasOwnProperty.call(data, keys) ? { [keys]: clone(data[keys]) } : {};
        } else if (Array.isArray(keys)) {
          result = {};
          for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(data, k)) result[k] = clone(data[k]);
          }
        } else {
          result = clone(data);
        }
        resolve(result);
      }, getLatencyMs);
    });
  }

  function set(obj) {
    return new Promise((resolve) => {
      clock.setTimeout(() => {
        for (const [k, v] of Object.entries(obj)) {
          data[k] = clone(v);
        }
        resolve();
      }, setLatencyMs);
    });
  }

  function remove(keys) {
    return new Promise((resolve) => {
      clock.setTimeout(() => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) delete data[k];
        resolve();
      }, setLatencyMs);
    });
  }

  return {
    local: { get, set, remove },
    // Test-only inspection/seeding — bypasses latency, mirrors direct
    // profile access the popup/background could never do mid-flight.
    _seed(obj) { data = clone(obj); },
    _raw() { return clone(data); },
  };
}

module.exports = { createMockChromeStorage };
