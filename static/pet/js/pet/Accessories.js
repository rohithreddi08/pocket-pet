// ============================================================================
// Accessories.js — hats that sit on the cat's head, for any rig.
// ----------------------------------------------------------------------------
// We find the vertices skinned mostly to the head bone, take the top of that
// cluster as the anchor and its width as the size, then parent the hat to the
// head bone so it follows every nod and tilt.
// Hats are modelled for a head 1 unit wide, nose toward +X, sitting on y = 0.
// ============================================================================
import * as THREE from 'three';
import { stripes } from '../world/textures.js';

const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
function add(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

const BUILDERS = {
  bow() {
    const g = new THREE.Group(); const pink = m('#ff7eb6', { roughness: 0.45 });
    add(g, new THREE.ConeGeometry(0.16, 0.3, 16), pink, 0, 0.05, 0.17, Math.PI / 2, 0, 0);
    add(g, new THREE.ConeGeometry(0.16, 0.3, 16), pink, 0, 0.05, -0.17, -Math.PI / 2, 0, 0);
    add(g, new THREE.SphereGeometry(0.09, 14, 10), m('#ff4f9a'), 0, 0.05, 0);
    g.position.set(0.12, 0.06, 0.2); g.rotation.x = -0.45;
    g.scale.setScalar(1.6);
    return g;
  },
  party() {
    const g = new THREE.Group();
    const tex = stripes(['#ffd43b', '#ff6b6b', '#4dabf7', '#69db7c'], 8, true);
    add(g, new THREE.ConeGeometry(0.28, 0.75, 32, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }), 0, 0.37);
    add(g, new THREE.SphereGeometry(0.09, 14, 10), m('#ffffff', { roughness: 0.9 }), 0, 0.77);
    add(g, new THREE.TorusGeometry(0.27, 0.03, 8, 24), m('#ff6b6b'), 0, 0.02, 0, Math.PI / 2);
    g.rotation.z = 0.12;
    return g;
  },
  beanie() {
    const g = new THREE.Group();
    const knit = m('#3d8bd1', { roughness: 1 });
    const cap = add(g, new THREE.SphereGeometry(0.42, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), knit, 0, 0);
    cap.scale.set(1, 0.85, 1);
    add(g, new THREE.TorusGeometry(0.41, 0.07, 10, 32), m('#f1f3f5', { roughness: 1 }), 0, 0.02, 0, Math.PI / 2);
    add(g, new THREE.SphereGeometry(0.12, 14, 10), m('#f1f3f5', { roughness: 1 }), 0, 0.4);
    return g;
  },
  flower() {
    const g = new THREE.Group();
    const petal = m('#ffffff', { roughness: 0.7 });
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2;
      const p = add(g, new THREE.SphereGeometry(0.08, 10, 8), petal, Math.cos(a) * 0.1, 0.0, Math.sin(a) * 0.1);
      p.scale.set(1.4, 0.35, 0.7); p.rotation.y = -a;
    }
    add(g, new THREE.SphereGeometry(0.06, 12, 8), m('#ffc107'), 0, 0.03, 0);
    g.position.set(0.05, 0.0, 0.3); g.rotation.set(-0.5, 0, 0.3);
    return g;
  },
  wizard() {
    const g = new THREE.Group();
    const cloth = m('#5f3dc4', { roughness: 0.8 });
    add(g, new THREE.CylinderGeometry(0.62, 0.62, 0.04, 40), cloth, 0, 0.02);
    const cone = add(g, new THREE.ConeGeometry(0.33, 1.0, 32), cloth, -0.05, 0.52);
    cone.rotation.z = 0.2;
    for (let i = 0; i < 5; i += 1) {
      const a = i * 1.3;
      add(g, new THREE.OctahedronGeometry(0.05), m('#ffd43b', { emissive: '#ffd43b', emissiveIntensity: 0.4 }), Math.cos(a) * 0.22, 0.2 + i * 0.12, Math.sin(a) * 0.22);
    }
    return g;
  },
  crown() {
    const g = new THREE.Group();
    const gold = m('#f5c542', { roughness: 0.25, metalness: 0.9 });
    add(g, new THREE.CylinderGeometry(0.3, 0.28, 0.2, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#f5c542', roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide }), 0, 0.1);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      add(g, new THREE.ConeGeometry(0.06, 0.18, 10), gold, Math.cos(a) * 0.29, 0.28, Math.sin(a) * 0.29);
      if (i % 2 === 0) add(g, new THREE.SphereGeometry(0.035, 10, 8), m(['#e03131', '#1971c2', '#2f9e44', '#9c36b5'][i / 2], { roughness: 0.1, metalness: 0.3 }), Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3);
    }
    return g;
  },
};

export class Accessories {
  /** @param {THREE.Object3D} root @param {THREE.Bone} head */
  constructor(root, head) {
    this.root = root;
    this.head = head;
    this.current = null;
    this.anchor = null;
    if (head) this._measureHead();
  }

  _measureHead() {
    const root = this.root;
    root.updateMatrixWorld(true);
    const pts = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const bi = o.skeleton.bones.indexOf(this.head);
      if (bi < 0) return;
      const si = o.geometry.getAttribute('skinIndex');
      const sw = o.geometry.getAttribute('skinWeight');
      for (let i = 0; i < si.count; i += 1) {
        let w = 0;
        for (let k = 0; k < 4; k += 1) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
        o.getVertexPosition(i, v);
        v.applyMatrix4(o.matrixWorld);
        pts.push(root.worldToLocal(v.clone()));
      }
    });
    let anchorLocal; let width;
    if (pts.length < 10) {
      // Fallback: just above the head bone.
      anchorLocal = root.worldToLocal(this.head.getWorldPosition(new THREE.Vector3()))
        .add(new THREE.Vector3(0, 0.15 / root.scale.y, 0));
      width = 0.3;
    } else {
      const box = new THREE.Box3().setFromPoints(pts);
      const c = box.getCenter(new THREE.Vector3());
      // Top of skull, nudged a bit back from the center (cats' heads slope forward).
      anchorLocal = new THREE.Vector3(c.x - (box.max.x - box.min.x) * 0.08, box.max.y, c.z);
      width = (box.max.z - box.min.z) * root.getWorldScale(new THREE.Vector3()).x * 0.85;
    }

    // Hat transform in the head bone's frame, measured once in the rest pose,
    // oriented like the cat root (nose +X, up +Y).
    const worldAnchor = root.localToWorld(anchorLocal);
    const headWorldQ = this.head.getWorldQuaternion(new THREE.Quaternion());
    const rootWorldQ = root.getWorldQuaternion(new THREE.Quaternion());
    const headScale = this.head.getWorldScale(new THREE.Vector3()).x;
    this.attach = {
      position: this.head.worldToLocal(worldAnchor.clone()),
      quaternion: headWorldQ.invert().multiply(rootWorldQ),
      scale: width / headScale,
    };
  }

  wear(id) {
    if (this.current) { this.current.parent?.remove(this.current); this.current = null; }
    if (!id || !BUILDERS[id] || !this.attach) return;
    const wrap = new THREE.Group();
    wrap.add(BUILDERS[id]());
    wrap.position.copy(this.attach.position);
    wrap.quaternion.copy(this.attach.quaternion);
    wrap.scale.setScalar(this.attach.scale);
    this.head.add(wrap);
    this.current = wrap;
  }
}
