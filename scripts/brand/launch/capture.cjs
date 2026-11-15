/**
 * WSL entry point for capture-frames.cjs (Windows Node + Windows Chrome, GPU).
 *
 *   node scripts/brand/launch/capture.cjs <plan.json> <out-dir> [lease.json]
 *
 * A lease file proves the caller already holds the cooperative GPU reservation
 * (its token must match the reservation on disk); without one this process
 * acquires and releases its own lease around the run. Localhost servers are
 * started by the caller from frozen source snapshots.
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { acquireGPU } = require('../../qa/launch/gpu-lease.cjs');

const RESERVATION = '/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json';
const PLAYWRIGHT = '/home/knotzuni/code/KnotzAxxon/asset-work/studio-opus-code/tools/node_modules/playwright';
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const [planFile, outDir, leaseFile] = process.argv.slice(2);
if (!planFile || !outDir) throw Error('usage: capture.cjs <plan.json> <out-dir> [lease.json]');
const win = p => execFileSync('wslpath', ['-w', path.resolve(p)], { encoding: 'utf8' }).trim();

let lease = null;
if (leaseFile) {
  const held = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
  const current = JSON.parse(fs.readFileSync(RESERVATION, 'utf8'));
  if (held.token !== current.token) throw Error(`GPU reservation is not ours: ${JSON.stringify(current)}`);
} else lease = acquireGPU(RESERVATION, 'Opus High marketing capture');

fs.mkdirSync(outDir, { recursive: true });
const env = { ...process.env, KZ_PLAYWRIGHT_PATH: win(PLAYWRIGHT), KZ_CHROME_EXE: CHROME,
  KZ_CAPTURE_PLAN: win(planFile), KZ_CAPTURE_OUT: win(outDir) };
env.WSLENV = 'KZ_PLAYWRIGHT_PATH:KZ_CHROME_EXE:KZ_CAPTURE_PLAN:KZ_CAPTURE_OUT';
const child = spawn('node.exe', [win(path.join(__dirname, 'capture-frames.cjs'))], { env, stdio: 'inherit' });
const done = code => { try { lease?.release(); } finally { process.exitCode = code ?? 1; } };
child.on('error', e => { console.error(e); done(1); });
child.on('exit', done);
