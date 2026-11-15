import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The fixture runs the unmodified entry (src/main.js) and Audio module against a
// modelled browser autoplay policy. These are AudioContext state assertions;
// no audio is rendered or listened to.
const run = spawnSync(process.execPath, ['--experimental-vm-modules',
  fileURLToPath(new URL('./fixtures/opus-code-audio-lifecycle.mjs', import.meta.url))],
{ encoding: 'utf8', timeout: 30000 });
assert.equal(run.status, 0, run.stderr);
const { cases } = JSON.parse(run.stdout);
assert.ok(cases.length >= 13);
for (const result of cases) {
  test(`audio lifecycle: ${result.name}`, () => assert.equal(result.pass, true, result.error));
}
