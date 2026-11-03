// ============================================================================
// CatAnimator — AnimationMixer wrapper with crossfade helper.
// ============================================================================
import * as THREE from 'three';

export class CatAnimator {
  /**
   * @param {THREE.Object3D} root
   * @param {THREE.AnimationClip[]} clips
   */
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.currentAction = null;
    this.currentName   = null;
    this._onFinished   = null;

    for (const clip of clips) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    this.mixer.addEventListener('finished', (e) => {
      if (this._onFinished && e.action === this.currentAction) {
        this._onFinished(this.currentName);
      }
    });
  }

  onFinished(fn) { this._onFinished = fn; }

  /**
   * Cross-fade to a clip.
   * @param {string} name
   * @param {number} [fade=0.25]
   * @param {{ once?: boolean, timeScale?: number }} [opts]
   */
  playAnimation(name, fade = 0.25, opts = {}) {
    const next = this.actions.get(name);
    if (!next) {
      console.warn(`[CatAnimator] Clip not found: "${name}"`);
      return;
    }
    if (next === this.currentAction && !opts.once) return;

    const prev = this.currentAction;

    next.reset();
    next.setEffectiveTimeScale(opts.timeScale ?? 1);
    next.setEffectiveWeight(1);
    next.clampWhenFinished = !!opts.once;
    next.setLoop(
      opts.once ? THREE.LoopOnce : THREE.LoopRepeat,
      opts.once ? 1 : Infinity,
    );
    next.play();

    if (prev && prev !== next) {
      prev.fadeOut(fade);
      next.fadeIn(fade);
    }

    this.currentAction = next;
    this.currentName   = name;
  }

  update(deltaSeconds) { this.mixer.update(deltaSeconds); }
}