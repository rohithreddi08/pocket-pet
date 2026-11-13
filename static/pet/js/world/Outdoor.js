// ============================================================================
// Outdoor.js — the street outside: an Indian city street seen through the
// windows, and where dog walks happen.
// ----------------------------------------------------------------------------
// Its own scene, rendered before the house each frame (the house's back walls
// have real window openings), with:
//   · a physically based sky (three's Sky) and sun placed from the real time
//     and your real sunrise/sunset (world.js), moon and street lights at night
//   · weather from Open-Meteo: cloud deck, rain and snow falling, wet road,
//     fog/haze, lightning in storms, trees swaying with the wind
//   · the street: footpath with neem-like trees, lamp posts and tangled power
//     lines, a road with auto-rickshaws, scooters, cars and a bus, and across
//     it 2–5-storey apartment blocks with balconies, AC units, laundry, black
//     rooftop water tanks and shops with shutters and signboards
//   · our own building's facade (same window openings as the flat)
// Scale: 1 unit ≈ 30 cm (the house's scale). The flat's windows look north (−z), so the sun, behind the house,
// lights the buildings across the road; east is +x.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const pick = (a) => a[Math.floor(rnd() * a.length)];
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the street's layout (z): our facade, footpath, kerb, road, far kerb, far footpath, buildings
export const STREET = { facade: -3.32, pathNear: -3.32, kerbNear: -9.2, laneA: -14.5, centre: -21, laneB: -27.5, kerbFar: -32.8, pathFar: -38, x0: -90, x1: 120 };
// where the walks go: out of the gate, along the near footpath
export const WALK = { gate: new V3(-7.5, 0, -6.3), z: -6.3, x0: -7.5, x1: 34 };

// ------------------------------------------------------------ photo textures (CC0, Poly Haven — see textures/street/CREDITS.txt)
const TEX = './textures/street/';
const texLoader = new THREE.TextureLoader();
/** A scanned PBR material set (colour, normal, roughness) tiled `repeat` times. */
function pbr(id, repeat) {
  const ld = (suffix, srgb) => {
    const t = texLoader.load(`${TEX}${id}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: ld('diff', true), normalMap: ld('nor'), roughnessMap: ld('rough') };
}
/** Surface relief only (for painted walls whose colour comes from a canvas). */
function relief(id, repeat) {
  const t = texLoader.load(`${TEX}${id}_nor.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  return t;
}
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
// real weathered concrete, blended into the painted walls so they look lived-in
const GRIME = loadImg(`${TEX}concrete_diff.jpg`);
function weather(tex, tile = 256, alpha = 0.5) {
  GRIME.then((img) => {
    if (!img) return;
    const c = tex.image; const g = c.getContext('2d');
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = alpha;
    for (let y = 0; y < c.height; y += tile) for (let x = 0; x < c.width; x += tile) g.drawImage(img, x, y, tile, tile);
    // darker grime collects at the bottom of walls
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1;
    const gr = g.createLinearGradient(0, c.height * 0.8, 0, c.height); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(150,140,125,1)');
    g.fillStyle = gr; g.fillRect(0, c.height * 0.8, c.width, c.height * 0.2);
    g.restore();
    tex.needsUpdate = true;
  });
}
/** Painted plaster in a colour, with monsoon stains (for building sides and our walls). */
const plasterCache = new Map();
function plasterTex(colour) {
  if (plasterCache.has(colour)) return plasterCache.get(colour);
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = colour; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i += 1) {
      const x = rnd() * w; const len = 60 + rnd() * 200; const y = rnd() * h * 0.5;
      const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(70,62,50,0.2)'); gr.addColorStop(1, 'rgba(70,62,50,0)');
      g.fillStyle = gr; g.fillRect(x, y, 5 + rnd() * 20, len);
    }
    grime(g, w, h, 120, 0.05);
  }, { repeat: [1, 1] });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  weather(t, 256, 0.6);
  plasterCache.set(colour, t);
  return t;
}

// ------------------------------------------------------------ canvas textures
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const grime = (g, w, h, n, a = 0.06) => {
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '40,35,30' : '255,255,255'},${a * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 30, 2 + rnd() * 30);
  }
};
const SHOPS = [['MEDICAL', '#1f7a3f'], ['KIRANA STORE', '#c0392b'], ['TEA STALL', '#8e5a2b'], ['MOBILE REPAIR', '#1d4e89'], ['SWEETS', '#d35400'], ['TAILOR', '#6c3483'], ['BAKERY', '#b9770e'], ['XEROX · STD', '#2e4053']];
/** A building face: storeys of windows with grills, plaster stains, a ground floor of shops. Also its night window map. */
function facadeTex(color, storeys, bays, shop) {
  const W = 128 * bays; const H = 128 * storeys;
  const lit = [];
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    // monsoon stains running down from every slab
    for (let s = 0; s < storeys; s += 1) for (let i = 0; i < bays * 3; i += 1) {
      const x = rnd() * W; const y = s * 128; const len = 30 + rnd() * 90;
      const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(60,55,45,0.22)'); gr.addColorStop(1, 'rgba(60,55,45,0)');
      g.fillStyle = gr; g.fillRect(x, y, 4 + rnd() * 14, len);
    }
    grime(g, W, H, bays * storeys * 10, 0.05);
    for (let s = 0; s < storeys; s += 1) {
      const y0 = s * 128;
      // floor band
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y0 + 122, W, 6);
      if (s === storeys - 1 && shop) continue;
      for (let b = 0; b < bays; b += 1) {
        const x = b * 128 + 26; const y = y0 + 26;
        g.fillStyle = '#3b3f45'; g.fillRect(x - 4, y - 4, 84, 72);
        const glass = ['#5d6d7a', '#6e7f8c', '#4c5965'][Math.floor(rnd() * 3)];
        g.fillStyle = glass; g.fillRect(x, y, 76, 64);
        if (rnd() < 0.6) { g.fillStyle = pick(['#e8d8b0', '#c97b63', '#8fb3c9', '#d9c3e0']); g.fillRect(x + (rnd() < 0.5 ? 0 : 38), y, 38, 64); } // curtain
        g.strokeStyle = '#2a2a2a'; g.lineWidth = 2;
        for (let k = 1; k < 6; k += 1) { g.beginPath(); g.moveTo(x + k * 12.7, y); g.lineTo(x + k * 12.7, y + 64); g.stroke(); } // grill
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 6, y - 10, 88, 6); // chajja (sunshade)
        lit.push([x, y, rnd() < 0.55]);
      }
    }
    if (shop) {
      const y0 = (storeys - 1) * 128;
      for (let b = 0; b < bays; b += 1) {
        const x = b * 128 + 8;
        const [name, col] = pick(SHOPS);
        g.fillStyle = col; g.fillRect(x, y0 + 8, 112, 26);
        g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText(name, x + 56, y0 + 27);
        const open = rnd() < 0.6;
        if (open) { g.fillStyle = '#6b5a45'; g.fillRect(x + 6, y0 + 40, 100, 84); g.fillStyle = 'rgba(240,200,120,0.5)'; for (let k = 0; k < 4; k += 1) g.fillRect(x + 12 + k * 24, y0 + 60, 18, 40); }
        else { g.fillStyle = '#8d9196'; g.fillRect(x + 6, y0 + 40, 100, 84); g.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < 14; k += 1) g.fillRect(x + 6, y0 + 42 + k * 6, 100, 2); }
        lit.push([x + 6, y0 + 40, open, true]);
      }
    }
  });
  map.flipY = true;
  weather(map, 384, 0.45);
  const emissive = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const [x, y, on, shopLit] of lit) {
      if (!on) continue;
      g.fillStyle = shopLit ? '#ffcf7a' : pick(['#ffd9a0', '#fff1c9', '#cfe3ff']);
      g.fillRect(x, y, shopLit ? 100 : 76, shopLit ? 84 : 64);
    }
  });
  return { map, emissive };
}
function cloudTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      const x = rnd() * w; const y = rnd() * h; const r = 30 + rnd() * 110;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, { repeat: [3, 3] });
}

