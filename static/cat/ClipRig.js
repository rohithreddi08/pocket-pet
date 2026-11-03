// ============================================================================
// ClipRig — drives a rigged, animated cat from FelineBehavior's pose states.
// ----------------------------------------------------------------------------
// It exposes the same `update(poseState, phase, speed, dt)` interface as the
// procedural rig in CatLoader, so FelineBehavior doesn't care which one runs.
//
// · Auto-maps the model's clip names onto poses (idle, walk, run, sit, rest,
//   eat, sniff, pounce, pet, groom, meow) with fuzzy matching + fallbacks.
// · Plays enter/exit transitions when the model has them
//   (e.g. "Sit_Down" → "Sit_Loop" → "Stand_Up").
// · Removes forward drift (root motion) from walk/run clips, measures how fast
//   each clip "wants" to move, and scales playback to the actual ground speed
//   so the paws don't slide.
// ============================================================================
import * as THREE from 'three';
import { CatAnimator } from './CatAnimator.js';
import { normalizeName } from './BoneMap.js';

// Patterns are tested against normalized names ("Armature|Cat_SitDown" → "cat sit down").
const POSES = {
  idle:   { loop: [/\bidle\b/, /\bstand\b/, /\bbreath/] },
  walk:   { loop: [/\bwalk/] },
  run:    { loop: [/\btrot/, /\brun/, /\bjog/, /\bgallop/, /\bsprint/] },
  sit:    {
    loop:  [/\bsit/],
    enter: [/\bsit\s?(down|start|begin|in)\b/, /\bto\s?sit/, /\bstand\s?to\s?sit/],
    exit:  [/\bsit\s?(up|end|out)\b/, /\bsit\s?to\s?stand/, /\bstand\s?up/],
  },
  rest:   {
    loop:  [/\bsleep/, /\blie\b|\blying/, /\blay/, /\bcurl/, /\brest/],
    enter: [/\b(lie|lay)\s?(down|start)\b/, /\bto\s?(sleep|lie|lay)/, /\bsleep\s?(start|begin|in)\b/],
    exit:  [/\b(get|wake)\s?up/, /\bwake/, /\bsleep\s?(end|out)\b/, /\b(lie|lay)\s?to\s?stand/],
  },
  eat:    { loop: [/\beat/, /\bdrink/, /\bfeed/, /\bchew/] },
  sniff:  { loop: [/\bsniff/, /\bsmell/, /\blook\s?(down|around)/, /\bsearch/] },
  groom:  { loop: [/\bgroom/, /\blick/, /\bclean/, /\bwash/] },
  pet:    { loop: [/\bpurr/, /\bhappy/, /\brub/, /\bpet\b/, /\bknead/] },
  alert:  { loop: [/\balert/, /\blook\b/, /\bcurious/, /\bnotice/] },
  pounce: { once: [/\bpounce/, /\bleap/, /\bjump/, /\battack/, /\bswipe/, /\bhit/] },
  meow:   { once: [/\bmeow/, /\bmew/, /\bvoice/, /\bcall/, /\bhiss/] },
};

// If the model lacks a pose, use the closest thing it does have.
const FALLBACK = {
  run: 'walk', sniff: 'idle', eat: 'sniff', groom: 'sit', pet: 'sit',
  alert: 'idle', sit: 'idle', rest: 'sit', pounce: 'run', walk: 'idle',
};

const TRANSITION_WORDS = /\b(start|begin|end|in|out|down|up|to)\b/;
const LOCOMOTION = new Set(['walk', 'run']);
// Speeding a cycle up past this looks frantic; past it the cat moves slower instead.
const MAX_TIME_SCALE = 1.4;

// Fallback ground speeds (world units / s at playback rate 1) for in-place clips.
const DEFAULT_CLIP_SPEED = { walk: 0.8, run: 2.0 };

function score(name, patterns, otherLoops) {
  let best = Infinity;
  patterns.forEach((re, i) => { if (re.test(name)) best = Math.min(best, i * 10); });
  if (best === Infinity) return best;
  // "Idle_Sit" is a better sit than idle; penalize names that also describe another pose.
  if (otherLoops.some((re) => re.test(name))) best += 5;
  return best + name.length / 100;
}

