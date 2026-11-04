// ============================================================================
// Dog.js — a dog's brain and body language, on top of the shared Pet body.
// ----------------------------------------------------------------------------
// Modelled on documented dog behaviour (AKC, ASPCA — see the Care Guide):
//
//  • Diurnal: dogs fit their people's day — active morning and evening,
//    asleep at night, ~12–14 h of sleep (puppies up to 18–20 h).
//  • Pack animals: follow their people almost everywhere, greet with a
//    whole-body wiggle, bring toys, beg politely (or not) at the kitchen.
//  • Toilet: needs walks. A dog asks at the door; puppies can only hold it a
//    short while. If nobody takes it out it uses the pee pad — or has an
//    accident (never punish: dogs can't link it to the scolding).
//  • Body language: tail height + wag speed, ears back/forward, head tilt when
//    listening; calming signals (lip lick, yawn, turning away) mean "enough".
//  • Most dogs enjoy belly rubs once they trust you; tails and paws less so.
//  • Learns tricks with positive reinforcement — reward within ~1–2 seconds.
//  • No laser pointers: vets warn they can trigger compulsive chasing in dogs.
// ============================================================================
import * as THREE from 'three';
import { Pet, WARN, LIMIT, rand, pick } from './Pet.js';
import { activityAt } from '../state.js';
import { normalizeName } from '../../../cat/BoneMap.js';

const DOG_TOLERANCE = { head: 3, body: 4, belly: 5, leg: 22, tail: 40 };

export const TRICKS = {
  sit:   { name: 'Sit',   icon: '🪑', cue: 'Sit!' },
  down:  { name: 'Down',  icon: '⬇️', cue: 'Down!' },
  paw:   { name: 'Paw',   icon: '🐾', cue: 'Paw!' },
  spin:  { name: 'Spin',  icon: '🌀', cue: 'Spin!' },
  speak: { name: 'Speak', icon: '🗣️', cue: 'Speak!' },
  come:  { name: 'Come',  icon: '📣', cue: 'Come!' },
};

export class Dog extends Pet {
  constructor(opts) {
    super(opts);
    this.species = 'dog';
    this.tolerance = DOG_TOLERANCE;
    this.voiceCfg = opts.game.breed.voice || { size: 0.6 };
    this.wag = 0.2;
    this.outside = false;
    this.lying = false;
    this.sitAmt = 0;
    this.sitCfg = { th: 0.6, front: -1, thigh: 1.2, shin: -1.8, tail: -0.5, drop: 0.5 };   // tuned by eye
    this.happyT = 0;

    // Extra bones for sitting / pawing (Quaternius-style names, but matched loosely).
    const find = (re) => {
      let hit = null;
      this.root.traverse((o) => { if (!hit && o.isBone && re.test(normalizeName(o.name))) hit = o; });
      return hit;
    };
    this.legs = {
      thighL: find(/\bback upper leg l\b/), thighR: find(/\bback upper leg r\b/),
      shinL: find(/\bback lower leg l\b/), shinR: find(/\bback lower leg r\b/),
      frontL: this.bones.armL, frontR: this.bones.armR,
    };
    for (const b of Object.values(this.legs)) if (b && !this.axes.has(b)) this.axes.set(b, this._axesFor(b));
    // Hip height at rest, for sitting down.
    const hip = this.bones.hip || this.root;
    this.hipH = hip.getWorldPosition(new THREE.Vector3()).y - this.root.position.y;
  }

  _warnHint() {
    return `Lip licking, yawning and turning the head away are a dog's polite “that's enough”. Give ${this.pron('obj')} some space.`;
  }

