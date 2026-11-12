// ============================================================================
// textures.js — procedural canvas textures (no image assets needed).
// ============================================================================
import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

export function woodFloor(base = '#c99a6b', repeat = [2, 2]) {
  const [c, g] = canvas(512);
  const rows = 8;
  const h = 512 / rows;
  for (let r = 0; r < rows; r += 1) {
    let x = -(r * 97) % 512;
    while (x < 512) {
      const w = 160 + ((r * 31 + x) % 140);
      g.fillStyle = shade(base, ((r * 7 + Math.floor(x)) % 5 - 2) * 0.025);
      g.fillRect(x, r * h, w, h);
      // grain
      g.strokeStyle = 'rgba(80,45,20,0.10)';
      for (let k = 0; k < 6; k += 1) {
        g.beginPath();
        const y = r * h + 6 + k * (h / 6);
        g.moveTo(x, y);
        g.bezierCurveTo(x + w * 0.3, y + 3, x + w * 0.6, y - 3, x + w, y + 1);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,35,15,0.35)';
      g.fillRect(x, r * h, 2, h);
      x += w;
    }
    g.fillStyle = 'rgba(60,35,15,0.4)';
    g.fillRect(0, r * h, 512, 2);
  }
  return tex(c, { repeat });
}

export function tiles(c1 = '#f4efe6', c2 = '#7cc4b8', { checker = true, size = 8, grout = '#d9d2c4', repeat = [3, 3] } = {}) {
  const [c, g] = canvas(512);
  const s = 512 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      g.fillStyle = checker && (x + y) % 2 ? c2 : c1;
      g.fillRect(x * s, y * s, s, s);
      const grd = g.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
      grd.addColorStop(0, 'rgba(255,255,255,0.18)');
      grd.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = grd;
      g.fillRect(x * s, y * s, s, s);
    }
  }
  g.strokeStyle = grout; g.lineWidth = 4;
  for (let i = 0; i <= size; i += 1) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke();
  }
  return tex(c, { repeat });
}

/** pattern: dots | stripes | stars | leaves */
export function wallpaper(base, pattern = 'dots', repeat = [4, 2]) {
  const [c, g] = canvas(256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const ink = shade(base, -0.07);
  const hi = shade(base, 0.06);
  g.fillStyle = ink; g.strokeStyle = ink;
  if (pattern === 'stripes') {
    for (let x = 0; x < 256; x += 64) { g.fillRect(x, 0, 22, 256); g.fillStyle = hi; g.fillRect(x + 30, 0, 4, 256); g.fillStyle = ink; }
  } else if (pattern === 'stars') {
    const star = (cx, cy, r) => {
      g.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    };
    g.fillStyle = shade(base, 0.12);
    star(64, 64, 14); star(192, 160, 10); star(170, 40, 6); star(40, 200, 8);
  } else if (pattern === 'leaves') {
    g.lineWidth = 3;
    for (const [x, y, a] of [[60, 60, 0.4], [190, 120, -0.5], [100, 200, 1.2]]) {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = hi; g.beginPath(); g.moveTo(-24, 0); g.lineTo(24, 0); g.stroke();
      g.restore();
    }
  } else {
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        g.beginPath(); g.arc(x * 64 + (y % 2) * 32 + 16, y * 64 + 32, 6, 0, Math.PI * 2); g.fill();
      }
    }
  }
  return tex(c, { repeat });
}

export function rug(colors = ['#e9a178', '#f4d6a0', '#8fc1b5'], round = true) {
  const [c, g] = canvas(512);
  const cx = 256;
  if (round) {
    colors.concat(colors).forEach((col, i, arr) => {
      g.fillStyle = col;
      g.beginPath(); g.arc(cx, cx, 256 - i * (256 / arr.length), 0, Math.PI * 2); g.fill();
    });
  } else {
    g.fillStyle = colors[0]; g.fillRect(0, 0, 512, 512);
    g.fillStyle = colors[1];
    for (let i = 0; i < 512; i += 64) g.fillRect(i, 0, 28, 512);
    g.strokeStyle = colors[2]; g.lineWidth = 18; g.strokeRect(20, 20, 472, 472);
  }
  // fibers
  for (let i = 0; i < 4000; i += 1) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function stripes(colors, n = 6, vertical = false) {
  const [c, g] = canvas(128);
  const s = 128 / n;
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = colors[i % colors.length];
    if (vertical) g.fillRect(i * s, 0, s, 128); else g.fillRect(0, i * s, 128, s);
  }
  return tex(c);
}

