// ============================================================================
// House.js — four rooms side by side, joined by doorways:
//
//   x:   0            8            16           24
//      [Living] ⇄ [Kitchen] ⇄ [Bathroom] ⇄ [Bedroom]
//
// Each room is 8 wide × 6 deep, back wall at z = -3, open toward the camera.
// The camera slides between rooms; the cat walks through the doorways.
// Everything is built from primitives + canvas textures.
// ============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { OUR_WINDOWS } from './Outdoor.js';

export const ROOM_W = 8;
export const ROOM_D = 6;
const WALL_H = 6;            // tall enough that a portrait camera never sees the top
const DOOR = { z0: -2.05, z1: -0.65, h: 2.35 };    // doorway gap in the side walls
export const DOOR_Z = (DOOR.z0 + DOOR.z1) / 2;

export const ROOMS = [
  { id: 'living',   name: 'Living Room', icon: '🛋️', floor: 'wood',  pattern: 'leaves' },
  { id: 'kitchen',  name: 'Kitchen',     icon: '🍳', floor: 'check', pattern: 'dots' },
  { id: 'bathroom', name: 'Bathroom',    icon: '🛁', floor: 'tile',  pattern: 'stripes' },
  { id: 'bedroom',  name: 'Bedroom',     icon: '🛏️', floor: 'wood2', pattern: 'stars' },
];

// --------------------------------------------------------------------------
// small builders
// --------------------------------------------------------------------------
const matCache = new Map();
function mat(color, { rough = 0.75, metal = 0, map = null, emissive = null, ei = 1, transparent = false, opacity = 1 } = {}) {
  const key = map || emissive || transparent ? null : `${color}|${rough}|${metal}`;
  if (key && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map, transparent, opacity });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  if (key) matCache.set(key, m);
  return m;
}

function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);

function plant(scale = 1, potColor = '#d98e6b') {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.22, 0.17, 0.4), mat(potColor, { rough: 0.6 }), { y: 0.2 }));
  g.add(mesh(cyl(0.2, 0.2, 0.04), mat('#5b3d2a', { rough: 1 }), { y: 0.39 }));
  const leaf = mat('#5f9e6e', { rough: 0.7 });
  const leaf2 = mat('#76b783', { rough: 0.7 });
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const l = mesh(new THREE.SphereGeometry(0.16, 12, 8), i % 2 ? leaf : leaf2, {
      x: Math.cos(a) * 0.14, y: 0.62 + (i % 3) * 0.12, z: Math.sin(a) * 0.14,
    });
    l.scale.set(0.7, 1.6, 0.35);
    l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    g.add(l);
  }
  g.scale.setScalar(scale);
  return g;
}

function frame(texture, w = 0.8, h = 0.6, color = '#8a5a44') {
  const g = new THREE.Group();
  g.add(mesh(rbox(w + 0.1, h + 0.1, 0.05, 0.02), mat(color, { rough: 0.5 }), { cast: false }));
  g.add(mesh(new THREE.PlaneGeometry(w, h), mat('#ffffff', { map: texture, rough: 0.9 }), { z: 0.03, cast: false }));
  return g;
}

function windowUnit(skyTex, w = 1.8, h = 1.4, frameColor = '#ffffff', curtain = '#e9a178') {
  const g = new THREE.Group();
  // clear glass: the street outside (Outdoor.js) shows through the opening in the wall
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), skyTex
    ? new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false })
    : new THREE.MeshStandardMaterial({ color: '#e8f3f8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false }));
  glass.position.z = 0.01;
  glass.renderOrder = 2;
  g.add(glass);
  const fm = mat(frameColor, { rough: 0.5 });
  g.add(mesh(box(w + 0.16, 0.08, 0.12), fm, { y: h / 2 + 0.04 }));
  g.add(mesh(box(w + 0.3, 0.08, 0.22), fm, { y: -h / 2 - 0.04, z: 0.05 }));     // sill
  g.add(mesh(box(0.08, h, 0.12), fm, { x: -w / 2 - 0.04 }));
  g.add(mesh(box(0.08, h, 0.12), fm, { x: w / 2 + 0.04 }));
  g.add(mesh(box(0.05, h, 0.06), fm, { z: 0.03 }));
  g.add(mesh(box(w, 0.05, 0.06), fm, { z: 0.03 }));
  // curtains + rod
  const cm = mat(curtain, { rough: 0.95 });
  for (const s of [-1, 1]) {
    const c = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      c.add(mesh(cyl(0.07, 0.09, h + 0.5, 10), cm, { x: i * 0.11, y: 0, cast: false }));
    }
    c.position.set(s * (w / 2 + 0.15) - (s > 0 ? 0 : 0.33), 0.1, 0.12);
    g.add(c);
  }
  g.add(mesh(cyl(0.025, 0.025, w + 1.1, 8), mat('#6d4c3d', { rough: 0.4, metal: 0.3 }), { y: h / 2 + 0.33, z: 0.14, rz: Math.PI / 2, cast: false }));
  return g;
}

// --------------------------------------------------------------------------
export class House {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rooms = ROOMS.map((r, i) => ({ ...r, index: i, cx: i * ROOM_W, spots: {}, lightsOn: true }));
    this.interactables = [];      // {object, id, room}
    this.perches = [];            // high places the cat jumps onto
    this.windows = [];            // windows the cat likes to watch birds from
    this.floors = [];             // for laser-pointer raycasts
    this.wallMats = [];           // per room, for themes
    this.skies = [];
    this.lamps = [];              // bedroom lamp etc.
    this.garlands = [];

