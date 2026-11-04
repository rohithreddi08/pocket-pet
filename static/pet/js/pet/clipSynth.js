// ============================================================================
// clipSynth.js — make the missing animations for a rigged model that only
// ships with an idle clip (e.g. the shorthair cat).
// ----------------------------------------------------------------------------
// Every motion is a rotation about the body's sideways axis (pitching a bone
// forward/back), which is how legs, spine, neck and tail mostly move in a
// walking quadruped. Axes are measured from the rest pose, so the same code
// works for any rig once the bone names are given.
//
//   Walk  — lateral-sequence walk (LH, LF, RH, RF), the gait cats use
//   Trot  — diagonal pairs, faster
//   Sit_Down / Sit / Stand_Up — haunches down, chest up
//   Lie_Down / Sleep / Get_Up — a "loaf": legs folded under, head lowered
//   Eat, Sniff — head down to the bowl / floor
//   Jump — crouch and spring (used for pounces)
// ============================================================================
import * as THREE from 'three';

const TAU = Math.PI * 2;
const qTmp = new THREE.Quaternion();

/**
 * @param {THREE.Object3D} scene   the loaded glTF scene (rest pose)
 * @param {object} spec  { body, legs: {FL,FR,BL,BR: [upper, lower, foot]}, neck, head, tail: [] }
 * @returns {THREE.AnimationClip[]}
 */
