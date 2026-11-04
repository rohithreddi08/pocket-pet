// ============================================================================
// factory.js — build the 3D pet for a save record: load (and cache) the
// breed's model, paint its coat, size it for its age, and wire up the brain
// (Pet for cats, Dog for dogs). Also renders store thumbnails.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CatLoader } from '../../../cat/CatLoader.js';
import { mapBones } from '../../../cat/BoneMap.js';
import { PoseLayer } from '../../../cat/PoseLayer.js';
import { HeadTracker } from '../../../cat/HeadTracker.js';
import { Procedural } from '../../../cat/Procedural.js';
import { BREEDS, breedOf, growth } from '../species.js';
import { applyCoat, disposeMaterials } from './coats.js';
import { Pet } from './Pet.js';
import { Dog } from './Dog.js';
import { Hamster, buildHamsterModel } from './Hamster.js';
import { synthClips } from './clipSynth.js';

/** Bones of the shorthair cat rig (J-Toastie's "Cat"), for generated clips. */
export const CAT_SH_SPEC = {
  body: 'Cat.001', neck: 'Neck', head: 'Head', tail: ['tail1', 'tail2', 'tail3', 'tail4'],
  legs: {
    FL: ['L_Leg_Upper', 'L_Leg_Lower', 'L_Foot'], FR: ['R_Leg_Upper', 'R_Leg_Lower', 'R_Foot'],
    BL: ['L_BLeg_Upper', 'L_BLeg_Lower', 'L_BFoot'], BR: ['R_BLeg_Upper', 'R_BLeg_Lower', 'R_BFoot'],
  },
};

/**
 * Per-model clean-up. Quaternius' German Shepherd and Pug come dressed for an
 * adventure (backpack); we take it off and keep the harness straps.
 */
const MODEL_FIX = {
  './models/cat_shorthair.glb': { synth: CAT_SH_SPEC, matte: true },   // exported as 40% metal — fur isn't
  './models/pug.glb': { removeMeshes: ['Pug002'], dogClips: true },
  './models/german_shepherd.glb': { shrinkBones: ['Torso001'], dogClips: true },
  './models/husky.glb': { dogClips: true },
  './models/shiba.glb': { dogClips: true },
};

/** "AnimalArmature|Run" → "Gallop" etc., so every dog shares one clip map. */
function normalizeDogClips(anims) {
  const seen = new Map();
  for (const a of anims) {
    const n = a.name.replace(/^.*\|/, '');
    if (!seen.has(n)) { a.name = n; seen.set(n, a); }
  }
  const out = [...seen.values()];
  const has = (n) => out.some((a) => a.name === n);
  for (const a of out) {
    if (a.name === 'Run' && !has('Gallop')) a.name = 'Gallop';
    else if (a.name === 'Run_Jump' && !has('Gallop_Jump')) a.name = 'Gallop_Jump';
    else if (/^Idle_HitReact/.test(a.name)) a.name = a.name.replace('Idle_', '');
  }
  return out;
}

/** Apply MODEL_FIX to a fresh clone of a model. */
function fixClone(model, url) {
  const fix = MODEL_FIX[url];
  if (!fix) return model;
  const drop = [];
  model.traverse((o) => {
    if (fix.removeMeshes?.includes(o.name)) drop.push(o);
    if (o.isBone && fix.shrinkBones?.includes(o.name)) o.scale.setScalar(0.0001);
    if (fix.matte && o.isMesh) {
      o.material = o.material.clone();
      o.material.metalness = 0; o.material.roughness = 0.85;
    }
  });
  for (const o of drop) o.parent.remove(o);
  return model;
}

const gltfCache = new Map();
const loader = new GLTFLoader();