// ------------------------------------------------------------ small builders
const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

/** An auto-rickshaw: yellow-green body, black canvas canopy, three wheels (built here; none was available free). */
function autoRickshaw() {
  const g = new THREE.Group();
  const green = std('#2f7d32', { roughness: 0.6 }); const yellow = std('#f2c230', { roughness: 0.55 }); const black = std('#1b1b1b');
  const metal = std('#9aa0a6', { metalness: 0.6, roughness: 0.4 });
  g.add(box(5.6, 2.2, 4.2, green, 0, 2.1, 0));                // tub
  g.add(box(3.0, 2.0, 4.0, yellow, 1.6, 2.2, 0));            // bonnet / front
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 6.2, 18, 1, true, 0, Math.PI), black);
  canopy.rotation.set(0, 0, Math.PI / 2); canopy.position.set(-0.3, 4.1, 0); canopy.scale.set(1, 1, 0.95);
  g.add(canopy);
  g.add(box(6.0, 0.25, 4.3, black, -0.3, 4.15, 0));
  g.add(box(0.2, 2.2, 3.9, std('#9fc4d6', { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 }), 2.75, 4.2, 0)); // windscreen
  for (const z of [-1.7, 1.7]) g.add(box(0.2, 2.0, 0.2, metal, 2.7, 4.0, z));
  const wheelG = new THREE.CylinderGeometry(0.95, 0.95, 0.6, 18); wheelG.rotateX(Math.PI / 2);
  for (const [x, z] of [[3.1, 0], [-2.0, 2.0], [-2.0, -2.0]]) { const w = new THREE.Mesh(wheelG, black); w.position.set(x, 0.95, z); g.add(w); }
  const lamp = box(0.1, 0.5, 0.5, std('#fff7d6', { emissive: '#fff2c0', emissiveIntensity: 0 }), 3.05, 2.6, 0); lamp.userData.headlight = true;
  g.add(lamp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** A sagging cable between two points. */
function cable(a, b, sag, mat) {
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.04, 4), mat);
}

// ------------------------------------------------------------ the outdoor world
export class Outdoor {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.t = 0;
    this.lightning = 0;
    this.weather = null;
    this.windows = [];
    this.vehicles = [];
    this.trees = [];
    this.lampHeads = [];
    this.nightMats = [];
    this.headlights = [];
    this.walking = null;

