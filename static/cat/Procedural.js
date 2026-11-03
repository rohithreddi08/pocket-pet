// ============================================================================
// Procedural — layered micro-movements that keep the cat from looking frozen.
// ----------------------------------------------------------------------------
// Applied on top of the animation through a PoseLayer (so nothing accumulates).
// Rotation axes are measured from the cat's own frame at load time, because
// every rig orients its bones differently:
//
//   · Breathing    — chest pitches about the cat's side-to-side axis
//   · Weight shift — hips roll about the cat's nose-to-tail axis
//   · Ear twitch   — random quick swivels about the cat's up axis
//   · Tail flick   — random flicks of the tail tip about the up axis
// ============================================================================
import * as THREE from 'three';

const _q = new THREE.Quaternion();

/** A world-space direction expressed in `bone`'s local frame. */
function localAxis(bone, worldDir) {
  const inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  return worldDir.clone().applyQuaternion(inv).normalize();
}

export class Procedural {
  /**
   * @param {object} args
   * @param {THREE.Object3D} args.root     cat root (+X nose, +Y up, +Z side)
   * @param {import('./PoseLayer.js').PoseLayer} args.layer
   * @param {THREE.Bone} [args.chestBone]
   * @param {THREE.Bone} [args.hipBone]
   * @param {THREE.Bone} [args.earLBone]
   * @param {THREE.Bone} [args.earRBone]
   * @param {THREE.Bone[]} [args.tailBones]
   */
  constructor({ root, layer, chestBone, hipBone, earLBone, earRBone, tailBones = [] }) {
    this.layer = layer;
    this.chest = chestBone;
    this.hip   = hipBone;
    this.earL  = earLBone;
    this.earR  = earRBone;
    this.tailTip = tailBones[tailBones.length - 1] || null;
    this.intensity = 1;   // FelineBehavior can calm this down while sleeping

    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    const fwd  = new THREE.Vector3(1, 0, 0).applyQuaternion(rq);
    const up   = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(rq);

    this.axes = new Map();
    if (this.chest)   this.axes.set(this.chest, localAxis(this.chest, side));
    if (this.hip)     this.axes.set(this.hip, localAxis(this.hip, fwd));
    if (this.earL)    this.axes.set(this.earL, localAxis(this.earL, up));
    if (this.earR)    this.axes.set(this.earR, localAxis(this.earR, up));
    if (this.tailTip) this.axes.set(this.tailTip, localAxis(this.tailTip, up));

    this.breathPhase = Math.random() * Math.PI * 2;
    this.weightPhase = Math.random() * Math.PI * 2;
    this.ear = {
      L: { timer: 3 + Math.random() * 4, pulse: 0 },
      R: { timer: 3 + Math.random() * 4, pulse: 0 },
    };
    this.tailTimer = 4 + Math.random() * 3;
    this.tailPulse = 0;
  }

  _rotate(bone, angle) {
    if (!bone || !angle) return;
    _q.setFromAxisAngle(this.axes.get(bone), angle);
    this.layer.multiply(bone, _q);
  }

  /** @param {number} dt @param {{breathRate?: number}} [opts] */
  update(dt, { breathRate = 1.6 } = {}) {
    // Breathing: resting cats breathe ~20–30/min; slower and deeper asleep.
    this.breathPhase += dt * breathRate;
    this._rotate(this.chest, Math.sin(this.breathPhase) * 0.018);

    this.weightPhase += dt;
    this._rotate(this.hip, Math.sin(this.weightPhase * 0.35) * 0.012 * this.intensity);

    for (const side of ['L', 'R']) {
      const e = this.ear[side];
      const bone = side === 'L' ? this.earL : this.earR;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = 4 + Math.random() * 6;
        e.pulse = 0.22;
      }
      if (e.pulse > 0) {
        e.pulse -= dt;
        const flick = Math.sin(e.pulse * 40) * 0.3 * Math.max(0, e.pulse / 0.22);
        this._rotate(bone, flick * (side === 'L' ? 1 : -1) * this.intensity);
      }
    }

    this.tailTimer -= dt;
    if (this.tailTimer <= 0) {
      this.tailTimer = 3 + Math.random() * 4;
      this.tailPulse = 0.35;
    }
    if (this.tailPulse > 0) {
      this.tailPulse -= dt;
      const flick = Math.sin(this.tailPulse * 25) * 0.25 * Math.max(0, this.tailPulse / 0.35);
      this._rotate(this.tailTip, flick * this.intensity);
    }
  }
}
