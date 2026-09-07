'use strict';

const { loadExtension } = require('../lib/harness');
const { settle } = require('../lib/settle');

/**
 * R18: settings contain a string minimum and a string boolean. Audit
 * observed: both invalid values are returned unchanged instead of being
 * replaced by defaults — getSettings() only merges over DEFAULT_SETTINGS,
 * it never validates each field's type.
 */
module.exports = {
  id: 'R18',
  title: 'Malformed setting values pass through getSettings() unvalidated',
  finding: 'F12',
  async run() {
    const h = loadExtension({
      seedStorage: {
        youtubeResumeSettings: { minWatchSeconds: 'broken', showToast: 'false' },
      },
    });

    await h.clock.advance(1000);
    const settings = await settle(h.clock, h.storageManager.getSettings());

    if (settings.minWatchSeconds === 'broken' && settings.showToast === 'false') {
      return {
        verdict: 'reproduces',
        evidence: `getSettings() returned minWatchSeconds=${JSON.stringify(settings.minWatchSeconds)}, showToast=${JSON.stringify(settings.showToast)} (a truthy string, not the boolean it claims to be) — no field-level validation.`,
      };
    }
    return { verdict: 'not-reproduced', evidence: JSON.stringify(settings) };
  },
};
