import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// VM links replace fault boundaries only; the fixture executes unmodified Game
// source and real Three.js, entities, pools, geometry builders and disposers.
const run = spawnSync(process.execPath, ['--experimental-vm-modules',
  new URL('./fixtures/game-startup-lifecycle.mjs', import.meta.url).pathname],
{ encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr);
const report = JSON.parse(run.stdout);
for (const result of report.cases) {
  test(result.name, () => assert.equal(result.pass, true, result.error));
}