    this._buildShell();
    this._buildLiving(this.rooms[0]);
    this._buildKitchen(this.rooms[1]);
    this._buildBathroom(this.rooms[2]);
    this._buildBedroom(this.rooms[3]);
    this._buildCage(this.rooms[0]);
    this._buildLights();
    this._updateClock(true);
    this.species = 'cat';
    this.setAccident(null);          // creates the (hidden) puddle so it's clickable later
    this.current = 0;
    this._lightLevel = 1;
  }

  // ------------------------------------------------------------------ shell
  _buildShell() {
    const floorTex = {
      wood: T.woodFloor('#c99a6b', [2.5, 2]),
      check: T.tiles('#f6f0e4', '#86c5b9', { size: 8, repeat: [2, 1.5] }),
      tile: T.tiles('#e8f4f8', '#cfe6ef', { checker: false, size: 8, grout: '#b9d4de', repeat: [3, 2.2] }),
      wood2: T.woodFloor('#a8775a', [2.5, 2]),
    };
    const outerWall = mat('#e6dccb', { rough: 0.9 });

    for (const room of this.rooms) {
      const { cx } = room;
      // The floor runs past the open front of the room so tall (portrait)
      // camera views never look off its edge into the void.
      const FRONT = 7;
      const floorGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D + FRONT);
      floorGeo.translate(0, -FRONT / 2, 0);                    // extend toward +z after the -90° tilt
      floorTex[room.floor].repeat.y = floorTex[room.floor].repeat.x * ((ROOM_D + FRONT) / ROOM_W);
      const floor = mesh(floorGeo, mat('#ffffff', { map: floorTex[room.floor], rough: 0.7 }), { x: cx, rx: -Math.PI / 2, cast: false });
      floor.userData.room = room.index;
      this.group.add(floor);
      this.floors.push(floor);

      const wm = mat('#ffffff', { rough: 0.95 });
      this.wallMats.push(wm);
      // the back wall, with real openings where the windows are (the street is drawn behind it)
      const shape = new THREE.Shape();
      shape.moveTo(-ROOM_W / 2, 0); shape.lineTo(ROOM_W / 2, 0); shape.lineTo(ROOM_W / 2, WALL_H); shape.lineTo(-ROOM_W / 2, WALL_H); shape.lineTo(-ROOM_W / 2, 0);
      const reveal = mat('#f1ebe0', { rough: 0.9 });
      for (const [wx, wy, ww, wh] of OUR_WINDOWS) {
        if (wx < cx - ROOM_W / 2 || wx > cx + ROOM_W / 2) continue;
        const lx = wx - cx;
        const hole = new THREE.Path();
        hole.moveTo(lx - ww / 2, wy - wh / 2); hole.lineTo(lx + ww / 2, wy - wh / 2); hole.lineTo(lx + ww / 2, wy + wh / 2); hole.lineTo(lx - ww / 2, wy + wh / 2); hole.lineTo(lx - ww / 2, wy - wh / 2);
        shape.holes.push(hole);
        // reveals: the wall's thickness around the opening, out to the outside face
        const depth = 0.34; const zc = -ROOM_D / 2 - depth / 2;
        this.group.add(mesh(box(ww, 0.02, depth), reveal, { x: wx, y: wy - wh / 2, z: zc, cast: false }));
        this.group.add(mesh(box(ww, 0.02, depth), reveal, { x: wx, y: wy + wh / 2, z: zc, cast: false }));
        this.group.add(mesh(box(0.02, wh, depth), reveal, { x: wx - ww / 2, y: wy, z: zc, cast: false }));
        this.group.add(mesh(box(0.02, wh, depth), reveal, { x: wx + ww / 2, y: wy, z: zc, cast: false }));
      }
      const wallGeo = new THREE.ShapeGeometry(shape);
      { // UVs across the whole wall, as the old plane had
        const pos = wallGeo.attributes.position; const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i += 1) { uv[i * 2] = (pos.getX(i) + ROOM_W / 2) / ROOM_W; uv[i * 2 + 1] = pos.getY(i) / WALL_H; }
        wallGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      const back = mesh(wallGeo, wm, { x: cx, y: 0, z: -ROOM_D / 2, cast: false });
      this.group.add(back);
      // baseboard + crown trim
      this.group.add(mesh(box(ROOM_W, 0.16, 0.05), mat('#fbf7f0', { rough: 0.6 }), { x: cx, y: 0.08, z: -ROOM_D / 2 + 0.025, cast: false }));

      // Side walls with doorways (shared walls between rooms; solid outer walls).
      for (const side of [-1, 1]) {
        const wx = cx + side * ROOM_W / 2;
        const isOuter = (side < 0 && room.index === 0) || (side > 0 && room.index === this.rooms.length - 1);
        if (side < 0 && !isOuter) continue;                 // shared wall built once, by the room on its left
        const t = 0.18;
        const m = isOuter ? outerWall : mat('#efe6d6', { rough: 0.9 });
        if (isOuter) {
          this.group.add(mesh(box(t, WALL_H, ROOM_D + 5), m, { x: wx, y: WALL_H / 2, z: 2.5, cast: false }));
        } else {
          const backLen = DOOR.z0 + ROOM_D / 2;
          const frontLen = ROOM_D / 2 + 2.5 - DOOR.z1;           // runs a bit past the room front
          this.group.add(mesh(box(t, WALL_H, backLen), m, { x: wx, y: WALL_H / 2, z: -ROOM_D / 2 + backLen / 2, cast: false }));
          this.group.add(mesh(box(t, WALL_H, frontLen), m, { x: wx, y: WALL_H / 2, z: DOOR.z1 + frontLen / 2, cast: false }));
          this.group.add(mesh(box(t, WALL_H - DOOR.h, DOOR.z1 - DOOR.z0), m, { x: wx, y: DOOR.h + (WALL_H - DOOR.h) / 2, z: DOOR_Z, cast: false }));
          // door frame
          const fm = mat('#fbf7f0', { rough: 0.5 });
          this.group.add(mesh(box(t + 0.08, 0.1, DOOR.z1 - DOOR.z0 + 0.2), fm, { x: wx, y: DOOR.h + 0.05, z: DOOR_Z, cast: false }));
          for (const z of [DOOR.z0 - 0.05, DOOR.z1 + 0.05]) {
            this.group.add(mesh(box(t + 0.08, DOOR.h, 0.1), fm, { x: wx, y: DOOR.h / 2, z, cast: false }));
          }
        }
      }
      room.home = new THREE.Vector3(cx, 0, 0.35);
      room.bounds = { x0: cx - ROOM_W / 2 + 0.6, x1: cx + ROOM_W / 2 - 0.6, z0: -1.4, z1: 1.9 };
    }
    this.applyTheme(['#f3e6d3', '#f6efe2', '#dfeef0', '#e8e1f2']);
  }

  applyTheme(colors) {
    this.rooms.forEach((room, i) => {
      const old = this.wallMats[i].map;
      this.wallMats[i].map = T.wallpaper(colors[i % colors.length], room.pattern, [4, 3]);
      this.wallMats[i].needsUpdate = true;
      old?.dispose();
    });
  }

  _interactive(object, id, room) {
    object.traverse((o) => { if (o.isMesh) o.userData.interactive = id; });
    this.interactables.push({ object, id, room });
  }

  // ------------------------------------------------------------------ rooms
  _buildLiving(room) {
    const { cx } = room;
    const g = new THREE.Group(); g.position.x = cx; this.group.add(g);

    // Sofa
    const sofaC = mat('#5e9c9a', { rough: 0.9 });
    const sofaD = mat('#4b8382', { rough: 0.9 });
    const sofa = new THREE.Group();
    sofa.add(mesh(rbox(2.6, 0.42, 0.95, 0.1), sofaD, { y: 0.32 }));
    sofa.add(mesh(rbox(2.6, 0.8, 0.28, 0.12), sofaC, { y: 0.82, z: -0.36 }));
    for (const s of [-1, 1]) sofa.add(mesh(rbox(0.28, 0.62, 0.95, 0.12), sofaC, { x: s * 1.3, y: 0.52 }));
    for (const s of [-1, 1]) sofa.add(mesh(rbox(1.1, 0.2, 0.75, 0.09), sofaC, { x: s * 0.57, y: 0.62, z: 0.05 }));
    sofa.add(mesh(rbox(0.42, 0.42, 0.14, 0.07), mat('#f2cc8f', { rough: 0.95 }), { x: -0.75, y: 0.9, z: -0.15, rz: 0.2 }));
    for (const s of [-1, 1]) sofa.add(mesh(cyl(0.04, 0.03, 0.12, 8), mat('#5b3d2a'), { x: s * 1.2, y: 0.06, z: 0.35 }));
    sofa.position.set(-1.9, 0, -2.4);
    g.add(sofa);

    // Rug, art, window
    g.add(mesh(new THREE.CircleGeometry(1.75, 48), mat('#ffffff', { map: T.rug(['#e9a178', '#f4d6a0', '#8fc1b5']), rough: 1 }), { y: 0.005, z: 0.4, rx: -Math.PI / 2, cast: false }));
    const a1 = frame(T.art('paw'), 0.6, 0.6); a1.position.set(-2.5, 2.25, -2.97); g.add(a1);
    const a2 = frame(T.art('hills'), 0.8, 0.55); a2.position.set(-1.35, 2.1, -2.97); g.add(a2);
    const win = windowUnit(null, 2.8, 2.2, '#ffffff', '#e9a178'); win.position.set(1.5, 2.55, -2.94); g.add(win);

    // Cat tree (scratching post) — left
    const tree = new THREE.Group();
    const sisal = mat('#d8b98a', { rough: 1 });
    const carpet = mat('#a3c4bc', { rough: 1 });
    tree.add(mesh(rbox(0.9, 0.1, 0.9, 0.04), carpet, { y: 0.05 }));
    tree.add(mesh(cyl(0.09, 0.09, 1.6, 16), sisal, { y: 0.85 }));
    tree.add(mesh(rbox(0.7, 0.08, 0.7, 0.04), carpet, { y: 0.9 }));
    tree.add(mesh(rbox(1.15, 0.1, 1.0, 0.05), carpet, { y: 1.64 }));   // top perch, big enough to sit on
    const toy = mesh(new THREE.SphereGeometry(0.07, 12, 8), mat('#e07a5f', { rough: 0.8 }), { x: 0.3, y: 1.32 });
    tree.add(toy);
    tree.add(mesh(cyl(0.005, 0.005, 0.3, 4), mat('#333'), { x: 0.3, y: 1.49, cast: false }));
    tree.position.set(-3.1, 0, -0.3);
    g.add(tree);
    this._treeToy = toy;

    // Floor lamp (front-left) and plant (back-right)
    const lamp = new THREE.Group();
    lamp.add(mesh(cyl(0.18, 0.2, 0.05), mat('#3d405b', { rough: 0.4, metal: 0.5 }), { y: 0.025 }));
    lamp.add(mesh(cyl(0.02, 0.02, 1.7, 8), mat('#3d405b', { rough: 0.4, metal: 0.5 }), { y: 0.87 }));
    lamp.add(mesh(cyl(0.18, 0.3, 0.35, 24, 1), mat('#fff3d6', { rough: 0.9, emissive: '#ffd89a', ei: 0.4 }), { y: 1.8 }));
    lamp.position.set(-3.3, 0, 1.2);
    g.add(lamp);
    const p = plant(1.1); p.position.set(3.35, 0, -2.55); g.add(p);
    const p2 = plant(0.8, '#81b29a'); p2.position.set(2.85, 0, -2.6); g.add(p2);

    // Ball (interactive, simulated in update())
    const ball = mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshStandardMaterial({ map: T.beachBall(), roughness: 0.35 }), { x: cx + 1.6, y: 0.2, z: 1.0 });
    this.group.add(ball);
    this.ball = { mesh: ball, vel: new THREE.Vector3(), room: 0, r: 0.2 };
    this._interactive(ball, 'ball', 0);

    room.spots = { window: new THREE.Vector3(cx + 1.5, 0, -1.0), tree: new THREE.Vector3(cx - 2.0, 0, 0.1), sofa: new THREE.Vector3(cx - 1.2, 0, -1.0) };
    // High places a cat jumps onto (ground = take-off point, top = where it sits).
    this.perches.push(
      { room: 0, name: 'the cat tree', ground: new THREE.Vector3(cx - 2.0, 0, 0.1), top: new THREE.Vector3(cx - 3.1, 1.69, -0.3), nap: true },
      { room: 0, name: 'the sofa', ground: new THREE.Vector3(cx - 1.6, 0, -1.2), top: new THREE.Vector3(cx - 1.6, 0.72, -2.3), nap: true, dog: true },
    );
    this.windows.push({ room: 0, spot: new THREE.Vector3(cx + 1.5, 0, -1.0), glass: new THREE.Vector3(cx + 1.5, 2.55, -2.9) });
    this.catTree = tree;

    // Front door on the left wall (walks start here).
    const door = new THREE.Group();
    const doorMat = mat('#8d5b3e', { rough: 0.55 });
    const leaf = new THREE.Group();
    leaf.add(mesh(rbox(0.08, 2.15, 0.95, 0.02), doorMat, { z: 0.475 }));
    for (const [y, h] of [[1.55, 0.7], [0.65, 0.8]]) leaf.add(mesh(box(0.1, h, 0.7), mat('#7a4c33', { rough: 0.6 }), { y: y - 1.075, z: 0.475, cast: false }));
    leaf.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), mat('#d9c6a5', { rough: 0.3, metal: 0.7 }), { x: 0.07, y: -0.05, z: 0.85 }));
    leaf.position.set(0, 1.075, -0.475);
    door.add(leaf);
    door.add(mesh(box(0.14, 0.12, 1.15), mat('#fbf7f0', { rough: 0.5 }), { y: 2.2, cast: false }));
    for (const z of [-0.53, 0.53]) door.add(mesh(box(0.14, 2.2, 0.1), mat('#fbf7f0', { rough: 0.5 }), { y: 1.1, z, cast: false }));
    door.add(mesh(rbox(0.7, 0.02, 1.0, 0.01), mat('#c9a66b', { rough: 1 }), { x: 0.4, y: 0.01, cast: false }));   // doormat
    // a leash on a hook
    door.add(mesh(cyl(0.012, 0.012, 0.9, 6), mat('#e07a5f', { rough: 0.6 }), { x: 0.09, y: 1.45, z: 0.8, cast: false }));
    door.position.set(-ROOM_W / 2 + 0.1, 0, -1.7);
    g.add(door);
    this._doorLeaf = leaf;
    this._doorOpen = 0; this._doorTarget = 0;
    this._interactive(door, 'door', 0);
    this.frontDoor = {
      inside: new THREE.Vector3(cx - 2.85, 0, -1.45),
      outside: new THREE.Vector3(cx - 4.9, 0, -1.7),
      face: new THREE.Vector3(cx - 5, 0, -1.5),
    };
  }


  // ------------------------------------------------------------------ hamster tank
  /**
   * A glass tank on a low cabinet in the living room: the home a hamster
   * actually needs: at least 100 x 50 cm of floor (RSPCA / Blue Cross guidance), deep
   * paper bedding to burrow in, a solid wheel of 28 cm or more, a hide, a sand
   * bath, a chew, a bowl and a water bottle. 1 world unit is about 30 cm.
   */
  _buildCage(room) {
    const W = 3.4; const D = 1.7; const H = 1.35; const STAND = 0.62; const BED = 0.34;
    const g = new THREE.Group();
    g.position.set(room.cx + 1.05, 0, -1.72);
    g.visible = false;
    this.group.add(g);
    const wood = mat('#b98a5e', { rough: 0.7 });
    g.add(mesh(rbox(W + 0.3, STAND, D + 0.25, 0.05), mat('#f1e6d6', { rough: 0.6 }), { y: STAND / 2 }));
    for (const s of [-1, 1]) g.add(mesh(box(0.02, STAND - 0.16, 0.02), mat('#d9c6a5', { rough: 0.3, metal: 0.6 }), { x: s * 0.6, y: STAND / 2, z: (D + 0.25) / 2 + 0.01, cast: false }));
    const y0 = STAND;
    g.add(mesh(box(W + 0.06, 0.06, D + 0.06), mat('#4a4e69', { rough: 0.5 }), { y: y0 + 0.03 }));
    const glass = new THREE.MeshStandardMaterial({ color: '#e8f4f8', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false });
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.PlaneGeometry(W, H), glass, { y: y0 + H / 2, z: s * D / 2, ry: s < 0 ? 0 : Math.PI, cast: false, receive: false }));
      g.add(mesh(new THREE.PlaneGeometry(D, H), glass, { x: s * W / 2, y: y0 + H / 2, ry: s * Math.PI / 2, cast: false, receive: false }));
    }
    const edge = mat('#4a4e69', { rough: 0.5 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(box(0.05, H, 0.05), edge, { x: x * W / 2, y: y0 + H / 2, z: z * D / 2, cast: false }));
    for (const z of [-1, 1]) g.add(mesh(box(W, 0.05, 0.05), edge, { y: y0 + H, z: z * D / 2, cast: false }));
    for (const x of [-1, 1]) g.add(mesh(box(0.05, 0.05, D), edge, { x: x * W / 2, y: y0 + H, cast: false }));
    const bar = mat('#9aa0a6', { rough: 0.4, metal: 0.7 });
    for (let i = 1; i < 28; i += 1) g.add(mesh(box(0.012, 0.012, D), bar, { x: -W / 2 + (i * W) / 28, y: y0 + H, cast: false }));
    // Bedding: deep, so it can burrow, with a few mounds and some hay.
    const bedTop = y0 + 0.06 + BED;
    const bedMat = mat('#efe2c4', { rough: 1 });
    g.add(mesh(box(W - 0.02, BED, D - 0.02), bedMat, { y: y0 + 0.06 + BED / 2, cast: false }));
    for (const [x, z, r] of [[-0.55, -0.55, 0.35], [0.45, 0.6, 0.26], [-1.25, 0.55, 0.3], [0.85, -0.65, 0.22]]) {
      const m = mesh(new THREE.SphereGeometry(r, 14, 8), bedMat, { x, y: bedTop - r * 0.75, z, cast: false });
      m.scale.y = 0.45; g.add(m);
    }
    const hay = mat('#c9b26a', { rough: 1 });
    for (let i = 0; i < 18; i += 1) {
      g.add(mesh(box(0.18, 0.012, 0.012), hay, { x: -1.4 + Math.random() * 2.8, y: bedTop + 0.01, z: -0.7 + Math.random() * 1.4, ry: Math.random() * 3, cast: false }));
    }
    const Y = bedTop;
    // Hide, door facing the front glass.
    const hide = new THREE.Group();
    const hw = 0.95; const hh = 0.5; const hd = 0.62;
    hide.add(mesh(box(hw + 0.08, 0.05, hd + 0.08), wood, { y: hh }));
    hide.add(mesh(box(hw, hh, 0.04), wood, { z: -hd / 2 }));
    for (const s of [-1, 1]) hide.add(mesh(box(0.04, hh, hd), wood, { x: s * hw / 2 }));
    for (const s of [-1, 1]) hide.add(mesh(box(hw * 0.3, hh, 0.04), wood, { x: s * hw * 0.35, z: hd / 2 }));
    hide.add(mesh(box(hw * 0.4, hh * 0.35, 0.04), wood, { y: hh * 0.82, z: hd / 2 }));
    hide.add(mesh(new THREE.CircleGeometry(0.22, 16), mat('#cbb48a', { rough: 1 }), { y: 0.02, rx: -Math.PI / 2, cast: false }));
    hide.position.set(-1.05, Y - 0.02, -0.28);
    g.add(hide);
    // Wheel: solid running surface, 30 cm across.
    const wheelR = 0.5;
    const wheel = new THREE.Group();
    const wm = mat('#7fb3d5', { rough: 0.45 });
    wheel.add(mesh(cyl(wheelR, wheelR, 0.04, 32), wm, { rx: Math.PI / 2, z: -0.2 }));
    wheel.add(mesh(new THREE.TorusGeometry(wheelR - 0.015, 0.025, 8, 40), wm, { z: 0.2 }));
    wheel.add(mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.4, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#a9cce3', roughness: 0.6, side: THREE.DoubleSide }), { rx: Math.PI / 2 }));
    for (let i = 0; i < 6; i += 1) wheel.add(mesh(box(0.03, wheelR * 1.9, 0.02), mat('#5d8aa8', { rough: 0.5 }), { z: -0.17, rz: (i / 6) * Math.PI }));
    const wheelHolder = new THREE.Group();
    wheelHolder.add(mesh(box(0.08, wheelR + 0.08, 0.08), mat('#5d8aa8'), { y: (wheelR + 0.08) / 2, z: -0.28 }));
    wheelHolder.add(mesh(box(0.6, 0.04, 0.5), mat('#5d8aa8'), { y: 0.02, z: -0.1 }));
    wheel.position.set(0, wheelR + 0.05, 0);
    wheelHolder.add(wheel);
    wheelHolder.position.set(1.15, Y - 0.04, -0.25);
    g.add(wheelHolder);
    // Sand bath, bowl, bottle, chew, toilet corner.
    g.add(mesh(cyl(0.3, 0.26, 0.1, 24), mat('#e9ecef', { rough: 0.3 }), { x: -0.2, y: Y + 0.03, z: -0.48 }));
    const sand = mesh(cyl(0.27, 0.27, 0.02, 24), mat('#e6cf9c', { rough: 1 }), { x: -0.2, y: Y + 0.075, z: -0.48, cast: false });
    g.add(sand);
    g.add(mesh(cyl(0.15, 0.13, 0.08, 20), mat('#f2a65a', { rough: 0.35 }), { x: 0.05, y: Y + 0.02, z: 0.48 }));
    const hFood = mesh(cyl(0.12, 0.12, 0.03, 16), mat('#c9a46b', { rough: 1 }), { x: 0.05, y: Y + 0.06, z: 0.48, cast: false });
    g.add(hFood);
    const bottle = new THREE.Group();
    bottle.add(mesh(cyl(0.075, 0.075, 0.42, 16), new THREE.MeshStandardMaterial({ color: '#cfe8f7', roughness: 0.05, transparent: true, opacity: 0.4 }), { y: 0.3 }));
    const hWater = mesh(cyl(0.065, 0.065, 0.38, 16), new THREE.MeshStandardMaterial({ color: '#7cc6f2', roughness: 0.05, transparent: true, opacity: 0.8 }), { y: 0.28, cast: false });
    bottle.add(hWater);
    bottle.add(mesh(cyl(0.012, 0.012, 0.16, 8), bar, { y: 0.05, rx: 0.4, z: 0.03 }));
    bottle.position.set(0.4, Y, -D / 2 + 0.1);
    g.add(bottle);
    g.add(mesh(cyl(0.06, 0.07, 0.6, 10), mat('#8d6e4f', { rough: 0.9 }), { x: 0.75, y: Y + 0.05, z: 0.45, rz: Math.PI / 2, ry: 0.4 }));
    g.add(mesh(new THREE.CircleGeometry(0.22, 16), mat('#d9c08a', { rough: 1 }), { x: -1.48, y: Y + 0.005, z: 0.6, rx: -Math.PI / 2, cast: false }));
    const pee = [];
    const peeMat = mat('#a8875a', { rough: 1 });
    for (let i = 0; i < 5; i += 1) {
      const c = mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.02, 8, 6), peeMat, { x: -1.48 + (Math.random() - 0.5) * 0.25, y: Y + 0.01, z: 0.6 + (Math.random() - 0.5) * 0.25, cast: false });
      c.scale.y = 0.4; c.visible = false; g.add(c); pee.push(c);
    }
    this._interactive(g, 'cage', room.index);
    g.updateMatrixWorld(true);
    const w = (x, z, y = Y) => g.localToWorld(new THREE.Vector3(x, y, z));
    this.cage = {
      group: g, floorY: Y, wheel, wheelR, wheelSpin: 0, wheelDriven: false, food: hFood, water: hWater, sand, clumps: pee,
      center: w(0, 0, y0 + H * 0.3),
      bounds: { x0: g.position.x - W / 2 + 0.25, x1: g.position.x + W / 2 - 0.25, z0: g.position.z - D / 2 + 0.22, z1: g.position.z + D / 2 - 0.22 },
      spots: {
        nest: w(-1.05, -0.32), door: w(-1.05, 0.22), wheel: w(1.15, -0.25, Y + 0.06), wheelFront: w(1.15, 0.4),
        bowl: w(0.05, 0.25), bottle: w(0.4, -0.5), sand: w(-0.2, -0.48, Y + 0.08), chew: w(0.55, 0.3),
        toilet: w(-1.48, 0.6), front: w(0, 0.6),
      },
    };
  }

  openDoor(open) { this._doorTarget = open ? 1 : 0; }

  _buildKitchen(room) {
    const { cx } = room;
    const g = new THREE.Group(); g.position.x = cx; this.group.add(g);

    const cab = mat('#7cb5a8', { rough: 0.6 });
    const top = mat('#f5efe6', { rough: 0.35 });
    const handle = mat('#d9c6a5', { rough: 0.3, metal: 0.6 });
    // Backsplash band
    g.add(mesh(new THREE.PlaneGeometry(5.1, 0.75), mat('#ffffff', { map: T.tiles('#ffffff', '#e6f1ee', { size: 6, checker: false, grout: '#d8e3df', repeat: [5, 0.75] }), rough: 0.4 }), { x: -1.3, y: 1.32, z: -2.99, cast: false }));
    // Base cabinets + counter
    g.add(mesh(rbox(5.1, 0.88, 0.66, 0.03), cab, { x: -1.3, y: 0.44, z: -2.66 }));
    g.add(mesh(rbox(5.2, 0.07, 0.72, 0.02), top, { x: -1.3, y: 0.92, z: -2.64 }));
    for (let i = 0; i < 6; i += 1) {
      const x = -3.55 + i * 0.85 + 0.42;
      g.add(mesh(box(0.78, 0.7, 0.02), mat('#88bfb3', { rough: 0.55 }), { x, y: 0.45, z: -2.32, cast: false }));
      g.add(mesh(box(0.2, 0.03, 0.03), handle, { x, y: 0.72, z: -2.3, cast: false }));
    }
    // Sink + faucet
    g.add(mesh(box(0.7, 0.03, 0.42), mat('#c9d6dc', { rough: 0.2, metal: 0.8 }), { x: -2.2, y: 0.955, z: -2.62, cast: false }));
    const faucet = new THREE.Group();
    faucet.add(mesh(cyl(0.025, 0.03, 0.3, 10), handle, { y: 0.15 }));
    faucet.add(mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 16, Math.PI), handle, { y: 0.3, x: 0.1, rz: 0 }));
    faucet.position.set(-2.3, 0.95, -2.85); g.add(faucet);
    // Stove
    g.add(mesh(box(0.8, 0.02, 0.5), mat('#2b2d42', { rough: 0.3 }), { x: -0.1, y: 0.965, z: -2.62, cast: false }));
    for (const [x, z] of [[-0.3, -2.5], [0.1, -2.5], [-0.3, -2.75], [0.1, -2.75]]) {
      g.add(mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 20), mat('#555b6e', { rough: 0.5 }), { x, y: 0.98, z, rx: Math.PI / 2, cast: false }));
    }
    // Pot on stove
    g.add(mesh(cyl(0.16, 0.14, 0.2, 20), mat('#e07a5f', { rough: 0.35, metal: 0.2 }), { x: 0.1, y: 1.08, z: -2.6 }));
    // Upper cabinets
    for (let i = 0; i < 3; i += 1) {
      g.add(mesh(rbox(0.95, 0.75, 0.38, 0.03), cab, { x: -0.25 + (i - 1) * 1.0, y: 2.55, z: -2.8 }));
    }
    // Window above sink
    const win = windowUnit(null, 2.2, 1.45, '#ffffff', '#f2cc8f'); win.position.set(-2.4, 2.45, -2.94); g.add(win);
    // Fridge (interactive)
    const fridge = new THREE.Group();
    const fm = mat('#eaf4f1', { rough: 0.35, metal: 0.1 });
    fridge.add(mesh(rbox(1.05, 2.2, 0.78, 0.08), fm, { y: 1.1 }));
    fridge.add(mesh(box(1.0, 0.02, 0.02), mat('#bccfca'), { y: 1.45, z: 0.39, cast: false }));
    fridge.add(mesh(rbox(0.05, 0.5, 0.06, 0.02), handle, { x: -0.38, y: 1.75, z: 0.42 }));
    fridge.add(mesh(rbox(0.05, 0.7, 0.06, 0.02), handle, { x: -0.38, y: 1.0, z: 0.42 }));
    const magnetCols = ['#e07a5f', '#f2cc8f', '#81b29a', '#3d405b'];
    magnetCols.forEach((c, i) => fridge.add(mesh(cyl(0.05, 0.05, 0.02, 12), mat(c, { rough: 0.4 }), { x: 0.1 + (i % 2) * 0.2, y: 1.75 + Math.floor(i / 2) * 0.18, z: 0.4, rx: Math.PI / 2, cast: false })));
    const note = frame(T.art('fish', '#fffbe9'), 0.22, 0.22, '#f2cc8f'); note.position.set(0.2, 1.1, 0.41); fridge.add(note);
    fridge.position.set(2.35, 0, -2.45);
    g.add(fridge);
    this._interactive(fridge, 'fridge', room.index);

    // Food + water bowls on a mat. Their contents show how full they are.
    g.add(mesh(rbox(1.25, 0.02, 0.6, 0.01), mat('#e07a5f', { rough: 0.9 }), { x: 1.0, y: 0.01, z: -1.35, cast: false }));
    const bowlGeo = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0.21, 0.11), new THREE.Vector2(0.18, 0.12), new THREE.Vector2(0.15, 0.03), new THREE.Vector2(0, 0.03)], 24);
    const makeBowl = (x, color, fillMat) => {
      const b = new THREE.Mesh(bowlGeo, mat(color, { rough: 0.3 }));
      b.position.set(x, 0.02, -1.35); b.castShadow = true; g.add(b);
      const fill = new THREE.Mesh(cyl(0.165, 0.15, 0.08, 24), fillMat);
      fill.position.set(cx + x, 0.06, -1.35);
      this.group.add(fill);
      return fill;
    };
    this.bowls = {
      food: makeBowl(0.7, '#3d8bd1', mat('#9c6b3f', { rough: 0.9 })),
      water: makeBowl(1.32, '#e9ecef', new THREE.MeshStandardMaterial({ color: '#7cc6f2', roughness: 0.05, transparent: true, opacity: 0.85 })),
      kibble: mat('#b5835a', { rough: 1 }),
      wet: mat('#8a4b2f', { rough: 0.6 }),
    };
    this.setBowls(0, 70, null);
    // Table + chair (front-left)
    const wood = mat('#b98b67', { rough: 0.6 });
    g.add(mesh(cyl(0.55, 0.55, 0.05, 32), wood, { x: -2.6, y: 0.78, z: 0.3 }));
    g.add(mesh(cyl(0.05, 0.08, 0.76, 10), wood, { x: -2.6, y: 0.39, z: 0.3 }));
    g.add(mesh(cyl(0.3, 0.3, 0.03, 20), wood, { x: -2.6, y: 0.015, z: 0.3 }));
    g.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), mat('#e63946', { rough: 0.4 }), { x: -2.45, y: 0.88, z: 0.25 }));
    g.add(mesh(new THREE.SphereGeometry(0.09, 12, 8), mat('#ffd166', { rough: 0.4 }), { x: -2.7, y: 0.87, z: 0.4 }));

    room.spots = { bowl: new THREE.Vector3(cx + 1.0, 0, -0.5), fridge: new THREE.Vector3(cx + 1.6, 0, -1.0) };
    // Where the cat stands to eat/drink, and what it faces.
    this.feeding = {
      food: { stand: new THREE.Vector3(cx + 0.7, 0, -0.62), at: new THREE.Vector3(cx + 0.7, 0, -1.35) },
      water: { stand: new THREE.Vector3(cx + 1.32, 0, -0.62), at: new THREE.Vector3(cx + 1.32, 0, -1.35) },
    };
  }

  _buildBathroom(room) {
    const { cx } = room;
    const g = new THREE.Group(); g.position.x = cx; this.group.add(g);

    // Lower tiled wall
    g.add(mesh(new THREE.PlaneGeometry(ROOM_W, 1.4), mat('#ffffff', { map: T.tiles('#ffffff', '#eef6fa', { size: 6, checker: false, grout: '#cfe0e8', repeat: [8, 1.4] }), rough: 0.3 }), { y: 0.7, z: -2.99, cast: false }));
    g.add(mesh(box(ROOM_W, 0.06, 0.06), mat('#9ccfd8', { rough: 0.4 }), { y: 1.42, z: -2.97, cast: false }));

    // Bathtub
    const white = mat('#fdfdfd', { rough: 0.15 });
    const tub = new THREE.Group();
    tub.add(mesh(rbox(2.5, 0.72, 1.1, 0.25), white, { y: 0.46 }));
    tub.add(mesh(rbox(2.25, 0.05, 0.86, 0.02), new THREE.MeshStandardMaterial({ color: '#8fd3e8', roughness: 0.05, transparent: true, opacity: 0.85 }), { y: 0.72, cast: false }));
    for (const [x, z] of [[-1.0, 0.4], [1.0, 0.4], [-1.0, -0.4], [1.0, -0.4]]) tub.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#d4a373', { rough: 0.3, metal: 0.7 }), { x, y: 0.07, z }));
    // bubbles in the tub
    const foam = mat('#ffffff', { rough: 0.6 });
    for (let i = 0; i < 9; i += 1) tub.add(mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.08, 10, 8), foam, { x: -0.8 + Math.random() * 1.6, y: 0.76, z: -0.25 + Math.random() * 0.5 }));
    // rubber duck
    const duck = new THREE.Group();
    const yellow = mat('#ffd43b', { rough: 0.4 });
    duck.add(mesh(new THREE.SphereGeometry(0.12, 14, 10), yellow, { y: 0.1 }));
    duck.add(mesh(new THREE.SphereGeometry(0.08, 14, 10), yellow, { y: 0.23, x: 0.06 }));
    duck.add(mesh(new THREE.ConeGeometry(0.03, 0.07, 8), mat('#f08c00'), { y: 0.22, x: 0.15, rz: -Math.PI / 2 }));
    duck.position.set(0.7, 0.72, 0.1);
    tub.add(duck);
    tub.position.set(-2.2, 0, -2.35);
    g.add(tub);
    this._interactive(duck, 'duck', room.index);
    this.duck = duck;
    // Shower pipe on the wall
    const chrome = mat('#cfd8dc', { rough: 0.15, metal: 0.9 });
    g.add(mesh(cyl(0.025, 0.025, 1.6, 8), chrome, { x: -3.3, y: 1.6, z: -2.93 }));
    g.add(mesh(cyl(0.12, 0.06, 0.08, 16), chrome, { x: -3.3, y: 2.45, z: -2.8, rx: 0.6 }));

    // Sink + mirror
    const sink = new THREE.Group();
    sink.add(mesh(cyl(0.12, 0.16, 0.8, 16), white, { y: 0.4 }));
    sink.add(mesh(rbox(0.8, 0.18, 0.55, 0.08), white, { y: 0.88 }));
    sink.add(mesh(cyl(0.02, 0.02, 0.22, 8), chrome, { y: 1.07, z: -0.2 }));
    sink.add(mesh(cyl(0.018, 0.018, 0.16, 8), chrome, { y: 1.17, z: -0.13, rx: Math.PI / 2 }));   // spout
    sink.position.set(2.0, 0, -2.65);
    g.add(sink);
    this._interactive(sink, 'tap', room.index);
    this.tap = { on: false, origin: new THREE.Vector3(cx + 2.0, 1.14, -2.6), timer: 0, watch: new THREE.Vector3(cx + 2.0, 0, -1.75) };

    // Litter box (back-center). Clumps appear as it gets used.
    const litter = new THREE.Group();
    litter.add(mesh(rbox(1.3, 0.26, 0.85, 0.06), mat('#81b29a', { rough: 0.6 }), { y: 0.13 }));
    litter.add(mesh(box(1.18, 0.02, 0.73), mat('#e9dcc3', { rough: 1 }), { y: 0.22, cast: false }));
    const clumps = [];
    const clumpMat = mat('#a08566', { rough: 1 });
    for (let i = 0; i < 6; i += 1) {
      const c = mesh(new THREE.SphereGeometry(0.05 + (i % 3) * 0.01, 8, 6), clumpMat, { x: -0.4 + (i * 0.17) % 0.85, y: 0.235, z: -0.2 + ((i * 7) % 5) * 0.09, cast: false });
      c.scale.y = 0.6; c.visible = false;
      litter.add(c); clumps.push(c);
    }
    litter.position.set(0.25, 0, -2.4);
    g.add(litter);
    this._interactive(litter, 'litter', room.index);
    this._litterGroup = litter;

    // Pee pad (shown instead of the litter box when the pet is a dog).
    const pad = new THREE.Group();
    pad.add(mesh(rbox(1.25, 0.02, 0.95, 0.01), mat('#ffffff', { map: T.tiles('#f4f9ff', '#d7e8fb', { size: 6, checker: false, grout: '#c3d9f2', repeat: [4, 3] }), rough: 0.9 }), { y: 0.012, cast: false }));
    const stains = [];
    const stainMat = new THREE.MeshStandardMaterial({ color: '#e8c95a', roughness: 0.9, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 4; i += 1) {
      const st = mesh(new THREE.CircleGeometry(0.14 + i * 0.03, 16), stainMat, { x: -0.3 + i * 0.2, y: 0.026, z: -0.15 + (i % 2) * 0.25, rx: -Math.PI / 2, cast: false });
      st.visible = false; pad.add(st); stains.push(st);
    }
    pad.position.set(0.25, 0, -2.2);
    pad.visible = false;
    g.add(pad);
    this._interactive(pad, 'litter', room.index);
    this._pad = { group: pad, stains };
    this.litterBox = { clumps, inside: new THREE.Vector3(cx + 0.25, 0.08, -2.4), front: new THREE.Vector3(cx + 0.25, 0, -1.25) };
    this._catLitter = { ...this.litterBox };
    const mirror = new THREE.Group();
    mirror.add(mesh(rbox(0.95, 1.15, 0.05, 0.05), mat('#9ccfd8', { rough: 0.4 }), { cast: false }));
    // A believable mirror without a real reflection: pale glass with a sheen streak.
    const sheen = T.stripes(['#d9eef5', '#eef8fb', '#d9eef5', '#cfe6ef', '#d9eef5', '#f4fbfd'], 6, true);
    sheen.center.set(0.5, 0.5); sheen.rotation = 0.5;          // diagonal streaks; the glass itself stays square
    mirror.add(mesh(new THREE.PlaneGeometry(0.85, 1.05), new THREE.MeshStandardMaterial({ map: sheen, roughness: 0.1, metalness: 0.15 }), { z: 0.03, cast: false }));
    mirror.position.set(2.0, 1.9, -2.96);
    g.add(mirror);
    // Towels
    g.add(mesh(cyl(0.02, 0.02, 0.9, 8), chrome, { x: 3.2, y: 1.55, z: -2.9, rz: Math.PI / 2, cast: false }));
    g.add(mesh(rbox(0.38, 0.75, 0.06, 0.03), mat('#e07a5f', { rough: 1 }), { x: 3.0, y: 1.2, z: -2.86 }));
    g.add(mesh(rbox(0.38, 0.6, 0.06, 0.03), mat('#81b29a', { rough: 1 }), { x: 3.42, y: 1.27, z: -2.86 }));
    // Bath mat
    g.add(mesh(rbox(1.8, 0.03, 1.1, 0.012), mat('#ffffff', { map: T.stripes(['#9ccfd8', '#f1fbfd'], 8, true), rough: 1 }), { y: 0.015, z: 0.35, cast: false }));
    const p = plant(0.85, '#9ccfd8'); p.position.set(3.35, 0, 1.7); g.add(p);   // front corner: keeps the doorway clear

    room.spots = { tub: new THREE.Vector3(cx - 1.4, 0, -1.0), mirror: new THREE.Vector3(cx + 2.0, 0, -1.6) };
  }

  _buildBedroom(room) {
    const { cx } = room;
    const g = new THREE.Group(); g.position.x = cx; this.group.add(g);

    // Rug
    g.add(mesh(rbox(3.6, 0.02, 2.4, 0.01), mat('#ffffff', { map: T.rug(['#3d405b', '#f2cc8f', '#e07a5f'], false), rough: 1 }), { y: 0.01, z: 0.2, cast: false }));

    // Cat bed (round cushion)
    const bed = new THREE.Group();
    bed.add(mesh(new THREE.TorusGeometry(0.62, 0.22, 14, 32), mat('#e07a5f', { rough: 1 }), { y: 0.2, rx: Math.PI / 2 }));
    bed.add(mesh(cyl(0.66, 0.68, 0.16, 32), mat('#f4e1c1', { rough: 1 }), { y: 0.08 }));
    bed.add(mesh(rbox(0.5, 0.1, 0.35, 0.05), mat('#81b29a', { rough: 1 }), { x: 0.25, y: 0.2, z: -0.25, ry: 0.4 }));
    bed.position.set(-1.6, 0, -1.7);
    g.add(bed);
    this._bed = bed;
    this._interactive(bed, 'bed', room.index);

    // Nightstand + lamp (interactive light switch)
    const wood = mat('#8d6e63', { rough: 0.6 });
    g.add(mesh(rbox(0.7, 0.7, 0.5, 0.04), wood, { x: -3.2, y: 0.35, z: -2.6 }));
    g.add(mesh(box(0.55, 0.02, 0.02), mat('#d9c6a5', { metal: 0.6, rough: 0.3 }), { x: -3.2, y: 0.5, z: -2.34, cast: false }));
    const lamp = new THREE.Group();
    lamp.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), mat('#81b29a', { rough: 0.3 }), { y: 0.12 }));
    lamp.add(mesh(cyl(0.015, 0.015, 0.25, 8), mat('#3d405b'), { y: 0.33 }));
    const shadeMat = mat('#fff3d6', { rough: 0.9, emissive: '#ffcf7a', ei: 1.2 });
    lamp.add(mesh(cyl(0.12, 0.22, 0.25, 24, 1), shadeMat, { y: 0.52 }));
    lamp.position.set(-3.2, 0.7, -2.6);
    g.add(lamp);
    const lampLight = new THREE.PointLight('#ffc77d', 6, 6, 2);
    lampLight.position.set(cx - 3.2, 1.35, -2.4);
    this.group.add(lampLight);
    this.lamps.push({ light: lampLight, shade: shadeMat, room: room.index, base: 6 });
    this._interactive(lamp, 'lamp', room.index);

    // Window, clock, bookshelf
    const win = windowUnit(null, 2.6, 2.1, '#ffffff', '#3d405b'); win.position.set(1.0, 2.55, -2.94); g.add(win);
    this.clock = T.clockFace();
    const clock = new THREE.Group();
    clock.add(mesh(cyl(0.36, 0.36, 0.06, 32), mat('#e07a5f', { rough: 0.5 }), { rx: Math.PI / 2 }));
    clock.add(mesh(new THREE.CircleGeometry(0.33, 32), new THREE.MeshStandardMaterial({ map: this.clock.texture, roughness: 0.6 }), { z: 0.035, cast: false }));
    clock.position.set(-1.6, 2.65, -2.95);
    g.add(clock);

    const shelf = new THREE.Group();
    shelf.add(mesh(rbox(1.0, 1.8, 0.4, 0.03), mat('#a1887f', { rough: 0.6 }), { y: 0.9 }));
    const bookCols = ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#9ccfd8', '#b5838d'];
    for (let r = 0; r < 3; r += 1) {
      shelf.add(mesh(box(0.92, 0.03, 0.36), mat('#8d6e63'), { y: 0.35 + r * 0.55, z: 0.01, cast: false }));
      let x = -0.4;
      for (let b = 0; b < 6; b += 1) {
        const w = 0.07 + ((r * 3 + b) % 3) * 0.025;
        const h = 0.32 + ((r + b) % 3) * 0.05;
        shelf.add(mesh(box(w, h, 0.25), mat(bookCols[(r * 2 + b) % bookCols.length], { rough: 0.8 }), { x: x + w / 2, y: 0.37 + r * 0.55 + h / 2, z: 0.03, rz: b === 5 ? 0.25 : 0 }));
        x += w + 0.015;
      }
    }
    shelf.position.set(3.1, 0, -2.75);
    g.add(shelf);

    // Fairy-light garland across the back wall (glows when lights are off)
    const pts = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      pts.push(new THREE.Vector3(-3.6 + t * 7.2, 3.5 - Math.sin(t * Math.PI) * 0.45 - Math.sin(t * Math.PI * 3) * 0.06, -2.9));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(mesh(new THREE.TubeGeometry(curve, 60, 0.006, 4), mat('#3d405b'), { cast: false }));
    const bulbCols = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2'];
    for (let i = 1; i < 24; i += 2) {
      const m = new THREE.MeshStandardMaterial({ color: bulbCols[i % 4], emissive: bulbCols[i % 4], emissiveIntensity: 0.6, roughness: 0.3 });
      const b = mesh(new THREE.SphereGeometry(0.04, 8, 6), m, { cast: false });
      b.position.copy(curve.getPoint(i / 24)).add(new THREE.Vector3(0, -0.04, 0.02));
      g.add(b);
      this.garlands.push(m);
    }

    // Toy mouse
    const mouse = new THREE.Group();
    mouse.add(mesh(new THREE.SphereGeometry(0.09, 12, 8), mat('#adb5bd', { rough: 0.9 }), { y: 0.07 }));
    mouse.children[0].scale.set(1.5, 0.9, 1);
    mouse.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#f8a5c2'), { x: -0.06, y: 0.14, z: 0.05 }));
    mouse.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#f8a5c2'), { x: -0.06, y: 0.14, z: -0.05 }));
    mouse.position.set(1.8, 0, 1.0); mouse.rotation.y = 0.6;
    g.add(mouse);

    room.spots = { bed: new THREE.Vector3(cx - 1.6, 0, -1.7), window: new THREE.Vector3(cx + 1.0, 0, -1.2) };
    this.windows.push({ room: 3, spot: new THREE.Vector3(cx + 1.0, 0, -1.2), glass: new THREE.Vector3(cx + 1.0, 2.55, -2.9) });
    this.beds = [{ room: 3, spot: new THREE.Vector3(cx - 1.6, 0, -1.7), name: 'its bed' }];
  }

  // ------------------------------------------------------------------ lighting
  _buildLights() {
    this.hemi = new THREE.HemisphereLight('#fff6e8', '#b59a83', 1.1);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight('#fff1dc', 2.2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 25 });
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 4;
    this.scene.add(this.key, this.key.target);
    // One ceiling light that moves to the current room: every light costs
    // shader time on every pixel, even at intensity 0, so we don't keep four.
    this.ceiling = new THREE.PointLight('#ffe2b8', 14, 11, 2);
    this.ceiling.position.set(0, 3.6, 0.6);
    this.scene.add(this.ceiling);
  }

  /** Point the key light/shadows at room `i`. */
  focusRoom(i) {
    this.current = i;
    const cx = this.rooms[i].cx;
    this.key.position.set(cx - 3, 7, 6);
    this.key.target.position.set(cx, 0, -0.5);
  }

  setLights(i, on) { this.rooms[i].lightsOn = on; }

  /** Is it night outside right now? (real sunrise/sunset once world.js knows your place) */
  get isNight() {
    const now = new Date(); const h = now.getHours() + now.getMinutes() / 60;
    const sun = this.sun || { rise: 6.5, set: 19 };
    return h < sun.rise - 0.4 || h >= sun.set + 0.6;
  }

  /** Real-world sky: sun times and the current weather (null = a generic fair day). */
  setSky(sun, weather) {
    this.sun = sun;
    this.weather = weather;
    this._updateClock(true);
  }

  _updateClock(force = false) {
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    if (!force && minute === this._lastMinute) return;
    this._lastMinute = minute;
    this.clock.redraw(now);
    const hour = now.getHours() + now.getMinutes() / 60;
    for (const s of this.skies) s.redraw(hour, this.sun, this.weather);
  }

  // ------------------------------------------------------------------ per frame
  update(dt, t) {
    this._updateClock();

    // Lighting: blend toward the current room's state (lights on/off, night).
    const room = this.rooms[this.current];
    const on = room.lightsOn;
    const night = this.isNight;
    const target = on ? 1 : 0;
    this._lightLevel += (target - this._lightLevel) * Math.min(1, dt * 4);
    const L = this._lightLevel;
    this.hemi.intensity = 0.18 + L * (night ? 0.75 : 0.95);
    this.hemi.color.set(L > 0.5 ? '#fff6e8' : '#9fb4ff');
    this.key.intensity = 0.15 + L * (night ? 1.3 : 2.1);
    this.ceiling.intensity = L * (night ? 18 : 10);
    // Image-based light from the HDR would keep the room bright with the lights
    // off. (scene.environmentIntensity only exists in newer three.js, so scale
    // every material's envMapIntensity; only when the level actually changes.)
    const envI = 0.06 + L * 0.5;
    if (Math.abs(envI - (this._envI ?? -1)) > 0.01) {
      this._envI = envI;
      this.scene.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if ('envMapIntensity' in m) m.envMapIntensity = envI;
        }
      });
    }
    this.ceiling.position.x += (room.cx - this.ceiling.position.x) * Math.min(1, dt * 3);
    for (const lamp of this.lamps) {
      const lit = this.rooms[lamp.room].lightsOn;
      lamp.light.intensity = lit ? lamp.base : 0;
      lamp.shade.emissiveIntensity = lit ? 1.2 : 0.05;
    }
    this.garlands.forEach((m, i) => { m.emissiveIntensity = (on ? 0.5 : 2.2) * (0.75 + 0.25 * Math.sin(t * 2 + i)); });

    // Front door swings open/closed.
    if (this._doorLeaf) {
      this._doorOpen += (this._doorTarget - this._doorOpen) * Math.min(1, dt * 4);
      this._doorLeaf.rotation.y = -this._doorOpen * 1.3;
    }

    // The hamster wheel spins while it runs (wheelSpin in rad/s, set by the hamster).
    const cg = this.cage;
    if (cg?.group.visible && cg.wheelSpin) {
      cg.wheel.rotation.z -= cg.wheelSpin * dt;
      if (!cg.wheelDriven) cg.wheelSpin *= Math.exp(-dt * 1.5);
      if (Math.abs(cg.wheelSpin) < 0.05) cg.wheelSpin = 0;
    }

    // Cat-tree toy swings
    if (this._treeToy) this._treeToy.position.x = 0.3 + Math.sin(t * 1.7) * 0.05;

    // Ball physics (living room floor)
    const b = this.ball;
    if (!b.held && b.vel.lengthSq() > 1e-5) {        // held = in the cat's mouth
      const r0 = this.rooms[b.room];
      const bx0 = r0.cx - ROOM_W / 2 + b.r + 0.1; const bx1 = r0.cx + ROOM_W / 2 - b.r - 0.1;
      const bz0 = -1.8; const bz1 = 2.2;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;
      if (p.x < bx0) { p.x = bx0; b.vel.x = Math.abs(b.vel.x) * 0.7; }
      if (p.x > bx1) { p.x = bx1; b.vel.x = -Math.abs(b.vel.x) * 0.7; }
      if (p.z < bz0) { p.z = bz0; b.vel.z = Math.abs(b.vel.z) * 0.7; }
      if (p.z > bz1) { p.z = bz1; b.vel.z = -Math.abs(b.vel.z) * 0.7; }
      // roll
      const speed = b.vel.length();
      if (speed > 0) {
        const axis = new THREE.Vector3(b.vel.z, 0, -b.vel.x).normalize();
        b.mesh.rotateOnWorldAxis(axis, (speed * dt) / b.r);
      }
      b.vel.multiplyScalar(Math.exp(-0.9 * dt));
      if (speed < 0.05) b.vel.set(0, 0, 0);
    }
  }

  /** Show bowl contents: food 0–100 (type: wet|kibble), water 0–100. */
  setBowls(food, water, type) {
    const f = this.bowls.food; const w = this.bowls.water;
    f.visible = food > 1;
    f.scale.set(0.75 + 0.25 * (food / 100), Math.max(0.05, food / 100), 0.75 + 0.25 * (food / 100));
    f.position.y = 0.035 + 0.04 * (food / 100);
    f.material = type === 'wet' ? this.bowls.wet : this.bowls.kibble;
    w.visible = water > 1;
    w.scale.set(0.8 + 0.2 * (water / 100), Math.max(0.05, water / 100), 0.8 + 0.2 * (water / 100));
    w.position.y = 0.035 + 0.04 * (water / 100);
    // The hamster's own bowl and bottle in the tank.
    const c = this.cage;
    if (!c) return;                 // the tank is built after the kitchen
    c.food.visible = food > 1;
    c.food.scale.set(0.6 + 0.4 * (food / 100), Math.max(0.1, food / 100) * 1.4, 0.6 + 0.4 * (food / 100));
    c.water.visible = water > 1;
    c.water.scale.y = Math.max(0.03, water / 100);
    c.water.position.y = 0.09 + 0.19 * Math.max(0.03, water / 100);
  }

  /** dirt 0–100 → visible clumps in the litter box / stains on the pee pad. */
  setLitter(dirt) {
    const list = this.species === 'dog' ? this._pad.stains : this.species === 'hamster' ? this.cage.clumps : this._catLitter.clumps;
    const n = Math.round((dirt / 100) * list.length);
    list.forEach((c, i) => { c.visible = i < n; });
  }

  /**
   * Furnish the house for the pet that lives here: litter box + cat tree for
   * cats, a pee pad for dogs; the bed grows with the pet.
   */
  setSpecies(species, length = 1.55) {
    this.species = species;
    const dog = species === 'dog';
    const hamster = species === 'hamster';
    this._litterGroup.visible = !dog && !hamster;
    this.catTree.visible = !dog && !hamster;     // a dog has no use for it (and it hides the front door)
    this._pad.group.visible = dog;
    this.cage.group.visible = hamster;
    this.ball.mesh.visible = !hamster;
    const cx = this.rooms[2].cx;
    this.litterBox = dog
      ? { clumps: this._pad.stains, inside: new THREE.Vector3(cx + 0.25, 0, -2.2), front: new THREE.Vector3(cx + 0.25, 0, -1.0) }
      : { ...this._catLitter };
    if (hamster) this.litterBox = { clumps: this.cage.clumps, inside: this.cage.spots.toilet, front: this.cage.spots.toilet };
    this._bed.scale.setScalar(Math.max(1, length / 1.55));
  }

  /** A puddle on the floor (dog accident). a = {x, z} or null. */
  setAccident(a) {
    if (!this._puddle) {
      this._puddle = mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshStandardMaterial({ color: '#e5c757', roughness: 0.05, transparent: true, opacity: 0.6 }), { rx: -Math.PI / 2, cast: false });
      this._puddle.scale.set(1.3, 0.8, 1);
      this.group.add(this._puddle);
      this._interactive(this._puddle, 'puddle', 0);
    }
    this._puddle.visible = !!a;
    if (a) this._puddle.position.set(a.x, 0.014, a.z);
  }

  toggleTap(on = !this.tap.on) { this.tap.on = on; return on; }

  /** Drips from the bathroom tap (call from the frame loop with the particle system). */
  updateTap(dt, fx) {
    if (!this.tap.on) return;
    this.tap.timer -= dt;
    if (this.tap.timer <= 0) {
      this.tap.timer = 0.35;
      fx.spawn('drop', this.tap.origin, { vel: new THREE.Vector3(0, -0.5, 0), life: 0.35 });
    }
  }

  kickBall(dir, strength = 2.5) {
    this.ball.vel.add(dir.clone().setY(0).normalize().multiplyScalar(strength));
  }
}
