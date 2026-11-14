import { prepareImportedCargo, disposeImportedCargo } from './ImportedCargo.js';
import { loadImportedCoveredFighter, disposeCoveredFighterTemplates } from './ImportedCoveredFighter.js';
import { loadImportedFuelDepot, disposeImportedFuelDepot } from './ImportedFuelDepot.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadImportedFlakGun, disposeImportedFlakGun } from './ImportedFlakGun.js';
import { loadImportedCoolingStack, disposeImportedCoolingStack } from './ImportedCoolingStack.js';
import { prepareImportedAntenna, disposeImportedAntenna } from './ImportedAntenna.js';
import { loadImportedWreckage, disposeImportedWreckage } from './ImportedWreckage.js';
import { loadImportedCarrier, disposeImportedCarrier } from './ImportedCarrier.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const templates = new Map();

/** Load before Game construction so model creation and shader prewarming stay synchronous. */
export async function loadImportedModels() {
  const loader = new GLTFLoader();
  const names = ['player', 'sentinel', 'turret', 'radar', 'silo', 'fuel'];
  // User-approved production assets. Explicit 0 retains the procedural QA fallback.
  const productionPreview = new URLSearchParams(globalThis.location?.search ?? '').get('productionModels') !== '0';
  const productionNames = ['drone', 'interceptor', 'heavy-turret', 'mine', 'shield-pickup', 'parked-fighter', 'spread-pickup', 'repair-pickup', 'fuel-pickup', 'missile', 'dreadnought', 'asteroids', 'bunker', 'cargo-kit'];
  if (productionPreview) names.push(...productionNames, 'carrier-runtime', 'wreckage-runtime', 'antenna-runtime', 'cooling-runtime', 'flak-runtime', 'fuel-depot-runtime', 'covered-fighter-runtime');
  const results = await Promise.allSettled(names.map(async name => {
    if (name === 'covered-fighter-runtime') return loadImportedCoveredFighter(`${import.meta.env.BASE_URL}models/production/`);
    if (name === 'fuel-depot-runtime') return loadImportedFuelDepot(`${import.meta.env.BASE_URL}models/production/`);
    if (name === 'flak-runtime') return loadImportedFlakGun(`${import.meta.env.BASE_URL}models/production/`);
    if (name === 'cooling-runtime') return loadImportedCoolingStack(`${import.meta.env.BASE_URL}models/production/`);
    if (name === 'antenna-runtime') return prepareImportedAntenna();
    if (name === 'wreckage-runtime') return loadImportedWreckage(`${import.meta.env.BASE_URL}models/production/`);
    if (name === 'carrier-runtime') return loadImportedCarrier(`${import.meta.env.BASE_URL}models/production/`);
    const folder = productionNames.includes(name) ? 'production/' : '';
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${folder}${name}.glb`);
    if (name === 'cargo-kit') { prepareImportedCargo(gltf); return; }
    if (name === 'drone') {
      // The authored flash lives in a non-default scene to remain hidden in generic viewers.
      const flash = node(gltf.scenes[1], 'flash_shell');
      flash.visible = false;
      node(gltf.scene, 'drone_root').add(flash);
    }
    if (name === 'dreadnought') {
      const { prepareImportedDreadnought } = await import('./ImportedLandmarks.js');
      prepareImportedDreadnought(gltf.scene);
    }
    if (name === 'asteroids') {
      const { prepareImportedAsteroids } = await import('./ImportedLandmarks.js');
      prepareImportedAsteroids(gltf.scene);
    }
    templates.set(name, gltf.scene);
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) { disposeImportedModels(); throw failure.reason; }
}

/** One owned resource pair for the entire projectile pool; never clone per slot. */
export function buildImportedMissile(materials) {
  const template = templates.get('missile');
  if (!template) return null;
  const geometry = node(template, 'MISSILE_POOLED').geometry.clone();
  geometry.clearGroups();
  const material = materials.enemyArmor?.clone() ?? new THREE.MeshStandardMaterial({
    metalness: .48, roughness: .42, envMapIntensity: 1.2,
    emissive: 0x4b2419, emissiveIntensity: .16,
  });
  material.color.set(0xffffff);
  material.vertexColors = true;
  // Material.clone does not retain onBeforeCompile or its live rim uniforms.
  materials.addRim?.(material, 0xffb68a, .32, 2.8);
  return { geometry, material };
}

/** Initial flyer integration: preserve the existing Flyer state and update method. */
export function buildImportedFlyer(enemy, kind) {
  const root = instantiate(kind);
  if (!root) return false;
  const owned = new Set(root.userData.modelOwnedMaterials);
  const replaceOwned = (target, material, separatelyOwned = false) => {
    for (const old of new Set([].concat(target.material))) {
      owned.delete(old);
      old.dispose();
    }
    target.material = material;
    if (!separatelyOwned) owned.add(material);
  };
  enemy.body = node(root, 'body');
  enemy.eye = node(root, 'eye');
  enemy.engine = node(root, 'engine');
  const cue = color => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(3), toneMapped: false,
  });
  replaceOwned(enemy.eye, cue(0xff3d55));
  replaceOwned(enemy.engine, cue(kind === 'drone' ? 0xff9a3a : 0xff5a3a));
  enemy.flashMesh = node(root, kind === 'drone' ? 'flash_shell' : 'hit-flash-shell');
  enemy.flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    toneMapped: false, blending: THREE.AdditiveBlending,
  });
  // Enemy.dispose owns flashMat separately; the imported root owns its geometry.
  replaceOwned(enemy.flashMesh, enemy.flashMat, true);
  if (kind === 'interceptor') enemy.flashMesh.scale.setScalar(1.018);
  enemy.flashMesh.visible = false;
  enemy.flashMesh.renderOrder = 5;
  enemy.flashMesh.castShadow = enemy.flashMesh.receiveShadow = false;
  root.userData.modelOwnedMaterials = [...owned];
  enemy._importedRoot = root;
  enemy.group.add(root);
  return true;
}

/** Keep the mine's tumble, proximity pulse and warning entirely source-driven. */
export function buildImportedMine(enemy) {
  const root = instantiate('mine');
  if (!root) return false;
  enemy.core = node(root, 'core');
  enemy.lamp = node(root, 'lamp');
  // Replaced clones remain in modelOwnedMaterials; shared neon stays Materials-owned.
  enemy.lamp.material = enemy.mats.neon(0xff3d55, 3.2);
  enemy.lamp.castShadow = enemy.lamp.receiveShadow = false;
  enemy.flashMesh = node(root, 'flashMesh');
  enemy.flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    toneMapped: false, blending: THREE.AdditiveBlending,
  });
  enemy.flashMesh.material = enemy.flashMat;
  enemy.flashMesh.visible = false;
  enemy.flashMesh.renderOrder = 5;
  enemy.flashMesh.castShadow = enemy.flashMesh.receiveShadow = false;
  // The exported shell already carries its source 1.2 scale.
  enemy._importedRoot = root;
  enemy.group.add(root);
  return true;
}

/** Camera-facing pickup art; shared halo and all collection state stay in Pickup. */
export function buildImportedPickup(pickup, mats) {
  const key = { shield: 'shield-pickup', spread: 'spread-pickup', repair: 'repair-pickup', fuel: 'fuel-pickup' }[pickup.kind];
  if (!key) return false;
  const root = instantiate(key);
  if (!root) return false;
  for (const name of ['shell', 'core', 'shape']) pickup[name] = node(root, name);
  if (pickup.kind === 'spread' || pickup.kind === 'fuel') {
    const owned = new Set(root.userData.modelOwnedMaterials);
    for (const [name, strength] of [['shell', 1.15], ['shape', 1.35]]) {
      const target = pickup[name], previous = target.material;
      const material = mats.neon(pickup.color, strength).clone();
      material.name = previous.name;
      material.vertexColors = true;
      target.material = material;
      owned.delete(previous); previous.dispose(); owned.add(material);
    }
    root.userData.modelOwnedMaterials = [...owned];
  }
  for (const name of ['shell', 'shape']) pickup[name].traverse(o => {
    if (o.isMesh) for (const material of [].concat(o.material)) material.toneMapped = false;
  });
  // Preserve the badge's authored facets; source neon clones retain spread/fuel hue and gains.
  root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = false; });
  pickup._importedRoot = root;
  pickup.group.add(root);
  return true;
}

/** Parked targets keep their seeded yaw and original engine/beacon groups. */
export function buildImportedParkedFighter(enemy) {
  const root = instantiate('parked-fighter');
  if (!root) return false;
  enemy._importedRoot = root;
  enemy.group.add(root);
  enemy.engine = node(root, 'engine');
  enemy.beacon = node(root, 'beacon');
  enemy.engine.scale.setScalar(.3);
  replaceMaterial(root, 'PF_EngineAmber', enemy.mats.neon(0xff9a3a, 2.2));
  replaceMaterial(root, 'PF_BeaconRed', enemy.mats.neon(0xff3d55, 3));
  for (const cue of [enemy.engine, enemy.beacon]) cue.traverse(o => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });
  addImportedFlash(enemy, node(root, 'airframe'), root, 1.12);
  return true;
}

export function disposeImportedModels() {
  disposeImportedCargo();
  disposeCoveredFighterTemplates();
  disposeImportedCarrier();
  disposeImportedWreckage();
  disposeImportedAntenna();
  disposeImportedCoolingStack();
  disposeImportedFuelDepot();
  disposeImportedFlakGun();
  const resources = new Set();
  for (const root of templates.values()) {
    for (const geometry of root.userData.templateGeometries ?? []) resources.add(geometry);
    root.traverse(o => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [].concat(o.material ?? [])) {
        resources.add(m);
        for (const value of Object.values(m)) if (value?.isTexture) resources.add(value);
      }
    });
  }
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
  } else if (kind === 'heavy-turret') {
    enemy.turntable = node(root, 'turntable');
    enemy.barrels = [node(root, 'barrel-L'), node(root, 'barrel-R')];
    enemy.eye = node(root, 'eye');
    replaceMaterial(root, 'HT_Eye_Red_ff3d55', enemy.mats.neon(0xff3d55, 3));
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
  addImportedFlash(enemy, flashSource, flashParent, 1.06);
  return true;
}

function addImportedFlash(enemy, flashSource, flashParent, scale) {
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
  enemy._addFlashShell(geometry, scale);
  flashParent.add(enemy.flashMesh);
}

/** Read-only template access for chunk batching; callers never dispose or attach it. */
export function importedTemplate(name) { return templates.get(name); }
