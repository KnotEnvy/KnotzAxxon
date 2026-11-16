import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Materials } from '../src/render/Materials.js';
import { Effects } from '../src/fx/Effects.js';
import { ParticleSystem } from '../src/fx/Particles.js';
import { Trail } from '../src/fx/Trail.js';
import { AmbientDust } from '../src/fx/Ambience.js';
import { Projectiles } from '../src/entities/Projectiles.js';
import { Player } from '../src/entities/Player.js';
import { Boss } from '../src/entities/Boss.js';

globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
function materials() {
  const m = Object.create(Materials.prototype); m._neon = new Map(); m._disposables = [];
  for (const key of ['enemyHull', 'enemyArmor', 'enemyMetal', 'darkMetal', 'playerHull', 'playerAccent', 'glass', 'hull', 'deck', 'grating', 'hazard']) {
    m[key] = m.track(new THREE.MeshStandardMaterial());
  }
  m.glow = m.ring = m.blob = new THREE.Texture();
  return m;
}
const quality = { particleBudget: 24, debrisBudget: 12, lights: 2 };
const builders = {
  ParticleSystem: (s, m) => new ParticleSystem(s, m.glow, 16),
  Trail: s => new Trail(s), AmbientDust: s => new AmbientDust(s, 8),
  Effects: (s, m) => new Effects(s, m, quality),
  Projectiles: (s, m) => new Projectiles(s, m, quality),
  Player: (s, m) => new Player(s, m, {}, {}),
  Boss: (s, m) => new Boss(s, m, { z: 80 }),
};

for (const [name, build] of Object.entries(builders)) {
  test(`${name} rolls back every scene-attachment failure, preserving the original error`, () => {
    const sample = new THREE.Scene(), sampleMats = materials();
    const complete = build(sample, sampleMats), stages = sample.children.length;
    complete.dispose(); sampleMats.dispose();
    for (let stage = 1; stage <= stages; stage++) {
      const scene = new THREE.Scene(), sentinel = new THREE.Group(), m = materials(); scene.add(sentinel);
      const add = scene.add, fault = Error(`${name} attachment ${stage}`), counts = new Map();
      const track = resource => {
        if (!counts.has(resource)) {
          counts.set(resource, 0);
          resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
        }
      };
      let attachments = 0;
      scene.add = function (...objects) {
        for (const object of objects) object.traverse(o => {
          if (o.geometry && !o.isSprite) track(o.geometry);
          if (o.isInstancedMesh) track(o);
          for (const material of [].concat(o.material ?? [])) if (!m._disposables.includes(material)) track(material);
        });
        add.apply(this, objects);
        if (++attachments === stage) throw fault;
        return this;
      };
      try {
        assert.throws(() => build(scene, m), e => e === fault);
        assert.equal(scene.children.length, 1, `stage ${stage} left scene owners`);
        assert.equal(scene.children[0] === sentinel, true);
        for (const count of counts.values()) assert.equal(count, 1, `stage ${stage} must release private resource once`);
      } finally { m.dispose(); }
    }
  });

  test(`${name} attempts all private resources after a geometry disposer throws, once`, () => {
    const scene = new THREE.Scene(), m = materials(), owner = build(scene, m), counts = new Map();
    const textures = [m.glow, m.ring, m.blob]; let sharedDisposals = 0;
    for (const resource of [m.enemyHull, m.darkMetal, ...textures]) resource.addEventListener('dispose', () => sharedDisposals++);
    const track = r => {
      if (!counts.has(r)) {
        counts.set(r, 0); r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
      }
    };
    scene.traverse(o => {
      if (o.geometry && !o.isSprite) track(o.geometry);
      if (o.isInstancedMesh) track(o);
      for (const material of [].concat(o.material ?? [])) if (!m._disposables.includes(material)) track(material);
    });
    const firstGeometry = [...counts.keys()].find(r => r.isBufferGeometry);
    firstGeometry.addEventListener('dispose', () => { throw Error('geometry cleanup'); });
    try {
      assert.throws(() => owner.dispose(), e => e instanceof AggregateError);
      for (const count of counts.values()) assert.equal(count, 1);
      assert.equal(scene.children.length, 0); assert.equal(sharedDisposals, 0);
      owner.dispose(); for (const count of counts.values()) assert.equal(count, 1);
    } finally { m.dispose(); }
  });
}
