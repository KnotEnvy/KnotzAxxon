// Freeze identity only. This never grants publication or manufactures QA results.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {fingerprint, harnessFingerprint, sha256} = require('./fingerprint.cjs');
const {allocations} = require('./plan.cjs');
const {readPackage}=require('./production-bundle.cjs');
const {packageIdentity}=require('./production-proof.cjs');
const root = path.resolve(__dirname, '../../..');
const name = process.argv[2];
if (!name || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw Error('Expected a unique candidate name, e.g. rc01');
const file = path.join(root, 'docs/launch/candidates', name + '.json');
if (fs.existsSync(file)) throw Error('Candidate identities are immutable; use a new name');
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'public', 'index.html',
  'package.json', 'package-lock.json', 'vite.config.js', 'scripts/qa', 'scripts/brand', 'tests',
  'assets-source/launch-marketing', 'assets-source/launch-environment'],
{cwd: root, encoding: 'utf8'}).trim();
if (dirty) throw Error('Commit candidate runtime and harness before freezing:\n' + dirty);
const source = fingerprint(root);
const productionPackages=['pages','distribution'].map(kind=>{
  const directory=path.join(root,'artifacts/launch',kind,source.sourceHash.slice(0,16));
  const bundle=readPackage(directory,source.sourceHash);
  if(kind==='pages'&&bundle.base!=='/KnotzAxxon/')throw Error('Pages package has incorrect deployment base');
  if(kind==='distribution'&&bundle.base!=='/')throw Error('Portable package must use relative entry paths');
  return {kind,manifest:path.relative(root,path.join(directory,'manifest.json')),...packageIdentity(bundle)};
});
const exportsFile = path.join(root, 'assets-source/launch-marketing/export-manifest.json');
if (!fs.existsSync(exportsFile)) throw Error('Complete marketing exports before freezing public asset identity');
function treeHashes(dir) {
  // Match the runtime fingerprint's Git-aware inclusion rules. Ignored bytecode,
  // caches and tool output must never become environment-specific identities.
  const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', dir],
    {cwd: root, encoding: 'utf8'}).trim().split('\n').filter(Boolean))].sort();
  return files.map(file=>({file, sha256:sha256(fs.readFileSync(path.join(root,file)))}));
}
const harness = harnessFingerprint(root), harnessFiles = harness.files;
const editableFiles = [...treeHashes('scripts/brand'), ...treeHashes('assets-source/launch-marketing'),
  ...treeHashes('assets-source/launch-environment')];
const candidate = {schema: 'knotzaxxon.frozen-candidate.v1', name, frozenAt: new Date().toISOString(),
  commit: source.head, sourceHash: source.sourceHash, sourceFiles: source.files, productionPackages,
  harnessHash: harness.harnessHash, harnessFiles,
  editableSourceHash:sha256(JSON.stringify(editableFiles)), editableSourceFiles:editableFiles,
  browserPilotHash: sha256(fs.readFileSync(path.join(root, 'scripts/qa/launch/pilot-browser.js'))),
  marketingManifest: {file: path.relative(root, exportsFile), sha256: sha256(fs.readFileSync(exportsFile))},
  dependencies: {node: process.version, vite: require('vite/package.json').version,
    three: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'))).version,
    playwright: require('playwright/package.json').version},
  gameplayRequirements: allocations.map(a=>({...a, liveEpisodes:5})),
  judgingRequirement: 'Luna, Terra and Haiku independently >=9 in each of the seven unchanged lenses; all21 on this candidate',
  status: 'identity frozen; gameplay, package and judging results must be attached separately'};
fs.mkdirSync(path.dirname(file), {recursive:true});
fs.writeFileSync(file, JSON.stringify(candidate,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({file, commit:candidate.commit, sourceHash:candidate.sourceHash, harnessHash:candidate.harnessHash},null,2));
