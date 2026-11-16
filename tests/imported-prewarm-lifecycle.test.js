import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const run = spawnSync(process.execPath, ['--experimental-vm-modules',
  fileURLToPath(new URL('./fixtures/imported-prewarm-lifecycle.mjs', import.meta.url))],
{ encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr);
for (const result of JSON.parse(run.stdout).cases) {
  test(result.name, () => assert.equal(result.pass, true, result.error));
}
