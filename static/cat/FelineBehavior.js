// Small, needs-led behavior controller for a cat that has no baked animations.
import * as THREE from 'three';

const LABELS = {
  idle: 'looking around',
  walk: 'exploring the garden',
  sniff: 'sniffing the flowers',
  sit: 'sitting in the sun',
  eat: 'eating at the bowl',
  play: 'chasing the toy',
  rest: 'napping in the shade',
  pet: 'purring happily',
  groom: 'grooming',
};

function angleDifference(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class FelineBehavior {
  constructor(root, rig, garden, camera, needs = {}, onStatus = () => {}) {
    this.root = root;
    this.rig = rig;
    this.garden = garden;
    this.camera = camera;
    this.needs = needs;
    this.onStatus = onStatus;
    this.basePosition = root.position.clone();
    this.baseRotation = root.rotation.clone();
    this.baseScale = root.scale.clone();
    // CatLoader turns every model so its nose is the root's +X axis, so
    // atan2(-dz, dx) is already the right yaw; no extra offset.
    this.facingOffset = 0;
    this.idleFacing = root.rotation.y;
    this.destination = null;
    this.arrivalState = 'idle';
    this.walkSpeed = 0.85;
    this.speed = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.elapsed = 0;
    this.duration = 1.5;
    this.state = 'idle';
    this.attention = 0;
    this.toyVelocity = new THREE.Vector3();
    this.nextToyKick = 0;
    this.pounceTime = 0;
    this.restPose = 0;
    this.isAttending = false;
    this._setState('idle', 1.5);
  }

  _setState(state, duration = 2) {
    this.state = state;
    if (state !== 'walk') this.idleFacing = this.root.rotation.y;
    this.elapsed = 0;
    this.duration = duration;
    this.onStatus(LABELS[state] || state);
  }

  _randomPoint(radius = this.garden.bounds) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    return new THREE.Vector3(
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance,
    );
  }

  _walkTo(destination, arrivalState, speed = 0.85) {
    this.destination = destination.clone();
    this.destination.y = 0;
    this.arrivalState = arrivalState;
    this.walkSpeed = speed;
    this.speed = 0;
    this._setState('walk', 20);
    if (arrivalState === 'eat') {
      this.onStatus('walking to the bowl');
    } else if (arrivalState === 'rest') {
      this.onStatus('heading to a cozy bed');
    }
  }

  _startRoutine() {
    if (this.needs.hunger > 76) {
      this._walkTo(this.garden.spots.bowl, 'eat', 0.72);
      return;
    }
    if (this.needs.energy < 28) {
      this._walkTo(this.garden.spots.bed, 'rest', 0.65);
      return;
    }

    const curiosity = this.needs.curiosity ?? 40;
    const stress = this.needs.stress ?? 20;
    const roll = Math.random();
    // Cats spend a big slice of their waking time grooming.
    if (this.rig?.has?.('groom') && roll > 0.82 && stress < 70) {
      this._setState('groom', 5 + Math.random() * 4);
      return;
    }
    if (roll < 0.16 + curiosity * 0.0015) {
      this._walkTo(this._randomPoint(2.8), 'sniff', 0.62);
    } else if (roll < 0.48) {
      this._walkTo(this.garden.spots.sunPatch, 'sit', 0.7);
    } else if (roll > 0.91 || stress > 70) {
      this._walkTo(this.garden.spots.bed, 'rest', 0.68);
    } else {
      this._walkTo(this._randomPoint(this.garden.bounds * 0.78), 'sniff', 0.9);
    }
  }

  trigger(action) {
    if (action === 'feed') {
      this._walkTo(this.garden.spots.bowl, 'eat', 0.8);
    } else if (action === 'play') {
      this._setState('play', 12);
      this.nextToyKick = 0;
      this.pounceTime = 0;
      this.toyVelocity.set(0, 0, 0);
    } else if (action === 'rest') {
      this._walkTo(this.garden.spots.bed, 'rest', 0.66);
    }
  }

  alert() {
    this.attention = 1.2;
    this.isAttending = true;
    this.onStatus('curious about you');
  }

  pet() {
    this.attention = 0;
    // Cats don't always answer; when they do, it's a short meow first.
    if (Math.random() < 0.45) this.rig?.emote?.('meow');
    this._setState('pet', 2.6);
  }

  _moveToward(destination, speed, dt) {
    // Don't glide while the rig is mid-transition (standing up, lying down…).
    if (this.rig?.busy) {
      this.speed = 0;
      return false;
    }
    const dx = destination.x - this.root.position.x;
    const dz = destination.z - this.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.13) {
      this.speed = 0;
      return true;
    }

    // Never faster than the animation can show without the paws sliding.
    const cap = this.rig?.maxSpeed ?? Infinity;
    const desiredSpeed = Math.min(speed, cap, Math.sqrt(distance) * 1.2);
    this.speed += (desiredSpeed - this.speed) * Math.min(1, dt * 2.8);
    const step = Math.min(this.speed * dt, distance);
    this.root.position.x += (dx / distance) * step;
    this.root.position.z += (dz / distance) * step;

    const desiredYaw = Math.atan2(-dz, dx) + this.facingOffset;
    this.root.rotation.y += angleDifference(this.root.rotation.y, desiredYaw)
      * Math.min(1, dt * 4.5);
    return false;
  }

  _updatePlay(dt) {
    const toy = this.garden.toy;
    this.nextToyKick -= dt;
    const wasPouncing = this.pounceTime > 0;
    this.pounceTime = Math.max(0, this.pounceTime - dt);
    if (wasPouncing && this.pounceTime === 0) {
      this.onStatus(LABELS.play);
    }
    toy.position.addScaledVector(this.toyVelocity, dt);
    this.toyVelocity.multiplyScalar(Math.exp(-2.2 * dt));
    toy.position.y = 0.14 + Math.abs(this.toyVelocity.length()) * 0.035;

    const distance = Math.hypot(
      toy.position.x - this.root.position.x,
      toy.position.z - this.root.position.z,
    );
    if (distance < 0.95 && this.nextToyKick <= 0) {
      const target = this._randomPoint(this.garden.bounds * 0.58);
      const direction = target.sub(toy.position);
      direction.y = 0;
      direction.normalize();
      this.toyVelocity.copy(direction.multiplyScalar(1.7 + Math.random() * 0.7));
      this.nextToyKick = 0.7 + Math.random() * 0.45;
      this.pounceTime = 0.48;
      this.onStatus('pouncing at the toy');
    }
    this._moveToward(toy.position, 1.35, dt);
  }

  update(dt) {
    this.phase += dt * (this.speed > 0.05 ? 7.5 : 1.35);
    this.elapsed += dt;
    this.attention = Math.max(0, this.attention - dt);
    if (this.isAttending && this.attention === 0) {
      this.isAttending = false;
      this.onStatus(LABELS[this.state] || this.state);
    }

    if (this.state === 'walk') {
      if (this._moveToward(this.destination, this.walkSpeed, dt)) {
        const duration = this.arrivalState === 'rest'
          ? 14
          : this.arrivalState === 'eat' ? 7 : 3.2;
        this._setState(this.arrivalState, duration);
      }
    } else if (this.state === 'play') {
      this._updatePlay(dt);
      if (this.elapsed >= this.duration) {
        this.needs.energy = Math.max(0, (this.needs.energy ?? 80) - 8);
        this.needs.curiosity = Math.max(0, (this.needs.curiosity ?? 40) - 25);
        this._setState('idle', 1.8);
      }
    } else if (this.elapsed >= this.duration) {
      if (this.state === 'idle') {
        this._startRoutine();
      } else {
        if (this.state === 'eat') {
          this.needs.hunger = Math.max(0, (this.needs.hunger ?? 30) - 35);
        } else if (this.state === 'rest') {
          this.needs.energy = Math.min(100, (this.needs.energy ?? 80) + 35);
          this.needs.stress = Math.max(0, (this.needs.stress ?? 20) - 12);
        }
        this._setState('idle', 1.8 + Math.random() * 2.4);
      }
    }

    const moving = this.state === 'walk' || this.state === 'play';
    const crouching = this.state === 'sit' || this.state === 'rest';
    const sleeping = this.state === 'rest';
    this.restPose = THREE.MathUtils.damp(
      this.restPose, sleeping ? 1 : 0, 3.5, dt,
    );
    if (!moving) this.speed = 0;
    // A rigged model has real sit/lie/sleep clips; the fake squash/bob/sway
    // below is only for the procedural fallback rig.
    const poseDriven = !!this.rig?.handlesPoses;
    if (!poseDriven) this.root.scale.y = this.baseScale.y * (1 - 0.2 * this.restPose);

    if (this.attention > 0 && !moving) {
      const dx = this.camera.position.x - this.root.position.x;
      const dz = this.camera.position.z - this.root.position.z;
      const desiredYaw = Math.atan2(-dz, dx) + this.facingOffset;
      this.root.rotation.y += angleDifference(this.root.rotation.y, desiredYaw)
        * Math.min(1, dt * 2.8);
    } else if (!moving && !crouching) {
      const desiredYaw = this.idleFacing + Math.sin(this.phase * 0.22) * 0.09;
      this.root.rotation.y += angleDifference(this.root.rotation.y, desiredYaw)
        * Math.min(1, dt * 1.5);
    }

    if (!poseDriven) {
    this.root.position.y = this.basePosition.y
      + (moving ? Math.abs(Math.sin(this.phase * 2)) * 0.012 : Math.sin(this.phase) * 0.003)
      - (crouching ? 0.035 : 0)
      + (this.pounceTime > 0
        ? Math.sin((1 - this.pounceTime / 0.48) * Math.PI) * 0.035
        : 0);
    this.root.rotation.x = this.baseRotation.x
      + (moving ? Math.sin(this.phase) * 0.012 : 0);
    this.root.rotation.z = this.baseRotation.z
      + (moving ? Math.sin(this.phase * 2) * 0.012 : 0);
    }

    // Only switch to the alert pose when standing still — otherwise the legs
    // would stop while the body keeps gliding.
    const poseState = this.attention > 0 && !moving
      ? 'alert'
      : this.state === 'play' && this.pounceTime > 0 ? 'pounce' : this.state;
    this.rig?.update(poseState, this.phase, this.speed, dt);
  }
}
