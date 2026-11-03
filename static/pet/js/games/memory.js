// Purr-fect Memory — watch the pads light up, repeat the sequence.
import { h } from '../ui/dom.js';

const PADS = [
  { icon: '🐟', color: '#4dabf7' },
  { icon: '🧶', color: '#ff6b6b' },
  { icon: '🐭', color: '#ffd43b' },
  { icon: '🍗', color: '#69db7c' },
];

export function memoryGame(root, { sound, onEnd }) {
  let seq = [];
  let input = 0;
  let accepting = false;
  let alive = true;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => alive && fn(), ms));

  const status = h('div', { class: 'game-status' }, 'Watch closely…');
  const score = h('div', { class: 'game-score' }, 'Round 0');
  const pads = PADS.map((p, i) => h('button', {
    class: 'pad', style: `--c:${p.color}`, 'aria-label': p.icon,
    onclick: () => press(i),
  }, p.icon));
  root.append(h('div', { class: 'game memory' }, score, h('div', { class: 'pads' }, ...pads), status));

  function flash(i, ms = 380) {
    pads[i].classList.add('lit');
    sound.note(i);
    later(() => pads[i].classList.remove('lit'), ms);
  }

  function next() {
    seq.push(Math.floor(Math.random() * 4));
    input = 0;
    accepting = false;
    score.textContent = `Round ${seq.length}`;
    status.textContent = 'Watch closely…';
    const gap = Math.max(260, 620 - seq.length * 30);
    seq.forEach((p, k) => later(() => flash(p, gap * 0.7), 500 + k * gap));
    later(() => { accepting = true; status.textContent = 'Your turn!'; }, 500 + seq.length * gap);
  }

  function press(i) {
    if (!accepting) return;
    flash(i, 200);
    if (i !== seq[input]) {
      accepting = false;
      sound.error();
      status.textContent = `Oops! You reached round ${seq.length}.`;
      later(() => onEnd(seq.length - 1), 900);
      return;
    }
    input += 1;
    if (input === seq.length) {
      accepting = false;
      status.textContent = 'Purr-fect! 🎉';
      sound.sparkle();
      later(next, 900);
    }
  }

  later(next, 400);
  return () => { alive = false; timers.forEach(clearTimeout); };
}
