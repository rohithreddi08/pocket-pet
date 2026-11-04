// ============================================================================
// Pet.js — a Somali cat's brain and body language.
// ----------------------------------------------------------------------------
// Behaviour is modelled on documented Somali traits (CFA, Hill's) and general
// feline behaviour — see the Care Guide sheet in the app for the sources:
//
//  • Lives its own life: picks activities from its needs, the real time of day
//    (cats are crepuscular: most active at dawn and dusk, ~14 h of naps a day)
//    and its trust in you. Eats/drinks from its bowls, uses the litter box.
//  • Somali traits: very active & curious, loves high perches, follows its
//    people from room to room, greets with head-rubs, kneads, fascinated by
//    water, quiet voice (chirps and trills more than meows), not a lap cat.
//  • Real body language: tail up = happy, lashing = irritated, twitching tip =
//    hunting/excited; ears forward = interested, sideways ("airplane") =
//    annoyed; slow blinks = trust. Petting has a tolerance: warning signs,
//    then a swat. Bellies are usually off-limits.
//
// Animation: the model has 5 clips (idle, walk, sit down, sit, stand up);
// everything else is additive procedural motion on top (PoseLayer).
// ============================================================================
import * as THREE from 'three';
import { ROOM_W, DOOR_Z } from '../world/House.js';
import { activityAt } from '../state.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function angleDiff(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
function envelope(k, attack = 0.12, release = 0.25) {
  if (k < attack) return k / attack;
  if (k > 1 - release) return Math.max(0, (1 - k) / release);
  return 1;
}
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const REACTIONS = {
  purr: 2.4, swat: 0.7, annoyed: 1.8, hiss: 1.2, yuck: 1.4, love: 1.8, chew: 2.2,
  shake: 1.4, yawn: 2.0, surprise: 0.8, hop: 0.6, nod: 0.9, proud: 1.6, headshake: 1.2,
  slowblink: 1.6, bunt: 2.6, flinch: 0.7, perk: 2.5, sniff: 2.0,
};

// How fast petting builds overstimulation, per second of stroking (or per tap ×0.6).
const TOLERANCE = { head: 8, body: 20, leg: 38, tail: 60, belly: 75 };
const WARN = 55;
const LIMIT = 85;

export class Pet {
  constructor({ root, rig, bones, layer, tracker, procedural, house, fx, sound, voice, game, camera }) {
    Object.assign(this, { root, rig, bones, layer, tracker, procedural, house, fx, sound, voice, game, camera });

    this.room = game.s.catRoom ?? 0;
    this.viewRoom = game.s.room ?? 0;
    this.path = [];
    this.onArrive = null;
    this.walkSpeed = 0.75;
    this.speed = 0;
    this.sitting = false;
    this.sleeping = false;
    this.reactions = [];
    this.act = null;               // current activity
    this.status = '';
    this.chase = null;
    this.time = 0;
    this.baseY = 0;                // > 0 when perched on furniture
    this.perch = null;
    this.jump = null;
    this.hopY = 0;
    this.blinkTimer = 2;
    this.blinkT = 0;
    this.eyeOpen = 1;
    this.overstim = 0;
    this.warned = false;
    this.touchedAt = -10;
    this.purring = 0;
    this.foam = [];
    this.wet = 0;
    this.lookAt = null;
    this.lookUntil = 0;
    this.faceAwayUntil = 0;
    this.carry = null;
    this.justAte = 0;
    this._zzz = 0; this._fly = 0; this._bird = 0; this._chirpT = 0;
    this.onHint = () => {};        // main.js shows body-language hints as toasts

    // Bone axes, measured in the rest pose (see Procedural.js for why).
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    this.W = {
      fwd: new THREE.Vector3(1, 0, 0).applyQuaternion(rq),
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(rq),
      side: new THREE.Vector3(0, 0, 1).applyQuaternion(rq),
    };
    this.axes = new Map();
    for (const b of [bones.head, bones.neck, bones.chest, bones.hip, bones.earL, bones.earR, bones.eyeL, bones.eyeR, bones.armL, bones.armR, ...bones.tail]) {
      if (b) this.axes.set(b, this._axesFor(b));
    }

    const home = house.rooms[this.room].home;
    root.position.set(home.x, 0, home.z);
    root.rotation.y = -Math.PI / 2;
  }

