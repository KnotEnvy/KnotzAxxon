import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

export async function loadSource(repo, threeRoot) {
  const modules = new Map();
  const external = new Map();
  async function link(specifier, parent) {
    if (specifier === 'three' || specifier.startsWith('three/')) {
      const filename = specifier === 'three' ? 'build/three.module.js' : specifier.replace('three/addons/', 'examples/jsm/');
      const url = pathToFileURL(path.join(threeRoot, filename)).href;
      if (!external.has(url)) {
        const imported = await import(url);
        const synthetic = new vm.SyntheticModule(Object.keys(imported), function () {
          for (const [name, value] of Object.entries(imported)) this.setExport(name, value);
        }, { identifier: url });
        await synthetic.link(() => {});
        await synthetic.evaluate();
        external.set(url, synthetic);
      }
      return external.get(url);
    }
    const filename = path.resolve(path.dirname(parent.identifier), specifier);
    if (!modules.has(filename)) {
      const addition = filename.endsWith('/world/Fortress.js') ? '\nexport { Batch, Bucket, TPL, THEMES, themeFor };' : '';
      const module = new vm.SourceTextModule(fs.readFileSync(filename, 'utf8') + addition, { identifier: filename });
      modules.set(filename, module);
      await module.link(link);
    }
    return modules.get(filename);
  }
  const entry = await link('./src/world/Fortress.js', { identifier: path.join(repo, 'entry.mjs') });
  await entry.evaluate();
  const utils = modules.get(path.join(repo, 'src/core/Utils.js')).namespace;
  const level = modules.get(path.join(repo, 'src/world/Level.js')).namespace;
  const three = await import(pathToFileURL(path.join(threeRoot, 'build/three.module.js')).href);
  async function loadModule(filename) {
    const module = await link('./' + filename, { identifier: path.join(repo, 'entry.mjs') });
    await module.evaluate();
    return module.namespace;
  }
  return { ...entry.namespace, Rng: utils.Rng, level, THREE: three, loadModule };
}

export function recorder(batch, records) {
  return {
    box(...args) { records.push({ kind: 'crate', args }); batch.box(...args); },
    stamp(...args) {
      const [key, template, ...rest] = args;
      records.push({ kind: 'drum', args: [key, null, ...rest] });
      batch.stamp(...args);
    },
  };
}

export function triangleCount(batch) {
  return [...batch.buckets.values()].reduce((total, bucket) => total + bucket.pos.n / 9, 0);
}

export function summarize(records) {
  const crates = records.filter(record => record.kind === 'crate');
  return { crates: crates.length, drums: records.length - crates.length,
    height: Math.max(0, ...crates.map(record => record.args[2] + record.args[5])) };
}