    // sky + sun + moon
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    this.scene.add(this.sky);
    this.skyScene = new THREE.Scene();
    this.skyForEnv = new Sky(); this.skyForEnv.scale.setScalar(4000); this.skyScene.add(this.skyForEnv);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sun = new THREE.DirectionalLight('#fff2dc', 3);
    this.sun.shadow.mapSize.set(2048, 2048);
    this._shadowBox(42);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight('#9fb4e8', 0);
    this.scene.add(this.moon);
    this.hemi = new THREE.HemisphereLight('#cfe3ff', '#8a7a62', 0.6);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2('#c9d3db', 0.0035);
    // stars for clear nights
    {
      const n = 900; const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        const th = rnd() * Math.PI * 2; const ph = Math.acos(rnd() * 0.9);
        pos.set([Math.sin(ph) * Math.cos(th) * 1500, Math.cos(ph) * 1500, Math.sin(ph) * Math.sin(th) * 1500], i * 3);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      this.scene.add(this.stars);
      this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(28, 32), new THREE.MeshBasicMaterial({ color: '#f4f1e6', fog: false, transparent: true, opacity: 0 }));
      this.scene.add(this.moonDisc);
    }
    // a cloud deck that thickens with cloud cover
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, opacity: 0.3, depthWrite: false, fog: false, color: '#ffffff' }));
    this.clouds.rotation.x = Math.PI / 2; this.clouds.position.y = 260;
    this.scene.add(this.clouds);

    this._buildStreet();
    this._buildRain();
    this._loadModels();
    this.setTime(new Date(), { rise: 6.5, set: 19 }, null);
  }

  // ---------------------------------------------------------------- the street
  _buildStreet() {
    const S = STREET;
    const sc = this.scene;
    const len = S.x1 - S.x0; const cx = (S.x0 + S.x1) / 2;
    // footpaths, kerbs, road
    const roadW = S.kerbNear - S.kerbFar;
    // scanned worn asphalt (one tile ≈ 2 m)
    this.roadMat = std('#ffffff', { ...pbr('asphalt_03', [len / 7, roadW / 7]), roughness: 1 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(len, roadW), this.roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(cx, 0, (S.kerbNear + S.kerbFar) / 2); road.receiveShadow = true; sc.add(road);
    // patched potholes, dust along the kerbs, a manhole cover
    const patch = std('#5a5854', { ...pbr('asphalt_03', [1, 1]), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const patches = [];
    for (let i = 0; i < 26; i += 1) {
      const pw = 1.5 + rnd() * 5; const pd = 1 + rnd() * 3;
      patches.push(new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2).rotateY((rnd() - 0.5) * 0.3).translate(S.x0 + rnd() * len, 0.005, S.kerbFar + 1 + rnd() * (roadW - 2)));
    }
    const pm = new THREE.Mesh(mergeGeometries(patches), patch); pm.receiveShadow = true; sc.add(pm);
    // dust and sand blown against the kerbs
    const dustMap = canvasTex(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(150,130,105,0.75)'); gr.addColorStop(1, 'rgba(150,130,105,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const dustLit = std('#ffffff', { map: dustMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    for (const [z, flip] of [[S.kerbNear - 0.9, 0], [S.kerbFar + 0.9, 1]]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.8), dustLit);
      d.rotation.x = -Math.PI / 2; if (flip) d.rotation.z = Math.PI;
      d.position.set(cx, 0.008, z); d.receiveShadow = true; sc.add(d);
    }
    const manhole = new THREE.Mesh(new THREE.CircleGeometry(1.4, 28), std('#3b3a37', { metalness: 0.6, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4 }));
    manhole.rotation.x = -Math.PI / 2; manhole.position.set(12, 0.01, S.laneA + 1); manhole.receiveShadow = true; sc.add(manhole);
    // footpaths: chequered cement tiles (≈ 30 cm), like Indian city pavements
    const paving = std('#ffffff', { ...pbr('checkered_pavement_tiles', [len / 10, 0.6]), roughness: 1 });
    // kerb stones, painted black and yellow like Indian kerbs, on scanned concrete
    const kerbTex = pbr('concrete', [0.6, 0.15]);
    const kerbs = { y: [], k: [] };
    for (const [z0, z1] of [[S.pathNear, S.kerbNear], [S.kerbFar, S.pathFar]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, Math.abs(z1 - z0)), paving);
      p.position.set(cx, 0.25, (z0 + z1) / 2); p.receiveShadow = true; sc.add(p);
      const kz = z0 === S.pathNear ? S.kerbNear + 0.25 : S.kerbFar - 0.25;
      for (let x = S.x0; x < S.x1; x += 3) (Math.floor(x / 3) % 2 ? kerbs.k : kerbs.y).push(new THREE.BoxGeometry(2.96, 0.62, 0.5).translate(x + 1.5, 0.31, kz));
    }
    for (const [list, col] of [[kerbs.y, '#ffd84a'], [kerbs.k, '#3c3c3c']]) {
      const m = new THREE.Mesh(mergeGeometries(list), std(col, { ...kerbTex, roughness: 1 }));
      m.receiveShadow = true; m.castShadow = true; sc.add(m);
    }
    // lane marking down the middle, a little worn
    const dashes = [];
    for (let x = S.x0; x < S.x1; x += 8) dashes.push(new THREE.PlaneGeometry(4, 0.35).rotateX(-Math.PI / 2).translate(x, 0.012, S.centre));
    const dm = new THREE.Mesh(mergeGeometries(dashes), std('#d9d4c4', { roughness: 0.8, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
    dm.receiveShadow = true; sc.add(dm);
    // the far side: apartment blocks with shops at street level
    const colours = ['#e9d7b9', '#d8e2cf', '#f0c9a0', '#c9d8e8', '#e8c3c3', '#f2e2a8', '#d6d0c4', '#bfd7cf', '#f3d6e4'];
    let x = S.x0;
    while (x < S.x1) {
      const bays = 2 + Math.floor(rnd() * 3); const storeys = 2 + Math.floor(rnd() * 4);
      const w = bays * 6; const hgt = storeys * 10;
      this._building(x + w / 2, S.pathFar - 0.2, w, hgt, 16, pick(colours), storeys, bays, true, 1);
      x += w + (rnd() < 0.3 ? 2 + rnd() * 4 : 0.2);
    }
    // our side of the street: the neighbours either side of our building (seen on walks)
    for (const [from, to] of [[S.x0, -8.2], [32.2, S.x1]]) {
      let nx = from;
      while (nx < to - 6) {
        const bays = Math.min(2 + Math.floor(rnd() * 3), Math.floor((to - nx) / 6)); const storeys = 2 + Math.floor(rnd() * 4);
        const w = bays * 6;
        this._building(nx + w / 2, S.facade, w, storeys * 10, 16, pick(colours), storeys, bays, true, -1);
        nx += w + 0.2;
      }
    }
    // a second, taller row behind, and a distant skyline in the haze
    for (let k = 0; k < 9; k += 1) {
      const bw = 18 + rnd() * 16; const bh = 50 + rnd() * 60;
      this._building(S.x0 + 20 + k * 24 + rnd() * 6, S.pathFar - 26, bw, bh, 18, pick(colours), Math.round(bh / 10), Math.max(2, Math.round(bw / 6)), false, 1);
    }
    const far = std('#9aa7b2', { roughness: 1 });
    for (let k = 0; k < 26; k += 1) {
      const h = 40 + rnd() * 140; const b = box(20 + rnd() * 30, h, 20, far, -400 + k * 34 + rnd() * 10, h / 2, -260 - rnd() * 120);
      sc.add(b);
    }
    // our own building: four storeys, the flat is on the ground floor
    this._ourFacade();
    // poles (power + street lamps), cables, a transformer
    this.cableMat = std('#141414', { roughness: 0.6 });
    const poleMat = std('#8d8f91', { roughness: 0.7 });
    const poles = [];
    for (let px = S.x0 + 6; px < S.x1; px += 24) {
      const p = box(0.5, 26, 0.5, poleMat, px, 13, S.kerbNear + 1.2);
      p.castShadow = true; sc.add(p); poles.push(new V3(px, 24, S.kerbNear + 1.2));
      sc.add(box(4, 0.3, 0.3, poleMat, px, 24, S.kerbNear + 1.2));
    }
    for (let i = 0; i < poles.length - 1; i += 1) {
      for (const [dy, dz] of [[0, -1.6], [0, 1.6], [-1.2, 0.2], [-2.0, -0.6], [-3, 1]]) {
        const a = poles[i].clone().add(new V3(0, dy, dz)); const b = poles[i + 1].clone().add(new V3(0, dy, dz));
        sc.add(cable(a, b, 1.8 + rnd() * 1.6, this.cableMat));
      }
    }
    const tr = box(2.6, 3.2, 1.8, std('#5f6a64', { roughness: 0.6 }), poles[3].x + 0.4, 17, poles[3].z + 1.2);
    tr.castShadow = true; sc.add(tr);
    // a low parapet + gate where walks start
    const gate = std('#4a3b2e', { metalness: 0.3, roughness: 0.5 });
    for (let i = 0; i < 7; i += 1) sc.add(box(0.12, 3.6, 0.12, gate, WALK.gate.x - 2 + i * 0.6, 2.3, -3.6));
    sc.add(box(4, 0.2, 0.15, gate, WALK.gate.x, 3.9, -3.6));
  }

  /** One apartment block, front face at zFront. facing 1 = faces +z (across the road, toward us); −1 = faces −z (our side). */
  _building(x, zFront, w, h, depth, colour, storeys, bays, shop, facing = 1) {
    // built in local space (front at z = 0, facing +z), then placed and turned
    const grp = new THREE.Group();
    grp.position.set(x, 0, zFront); grp.rotation.y = facing > 0 ? 0 : Math.PI;
    const { map, emissive } = facadeTex(colour, storeys, bays, shop);
    const front = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.92, normalMap: relief('beige_wall_001', [w / 12, h / 12]), normalScale: new THREE.Vector2(0.8, 0.8) });
    this.nightMats.push(front);
    const sideTex = plasterTex(colour).clone(); sideTex.repeat.set(depth / 14, h / 14); sideTex.needsUpdate = true;
    const side = std('#ffffff', { map: sideTex, roughness: 0.95 });
    const mats = [side, side, std('#8f8a82'), side, front, side];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), mats);
    b.position.set(0, h / 2, -depth / 2);
    b.castShadow = true; b.receiveShadow = true;
    grp.add(b);
    // balconies with railings, AC units, laundry; shop awnings; rooftop parapet + water tank
    const slab = std('#d9d4ca', { map: plasterTex('#d9d4ca') }); const rail = std('#3a3a3a', { metalness: 0.5, roughness: 0.45 });
    const parts = { slab: [], rail: [], ac: [], cloth: [], awning: [] };
    const startStorey = shop ? 1 : 0;
    for (let s = startStorey; s < storeys; s += 1) {
      const y = s * 10 + 0.4;
      for (let k = 0; k < bays; k += 1) {
        const bx = -w / 2 + (k + 0.5) * (w / bays);
        if (rnd() < 0.55) {
          parts.slab.push(new THREE.BoxGeometry(w / bays - 0.6, 0.4, 2.2).translate(bx, y, 1.1));
          parts.rail.push(new THREE.BoxGeometry(w / bays - 0.6, 0.12, 0.12).translate(bx, y + 3.2, 2.15));
          for (let r = -6; r <= 6; r += 1) parts.rail.push(new THREE.BoxGeometry(0.06, 3.2, 0.06).translate(bx + r * (w / bays - 0.8) / 12, y + 1.6, 2.15));
          if (rnd() < 0.5) for (let c = 0; c < 3; c += 1) parts.cloth.push(new THREE.PlaneGeometry(1.0, 1.6).translate(bx - 1.5 + c * 1.4, y + 2.4, 1.9));
        }
        // the chajja: a concrete sunshade over every window
        parts.slab.push(new THREE.BoxGeometry(w / bays - 1.4, 0.25, 1.1).translate(bx, y + 8.4, 0.55));
        if (rnd() < 0.4) parts.ac.push(new THREE.BoxGeometry(2.6, 1.8, 1.0).translate(bx + 2, y + 6.2, 0.5));
      }
    }
    if (shop) {
      // tarpaulin awnings pulled out over the shop fronts
      for (let k = 0; k < bays; k += 1) {
        if (rnd() < 0.35) continue;
        const bx = -w / 2 + (k + 0.5) * (w / bays);
        const aw = new THREE.PlaneGeometry(w / bays - 0.8, 3.4); aw.rotateX(-Math.PI / 2 + 0.42); aw.translate(bx, 8.6, 1.6);
        parts.awning.push(aw);
      }
    }
    parts.slab.push(new THREE.BoxGeometry(w, 1.4, 0.4).translate(0, h + 0.7, -0.2)); // parapet
    const add = (list, mat, shadow = true) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = shadow; m.receiveShadow = true; grp.add(m); };
    add(parts.slab, slab); add(parts.rail, rail); add(parts.ac, std('#e6e6e2', { roughness: 0.6 }));
    add(parts.cloth, new THREE.MeshStandardMaterial({ color: pick(['#c0392b', '#2471a3', '#f4d03f', '#ffffff', '#7d3c98']), side: THREE.DoubleSide, roughness: 1 }));
    add(parts.awning, new THREE.MeshStandardMaterial({ color: pick(['#2f6db5', '#2f6db5', '#e67e22', '#2e8b57', '#c0392b']), side: THREE.DoubleSide, roughness: 0.75 }));
    // the black plastic water tank every Indian rooftop has
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 4.4, 20), std('#1d1d1d', { roughness: 0.55 }));
    tank.position.set((rnd() - 0.5) * (w - 6), h + 2.2 + 0.6, -depth / 2); tank.castShadow = true;
    grp.add(tank);
    this.scene.add(grp);
  }

  /** Our building's south face, with openings at the flat's windows. */
  _ourFacade() {
    const S = STREET;
    const x0 = -8; const x1 = 32; const H = 40;
    const shape = new THREE.Shape();
    shape.moveTo(x0, 0); shape.lineTo(x1, 0); shape.lineTo(x1, H); shape.lineTo(x0, H); shape.lineTo(x0, 0);
    // flat windows (world x, y, w, h): living, kitchen, bedroom — must match House.js
    for (const [wx, wy, ww, wh] of OUR_WINDOWS) {
      const hole = new THREE.Path(); hole.moveTo(wx - ww / 2, wy - wh / 2); hole.lineTo(wx + ww / 2, wy - wh / 2); hole.lineTo(wx + ww / 2, wy + wh / 2); hole.lineTo(wx - ww / 2, wy + wh / 2); hole.lineTo(wx - ww / 2, wy - wh / 2);
      shape.holes.push(hole);
    }
    const tex = facadeTex('#efe2c8', 4, 7, false);
    const geo = new THREE.ShapeGeometry(shape);
    // planar UVs over the whole face
    const pos = geo.attributes.position; const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) { uv[i * 2] = (pos.getX(i) - x0) / (x1 - x0); uv[i * 2 + 1] = pos.getY(i) / H; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // the ground floor is ours: plain plaster there (upper floors get the window texture)
    const face = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.92, side: THREE.DoubleSide });
    this.nightMats.push(face);
    const m = new THREE.Mesh(geo, face);
    m.position.z = S.facade; m.receiveShadow = true; m.castShadow = true;
    this.scene.add(m);
    // cover the textured ground-floor windows with plain plaster around our real openings
    // ShapeGeometry UVs are world units: one plaster tile per 12 units (≈ 3.6 m)
    const pt = plasterTex('#ecdfc4').clone(); pt.repeat.set(1 / 12, 1 / 12); pt.needsUpdate = true;
    const plain = std('#ffffff', { map: pt, roughness: 0.95, side: THREE.DoubleSide, normalMap: relief('beige_wall_001', [1 / 12, 1 / 12]) });
    const gshape = new THREE.Shape(); gshape.moveTo(x0, 0); gshape.lineTo(x1, 0); gshape.lineTo(x1, 9.8); gshape.lineTo(x0, 9.8); gshape.lineTo(x0, 0);
    for (const h of shape.holes) gshape.holes.push(h);
    const gm = new THREE.Mesh(new THREE.ShapeGeometry(gshape), plain);
    gm.position.z = S.facade - 0.02; gm.receiveShadow = true; this.scene.add(gm);
    // sunshades (chajja) over the windows and painted MS grills — seen from inside too
    const chajja = std('#ffffff', { map: plasterTex('#e3d7bf'), roughness: 0.9 }); const grill = std('#3d4347', { metalness: 0.5, roughness: 0.45 });
    const grills = [];
    for (const [wx, wy, ww, wh] of OUR_WINDOWS) {
      const c = box(ww + 0.8, 0.22, 1.1, chajja, wx, wy + wh / 2 + 0.7, S.facade - 0.55); c.castShadow = true; c.receiveShadow = true; this.scene.add(c);
      for (let k = 1; k < 6; k += 1) grills.push(new THREE.BoxGeometry(0.03, wh, 0.03).translate(wx - ww / 2 + (k * ww) / 6, wy, S.facade - 0.14));
      for (const fy of [-0.3, 0.3]) grills.push(new THREE.BoxGeometry(ww, 0.03, 0.03).translate(wx, wy + fy * wh, S.facade - 0.14));
    }
    const gr = new THREE.Mesh(mergeGeometries(grills), grill); gr.castShadow = true; this.scene.add(gr);
    // seen from the street on walks only (from inside they'd block the view): aluminium frames,
    // glass that reflects the sky, and our rooms behind it
    this.interiorBacks = new THREE.Group();
    const alu = std('#c9ccce', { metalness: 0.7, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: '#5d6f7a', metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.45, envMapIntensity: 1.4 });
    const room = (warm) => canvasTex(256, 192, (g, w, h) => {
      const gr2 = g.createLinearGradient(0, 0, 0, h); gr2.addColorStop(0, warm ? '#f3e2c4' : '#e9e4f0'); gr2.addColorStop(1, warm ? '#b49a78' : '#a59fb0');
      g.fillStyle = gr2; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.78, w, h * 0.22);               // floor in shade
      g.fillStyle = '#f4a460'; g.fillRect(0, 0, w * 0.18, h); g.fillRect(w * 0.82, 0, w * 0.18, h); // curtains
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 6; i += 1) g.fillRect(i * w * 0.03, 0, 2, h);
      g.fillStyle = '#8b6b4a'; g.fillRect(w * 0.42, h * 0.22, w * 0.16, h * 0.18);           // a picture
      const lamp = g.createRadialGradient(w * 0.5, h * 0.05, 2, w * 0.5, h * 0.05, w * 0.5); lamp.addColorStop(0, 'rgba(255,240,200,0.6)'); lamp.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = lamp; g.fillRect(0, 0, w, h);
    });
    OUR_WINDOWS.forEach(([wx, wy, ww, wh], i) => {
      const back = new THREE.Mesh(new THREE.PlaneGeometry(ww + 1.2, wh + 0.8), new THREE.MeshStandardMaterial({ map: room(i !== 1), roughness: 1, emissive: '#ffd9a0', emissiveIntensity: 0 }));
      back.position.set(wx, wy, S.facade + 0.9); back.rotation.y = Math.PI;
      this.nightMats.push(back.material);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glass);
      pane.position.set(wx, wy, S.facade + 0.05); pane.rotation.y = Math.PI;
      this.interiorBacks.add(back, pane);
      const f = 0.12;
      for (const [fw, fh, fx, fy] of [[ww + f, f, 0, wh / 2], [ww + f, f, 0, -wh / 2], [f, wh, -ww / 2, 0], [f, wh, ww / 2, 0], [f * 0.6, wh, 0, 0]]) {
        this.interiorBacks.add(box(fw, fh, 0.14, alu, wx + fx, wy + fy, S.facade + 0.02));
      }
    });
    this.interiorBacks.visible = false;
    this.scene.add(this.interiorBacks);
    // a plinth along the base (scanned concrete)
    const plinth = box(x1 - x0, 0.9, 0.4, std('#9a8f80', { ...pbr('concrete', [8, 0.3]), roughness: 1 }), (x0 + x1) / 2, 0.45, S.facade - 0.2);
    plinth.receiveShadow = true; this.scene.add(plinth);
  }

  async _loadModels() {
    const loader = new GLTFLoader();
    const load = (f) => loader.loadAsync(`./models/street/${f}`).then((g) => g.scene).catch(() => null);
    const [car, bus, scooter, cart, lamp, tree, dog] = await Promise.all(['car.glb', 'bus.glb', 'scooter.glb', 'cart.glb', 'lamp.glb', 'tree.glb', 'streetdog.glb'].map(load));
    const S = STREET;
    // fit a model to a length (x) or height (y), standing on y = base
    const fit = (obj, size, axis = 'x', base = 0) => {
      const o = obj.clone(true);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const bx = new THREE.Box3().setFromObject(o); const sz = bx.getSize(new V3());
      const k = size / (axis === 'y' ? sz.y : Math.max(sz.x, sz.z));
      o.scale.setScalar(k);
      const g = new THREE.Group(); g.add(o);
      const b2 = new THREE.Box3().setFromObject(g); o.position.y = base - b2.min.y;
      const c = b2.getCenter(new V3()); o.position.x -= c.x; o.position.z -= c.z;
      // turn the long side along x
      if (sz.z > sz.x) o.rotation.y = Math.PI / 2;
      return g;
    };
    // trees along both footpaths, lamps on the near kerb
    if (tree) {
      for (let x = S.x0 + 10; x < S.x1; x += 18 + rnd() * 10) {
        for (const z of [S.kerbNear + 1.1, S.kerbFar - 2.0]) {
          if (rnd() < 0.25) continue;
          // keep clear of the poles and lamp posts on our kerb (and of the walk camera)
          if (z > S.kerbNear && [(x - S.x0 - 6) % 24, (x - S.x0 - 12) % 24].some((d) => d < 4 || d > 20)) continue;
          if (z > S.kerbNear && x > -6 && x < 30) continue;     // nothing planted right in front of our windows
          const t = fit(tree, 18 + rnd() * 9, 'y', 0.5);
          // real neem/peepal colours: grey-brown bark, deep green leaves, each tree a little different
          const leafHue = 0.24 + rnd() * 0.06;
          t.traverse((m) => {
            if (!m.isMesh) return;
            m.material = m.material.clone();
            const hsl = {}; m.material.color.getHSL(hsl, THREE.SRGBColorSpace);
            if (hsl.h > 0.15 && hsl.h < 0.5) m.material.color.setHSL(leafHue, 0.42, 0.25 + rnd() * 0.07, THREE.SRGBColorSpace);
            else m.material.color.setHSL(0.07, 0.14, 0.36, THREE.SRGBColorSpace);
            m.material.roughness = 0.9; m.material.flatShading = false;
          });
          t.position.set(x + rnd() * 4, 0, z); t.rotation.y = rnd() * 6;
          t.userData.phase = rnd() * 6;
          this.scene.add(t); this.trees.push(t);
        }
      }
    }
    if (lamp) {
      for (let x = S.x0 + 12; x < S.x1; x += 24) {      // x = −6, 18, 42 …: between our windows, not in front of them
        const l = fit(lamp, 24, 'y', 0.5);
        l.position.set(x, 0, S.kerbNear + 1.0); l.rotation.y = Math.PI / 2;
        this.scene.add(l);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: '#4a4a40' }));
        head.position.set(x, 22.8, S.kerbNear - 1.4); this.scene.add(head);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.53, S.kerbNear - 0.5); this.scene.add(pool);
        this.lampHeads.push({ head, pool });
      }
      // a few real lights near the windows' view (the rest is glow)
      this.lampLights = [-6, 18, 42].map((x) => {
        const s = new THREE.SpotLight('#ffc27a', 0, 34, 0.75, 0.7, 1.6);
        s.position.set(x, 22.5, S.kerbNear - 1.4); s.target.position.set(x, 0, S.kerbNear - 3);
        this.scene.add(s, s.target);
        return s;
      });
    }
    // a vendor cart parked on the far kerb, street dogs dozing on the footpaths
    if (cart) { const c = fit(cart, 9, 'x', 0.5); c.position.set(36, 0, S.kerbFar - 3.5); c.rotation.y = 0.2; this.scene.add(c); }
    // two-wheelers parked nose-in along the far footpath, in front of the shops
    if (scooter) {
      for (let x = S.x0 + 14; x < S.x1 - 10; x += 9 + rnd() * 22) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k += 1) {
          const sc2 = fit(scooter, 5.6, 'x', 0.5);
          sc2.position.set(x + k * 2.2, 0, S.pathFar + 3.4); sc2.rotation.y = Math.PI / 2 + (rnd() - 0.5) * 0.3;
          this.scene.add(sc2);
        }
      }
    }
    if (dog) {
      for (const [x, z, r, lieDown] of [[30, S.kerbFar - 2.5, 1.2, true], [-30, S.kerbNear + 2.2, 4, true], [60, S.kerbFar - 3.4, 2.5, false]]) {
        const d = fit(dog, 2.2, 'x', 0.5); d.position.set(x, 0, z); d.rotation.y = r;
        if (lieDown) { d.scale.y = 0.55; d.position.y = -0.2; }
        this.scene.add(d);
      }
      this.dogModel = dog;
    }
    this.fit = fit;
    // traffic: autos everywhere (it's India), scooters, a hatchback, a bus
    const make = (kind) => {
      if (kind === 'auto') { const a = autoRickshaw(); const g = new THREE.Group(); a.scale.setScalar(1.55); g.add(a); return g; }
      if (kind === 'car' && car) return fit(car, 12.5, 'x', 0);
      if (kind === 'bus' && bus) return fit(bus, 36, 'x', 0);
      if (kind === 'scooter' && scooter) return fit(scooter, 6, 'x', 0);
      return null;
    };
    const plan = ['auto', 'scooter', 'car', 'auto', 'scooter', 'bus', 'auto', 'car', 'scooter', 'auto'];
    plan.forEach((kind, i) => {
      const v = make(kind); if (!v) return;
      const dir = i % 2 ? 1 : -1;
      const lane = dir > 0 ? S.laneA : S.laneB;
      v.position.set(S.x0 + rnd() * (S.x1 - S.x0), 0, lane + (rnd() - 0.5) * 2);
      v.rotation.y = dir > 0 ? 0 : Math.PI;
      const speed = { auto: 9, scooter: 12, car: 13, bus: 8 }[kind] * (0.8 + rnd() * 0.4);
      // headlights (glow at night)
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff4cc', transparent: true, opacity: 0 }));
      const bx = new THREE.Box3().setFromObject(v); const half = (bx.max.x - bx.min.x) / 2;
      hl.position.set(half, 2.2, 0); v.add(hl); this.headlights.push(hl);
      this.scene.add(v);
      this.vehicles.push({ v, dir, speed, kind });
    });
    this.ready = true;
    if (this.walking) this._walkExtras();
  }

  _buildRain() {
    const n = 2600;
    const pos = new Float32Array(n * 6);
    this.rainSeeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) this.rainSeeds.set([rnd(), rnd(), rnd()], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#c6d4e0', transparent: true, opacity: 0.5, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);
  }

  /** The sun's shadow covers a square this many units across around the focus (smaller = sharper). */
  _shadowBox(half) {
    if (this._shadowHalf === half) return;
    this._shadowHalf = half;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 420 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- time + weather
  /** Place the sun from the real time and sunrise/sunset; set the sky, clouds, fog, lights and night lamps. */
  setTime(now, sun, weather) {
    this.weather = weather;
    const h = now.getHours() + now.getMinutes() / 60;
    const { rise, set } = sun;
    const day = (h - rise) / (set - rise);
    let elev; let az;
    if (day >= 0 && day <= 1) { elev = Math.sin(Math.PI * day) * 68; az = 90 + 180 * day; }
    else {
      // below the horizon: track it round the far side so dusk and dawn glow on the right side
      const nightLen = 24 - (set - rise);
      const k = ((h - set + 24) % 24) / nightLen;
      elev = -Math.sin(Math.PI * k) * 40; az = 270 + 180 * k;
    }
    const e = THREE.MathUtils.degToRad(elev); const a = THREE.MathUtils.degToRad(az);
    const dir = new V3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));   // north = −z, east = +x
    this.sunDir = dir;
    const cloud = weather?.cloud ?? 0.25;
    const rain = weather?.rain || 0; const fog = weather?.fog ? 1 : 0;
    for (const sk of [this.sky, this.skyForEnv]) {
      const u = sk.material.uniforms;
      u.turbidity.value = lerp(2.5, 14, cloud);
      u.rayleigh.value = lerp(1.6, 0.6, cloud);
      u.mieCoefficient.value = lerp(0.004, 0.02, cloud);
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(dir).multiplyScalar(1000);
    }
    const up = Math.max(0, dir.y);
    const night = clamp(-dir.y * 6 + 0.15, 0, 1);
    this.night = night;
    this.sun.position.copy(dir).multiplyScalar(200);
    this.sun.intensity = 3.2 * Math.min(1, up * 3) * (1 - cloud * 0.75);
    this.sun.color.set(up < 0.12 ? '#ffb070' : up < 0.3 ? '#ffd2a0' : '#fff4e2');
    this.sun.castShadow = this.sun.intensity > 0.08;        // sun shadows whenever there is sun
    this.moon.position.set(40, 120, -200);
    this.moon.intensity = 0.45 * night * (1 - cloud * 0.6);
    this.hemiBase = lerp(0.2, 0.85, 1 - night) * (1 - cloud * 0.15);
    this.hemi.intensity = this.hemiBase;
    this.hemi.color.set(night > 0.5 ? '#41507a' : cloud > 0.6 ? '#c8ced6' : '#cfe3ff');
    this.stars.material.opacity = night * (1 - cloud) * 0.9;
    this.moonDisc.material.opacity = night * (1 - cloud * 0.8);
    this.moonDisc.position.set(220, 520, -1300); this.moonDisc.lookAt(0, 0, 0);
    this.clouds.material.opacity = 0.15 + cloud * 0.75;
    this.clouds.material.color.set(night > 0.5 ? '#2a3040' : rain ? '#9aa1a8' : '#ffffff');
    const fogCol = new THREE.Color(night > 0.5 ? '#1b2232' : rain ? '#9aa4ad' : '#c9d3db');
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = 0.0028 + cloud * 0.002 + rain * 0.006 + fog * 0.02;
    // night: lit windows, street lamps, headlights
    for (const m of this.nightMats) m.emissiveIntensity = night * 0.9;
    for (const l of this.lampHeads) { l.head.material.color.set(night > 0.3 ? '#ffd28a' : '#4a4a40'); l.pool.material.opacity = night * 0.35; }
    for (const s of this.lampLights || []) s.intensity = night * 70;
    for (const hl of this.headlights) hl.material.opacity = night;
    // wet road in the rain
    this.roadMat.roughness = rain ? 0.35 : 0.9;
    this.roadMat.color.set(rain ? '#9a9a9a' : '#ffffff');
    this.rain.visible = rain > 0 || !!weather?.snow;
    this.rainAmount = rain || weather?.snow || 0;
    this.snow = !!weather?.snow;
    this._envDirty = true;
  }

  /** A lightning flash (call with each thunderclap). */
  flash() { this.lightning = 1; }

  update(dt, focus) {
    this.t += dt;
    const t = this.t;
    const wind = (this.weather?.wind ?? 8) / 30;
    for (const tr of this.trees) {
      const k = tr.userData.phase;
      tr.rotation.z = Math.sin(t * 1.3 + k) * 0.012 * (1 + wind * 3);
      tr.rotation.x = Math.sin(t * 0.9 + k * 1.7) * 0.008 * (1 + wind * 3);
    }
    // keep the sun's shadow map centred on what we look at (walks do this themselves)
    if (!this.walking && this.sunDir) {
      this._shadowBox(42);
      const fx = Math.round((focus?.x ?? 10) / 4) * 4;          // snap, so shadows don't shimmer as the camera pans
      this.sun.target.position.set(fx, 0, -20);
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 200);
    }
    this.clouds.material.map.offset.x += dt * 0.002 * (1 + wind);
    const S = STREET;
    for (const c of this.vehicles) {
      c.v.position.x += c.dir * c.speed * dt;
      if (c.dir > 0 && c.v.position.x > S.x1 + 20) c.v.position.x = S.x0 - 20;
      if (c.dir < 0 && c.v.position.x < S.x0 - 20) c.v.position.x = S.x1 + 20;
      c.v.position.y = Math.abs(Math.sin(t * 9 + c.speed)) * 0.04;
    }
    // rain streaks / snowflakes in a box around what the camera looks at
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position.array; const sd = this.rainSeeds;
      const n = Math.floor((sd.length / 3) * Math.min(1, this.rainAmount));
      const fx = focus?.x ?? 10; const fz = focus?.z ?? -18;
      const fall = this.snow ? 3 : 40; const len = this.snow ? 0.15 : 1.6;
      for (let i = 0; i < sd.length / 3; i += 1) {
        if (i >= n) { p.fill(0, i * 6, i * 6 + 6); continue; }
        const x = fx - 30 + sd[i * 3] * 60 + (this.snow ? Math.sin(t + i) * 0.5 : 0);
        const z = fz - 25 + sd[i * 3 + 2] * 30;
        const y = 40 - (((t * fall * (0.8 + sd[i * 3 + 1] * 0.4)) + sd[i * 3 + 1] * 40) % 40);
        p.set([x, y, z, x - 0.15, y - len, z], i * 6);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.color.set(this.snow ? '#ffffff' : '#c6d4e0');
    }
    if (this.lightning > 0) {
      this.lightning = Math.max(0, this.lightning - dt * 2.5);
      const f = this.lightning > 0.6 || (this.lightning > 0.2 && this.lightning < 0.35) ? this.lightning : 0;
      this.hemi.intensity = this.hemiBase + f * 2.5;
    }
  }

  /** Draw the street with the house camera (its far plane is short; stretch it while we draw). */
  render(camera, { exposure = 0.6 } = {}) {
    const r = this.renderer;
    if (this._envDirty) {
      this._envDirty = false;
      if (this.scene.environment) this.scene.environment.dispose();
      this.scene.environment = this.pmrem.fromScene(this.skyScene, 0, 0.1, 5000).texture;
      this.scene.environmentIntensity = 0.5;
    }
    const far = camera.far; const near = camera.near;
    camera.far = 5000; camera.near = Math.max(near, 0.1); camera.updateProjectionMatrix();
    const exp = r.toneMappingExposure;
    r.toneMappingExposure = exposure;
    r.render(this.scene, camera);
    r.toneMappingExposure = exp;
    camera.far = far; camera.near = near; camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- walks
  /** Take the pet out: its model moves into this scene and walks along the footpath. */
  startWalk(root, opts) {
    this.walking = { root, prevParent: root.parent, x: WALK.x0, dir: 1, pause: 0, pose: 'walk', ...opts, other: null };
    this.scene.add(root);
    root.visible = true;
    root.position.copy(WALK.gate);
    root.rotation.y = 0;
    this._shadowBox(24);
    this.interiorBacks.visible = true;
    if (this.ready) this._walkExtras();
  }
  _walkExtras() {
    // the lead from the collar up to your hand
    if (!this.lead) {
      this.lead = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new V3(), new V3(), new V3(0, 1, 0)), 12, 0.03, 4), std('#c0392b', { roughness: 0.6 }));
      this.scene.add(this.lead);
    }
    this.lead.visible = true;
  }
  stopWalk() {
    const w = this.walking; if (!w) return;
    w.prevParent?.add(w.root);
    if (w.other) { this.scene.remove(w.other); }
    if (this.lead) this.lead.visible = false;
    this.interiorBacks.visible = false;
    this.walking = null;
  }
  /**
   * One step of the walk. ev: the walk sheet's pending event (sniff, pee, poop, dog, squirrel, water, person) or null.
   * Returns {pose, speed} for the dog's animation rig and moves the camera.
   */
  walkUpdate(dt, ev, len, headPos, camera) {
    const w = this.walking; if (!w) return null;
    const root = w.root;
    let speed = 1.25 * Math.sqrt(len / 1.85) * 1.6;
    let pose = 'walk';
    if (ev === 'squirrel') { speed *= 2.6; pose = 'walk'; }
    else if (ev && ev !== 'squirrel') { speed = 0; pose = ev === 'sniff' || ev === 'pee' ? 'sniff' : 'idle'; }
    // another dog comes to say hello
    if (ev === 'dog' && !w.other && this.dogModel && this.fit) {
      w.other = this.fit(this.dogModel, 2.0, 'x', 0.5);
      w.other.position.set(root.position.x + w.dir * 14, 0, WALK.z - 0.8);
      w.other.rotation.y = w.dir > 0 ? Math.PI : 0;
      this.scene.add(w.other);
    }
    if (w.other) {
      const target = root.position.x + w.dir * 2.6;
      w.other.position.x += clamp(target - w.other.position.x, -3 * dt, 3 * dt);
      w.other.position.y = 0.5 + Math.abs(Math.sin(this.t * 8)) * 0.05;
      if (ev !== 'dog' && Math.abs(w.other.position.x - root.position.x) > 0.5) {
        w.other.position.x += w.dir * 5 * dt * -1;
        if (Math.abs(w.other.position.x - root.position.x) > 25) { this.scene.remove(w.other); w.other = null; }
      }
    }
    // back and forth along the footpath
    root.position.x += w.dir * speed * dt;
    if (root.position.x > WALK.x1) w.dir = -1;
    if (root.position.x < WALK.x0 + 2 && w.dir < 0) w.dir = 1;
    root.position.y = 0.5; root.position.z = WALK.z;
    const wantYaw = w.dir > 0 ? 0 : Math.PI;
    root.rotation.y += (wantYaw - root.rotation.y) * Math.min(1, dt * 4);
    // your view: over the dog, down the footpath — our building on one side, trees, road and traffic on the other
    const ahead = w.dir > 0 ? 1 : -1;
    const want = new V3(root.position.x - ahead * 5.5, 4.0, WALK.z + 1.9);
    camera.position.lerp(want, Math.min(1, dt * 2.5));
    this._look = (this._look || new V3(root.position.x, 1, WALK.z)).lerp(new V3(root.position.x + ahead * 9, 1.1, WALK.z - 1.6), Math.min(1, dt * 2.5));
    camera.lookAt(this._look);
    this.sun.target.position.copy(root.position); this.sun.position.copy(root.position).addScaledVector(this.sunDir, 120);
    // the lead: collar → your hand (above and a little behind the camera's side)
    if (this.lead && headPos) {
      const hand = new V3(root.position.x - ahead * 2.6, 3.4, WALK.z + 1.0);
      const mid = headPos.clone().lerp(hand, 0.5); mid.y -= 0.9;
      this.lead.geometry.dispose();
      this.lead.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(headPos.clone().add(new V3(0, -0.35, 0)), mid, hand), 14, 0.03, 4);
    }
    return { pose, speed };
  }
}

// the flat's window openings in world coordinates (x, y, w, h); House.js cuts the same holes
export const OUR_WINDOWS = [
  [0 + 1.5, 2.55, 2.8, 2.2],     // living room (≈85 × 65 cm)
  [8 - 2.4, 2.45, 2.2, 1.45],    // kitchen, above the counter
  [24 + 1.0, 2.55, 2.6, 2.1],    // bedroom
];
