// Linux entry: paired actual-game frames of the ambient traffic layer on Nitro's hardware GPU.
// Owns a localhost-only Vite server and a Windows Node/Chrome child driven over Playwright pipes.
// Takes the cooperative GPU lease first, records it, and releases only its own token.
// usage: node assets-source/launch-environment/tools/capture.cjs <spec.json> <out-dir>
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const { acquireGPU } = require(path.join(root, 'scripts/qa/launch/gpu-lease.cjs'));

const specFile = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const port = spec.port ?? 5231;
const win = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'report.json'))) throw Error(`refusing to overwrite an existing run: ${out}`);
const lease = acquireGPU('/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json', 'Fable High ambient traffic capture');
let vite = null, released = false;
const release = () => { if (released) return; released = true; try { vite?.kill('SIGTERM'); } catch { /* already gone */ } lease.release(); };
process.on('SIGINT', () => { release(); process.exit(130); });
process.on('SIGTERM', () => { release(); process.exit(143); });
process.on('uncaughtException', (e) => { console.error(e); release(); process.exit(1); });

(async () => {
  const { token, ...publicLease } = lease;
  const sources = ['src/world/AmbientTraffic.js', 'src/world/Fortress.js', 'src/world/Level.js', 'src/world/FortressKit.js', 'src/world/EnvironmentKit.js',
    'src/fx/Ambience.js', 'src/render/Underlay.js', 'src/render/Sky.js', 'src/render/PostFX.js', 'src/render/Materials.js', 'src/game/Game.js', 'index.html', 'src/style.css', 'src/ui/Screens.js'];
  fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({
    head: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    status: execFileSync('git', ['-C', root, 'status', '--short'], { encoding: 'utf8' }).trim().split('\n'),
    sha256: Object.fromEntries(sources.map((s) => [s, sha(path.join(root, s))])),
    lease: { ...publicLease, ownerPID: lease.pid, token: token.slice(0, 8) + '…' },
  }, null, 1));

  vite = spawn('node', [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(Error('vite did not start')), 30000);
    vite.stdout.on('data', (d) => { if (String(d).includes('127.0.0.1')) { clearTimeout(timer); ok(); } });
    vite.on('exit', (c) => fail(Error(`vite exited ${c}`)));
  });

  const env = { ...process.env,
    KZ_PLAYWRIGHT_PATH: win(path.join(root, 'node_modules/playwright')),
    KZ_CHROME_EXE: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    KZ_SPEC: win(specFile), KZ_OUT: win(out), KZ_URL: `http://127.0.0.1:${port}/` };
  env.WSLENV = 'KZ_PLAYWRIGHT_PATH:KZ_CHROME_EXE:KZ_SPEC:KZ_OUT:KZ_URL';
  const code = await new Promise((ok) => {
    const child = spawn('/mnt/c/nvm4w/nodejs/node.exe', [win(path.join(__dirname, 'capture-win.cjs'))], { env, stdio: 'inherit' });
    child.on('error', (e) => { console.error(e); ok(1); });
    child.on('exit', (c) => ok(c ?? 1));
  });
  release();
  process.exit(code);
})().catch((e) => { console.error(e); release(); process.exit(1); });
