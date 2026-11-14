import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const templates = new Map();

/** Load before Game construction so model creation and shader prewarming stay synchronous. */
export async function loadImportedModels() {
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(['player', 'sentinel', 'turret', 'radar', 'silo', 'fuel'].map(async name => {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
    templates.set(name, gltf.scene);
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) { disposeImportedModels(); throw failure.reason; }
}

export function disposeImportedModels() {
  const resources = new Set();
  for (const root of templates.values()) root.traverse(o => {
    if (o.geometry) resources.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) {
      resources.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
  templates.clear();
}

function instantiate(name) {
  const template = templates.get(name);
  if (!template) return null;
  const root = template.clone(true), materials = new Map(), geometries = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    if (!geometries.has(o.geometry)) geometries.set(o.geometry, o.geometry.clone());
    o.geometry = geometries.get(o.geometry);
    const copy = m => {
      if (!materials.has(m)) materials.set(m, m.clone());
      return materials.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
    o.castShadow = true; o.receiveShadow = true;
  });
  root.userData.modelOwnedMaterials = [...materials.values()];
  return root;
}

function node(root, name) {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`Imported model missing ${name}`);
  return found;
}

function replaceMaterial(root, name, replacement) {
  root.traverse(o => {
    if (!o.material) return;
    const swap = m => m.name === name ? replacement : m;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

export function buildImportedShip(mats) {
  const root = instantiate('player');
  if (!root) return null;
  root.name = 'hero-interceptor-imported';
  root.updateMatrixWorld(true);
  const parts = [];
  for (const name of ['airframe-hull', 'airframe-accent', 'airframe-glass']) {
    node(root, name).traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a);
      g.clearGroups(); parts.push(g);
    });
  }
  const material = mats._playerSilhouette ??= mats.track(new THREE.MeshBasicMaterial({
    color: 0x7fe8ff, opacity: .32, depthWrite: false, depthFunc: THREE.GreaterDepth,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, toneMapped: false,
  }));
  const silhouette = new THREE.Mesh(mergeGeometries(parts, false), material);
  parts.forEach(g => g.dispose());
  root.traverse(o => { if (o.isMesh) o.renderOrder = 6; });
  silhouette.name = 'occluded-airframe'; silhouette.renderOrder = 5; silhouette.visible = false;
  root.add(silhouette);
  root.userData.engines = [node(root, 'engine-core--1'), node(root, 'engine-core-1')];
  root.userData.silhouette = silhouette;
  return root;
}

/** Bind the authored hierarchy to the existing procedural combat animation. */
export function buildImportedBoss(boss, mats) {
  const root = instantiate('sentinel');
  if (!root) return false;
  boss.group.add(root);
  for (const [property, name] of Object.entries({torso:'torso',head:'head',coreGroup:'reactor',core:'reactor-core',coreShell:'reactor-shell'})) boss[property] = node(root,name);
  const cue = color => new THREE.MeshBasicMaterial({color, toneMapped:false});
  boss.visorMat = cue(0xff3d55); boss.chargeMat = cue(0xffb43a); boss.seamMat = cue(0xff3d55);
  for (const [name, material] of [['SN_Visor',boss.visorMat],['SN_Charge',boss.chargeMat],['SN_Seam',boss.seamMat]]) replaceMaterial(root,name,material);
  boss.coreMat = mats._bossCore ??= mats.energyCore(0xff3d55);
  replaceMaterial(root,'SN_Core',boss.coreMat);
  replaceMaterial(root,'SN_CoreShell',mats.neon(0xff3d55,2.2,{transparent:true,opacity:.5,additive:true,depthWrite:false}));
  boss.antennaTips = ['L','R'].map(s => node(root,`antenna-tip-${s}`));
  boss.thrusters = ['L','R'].map(s => node(root,`thruster-${s}`));
  boss.shutters = Array.from({length:4},(_,i)=>({holder:node(root,`shutter-holder-${i}`),mesh:node(root,`shutter-${i}`),base:3.4}));
  boss.arms = [1,-1].map(side=>({side,forearm:node(root,`forearm-${side>0?'R':'L'}`)}));
  boss.launcher = {forearm:boss.arms[0].forearm,mouth:node(root,'missile-mouth'),pos:new THREE.Vector3(),radius:3.4,alive:true,charging:false,charge:0,hits:0,cooldown:7,timer:0};
  boss.pods = [1,-1].map(side => {
    const prefix = `pod-${side>0?'R':'L'}`, group=node(root,prefix), body=node(root,`${prefix}-body`), stump=node(root,`${prefix}-stump`);
    stump.visible=false;
    const flashMat=new THREE.MeshBasicMaterial({color:0xfff1d5,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const flashMesh=body.clone(true);
    flashMesh.traverse(o=>{if(o.isMesh)o.material=flashMat;});
    flashMesh.scale.setScalar(1.1);flashMesh.visible=false;group.add(flashMesh);
    return {group,side,hp:22,hpMax:22,alive:true,body,stump,barrels:[0,1].map(i=>node(root,`${prefix}-barrel-${i}`)),eye:node(root,`${prefix}-eye`),flashMat,flashMesh,flash:0,fireTimer:boss.rng.range(.5,2),pos:new THREE.Vector3(),radius:5,recoil:0,spark:0};
  });
  return true;
}

/** Imported ground targets retain the Enemy lifecycle and procedural aiming. */
export function buildImportedGround(enemy, kind) {
  const root = instantiate(kind);
  if (!root) return false;
  enemy.group.add(root);
  enemy._importedRoot = root;
  let flashSource, flashParent;
  if (kind === 'turret') {
    enemy.turntable = node(root, 'turntable');
    enemy.barrels = [node(root, 'barrel')];
    enemy.eye = node(root, 'eye');
    flashSource = node(root, 'dome');
    flashParent = enemy.turntable;
  } else if (kind === 'radar') {
    enemy.dish = node(root, 'dish');
    enemy.emitter = node(root, 'emitter');
    flashSource = node(root, 'dish_shell');
    flashParent = enemy.dish;
  } else if (kind === 'silo') {
    enemy.hatch = node(root, 'hatch');
    enemy.glow = node(root, 'glow');
    flashSource = node(root, 'body');
    flashParent = root;
  } else if (kind === 'fuel') {
    enemy.band = node(root, 'band');
    flashSource = ['body', 'cap', 'stave-0', 'stave-1', 'stave-2'].map(name => node(root, name));
    flashParent = root;
  } else {
    throw new Error(`Unsupported imported ground target: ${kind}`);
  }
  enemy.group.updateMatrixWorld(true);
  const inverse = flashParent.matrixWorld.clone().invert(), parts = [];
  for (const source of [].concat(flashSource)) source.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal'].includes(a)) g.deleteAttribute(a);
    g.clearGroups(); parts.push(g);
  });
  const geometry = mergeGeometries(parts, false);
  parts.forEach(g => g.dispose());
  enemy._addFlashShell(geometry, 1.06);
  flashParent.add(enemy.flashMesh);
  return true;
}
