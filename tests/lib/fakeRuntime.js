'use strict';

/**
 * Minimal chrome.runtime port-messaging fake (v4 Phase 2) — just enough to
 * exercise storageManager (client) <-> storageWriter (worker) over
 * chrome.runtime.connect()/onConnect, against the shared fake clock so
 * message latency is deterministic like the rest of the harness.
 *
 * connect() returns a client-side Port synchronously (matching real Chrome);
 * the paired server-side Port is delivered asynchronously, on the next
 * clock tick, to whatever onConnect listeners are registered by then —
 * this is what lets the harness simulate storageWriter.js loading (and
 * registering its listener) either before or after storageManager.js
 * calls connect().
 *
 * Worker termination (T2.5) is modeled by `_terminateWorker()`: it forcibly
 * disconnects every live port (so the client's onDisconnect fires, same as
 * a real port dropping when its service worker is killed) and marks the
 * runtime "not live" so any connect() attempted before `_restartWorker()`
 * fails the same way — the client is expected to retry with backoff.
 */
function createFakeRuntime(clock) {
  const onConnectListeners = [];
  const livePorts = new Set();
  let live = true;

  class Port {
    constructor(name) {
      this.name = name;
      this._messageListeners = [];
      this._disconnectListeners = [];
      this._peer = null;
      this.disconnected = false;
    }

    get onMessage() {
      return { addListener: (fn) => this._messageListeners.push(fn) };
    }

    get onDisconnect() {
      return { addListener: (fn) => this._disconnectListeners.push(fn) };
    }

    postMessage(msg) {
      if (this.disconnected) {
        throw new Error('Attempting to use a disconnected port object');
      }
      clock.setTimeout(() => {
        if (!this._peer || this._peer.disconnected) return;
        this._peer._messageListeners.slice().forEach((fn) => fn(msg));
      }, 5);
    }

    disconnect() {
      if (this.disconnected) return;
      this.disconnected = true;
      livePorts.delete(this);
      this._disconnectListeners.slice().forEach((fn) => fn());
      const peer = this._peer;
      if (peer && !peer.disconnected) {
        peer.disconnected = true;
        livePorts.delete(peer);
        peer._disconnectListeners.slice().forEach((fn) => fn());
      }
    }
  }

  function connect(opts) {
    const name = opts && opts.name;
    const clientPort = new Port(name);
    if (!live) {
      // Mirrors a torn-down/respawning worker: the connection never pairs.
      clock.setTimeout(() => clientPort.disconnect(), 1);
      return clientPort;
    }
    livePorts.add(clientPort);
    clock.setTimeout(() => {
      if (!live) {
        clientPort.disconnect();
        return;
      }
      const serverPort = new Port(name);
      clientPort._peer = serverPort;
      serverPort._peer = clientPort;
      livePorts.add(serverPort);
      onConnectListeners.slice().forEach((fn) => fn(serverPort));
    }, 1);
    return clientPort;
  }

  return {
    runtime: {
      connect,
      onConnect: { addListener: (fn) => onConnectListeners.push(fn) },
    },
    // Test-only controls, not part of the chrome.runtime surface:
    _terminateWorker() {
      live = false;
      for (const p of [...livePorts]) p.disconnect();
    },
    _reviveWorker() {
      live = true;
      onConnectListeners.length = 0; // a freshly (re)spawned worker starts with no listeners registered yet
    },
  };
}

module.exports = { createFakeRuntime };