export class ClipRig {
  /**
   * @param {THREE.Object3D} root      outer cat root (the object that moves)
   * @param {THREE.AnimationClip[]} clips
   * @param {{ clipSpeeds?: Record<string, number>, clipMap?: Record<string, string> }} [opts]
   */
  constructor(root, clips, opts = {}) {
    this.handlesPoses = true;
    this.root = root;
    this.animator = new CatAnimator(root, clips);
    this.clipByName = new Map(clips.map((c) => [c.name, c]));
    this.poses = this._mapClips(clips, opts.clipMap || {});
    this.clipSpeed = { ...DEFAULT_CLIP_SPEED, ...(opts.clipSpeeds || {}) };
    this._stripRootMotion();
    for (const pose of LOCOMOTION) {
      if (opts.clipSpeeds?.[pose] || this.clipSpeedLearned?.[pose]) continue;
      const v = this._estimateStrideSpeed(pose);
      if (v) this.clipSpeed[pose] = v;
    }

    this.pose = null;          // pose currently looping (or being entered)
    this.queue = [];           // pending [{clip, once, pose}]
    this.current = null;       // item playing now
    this.lastOneShot = null;   // stops a held "pounce" request from replaying forever
    this.speed = 0;

    this.animator.onFinished(() => this._next());

    const found = Object.entries(this.poses)
      .map(([pose, p]) => `${pose}: ${[...(p.enter || []), ...(p.loop || []), ...(p.exit || []), ...(p.once || [])].join(', ')}`);
    console.info(`[ClipRig] clips: ${clips.map((c) => c.name).join(', ')}\n  ${found.join('\n  ')}`);
  }

  /** True while an enter/exit/one-shot clip plays — the cat shouldn't slide around. */
  get busy() { return !!this.current?.once; }

  has(pose) { return !!this.poses[pose]; }

  /** Fastest ground speed the clips can show without the paws sliding. */
  get maxSpeed() {
    const top = this.poses.run ? this.clipSpeed.run : this.clipSpeed.walk;
    return top * MAX_TIME_SCALE;
  }

  // --------------------------------------------------------------------------
  // Clip discovery
  // --------------------------------------------------------------------------
  _mapClips(clips, clipMap) {
    const names = clips.map((c) => ({ raw: c.name, n: normalizeName(c.name) }));
    const allLoops = Object.entries(POSES).flatMap(([pose, p]) => (p.loop || []).map((re) => ({ pose, re })));
    const poses = {};

    for (const [pose, def] of Object.entries(POSES)) {
      const others = allLoops.filter((x) => x.pose !== pose).map((x) => x.re);
      const entry = {};
      for (const kind of ['loop', 'enter', 'exit', 'once']) {
        if (!def[kind]) continue;
        const ranked = names
          .map(({ raw, n }) => {
            // A clip that is plainly another pose ("WalkClean" is a walk) can't be
            // borrowed through a weak keyword ("clean" → groom).
            const plainlyOther = Object.entries(POSES).some(([p, d]) => p !== pose && d.loop?.[0]?.test(n));
            const strongHere = def[kind][0].test(n);
            if (plainlyOther && !strongHere) return { raw, s: Infinity };
            let s = score(n, def[kind], others);
            // A loop clip shouldn't be a transition ("Sit_Down" is not "Sit").
            if (kind === 'loop' && TRANSITION_WORDS.test(n) && !/\bloop\b|\bidle\b/.test(n)) s += 20;
            return { raw, s };
          })
          .filter((x) => x.s < Infinity)
          .sort((a, b) => a.s - b.s);
        if (!ranked.length) continue;
        // Keep near-equal matches as variants ("Idle_1", "Idle_2") for variety.
        entry[kind] = ranked.filter((x) => x.s < ranked[0].s + 3).map((x) => x.raw);
      }
      // Transitions can't double as the loop itself.
      if (entry.loop && entry.enter) entry.enter = entry.enter.filter((c) => !entry.loop.includes(c));
      if (entry.loop && entry.exit) entry.exit = entry.exit.filter((c) => !entry.loop.includes(c));
      if (entry.loop || entry.once) poses[pose] = entry;
    }

    // Explicit overrides from index.html, e.g. { sit: "Cat_SitIdle" }.
    for (const [pose, clip] of Object.entries(clipMap)) {
      if (this.clipByName.has(clip)) {
        poses[pose] = { ...(poses[pose] || {}), [POSES[pose]?.once ? 'once' : 'loop']: [clip] };
      }
    }
    return poses;
  }

