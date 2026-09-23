#!/usr/bin/env node
// Regenerate MANIFEST.sha256 over every shipped file of the plugin. Run it last, just before a
// release commit; any later edit makes the CLI exit 5 until it is run again.
//   node scripts/build-manifest.mjs           write MANIFEST.sha256
//   node scripts/build-manifest.mjs --check   exit 5 when the manifest is missing or stale

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_FILE, buildManifest, verifyManifest } from '../lib/core/manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv.includes('--check')) {
  const v = await verifyManifest(root);
  if (!v.present) { console.log(`FAIL manifest ${MANIFEST_FILE} is missing`); process.exitCode = 5; }
  else if (!v.ok) { for (const m of v.mismatches) console.log(`FAIL manifest ${m.file}: ${m.reason}`); process.exitCode = 5; }
  else console.log(`${MANIFEST_FILE} is current (${v.manifestSha256})`);
} else {
  const text = await buildManifest(root);
  await writeFile(join(root, MANIFEST_FILE), text);
  console.log(`wrote ${MANIFEST_FILE}: ${text.trim().split('\n').length} files`);
}
