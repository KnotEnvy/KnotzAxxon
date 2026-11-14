import fs from 'node:fs';
import * as THREE from 'three';
import { Batch, Rng, output, stats, root } from './source-harness.mjs';
import { createAntennaTemplates, emitAntenna, emitMount, emitElement, emitLamp } from './AntennaRecipe.mjs';

const templates = createAntennaTemplates();
function build(name, operation) {
  const batch = new Batch(), parts = [];
  const stamp = batch.stamp;
  batch.stamp = function (key, template, x, y, z, uvScale, color, options) {
    const first = this.buckets.get(key)?.pos.n ?? 0;
    stamp.call(this, key, template, x, y, z, uvScale, color, options);
    parts.push({ key, firstVertex: first / 3, vertexCount: (this.buckets.get(key).pos.n - first) / 3, template: Object.entries(templates).find(([, geometry]) => geometry === template)[0], placement: [x, y, z], color, options });
  };
  operation(batch);
  return { name, ...stats(batch), parts, buckets: Object.fromEntries([...batch.buckets].map(([key, bucket]) => [key, { position: Array.from(bucket.pos.view()), normal: Array.from(bucket.nrm.view()), color: Array.from(bucket.col.view()), animation: bucket.anim ? Array.from(bucket.anim.view()) : null }])) };
}
const variants = {};
variants.seed42 = build('seed42', batch => emitAntenna(batch, new Rng(42), 0, 0, { name: 'citadel' }, templates));
for (const height of [7, 13]) variants[`h${height}`] = build(`h${height}`, batch => {
  emitMount(batch, 0, 0, height, templates);
  for (let y = 2; y < height; y += 2.2) emitElement(batch, 0, y, 0, 2.1 - y * .035, templates);
  emitLamp(batch, 0, height, 0, 0xff3d55, [1, .8, .25], templates);
});
fs.writeFileSync(`${root}/asset-work/antenna/work/geometry.json`, JSON.stringify(variants));
fs.writeFileSync(`${output}/evidence/generated-geometry.json`, JSON.stringify(Object.fromEntries(Object.entries(variants).map(([name, value]) => [name, { ...value, buckets: Object.fromEntries(Object.entries(value.buckets).map(([key, bucket]) => [key, { triangles: bucket.position.length / 9 }])) }])), null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(variants).map(([name, value]) => [name, { triangles: value.triangles, bounds: value.bounds }]))));
