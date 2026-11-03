// ============================================================================
// PoseLayer — additive bone offsets that never accumulate.
// ----------------------------------------------------------------------------
// HeadTracker / Procedural / reactions rotate (or squash) bones *on top of*
// the animation. If a bone has no track in the current clip, the mixer won't
// overwrite it next frame and the offsets would pile up. Call `restore()` at
// the start of each frame (before the mixer) to put every touched bone back
// exactly as it was before the offsets were applied.
// ============================================================================
export class PoseLayer {
  constructor() {
    this.saved = new Map();   // bone → quaternion
    this.savedScale = new Map();
  }

  restore() {
    for (const [bone, q] of this.saved) bone.quaternion.copy(q);
    for (const [bone, s] of this.savedScale) bone.scale.copy(s);
    this.saved.clear();
    this.savedScale.clear();
  }

  _save(bone) {
    if (!this.saved.has(bone)) this.saved.set(bone, bone.quaternion.clone());
  }

  /** Rotate in the bone's parent space. */
  premultiply(bone, q) { this._save(bone); bone.quaternion.premultiply(q); }

  /** Rotate in the bone's own local space. */
  multiply(bone, q) { this._save(bone); bone.quaternion.multiply(q); }

  /** Multiply the bone's scale (e.g. squash an eye to blink). */
  scale(bone, sx, sy, sz) {
    if (!this.savedScale.has(bone)) this.savedScale.set(bone, bone.scale.clone());
    bone.scale.x *= sx;
    bone.scale.y *= sy;
    bone.scale.z *= sz;
  }
}
