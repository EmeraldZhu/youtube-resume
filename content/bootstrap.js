/**
 * Bootstrap Module
 *
 * Purpose: Entry point. Owns no logic of its own. Wires all
 * modules together and starts the system.
 *
 * This module is self-executing on load.
 */

// Temporary verification callback for Phase 4 testing
navigationManager.start((videoId) => {
  console.log('[YTResume] videoChange:', videoId);
});

console.log('[YTResume] bootstrap.js loaded');
