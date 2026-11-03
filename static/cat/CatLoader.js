// ============================================================================
// CatLoader — loads GLB, fixes texture color spaces, normalizes scale and
// orientation, and picks the right rig:
//   · skinned + animated model  → ClipRig (real skeletal animation)
//   · single unrigged mesh      → procedural 13-bone rig (legacy fallback)
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ClipRig } from './ClipRig.js';
import { mapBones } from './BoneMap.js';

// Compressed GLBs (gltf-transform / gltfpack output) need these decoders.
const DRACO_DECODER_PATH = 'https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/';

export class CatLoader {
  static _addProceduralRig(root, mesh) {
    const geometry = mesh.geometry.clone();
    const positions = geometry.getAttribute('position');
    const vertexCount = positions.count;
    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);
    const clamp01 = (value) => Math.max(0, Math.min(1, value));
    const smoothstep = (edge0, edge1, value) => {
      const t = clamp01((value - edge0) / (edge1 - edge0));
      return t * t * (3 - 2 * t);
    };

    const rigRoot = new THREE.Bone();
    const body = new THREE.Bone();
    const head = new THREE.Bone();
    rigRoot.name = 'proceduralRoot';
    body.name = 'proceduralBody';
    head.name = 'proceduralHead';
    root.add(rigRoot);
    rigRoot.add(body);
    body.position.set(0, 0.42, 0);
    body.add(head);
    head.position.set(0.27, 0.05, 0);

    const legNames = ['frontNear', 'frontFar', 'rearNear', 'rearFar'];
    const upperLegs = [];
    const lowerLegs = [];
    for (let index = 0; index < legNames.length; index += 1) {
      const front = index < 2;
      const near = index % 2 === 0;
      const upper = new THREE.Bone();
      const lower = new THREE.Bone();
      upper.name = `${legNames[index]}Upper`;
      lower.name = `${legNames[index]}Lower`;
      upper.position.set(front ? 0.27 : -0.27, -0.17, near ? 0.075 : -0.075);
      lower.position.y = -0.17;
      body.add(upper);
      upper.add(lower);
      upperLegs.push(upper);
      lowerLegs.push(lower);
    }

    const tailBones = [];
    let tailParent = body;
    for (let index = 0; index < 3; index += 1) {
      const bone = new THREE.Bone();
      bone.name = `proceduralTail${index + 1}`;
      bone.position.set(index === 0 ? -0.30 : -0.075, index === 0 ? -0.01 : 0.045, 0);
      tailParent.add(bone);
      tailBones.push(bone);
      tailParent = bone;
    }

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const x = positions.getX(vertex);
      const y = positions.getY(vertex);
      const z = positions.getZ(vertex);
      const legHeight = 1 - smoothstep(0.08, 0.39, y);
      const frontWeight = smoothstep(-0.08, 0.25, x);
      const rearWeight = smoothstep(-0.08, 0.25, -x);
      const nearWeight = smoothstep(-0.02, 0.09, z);
      const farWeight = 1 - nearWeight;
      const rawLegWeights = [
        frontWeight * nearWeight,
        frontWeight * farWeight,
        rearWeight * nearWeight,
        rearWeight * farWeight,
      ];
      const legDirectionTotal = rawLegWeights.reduce((sum, weight) => sum + weight, 0);
      const legWeight = 0.88 * legHeight * Math.min(1, Math.max(frontWeight, rearWeight));
      const headWeight = 0.82
        * smoothstep(0.14, 0.36, x)
        * smoothstep(0.27, 0.41, y);
      const tailWeight = 0.88
        * (1 - smoothstep(-0.45, -0.28, x))
        * smoothstep(0.20, 0.42, y);
      const available = Math.max(0, 0.94 - headWeight - tailWeight);
      const appliedLegWeight = Math.min(legWeight, available);
      const lowerWeight = 1 - smoothstep(0.03, 0.22, y);
      const weights = [
        Math.max(0, 1 - headWeight - tailWeight - appliedLegWeight),
        headWeight,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0,
      ];

      if (legDirectionTotal > 0) {
        for (let leg = 0; leg < rawLegWeights.length; leg += 1) {
          const share = appliedLegWeight * rawLegWeights[leg] / legDirectionTotal;
          weights[2 + leg] = share * (1 - lowerWeight);
          weights[6 + leg] = share * lowerWeight;
        }
      }

      const tailPosition = clamp01((-x - 0.27) / 0.18);
      if (tailWeight > 0) {
        const tailIndex = tailPosition < 0.38 ? 10 : tailPosition < 0.72 ? 11 : 12;
        weights[tailIndex] = tailWeight;
        weights[0] = Math.max(0, 1 - headWeight - tailWeight - appliedLegWeight);
      }

