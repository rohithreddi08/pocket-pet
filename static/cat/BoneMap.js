// ============================================================================
// BoneMap — finds the bones we care about in an arbitrary cat rig.
// ----------------------------------------------------------------------------
// Rigs from different artists name bones differently ("Head", "head_01",
// "mixamorig:Head", "DEF-spine.004", "Bip01 Head", ...). Names are normalized
// (camelCase split, punctuation → spaces, lowercase) and matched with word-ish
// patterns, so "rear_leg" never counts as an ear and "HeadTop_End" never
// counts as the head.
// ============================================================================

export function normalizeName(name = '') {
  return name
    .replace(/^.*[|:]/, '')                 // "Armature|Walk", "mixamorig:Head"
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')  // "LeftEar" → "Left Ear"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Helper/leaf bones that carry no skin. ("tip" is NOT here: "TailTip"/"EarTip"
// are usually real, weighted bones.)
const END_BONE = /\b(end|top|nub|null|ik|target|pole|ctrl|control|mch)\b/;
const SIDED = /\b(l|r|left|right|lt|rt)\b/;
const LEFT  = /(\bl\b|\bleft\b|\blt\b)/;
const RIGHT = /(\br\b|\bright\b|\brt\b)/;

function allBones(root) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  return bones;
}

function depth(bone) {
  let d = 0;
  for (let p = bone.parent; p && p.isBone; p = p.parent) d += 1;
  return d;
}

function pick(bones, include, exclude = END_BONE, prefer = 'shallow') {
  const hits = bones.filter((b) => {
    const n = normalizeName(b.name);
    return include.test(n) && !(exclude && exclude.test(n));
  });
  if (!hits.length) return null;
  hits.sort((a, b) => (prefer === 'deep' ? depth(b) - depth(a) : depth(a) - depth(b)));
  return hits[0];
}

/**
 * @param {THREE.Object3D} root
 * @returns {{head, neck, chest, hip, earL, earR, tail: THREE.Bone[], jaw}}
 */
export function mapBones(root) {
  const bones = allBones(root);
  const ears = bones.filter((b) => {
    const n = normalizeName(b.name);
    return /\bears?\b|\bear\d/.test(n) && !END_BONE.test(n);
  });
  // Prefer the base of each ear (shallowest bone on that side).
  const side = (re) => ears
    .filter((b) => re.test(normalizeName(b.name)))
    .sort((a, b) => depth(a) - depth(b))[0] || null;

  const tail = bones
    .filter((b) => /\btail/.test(normalizeName(b.name)) && !END_BONE.test(normalizeName(b.name)))
    .sort((a, b) => depth(a) - depth(b));

  const eyes = bones.filter((b) => {
    const n = normalizeName(b.name);
    return /\beyes?\b|\beyeball/.test(n) && !/\b(brow|lid|lash)/.test(n) && !END_BONE.test(n);
  });
  const eyeSide = (re) => eyes.find((b) => re.test(normalizeName(b.name))) || null;

  // Front legs (for kneading, swatting, pawing): the shallowest arm-ish bone per side.
  const arms = bones.filter((b) => {
    const n = normalizeName(b.name);
    return /\b(upper ?arm|arm|front ?leg|shoulder|humerus)\b/.test(n) && !/\b(back|rear|hind)\b/.test(n) && !END_BONE.test(n);
  });
  const armSide = (re) => arms.filter((b) => re.test(normalizeName(b.name))).sort((a, b) => depth(a) - depth(b))[0] || null;

  return {
    armL:  armSide(LEFT),
    armR:  armSide(RIGHT),
    eyeL:  eyeSide(LEFT),
    eyeR:  eyeSide(RIGHT),
    head:  pick(bones, /\bhead\b/),
    neck:  pick(bones, /\bneck/),
    jaw:   pick(bones, /\bjaw|\bmouth/),
    // Chest = the deepest spine bone (closest to the shoulders), or an explicit chest.
    chest: pick(bones, /\bchest\b|\bspine\s?(2|3|4|upper)\b|\bspine\d*\b/, END_BONE, 'deep')
      || pick(bones, /\btorso\s?\d*\b/, END_BONE, 'deep'),                // e.g. Quaternius animals
    // Pelvis — never a sided bone ("Hip.L" is a leg).
    hip:   pick(bones, /\bhips?\b|\bpelvis\b|\bbutt\b/, new RegExp(`${END_BONE.source}|${SIDED.source}`))
      || pick(bones, /\broot\b/)
      || pick(bones, /\bback\b/, new RegExp(`${END_BONE.source}|${SIDED.source}`)),
    earL:  side(LEFT),
    earR:  side(RIGHT),
    tail,
  };
}