export function synthClips(scene, spec) {
  scene.updateMatrixWorld(true);
  const byName = new Map();
  scene.traverse((o) => byName.set(o.name, o));
  const get = (n) => byName.get(n) || byName.get(THREE.PropertyBinding.sanitizeNodeName(n));
  const body = get(spec.body);
  const head = get(spec.head);
  const tail0 = get(spec.tail[0]);
  if (!body || !head || !tail0) return [];

  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = wp(head).sub(wp(tail0)).setY(0).normalize();
  const side = new THREE.Vector3().crossVectors(fwd, up).normalize();     // +angle = nose/paw up-forward

  // Body height (ground → body pivot) and leg length, for lowering the body.
  let ground = Infinity;
  scene.traverse((o) => { if (o.isBone) ground = Math.min(ground, wp(o).y); });
  const legLen = (() => {
    const [u, , f] = spec.legs.BL.map(get);
    return u && f ? Math.max(0.01, wp(u).y - ground) : 1;
  })();

  // Local axis (in the parent's space) for pitching a node about `side`.
  const info = new Map();
  const nodeInfo = (o) => {
    if (info.has(o)) return info.get(o);
    const pq = o.parent ? o.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const axis = side.clone().applyQuaternion(pq.clone().invert()).normalize();
    // World displacement → parent space (for position tracks).
    const pm = o.parent ? new THREE.Matrix4().copy(o.parent.matrixWorld).invert() : new THREE.Matrix4();
    const r = { o, axis, rest: o.quaternion.clone(), pos: o.position.clone(), pm: new THREE.Matrix3().setFromMatrix4(pm) };
    info.set(o, r);
    return r;
  };

  /**
   * Build one clip from a pose function f(t01) → { bodyY, bodyPitch, bodyFwd, bones: {name: angle} }.
   */
  function make(name, duration, f, steps = 24) {
    const times = [];
    const frames = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      times.push(t * duration);
      frames.push(f(t));
    }
    const tracks = [];
    // Bone rotations.
    const names = new Set(frames.flatMap((fr) => Object.keys(fr.bones || {})));
    for (const n of names) {
      const o = get(n); if (!o) continue;
      const inf = nodeInfo(o);
      const vals = [];
      for (const fr of frames) {
        qTmp.setFromAxisAngle(inf.axis, fr.bones[n] || 0).multiply(inf.rest);
        vals.push(qTmp.x, qTmp.y, qTmp.z, qTmp.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, times, vals));
    }
    // Body: drop, pitch, shift.
    const bi = nodeInfo(body);
    const pv = []; const qv = [];
    for (const fr of frames) {
      const d = new THREE.Vector3(0, -(fr.bodyY || 0) * legLen, 0).addScaledVector(fwd, (fr.bodyFwd || 0) * legLen).applyMatrix3(bi.pm);
      pv.push(bi.pos.x + d.x, bi.pos.y + d.y, bi.pos.z + d.z);
      qTmp.setFromAxisAngle(bi.axis, fr.bodyPitch || 0).multiply(bi.rest);
      qv.push(qTmp.x, qTmp.y, qTmp.z, qTmp.w);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${body.name}.position`, times, pv));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${body.name}.quaternion`, times, qv));
    return new THREE.AnimationClip(name, duration, tracks);
  }

  const L = spec.legs;
  const tail = spec.tail;
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => k * k * (3 - 2 * k);

  // One leg's swing: thigh angle + knee/ankle fold while lifted.
  function leg(out, [u, l, f], phase, amp, lift, front) {
    const s = Math.sin(phase * TAU);
    const swinging = Math.cos(phase * TAU) > 0;             // foot moving forward = in the air
    const raise = swinging ? Math.max(0, Math.cos(phase * TAU)) * lift : 0;
    out[u] = s * amp;
    if (front) { out[l] = -raise * 0.9; out[f] = raise * 1.4; } else { out[l] = raise * 1.1; out[f] = -raise * 1.2; }
  }
  function tailSway(out, t, base, amp, freq = 1) {
    tail.forEach((n, i) => { out[n] = base * (i === 0 ? 1 : 0.3) + Math.sin((t * freq - i * 0.12) * TAU) * amp; });
  }

  function gait(name, dur, offs, amp, lift, bob) {
    return make(name, dur, (t) => {
      const b = {};
      leg(b, L.BL, t + offs.BL, amp, lift, false);
      leg(b, L.FL, t + offs.FL, amp * 0.9, lift, true);
      leg(b, L.BR, t + offs.BR, amp, lift, false);
      leg(b, L.FR, t + offs.FR, amp * 0.9, lift, true);
      b[spec.head] = Math.sin(t * TAU * 2) * 0.04;
      b[spec.neck] = -0.05;
      tailSway(b, t, 0.1, 0.06);
      return { bones: b, bodyY: Math.abs(Math.sin(t * TAU * 2)) * bob - bob * 0.5, bodyPitch: Math.sin(t * TAU * 2) * 0.015 };
    }, 32);
  }

  // Poses as plain objects so transitions can blend between them.
  const SIT = (() => {
    const b = {};
    b[L.BL[0]] = 1.25; b[L.BL[1]] = -1.9; b[L.BL[2]] = 1.0;
    b[L.BR[0]] = 1.25; b[L.BR[1]] = -1.9; b[L.BR[2]] = 1.0;
    b[L.FL[0]] = -0.55; b[L.FR[0]] = -0.55;                 // keep front legs vertical under the raised chest
    b[spec.neck] = -0.25; b[spec.head] = -0.15;
    tail.forEach((n, i) => { b[n] = i === 0 ? 1.0 : -0.15; });             // tail down, curled round the feet
    return { bones: b, bodyY: 0.32, bodyPitch: 0.55, bodyFwd: -0.05 };
  })();
  const LIE = (() => {
    const b = {};
    b[L.BL[0]] = 1.5; b[L.BL[1]] = -2.4; b[L.BL[2]] = 1.2;
    b[L.BR[0]] = 1.5; b[L.BR[1]] = -2.4; b[L.BR[2]] = 1.2;
    b[L.FL[0]] = -1.0; b[L.FL[1]] = 2.5; b[L.FL[2]] = -0.3;   // sphinx: elbows down, forearms forward
    b[L.FR[0]] = -1.0; b[L.FR[1]] = 2.5; b[L.FR[2]] = -0.3;
    b[spec.neck] = -0.2; b[spec.head] = -0.1;
    tail.forEach((n, i) => { b[n] = i === 0 ? 1.2 : -0.2; });
    return { bones: b, bodyY: 0.74, bodyPitch: 0, bodyFwd: 0 };
  })();
  const SLEEP = (() => {
    const p = JSON.parse(JSON.stringify(LIE));
    p.bones[spec.neck] = -0.45; p.bones[spec.head] = -0.5;
    p.bodyY = 0.78;
    return p;
  })();
  const STAND = { bones: {}, bodyY: 0, bodyPitch: 0, bodyFwd: 0 };
  const blend = (a, b2, k) => {
    const out = { bones: {} };
    for (const n of new Set([...Object.keys(a.bones), ...Object.keys(b2.bones)])) out.bones[n] = lerp(a.bones[n] || 0, b2.bones[n] || 0, k);
    for (const key of ['bodyY', 'bodyPitch', 'bodyFwd']) out[key] = lerp(a[key] || 0, b2[key] || 0, k);
    return out;
  };
  const breathe = (p, t, depth = 0.012) => ({ ...p, bodyY: p.bodyY + Math.sin(t * TAU) * depth });

  const clips = [
    gait('Walk', 1.1, { BL: 0, FL: 0.25, BR: 0.5, FR: 0.75 }, 0.42, 0.55, 0.05),
    gait('Trot', 0.6, { BL: 0, FR: 0, BR: 0.5, FL: 0.5 }, 0.6, 0.8, 0.09),
    make('Sit_Down', 0.9, (t) => blend(STAND, SIT, ease(t))),
    make('Sit', 3, (t) => breathe(SIT, t)),
    make('Stand_Up', 0.7, (t) => blend(SIT, STAND, ease(t))),
    make('Lie_Down', 1.4, (t) => (t < 0.5 ? blend(STAND, SIT, ease(t * 2)) : blend(SIT, LIE, ease((t - 0.5) * 2)))),
    make('Sleep', 4, (t) => breathe(SLEEP, t, 0.015)),
    make('Get_Up', 1.0, (t) => blend(SLEEP, STAND, ease(t))),
    make('Eat', 2, (t) => {
      const b = { [spec.neck]: -0.55, [spec.head]: -0.55 + Math.sin(t * TAU * 4) * 0.06 };
      b[L.FL[0]] = 0.1; b[L.FR[0]] = 0.1; tailSway(b, t, 0.05, 0.05);
      return { bones: b, bodyY: 0.06, bodyPitch: -0.12 };
    }),
    make('Sniff', 2.4, (t) => {
      const b = { [spec.neck]: -0.45, [spec.head]: -0.35 + Math.sin(t * TAU * 6) * 0.03 };
      tailSway(b, t, 0.1, 0.08);
      return { bones: b, bodyY: 0.04, bodyPitch: -0.1 };
    }),
    make('Jump', 0.9, (t) => {
      const crouch = t < 0.45 ? ease(t / 0.45) : Math.max(0, 1 - (t - 0.45) / 0.15);
      const stretch = t > 0.45 ? Math.sin(Math.min(1, (t - 0.45) / 0.55) * Math.PI) : 0;
      const b = {};
      for (const k of ['BL', 'BR']) { b[L[k][0]] = 0.5 * crouch - 0.6 * stretch; b[L[k][1]] = -0.9 * crouch; }
      for (const k of ['FL', 'FR']) { b[L[k][0]] = -0.2 * crouch + 0.7 * stretch; }
      b[spec.head] = 0.2 * crouch;
      return { bones: b, bodyY: 0.25 * crouch - 0.3 * stretch, bodyPitch: 0.15 * stretch, bodyFwd: 0.3 * stretch };
    }),
  ];
  return clips;
}
