// ============================================================================
// Pet.js — the cat's brain and body language.
// ----------------------------------------------------------------------------
// Layers, per frame:
//   1. locomotion   follow a path (room travel, wandering, chasing)
//   2. animation    ClipRig plays idle / walk / sit clips to match
//   3. procedural   breathing, ear twitches, tail flicks (Procedural.js)
//   4. reactions    purr, giggle, annoyed, chew, yuck, spicy, shake, yawn…
//                   additive bone rotations through the PoseLayer
//   5. face         blinking / sleepy / squinting eyes, head look-at
//
// Everything is driven by the rig auto-mapping in ../cat/, so another rigged
// cat model can be dropped in without touching this file.
// ============================================================================
import * as THREE from 'three';
import { ROOM_W, DOOR_Z } from '../world/House.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function angleDiff(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
function envelope(k, attack = 0.12, release = 0.25) {
  if (k < attack) return k / attack;
  if (k > 1 - release) return Math.max(0, (1 - k) / release);
  return 1;
}

// How long each reaction lasts (seconds).
const REACTIONS = {
  purr: 2.4, giggle: 1.6, annoyed: 1.8, angry: 3.0, yuck: 1.4, love: 1.8, chew: 2.2,
  spicy: 2.4, shake: 1.4, yawn: 2.0, surprise: 0.8, hop: 0.6, nod: 0.9, proud: 1.6,
};

export class Pet {
  constructor({ root, rig, bones, layer, tracker, procedural, house, fx, sound, voice, game, camera }) {
    Object.assign(this, { root, rig, bones, layer, tracker, procedural, house, fx, sound, voice, game, camera });

    this.room = game.s.room || 0;
    this.path = [];
    this.onArrive = null;
    this.walkSpeed = 0.75;
    this.speed = 0;
    this.sitting = false;
    this.sleeping = false;
    this.reactions = [];
    this.chase = null;                 // { target: () => Vector3|null, reach, onReach, speed }
    this.faceAwayUntil = 0;
    this.time = 0;
    this.idleTimer = 4 + Math.random() * 4;
    this.blinkTimer = 2;
    this.blinkT = 0;
    this.eyeOpen = 1;
    this.pokes = [];
    this.strokeAccum = 0;
    this.foam = [];
    this.wet = 0;
    this.hopY = 0;
    this.lookAt = null;                // world point to look at, or null (camera)
    this.lookUntil = 0;
    this.travelling = false;
    this._zzzTimer = 0;
    this._flyTimer = 0;
    this._purrTimer = 0;

    // Bone axes, measured in the rest pose (see Procedural.js for why).
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    this.W = {
      fwd: new THREE.Vector3(1, 0, 0).applyQuaternion(rq),
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(rq),
      side: new THREE.Vector3(0, 0, 1).applyQuaternion(rq),
    };
    this.axes = new Map();
    const want = [bones.head, bones.neck, bones.chest, bones.hip, bones.earL, bones.earR, bones.eyeL, bones.eyeR, ...bones.tail];
    for (const b of want) if (b) this.axes.set(b, this._axesFor(b));

    // Place at the saved room's home spot, facing the camera.
    const home = house.rooms[this.room].home;
    root.position.set(home.x, 0, home.z);
    root.rotation.y = -Math.PI / 2;
    if (game.s.asleep) this._enterSleep(true);
  }

