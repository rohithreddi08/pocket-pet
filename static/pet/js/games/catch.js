// Fish Frenzy — move the basket, catch treats, dodge boots. 45 seconds, 3 lives.
import { h } from '../ui/dom.js';

const ITEMS = [
  { icon: '🐟', pts: 1, w: 50 },
  { icon: '🍗', pts: 2, w: 20 },
  { icon: '🥛', pts: 1, w: 15 },
  { icon: '⭐', pts: 5, w: 4 },
  { icon: '🥾', pts: -1, w: 18, bad: true },
];
const TOTAL_W = ITEMS.reduce((s, i) => s + i.w, 0);

export function catchGame(root, { sound, onEnd }) {
  const cv = h('canvas', { class: 'catch-canvas' });
  const hud = h('div', { class: 'game-score' }, '');
  root.append(h('div', { class: 'game catch' }, hud, cv));
  const g = cv.getContext('2d');

  let W = 0; let H = 0; let dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(cv);

  let x = W / 2;
  const move = (e) => {
    const r = cv.getBoundingClientRect();
    x = Math.max(30, Math.min(W - 30, (e.touches ? e.touches[0].clientX : e.clientX) - r.left));
  };
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerdown', move);
  const keys = {};
  const kd = (e) => { keys[e.key] = true; }; const ku = (e) => { keys[e.key] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  const drops = [];
  const pops = [];
  let score = 0; let lives = 3; let time = 45; let spawn = 0; let alive = true; let last = performance.now();

  function pick() {
    let r = Math.random() * TOTAL_W;
    for (const it of ITEMS) { r -= it.w; if (r <= 0) return it; }
    return ITEMS[0];
  }

  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time -= dt;
    if (keys.ArrowLeft) x = Math.max(30, x - 420 * dt);
    if (keys.ArrowRight) x = Math.min(W - 30, x + 420 * dt);
    const level = 1 + (45 - time) / 15;
    spawn -= dt;
    if (spawn <= 0) {
      spawn = Math.max(0.28, 0.85 - level * 0.12);
      drops.push({ it: pick(), x: 20 + Math.random() * (W - 40), y: -30, v: 140 + Math.random() * 60 + level * 45, rot: Math.random() * 6 });
    }
    const basketY = H - 46;
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const d = drops[i];
      d.y += d.v * dt; d.rot += dt * 2;
      if (d.y > basketY - 20 && d.y < basketY + 20 && Math.abs(d.x - x) < 42) {
        drops.splice(i, 1);
        if (d.it.bad) { lives -= 1; sound.error(); pops.push({ x: d.x, y: basketY - 30, t: 0, txt: '💥' }); }
        else { score += d.it.pts; sound.pop(); pops.push({ x: d.x, y: basketY - 30, t: 0, txt: `+${d.it.pts}` }); }
      } else if (d.y > H + 30) drops.splice(i, 1);
    }

    g.clearRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#bfe6ff'); grd.addColorStop(1, '#fff3d6');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '34px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    for (const d of drops) {
      g.save(); g.translate(d.x, d.y); g.rotate(Math.sin(d.rot) * 0.3); g.fillText(d.it.icon, 0, 0); g.restore();
    }
    // basket = happy cat face with paws
    g.font = '52px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.fillText('😺', x, basketY);
    g.font = 'bold 18px system-ui, sans-serif';
    for (let i = pops.length - 1; i >= 0; i -= 1) {
      const p = pops[i]; p.t += dt;
      g.globalAlpha = Math.max(0, 1 - p.t);
      g.fillStyle = '#e8590c'; g.fillText(p.txt, p.x, p.y - p.t * 40);
      g.globalAlpha = 1;
      if (p.t > 1) pops.splice(i, 1);
    }
    hud.textContent = `🐟 ${score}   ⏱ ${Math.max(0, Math.ceil(time))}s   ${'❤️'.repeat(Math.max(0, lives))}`;

    if (time <= 0 || lives <= 0) { alive = false; setTimeout(() => onEnd(score), 300); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return () => {
    alive = false; ro.disconnect();
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
  };
}
