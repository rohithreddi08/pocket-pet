// ============================================================================
// Hamster.js — a hamster living in its tank.
// ----------------------------------------------------------------------------
// Behaviour follows the RSPCA / Blue Cross care guides and hamster ethology:
//   · nocturnal: sleeps in its nest through the day, wakes at dusk
//   · runs kilometres on the wheel at night; scurries in short bursts, freezes,
//     stands up on its hind legs to sniff
//   · eats sitting up, stuffs its cheek pouches and hoards food in the nest
//   · burrows in deep bedding, rolls in a sand bath to clean its coat,
//     grooms its face, gnaws to wear down its teeth, pees in one corner
//   · prey animal: startles easily, may nip if woken or grabbed; trust grows
//     slowly (sniffing your hand, then taking food, then sitting on it)
//
// The model has no skeleton, so all motion is the whole body: bob, tilt,
// pitch up on the haunches, curl up (squash) to sleep, roll in the sand.
// It implements the same interface main.js and the UI use for cats and dogs.
// ============================================================================
import * as THREE from 'three';
import { applyCoat } from './coats.js';
import { activityAt } from '../state.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Load-time model setup: orient (nose +X), size, and a pivot at the haunches. */
export function buildHamsterModel(gltf, breed, coatId, length, scene) {
  const model = gltf.scene.clone(true);
  applyCoat(model, breed, coatId);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  model.rotation.y = Math.PI / 2;           // the model's nose points +Z
  model.scale.z = 0.82;                     // a touch rounder: real hamsters are ~2:1, the model ~3:1
  const inner = new THREE.Group(); inner.add(model);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const s = length / size.x;
  inner.scale.setScalar(s);
  inner.position.set(-box.min.x * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
  const body = new THREE.Group();           // pivot: rear-bottom, so pitching up = sitting up
  body.position.x = -length / 2;
  body.add(inner);
  const head = new THREE.Object3D();
  head.position.set(length * 0.88, size.y * s * 0.72, 0);
  body.add(head);
  const root = new THREE.Group();
  root.name = 'hamster';
  root.add(body);
  scene.add(root);
  const layer = { restore() {} };          // no bones → no pose layer
  return { root, layer, bones: { head: null, body, headPoint: head, height: size.y * s } };
}

export class Hamster {
  constructor({ root, house, fx, sound, voice, game, camera, length, growth }) {
    this.root = root;
    this.body = root.children[0];
    this.headPoint = this.body.children.find((o) => !o.isGroup);
    this.house = house; this.fx = fx; this.sound = sound; this.voice = voice; this.game = game; this.camera = camera;
    this.len = length;
    this.growth = growth;
    this.species = 'hamster';
    this.traits = game.traits();
    this.personality = game.pet.personality;
    this.name = game.s.name;

    // Interface shared with cats/dogs
    this.room = 0; this.travelling = false; this.outside = false;
    this.sleeping = false; this.sitting = false;
    this.status = ''; this.act = null; this.reactions = [];
    this.wet = 0; this.foamCount = 0; this.pointerActive = false;
    this.inView = true; this.onHint = null;

    // Motion
    this.heading = rand(-Math.PI, Math.PI);
    this.speed = 0;
    this.pose = { pitch: 0, roll: 0, squash: 0, sink: 0 };
    this.target = { pitch: 0, roll: 0, squash: 0, sink: 0 };
    this.t = 0; this.burst = 0; this.pause = 0;
    this.cheeks = 0;                           // food in the pouches (0..1), carried to the nest
    this._startle = 0;
    this._decideIn = 1;
    this._wheelSound = 0;

    const c = house.cage;
    this.floorY = c.floorY;
    // Start: asleep in the nest by day, out and about at night.
    const night = activityAt(new Date().getHours(), 'hamster') > 0.4;
    if (game.s.asleep || !night) {
      this._place(c.spots.nest); this._startSleep(true);
    } else {
      this._place(this._randomSpot());
    }
  }

  // ------------------------------------------------------------------ helpers
  get cage() { return this.house.cage; }
  _place(p) { this.root.position.set(p.x, this.floorY, p.z); }
  _randomSpot() {
    const b = this.cage.bounds;
    return new THREE.Vector3(rand(b.x0 + 0.5, b.x1 - 0.2), this.floorY, rand(b.z0, b.z1));
  }
  _fwd(v = new THREE.Vector3()) { return v.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }
  noseDir() { return this._fwd(); }
  headPosition(v = new THREE.Vector3()) { return this.headPoint.getWorldPosition(v); }
  _say(text) { this.status = text; }
  _hint(msg) { this.onHint?.(msg); }
  get _name() { return this.game.s.name || 'Your hamster'; }

  setViewRoom(i) { this.viewRoom = i; this.inView = i === 0; }

  // ------------------------------------------------------------------ activities
  _set(id, opts = {}) {
    this.act = { id, t: 0, interruptible: true, ...opts };
    this.sitting = false;
    this.target = { pitch: 0, roll: 0, squash: 0, sink: 0 };
    return this.act;
  }

  /** Walk (scurry) to p, then run done(). */
  _goTo(p, done, { fast = false } = {}) {
    this.goal = { p: p.clone().setY(this.floorY), done, fast };
  }

  _endAct() {
    if (this.act?.id === 'wheel') { this.cage.wheelDriven = false; }
    if (this.act?.id === 'sleep') { this.sleeping = false; this.game.setAsleep(false); }
    this.act = null; this.goal = null; this.status = '';
    this.target = { pitch: 0, roll: 0, squash: 0, sink: 0 };
    this._decideIn = rand(0.6, 2);
  }

  interrupt(force = false) {
    if (!this.act) return true;
    if (!force && this.act.interruptible === false) return false;
    if (this.act.id === 'sleep') return false;          // you can't "interrupt" a sleeping hamster nicely
    this._endAct();
    return true;
  }

  stop() { this.goal = null; this.speed = 0; }

  _decide() {
    const n = this.game.needs;
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const active = activityAt(hour, 'hamster');
    const s = this.cage.spots;
    // Toilet first.
    if (this.game.s.bladder < 0) {
      this._set('toilet');
      this._say('Going to the toilet corner');
      this._goTo(s.toilet, () => { this.act.phase = 'go'; this.act.t = 0; });
      return;
    }
    // Carrying food → hoard it in the nest.
    if (this.cheeks > 0.3) { this._startHoard(); return; }
    // Day: sleep (hamsters sleep in several bouts but mostly through the day).
    if ((active < 0.3 && Math.random() < 0.85) || n.energy < 18) { this._goSleep(); return; }
    const opts = [];
    if (n.food < 70 && this.game.s.bowl.food > 2) opts.push(['eat', 4 + (70 - n.food) / 10]);
    if (n.water < 70 && this.game.s.bowl.water > 2) opts.push(['drink', 3 + (70 - n.water) / 10]);
    opts.push(['wheel', 2 + (100 - n.play) / 25 * this.traits.energy]);
    opts.push(['explore', 3]);
    opts.push(['burrow', 1.4]);
    opts.push(['groom', 1.2]);
    opts.push(['chew', 1]);
    if (n.groom < 80) opts.push(['sand', 1 + (80 - n.groom) / 25]);
    if (n.energy < 40) opts.push(['sleep', 2]);
    let total = opts.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    let choice = 'explore';
    for (const [id, w] of opts) { r -= w; if (r <= 0) { choice = id; break; } }
    total = 0;
    ({
      eat: () => this._startBowl('food'),
      drink: () => this._startBowl('water'),
      wheel: () => this._startWheel(),
      explore: () => this._startExplore(),
      burrow: () => this._startBurrow(),
      groom: () => this._startGroom(),
      chew: () => this._startChew(),
      sand: () => this._startSand(),
      sleep: () => this._goSleep(),
    })[choice]();
  }

  _startBowl(kind = 'food') {
    if (this.sleeping) return;
    const s = this.cage.spots;
    if (kind === 'water') {
      this._set('drink');
      this._say('Heading for the water bottle');
      this._goTo(s.bottle, () => { this.heading = Math.PI / 2; this.act.phase = 'drink'; this.act.t = 0; this._say('Drinking from the bottle'); });
      return;
    }
    this._set('eat');
    this._say('Sniffing out food');
    this._goTo(s.bowl, () => { this.act.phase = 'eat'; this.act.t = 0; this._say('Eating, sitting up on her haunches'.replace('her', this._pos())); });
  }

  _pos() { return this.game.pet.sex === 'male' ? 'his' : 'her'; }

  _startHoard() {
    this._set('hoard');
    this._say('Carrying food in the cheek pouches…');
    this._goTo(this.cage.spots.door, () => this._goTo(this.cage.spots.nest, () => {
      this.act.phase = 'empty'; this.act.t = 0; this._say('Hoarding food in the nest 🏠');
    }));
  }

  _startWheel() {
    this._set('wheel', { dur: rand(25, 70) });
    this._say('Off to the wheel');
    this._goTo(this.cage.spots.wheelFront, () => {
      this._place(this.cage.spots.wheel);
      this.root.position.y = this.cage.spots.wheel.y;
      this.heading = 0;
      this.act.phase = 'run'; this.act.t = 0;
      this.cage.wheelDriven = true;
      this._say('Running on the wheel 🎡');
    });
  }

  _startExplore() {
    this._set('explore', { hops: Math.floor(rand(2, 5)) });
    this._say(pick(['Exploring the tank', 'Patrolling', 'Sniffing around']));
    this._nextHop();
  }
  _nextHop() {
    const a = this.act;
    if (!a || a.hops-- <= 0) { this._endAct(); return; }
    a.phase = null;
    this._goTo(this._randomSpot(), () => {
      a.phase = Math.random() < 0.5 ? 'standup' : 'freeze'; a.t = 0; a.dur = rand(1.2, 3);
      this._say(a.phase === 'standup' ? 'Standing up to sniff the air' : 'Freezing, listening…');
    });
  }

  _startBurrow() {
    this._set('burrow', { dur: rand(6, 14) });
    this._say('Digging in the bedding');
    this._goTo(this._randomSpot(), () => { this.act.phase = 'dig'; this.act.t = 0; });
  }

  _startGroom() {
    this._set('groom', { dur: rand(4, 8) });
    this.act.phase = 'groom';
    this._say('Washing face and ears with the front paws');
  }

  _startChew() {
    this._set('chew', { dur: rand(5, 10) });
    this._say('Off to gnaw');
    this._goTo(this.cage.spots.chew, () => { this.act.phase = 'chew'; this.act.t = 0; this._say('Gnawing the chew stick — keeps the teeth short'); });
  }

  _startSand() {
    this._set('sand', { dur: rand(5, 9) });
    this._say('Heading to the sand bath');
    this._goTo(this.cage.spots.sand, () => {
      this.root.position.y = this.cage.spots.sand.y;
      this.act.phase = 'roll'; this.act.t = 0; this._say('Rolling in the sand bath — that\'s how hamsters clean their fur');
    });
  }

  _goSleep() {
    this._set('sleep-walk');
    this._say('Heading to the nest');
    this._goTo(this.cage.spots.door, () => this._goTo(this.cage.spots.nest, () => this._startSleep()));
  }

  _startSleep(instant = false) {
    this._set('sleep', { interruptible: false });
    this.sleeping = true;
    this.game.setAsleep(true);
    this.game.count('slept');
    this._say('Asleep, curled up in the nest 💤');
    if (instant) this.pose = { pitch: 0, roll: 0, squash: 1, sink: 0 };
  }

  /** Focus mode / "nap": hamsters nap in the nest. */
  _startNap() { if (!this.sleeping) this._goSleep(); }

  wake(force = false) {
    if (!this.sleeping) return;
    this._endAct();
    if (!force) this._decideIn = 0.5;
  }

  // ------------------------------------------------------------------ you
  /** Tap. Returns 'shy' when it doesn't trust you yet. */
  touch() {
    if (this.sleeping) {
      // Waking a hamster suddenly is the classic way to get bitten.
      this.wake(true);
      this.sound.squeak(2);
      this.game.addBond(-2);
      this._flinch();
      this._hint(`Hamsters sleep by day — waking one suddenly scares it, and that's when they nip. Let ${this._name} wake up by ${this._obj()}self in the evening.`);
      if (this.game.bond < 45) { this.status = 'Woke up startled — nipped your finger! 🩹'; this._fleeToNest(); }
      return 'startled';
    }
    if (this.game.bond < 25 || this.traits.cuddly < 0.2) {
      this._flinch();
      this.sound.squeak();
      this._fleeToNest();
      return 'shy';
    }
    this.interrupt(true);
    this._set('sniffhand', { dur: 2.5 });
    this.act.phase = 'standup';
    this._turnToFront();
    this._say('Sniffing your fingers');
    this.game.addBond(0.4);
    this.game.count('petted');
    return 'ok';
  }

  _obj() { return this.game.pet.sex === 'male' ? 'him' : 'her'; }

  /** Stroke along the back. */
  stroke(region, dt) {
    if (this.sleeping) { this.touch(); return; }
    if (this.game.bond < 40) {
      if (this.act?.id !== 'flee') { this._flinch(); this._fleeToNest(); this._hint('Not ready for that yet — let her come to you and sniff your hand, then offer treats from your palm.'.replace('her', this._obj())); }
      return;
    }
    if (this.act?.id !== 'stroked') { this.interrupt(true); this._set('stroked', { dur: 1.5 }); this.act.phase = 'still'; }
    this.act.t = 0;
    this._say('Sitting still for a gentle stroke');
    this.game.addBond(dt * 0.5);
  }

  _turnToFront() {
    const to = this.camera.position.clone().sub(this.root.position);
    this.heading = Math.atan2(-to.z, to.x);
  }

  _flinch() { this._startle = 1; }

  _fleeToNest() {
    this._set('flee', { interruptible: false });
    this._say('Bolted into the hide');
    this._goTo(this.cage.spots.door, () => this._goTo(this.cage.spots.nest, () => {
      this.act.phase = 'hide'; this.act.t = 0; this.act.dur = rand(6, 12); this._say('Hiding in the nest');
    }, { fast: true }), { fast: true });
  }

  /** Treat from your hand: it comes to the front glass and takes it. */
  comeForTreat(give) {
    if (this.sleeping) return false;
    this.interrupt(true);
    this._set('treat', { interruptible: false });
    this._say('Smelled a treat!');
    this._goTo(this.cage.spots.front, () => {
      this._turnToFront();
      this.act.phase = 'beg'; this.act.t = 0;
      if (this.game.bond < 20) this._hint('Shy hamsters take treats faster if you hold them still and let them come to you.');
      give();
    });
    return true;
  }

  eatTreat(f) {
    if (!this.act || this.act.id !== 'treat') this._set('treat', { interruptible: false });
    this.act.phase = 'pouch'; this.act.t = 0;
    this.cheeks = Math.min(1, this.cheeks + 0.5);
    this.sound.crunch();
    this.game.addBond(0.8);
    this._say(`Stuffing the ${f.name.toLowerCase().split(' (')[0]} into the cheek pouches`);
  }

  /** "Offer your hand" (the button cats use for slow blinks). */
  call() {
    if (this.sleeping) return 'asleep';
    if (this.game.bond < 15 && Math.random() < 0.5) { this._flinch(); this._say('Froze, unsure about your hand'); return 'ignored'; }
    this.interrupt(true);
    this._set('sniffhand', { dur: 3 });
    this._goTo(this.cage.spots.front, () => { this._turnToFront(); this.act.phase = 'standup'; this.act.t = 0; this._say('Sniffing your hand 👃'); });
    this.game.addBond(0.6);
    this.game.count('blinks');
    return 'ok';
  }
  slowBlink() { const r = this.call(); return r === 'ok' ? 'ok' : 'away'; }

  greet() {
    if (this.sleeping) return;
    this.interrupt(true);
    this._set('greet', { dur: 2 });
    this._goTo(this.cage.spots.front, () => { this._turnToFront(); this.act.phase = 'standup'; this.act.t = 0; this._say('Came to the glass to see you'); });
  }

  heard() {
    if (this.sleeping) return;
    this.game.count('talked');
    if (this.act?.phase === 'run' || this.act?.id === 'flee') return;
    this.target.pitch = 0.75;
    this._heardT = 1.5;
    this._say('Ears up — listening to your voice');
  }

  beg() {
    if (this.sleeping || this.outside) return;
    if (!this.act || this.act.interruptible) {
      this.interrupt(true);
      this._set('greet', { dur: 2.5 });
      this._goTo(this.cage.spots.front, () => { this._turnToFront(); this.act.phase = 'standup'; this.act.t = 0; this._say('Smells the vegetables you\'re chopping'); });
    }
  }

  lightsChanged() { /* the tank lives in the living room; day/night comes from the clock */ }
  refuse() { this._say('Not interested'); }
  celebrate() { if (!this.sleeping) { this._hop = 0.4; } }
  react() {}
  catnip() { return false; }
  // Not for hamsters: no baths (sand only), no brushing, no balls or lasers, no walks.
  brush() { return false; }
  scrub() { return false; }
  rinse() { return false; }
  shakeOff() {}
  startChase() {}
  stopChase() {}
  fetch() {}
  goOut(cb) { cb?.(); }
  comeHome(cb) { cb?.(); }
  doTrick(id, done) { done?.(false); return false; }
  goToRoom(room, then) { if (room === 0) then?.(); }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    this.t += dt;
    if (this.viewRoom == null) this.setViewRoom(0);
    const a = this.act;

    if (!a) {
      this._decideIn -= dt;
      if (this._decideIn <= 0) this._decide();
    }

    // Moving: short bursts and freezes, like a real hamster.
    let moving = false;
    if (this.goal) {
      const to = this.goal.p.clone().sub(this.root.position).setY(0);
      const d = to.length();
      const want = Math.atan2(-to.z, to.x);
      let diff = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.heading += diff * Math.min(1, dt * 10);
      if (this.pause > 0) { this.pause -= dt; this.speed = 0; } else {
        const top = this.len * (this.goal.fast ? 5 : 3);
        this.speed += (top - this.speed) * Math.min(1, dt * 8);
        this.burst -= dt;
        if (this.burst <= 0 && !this.goal.fast) { this.burst = rand(0.4, 1.4); if (Math.random() < 0.4 && d > this.len * 2) this.pause = rand(0.2, 0.8); }
      }
      if (Math.abs(diff) > 1.2) this.speed *= 0.5;
      const step = Math.min(d, this.speed * dt);
      if (d > 0.001) this.root.position.addScaledVector(to.normalize(), step);
      this.root.position.y = this.floorY;
      moving = this.speed > 0.02 && this.pause <= 0;
      if (d < this.len * 0.15) { const done = this.goal.done; this.goal = null; this.speed = 0; done?.(); }
    } else {
      this.speed = 0;
    }

    // Activity phases.
    const T = { pitch: 0, roll: 0, squash: 0, sink: 0 };
    let bob = 0; let jitter = 0;
    if (a) {
      a.t += dt;
      const g = this.game;
      switch (a.phase) {
        case 'eat':
          T.pitch = 0.7; jitter = 0.4;
          if (Math.floor(a.t * 3) !== Math.floor((a.t - dt) * 3)) this.sound.crunch();
          g.eatFromBowl(dt * 0.6);
          this.cheeks = Math.min(1, this.cheeks + dt * 0.05);
          if (a.t > 8 || g.needs.food > 96 || g.s.bowl.food <= 0) {
            this.game.count('fed');
            if (g.s.bowl.food > 5 && Math.random() < 0.6) { this.cheeks = 0.8; this._startHoard(); } else this._endAct();
          }
          break;
        case 'drink':
          T.pitch = 0.5; jitter = 0.15;
          g.drink(dt * 0.5);
          if (a.t > 4 || g.needs.water > 97) this._endAct();
          break;
        case 'empty':
          T.pitch = 0.2; jitter = 0.5;
          if (a.t > 2.5) { this.cheeks = 0; this._endAct(); }
          break;
        case 'run': {
          const sp = 9 + this.traits.energy * 5;
          this.cage.wheelSpin = sp;
          bob = Math.abs(Math.sin(this.t * sp * 1.2)) * this.len * 0.05;
          T.pitch = 0.08;
          g.addNeed('play', dt * 1.2); g.addNeed('energy', -dt * 0.25);
          this._wheelSound -= dt;
          if (this._wheelSound <= 0) { this._wheelSound = 0.45; this.sound.wheel(); }
          if (a.t > a.dur) { this.cage.wheelDriven = false; this._place(this.cage.spots.wheelFront); this._endAct(); }
          break;
        }
        case 'standup':
          T.pitch = 1.05; jitter = 0.25;
          if (a.t > (a.dur || 2.5)) { if (a.id === 'explore') this._nextHop(); else this._endAct(); }
          break;
        case 'freeze':
          if (a.t > (a.dur || 1.5)) this._nextHop();
          break;
        case 'dig':
          T.sink = 0.35 + Math.sin(a.t * 2) * 0.1; T.pitch = -0.25; jitter = 0.8;
          if (Math.random() < dt * 6) this.fx.spawn('crumb', this.headPosition(new THREE.Vector3()), { count: 1 });
          g.addNeed('play', dt * 0.4);
          if (a.t > a.dur) this._endAct();
          break;
        case 'groom':
          T.pitch = 0.9; jitter = 0.9;
          g.addNeed('groom', dt * 0.3);
          if (a.t > a.dur) this._endAct();
          break;
        case 'chew':
          T.pitch = -0.1; jitter = 0.6;
          if (Math.floor(a.t * 2) !== Math.floor((a.t - dt) * 2)) this.sound.crunch();
          g.addNeed('play', dt * 0.3);
          if (a.t > a.dur) this._endAct();
          break;
        case 'roll':
          T.roll = Math.sin(a.t * 5) * 1.3; T.squash = 0.2;
          g.addNeed('groom', dt * 3);
          if (a.t > a.dur) { this.root.position.y = this.floorY; this._endAct(); }
          break;
        case 'go':
          T.sink = 0.05; T.pitch = -0.1;
          if (a.t > 3) { g.useLitter(); this._endAct(); }
          break;
        case 'beg':
          T.pitch = 1.0;
          if (a.t > 4) this._endAct();
          break;
        case 'pouch':
          T.pitch = 0.85; jitter = 0.7;
          if (a.t > 2.5) { this.cheeks > 0.3 ? this._startHoard() : this._endAct(); }
          break;
        case 'still':
          T.squash = 0.15;
          if (a.t > (a.dur || 1.5)) this._endAct();
          break;
        case 'hide':
          T.squash = 0.4;
          if (a.t > (a.dur || 8)) this._endAct();
          break;
        default:
          break;
      }
      if (a.id === 'sleep') {
        T.squash = 1;
        const n = g.needs;
        const active = activityAt(new Date().getHours(), 'hamster');
        // Wakes when rested and it's evening/night (or very hungry/thirsty).
        if ((n.energy > 92 && active > 0.35) || (a.t > 30 && (n.food < 15 || n.water < 15))) {
          this._endAct();
          this._say('Waking up, stretching and yawning');
          this._decideIn = 2;
        }
      }
      if ((a.id === 'greet' || a.id === 'sniffhand' || a.id === 'stroked') && !this.goal && !a.phase && a.t > 4) this._endAct();
    }
    if (this._heardT > 0) { this._heardT -= dt; T.pitch = Math.max(T.pitch, 0.75); }

    // Body: scurry bob, breathing, startle, ease toward the target pose.
    if (moving) bob = Math.abs(Math.sin(this.t * 26)) * this.len * 0.035;
    const breathe = Math.sin(this.t * (this.sleeping ? 4 : 9)) * 0.015;
    for (const k of Object.keys(T)) this.pose[k] += (T[k] - this.pose[k]) * Math.min(1, dt * (k === 'roll' ? 14 : 7));
    if (this._startle > 0) this._startle = Math.max(0, this._startle - dt * 2.5);
    if (this._hop > 0) this._hop -= dt;

    const p = this.pose;
    const body = this.body;
    body.rotation.set(p.roll, 0, p.pitch);
    const sq = p.squash;
    const jit = jitter ? Math.sin(this.t * 37) * 0.012 * jitter : 0;
    body.scale.set(1 - sq * 0.22 + jit, 1 - sq * 0.12 + breathe - this._startle * 0.15, 1 + sq * 0.12 + breathe * 0.5);
    body.position.y = bob - p.sink * this.len * 0.35 + (this._hop > 0 ? Math.sin((0.4 - this._hop) / 0.4 * Math.PI) * this.len * 0.4 : 0);
    // Sitting up pivots at the haunches: keep the rear on the floor.
    this.root.rotation.y = this.heading;
    this.sitting = p.pitch > 0.5;
    this.wet = 0;
  }
}