  _axesFor(bone) {
    const inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local = (w) => w.clone().applyQuaternion(inv).normalize();
    const up = local(this.W.up);
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
  // Queries
  // ======================================================================
  get inView() { return this.room === this.viewRoom && !this.travelling; }
  get travelling() { return this._travelling; }
  get busy() { return this._travelling || this.sleeping; }
  get foamCount() { return this.foam.length; }

  noseDir() {
    const y = this.root.rotation.y;
    return new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
  }

  headPosition(target = new THREE.Vector3()) { return (this.bones.head || this.root).getWorldPosition(target); }

  react(type, opts = {}) {
    this.reactions = this.reactions.filter((r) => r.type !== type);
    this.reactions.push({ type, t: 0, dur: opts.dur ?? REACTIONS[type] ?? 1.5 });
  }

  isReacting(type) { return this.reactions.some((r) => r.type === type); }

  /** Front-of-room spot facing the person (the camera). */
  frontOf(room) {
    const h = this.house.rooms[room].home;
    return new THREE.Vector3(h.x + rand(-0.4, 0.4), 0, h.z + 0.5);
  }

  // ======================================================================
  // Movement primitives
  // ======================================================================
  walk(points, onArrive, speedScale = 1) {
    this.path = points.map((p) => p.clone().setY(0));
    this.onArrive = onArrive || null;
    this.walkSpeed = 0.75 * speedScale;
    this.sitting = false;
  }

  stop() { this.path = []; this.onArrive = null; this.chase = null; this._travelling = false; }

  /** Get off furniture / wake up, then continue. */
  leave(then) {
    if (this.sleeping) this.wake(false);
    this.sitting = false;
    if (this.perch) {
      const p = this.perch; this.perch = null;
      this._jumpTo(p.ground, then);
    } else then?.();
  }

  _jumpTo(target, then) {
    const from = this.root.position.clone();
    from.y = this.baseY;
    const yaw = Math.atan2(-(target.z - from.z), target.x - from.x);
    this.jump = { from, to: target.clone(), t: 0, dur: 0.6, yaw, then };
    if (this.inView) this.sound.meow({ pitch: 1.4, dur: 0.1, vol: 0.2, mood: 'happy' });
  }

  /** Walk through the doorways to room `to`. */
  goToRoom(to, done, speedScale = 1) {
    this.leave(() => {
      if (to === this.room) { done?.(); return; }
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
      this._travelling = true;
      this.chase = null;
      this.walk(pts, () => {
        this._travelling = false;
        this.room = to;
        this.game.setCatRoom(to);
        done?.();
      }, speedScale);
    });
  }

  /** Go to a point in a room (crossing rooms if needed). */
  goTo(room, point, done, speedScale = 1) {
    this.goToRoom(room, () => this.walk([point], done, speedScale), speedScale);
  }

  // ======================================================================
  // Activities (the cat's own life)
  // ======================================================================
  _setAct(id, label, data = {}, interruptible = true) {
    this.act = { id, label, t: 0, phase: 'go', interruptible, ...data };
    this.status = label;
  }

  _endAct() {
    this.act = null;
    this.status = '';
  }

  /** Interrupt whatever the cat is doing (user wants attention). */
  interrupt(force = false) {
    if (this.act && !this.act.interruptible && !force) return false;
    if (this.act?.id === 'nap' || this.sleeping) this.wake(false);
    this.stop();
    this._endAct();
    return true;
  }

  _decide() {
    const g = this.game; const n = g.needs; const s = g.s; const b = s.bowl;
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const act = activityAt(hour);
    const day = hour >= 7 && hour < 19;

    // Urgent needs first — a real cat sorts these out itself if it can.
    if (s.bladder <= 0) return this._startLitter();
    if (n.water < 35 && b.water > 5) return this._startBowl('water');
    if (n.food < 40 && b.food > 5) return this._startBowl('food');
    if (n.food < 30) return this._startAsk('food');
    if (n.water < 30) return this._startAsk('water');
    if (n.energy < 22) return this._startNap();
    if (this.justAte > 0) { this.justAte = 0; return this._startGroom(); }   // cats groom after meals

    const options = [
      ['nap', (1 - act) * 0.55 + (n.energy < 55 ? 0.45 : 0) + (this.house.rooms[this.room].lightsOn ? 0 : 0.4)],
      ['groom', n.groom < 85 ? 0.28 : 0.1],
      ['explore', act * 0.45],
      ['perch', act * 0.3],
      ['window', day ? 0.28 : 0.04],
      ['zoomies', act > 0.75 && n.energy > 55 ? 0.14 : 0.01],
      ['attention', g.bond > 25 ? (n.play < 45 ? 0.45 : 0.18) : 0.04],
      ['tap', this.house.tap.on ? 0.9 : 0],
      ['idle', 0.32],
    ];
    const total = options.reduce((s2, [, w]) => s2 + w, 0);
    let r = Math.random() * total;
    let choice = 'idle';
    for (const [id, w] of options) { r -= w; if (r <= 0) { choice = id; break; } }

    switch (choice) {
      case 'nap': return this._startNap();
      case 'groom': return this._startGroom();
      case 'explore': return this._startExplore();
      case 'perch': return this._startPerch();
      case 'window': return this._startWindow();
      case 'zoomies': return this._startZoomies();
      case 'attention': return this._startAttention();
      case 'tap': return this._startTap();
      default: return this._startIdle();
    }
  }

  _startIdle() {
    this._setAct('idle', this.inView ? 'Hanging out with you' : 'Relaxing', { dur: rand(5, 12) });
    this.sitting = Math.random() < 0.55;
  }

  _startGroom() {
    this._setAct('groom', 'Grooming', { dur: rand(8, 14), side: Math.random() < 0.5 ? 1 : -1 });
    if (this.sleeping) this.wake(false);
    this.sitting = true;                       // grooms right where it is (perches included)
    this.act.phase = 'do';
  }

  _startExplore() {
    const other = Math.random() < 0.4;
    const room = other ? Math.max(0, Math.min(3, this.room + (Math.random() < 0.5 ? -1 : 1))) : this.room;
    const spots = Object.values(this.house.rooms[room].spots);
    const spot = pick(spots) || this.house.rooms[room].home;
    this._setAct('explore', `Exploring the ${this.house.rooms[room].name.toLowerCase()}`, { dur: rand(2.5, 4) });
    this.goTo(room, spot, () => {
      if (!this.act) return;
      this.act.phase = 'do'; this.react('sniff', { dur: this.act.dur });
    }, 0.8);
  }

  _startPerch() {
    const perches = this.house.perches;
    if (!perches.length) return this._startIdle();
    const p = pick(perches);
    this._setAct('perch', `Up on ${p.name}`, { dur: rand(20, 50), p });
    this.goTo(p.room, p.ground, () => {
      if (!this.act) return;
      this._jumpTo(p.top, () => { this.perch = p; this.sitting = true; if (this.act) this.act.phase = 'do'; });
    });
  }

  _startNap(preferRoom = null) {
    // Favourite spots: its bed, the cat tree, the sofa — whichever is closest-ish.
    const spots = [
      ...this.house.beds.map((b) => ({ ...b, w: 0.45 })),
      ...this.house.perches.filter((p) => p.nap).map((p) => ({ room: p.room, perch: p, name: p.name, w: 0.3 })),
    ];
    let choices = preferRoom != null ? spots.filter((s) => s.room === preferRoom) : spots;
    if (!choices.length) choices = spots;
    choices.forEach((c) => { c.w *= c.room === this.room ? 1.6 : 1; });
    let r = Math.random() * choices.reduce((s, c) => s + c.w, 0);
    let spot = choices[0];
    for (const c of choices) { r -= c.w; if (r <= 0) { spot = c; break; } }
    // Real cat naps: ~15–30 min (or until woken / rested).
    this._setAct('nap', `Napping on ${spot.name}`, { dur: rand(900, 1800) });
    const settle = () => {
      if (!this.act) return;
      // Turn a little circle before lying down, like cats do.
      const c = this.root.position.clone();
      this.act.phase = 'circle';
      if (spot.perch) { this._enterSleep(); return; }
      this.walk([c.clone().add(new THREE.Vector3(0.25, 0, 0)), c.clone().add(new THREE.Vector3(0, 0, 0.25)), c], () => this._enterSleep(), 0.4);
    };
    if (spot.perch) {
      const p = spot.perch;
      this.goTo(p.room, p.ground, () => this._jumpTo(p.top, () => { this.perch = p; settle(); }));
    } else {
      this.goTo(spot.room, spot.spot, settle);
    }
  }

  _enterSleep() {
    this.sleeping = true;
    this.sitting = true;
    this.game.setAsleep(true);
    this.game.count('slept');
    if (this.act) this.act.phase = 'do';
    if (this.inView) { this.react('yawn'); this.sound.yawn(); }
  }

  wake(withSound = true) {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.game.setAsleep(false);
    this.react('yawn', { dur: 1.6 });
    if (withSound && this.inView) setTimeout(() => this.sound.chirp(1), 700);
    if (this.act?.id === 'nap') this._endAct();
  }

  _startWindow() {
    const ws = this.house.windows;
    const w = pick(ws);
    this._setAct('window', 'Watching birds through the window', { dur: rand(15, 35), w });
    this.goTo(w.room, w.spot, () => { if (this.act) { this.act.phase = 'do'; this.sitting = true; } });
  }

  _startZoomies() {
    const r = this.house.rooms[this.room];
    const pts = Array.from({ length: 6 }, () => new THREE.Vector3(rand(r.bounds.x0, r.bounds.x1), 0, rand(r.bounds.z0, r.bounds.z1)));
    this._setAct('zoomies', 'Zoomies!', {}, false);
    if (this.inView) this.sound.chirp(3);
    this.leave(() => this.walk(pts, () => { this.react('hop'); this._endAct(); }, 2.2));
  }

  _startAttention() {
    this._setAct('attention', 'Coming to see you', { dur: rand(10, 18) });
    this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => {
      if (!this.act) return;
      this.act.phase = 'do';
      this.status = this.game.needs.play < 45 ? 'Wants to play with you' : 'Wants some attention';
      if (this.inView) { this.sound.chirp(2); if (this.game.bond > 40) this.react('bunt'); }
    });
  }

