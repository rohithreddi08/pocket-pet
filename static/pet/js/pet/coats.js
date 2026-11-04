// ============================================================================
// coats.js — paint a breed's coat colour onto a loaded model.
// ----------------------------------------------------------------------------
// · Dog models (flat-coloured materials): recolour by material name.
// · The cat model (one photo texture): a small shader tweak re-tints the fur —
//   desaturate, then multiply by the coat colour — so one Somali texture can
//   show ruddy, red, blue, fawn, ginger, grey, cream and smoke coats.
// Materials are cloned first so several pets/previews never share a coat.
// ============================================================================
import * as THREE from 'three';

function tintTexture(mat, coat) {
  const tint = new THREE.Vector3(...coat.tint);
  const sat = coat.sat ?? 1;
  if (sat === 1 && coat.tint.every((v) => v === 1)) return;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCoatTint = { value: tint };
    sh.uniforms.uCoatSat = { value: sat };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uCoatTint;\nuniform float uCoatSat;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float coatL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = clamp(mix(vec3(coatL), diffuseColor.rgb, uCoatSat) * uCoatTint, 0.0, 1.0);
  }`)
      // The Somali model also uses its fur texture as an emissive map — tint that too.
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float coatE = dot(totalEmissiveRadiance, vec3(0.299, 0.587, 0.114));
    totalEmissiveRadiance = max(mix(vec3(coatE), totalEmissiveRadiance, uCoatSat) * uCoatTint, 0.0);
  }`);
  };
  mat.customProgramCacheKey = () => `coat:${sat}:${coat.tint.join(',')}`;
  mat.needsUpdate = true;
}

/**
 * @param {THREE.Object3D} root
 * @param {object} breed  BREEDS entry
 * @param {string} coatId
 */
export function applyCoat(root, breed, coatId) {
  const coat = breed.coats?.[coatId] || Object.values(breed.coats || {})[0];
  if (!coat) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = list.map((m) => {
      if (!m) return m;
      const c = m.clone();
      if (breed.mats) {
        for (const [slot, names] of Object.entries(breed.mats)) {
          if (names.includes(m.name) && coat[slot]) c.color.set(coat[slot]);
        }
      } else if (c.map) {
        tintTexture(c, coat);
      }
      return c;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0];
  });
}

/** Free cloned materials when a pet leaves the scene (geometry is shared). */
export function disposeMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose?.();
  });
}

/** Swatch colour for UI chips. */
export function coatSwatch(breed, coatId) {
  const coat = breed.coats?.[coatId];
  if (!coat) return '#ccc';
  if (coat.main) return `linear-gradient(135deg, ${coat.main} 0 55%, ${coat.light} 55% 100%)`;
  const base = [0.78, 0.52, 0.33];                         // ruddy Somali, roughly
  const l = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2];
  const rgb = base.map((v, i) => Math.round(255 * Math.min(1, (l + (v - l) * (coat.sat ?? 1)) * coat.tint[i])));
  return `rgb(${rgb.join(',')})`;
}