/** Quaternius dogs have no lie-down/sleep clips; build them from "Death" (which ends lying on its side — how dogs really sleep). */
function withDogClips(anims) {
  const death = anims.find((a) => a.name === 'Death');
  if (!death || anims.some((a) => a.name === 'Sleep')) return anims;
  const D = death.duration;
  const slow = (k, name) => new THREE.AnimationClip(name, D * k, death.tracks.map((tr) => new tr.constructor(tr.name, tr.times.map((t) => t * k), tr.values.slice())));
  const reverse = (k, name) => new THREE.AnimationClip(name, D * k, death.tracks.map((tr) => {
    const n = tr.getValueSize(); const cnt = tr.times.length;
    const times = new Float32Array(cnt); const vals = new Float32Array(tr.values.length);
    for (let i = 0; i < cnt; i += 1) {
      times[i] = (D - tr.times[cnt - 1 - i]) * k;
      vals.set(tr.values.subarray((cnt - 1 - i) * n, (cnt - i) * n), i * n);
    }
    return new tr.constructor(tr.name, times, vals);
  }));
  const hold = new THREE.AnimationClip('Sleep', 2, death.tracks.map((tr) => {
    const n = tr.getValueSize();
    const last = tr.values.slice(tr.values.length - n);
    const vals = new Float32Array(n * 2); vals.set(last, 0); vals.set(last, n);
    return new tr.constructor(tr.name, [0, 2], vals);
  }));
  return [...anims.filter((a) => a.name !== 'Death'), slow(2.2, 'Lie_Down'), hold, reverse(1.8, 'Get_Up')];
}

const DOG_CLIPS = { idle: 'Idle', walk: 'Walk', run: 'Gallop', eat: 'Eating', sniff: 'Idle_2_HeadLow', pounce: 'Gallop_Jump', alert: 'Idle_2' };

export function loadModel(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, loader.loadAsync(url).then((g) => {
      const fix = MODEL_FIX[url] || {};
      if (fix.dogClips) g.animations = normalizeDogClips(g.animations);
      if (fix.shrinkBones) {
        // The clips must not scale those bones back up.
        const skip = new Set(fix.shrinkBones);
        for (const a of g.animations) a.tracks = a.tracks.filter((t) => !skip.has(t.name.slice(0, t.name.lastIndexOf('.'))));
      }
      if (fix.synth) g.animations = [...g.animations, ...synthClips(g.scene, fix.synth)];
      if (g.animations.some((a) => a.name === 'Death')) g.animations = withDogClips(g.animations);
      return g;
    }));
  }
  return gltfCache.get(url);
}

/**
 * @returns {Promise<{pet, root, rig, bones, layer, tracker, length}>}
 */
export async function buildPet(record, ctx) {
  const { scene, camera, house, fx, sound, voice, game } = ctx;
  const breed = breedOf(record);
  const gltf = await loadModel(breed.model);
  const g = growth(record);
  const length = breed.length * g;
  const dog = record.species === 'dog';
  if (record.species === 'hamster') {
    const { root, layer, bones } = buildHamsterModel(gltf, breed, record.coat, length, scene);
    root.name = record.id;
    const pet = new Hamster({ root, layer, house, fx, sound, voice, game, camera, length, growth: g });
    return { pet, root, rig: null, bones, layer, tracker: null, length };
  }
  // Root motion is stripped from the shared clips the first time; remember the
  // stride speeds it measured (per unit of body length) for later copies.
  const known = gltf.userData.strideSpeeds;
  const clipSpeeds = known ? Object.fromEntries(Object.entries(known).map(([k, v]) => [k, v * length])) : undefined;
  const { root, rig, kind } = CatLoader.prepare(
    { scene: fixClone(cloneSkinned(gltf.scene), breed.model), animations: gltf.animations },
    scene,
    { targetLength: length, facing: -Math.PI / 2, clipSpeeds, ...(dog ? { clipMap: DOG_CLIPS } : {}) },
  );
  if (kind !== 'rigged') throw new Error(`The ${breed.name} model has no animations.`);
  if (!known) gltf.userData.strideSpeeds = Object.fromEntries(Object.entries(rig.clipSpeed).map(([k, v]) => [k, v / length]));
  root.name = record.id;
  applyCoat(root, breed, record.coat);

  const bones = mapBones(root);
  const layer = new PoseLayer();
  const tracker = bones.head ? new HeadTracker({ camera, headBone: bones.head, root, layer, maxAngle: 0.9 }) : null;
  const procedural = new Procedural({
    root, layer, chestBone: bones.chest, hipBone: bones.hip, earLBone: bones.earL, earRBone: bones.earR, tailBones: bones.tail,
  });
  const Brain = dog ? Dog : Pet;
  const pet = new Brain({ root, rig, bones, layer, tracker, procedural, house, fx, sound, voice, game, camera, length, growth: g });
  return { pet, root, rig, bones, layer, tracker, length };
}

