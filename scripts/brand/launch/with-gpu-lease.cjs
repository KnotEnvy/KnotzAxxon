/**
 * Run one browser job under the cooperative GPU reservation.
 *
 *   node scripts/brand/launch/with-gpu-lease.cjs "<owner>" <command> [args...]
 *
 * This process is the lease's live owner for the whole job. It releases its
 * own token when the child exits or on SIGINT/SIGTERM, and never touches a
 * reservation it does not hold. If the reservation is busy it exits 75 at once.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { acquireGPU } = require('../../qa/launch/gpu-lease.cjs');

const RESERVATION = '/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json';
const [owner, command, ...args] = process.argv.slice(2);
if (!owner || !command) throw Error('usage: with-gpu-lease.cjs "<owner>" <command> [args...]');

let lease;
try { lease = acquireGPU(RESERVATION, owner); }
catch (error) { console.error(error.message); process.exit(75); }
const receipt = process.env.KZ_LEASE_RECEIPT;
const note = (event) => { if (receipt) fs.appendFileSync(receipt, JSON.stringify({ event, at: new Date().toISOString(),
  owner, ownerPID: lease.pid, token: lease.token, command: [command, ...args].join(' ') }) + '\n'); };
note('acquired');
let released = false;
const release = () => { if (released) return; released = true; try { lease.release(); note('released'); } catch (e) { console.error(e.message); } };
const child = spawn(command, args, { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });
child.on('error', (e) => { console.error(e); release(); process.exitCode = 1; });
child.on('exit', (code, signal) => { release(); process.exitCode = code ?? (signal ? 1 : 0); });
