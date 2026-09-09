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
  // v4 Phase 8 (8.1) — onChanged listeners, fired asynchronously via the
  // fake clock (not synchronously inside set()/remove()) so ordering
  // relative to the caller's own await matches real chrome.storage.onChanged.
  const changeListeners = [];

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function fireChanged(changes) {
    if (Object.keys(changes).length === 0) return;
    clock.setTimeout(() => {
      changeListeners.forEach((fn) => fn(changes, 'local'));
    }, 0);
  }

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
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = {
            oldValue: Object.prototype.hasOwnProperty.call(data, k) ? clone(data[k]) : undefined,
            newValue: clone(v),
          };
          data[k] = clone(v);
        }
        resolve();
        fireChanged(changes);
      }, setLatencyMs);
    });
  }

  function remove(keys) {
    return new Promise((resolve) => {
      clock.setTimeout(() => {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        for (const k of list) {
          if (Object.prototype.hasOwnProperty.call(data, k)) {
            changes[k] = { oldValue: clone(data[k]), newValue: undefined };
          }
          delete data[k];
        }
        resolve();
        fireChanged(changes);
      }, setLatencyMs);
    });
  }

  const onChanged = {
    addListener(fn) { changeListeners.push(fn); },
    removeListener(fn) {
      const i = changeListeners.indexOf(fn);
      if (i >= 0) changeListeners.splice(i, 1);
    },
  };

  return {
    local: { get, set, remove },
    onChanged,
    // Test-only inspection/seeding — bypasses latency, mirrors direct
    // profile access the popup/background could never do mid-flight.
    _seed(obj) { data = clone(obj); },
    _raw() { return clone(data); },
  };
}

module.exports = { createMockChromeStorage };
