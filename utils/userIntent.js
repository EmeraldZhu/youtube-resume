/**
 * UserIntentTracker Module
 *
 * Purpose: Distinguish a genuine user-driven seek/interaction from a native
 * player jump (F08) — a native "continue watching" restore or an ad-source
 * swap never fires keyboard/pointer input, so a position change with no
 * recent input behind it is native interference, not user intent.
 *
 * Public API:
 *   userIntent.wasRecentInput(windowMs) → boolean
 */

const userIntent = (() => {
  // -Infinity, not 0 — 0 is a legitimate Date.now()/clock timestamp (e.g.
  // at the very start of a test's virtual clock), so a falsy/zero sentinel
  // would wrongly read as "no input yet ever happened" forever.
  let lastInputAt = -Infinity;
  // keydown covers arrow-key/j-k-l seeking and the accessible seek slider's
  // own key handling; pointerdown/mousedown cover a scrubber drag or click.
  const INPUT_EVENTS = ['keydown', 'pointerdown', 'mousedown'];

  function markInput() {
    lastInputAt = Date.now();
  }

  INPUT_EVENTS.forEach((type) => {
    document.addEventListener(type, markInput, true);
  });

  function wasRecentInput(windowMs) {
    return (Date.now() - lastInputAt) <= windowMs;
  }

  return { wasRecentInput };
})();