      const total = weights.reduce((sum, weight) => sum + weight, 0);
      for (let influence = 0; influence < 4; influence += 1) {
        let bestIndex = 0;
        for (let candidate = 1; candidate < weights.length; candidate += 1) {
          if (weights[candidate] > weights[bestIndex]) bestIndex = candidate;
        }
        skinIndices[vertex * 4 + influence] = bestIndex;
        skinWeights[vertex * 4 + influence] = total > 0 ? weights[bestIndex] / total : 1;
        weights[bestIndex] = -1;
      }
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const skinnedMesh = new THREE.SkinnedMesh(geometry, mesh.material);
    skinnedMesh.position.copy(mesh.position);
    skinnedMesh.rotation.copy(mesh.rotation);
    skinnedMesh.scale.copy(mesh.scale);
    skinnedMesh.castShadow = true;
    skinnedMesh.receiveShadow = true;
    skinnedMesh.frustumCulled = false;
    mesh.parent.add(skinnedMesh);
    mesh.parent.remove(mesh);

    const bones = [body, head, ...upperLegs, ...lowerLegs, ...tailBones];
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    skinnedMesh.bind(skeleton);
    skinnedMesh.normalizeSkinWeights();

    return {
      update(state, phase, speed, deltaSeconds) {
        const moving = state === 'walk' || state === 'play' || state === 'pounce';
        const gait = state === 'play' ? 0.52 : state === 'run' ? 0.62 : Math.min(0.38, speed * 0.32);
        const stride = [
          Math.sin(phase),
          Math.sin(phase + Math.PI),
          Math.sin(phase + Math.PI * 0.58),
          Math.sin(phase + Math.PI * 1.58),
        ];
        upperLegs.forEach((leg, index) => {
          const front = index < 2;
          let upperTarget = moving ? stride[index] * gait : 0;
          let lowerTarget = moving ? Math.max(0, -stride[index]) * gait * 1.35 : 0;

          if (state === 'eat') {
            upperTarget = front ? -0.12 : 0.22;
            lowerTarget = front ? 0.34 : -0.42;
          } else if (state === 'rest') {
            upperTarget = front ? -0.5 : 0.65;
            lowerTarget = front ? 0.85 : -0.95;
          } else if (state === 'pounce' && front) {
            const reaching = index === (Math.sin(phase * 2.8) > 0 ? 0 : 1);
            upperTarget = reaching ? 0.42 : -0.12;
            lowerTarget = reaching ? -0.12 : 0.2;
          }

          leg.rotation.z = THREE.MathUtils.damp(
            leg.rotation.z, upperTarget, 12, deltaSeconds,
          );
          lowerLegs[index].rotation.z = THREE.MathUtils.damp(
            lowerLegs[index].rotation.z, lowerTarget, 12, deltaSeconds,
          );
        });

        const sniff = state === 'sniff' ? -0.2 : 0;
        const eating = state === 'eat'
          ? -0.23 + Math.max(0, Math.sin(phase * 2.8)) * 0.075
          : 0;
        const sleeping = state === 'rest';
        const headTargetZ = sniff + eating
          + (sleeping ? -0.12 + Math.sin(phase * 0.5) * 0.012 : 0);
        const headTargetY = state === 'idle'
          ? Math.sin(phase * 0.18) * 0.035
          : sleeping ? 0.12 : 0;
        head.rotation.z = THREE.MathUtils.damp(
          head.rotation.z, headTargetZ, 9, deltaSeconds,
        );
        head.rotation.y = THREE.MathUtils.damp(
          head.rotation.y, headTargetY, 8, deltaSeconds,
        );
        head.position.y = THREE.MathUtils.damp(
          head.position.y,
          0.05 + (state === 'eat' ? -Math.max(0, Math.sin(phase * 2.8)) * 0.025 : 0),
          9,
          deltaSeconds,
        );

        const bodyTargetY = 0.42
          - (state === 'eat' ? 0.035 : 0)
          - (sleeping ? 0.08 - Math.sin(phase * 0.5) * 0.008 : 0);
        body.position.y = THREE.MathUtils.damp(
          body.position.y, bodyTargetY, 8, deltaSeconds,
        );
        const bodyPitch = state === 'eat' ? -0.025 : state === 'pounce' ? -0.07 : sleeping ? -0.04 : 0;
        body.rotation.z = THREE.MathUtils.damp(
          body.rotation.z, bodyPitch, 8, deltaSeconds,
        );

        const tailWag = state === 'play' || state === 'pounce' || state === 'pet'
          ? 0.32
          : sleeping ? 0.035 : 0.11;
        tailBones[0].rotation.y = Math.sin(phase * 0.8) * tailWag * 0.45;
        tailBones[1].rotation.y = Math.sin(phase * 0.8 - 0.4) * tailWag * 0.7;
        tailBones[2].rotation.y = Math.sin(phase * 0.8 - 0.8) * tailWag;
        tailBones.forEach((bone, index) => {
          const curl = sleeping ? (index + 1) * 0.12 : 0;
          bone.rotation.z = THREE.MathUtils.damp(
            bone.rotation.z, curl, 5, deltaSeconds,
          );
        });
      },
    };
  }

  /**
   * Yaw (about +Y) that turns the model so its nose points along +X — the
   * convention FelineBehavior steers with.
   * @param {'auto'|'+x'|'-x'|'+z'|'-z'} forward
   */
  static _facingYaw(model, forward, skinned) {
    const yawFor = { '+x': 0, '-x': Math.PI, '+z': Math.PI / 2, '-z': -Math.PI / 2 };
    if (forward in yawFor) return yawFor[forward];

    model.updateMatrixWorld(true);
    const { head } = mapBones(model);
    // No head bone: glTF's convention is +Z forward; the legacy mesh faces +X.
    if (!head) return skinned ? yawFor['+z'] : 0;

    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    const toHead = head.getWorldPosition(new THREE.Vector3()).sub(center);
    if (Math.abs(toHead.x) > Math.abs(toHead.z)) return toHead.x > 0 ? 0 : Math.PI;
    return toHead.z > 0 ? yawFor['+z'] : yawFor['-z'];
  }

  /**
   * @param {string} url
   * @param {THREE.Scene} scene
   * @param {{
   *   targetLength?: number,       // nose-to-rump length in world units (garden is built for ~1.6)
   *   forward?: 'auto'|'+x'|'-x'|'+z'|'-z',
   *   facing?: number,             // initial yaw of the cat in the garden
   *   clipSpeeds?: Record<string, number>,
   *   clipMap?: Record<string, string>,
   * }} [opts]
   * @returns {Promise<{root: THREE.Group, animations: THREE.AnimationClip[], rig: object|null, kind: string}>}
   */
  static async load(url, scene, opts = {}) {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH));
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    return CatLoader.prepare(gltf, scene, opts);
  }

  /** Post-load setup (materials, orientation, scale, rig). Same options as `load`. */
  static prepare(gltf, scene, opts = {}) {
    const {
      targetLength = 1.6, forward = 'auto', facing = -0.55, clipSpeeds, clipMap,
    } = opts;
    const model = gltf.scene;

    let skinned = false;
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.isSkinnedMesh) skinned = true;
      obj.castShadow    = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;  // skinned meshes can pop with wrong bbox

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        // Color textures → sRGB
        if (mat.map)         mat.map.colorSpace         = THREE.SRGBColorSpace;
        if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        // Data textures (normal / roughness / metalness / ao) stay linear — do nothing
        if ('envMapIntensity' in mat) mat.envMapIntensity = 1.0;
        mat.needsUpdate = true;
      }
    });

    // A rigged character sometimes ships with leftovers from the artist's scene
    // (Blender's default cube, a display floor). Drop unskinned meshes that
    // aren't attached to a bone — real props (collar, bell) hang off bones.
    if (skinned) {
      const strays = [];
      model.traverse((obj) => {
        if (!obj.isMesh || obj.isSkinnedMesh) return;
        let onBone = false;
        for (let p = obj.parent; p; p = p.parent) if (p.isBone) { onBone = true; break; }
        if (!onBone) strays.push(obj);
      });
      for (const obj of strays) {
        console.warn(`[CatLoader] Removing stray unrigged mesh "${obj.name}" from the model.`);
        obj.parent.remove(obj);
      }
    }

    // Inner node: orientation fix + centering. Outer `root`: what behavior moves.
    model.rotation.y = CatLoader._facingYaw(model, forward, skinned);
    const root = new THREE.Group();
    root.name = 'cat';
    root.add(model);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;     // paws on the ground
    // Scale by length along the nose axis (+X after the yaw fix), not height:
    // a raised tail would otherwise make the whole cat tiny.
    root.scale.setScalar(targetLength / size.x);
    root.rotation.y = facing;

    scene.add(root);
    root.updateMatrixWorld(true);

    const meshes = [];
    model.traverse((obj) => { if (obj.isMesh) meshes.push(obj); });

    let rig = null;
    let kind = 'static';
    if (skinned && gltf.animations.length) {
      rig = new ClipRig(root, gltf.animations, { clipSpeeds, clipMap });
      kind = 'rigged';
    } else if (!skinned && meshes.length === 1) {
      // Legacy unrigged mesh: fake a skeleton so it can at least walk.
      rig = CatLoader._addProceduralRig(model, meshes[0]);
      kind = 'procedural';
    } else {
      console.warn('[CatLoader] Model has no skeleton+animations; it will slide around unanimated.');
    }

    return { root, animations: gltf.animations, rig, kind };
  }
}