  /**
   * Walk/run clips often move the hips forward over the cycle (root motion).
   * We move the cat ourselves, so subtract the linear drift (keeping the bob),
   * and use the drift to learn the clip's natural ground speed.
   */
  _stripRootMotion() {
    this.root.updateMatrixWorld(true);
    const bones = new Map();
    this.root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
    const shallow = (bone) => {
      let d = 0;
      for (let p = bone.parent; p && p.isBone; p = p.parent) d += 1;
      return d <= 2;
    };

    for (const pose of LOCOMOTION) {
      for (const clipName of this.poses[pose]?.loop || []) {
        const clip = this.clipByName.get(clipName);
        let bestSpeed = 0;
        for (const track of clip.tracks) {
          const [nodeName, prop] = [track.name.slice(0, track.name.lastIndexOf('.')), track.name.slice(track.name.lastIndexOf('.') + 1)];
          const bone = bones.get(nodeName) || bones.get(THREE.PropertyBinding.sanitizeNodeName(nodeName));
          if (prop !== 'position' || !bone || !shallow(bone)) continue;
          const v = track.values;
          const t = track.times;
          const n = t.length;
          if (n < 2) continue;
          const T = t[n - 1] - t[0];
          if (T <= 0) continue;
          const drift = new THREE.Vector3(v[3 * n - 3] - v[0], v[3 * n - 2] - v[1], v[3 * n - 1] - v[2]);
          for (let k = 0; k < n; k += 1) {
            const f = (t[k] - t[0]) / T;
            v[3 * k] -= drift.x * f;
            v[3 * k + 1] -= drift.y * f;
            v[3 * k + 2] -= drift.z * f;
          }
          // Drift in world units (parent bone space → world, direction only).
          if (bone.parent) {
            const m = new THREE.Matrix3().setFromMatrix4(bone.parent.matrixWorld);
            drift.applyMatrix3(m);
          }
          const horizontal = Math.hypot(drift.x, drift.z) / clip.duration;
          bestSpeed = Math.max(bestSpeed, horizontal);
        }
        if (bestSpeed > 0.05 && !this.clipSpeedLearned?.[pose]) {
          this.clipSpeed[pose] = bestSpeed;
          (this.clipSpeedLearned ||= {})[pose] = true;
        }
      }
    }
  }