  // ======================================================================
  // Voice
  // ======================================================================
  say(kind) {
    const s = this.sound; const v = this.voiceCfg; const vocal = this.traits.vocal ?? 0.5;
    const size = this.stage === 'baby' ? Math.max(0.2, v.size - 0.3) : v.size;
    const talker = v.howler;              // huskies/malamutes "woo" instead of barking
    switch (kind) {
      case 'excited':
        if (talker) s.woo({ size }); else if (vocal > 0.35) s.bark({ size, n: 2 });
        break;
      case 'greet':
        s.whine({ size, dur: 0.5 });
        if (talker) setTimeout(() => s.woo({ size }), 500);
        else if (vocal > 0.4) setTimeout(() => s.bark({ size, n: 1, vol: 0.35 }), 500);
        break;
      case 'ask': s.whine({ size, dur: 0.8 }); break;
      case 'door': s.whine({ size, dur: 1.0 }); if (Math.random() < 0.3 && vocal > 0.4) setTimeout(() => s.bark({ size, n: 1, vol: 0.4 }), 1100); break;
      case 'chirp': case 'happy': s.huff({ size }); break;
      case 'reply': if (talker) s.woo({ size }); else if (Math.random() < vocal) s.bark({ size, n: 1, vol: 0.3 }); break;
      case 'watch': if (Math.random() < vocal) s.bark({ size, n: 2, vol: 0.5 }); break;
      case 'annoyed': s.growl({ size, dur: 0.6 }); break;
      case 'angry': case 'hiss': s.growl({ size, dur: 1.1 }); break;
      case 'protest': case 'protest2': s.whine({ size, dur: 0.7 }); break;
      case 'play': s.bark({ size, n: 1, vol: 0.4, play: true }); break;
      case 'proud': s.huff({ size }); break;
      case 'yawn': s.dogYawn({ size }); break;
      case 'howl': s.howl({ size }); break;
      case 'scream': s.shibaScream(); break;
      case 'speak': if (talker) s.woo({ size }); else s.bark({ size, n: 1, vol: 0.55 }); break;
      default:
    }
  }

  // ======================================================================
  // The dog's own life
  // ======================================================================
  _perches() { return this.house.perches.filter((p) => p.dog); }

  _decide() {
    if (this.outside) return;
    const g = this.game; const n = g.needs; const s = g.s; const b = s.bowl;
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const act = activityAt(hour, 'dog');
    const day = hour >= 7 && hour < 19;

    if (s.bladder <= 0) return this._startPotty();
    if (n.water < 35 && b.water > 5) return this._startBowl('water');
    if (n.food < 40 && b.food > 5) return this._startBowl('food');
    if (n.food < 30) return this._startAsk('food');
    if (n.water < 30) return this._startAsk('water');
    if (n.energy < 22) return this._startNap();

    const baby = this.stage === 'baby'; const senior = this.stage === 'senior';
    const ball = this.house.ball;
    const options = [
      ['nap', (1 - act) * 0.6 + (n.energy < 55 ? 0.45 : 0) + (this.house.rooms[this.room].lightsOn ? 0 : 0.4) + (baby || senior ? 0.25 : 0)],
      ['explore', act * 0.4],                                         // sniffing around
      ['attention', g.bond > 20 ? (n.play < 50 ? 0.55 : 0.25) * (this.traits.follow ?? 1) : 0.05],
      ['toy', n.play < 70 && g.bond > 30 && !ball.held ? 0.3 * this.traits.energy : 0],
      ['perch', g.bond > 40 ? 0.12 : 0],                              // up on the sofa
      ['window', day ? 0.15 : 0.03],
      ['zoomies', (act > 0.7 && n.energy > 65 ? 0.1 : 0.01) * (baby ? 3 : senior ? 0.2 : 1)],
      ['chew', baby ? 0.3 : 0.15],
      ['howl', this.voiceCfg.howler ? 0.025 : 0],
      ['idle', 0.35],
    ];
    const total = options.reduce((t, [, w]) => t + w, 0);
    let r = Math.random() * total; let choice = 'idle';
    for (const [id, w] of options) { r -= w; if (r <= 0) { choice = id; break; } }
    switch (choice) {
      case 'nap': return this._startNap();
      case 'explore': return this._startExplore();
      case 'attention': return this._startAttention();
      case 'toy': return this._startToy();
      case 'perch': return this._startPerch();
      case 'window': return this._startWindow();
      case 'zoomies': return this._startZoomies();
      case 'chew': return this._startChew();
      case 'howl': return this._startHowl();
      default: return this._startIdle();
    }
  }

