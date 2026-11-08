'use strict';
const fs = require('node:fs');
const path = require('node:path');
const release = process.argv[2] || process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/i.test(release || '')) {
  throw new Error('A 40-character Git commit SHA is required to stamp the release.');
}
const root = path.resolve(__dirname, '..');
for (const name of ['index.html', 'version.json']) {
  const file = path.join(root, name);
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('__DW_BUILD__')) throw new Error(name + ' missing release placeholder');
  fs.writeFileSync(file, source.replaceAll('__DW_BUILD__', release));
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
if (manifest.version !== release) throw new Error('Version stamp did not match');
console.log('Stamped DEEP WEAVE release:', release);