  /**
   * In-place walk cycles have no root motion to measure. Instead, sample the
   * clip and see how far each paw sweeps fore-and-aft: a planted paw travels
   * that distance backwards during stance (~60% of the cycle for a walk,
   * ~40% for a run), so ground speed ≈ sweep / (duty × duration).
   */
  _estimateStrideSpeed(pose) {
    const clip = this.clipByName.get(this.poses[pose]?.loop?.[0]);
    if (!clip) return null;
    const feet = [];
    this.root.traverse((o) => {
      if (o.isBone && /\b(paw|foot|feet|heel|hand|toe)\b/.test(normalizeName(o.name))) feet.push(o);
    });
    if (!feet.length) return null;

    const bones = [];
    this.root.traverse((o) => { if (o.isBone) bones.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
    const mixer = new THREE.AnimationMixer(this.root);
    const action = mixer.clipAction(clip);
    action.play();

    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const range = feet.map(() => [Infinity, -Infinity]);
    const p = new THREE.Vector3();
    const N = 40;
    for (let i = 0; i < N; i += 1) {
      mixer.setTime((clip.duration * i) / N);
      this.root.updateMatrixWorld(true);
      feet.forEach((f, k) => {
        const d = f.getWorldPosition(p).dot(fwd);
        range[k][0] = Math.min(range[k][0], d);
        range[k][1] = Math.max(range[k][1], d);
      });
    }
    action.stop();
    mixer.uncacheRoot(this.root);
    for (const [b, pos, q, s] of bones) { b.position.copy(pos); b.quaternion.copy(q); b.scale.copy(s); }
    this.root.updateMatrixWorld(true);

    // Use the bigger sweeps (paw tips swing more than heels/ankles).
    const sweeps = range.map(([a, b]) => b - a).sort((a, b) => b - a);
    const sweep = sweeps.slice(0, Math.max(1, Math.ceil(sweeps.length / 2)))
      .reduce((s, x) => s + x, 0) / Math.max(1, Math.ceil(sweeps.length / 2));
    const duty = pose === 'run' ? 0.4 : 0.6;
    const speed = sweep / (duty * clip.duration);
    return Number.isFinite(speed) && speed > 0.05 ? speed : null;
  }

  // --------------------------------------------------------------------------
  // Pose resolution + playback queue
  // --------------------------------------------------------------------------
  _resolve(pose) {
    const seen = new Set();
    while (pose && !this.poses[pose] && !seen.has(pose)) {
      seen.add(pose);
      pose = FALLBACK[pose];
    }
    return this.poses[pose] ? pose : (this.poses.idle ? 'idle' : Object.keys(this.poses)[0]);
  }

  _randomOf(list) { return list[Math.floor(Math.random() * list.length)]; }

  _transitionTo(pose) {
    const fromDef = this.poses[this.pose];
    const toDef = this.poses[pose];
    this.queue = [];
    if (fromDef?.exit && this.pose !== pose) {
      this.queue.push({ clip: this._randomOf(fromDef.exit), once: true, pose: this.pose });
    }
    if (toDef.once) {
      this.queue.push({ clip: this._randomOf(toDef.once), once: true, pose, oneShot: true });
    } else {
      if (toDef.enter) this.queue.push({ clip: this._randomOf(toDef.enter), once: true, pose });
      this.queue.push({ clip: this._randomOf(toDef.loop), once: false, pose });
    }
    this.pose = pose;
    // Don't cut a transition off halfway — let it finish, then run the queue.
    if (!this.busy) this._next();
  }

  _next() {
    const item = this.queue.shift();
    if (!item) {
      // A one-shot finished with nothing queued: settle into idle.
      if (this.current?.oneShot) {
        this.pose = null;
        this._transitionTo(this._resolve('idle'));
      }
      return;
    }
    this.current = item;
    if (item.oneShot) this.lastOneShot = item.pose;
    this.animator.playAnimation(item.clip, item.once ? 0.2 : 0.35, { once: item.once });
  }

  /** Play a one-off emote (e.g. "meow") if the model has it. */
  emote(pose) {
    const def = this.poses[pose];
    if (!def?.once || this.busy) return false;
    const back = this.pose;
    this.queue = [
      { clip: this._randomOf(def.once), once: true, pose: back },
      ...(back && this.poses[back]?.loop ? [{ clip: this._randomOf(this.poses[back].loop), once: false, pose: back }] : []),
    ];
    this._next();
    return true;
  }

  // --------------------------------------------------------------------------
  // Per-frame
  // --------------------------------------------------------------------------
  update(poseState, phase, speed, dt) {
    this.speed = speed;

    // Behavior state → animation pose.
    let wanted = poseState;
    if (poseState === 'walk' || poseState === 'play') {
      const runAt = this.poses.run ? (this.clipSpeed.walk + this.clipSpeed.run) * 0.5 : Infinity;
      wanted = speed < 0.05 ? (poseState === 'play' ? 'alert' : 'idle')
        : speed > runAt ? 'run' : 'walk';
    }

    if (wanted !== this.lastOneShot) this.lastOneShot = null;
    const resolved = wanted === this.lastOneShot ? this.pose : this._resolve(wanted);
    if (resolved && resolved !== this.pose) this._transitionTo(resolved);

    // Match stride rate to ground speed so paws plant instead of sliding.
    const action = this.animator.currentAction;
    if (action && !this.current?.once) {
      if (LOCOMOTION.has(this.pose)) {
        const ts = THREE.MathUtils.clamp(speed / this.clipSpeed[this.pose], 0.45, MAX_TIME_SCALE);
        action.setEffectiveTimeScale(ts);
      } else {
        action.setEffectiveTimeScale(1);
      }
    }

    this.animator.update(dt);
  }
}
