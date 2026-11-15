import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('entry blocks keyboard and menu resume until renderer recovery, then requires fresh input', () => {
  const run = spawnSync(process.execPath, ['--experimental-vm-modules',
    fileURLToPath(new URL('./fixtures/context-resume.mjs', import.meta.url))], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).length, 8);
});
