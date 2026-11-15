const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const sha256 = data => createHash('sha256').update(data).digest('hex');
function fileHashes(root, paths) {
  const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--',
    ...paths],
  { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean))].sort();
  return files.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
}
function harnessFingerprint(root) {
  const files=fileHashes(root,['scripts/qa','tests']);
  return {harnessHash:sha256(JSON.stringify(files)),files};
}
function fingerprint(root) {
  const entries=fileHashes(root,['src','public','index.html','package.json','package-lock.json','vite.config.js']);
  return { head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim(),
    sourceHash: sha256(JSON.stringify(entries)), files: entries };
}
module.exports = { fingerprint, harnessFingerprint, fileHashes, sha256 };
