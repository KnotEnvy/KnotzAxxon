const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const sha256 = data => createHash('sha256').update(data).digest('hex');
function fingerprint(root) {
  const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--',
    'src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.js'],
  { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean))].sort();
  const entries = files.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
  return { head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim(),
    sourceHash: sha256(JSON.stringify(entries)), files: entries };
}
module.exports = { fingerprint, sha256 };
