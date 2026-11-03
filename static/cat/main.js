// ============================================================================
// main.js — orchestrates scene, behavior, animation and realism layers.
// ----------------------------------------------------------------------------
// Per frame:
//   1. PoseLayer.restore()   undo last frame's additive bone offsets
//   2. FelineBehavior        needs-driven decisions + movement; drives the rig
//                            (ClipRig for animated models, procedural fallback)
//   3. Procedural            breathing, ear twitches, tail flicks
//   4. HeadTracker           looks at the cursor (not while asleep/eating)
//   5. MorphController       blinks, mouth/tongue, eyes shut while asleep
// ============================================================================
import * as THREE from 'three';
import { SceneManager }    from './SceneManager.js';
import { CatLoader }       from './CatLoader.js';
import { Interaction }     from './Interaction.js';
import { HeadTracker }     from './HeadTracker.js';
import { MorphController } from './MorphController.js';
import { Procedural }      from './Procedural.js';
import { FelineBehavior }  from './FelineBehavior.js';
import { PoseLayer }       from './PoseLayer.js';
import { mapBones }        from './BoneMap.js';

export async function initCat(canvas, {
  modelUrl = './assets/cat.glb',
  hdriUrl  = './assets/studio.hdr',
  loader   = {},           // forwarded to CatLoader.load (forward, clipMap, clipSpeeds…)
  trigger  = null,
  needs    = { hunger: 30, energy: 80, curiosity: 40, stress: 20 },
  onStatus = () => {},
} = {}) {
  const sceneMgr = new SceneManager(canvas);
  onStatus('loading environment…');
  await sceneMgr.loadEnvironment(hdriUrl);

  onStatus('loading cat…');
  const { root, rig, kind } = await CatLoader.load(modelUrl, sceneMgr.scene, loader);
  console.info(`[pet3d] model kind: ${kind}`);

  const feline = new FelineBehavior(root, rig, sceneMgr.garden, sceneMgr.camera, needs, onStatus);

  // --------------------------------------------------------------------------
  // Realism layers
  // --------------------------------------------------------------------------
  const layer = new PoseLayer();
  const bones = mapBones(root);
  const headBone = bones.head || root.getObjectByName('proceduralHead');

  const headTracker = headBone
    ? new HeadTracker({ camera: sceneMgr.camera, headBone, root, layer })
    : null;
  if (!headBone) console.warn('[pet3d] No head bone found — head tracking disabled.');

  // Micro-motion only on real rigs; the procedural rig already animates itself.
  const procedural = kind === 'rigged'
    ? new Procedural({
      root, layer,
      chestBone: bones.chest, hipBone: bones.hip,
      earLBone: bones.earL, earRBone: bones.earR, tailBones: bones.tail,
    })
    : null;

  const morph = new MorphController(root);

  if (headTracker) {
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      headTracker.setPointer(new THREE.Vector2(
        ((e.clientX - r.left) / r.width)  * 2 - 1,
        -((e.clientY - r.top)  / r.height) * 2 + 1,
      ));
    });
    canvas.addEventListener('pointerleave', () => headTracker.setPointer(null));
  }

  new Interaction({
    canvas,
    camera: sceneMgr.camera,
    root,
    onHover: () => feline.alert(),
    onPick:  () => feline.pet(),
  });

  feline.trigger(trigger);   // from Python: ?state={"trigger":"feed"}

  // --------------------------------------------------------------------------
  // Render loop
  // --------------------------------------------------------------------------
  const clock = new THREE.Clock();
  let petTime = 0;

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const state = feline.state;
    const asleep = state === 'rest' && feline.elapsed > 2;

    layer.restore();
    feline.update(dt);
    sceneMgr.follow(root, dt);

    if (procedural) {
      procedural.intensity = asleep ? 0.25 : 1;
      procedural.update(dt, { breathRate: asleep ? 1.1 : 1.8 });
    }

    if (headTracker) {
      headTracker.enabled = !asleep && state !== 'eat' && state !== 'groom';
      headTracker.update(dt);
    }

    morph.keepClosed = asleep;
    morph.blink(dt);
    petTime = state === 'pet' ? petTime + dt : 0;
    morph.set('mouth_open', petTime > 0.05 && petTime < 0.45 ? 0.7 : 0);
    morph.set('tongue_out', state === 'eat' ? (Math.sin(feline.elapsed * 11) + 1) * 0.4 : 0);
    morph.update(dt);

    sceneMgr.render();
    requestAnimationFrame(tick);
  }
  tick();

  return { sceneMgr, feline, rig, headTracker, morph, procedural };
}
