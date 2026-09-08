'use strict';

const { loadExtension } = require('../lib/harness');
const { settle } = require('../lib/settle');

/**
 * Phase 1 case (roadmap 1.6/R18-class, not an original audit R-case): a
 * stored settings value that is an array rather than a plain object.
 * `typeof [] === 'object'` passes a naive object check, so this exercises
 * sanitizeSettingsValue()'s explicit isPlainObject() (Array-excluding)
 * guard rather than the string-value cases R18 already covers.
 */
module.exports = {
  id: 'T1-array-settings',
  title: 'An array stored as youtubeResumeSettings falls back to all defaults',
  finding: 'F12',
  async run() {
    const h = loadExtension({
      seedStorage: { youtubeResumeSettings: [1, 2, 3] },
    });

    await h.clock.advance(1000);
    const settings = await settle(h.clock, h.storageManager.getSettings());

    const isDefault = settings.minWatchSeconds === 30
      && settings.completionThreshold === 0.95
      && settings.rewindSeconds === 2
      && settings.showToast === true
      && settings.showRestartButton === true
      && settings.loadThumbnails === true;

    if (isDefault) {
      return { verdict: 'not-reproduced', evidence: `getSettings() correctly fell back to defaults: ${JSON.stringify(settings)}` };
    }
    return { verdict: 'reproduces', evidence: `getSettings() returned a corrupted shape from an array value: ${JSON.stringify(settings)}` };
  },
};
