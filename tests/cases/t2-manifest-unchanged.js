'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT } = require('../lib/harness');

/**
 * Phase 2 case (Roadmap v4 2.1/T2.6, D-102 hard constraint): manifest.json
 * gains exactly one new field, `background.service_worker` — `permissions`
 * and `host_permissions` must be byte-identical to v3.0.0 (S1 in
 * CLAUDE.md — adding either would need an explicit STOP, and this phase
 * doesn't).
 */
module.exports = {
  id: 'T2.6',
  title: 'manifest.json gains only background.service_worker; permissions/host_permissions unchanged',
  finding: 'D-102',
  async run() {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

    const permissionsOk = JSON.stringify(manifest.permissions) === JSON.stringify(['storage']);
    const hostPermissionsOk = JSON.stringify(manifest.host_permissions) === JSON.stringify(['https://www.youtube.com/*']);
    const backgroundOk = manifest.background
      && manifest.background.service_worker === 'background/storageWriter.js'
      && Object.keys(manifest.background).length === 1;

    if (permissionsOk && hostPermissionsOk && backgroundOk) {
      return {
        verdict: 'not-reproduced',
        evidence: `permissions=${JSON.stringify(manifest.permissions)}, host_permissions=${JSON.stringify(manifest.host_permissions)}, background=${JSON.stringify(manifest.background)}`,
      };
    }
    return {
      verdict: 'reproduces',
      evidence: `permissionsOk=${permissionsOk} hostPermissionsOk=${hostPermissionsOk} backgroundOk=${backgroundOk} manifest=${JSON.stringify(manifest)}`,
    };
  },
};