/** Beach-ball texture: colored segments around U. */
export function beachBall() {
  const [c, g] = canvas(256, 128);
  const cols = ['#ff6b6b', '#ffffff', '#4dabf7', '#ffffff', '#ffd43b', '#ffffff'];
  cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * (256 / cols.length), 0, 256 / cols.length + 1, 128); });
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 10); g.fillRect(0, 118, 256, 10);
  return tex(c);
}

/** Sky seen through a window, by local hour. Returns {texture, redraw(hour)}. */
export function windowSky() {
  const [c, g] = canvas(256);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const stars = Array.from({ length: 40 }, () => [Math.random() * 256, Math.random() * 170, Math.random() * 1.6 + 0.4]);
  const drops = Array.from({ length: 70 }, () => [Math.random() * 256, Math.random() * 256, 8 + Math.random() * 10]);
  /**
   * hour: local time; sun: {rise, set} hours (real ones once the weather knows your place);
   * w: describe() of the current weather or null ({cloud 0..1, rain, snow, fog, storm}).
   */
  function redraw(hour, sun = { rise: 6.5, set: 19 }, w = null) {
    const night = hour < sun.rise - 0.4 || hour >= sun.set + 0.6;
    const dusk = !night && (Math.abs(hour - sun.set) < 1.1 || Math.abs(hour - sun.rise) < 1.1);
    const cloud = w?.cloud ?? 0.25;
    const grey = Math.min(1, cloud * 0.9 + (w?.rain ? 0.2 : 0) + (w?.storm ? 0.25 : 0));
    const grd = g.createLinearGradient(0, 0, 0, 256);
    if (night) { grd.addColorStop(0, '#0b1433'); grd.addColorStop(1, '#2a3a6e'); }
    else if (dusk) { grd.addColorStop(0, '#5a6fb5'); grd.addColorStop(0.6, '#f2a07b'); grd.addColorStop(1, '#ffd29a'); }
    else { grd.addColorStop(0, '#6db7f2'); grd.addColorStop(1, '#cfeaff'); }
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    // overcast skies wash the colour out toward grey
    if (grey > 0.05) { g.fillStyle = night ? `rgba(30,34,44,${grey * 0.7})` : `rgba(150,158,168,${grey * 0.75})`; g.fillRect(0, 0, 256, 256); }
    if (night) {
      if (cloud < 0.6) {
        g.fillStyle = '#fff';
        for (const [x, y, r] of stars) { g.globalAlpha = (0.5 + Math.random() * 0.5) * (1 - cloud); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1;
        g.fillStyle = '#fdf6d8'; g.beginPath(); g.arc(190, 60, 22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0b1433'; g.beginPath(); g.arc(180, 54, 20, 0, Math.PI * 2); g.fill();
      }
    } else if (cloud < 0.8) {
      g.fillStyle = dusk ? '#ffcf7a' : '#fff6c4';
      const morning = Math.abs(hour - sun.rise) < Math.abs(hour - sun.set);
      g.beginPath(); g.arc(dusk ? (morning ? 196 : 60) : 190, dusk ? 170 : 60, 26, 0, Math.PI * 2); g.fill();
    }
    // clouds: more and greyer as cover rises
    const n = 2 + Math.round(cloud * 5);
    const cc = night ? `rgba(90,98,120,${0.5 + cloud * 0.4})` : (grey > 0.5 ? `rgba(200,204,210,${0.85})` : 'rgba(255,255,255,0.9)');
    g.fillStyle = cc;
    for (let i = 0; i < n; i += 1) {
      const x = (i * 71 + 30) % 250; const y = 40 + ((i * 53) % 110);
      g.beginPath(); g.ellipse(x, y, 34 + cloud * 14, 14 + cloud * 6, 0, 0, Math.PI * 2); g.ellipse(x + 22, y - 8, 22 + cloud * 8, 14, 0, 0, Math.PI * 2); g.fill();
    }
    // distant hills + tree line
    g.fillStyle = night ? '#1d2c3f' : '#7fb069';
    g.beginPath(); g.moveTo(0, 256); g.quadraticCurveTo(70, 180, 140, 215); g.quadraticCurveTo(200, 240, 256, 190); g.lineTo(256, 256); g.fill();
    g.fillStyle = night ? '#15212f' : '#5c8f4c';
    g.beginPath(); g.moveTo(0, 256); g.quadraticCurveTo(120, 205, 256, 240); g.lineTo(256, 256); g.fill();
    if (w?.snow) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(0, 226, 256, 30); }
    // rain streaks, snowflakes, fog
    if (w?.rain) {
      g.strokeStyle = 'rgba(210,225,240,0.55)'; g.lineWidth = 1.2;
      for (const [x, y, l] of drops.slice(0, Math.round(drops.length * w.rain))) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + l); g.stroke(); }
    }
    if (w?.snow) {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const [x, y] of drops.slice(0, Math.round(drops.length * w.snow))) { g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill(); }
    }
    if (w?.fog) { g.fillStyle = 'rgba(225,228,232,0.55)'; g.fillRect(0, 0, 256, 256); }
    t.needsUpdate = true;
    return night;
  }
  return { texture: t, redraw };
}