export function disposePet(built, scene) {
  if (!built) return;
  built.rig?.animator?.mixer?.stopAllAction();
  scene.remove(built.root);
  disposeMaterials(built.root);
}

// ---------------------------------------------------------------------------
// Store thumbnails: one small offscreen renderer, pictures cached per look.
// ---------------------------------------------------------------------------
let thumbR = null; let thumbScene = null; let thumbCam = null;
const thumbs = new Map();

export async function thumbnail(breedId, coatId, { months = 24, w = 240, h = 180 } = {}) {
  const key = `${breedId}|${coatId}|${months < 6 ? 'b' : 'a'}`;
  if (thumbs.has(key)) return thumbs.get(key);
  const p = (async () => {
    const breed = BREEDS[breedId];
    const gltf = await loadModel(breed.model);
    if (!thumbR) {
      thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbR.outputColorSpace = THREE.SRGBColorSpace;
      thumbR.toneMapping = THREE.ACESFilmicToneMapping;
      thumbScene = new THREE.Scene();
      thumbScene.add(new THREE.HemisphereLight('#fff8ee', '#a08a78', 2.2));
      const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(2, 4, 3); thumbScene.add(d);
      thumbCam = new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 50);
    }
    thumbR.setSize(w, h, false);
    const model = fixClone(cloneSkinned(gltf.scene), breed.model);
    // Drop artist leftovers (helper cubes/planes not attached to the skeleton), like CatLoader does.
    const strays = [];
    let rigged = false;
    model.traverse((o) => { if (o.isSkinnedMesh) rigged = true; });
    model.traverse((o) => {
      if (!rigged || !o.isMesh || o.isSkinnedMesh) return;
      let onBone = false;
      for (let q = o.parent; q; q = q.parent) if (q.isBone) { onBone = true; break; }
      if (!onBone) strays.push(o);
    });
    for (const o of strays) o.parent.remove(o);
    const holder = new THREE.Group(); holder.add(model);
    applyCoat(model, breed, coatId);
    const anim = gltf.animations.find((a) => /^idle$/i.test(a.name)) || gltf.animations.find((a) => /idle/i.test(a.name));
    const mixer = new THREE.AnimationMixer(model);
    if (anim) { mixer.clipAction(anim).play(); mixer.setTime(0.4); }
    // Face the camera at a 3/4 angle: find the nose via the head bone.
    model.updateMatrixWorld(true);
    const { head } = breed.species === 'hamster' ? {} : mapBones(model);
    const box0 = new THREE.Box3().setFromObject(model);
    const c0 = box0.getCenter(new THREE.Vector3());
    const hp = head ? head.getWorldPosition(new THREE.Vector3()).sub(c0)
      : new THREE.Vector3(Math.cos(breed.modelYaw || 0), 0, -Math.sin(breed.modelYaw || 0));
    holder.rotation.y = -Math.atan2(hp.z, hp.x) + 0.75;
    const baby = months < 6;
    holder.scale.setScalar(baby ? 0.62 : 1);
    thumbScene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
    const R = Math.max(size.x, size.y, size.z) / (baby ? 0.62 : 1);
    thumbCam.near = R * 0.01; thumbCam.far = R * 10; thumbCam.updateProjectionMatrix();   // models come in any unit
    thumbCam.position.set(c.x, c.y + R * 0.3, c.z + R * 2.45);
    thumbCam.lookAt(c.x, c.y - (baby ? R * 0.08 : 0), c.z);
    thumbR.render(thumbScene, thumbCam);
    const url = thumbR.domElement.toDataURL('image/png');
    thumbScene.remove(holder);
    disposeMaterials(model);
    mixer.stopAllAction();
    return url;
  })();
  thumbs.set(key, p);
  return p;
}