  _startAsk(what) {
    const label = { food: 'Asking for food', water: 'Asking for water', litter: 'Complaining about the litter box' }[what];
    this._setAct('ask', label, { what, dur: 14 });
    this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => {
      if (!this.act) return;
      this.act.phase = 'do'; this.sitting = true;
      if (this.inView) this.sound.meow({ pitch: 1.05, mood: 'question', vol: 0.6 });
    });
  }

  _startBowl(kind) {
    const f = this.house.feeding[kind];
    this._setAct('bowl', kind === 'food' ? 'Eating' : 'Drinking water', { kind, dur: 25 }, false);
    this.goTo(1, f.stand, () => {
      if (!this.act) return;
      this.act.phase = 'do';
      this.lookAt = f.at.clone().setY(0); this.lookUntil = this.time + 30;
      this._faceTo(f.at);
    });
  }

  _startLitter() {
    if (this.game.s.litter > 80) {
      this.game.s.bladder = 3;                 // try again in a few minutes
      return this._startAsk('litter');
    }
    const lb = this.house.litterBox;
    this._setAct('litter', 'Using the litter box', { dur: 7 }, false);
    this.goTo(2, lb.front, () => {
      this._jumpTo(lb.inside, () => {
        this.baseY = 0.08;
        if (this.act) { this.act.phase = 'do'; this.sitting = true; }
      });
    });
  }

  _startTap() {
    const tap = this.house.tap;
    this._setAct('tap', 'Fascinated by the dripping tap', { dur: rand(20, 40) });
    this.goTo(2, tap.watch, () => { if (this.act) { this.act.phase = 'do'; this.sitting = true; } });
  }

  _faceTo(p) { this._faceTarget = p.clone(); }

  _runAct(dt) {
    const a = this.act;
    if (!a) return;
    if (a.phase === 'do') a.t += dt;
    const g = this.game;
    switch (a.id) {
      case 'idle':
        if (a.phase !== 'do') a.t += dt;          // idle counts down even while stepping aside
        if (a.t > a.dur) this._endAct();
        if (Math.random() < dt * 0.15) { this.lookAt = this.root.position.clone().add(new THREE.Vector3(rand(-3, 3), 1.2, rand(-1, 2))); this.lookUntil = this.time + 1.6; }
        break;
      case 'groom':
        if (a.phase === 'do') { g.addNeed('groom', dt * 1.5); if (a.t > a.dur) { this.sitting = false; this._endAct(); } }
        break;
      case 'explore':
        if (a.phase === 'do' && a.t > a.dur) this._endAct();
        break;
      case 'perch':
        if (a.phase === 'do') {
          if (g.needs.energy < 55 && Math.random() < dt * 0.05) { const p = this.perch; this._setAct('nap', `Napping on ${p.name}`, { dur: rand(900, 1800), phase: 'do' }); this._enterSleep(); break; }
          if (a.t > a.dur) this.leave(() => this._endAct());
        }
        break;
      case 'nap':
        if (a.phase === 'do' && (a.t > a.dur || g.needs.energy > 96)) this.wake(this.inView);
        break;
      case 'window':
        if (a.phase === 'do') {
          this.lookAt = a.w.glass; this.lookUntil = this.time + 0.5;
          this._bird -= dt;
          if (this._bird <= 0) {
            this._bird = rand(4, 8);
            const day = new Date().getHours() >= 7 && new Date().getHours() < 19;
            if (day) {
              this.fx.spawn('bird', a.w.glass.clone().add(new THREE.Vector3(-0.8, rand(-0.3, 0.3), 0.05)), { vel: new THREE.Vector3(rand(0.4, 0.8), rand(-0.05, 0.1), 0) });
              setTimeout(() => { if (this.act === a) { this.react('perk'); if (this.inView) this.sound.chatter(); } }, 500);
              g.addNeed('play', 1.5);
            }
          }
          if (a.t > a.dur) { this.sitting = false; this._endAct(); }
        }
        break;
      case 'attention':
      case 'ask':
        if (a.phase === 'do') {
          this._chirpT -= dt;
          if (this._chirpT <= 0 && this.inView) {
            this._chirpT = rand(4, 7);
            if (a.id === 'ask') this.sound.meow({ pitch: 1.05, mood: 'question', vol: 0.55 }); else this.sound.chirp(1);
          }
          // Ask for food: after a while, lead the way to the bowl and wait there.
          if (a.id === 'ask' && a.what === 'food' && a.t > a.dur && this.room !== 1) {
            a.phase = 'go'; a.t = 0;
            this.goTo(1, this.house.feeding.food.stand, () => { if (this.act === a) { a.phase = 'do'; this.sitting = true; this.status = 'Waiting by its empty bowl'; } });
          } else if (a.t > a.dur * 2) this._endAct();
          if (a.what === 'food' && g.s.bowl.food > 5) this._endAct();
          if (a.what === 'water' && g.s.bowl.water > 5) this._endAct();
          if (a.what === 'litter' && g.s.litter < 50) this._endAct();
        }
        break;
      case 'bowl':
        if (a.phase === 'do') {
          const got = a.kind === 'food' ? g.eatFromBowl(dt) : g.drink(dt);
          if (!this.isReacting('chew')) this.react('chew', { dur: 2.2 });
          if (this.inView && Math.random() < dt * 1.2) { if (a.kind === 'food') this.sound.munch(); }
          const full = a.kind === 'food' ? g.needs.food > 95 : g.needs.water > 95;
          if (!got || full || a.t > a.dur) {
            if (a.kind === 'food') { this.justAte = 1; g.addBond(0.5); }
            this.lookUntil = 0; this._faceTarget = null;
            this._endAct();
          }
        }
        break;
      case 'litter':
        if (a.phase === 'do') {
          if (a.t > 4.5 && !a.scratched) { a.scratched = true; this.react('sniff', { dur: 1.5 }); }
          if (a.t > a.dur) {
            g.useLitter();
            const lb = this.house.litterBox;
            this.sitting = false;
            a.phase = 'out';
            this._jumpTo(lb.front, () => {
              this.baseY = 0;
              this._endAct();
              if (Math.random() < 0.3) this._startZoomies();           // yes, "post-litter zoomies" are real
            });
          }
        }
        break;
      case 'tap':
        if (a.phase === 'do') {
          this.lookAt = this.house.tap.origin; this.lookUntil = this.time + 0.5;
          if (Math.random() < dt * 0.8) this.react('swat', { dur: 0.6 });
          g.addNeed('play', dt * 0.6);
          if (a.t > a.dur || !this.house.tap.on) { this.sitting = false; this._endAct(); }
        }
        break;
      case 'follow':
        break;
      case 'petted':
        if (this.time - this.touchedAt > 3) this._endAct();
        break;
      default:
    }
  }

  // ======================================================================
  // You and the cat
  // ======================================================================
  /** You moved to another room. Somalis tend to follow their people around. */
  setViewRoom(i) {
    this.viewRoom = i;
    if (this.sleeping || this.jump) return;
    const interruptible = !this.act || this.act.interruptible;
    const chance = this.game.bond < 30 ? 0.3 : this.game.bond < 60 ? 0.75 : 0.92;
    if (interruptible && i !== this.room && Math.random() < chance) {
      setTimeout(() => {
        if (this.viewRoom !== i || this.sleeping || (this.act && !this.act.interruptible)) return;
        this.stop();
        this._setAct('follow', 'Following you', {}, true);
        this.goTo(i, this.frontOf(i), () => this._endAct(), 1.2);
      }, rand(600, 2200));
    }
  }

  /** Greeting when you come back after a while: comes over, chirps, rubs its head. */
  greet() {
    if (this.sleeping && this.game.bond < 50) return;
    this.interrupt(true);
    this._setAct('greet', 'Saying hello', { dur: 6 });
    this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => {
      if (!this.act) return;
      this.act.phase = 'do';
      this.sound.chirp(3);
      this.react('bunt'); this.react('love');
      setTimeout(() => this._endAct(), 5000);
    }, 1.2);
  }

  /** A tap on the cat. region: head | body | belly | tail | leg */
  touch(region) {
    if (this.sleeping) {
      this.wake(true);
      this.game.addBond(-0.3);
      return 'wake';
    }
    this.touchedAt = this.time;
    const bond = this.game.bond;
    if (bond < 15 && region !== 'head') { this.react('flinch'); this._moveAway(); return 'shy'; }
    if (region === 'belly' && bond < 85) {
      // The classic trap: a belly on display is trust, not an invitation.
      this.overstim = Math.max(this.overstim, LIMIT);
      this._swat('Belly touched — most cats swat or "bunny-kick" when you touch the belly, even when they show it to you.');
      return 'swat';
    }
    this._addStim(region, 0.6);
    if (this.overstim >= LIMIT) { this._swat(); return 'swat'; }
    if (region === 'tail') {
      this.react('annoyed'); this.sound.meow({ pitch: 0.85, dur: 0.45, mood: 'angry', vol: 0.4 });
      this.onHint('Most cats don\'t like their tail being touched — try the cheeks and head instead.');
      return 'annoyed';
    }
    if (region === 'head' || region === 'body' || region === 'belly') {
      this._beingPetted();
      this.react('purr'); this.react('bunt', { dur: 1.6 });
      this._purr(2);
      this.game.count('petted'); this.game.addNeed('play', 1.5); this.game.addBond(0.4); this.game.addXp(1);
      if (Math.random() < 0.3) this.sound.chirp(1);
      return 'purr';
    }
    this.react('flinch');
    return 'flinch';
  }

  /** Continuous stroking on a region. */
  stroke(region, dt) {
    if (this.sleeping) return;
    this.touchedAt = this.time;
    if (this.game.bond < 15) { this.react('flinch'); this._moveAway(); return; }
    if (region === 'belly' && this.game.bond < 85) { this.touch('belly'); return; }
    this._beingPetted();
    this._addStim(region, dt);
    if (this.overstim >= LIMIT) { this._swat(); return; }
    if (this.overstim < WARN) {
      this._purr(1.2);
      if (!this.isReacting('purr')) this.react('purr', { dur: 2 });
      this.sitting = true;
      this._strokeAcc = (this._strokeAcc || 0) + dt;
      if (this._strokeAcc > 0.6) {
        this._strokeAcc = 0;
        this.fx.spawn('heart', this.headPosition(_v).add(new THREE.Vector3(0, 0.35, 0)));
        this.game.addNeed('play', 1); this.game.addBond(0.25); this.game.count('petted');
      }
    }
  }

  /** Stay put while being petted (until a few seconds after the hand stops). */
  _beingPetted() {
    if (this.act?.id === 'petted') return;
    if (!this.interrupt()) return;            // eating etc.: it keeps eating, you can still pet
    this._setAct('petted', 'Enjoying the attention', { phase: 'do' });
  }

  _addStim(region, k) {
    const rate = (TOLERANCE[region] ?? 20) * (1.4 - this.game.bond / 125);
    this.overstim = Math.min(120, this.overstim + rate * k);
    if (this.overstim >= WARN && !this.warned) {
      this.warned = true;
      this.onHint('Tail lashing and ears turning sideways = she\'s had enough. Stop petting now, or she\'ll swat.');
    }
  }

  _swat(hint) {
    this.react('swat'); this.react('annoyed');
    if (this.overstim > 100) { this.react('hiss'); this.sound.hiss(); }
    else this.sound.meow({ pitch: 0.8, dur: 0.35, mood: 'angry', vol: 0.45 });
    this.game.addBond(-1.5);
    this.overstim = 45;
    this.purring = 0;
    this.sound.purr(false);
    if (hint) this.onHint(hint);
    this.faceAwayUntil = this.time + 2.5;
    setTimeout(() => this._moveAway(), 800);
  }

  _moveAway() {
    if (this.perch || this.sleeping) return;
    const r = this.house.rooms[this.room];
    const p = new THREE.Vector3(rand(r.bounds.x0, r.bounds.x1), 0, rand(r.bounds.z0, r.bounds.z0 + 1.2));
    this.stop();
    this._setAct('idle', 'Wants some space', { dur: 8 });
    this.walk([p], null, 1.1);
  }

  _purr(seconds) {
    this.purring = Math.max(this.purring, seconds);
    this.sound.purr(true);
  }

  /** Slow-blink at the cat. Cats that trust you blink back (University of Sussex, 2020). */
  slowBlink() {
    if (!this.inView || this.sleeping) return 'away';
    this.lookAt = this.camera.position.clone(); this.lookUntil = this.time + 3;
    setTimeout(() => {
      if (this.game.bond >= 10 && this.overstim < WARN) {
        this.react('slowblink');
        if (!this._blinkBondAt || this.time - this._blinkBondAt > 15) { this._blinkBondAt = this.time; this.game.addBond(1.5); this.game.count('blinks'); }
      } else {
        this.faceAwayUntil = this.time + 1.5;
      }
    }, rand(700, 1300));
    return 'ok';
  }

  /** You spoke (realistic mode): ears swivel to you; it may chirp back or come over. */
  heard() {
    this.game.count('talked');
    if (this.sleeping) {
      this.react('perk', { dur: 1 });
      if (this.game.bond > 60 && Math.random() < 0.3) this.wake(true);
      return;
    }
    if (this.inView) {
      this.react('perk');
      this.lookAt = this.camera.position.clone(); this.lookUntil = this.time + 3;
      if (Math.random() < (this.game.bond > 50 ? 0.7 : 0.4)) setTimeout(() => this.sound.chirp(Math.random() < 0.5 ? 1 : 2), 500);
      this.game.addBond(0.2);
    } else if (this.game.bond > 35 && (!this.act || this.act.interruptible)) {
      this.stop();
      this._setAct('follow', 'Coming when called', {}, true);
      this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => { this._endAct(); this.sound.chirp(2); }, 1.3);
    }
  }

  /**
   * Hand-feed a treat. The cat comes to you if it isn't here (the treat bag
   * sound works on every cat). `onReady` fires when it's in front of you.
   */
  comeForTreat(onReady) {
    if (this.sleeping && this.game.bond < 40) return false;
    this.interrupt(true);
    this._setAct('treat', 'Coming for a treat', {}, false);
    this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => {
      this.lookAt = this.camera.position.clone(); this.lookUntil = this.time + 4;
      onReady?.();
      setTimeout(() => this._endAct(), 3500);
    }, 1.3);
    return true;
  }

  eatTreat(food) {
    this.react('chew');
    this.sound.munch();
    setTimeout(() => {
      if (food.like === 'love') { this.react('love'); this._purr(2.5); this.fx.spawn('heart', this.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), { count: 3 }); }
      else { this.react('nod'); }
      this.game.addBond(0.6);
    }, 1400);
  }

  refuse() { this.react('sniff', { dur: 1.2 }); setTimeout(() => this.react('headshake'), 1200); }

  /** Catnip: ~2 in 3 cats react (it's genetic). */
  catnip() {
    const s = this.game.s;
    if (s.catnipResponder == null) s.catnipResponder = Math.random() < 0.7;
    this.react('sniff', { dur: 1.5 });
    const head = this.headPosition(new THREE.Vector3());
    this.fx.spawn('catnip', head, { count: 6 });
    if (!s.catnipResponder) return false;
    setTimeout(() => {
      this.react('love'); this._purr(4); this.sound.trill(4, 1.3);
      this._startZoomies();
    }, 1500);
    return true;
  }

  // --- grooming / bath -------------------------------------------------------
  brush(point, dt, region) {
    if (this.sleeping) this.wake(false);
    this.interrupt();
    this.touchedAt = this.time;
    if (region === 'belly' || region === 'tail') { this._addStim(region, dt); if (this.overstim >= LIMIT) this._swat(); return; }
    this._addStim('head', dt * 1.3);                     // most cats enjoy being brushed
    if (this.overstim >= LIMIT) { this._swat(); return; }
    this.sitting = true;
    if (this.game.bond > 25) { this._purr(1); if (!this.isReacting('purr')) this.react('purr', { dur: 2 }); }
    this.game.addNeed('groom', dt * 9);
    this._furAcc = (this._furAcc || 0) + dt;
    if (this._furAcc > 0.15) { this._furAcc = 0; this.fx.spawn('fur', point, { count: 1 }); }
  }

  scrub(point) {
    if (this.sleeping) this.wake(false);
    this.interrupt(true);
    this.sitting = false;
    if (this.foam.length > 70) return false;
    const local = this.root.worldToLocal(point.clone());
    const rs = this.root.scale.x;
    this.fx.spawn('bubble', point, { count: 1, size: 0.12 });
    const s = new THREE.Sprite(this.fx._mat('bubble').clone());
    s.position.copy(local);
    s.scale.setScalar((0.16 + Math.random() * 0.12) / rs);
    s.renderOrder = 9;
    this.root.add(s);
    this.foam.push(s);
    // Most cats tolerate baths at best.
    if (!this.isReacting('annoyed') && Math.random() < 0.12) {
      this.react('annoyed'); this.sound.meow({ pitch: 0.8, dur: 0.7, mood: 'sad', vol: 0.5 });
    }
    this.sound.squish();
    return true;
  }

  rinse(dt) {
    this.wet = Math.min(1, this.wet + dt);
    const over = this.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.1, 0));
    for (let i = 0; i < 3; i += 1) {
      this.fx.spawn('drop', over.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.5)));
    }
    if (!this.isReacting('annoyed') && Math.random() < dt * 0.6) { this.react('annoyed'); this.sound.meow({ pitch: 0.75, dur: 0.8, mood: 'sad', vol: 0.5 }); }
    if (this.foam.length && Math.random() < dt * 12) {
      const s = this.foam.shift();
      this.fx.spawn('bubble', s.getWorldPosition(new THREE.Vector3()), { count: 1 });
      s.parent?.remove(s);
      return 1;
    }
    return 0;
  }

  shakeOff() {
    if (this.wet < 0.3) return;
    this.wet = 0;
    this.react('shake');
    this.fx.spawn('splash', this.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), { count: 30 });
    this.game.addBond(-0.5);              // it'll forgive you
    setTimeout(() => { this._endAct(); this._startGroom(); }, 1500);   // and immediately re-groom
  }

  // --- play --------------------------------------------------------------------
  /** Chase a moving target with real hunting stages: stalk → wiggle → pounce. */
  startChase(target, onReach, reach = 0.55, speed = 1.4) {
    if (this.sleeping && this.game.bond < 30) return false;
    this.interrupt(true);
    this.leave();
    this._setAct('play', 'Hunting!', {}, true);
    this.chase = { target, onReach, reach, speed, cool: 0, stage: 'run', stageT: 0 };
    return true;
  }

  stopChase() {
    this.chase = null; this.path = [];
    if (this.act?.id === 'play') this._endAct();
  }

  pounce() {
    this.react('hop', { dur: 0.55 });
    if (this.inView) this.sound.meow({ pitch: 1.35, dur: 0.2, mood: 'happy', vol: 0.3 });
  }

  /** Somalis are known to fetch: carry the ball back to you. */
  fetch(ball, onDrop) {
    this.chase = null;
    this.carry = ball;
    this._setAct('fetch', 'Bringing the ball back!', {}, false);
    this.walk([this.frontOf(this.viewRoom)], () => {
      this.carry = null;
      onDrop?.();
      this.sound.chirp(2);
      this.react('proud');
      this._endAct();
    }, 1.1);
  }

  celebrate() {
    this.react('proud'); this.react('hop');
    this.fx.spawn('star', this.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0)), { count: 6 });
    this.sound.levelUp();
  }

  lightsChanged(room, on) {
    if (!on && room === this.room && !this.sleeping && this.game.needs.energy < 85 && (!this.act || this.act.interruptible)) {
      this.interrupt();
      this._startNap(room);
    }
  }

  // ======================================================================
  // Per frame
  // ======================================================================
  update(dt) {
    this.time += dt;
    const t = this.time;

    // Overstimulation fades when you stop touching.
    if (t - this.touchedAt > 0.4) this.overstim = Math.max(0, this.overstim - dt * 10);
    if (this.overstim < 20) this.warned = false;
    if (this.purring > 0) { this.purring -= dt; if (this.purring <= 0) this.sound.purr(false); }

    // ---------------------------------------------------------------- jumping
    if (this.jump) {
      const j = this.jump;
      j.t += dt / j.dur;
      const k = Math.min(1, j.t);
      const e = k * k * (3 - 2 * k);
      this.root.position.x = j.from.x + (j.to.x - j.from.x) * e;
      this.root.position.z = j.from.z + (j.to.z - j.from.z) * e;
      this.baseY = j.from.y + (j.to.y - j.from.y) * e + Math.sin(k * Math.PI) * 0.45;
      this.root.rotation.y += angleDiff(this.root.rotation.y, j.yaw) * Math.min(1, dt * 10);
      if (k >= 1) {
        this.baseY = j.to.y;
        this.jump = null;
        j.then?.();
      }
    }

    // ---------------------------------------------------------------- chase (hunting)
    let crouch = 0;
    if (this.chase) {
      const c = this.chase;
      const target = c.target();
      if (target) {
        const d = Math.hypot(target.x - this.root.position.x, target.z - this.root.position.z);
        c.cool -= dt;
        c.stageT += dt;
        if (c.stage === 'run' && d < 1.5 && c.cool <= 0) { c.stage = 'stalk'; c.stageT = 0; }
        if (c.stage === 'stalk' && d < c.reach * 1.6) { c.stage = 'wiggle'; c.stageT = 0; }
        if (c.stage === 'wiggle' && c.stageT > 0.55) {
          c.stage = 'run'; c.cool = 0.9;
          this.pounce();
          // the pounce itself carries it onto the target
          const dir = new THREE.Vector3(target.x - this.root.position.x, 0, target.z - this.root.position.z);
          if (dir.lengthSq() > 0.0001) this.root.position.addScaledVector(dir, Math.min(1, 0.45 / Math.max(0.01, dir.length())));
          c.onReach?.();
        }
        if (c.stage === 'stalk' && c.stageT > 4) c.stage = 'wiggle';
        crouch = c.stage === 'stalk' ? 1 : c.stage === 'wiggle' ? 1 : 0;
        this.path = c.stage === 'wiggle' || d < c.reach * 0.7 ? [] : [target.clone().setY(0)];
        this.walkSpeed = c.stage === 'stalk' ? 0.35 : c.speed;
        this.lookAt = target; this.lookUntil = t + 0.2;
      }
    }

    // ---------------------------------------------------------------- locomotion
    let moving = false;
    const rigBusy = this.rig.busy;
    if (this.path.length && !rigBusy && !this.jump) {
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
        const step = this.speed * dt * Math.max(0.25, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
        this.root.position.x += (dx / dist) * Math.min(step, dist);
        this.root.position.z += (dz / dist) * Math.min(step, dist);
        moving = true;
      }
    } else if (!this.path.length) {
      this.speed = 0;
    }

    // Which room is the cat physically in (doorways are at the half-way x's).
    const rx = Math.max(0, Math.min(this.house.rooms.length - 1, Math.round(this.root.position.x / ROOM_W)));
    if (rx !== this.room) { this.room = rx; this.game.setCatRoom(rx); }

    // ---------------------------------------------------------------- the cat's own life
    if (!moving && !this.chase && !this.jump && !this.carry) {
      if (!this.act) this._decide();
      else this._runAct(dt);
    } else if (this.act && this.act.phase === 'do') {
      this._runAct(dt);
    }

    // ---------------------------------------------------------------- facing
    let turningInPlace = false;
    if (!moving && !rigBusy && !this.jump) {
      let desired;
      if (this._faceTarget && this.act?.id === 'bowl') {
        desired = Math.atan2(-(this._faceTarget.z - this.root.position.z), this._faceTarget.x - this.root.position.x);
      } else if (t < this.faceAwayUntil) {
        desired = Math.atan2(-(this.root.position.z - this.camera.position.z), this.root.position.x - this.camera.position.x);
      } else if (this.sleeping || this.act?.id === 'groom') {
        desired = undefined;          // stay as it settled
      } else if (this.act?.id === 'window' || this.act?.id === 'tap') {
        const p = this.act.id === 'window' ? this.act.w.glass : this.house.tap.origin;
        desired = Math.atan2(-(p.z - this.root.position.z), p.x - this.root.position.x);
      } else if (this.inView || this.act?.id === 'litter') {
        const tgt = this.lookAt && t < this.lookUntil ? this.lookAt : this.camera.position;
        desired = Math.atan2(-(tgt.z - this.root.position.z), tgt.x - this.root.position.x);
        if (!this.lookAt || t >= this.lookUntil) desired += Math.sin(t * 0.13) * 0.3;
      }
      if (desired !== undefined) {
        const d = angleDiff(this.root.rotation.y, desired);
        if (Math.abs(d) > 0.08) {
          this.root.rotation.y += d * Math.min(1, dt * 2.2);
          turningInPlace = Math.abs(d) > 0.5 && !this.sitting && !this.perch;
        }
      }
    }

    // ---------------------------------------------------------------- animation pose
    let pose = 'idle';
    let speed = this.speed;
    if (moving) pose = 'walk';
    else if (turningInPlace) { pose = 'walk'; speed = 0.25; }
    else if (this.sleeping) pose = 'rest';
    else if (this.sitting) pose = 'sit';
    this.rig.update(pose, 0, speed, dt);

    if (this.procedural) {
      this.procedural.intensity = this.sleeping ? 0.25 : 1;
      this.procedural.update(dt, { breathRate: this.sleeping ? 1.0 : 1.8 });
    }
    this._bodyLanguage(dt, crouch);
    this._applyReactions(dt);
    this._face(dt);
    this.root.position.y = this.baseY + this.hopY;

    // carried ball sits in the mouth
    if (this.carry) {
      const m = this.headPosition(_v).add(this.noseDir().multiplyScalar(0.28));
      m.y -= 0.18;
      this.carry.position.copy(m);
    }

    // ---------------------------------------------------------------- ambient effects
    if (this.sleeping && this.inView) {
      this._zzz -= dt;
      if (this._zzz <= 0) { this._zzz = 2.4; this.fx.spawn('zzz', this.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0))); }
    }
    if (this.game.needs.groom < 20 && !this.sleeping && this.inView) {
      this._fly -= dt;
      if (this._fly <= 0) { this._fly = 3; this.fx.spawn('fly', this.root.position, { orbit: this.root, life: 3 }); }
    }
  }

  /** Baseline tail/ear posture from the cat's state — what a cat owner reads at a glance. */
  _bodyLanguage(dt, crouch) {
    const B = this.bones; const t = this.time;
    const irritated = this.overstim >= WARN || this.isReacting('annoyed') || this.isReacting('swat');
    const hunting = crouch > 0 || this.act?.id === 'window' || this.act?.id === 'tap';
    const happy = !irritated && !this.sleeping && this.game.bond > 35 && (this.inView || this.act?.id === 'greet');
    const tail = B.tail;

    if (this.sleeping) {
      tail.forEach((b, i) => this._rot(b, 'side', -0.35 - i * 0.05));          // tail droops / wraps
      this._rot(B.head, 'side', -0.35); this._rot(B.neck, 'side', -0.15);
      this._rot(B.earL, 'fwd', 0.15); this._rot(B.earR, 'fwd', -0.15);
    } else if (irritated) {
      // Lashing tail, "airplane" ears.
      const w = this.overstim >= WARN ? (this.overstim - WARN) / (LIMIT - WARN) : 0.6;
      tail.forEach((b, i) => this._rot(b, 'up', Math.sin(t * 7 - i * 0.7) * (0.25 + 0.25 * w)));
      this._rot(B.earL, 'fwd', 0.55); this._rot(B.earR, 'fwd', -0.55);
      this._rot(B.earL, 'side', -0.25); this._rot(B.earR, 'side', -0.25);
    } else if (hunting) {
      // Focused: ears forward, the tip of the tail twitches.
      const tip = tail.slice(-2);
      tip.forEach((b, i) => this._rot(b, 'up', Math.sin(t * 14 + i) * 0.3));
      this._rot(B.earL, 'side', 0.2); this._rot(B.earR, 'side', 0.2);
    } else if (happy) {
      // Tail up with a gentle question-mark sway at the tip.
      const tip = tail[tail.length - 1];
      this._rot(tip, 'up', Math.sin(t * 1.5) * 0.25);
    }

    // Stalking crouch + the famous butt wiggle before a pounce.
    if (crouch) {
      this._rot(B.chest, 'side', -0.18);
      this._rot(B.head, 'side', 0.12);
      if (this.chase?.stage === 'wiggle') this._rot(B.hip, 'fwd', Math.sin(t * 22) * 0.12);
    }

    // Kneading while purring (sitting, trusting).
    if (this.purring > 0 && this.sitting && this.game.bond > 50) {
      this._rot(B.armL, 'side', Math.max(0, Math.sin(t * 5)) * 0.35);
      this._rot(B.armR, 'side', Math.max(0, Math.sin(t * 5 + Math.PI)) * 0.35);
    }

    // Grooming: head turned to the flank, licking.
    if (this.act?.id === 'groom' && this.act.phase === 'do' && !this.sleeping) {
      const s = this.act.side;
      const phase = Math.floor(this.act.t / 4) % 2;             // switch between flank and paw
      if (phase === 0) {
        this._rot(B.head, 'up', 1.0 * s); this._rot(B.neck, 'up', 0.4 * s);
        this._rot(B.head, 'side', -0.35 + Math.sin(t * 9) * 0.07);
      } else {
        this._rot(s > 0 ? B.armL : B.armR, 'side', 0.9);           // lift a paw, lick it, wash the face
        this._rot(B.head, 'side', -0.25 + Math.sin(t * 8) * 0.1);
        this._rot(B.head, 'up', 0.25 * s);
      }
    }
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
          this._rot(B.head, 'fwd', 0.18 * e);
          this._rot(B.head, 'side', -0.06 * e);
          break;
        case 'bunt':        // head-rub: cheek pushes side to side
          this._rot(B.head, 'fwd', Math.sin(s * 4) * 0.28 * e);
          this._rot(B.head, 'up', Math.sin(s * 4 + 1) * 0.2 * e);
          break;
        case 'swat': {
          const arm = B.armR || B.armL;
          const a = Math.sin(Math.min(1, k * 1.6) * Math.PI);
          this._rot(arm, 'side', 1.3 * a);
          this._rot(arm, 'up', 0.3 * a);
          this._rot(B.head, 'side', 0.12 * a);
          break;
        }
        case 'annoyed':
          this._rot(B.head, 'up', 0.35 * e);
          break;
        case 'hiss':
          this._rot(B.head, 'side', 0.2 * e);
          this._rot(B.earL, 'side', -0.8 * e); this._rot(B.earR, 'side', -0.8 * e);
          break;
        case 'flinch':
          this._rot(B.head, 'side', 0.2 * e); this._rot(B.chest, 'side', 0.1 * e);
          break;
        case 'yuck':
        case 'headshake':
          this._rot(B.head, 'up', Math.sin(s * 16) * 0.3 * e);
          break;
        case 'love':
        case 'proud':
          this._rot(B.head, 'side', 0.12 * e);
          break;
        case 'nod':
          this._rot(B.head, 'side', -Math.sin(k * Math.PI * 2) * 0.18);
          break;
        case 'chew':
          this._rot(B.head, 'side', (-0.5 + Math.sin(s * 12) * 0.06) * e);
          this._rot(B.neck, 'side', -0.3 * e);
          break;
        case 'sniff':
          this._rot(B.head, 'side', -0.35 * e);
          this._rot(B.head, 'up', Math.sin(s * 3) * 0.25 * e);
          break;
        case 'perk':
          this._rot(B.earL, 'side', 0.3 * e); this._rot(B.earR, 'side', 0.3 * e);
          this._rot(B.head, 'fwd', 0.18 * e);
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
          break;
        case 'hop':
          hop = Math.max(hop, Math.sin(k * Math.PI) * 0.3);
          break;
        default:
      }
      if (k >= 1) this.reactions.splice(i, 1);
    }
    this.hopY = hop;

    // Parrot mode only: head bobs along with the replayed voice.
    if (this.voice.state === 'talking') {
      this._rot(B.head, 'side', 0.05 - this.voice.level * 0.3);
    } else if (this.voice.state === 'hearing' && this.inView && !this.sleeping) {
      this._rot(B.earL, 'side', 0.25); this._rot(B.earR, 'side', 0.25);
      this._rot(B.head, 'fwd', 0.2);
    }
  }

  _face(dt) {
    const B = this.bones;
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blinkTimer = 3 + Math.random() * 5; this.blinkT = 0.16; }
    let open = 1;
    if (this.blinkT > 0) { this.blinkT -= dt; open = Math.abs(Math.cos((1 - this.blinkT / 0.16) * Math.PI)); }
    const rs = this.reactions;
    const has = (x) => rs.some((r) => r.type === x);
    const sb = rs.find((r) => r.type === 'slowblink');
    if (sb) open = Math.min(open, 1 - Math.sin(Math.min(1, sb.t / sb.dur) * Math.PI) * 0.95);   // a long, soft blink
    if (has('purr') || has('love') || has('bunt')) open = Math.min(open, 0.35);
    if (has('yawn') || this.sleeping) open = 0.06;
    if (this.act?.id === 'groom') open = Math.min(open, 0.45);
    if (has('annoyed') || has('swat')) open = Math.min(open, 0.6);
    if (has('surprise') || has('hiss') || (this.chase && this.chase.stage !== 'run') || has('perk')) open = Math.max(open, 1.2);
    this.eyeOpen += (open - this.eyeOpen) * Math.min(1, dt * 14);
    for (const eye of [B.eyeL, B.eyeR]) {
      if (!eye) continue;
      const idx = this.axes.get(eye).upIndex;
      const f = Math.max(0.06, this.eyeOpen);
      this.layer.scale(eye, idx === 0 ? f : 1, idx === 1 ? f : 1, idx === 2 ? f : 1);
    }

    if (this.tracker) {
      const busyFace = this.sleeping || has('chew') || has('swat') || has('shake') || this.act?.id === 'groom' || has('sniff');
      this.tracker.enabled = !busyFace;
      if (this.lookAt && this.time < this.lookUntil) this.tracker.setWorldTarget(this.lookAt);
      else if (!this.inView) this.tracker.setWorldTarget(this.root.position.clone().add(this.noseDir().multiplyScalar(3)).setY(1));
      else if (!this._pointerActive) this.tracker.setWorldTarget(this.camera.position);
      else this.tracker.setWorldTarget(null);
      this.tracker.update(dt);
    }
  }

  set pointerActive(v) { this._pointerActive = v; }
}
