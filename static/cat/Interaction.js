// ============================================================================
// Interaction — Raycaster hover + click on cat meshes.
// ============================================================================
import * as THREE from 'three';

export class Interaction {
  /**
   * @param {object} args
   * @param {HTMLCanvasElement} args.canvas
   * @param {THREE.Camera} args.camera
   * @param {THREE.Object3D} args.root
   * @param {(hit: THREE.Intersection) => void} [args.onPick]
   * @param {(hit: THREE.Intersection) => void} [args.onHover]
   */
  constructor({ canvas, camera, root, onPick, onHover }) {
    this.canvas    = canvas;
    this.camera    = camera;
    this.raycaster = new THREE.Raycaster();
    this.pointer   = new THREE.Vector2(-10, -10);
    this.pickables = [];
    this.onPick    = onPick;
    this.onHover   = onHover;
    this._isOver   = false;

    root.traverse((o) => { if (o.isMesh) this.pickables.push(o); });

    canvas.addEventListener('pointermove', (e) => this._onMove(e));
    canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    canvas.addEventListener('pointerleave', () => {
      this.pointer.set(-10, -10);
      this._isOver = false;
      canvas.style.cursor = '';
    });
  }

  _onMove(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
    this.pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1;

    const hit = this._pick();
    const wasOver = this._isOver;
    this._isOver = !!hit;
    this.canvas.style.cursor = this._isOver ? 'pointer' : '';

    if (this._isOver && !wasOver && this.onHover) this.onHover(hit);
  }

  _onDown() {
    const hit = this._pick();
    if (hit && this.onPick) this.onPick(hit);
  }

  _pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return hits.length ? hits[0] : null;
  }
}