/** Wall clock face; call redraw() each minute. */
export function clockFace() {
  const [c, g] = canvas(256);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  function redraw(date = new Date()) {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#e07a5f'; g.stroke();
    g.fillStyle = '#3d405b';
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath(); g.arc(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100, i % 3 ? 4 : 8, 0, Math.PI * 2); g.fill();
    }
    const h = (date.getHours() % 12) + date.getMinutes() / 60;
    const m = date.getMinutes();
    const hand = (a, len, w) => {
      g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = '#3d405b';
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke();
    };
    hand((h / 12) * Math.PI * 2, 58, 10);
    hand((m / 60) * Math.PI * 2, 88, 6);
    g.fillStyle = '#e07a5f'; g.beginPath(); g.arc(128, 128, 9, 0, Math.PI * 2); g.fill();
    t.needsUpdate = true;
  }
  redraw();
  return { texture: t, redraw };
}

/** Little framed art: paw print / fish / mountains. */
export function art(kind = 'paw', bg = '#fdf3e1') {
  const [c, g] = canvas(256);
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  if (kind === 'paw') {
    g.fillStyle = '#e07a5f';
    g.beginPath(); g.ellipse(128, 160, 50, 42, 0, 0, Math.PI * 2); g.fill();
    for (const [x, y] of [[70, 95], [108, 70], [150, 70], [188, 95]]) { g.beginPath(); g.ellipse(x, y, 20, 26, 0, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'fish') {
    g.fillStyle = '#81b29a';
    g.beginPath(); g.ellipse(120, 128, 70, 40, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(180, 128); g.lineTo(230, 90); g.lineTo(230, 166); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(80, 118, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#333'; g.beginPath(); g.arc(80, 118, 5, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = '#f2cc8f'; g.beginPath(); g.arc(180, 80, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d405b'; g.beginPath(); g.moveTo(0, 220); g.lineTo(90, 100); g.lineTo(170, 220); g.fill();
    g.fillStyle = '#81b29a'; g.beginPath(); g.moveTo(80, 230); g.lineTo(180, 120); g.lineTo(256, 230); g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Emoji/glyph texture for particles. */
const glyphCache = new Map();
export function glyph(char, size = 128) {
  if (glyphCache.has(char)) return glyphCache.get(char);
  const [c, g] = canvas(size);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${size * 0.8}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(char, size / 2, size / 2 + size * 0.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glyphCache.set(char, t);
  return t;
}

/** Soft round blob (bubbles, water drops). */
export function blob(inner = 'rgba(255,255,255,0.95)', outer = 'rgba(200,230,255,0.0)', ring = false) {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, ring ? 'rgba(255,255,255,0.15)' : inner);
  grd.addColorStop(ring ? 0.75 : 0.6, ring ? 'rgba(255,255,255,0.35)' : inner);
  grd.addColorStop(ring ? 0.9 : 1, ring ? inner : outer);
  grd.addColorStop(1, outer);
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  if (ring) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(22, 22, 5, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
