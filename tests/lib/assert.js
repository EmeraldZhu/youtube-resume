'use strict';

class AssertionError extends Error {}

function ok(cond, msg) {
  if (!cond) throw new AssertionError(msg || 'assertion failed');
}

function equal(actual, expected, msg) {
  if (actual !== expected) {
    throw new AssertionError(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function approx(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new AssertionError(msg || `expected ~${expected} (+/-${tolerance}), got ${actual}`);
  }
}

module.exports = { ok, equal, approx, AssertionError };
