// ============================================================================
// HeadTracker — the cat turns its head toward the cursor, within cat-like
// limits, on top of whatever the animation is doing.
// ----------------------------------------------------------------------------
// Rigs disagree about which local axis of the head bone points out of the
// nose, so we measure it once at load: the cat's world-forward (+X of the cat
// root) expressed in the head bone's local frame. Each frame we rotate that
// "nose" direction toward the cursor, clamp the angle, smooth it, and apply
// it through a PoseLayer so it never accumulates.
// ============================================================================
import * as THREE from 'three';

const _ray    = new THREE.Vector3();
const _target = new THREE.Vector3();
const _nose   = new THREE.Vector3();
const _want   = new THREE.Vector3();
const _mat    = new THREE.Matrix4();
const _q      = new THREE.Quaternion();
const _wq     = new THREE.Quaternion();
const _clamped = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

export class HeadTracker {
  /**
   * @param {object} args
   * @param {THREE.Camera}   args.camera
   * @param {THREE.Bone}     args.headBone
   * @param {THREE.Object3D} args.root        cat root; its +X is the nose direction
   * @param {import('./PoseLayer.js').PoseLayer} args.layer
   * @param {number} [args.maxAngle=0.85]     radians a cat comfortably turns its head
   * @param {number} [args.damping=0.18]      seconds — smoothing time constant
   * @param {number} [args.distance=3.0]      world units in front of camera
   */
  constructor({ camera, headBone, root, layer, maxAngle = 0.85, damping = 0.18, distance = 3.0 }) {
    this.camera   = camera;
    this.head     = headBone;
    this.layer    = layer;
    this.maxAngle = maxAngle;
    this.damping  = damping;
    this.distance = distance;
    this.enabled  = true;
    this.pointer  = null;
    this.currentDelta = new THREE.Quaternion();

    root.updateMatrixWorld(true);
    const worldNose = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    this.localNose = worldNose
      .applyQuaternion(headBone.getWorldQuaternion(_wq).invert())
      .normalize();
  }

  /** @param {THREE.Vector2 | null} ndc */
  setPointer(ndc) { this.pointer = ndc; }

  /** Look at a world point instead of the cursor (null → back to cursor). */
  setWorldTarget(v) { this.worldTarget = v ? v.clone() : null; }

  update(dt) {
    let targetDelta = IDENTITY;
    const parent = this.head.parent;
    const hasTarget = this.worldTarget || this.pointer;

    if (this.enabled && hasTarget && parent) {
      if (this.worldTarget) {
        _target.copy(this.worldTarget);
      } else {
        _ray.set(this.pointer.x, this.pointer.y, 0.5).unproject(this.camera)
          .sub(this.camera.position).normalize();
        _target.copy(this.camera.position).addScaledVector(_ray, this.distance);
      }

      parent.updateWorldMatrix(true, false);
      _target.applyMatrix4(_mat.copy(parent.matrixWorld).invert());

      _want.copy(_target).sub(this.head.position).normalize();
      _nose.copy(this.localNose).applyQuaternion(this.head.quaternion).normalize();

      _q.setFromUnitVectors(_nose, _want);
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(_q.w, -1, 1));
      // Clamp to maxAngle (slerp from identity; output must not alias the input).
      targetDelta = angle > this.maxAngle
        ? _clamped.slerpQuaternions(IDENTITY, _q, this.maxAngle / angle)
        : _q;
    }

    const rate = 1 - Math.exp(-dt / Math.max(0.001, this.damping));
    this.currentDelta.slerp(targetDelta, rate);
    this.layer.premultiply(this.head, this.currentDelta);
  }
}