  _axesFor(bone) {
    const inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local = (w) => w.clone().applyQuaternion(inv).normalize();
    const up = local(this.W.up);
    // For squashing eyes: which local axis is closest to world up.
    const comps = [Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)];
    return { fwd: local(this.W.fwd), up, side: local(this.W.side), upIndex: comps.indexOf(Math.max(...comps)) };
  }

  /** Rotate `bone` about one of the cat's axes (pitch: side, yaw: up, roll: fwd). */
  _rot(bone, axis, angle) {
    if (!bone || !angle) return;
    _q.setFromAxisAngle(this.axes.get(bone)[axis], angle);
    this.layer.multiply(bone, _q);
  }

  // ======================================================================
  // Public API (called by the game / UI)
  // ======================================================================
  get busy() { return this.travelling || this.sleeping; }

  /** World direction the cat's nose points (root +X). */
  noseDir() {
    const y = this.root.rotation.y;
    return new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
  }

  headPosition(target = new THREE.Vector3()) {
    return (this.bones.head || this.root).getWorldPosition(target);
  }

  react(type, opts = {}) {
    // Same reaction again just restarts it.
    this.reactions = this.reactions.filter((r) => r.type !== type);
    this.reactions.push({ type, t: 0, dur: opts.dur ?? REACTIONS[type] ?? 1.5 });
  }

  isReacting(type) { return this.reactions.some((r) => r.type === type); }

  /** Walk through the doorways to room `to`. */
  goToRoom(to, done) {
    if (to === this.room && !this.travelling) { done?.(); return; }
    this.wake(false);
    this.sitting = false;
    const pts = [];
    const from = this.room;
    const dir = Math.sign(to - from);
    for (let k = from; k !== to; k += dir) {
      const doorX = (k + (dir > 0 ? 0.5 : -0.5)) * ROOM_W;
      pts.push(new THREE.Vector3(doorX - dir * 1.0, 0, DOOR_Z + 0.8));
      pts.push(new THREE.Vector3(doorX - dir * 0.35, 0, DOOR_Z));
      pts.push(new THREE.Vector3(doorX + dir * 0.35, 0, DOOR_Z));
      pts.push(new THREE.Vector3(doorX + dir * 1.0, 0, DOOR_Z + 0.8));
    }
    pts.push(this.house.rooms[to].home.clone());
    this.travelling = true;
    this.chase = null;
    this.walk(pts, () => {
      this.travelling = false;
      this.room = to;
      this.game.setRoom(to);
      done?.();
    }, 1.0);
  }

  /** Teleport (used when the camera jumps rooms instantly, e.g. on load). */
  placeInRoom(i) {
    this.room = i;
    const h = this.house.rooms[i].home;
    this.root.position.set(h.x, 0, h.z);
    this.path = [];
  }

  walk(points, onArrive, speedScale = 1) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive || null;
    this.walkSpeed = 0.75 * speedScale;
    this.sitting = false;
  }

  stop() { this.path = []; this.onArrive = null; this.chase = null; }

  // --- touch -----------------------------------------------------------------
  /** region: head | body | belly | tail | leg */
  touch(region) {
    if (this.sleeping) { this.wake(true); return 'wake'; }
    const now = this.time;
    this.pokes = this.pokes.filter((t) => now - t < 3);
    this.pokes.push(now);
    if (this.pokes.length >= 5) {
      this.pokes = [];
      this.react('angry');
      this.faceAwayUntil = now + 3;
      this.sound.hiss();
      this._burst('angry', 3);
      this.game.addNeed('fun', -4);
      return 'angry';
    }
    if (region === 'head') {
      this.react('purr'); this.sitting = true; this.idleTimer = 6;
      this.sound.meow({ pitch: 1.15, dur: 0.4, mood: 'happy' });
      this._burst('heart', 2);
      this.game.count('petted'); this.game.addNeed('fun', 3); this.game.addXp(1);
      return 'purr';
    }
    if (region === 'belly') {
      this.react('giggle'); this.sound.trill(4, 1.4);
      this._burst('note', 2);
      this.game.addNeed('fun', 4); this.game.addXp(1);
      return 'giggle';
    }
    if (region === 'tail') {
      this.react('annoyed'); this.sound.meow({ pitch: 0.85, dur: 0.6, mood: 'angry' });
      this._burst('angry', 1);
      return 'annoyed';
    }
    // body / leg
    this.react('surprise'); this.react('hop');
    this.sound.meow({ pitch: 1.3, dur: 0.3, mood: 'question' });
    return 'surprise';
  }

  /** Continuous stroking (drag across the fur). */
  stroke(dt) {
    if (this.sleeping) return;
    this.strokeAccum += dt;
    if (!this.isReacting('purr') || this.reactions.find((r) => r.type === 'purr').t > 1.5) this.react('purr', { dur: 2.0 });
    this.sitting = true; this.idleTimer = 5;
    this.sound.purr(true);
    this._purrTimer = 0.6;
    if (this.strokeAccum > 0.5) {
      this.strokeAccum = 0;
      this._burst('heart', 1);
      this.game.addNeed('fun', 1.5);
      this.game.count('petted');
    }
  }

  // --- food ------------------------------------------------------------------
  feed(food) {
    this.wake(false);
    this.sitting = false;
    this.react('chew');
    this.sound.munch();
    setTimeout(() => this.sound.munch(), 700);
    const mouth = this.headPosition(_v).clone().add(this.noseDir().multiplyScalar(0.25));
    this.fx.spawn('crumb', mouth, { count: 8 });
    setTimeout(() => {
      if (food.like === 'love') { this.react('love'); this._burst('heart', 4); this.sound.meow({ pitch: 1.2, mood: 'happy' }); }
      else if (food.like === 'like') { this.react('nod'); this._burst('heart', 1); this.sound.meow({ pitch: 1.1, dur: 0.35 }); }
      else if (food.like === 'dislike') { this.react('yuck'); this.sound.meow({ pitch: 0.9, dur: 0.7, mood: 'sad' }); }
      else if (food.like === 'spicy') {
        this.react('spicy'); this.react('hop', { dur: 0.6 }); this.sound.trill(5, 1.7);
        const m = this.headPosition(new THREE.Vector3());
        for (let i = 0; i < 5; i += 1) setTimeout(() => this.fx.spawn('fire', m, { count: 2 }), i * 180);
        setTimeout(() => this.fx.spawn('sweat', m, { count: 4 }), 600);
      }
    }, 1500);
  }

  refuse() {
    this.react('yuck'); this.sound.meow({ pitch: 0.95, dur: 0.5, mood: 'sad' });
  }

  // --- sleep -----------------------------------------------------------------
  sleep() {
    if (this.sleeping) return;
    const bedRoom = this.house.rooms.findIndex((r) => r.id === 'bedroom');
    const goBed = () => {
      const bed = this.house.rooms[bedRoom].spots.bed;
      this.walk([bed], () => this._enterSleep(false), 0.8);
    };
    if (this.room !== bedRoom) this.goToRoom(bedRoom, goBed); else goBed();
  }

  _enterSleep(instant) {
    this.sleeping = true;
    this.sitting = true;
    this.game.setAsleep(true);
    this.game.count('slept');
    if (instant) {
      const bed = this.house.rooms[this.room].spots.bed;
      if (bed) this.root.position.set(bed.x, 0, bed.z);
    } else {
      this.react('yawn'); this.sound.yawn();
    }
  }

  wake(withMeow = true) {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.sitting = false;
    this.game.setAsleep(false);
    this.react('yawn', { dur: 1.6 });
    if (withMeow) setTimeout(() => this.sound.meow({ pitch: 0.95, dur: 0.6, mood: 'question' }), 600);
  }

  // --- washing -----------------------------------------------------------------
  /** Sponge at a world point on the fur. Returns true if foam was added. */
  scrub(point) {
    if (this.sleeping) this.wake(false);
    this.sitting = false;
    if (this.foam.length > 70) return false;
    const local = this.root.worldToLocal(point.clone());
    const rs = this.root.scale.x;
    this.fx.spawn('bubble', point, { count: 1, size: 0.12 });
    // Foam that sticks to the fur: sprite parented to the cat root.
    const s = new THREE.Sprite(this.fx._mat('bubble').clone());
    s.position.copy(local);
    s.scale.setScalar((0.16 + Math.random() * 0.12) / rs);
    s.renderOrder = 9;
    this.root.add(s);
    this.foam.push(s);
    if (Math.random() < 0.08) { this.react('giggle', { dur: 1.0 }); this.sound.trill(2, 1.5); }
    this.sound.squish();
    return true;
  }

  rinse(dt) {
    this.wet = Math.min(1, this.wet + dt);
    const head = this.headPosition(new THREE.Vector3());
    const over = head.clone().add(new THREE.Vector3(0, 1.1, 0));
    for (let i = 0; i < 3; i += 1) {
      this.fx.spawn('drop', over.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.5)));
    }
    // Foam washes away a little at a time.
    let removed = 0;
    if (this.foam.length && Math.random() < dt * 12) {
      const s = this.foam.shift();
      this.fx.spawn('bubble', s.getWorldPosition(new THREE.Vector3()), { count: 1 });
      s.parent?.remove(s);
      removed = 1;
    }
    return removed;
  }

  shakeOff() {
    if (this.wet < 0.3) return;
    this.wet = 0;
    this.react('shake');
    const c = this.root.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    this.fx.spawn('splash', c, { count: 30 });
    this.sound.trill(2, 1.2);
  }

  get foamCount() { return this.foam.length; }

  // --- play ------------------------------------------------------------------
  /** Chase a moving target (ball, laser dot). onReach() fires when close. */
  startChase(target, onReach, reach = 0.55, speed = 1.4) {
    this.wake(false);
    this.sitting = false;
    this.chase = { target, onReach, reach, speed, cool: 0 };
  }

  stopChase() { this.chase = null; this.path = []; }

  pounce() {
    this.react('hop', { dur: 0.55 });
    this.sound.meow({ pitch: 1.35, dur: 0.25, mood: 'happy' });
  }

  // --- talk ------------------------------------------------------------------
  celebrate() {
    this.react('proud'); this.react('hop'); this._burst('star', 6); this.sound.levelUp();
  }

  _burst(type, n) {
    const p = this.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0));
    this.fx.spawn(type, p, { count: n });
  }

  // ======================================================================
  // Per frame
  // ======================================================================
  update(dt) {
    this.time += dt;
    const t = this.time;

    // ---------------------------------------------------------------- locomotion
    if (this.chase) {
      const target = this.chase.target();
      if (target) {
        const d = Math.hypot(target.x - this.root.position.x, target.z - this.root.position.z);
        this.chase.cool -= dt;
        if (d < this.chase.reach && this.chase.cool <= 0) {
          this.chase.cool = 0.9;
          this.chase.onReach?.();
        }
        this.path = d > this.chase.reach * 0.7 ? [target.clone().setY(0)] : [];
        this.walkSpeed = this.chase.speed;
        this.lookAt = target; this.lookUntil = t + 0.2;
      }
    }

    let moving = false;
    const rigBusy = this.rig.busy;
    if (this.path.length && !rigBusy) {
      const p = this.path[0];
      const dx = p.x - this.root.position.x;
      const dz = p.z - this.root.position.z;
      const dist = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (dist < (last ? 0.12 : 0.3)) {
        this.path.shift();
        if (!this.path.length) {
          this.speed = 0;
          const cb = this.onArrive; this.onArrive = null;
          cb?.();
        }
      } else {
        const cap = this.rig.maxSpeed ?? 1.2;
        const want = Math.min(this.walkSpeed, cap, last ? Math.sqrt(dist) * 1.4 : Infinity);
        this.speed += (want - this.speed) * Math.min(1, dt * 3);
        const yaw = Math.atan2(-dz, dx);
        const turn = angleDiff(this.root.rotation.y, yaw);
        this.root.rotation.y += turn * Math.min(1, dt * 5);
        // Slow down for sharp turns so it doesn't moonwalk sideways.
        const step = this.speed * dt * Math.max(0.25, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
        this.root.position.x += (dx / dist) * Math.min(step, dist);
        this.root.position.z += (dz / dist) * Math.min(step, dist);
        moving = true;
      }
    } else if (!this.path.length) {
      this.speed = 0;
    }

    // ---------------------------------------------------------------- facing
    let turningInPlace = false;
    if (!moving && !rigBusy) {
      let desired;
      if (t < this.faceAwayUntil) {
        desired = Math.atan2(-(this.root.position.z - this.camera.position.z), this.root.position.x - this.camera.position.x);
      } else if (this.sleeping) {
        // Curled up in bed in a three-quarter view toward the person.
        desired = Math.atan2(-(this.camera.position.z - this.root.position.z), this.camera.position.x - this.root.position.x) + 0.7;
      } else {
        const tgt = this.lookAt && t < this.lookUntil ? this.lookAt : this.camera.position;
        desired = Math.atan2(-(tgt.z - this.root.position.z), tgt.x - this.root.position.x);
        // Don't stare dead-on all the time; a slight three-quarter view is more natural.
        if (!this.lookAt || t >= this.lookUntil) desired += Math.sin(t * 0.13) * 0.25;
      }
      if (desired !== undefined) {
        const d = angleDiff(this.root.rotation.y, desired);
        if (Math.abs(d) > 0.08) {
          this.root.rotation.y += d * Math.min(1, dt * 2.2);
          turningInPlace = Math.abs(d) > 0.5 && !this.sitting;
        }
      }
    }

    // ---------------------------------------------------------------- idle life
    if (!moving && !this.chase && !this.sleeping && !this.travelling) this._idleBrain(dt);

    // ---------------------------------------------------------------- animation pose
    let pose = 'idle';
    let speed = this.speed;
    if (moving) pose = 'walk';
    else if (turningInPlace) { pose = 'walk'; speed = 0.25; }
    else if (this.sleeping) pose = 'rest';
    else if (this.sitting) pose = 'sit';
    this.rig.update(pose, 0, speed, dt);

    // ---------------------------------------------------------------- body language
    if (this.procedural) {
      this.procedural.intensity = this.sleeping ? 0.25 : 1;
      this.procedural.update(dt, { breathRate: this.sleeping ? 1.0 : 1.8 });
    }
    this._applyReactions(dt);
    this._face(dt);

    // root hop (pounce / surprise / spicy)
    this.root.position.y = this.hopY;

    // ---------------------------------------------------------------- ambient effects
    if (this.sleeping) {
      this._zzzTimer -= dt;
      if (this._zzzTimer <= 0) { this._zzzTimer = 2.2; this._burst('zzz', 1); }
    }
    if (this.game.needs.clean < 25 && !this.sleeping) {
      this._flyTimer -= dt;
      if (this._flyTimer <= 0) { this._flyTimer = 3; this.fx.spawn('fly', this.root.position, { orbit: this.root, life: 3 }); }
    }
    if (this._purrTimer > 0) {
      this._purrTimer -= dt;
      if (this._purrTimer <= 0) this.sound.purr(false);
    }
    // Foam slowly fades into bubbles if left alone.
    if (this.foam.length && this.wet > 0 && Math.random() < dt) this.wet = Math.max(0, this.wet - 0.05);
  }

  _idleBrain(dt) {
    this.idleTimer -= dt;
    if (this.idleTimer > 0 || this.reactions.length || this.voice.state === 'hearing' || this.voice.state === 'talking') return;
    const n = this.game.needs;
    const r = Math.random();
    this.idleTimer = 5 + Math.random() * 6;
    if (n.energy < 25 && r < 0.5) {
      this.react('yawn'); this.sound.yawn(); this.sitting = true; return;
    }
    if (this.sitting) { this.sitting = false; return; }
    if (r < 0.3) { this.sitting = true; this.idleTimer = 6 + Math.random() * 6; return; }
    if (r < 0.55) {
      // Wander to an interesting spot in this room, look at it, come back later.
      const spots = Object.values(this.house.rooms[this.room].spots);
      const room = this.house.rooms[this.room];
      if (spots.length && room.id !== 'bedroom') {
        const s = spots[Math.floor(Math.random() * spots.length)];
        this.walk([s], () => {
          this.lookAt = s.clone().add(new THREE.Vector3(0, 0.8, -1.5)); this.lookUntil = this.time + 3;
          setTimeout(() => { if (!this.busy && !this.chase && !this.path.length) this.walk([room.home], null, 0.8); }, 3500);
        }, 0.7);
        return;
      }
    }
    if (r < 0.7) {
      // Look around: glance left/right.
      const side = Math.random() < 0.5 ? -1 : 1;
      this.lookAt = this.root.position.clone().add(new THREE.Vector3(side * 3, 1.2, 1)); this.lookUntil = this.time + 1.6;
      return;
    }
    if (r < 0.82) { this.sound.meow({ pitch: 1 + Math.random() * 0.2, mood: Math.random() < 0.5 ? 'question' : 'happy' }); this.react('nod'); }
  }

  _applyReactions(dt) {
    const B = this.bones;
    let hop = 0;
    for (let i = this.reactions.length - 1; i >= 0; i -= 1) {
      const r = this.reactions[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const e = envelope(k);
      const s = r.t;
      switch (r.type) {
        case 'purr':
          this._rot(B.head, 'fwd', 0.2 * e);
          this._rot(B.head, 'side', -0.08 * e);
          break;
        case 'giggle':
          this._rot(B.chest, 'fwd', Math.sin(s * 28) * 0.12 * e);
          this._rot(B.head, 'fwd', Math.sin(s * 22) * 0.12 * e);
          break;
        case 'annoyed':
          B.tail.forEach((b, j) => this._rot(b, 'up', Math.sin(s * 14 - j * 0.6) * 0.45 * e));
          this._rot(B.head, 'up', 0.7 * e);
          this._rot(B.earL, 'side', -0.5 * e); this._rot(B.earR, 'side', -0.5 * e);
          break;
        case 'angry':
          this._rot(B.head, 'up', Math.sin(s * 16) * 0.22 * e);
          this._rot(B.earL, 'side', -0.7 * e); this._rot(B.earR, 'side', -0.7 * e);
          B.tail.forEach((b, j) => this._rot(b, 'up', Math.sin(s * 9 - j * 0.5) * 0.35 * e));
          break;
        case 'yuck':
          this._rot(B.head, 'up', Math.sin(s * 13) * 0.38 * e);
          this._rot(B.head, 'side', 0.1 * e);
          break;
        case 'love':
        case 'proud':
          this._rot(B.head, 'side', Math.sin(s * 9) * 0.1 * e + 0.12 * e);
          B.tail.forEach((b, j) => this._rot(b, 'up', Math.sin(s * 6 - j * 0.5) * 0.2 * e));
          break;
        case 'nod':
          this._rot(B.head, 'side', -Math.sin(k * Math.PI * 2) * 0.18);
          break;
        case 'chew':
          this._rot(B.head, 'side', (-0.22 + Math.sin(s * 15) * 0.07) * e);
          break;
        case 'spicy':
          this._rot(B.head, 'up', Math.sin(s * 20) * 0.25 * e);
          this._rot(B.earL, 'side', 0.3 * e); this._rot(B.earR, 'side', 0.3 * e);
          break;
        case 'shake': {
          const a = Math.sin(s * 30) * 0.28 * (1 - k);
          this._rot(B.chest, 'fwd', a); this._rot(B.hip, 'fwd', -a * 0.7); this._rot(B.head, 'fwd', a * 1.2);
          break;
        }
        case 'yawn':
          this._rot(B.head, 'side', 0.4 * e);
          break;
        case 'surprise':
          this._rot(B.earL, 'side', 0.3 * e); this._rot(B.earR, 'side', 0.3 * e);
          this._rot(B.head, 'side', 0.12 * e);
          break;
        case 'hop':
          hop = Math.max(hop, Math.sin(k * Math.PI) * 0.32);
          break;
        default:
      }
      if (k >= 1) this.reactions.splice(i, 1);
    }
    this.hopY = hop;

    // Talk-back: head bobs with the playback level; tilt when hearing you.
    const vs = this.voice.state;
    if (vs === 'talking') {
      this._rot(B.head, 'side', 0.05 - this.voice.level * 0.3);
      this._rot(B.head, 'fwd', Math.sin(this.time * 9) * 0.06 * this.voice.level);
    } else if (vs === 'hearing') {
      this._listen = Math.min(1, (this._listen || 0) + dt * 4);
    } else {
      this._listen = Math.max(0, (this._listen || 0) - dt * 3);
    }
    if (this._listen > 0) {
      this._rot(B.head, 'fwd', 0.28 * this._listen);
      this._rot(B.earL, 'side', 0.25 * this._listen); this._rot(B.earR, 'side', 0.25 * this._listen);
    }
    // Sleeping: head droops.
    if (this.sleeping) {
      this._rot(B.head, 'side', -0.35);
      this._rot(B.neck, 'side', -0.15);
    }
  }

  _face(dt) {
    const B = this.bones;
    // Eyes: blink every few seconds; squint when happy; closed when asleep.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blinkTimer = 2.5 + Math.random() * 4; this.blinkT = 0.16; }
    let open = 1;
    if (this.blinkT > 0) { this.blinkT -= dt; open = Math.abs(Math.cos((1 - this.blinkT / 0.16) * Math.PI)); }
    const rs = this.reactions.map((r) => r.type);
    if (rs.includes('purr') || rs.includes('love') || rs.includes('giggle') || rs.includes('proud')) open = Math.min(open, 0.3);
    if (rs.includes('yawn') || this.sleeping) open = 0.06;
    if (rs.includes('yuck') || rs.includes('angry')) open = Math.min(open, 0.55);
    if (rs.includes('surprise') || rs.includes('spicy')) open = 1.25;
    if (this.voice.state === 'hearing') open = Math.max(open, 1.1);
    this.eyeOpen += (open - this.eyeOpen) * Math.min(1, dt * 18);
    for (const eye of [B.eyeL, B.eyeR]) {
      if (!eye) continue;
      const idx = this.axes.get(eye).upIndex;
      const f = Math.max(0.06, this.eyeOpen);
      this.layer.scale(eye, idx === 0 ? f : 1, idx === 1 ? f : 1, idx === 2 ? f : 1);
    }

    // Head look-at: what's interesting, else the person (camera).
    if (this.tracker) {
      const busyFace = this.sleeping || rs.includes('chew') || rs.includes('angry') || rs.includes('annoyed') || rs.includes('shake');
      this.tracker.enabled = !busyFace;
      if (this.lookAt && this.time < this.lookUntil) this.tracker.setWorldTarget(this.lookAt);
      else if (!this._pointerActive) this.tracker.setWorldTarget(this.camera.position);
      else this.tracker.setWorldTarget(null);
      this.tracker.update(dt);
    }
  }

  /** main.js tells us whether the cursor is over the canvas (then we look at it). */
  set pointerActive(v) { this._pointerActive = v; }
}
