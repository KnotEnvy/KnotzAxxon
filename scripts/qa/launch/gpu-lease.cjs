// A cross-process cooperative reservation. No stale-lease deletion is automatic.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function acquireGPU(filename, owner) {
  if (!filename || !owner) throw Error('GPU lease requires an explicit path and owner');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const lease = { owner, pid: process.pid, host: os.hostname(), platform: process.platform,
    token: randomUUID(), acquiredAt: new Date().toISOString() };
  let fd;
  try { fd = fs.openSync(filename, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw Error(`GPU occupied: ${fs.readFileSync(filename, 'utf8')}`);
    throw error;
  }
  try { fs.writeFileSync(fd, JSON.stringify(lease, null, 2) + '\n'); }
  catch (error) { fs.closeSync(fd); fs.unlinkSync(filename); throw error; }
  fs.closeSync(fd);
  return { ...lease, release() {
    const current = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (current.token !== lease.token) throw Error('Refusing to release a GPU lease owned by another job');
    fs.unlinkSync(filename);
  } };
}
module.exports = { acquireGPU };
