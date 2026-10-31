// Verify every package in package-lock.json uses an approved open-source license.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const approved = new Set([
  'OFL-1.1', 'OFL', 'SIL OPEN FONT LICENSE Version 1.1', 'Public Domain',
  'MIT', 'MIT-0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0',
  'MPL-2.0', 'BlueOak-1.0.0', 'CC0-1.0', '0BSD', 'Python-2.0', 'CC-BY-4.0',
  '(MIT OR CC0-1.0)', '(MIT OR Apache-2.0)', '(BSD-2-Clause OR MIT OR Apache-2.0)',
  'MIT OR Apache-2.0', 'Apache-2.0 OR MIT',
  'WTFPL OR ISC', 'WTFPL', '(WTFPL OR MIT)',
]);
const failures = [];
let count = 0;
for (const [location, pkg] of Object.entries(lock.packages)) {
  if (!location) continue; // Root package
  if (pkg.dev) continue; // Development dependencies do not ship
  count++;
  const license = pkg.license;
  if (!license || !approved.has(license)) {
    failures.push(`${location}: ${JSON.stringify(license)}`);
  }
}

if (failures.length > 0) {
  console.error('Unapproved licenses:');
  for (const f of failures) console.error(f);
  process.exit(1);
}

console.log(`All ${count} runtime packages use approved licenses.`);
