'use strict';

const { loadExtension } = require('../lib/harness');
const { settle } = require('../lib/settle');

/**
 * R17: the library contains one null row; a healthy new row is saved.
 * Audit observed: the save rejects while reading the null row's `.pinned`
 * during eviction's unpinned-key filter — a single malformed row can block
 * an otherwise-healthy save.
 */
module.exports = {
  id: 'R17',
  title: 'A null library entry breaks an unrelated healthy save',
  finding: 'F12',
  async run() {
    const nullKey = 'nullkey0001'; // 11 chars, but the value itself is null
    const newId = 'vid0000017a';
    const h = loadExtension({
      seedStorage: { youtubeResume: { [nullKey]: null } },
    });

    await h.clock.advance(1000); // let repair settle first

    let rejected = false;
    let message = '';
    try {
      // settle() attaches its handler synchronously, before advancing the
      // clock — attaching it only after advance() would leave a window
      // where a same-tick rejection is "unhandled" and crashes the process
      // (Node's default unhandledRejection behavior).
      await settle(h.clock, h.storageManager.saveProgress(newId, 50, 4000, 'New video', 'Chan'));
    } catch (err) {
      rejected = true;
      message = err.message;
    }

    if (rejected) {
      return {
        verdict: 'reproduces',
        evidence: `saveProgress(${newId}) rejected: ${message}`,
      };
    }
    return { verdict: 'not-reproduced', evidence: 'save resolved without error' };
  },
};
