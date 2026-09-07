'use strict';

/**
 * Minimal HTMLVideoElement stand-in. currentTime is a plain settable number
 * (tests script native/user seeks by assigning it directly) — no seek
 * animation is simulated; 'seeking'/'readyState' are set explicitly by the
 * test to model the specific condition each R-case needs.
 */
class MockVideo {
  constructor({ currentTime = 0, duration = NaN, readyState = 4, seeking = false } = {}) {
    this.tagName = 'VIDEO';
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this.currentTime = currentTime;
    this.duration = duration;
    this.readyState = readyState;
    this.seeking = seeking;
    this.paused = true;
    this._listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }
  dispatchEvent(evt) {
    evt.target = this;
    const set = this._listeners.get(evt.type);
    if (set) [...set].forEach((fn) => fn(evt));
    return true;
  }
  fire(type) { this.dispatchEvent({ type }); }
}

module.exports = { MockVideo };