  _startIdle() {
    this._setAct('idle', this.inView ? 'Hanging out with you' : 'Relaxing', { dur: rand(6, 14) });
    this.sitting = Math.random() < 0.5;
    this.lying = !this.sitting && Math.random() < 0.3;
  }

  _startChew() {
    this._setAct('chew', 'Chewing a toy', { dur: rand(20, 45) });
    const r = this.house.rooms[this.room];
    const p = new THREE.Vector3(rand(r.bounds.x0 + 0.5, r.bounds.x1 - 0.5), 0, rand(-0.6, 0.8));
    this.walk([p], () => { if (this.act?.id === 'chew') { this.act.phase = 'do'; this.sitting = true; } });
  }

  _startHowl() {
    this._setAct('howl', 'Howling along to something only dogs can hear', { dur: 4 });
    this.sitting = true; this.act.phase = 'do';
    if (this.inView || Math.random() < 0.5) this.say('howl');
  }

  /** Fetch the ball and bring it to you — an invitation to play. */
  _startToy() {
    const ball = this.house.ball;
    this._setAct('toy', 'Fetching a toy', {});
    this.goTo(ball.room, ball.mesh.position.clone().setY(0), () => {
      if (this.act?.id !== 'toy' || ball.held) { this._endAct(); return; }
      ball.held = true; ball.vel.set(0, 0, 0);
      this.carry = ball.mesh;
      this.status = 'Bringing you a toy';
      this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => {
        this.carry = null;
        ball.held = false;
        ball.mesh.position.y = ball.r;
        ball.room = this.room;
        if (this.act?.id === 'toy') {
          this.act.phase = 'do'; this.act.dur = 12;
          this.status = 'Dropped the ball at your feet — throw it!';
          this.say('play'); this.react('hop');
        }
      }, 1.1);
    }, 1.2);
  }

  // --- toilet --------------------------------------------------------------
  _startPotty() {
    const s = this.game.s;
    const canHold = this.stage === 'baby' ? -8 : this.stage === 'senior' ? -15 : -30;
    if (s.bladder > canHold) return this._startDoor();
    // Can't hold it any longer.
    const lb = this.house.litterBox;
    if (s.litter < 80) {
      this._setAct('potty', 'Using the pee pad', { dur: 6 }, false);
      this.goTo(2, lb.front, () => this.walk([lb.inside.clone().setY(0)], () => { if (this.act) this.act.phase = 'do'; }, 0.5));
    } else {
      // Accident. It happens; scolding afterwards only teaches fear.
      this._setAct('potty', 'Had an accident…', { dur: 4, accident: true, phase: 'do' }, false);
      this.game.setAccident({ room: this.room, x: this.root.position.x, z: this.root.position.z + 0.2 });
      this.game.s.bladder = this.game.nextBladder();
      this.react('flinch', { dur: 1.5 });
      this.onHint(`Accident! ${this.name} couldn't hold it any longer. Clean it up (tap the puddle) — and don't scold: dogs can't connect punishment to something they did earlier. More walks or a clean pad prevent it.`);
    }
  }

  _startDoor() {
    const d = this.house.frontDoor;
    this._setAct('door', 'Waiting by the front door — needs to go out!', { dur: 9999 });
    this.goTo(0, d.inside, () => {
      if (this.act?.id !== 'door') return;
      this.act.phase = 'do'; this.sitting = true;
      this._faceTo(d.face);
      if (this.inView) this.say('door');
    });
  }

  // --- walks ---------------------------------------------------------------
  /** Head out of the front door with you. */
  goOut(onGone) {
    this.interrupt(true);
    const d = this.house.frontDoor;
    this._setAct('walkout', 'Excited — going for a walk!', {}, false);
    this.react('hop'); this.say('excited');
    this.goTo(0, d.inside, () => {
      this._faceTo(d.face);
      this.house.openDoor(true);
      this.walk([d.outside], () => {
        this.root.visible = false;
        this.outside = true;
        this.game.setOut(true);
        this.house.openDoor(false);
        this._endAct();
        onGone?.();
      }, 0.8);
    }, 1.3);
  }

  /** Back home: shake off, drink, settle. */
  comeHome(onBack) {
    const d = this.house.frontDoor;
    this.root.position.copy(d.outside).setY(0);
    this.root.rotation.y = 0;
    this.root.visible = true;
    this.outside = false;
    this.room = 0;
    this.game.setCatRoom(0);
    this.game.setOut(false);
    this.house.openDoor(true);
    this._setAct('walkin', 'Home again!', {}, false);
    this.walk([d.inside, this.frontOf(0)], () => {
      this.house.openDoor(false);
      this.react('shake');
      this._endAct();
      onBack?.();
    }, 0.9);
  }

  // --- interaction ---------------------------------------------------------
  touch(region) {
    if (this.outside) return 'away';
    if (this.sleeping) {
      this.wake(true);
      this.game.addBond(-0.1);                 // dogs forgive this easily
      this.wag = 0.8;
      return 'wake';
    }
    this.touchedAt = this.time;
    const bond = this.game.bond;
    if (bond < 12 && region !== 'head') { this.react('flinch'); this.react('lick', { dur: 0.8 }); this._moveAway(); return 'shy'; }
    if (region === 'belly') {
      if (bond < 30) {
        this.react('flinch'); this.react('lick', { dur: 0.8 });
        this.onHint(`${this.name} isn't sure yet — a dog rolls over for belly rubs when it trusts you. Start with the chest and chin.`);
        return 'flinch';
      }
      this._beingPetted();
      this.lying = true;                        // flops down for a belly rub
      this.react('love'); this._purr(3);
      this.game.count('petted'); this.game.addNeed('play', 2); this.game.addBond(0.6); this.game.addXp(1);
      this.fx.spawn('heart', this.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0)));
      return 'purr';
    }
    this._addStim(region, 0.6);
    if (this.overstim >= LIMIT) { this._swat(); return 'swat'; }
    if (region === 'tail') {
      this.react('annoyed'); this.say('annoyed');
      this.onHint('Most dogs don\'t like their tail or paws grabbed — chest, chin, shoulders and ears are favourites.');
      return 'annoyed';
    }
    this._beingPetted();
    this.react('purr'); this.react('lick', { dur: 0.8 });
    this._purr(2);
    this.game.count('petted'); this.game.addNeed('play', 1.5); this.game.addBond(0.4); this.game.addXp(1);
    if (Math.random() < 0.25) this.say('happy');
    return 'purr';
  }

  /** Dogs show happiness by wagging and leaning in (no purr). */
  _purr(seconds) { this.happyT = Math.max(this.happyT, seconds); this.purring = 0; }

  _swat(hint) {
    // A dog that's had enough: freezes, lip-licks, turns away; growls if pushed.
    this.react(this.overstim > 100 ? 'growl' : 'lick', { dur: 1 });
    if (this.overstim > 100) this.say('annoyed');
    this.game.addBond(-1);
    this.overstim = 45;
    this.happyT = 0;
    if (hint) this.onHint(hint);
    else this.onHint(this._warnHint());
    this.faceAwayUntil = this.time + 2;
    setTimeout(() => this._moveAway(), 700);
  }

  stroke(region, dt) {
    if (this.sleeping || this.outside) return;
    if (region === 'belly' && this.game.bond >= 30) {
      this.touchedAt = this.time;
      this._beingPetted();
      this.lying = true;
      this._addStim('belly', dt);
      this._purr(1.5);
      this._strokeAcc = (this._strokeAcc || 0) + dt;
      if (this._strokeAcc > 0.6) {
        this._strokeAcc = 0;
        this.fx.spawn('heart', this.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0)));
        this.game.addNeed('play', 1); this.game.addBond(0.25); this.game.count('petted');
      }
      return;
    }
    super.stroke(region, dt);
  }

  /** "Call" button: dogs come when called (if they trust you / know "come"). */
  call() {
    if (this.outside) return 'away';
    const know = (this.game.s.tricks.come || 0) / 100;
    const p = Math.min(0.97, 0.35 + this.game.bond / 140 + know * 0.4) * (this.traits.independent > 0.8 ? 0.75 : 1);
    if (this.sleeping) { if (Math.random() < p * 0.6) this.wake(true); else return 'sleep'; }
    if (Math.random() > p) { this.react('tilt'); this.lookAt = this.camera.position.clone(); this.lookUntil = this.time + 2; return 'ignored'; }
    this.interrupt(true);
    this.wag = 1;
    if (this.inView) {
      this.react('tilt'); this.react('hop', { dur: 0.5 });
      this.walk([this.frontOf(this.viewRoom)], null, 1.3);
    } else {
      this._setAct('follow', 'Coming when called', {}, true);
      this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => { this._endAct(); this.say('greet'); }, 1.5);
    }
    this.game.addBond(0.3);
    return 'ok';
  }

  slowBlink() { return this.call(); }

  heard() {
    this.game.count('talked');
    if (this.outside) return;
    if (this.sleeping) {
      this.react('perk', { dur: 1 });
      if (this.game.bond > 40 && Math.random() < 0.5) this.wake(true);
      return;
    }
    if (this.inView) {
      this.react('perk'); this.react('tilt', { dur: 1.6 });       // the famous head tilt
      this.wag = Math.max(this.wag, 0.7);
      this.lookAt = this.camera.position.clone(); this.lookUntil = this.time + 3;
      if (Math.random() < 0.5) setTimeout(() => this.say('reply'), 500);
      this.game.addBond(0.2);
    } else if (this.game.bond > 25 && (!this.act || this.act.interruptible)) {
      this.stop();
      this._setAct('follow', 'Coming to find you', {}, true);
      this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => { this._endAct(); this.say('greet'); }, 1.4);
    }
  }

  greet() {
    if (this.outside) return;
    if (this.sleeping && this.game.bond < 30) return;
    this.interrupt(true);
    this._setAct('greet', 'So happy you\'re here!', { dur: 6 });
    this.wag = 1;
    this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => {
      if (!this.act) return;
      this.act.phase = 'do';
      this.say('greet');
      this.react('hop', { dur: 0.6 }); setTimeout(() => this.react('hop', { dur: 0.6 }), 700);
      this.react('love'); this.react('lick', { dur: 1.2 });
      setTimeout(() => this._endAct(), 5000);
    }, 1.5);
  }

  comeForTreat(onReady) {
    if (this.outside) return false;
    if (this.sleeping && this.game.bond < 20) return false;
    this.interrupt(true);
    this._setAct('treat', 'Coming for a treat!', {}, false);
    this.wag = 1;
    this.goTo(this.viewRoom, this.frontOf(this.viewRoom), () => {
      this.lookAt = this.camera.position.clone(); this.lookUntil = this.time + 4;
      // A dog that has learned "sit" offers it politely for food.
      if ((this.game.s.tricks.sit || 0) > 50) { this.sitting = true; this.status = 'Sitting politely for the treat'; }
      onReady?.();
      setTimeout(() => this._endAct(), 3000);
    }, 1.5);
    return true;
  }

  eatTreat(food) {
    this.react('chew', { dur: 1.2 });
    this.sound.munch();
    setTimeout(() => {
      this.react('love'); this.react('lick', { dur: 0.8 }); this.wag = 1;
      this.game.addBond(0.6);
    }, 900);
  }

  catnip() { return false; }

  /** Watch you cook: sits by the counter, staring. Begging is learned! */
  beg() {
    if (this.outside || this.sleeping || (this.act && !this.act.interruptible)) return;
    this.stop(); this._endAct();
    this._setAct('beg', 'Watching you cook… very closely', { dur: 40 });
    this.goTo(1, new THREE.Vector3(this.house.rooms[1].cx - 0.2, 0, -1.4), () => {
      if (this.act?.id !== 'beg') return;
      this.act.phase = 'do'; this.sitting = true;
      this.lookAt = new THREE.Vector3(this.house.rooms[1].cx + 0.1, 1.0, -2.6); this.lookUntil = this.time + 60;
    });
  }

  shakeOff() {
    if (this.wet < 0.3) return;
    this.wet = 0;
    this.react('shake');
    this.fx.spawn('splash', this.root.position.clone().add(new THREE.Vector3(0, this.len * 0.4, 0)), { count: 40 });
    // Post-bath zoomies are real.
    setTimeout(() => { this._endAct(); if (Math.random() < 0.6) this._startZoomies(); }, 1400);
  }

  // --- training -------------------------------------------------------------
  /**
   * Ask for a trick. The dog tries; success depends on how well it knows the
   * trick, its age and how independent the breed is. `done(success)`.
   */
  doTrick(id, done) {
    if (this.outside) return false;
    if (this.sleeping) this.wake(false);
    this.interrupt(true);
    const know = (this.game.s.tricks[id] || 0) / 100;
    const learner = (this.stage === 'baby' || this.stage === 'young' ? 1.15 : this.stage === 'senior' ? 0.85 : 1)
      * (1.15 - (this.traits.independent ?? 0.5) * 0.4);
    const pOk = Math.min(0.95, (0.12 + know * 0.85) * learner + (id === 'come' || id === 'speak' ? 0.1 : 0));
    const ok = Math.random() < pOk;
    this._setAct('trick', ok ? `${TRICKS[id].name}!` : 'Thinking…', { dur: 3, trick: id, ok, phase: 'do' }, false);
    this.lookAt = this.camera.position.clone(); this.lookUntil = this.time + 4;
    const finish = (delay) => setTimeout(() => {
      this.sitting = false; this.lying = false;
      if (this.act?.id === 'trick') this._endAct();
      done?.(ok);
    }, delay);
    if (!ok) {
      // Confused: head tilt, offers something else, or sniffs the floor.
      const alt = pick(['tilt', 'sit', 'sniff', 'paw']);
      if (alt === 'sit') this.sitting = true;
      else if (alt === 'paw') this.react('paw', { dur: 1.2 });
      else this.react(alt, { dur: 1.4 });
      finish(1600);
      return true;
    }
    switch (id) {
      case 'sit': this.sitting = true; finish(1800); break;
      case 'down': this.lying = true; finish(2600); break;
      case 'paw': this.sitting = true; setTimeout(() => this.react('paw', { dur: 1.4 }), 500); finish(2000); break;
      case 'speak': this.say('speak'); this.react('hop', { dur: 0.4 }); finish(1000); break;
      case 'spin': {
        const c = this.root.position.clone(); const r = this.len * 0.35;
        const pts = [0, 1, 2, 3, 4].map((k) => c.clone().add(new THREE.Vector3(Math.cos(k * 1.57) * r, 0, Math.sin(k * 1.57) * r)));
        this.walk(pts, () => finish(200), 1.2);
        break;
      }
      case 'come': {
        const r = this.house.rooms[this.viewRoom];
        this.walk([new THREE.Vector3(r.cx + rand(-1.5, 1.5), 0, -1.2)], () => {
          this.walk([this.frontOf(this.viewRoom)], () => finish(300), 1.4);
        }, 1);
        break;
      }
      default: finish(1000);
    }
    return true;
  }

  // ======================================================================
  // Per frame
  // ======================================================================
  _runAct(dt) {
    const a = this.act;
    if (!a) return;
    if (a.phase === 'do') a.t += dt;
    const g = this.game;
    switch (a.id) {
      case 'door':
        if (a.phase === 'do') {
          this._chirpT -= dt;
          if (this._chirpT <= 0) { this._chirpT = rand(7, 14); if (this.inView || Math.random() < 0.4) this.say('door'); this.react('perk', { dur: 1 }); }
          // Can't hold it forever.
          const hold = this.stage === 'baby' ? -8 : this.stage === 'senior' ? -15 : -30;
          if (g.s.bladder <= hold) { this.sitting = false; this._endAct(); }
        }
        if (g.s.bladder > 0) this._endAct();                  // walked
        return;
      case 'potty':
        if (a.phase === 'do' && a.t > a.dur) {
          if (!a.accident) {
            g.useLitter();
            this.onHint(`${this.name} used the pee pad. Fine in a pinch — but dogs much prefer going outside, and walks are exercise too.`);
          }
          this._endAct();
        }
        return;
      case 'chew':
        if (a.phase === 'do') {
          g.addNeed('play', dt * 0.4);
          if (Math.random() < dt * 0.8) this.react('chew', { dur: 1 });
          if (a.t > a.dur) { this.sitting = false; this._endAct(); }
        }
        return;
      case 'howl':
        if (a.t > a.dur) { this.sitting = false; this._endAct(); }
        return;
      case 'toy':
        if (a.phase === 'do' && a.t > a.dur) this._endAct();
        return;
      case 'beg':
        if (a.phase === 'do' && a.t > a.dur) { this.sitting = false; this._endAct(); }
        return;
      case 'trick': case 'walkout': case 'walkin':
        return;
      case 'idle':
        if (a.t > a.dur || (a.phase !== 'do' && (a.t += dt) > a.dur)) { this.lying = false; this._endAct(); }
        return;
      case 'petted':
        if (this.time - this.touchedAt > 3) { this.lying = false; this._endAct(); }
        return;
      case 'window':
        // Dogs watch too — and announce visitors.
        if (a.phase === 'do') {
          this.lookAt = a.w.glass; this.lookUntil = this.time + 0.5;
          this._bird -= dt;
          if (this._bird <= 0) {
            this._bird = rand(5, 10);
            const day = new Date().getHours() >= 7 && new Date().getHours() < 19;
            if (day) {
              this.fx.spawn('bird', a.w.glass.clone().add(new THREE.Vector3(-0.8, rand(-0.3, 0.3), 0.05)), { vel: new THREE.Vector3(rand(0.4, 0.8), rand(-0.05, 0.1), 0) });
              setTimeout(() => { if (this.act === a) { this.react('perk'); this.wag = 0.6; if (this.inView) this.say('watch'); } }, 500);
              g.addNeed('play', 1);
            }
          }
          if (a.t > a.dur) { this.sitting = false; this._endAct(); }
        }
        return;
      default:
        a.t -= a.phase === 'do' ? dt : 0;                    // Pet._runAct counts it again
        super._runAct(dt);
    }
  }

  update(dt) {
    if (this.outside) { this.time += dt; this.status = 'Out for a walk'; return; }
    this.happyT = Math.max(0, this.happyT - dt);
    super.update(dt);
  }

  _pose(pose, moving) {
    if (moving) return pose;
    const a = this.act;
    if (this.sleeping) return 'rest';
    if (this.lying) return 'rest';
    if (a?.phase === 'do' && a.id === 'bowl') return 'eat';
    if (a?.phase === 'do' && (a.id === 'explore' || (a.id === 'potty' && !a.accident))) return 'sniff';
    if (a?.phase === 'do' && a.id === 'chew') return 'eat';
    return pose === 'sit' ? 'idle' : pose;                     // sitting is procedural (below)
  }

  /** Tail, ears and posture: what a dog owner reads at a glance. */
  _bodyLanguage(dt, crouch) {
    const B = this.bones; const t = this.time; const tail = B.tail;
    const irritated = this.overstim >= WARN || this.isReacting('annoyed') || this.isReacting('growl');
    const scared = this.isReacting('flinch') || this.game.bond < 12;
    const excited = this.act?.id === 'greet' || this.act?.id === 'walkout' || this.act?.id === 'toy'
      || this.act?.id === 'treat' || this.chase || this.isReacting('hop') || this.isReacting('love');
    const happy = !irritated && !scared && (this.happyT > 0 || (this.game.bond > 25 && this.inView));
    let target = this.sleeping ? 0 : irritated ? 0.15 : scared ? 0 : excited ? 1 : happy ? 0.6 : 0.25;
    if (this.act?.id === 'door') target = 0.3;
    this.wag += (target - this.wag) * Math.min(1, dt * 3);

    if (!this.sleeping && !this.lying) {
      const freq = 5 + this.wag * 9;
      const amp = 0.12 + this.wag * 0.45;
      tail.forEach((b, i) => this._rot(b, 'up', Math.sin(t * freq - i * 0.45) * amp * (0.5 + i / tail.length)));
      if (this.wag > 0.75) this._rot(B.hip, 'up', Math.sin(t * freq) * 0.07 * this.wag);   // whole-body wiggle
      if (scared) tail.forEach((b) => this._rot(b, 'side', -0.35));                         // tucked
      if (irritated) { tail.forEach((b) => this._rot(b, 'side', 0.15)); }                  // high and stiff
    }
    // Ears: back when uneasy, pricked when alert.
    if (irritated || scared) { this._rot(B.earL, 'side', -0.5); this._rot(B.earR, 'side', -0.5); }
    else if (this.act?.id === 'window' || this.isReacting('perk')) { this._rot(B.earL, 'side', 0.2); this._rot(B.earR, 'side', 0.2); }

    // Sitting: rear down, chest up, front legs straight.
    const wantSit = this.sitting && !this.sleeping && !this.lying && !this.path.length && !this.jump ? 1 : 0;
    this.sitAmt += (wantSit - this.sitAmt) * Math.min(1, dt * 5);
    const k = this.sitAmt;
    if (k > 0.01) {
      const c = this.sitCfg;
      const th = c.th * k;
      this._rot(B.hip, 'side', th);
      this._rot(this.legs.frontL, 'side', c.front * th); this._rot(this.legs.frontR, 'side', c.front * th);
      this._rot(this.legs.thighL, 'side', c.thigh * k); this._rot(this.legs.thighR, 'side', c.thigh * k);
      this._rot(this.legs.shinL, 'side', c.shin * k); this._rot(this.legs.shinR, 'side', c.shin * k);
      tail.forEach((b, i) => this._rot(b, 'side', i === 0 ? c.tail * k : 0));
      this.sitDrop = this.hipH * c.drop * k;
    } else {
      this.sitDrop = 0;
    }
  }

  _applyReactions(dt) {
    const B = this.bones;
    for (const r of this.reactions) {
      const k = Math.min(1, r.t / r.dur);
      const e = Math.sin(k * Math.PI);
      switch (r.type) {
        case 'tilt': this._rot(B.head, 'fwd', 0.38 * e); break;
        case 'lick': this._rot(B.head, 'side', Math.sin(r.t * 14) * 0.06 * e); break;
        case 'growl': this._rot(B.head, 'side', -0.15 * e); this._rot(B.earL, 'side', -0.5 * e); this._rot(B.earR, 'side', -0.5 * e); break;
        case 'paw': this._rot(B.armR || B.armL, 'side', 1.1 * e); break;
        default:
      }
    }
    super._applyReactions(dt);
    if (this.sitDrop) this.hopY -= this.sitDrop;
  }
}
