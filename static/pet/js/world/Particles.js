// ============================================================================
// Particles.js — pooled sprite particles: hearts, Zzz, bubbles, water, crumbs…
// ============================================================================
import * as THREE from 'three';
import { glyph, blob } from './textures.js';

const PRESETS = {
  heart:  { tex: () => glyph('❤️'), size: 0.28, life: 1.6, vel: [0, 0.6, 0], spread: 0.25, gravity: -0.1, fade: true },
  zzz:    { tex: () => glyph('💤'), size: 0.35, life: 2.4, vel: [0.15, 0.35, 0], spread: 0.05, gravity: 0, fade: true, grow: 0.5 },
  angry:  { tex: () => glyph('💢'), size: 0.32, life: 0.9, vel: [0, 0.4, 0], spread: 0.3, gravity: 0, fade: true, grow: 0.3 },
  star:   { tex: () => glyph('✨'), size: 0.3, life: 1.0, vel: [0, 0.8, 0], spread: 0.9, gravity: -1.2, fade: true },
  note:   { tex: () => glyph('🎵'), size: 0.26, life: 1.4, vel: [0.2, 0.5, 0], spread: 0.2, gravity: 0, fade: true },
  fire:   { tex: () => glyph('🔥'), size: 0.3, life: 0.8, vel: [0, 0.6, 0.9], spread: 0.35, gravity: 0, fade: true, grow: 0.6 },
  sweat:  { tex: () => glyph('💦'), size: 0.26, life: 0.8, vel: [0, 0.8, 0], spread: 0.8, gravity: -2, fade: true },
  crumb:  { tex: () => blob('rgba(222,170,110,1)', 'rgba(222,170,110,0)'), size: 0.07, life: 0.9, vel: [0, 0.6, 0.4], spread: 0.6, gravity: -4, fade: false },
  bubble: { tex: () => blob('rgba(170,215,255,0.9)', 'rgba(255,255,255,0)', true), size: 0.16, life: 2.4, vel: [0, 0.35, 0], spread: 0.25, gravity: 0.05, fade: true },
  drop:   { tex: () => blob('rgba(120,190,255,0.95)', 'rgba(120,190,255,0)'), size: 0.07, life: 1.2, vel: [0, -2.5, 0], spread: 0.15, gravity: -6, fade: false },
  splash: { tex: () => blob('rgba(140,200,255,0.9)', 'rgba(140,200,255,0)'), size: 0.07, life: 0.7, vel: [0, 1.0, 0], spread: 1.8, gravity: -6, fade: true },
  fly:    { tex: () => glyph('🪰', 64), size: 0.12, life: 3.0, vel: [0, 0, 0], spread: 0.0, gravity: 0, fade: true, buzz: true },
  coin:   { tex: () => glyph('🪙'), size: 0.3, life: 1.0, vel: [0, 1.4, 0], spread: 0.6, gravity: -3, fade: true },
};

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.pool = [];
    this.mats = new Map();
  }

  _mat(type) {
    if (!this.mats.has(type)) {
      this.mats.set(type, new THREE.SpriteMaterial({ map: PRESETS[type].tex(), transparent: true, depthWrite: false }));
    }
    return this.mats.get(type);
  }

  /**
   * @param {keyof PRESETS} type
   * @param {THREE.Vector3} pos  world position
   * @param {{count?: number, vel?: THREE.Vector3, size?: number, life?: number, parent?: THREE.Object3D, orbit?: THREE.Object3D}} o
   */
  spawn(type, pos, o = {}) {
    const p = PRESETS[type];
    const n = o.count ?? 1;
    for (let i = 0; i < n; i += 1) {
      const s = this.pool.pop() || new THREE.Sprite();
      s.material = o.material || this._mat(type).clone();
      s.material.opacity = 1;
      s.material.rotation = (Math.random() - 0.5) * 0.6;
      const size = (o.size ?? p.size) * (0.8 + Math.random() * 0.4);
      s.scale.setScalar(size);
      s.position.copy(pos);
      s.renderOrder = 10;
      const v = o.vel ? o.vel.clone() : new THREE.Vector3(...p.vel);
      v.x += (Math.random() - 0.5) * p.spread;
      v.y += (Math.random() - 0.5) * p.spread * 0.5;
      v.z += (Math.random() - 0.5) * p.spread;
      (o.parent || this.scene).add(s);
      this.live.push({
        s, v, age: 0, life: (o.life ?? p.life) * (0.85 + Math.random() * 0.3), size, p,
        orbit: o.orbit, phase: Math.random() * 6.28,
      });
    }
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const q = this.live[i];
      q.age += dt;
      const k = q.age / q.life;
      if (k >= 1) {
        q.s.parent?.remove(q.s);
        q.s.material.dispose();
        this.pool.push(q.s);
        this.live.splice(i, 1);
        continue;
      }
      if (q.p.buzz && q.orbit) {
        // flies buzz around a target (smelly cat!)
        q.phase += dt * 5;
        const c = q.orbit.getWorldPosition(new THREE.Vector3());
        q.s.position.set(c.x + Math.cos(q.phase) * 0.6, c.y + 0.9 + Math.sin(q.phase * 2.3) * 0.25, c.z + Math.sin(q.phase) * 0.5);
      } else {
        q.v.y += q.p.gravity * dt;
        q.s.position.addScaledVector(q.v, dt);
        if (q.s.position.y < 0.02 && q.p.gravity < -1) { q.s.position.y = 0.02; q.v.set(0, 0, 0); }
      }
      if (q.p.grow) q.s.scale.setScalar(q.size * (1 + q.p.grow * k));
      if (q.p.fade) q.s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
  }
}
