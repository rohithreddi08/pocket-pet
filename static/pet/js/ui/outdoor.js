// ============================================================================
// outdoor.js — dog walks and training sessions.
// ----------------------------------------------------------------------------
// Walks happen in real time: clip the lead, head out, and things happen on
// the way — sniff stops, toilet breaks (pick up after your dog!), other dogs,
// squirrels. Training uses positive reinforcement: give the cue, and if the
// dog gets it right, reward within ~2 seconds.
// ============================================================================
import { h, $ } from './dom.js';
import { TRICKS } from '../pet/Dog.js';
import { FOODS } from '../state.js';
import { thumbnail } from '../pet/factory.js';
import { ageMonths, pronoun } from '../species.js';

const EVENTS = ['sniff', 'pee', 'poop', 'dog', 'squirrel', 'water', 'person', 'sniff', 'pee'];
const rand = (a, b) => a + Math.random() * (b - a);

export function openWalk(ui) {
  const g = ui.game;
  if (g.species !== 'dog') { ui.toast('Cats are safest indoors 🏠'); return; }
  if (ui.walk) { renderWalk(ui); return; }
  const name = g.s.name; const she = pronoun(g.pet); const her = pronoun(g.pet, 'obj');
  const w = g.s.walks;
  const pup = g.stage === 'baby';
  const opts = [
    [2, 'Potty break', 'Quick toilet trip round the block'],
    [5, 'Walk', pup ? 'Perfect for a puppy' : 'A proper walk with sniff stops'],
    [10, 'Long walk', pup ? 'Too long for a young puppy\'s joints' : 'Great exercise — working breeds need this'],
  ];
  ui.openSheet(`🦮 Walk ${name}`, h('div', { class: 'center' },
    h('p', {}, g.s.bladder < 0 ? `${name} really needs to go out!` : `${name} ${g.needs.play < 40 ? 'is restless and needs exercise.' : 'would love a walk.'}`),
    h('p', { class: 'muted small' }, `Today: ${w.day === new Date().toISOString().slice(0, 10) ? `${w.count} walk(s), ${w.minutes} min` : 'no walks yet'}. Real walks are longer — here time runs about 3× faster.`),
    h('div', { class: 'grid' }, ...opts.map(([min, label, sub]) => h('div', { class: 'card game-card', onclick: () => leash(ui, min) },
      h('div', { class: 'card-icon' }, min === 2 ? '🚽' : min === 5 ? '🦮' : '🌳'), h('div', { class: 'card-name' }, `${label} · ${min} min`), h('div', { class: 'card-sub' }, sub)))),
    h('p', { class: 'muted small' }, `Bring poop bags and water. Keep ${her} on the lead near roads — ${she}'ll pull at squirrels.`)));
}

function leash(ui, minutes) {
  const g = ui.game;
  ui.openSheet('🦮 Getting ready', h('div', { class: 'center' },
    h('div', { class: 'big' }, '🦮'),
    h('p', {}, `Clip the lead onto ${g.s.name}'s collar (hold), grab poop bags 🛍️ and water 💧.`),
    holdLeash(() => {
      ui.walk = { minutes, start: 0, events: [], social: 0, picked: 0, missed: 0, pending: null, nextEvent: 0, out: false };
      ui.sound.click();
      $('#sheetClose').hidden = true;
      ui.a.startWalk(() => {
        ui.walk.out = true;
        ui.walk.start = Date.now();
        ui.walk.nextEvent = Date.now() + rand(8, 14) * 1000;
        renderWalk(ui);
      });
      ui.openSheet('🦮 Heading out…', h('div', { class: 'center' }, h('div', { class: 'big' }, '🚪'), h('p', {}, `${g.s.name} is dancing at the door!`)));
      $('#sheetClose').hidden = true;
    })));
}

function holdLeash(onDone) {
  const bar = h('b');
  const btn = h('button', { class: 'hold' }, h('span', {}, 'Hold to clip the lead'), h('i', {}, bar));
  let t0 = 0; let raf = 0; let done = false;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1200);
    bar.style.width = `${k * 100}%`;
    if (k >= 1) { done = true; onDone(); return; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', (e) => { if (done) return; e.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(tick); });
  const stop = () => { if (!done) { cancelAnimationFrame(raf); bar.style.width = '0%'; } };
  btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop);
  return btn;
}

function renderWalk(ui) {
  const g = ui.game; const w = ui.walk;
  const name = g.s.name; const he = pronoun(g.pet); const him = pronoun(g.pet, 'obj');
  const timeEl = h('b', { class: 'timer' });
  const bar = h('i', {}, h('b'));
  const log = h('ul', { class: 'walk-log' });
  const card = h('div', { class: 'walk-event hidden' });
  const dogImg = h('img', { class: 'walker', alt: '' });
  thumbnail(g.pet.breed, g.pet.coat, { months: ageMonths(g.pet) }).then((u) => { dogImg.src = u; });
  const scene = h('div', { class: 'walk-scene' }, h('div', { class: 'trees' }), dogImg, h('div', { class: 'me' }, '🚶'));
  const addLog = (t) => log.prepend(h('li', {}, t));
  for (const e of w.events) log.append(h('li', {}, e));

  const show = (ev) => {
    w.pending = { ev, until: Date.now() + (ev === 'squirrel' ? 3000 : ev === 'poop' ? 15000 : 12000) };
    card.className = 'walk-event';
    const btns = [];
    const resolve = (text, fx) => { w.pending = null; card.className = 'walk-event hidden'; w.events.unshift(text); addLog(text); fx?.(); };
    let text = '';
    switch (ev) {
      case 'sniff':
        text = `👃 ${name} found a fascinating lamppost.`;
        btns.push(['Let ' + him + ' sniff', () => resolve(`👃 Long sniff — sniffing is brain exercise for dogs.`, () => { g.addNeed('play', 4); g.addBond(0.3); })],
          ['Keep walking', () => resolve('🚶 Kept walking.')]);
        break;
      case 'pee':
        text = `💧 ${name} has a wee.`;
        resolve(text, () => { g.s.bladder = Math.max(g.s.bladder, 60); });
        return;
      case 'poop':
        text = `💩 ${name} did a poo.`;
        btns.push(['🛍️ Pick it up', () => { w.picked += 1; resolve('🛍️ Picked up the poo — good neighbour!', () => { g.addXp(2); ui.sound.pop(); }); }]);
        break;
      case 'dog':
        text = `🐕 A friendly beagle wants to say hi.`;
        btns.push(['Let them sniff hello', () => resolve(g.pet.personality === 'shy' && g.bond < 40 ? `😟 ${name} hid behind your legs — go slowly with shy dogs.` : `🐶 Bum sniffs and play bows — great socialising!`, () => { w.social += 1; g.addNeed('play', 5); })],
          ['Cross the street', () => resolve('↪️ Gave the other dog some space.')]);
        break;
      case 'squirrel':
        text = `🐿️ SQUIRREL! ${name} lunges!`;
        btns.push(['✋ Hold the lead!', () => resolve(`✋ You held on. ${name} calmed down. (Train “loose lead” with treats.)`, () => g.addBond(0.2))]);
        break;
      case 'water':
        text = `☀️ It's warm — ${name} is panting.`;
        btns.push(['💧 Offer water', () => resolve(`💧 ${name} lapped up some water.`, () => g.addNeed('water', 20))], ['Carry on', () => resolve('🚶 Carried on.')]);
        break;
      case 'person':
        text = `🧒 A child asks to pet ${name}.`;
        btns.push(['Show them how (gently)', () => resolve(`🤚 Gentle pats on the chest — ${name} wagged.`, () => { w.social += 1; g.addBond(0.2); })], ['Not today', () => resolve('🙂 Politely said no — always your call.')]);
        break;
      default:
    }
    card.replaceChildren(h('p', {}, text), h('div', { class: 'row wrap' }, ...btns.map(([l, fn]) => h('button', { class: 'chip', onclick: () => { ui.sound.click(); fn(); } }, l))));
  };

  const home = h('button', { class: 'primary' }, 'Head home 🏠');
  home.onclick = () => endWalk(ui);
  const tick = () => {
    if (!ui.walk || !w.out) return;
    const now = Date.now();
    const total = w.minutes * 60000;
    const el = now - w.start;
    const left = Math.max(0, total - el);
    timeEl.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    bar.firstChild.style.width = `${Math.min(100, (el / total) * 100)}%`;
    dogImg.style.transform = `translateY(${Math.abs(Math.sin(now / 160)) * -4}px)`;
    if (w.pending && now > w.pending.until) {
      const ev = w.pending.ev;
      w.pending = null; card.className = 'walk-event hidden';
      const t = ev === 'poop' ? `💩 You didn't pick up the poo — always bag it.` : ev === 'squirrel' ? `💨 ${name} pulled you halfway down the street!` : '⏱️ Moved on.';
      if (ev === 'poop') w.missed += 1;
      w.events.unshift(t); addLog(t);
    }
    if (!w.pending && now > w.nextEvent && left > 4000) {
      w.nextEvent = now + rand(12, 22) * 1000;
      let ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      if (w.minutes === 2 && !w.events.some((x) => x.startsWith('💧'))) ev = 'pee';
      show(ev);
    }
    if (!left) { home.textContent = 'Walk complete — head home 🏠'; home.classList.add('pulse'); }
  };
  ui.openSheet(`🦮 Walking ${name}`, h('div', { class: 'walk' },
    scene,
    h('div', { class: 'walk-bar' }, h('small', {}, 'Time left'), timeEl, h('div', { class: 'progress' }, bar)),
    card,
    log,
    home,
    h('p', { class: 'muted small' }, `${he[0].toUpperCase() + he.slice(1)}'s getting exercise, sniffing the world and doing ${pronoun(g.pet, 'pos')} business outside — where dogs prefer it.`)), { wide: true });
  $('#sheetClose').hidden = true;
  tick();
  const iv = setInterval(tick, 250);
  ui._cleanup = () => clearInterval(iv);
}

function endWalk(ui) {
  const g = ui.game; const w = ui.walk;
  if (!w) return;
  const minutes = Math.max(1, Math.round((Date.now() - (w.start || Date.now())) / 60000 * 10) / 10);
  const done = Math.min(w.minutes, minutes);
  ui.walk = null;
  $('#sheetClose').hidden = false;
  g.finishWalk(Math.round(done * 3), { social: w.social });           // ~3× compressed
  if (w.missed) g.addCoins(-5 * w.missed, 'fine');
  ui.a.endWalk(() => ui.hint(`${g.s.name} shook off and is happy to be home. ${g.needs.water < 60 ? 'Fresh water would be welcome!' : ''}`));
  ui.openSheet('🏠 Home again', h('div', { class: 'center' },
    h('div', { class: 'big' }, '🐾'),
    h('p', {}, `${Math.round(done * 10) / 10} min walk (≈${Math.round(done * 3)} real-life minutes). Exercise ↑ · trust ↑ · toilet ✓`),
    w.missed ? h('p', { class: 'bad' }, `−${5 * w.missed} 🪙 fine for leaving poo behind!`) : null,
    h('ul', { class: 'walk-log' }, ...w.events.slice(0, 6).map((e) => h('li', {}, e))),
    h('p', { class: 'muted small' }, 'Wipe muddy paws when you get in — it keeps floors and paws clean.'),
    pawWipe(ui)));
}

function pawWipe(ui) {
  const g = ui.game;
  const bar = h('b');
  const btn = h('button', { class: 'hold' }, h('span', {}, '🧻 Hold to wipe paws'), h('i', {}, bar));
  let t0 = 0; let raf = 0; let done = false;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 2000);
    bar.style.width = `${k * 100}%`;
    if (k >= 1) { done = true; g.addNeed('groom', 8); ui.sound.sparkle(); btn.classList.add('ok'); btn.firstChild.textContent = '✓ Clean paws'; return; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', (e) => { if (done) return; e.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(tick); });
  const stop = () => { if (!done) { cancelAnimationFrame(raf); bar.style.width = '0%'; } };
  btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop);
  return btn;
}

// ---------------------------------------------------------------------------
export function openTrain(ui) {
  const g = ui.game;
  if (g.species !== 'dog') return;
  const name = g.s.name;
  const left = g.trainingLeftToday();
  if (left <= 0) {
    ui.openSheet('🎓 Training', h('div', { class: 'center' }, h('div', { class: 'big' }, '😴'),
      h('p', {}, `That's 15 minutes of training today — plenty! Short, happy sessions work best. ${name} will remember more after a sleep.`)));
    return;
  }
  const t0 = Date.now();
  const treatId = ['bites', 'biscuit', 'chew', 'pbutter', 'carrot'].find((id) => g.hasFood(id));
  const grid = h('div', { class: 'grid tricks' });
  const stage = h('div', { class: 'train-stage center' }, h('p', { class: 'muted' }, 'Pick a trick, give the cue, and reward the moment it\'s done right.'));
  const drawGrid = () => {
    grid.replaceChildren(...Object.entries(TRICKS).map(([id, tr]) => {
      const p = Math.round(g.s.tricks[id] || 0);
      return h('button', { class: 'card trick', onclick: () => cue(id) },
        h('div', { class: 'card-icon' }, tr.icon), h('div', { class: 'card-name' }, tr.name),
        h('div', { class: 'progress' }, h('i', {}, h('b', { style: `width:${p}%` }))),
        h('div', { class: 'card-sub' }, p >= 100 ? '⭐ Mastered' : p >= 60 ? 'Knows it' : p >= 25 ? 'Learning' : 'New'));
    }));
  };
  let busy = false;
  const cue = (id) => {
    if (busy) return;
    busy = true;
    ui.sound.click();
    stage.replaceChildren(h('div', { class: 'big' }, '🗣️'), h('h3', {}, `“${TRICKS[id].cue}”`), h('p', { class: 'muted' }, `${name} is thinking…`));
    const ok = ui.a.trick(id, (success) => {
      if (!success) {
        stage.replaceChildren(h('div', { class: 'big' }, '🤔'), h('p', {}, `Not quite. Don't scold — just wait a moment and try again. ${(g.s.tricks[id] || 0) < 25 ? 'New tricks take many repetitions.' : ''}`));
        busy = false;
        return;
      }
      // Reward window: mark it right away.
      const opened = performance.now();
      const bar = h('b');
      const timer = h('div', { class: 'progress urgent' }, h('i', {}, bar));
      let closed = false;
      const reward = (kind) => {
        if (closed) return;
        closed = true;
        const dtS = (performance.now() - opened) / 1000;
        const rate = (g.stage === 'baby' || g.stage === 'young' ? 1.3 : g.stage === 'senior' ? 0.8 : 1);
        let gain = 0; let msg = '';
        if (kind === 'treat') {
          const f = g.useTreat(treatId, { training: true });
          if (f) ui.a.celebrate();
          gain = dtS <= 2 ? 10 : 3;
          msg = dtS <= 2 ? `🦴 Perfect timing! ${name} connects “${TRICKS[id].name}” with the reward.` : `🦴 A bit late (${dtS.toFixed(1)} s) — reward within 2 seconds so ${pronoun(g.pet)} knows what earned it.`;
        } else if (kind === 'praise') {
          gain = dtS <= 2 ? 6 : 2;
          msg = dtS <= 2 ? '🗣️ “Good dog!” — praise works too, treats work faster.' : '🗣️ Late praise — try to be quicker.';
        } else {
          gain = 1;
          msg = '⏱️ No reward — the moment passed. Rewards teach, so be ready!';
        }
        gain *= rate;
        const before = g.s.tricks[id] || 0;
        g.s.tricks[id] = Math.min(100, before + gain);
        g.addBond(kind === 'none' ? 0 : 0.3); g.addXp(2);
        if (before < 100 && g.s.tricks[id] >= 100) { g.addCoins(30, 'trick'); ui.toast(`⭐ ${name} mastered “${TRICKS[id].name}”! +30 🪙`, 'big'); }
        g.save();
        stage.replaceChildren(h('div', { class: 'big' }, kind === 'none' ? '😐' : '🎉'), h('p', {}, msg));
        drawGrid();
        busy = false;
      };
      const treatBtn = h('button', { class: 'primary', disabled: !treatId }, treatId ? `${FOODS[treatId].icon} Treat!` : 'No treats');
      treatBtn.onclick = () => reward('treat');
      const praise = h('button', { class: 'chip' }, '🗣️ “Good dog!”');
      praise.onclick = () => reward('praise');
      stage.replaceChildren(h('div', { class: 'big' }, '✅'), h('h3', {}, `${name} did it! Reward now!`), timer, h('div', { class: 'row' }, treatBtn, praise));
      const run = () => {
        if (closed) return;
        const k = Math.min(1, (performance.now() - opened) / 4000);
        bar.style.width = `${(1 - k) * 100}%`;
        if (k >= 1) { reward('none'); return; }
        requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    });
    if (!ok) busy = false;
  };
  drawGrid();
  ui.openSheet(`🎓 Training ${name}`, h('div', {},
    h('p', { class: 'muted small' }, `${left} min of training left today. Treats used: ${treatId ? FOODS[treatId].name : 'none — buy dog biscuits or bake pumpkin bites'} (tiny pieces, they don't count toward the daily treat limit).`),
    grid, stage), {
    wide: true,
    onClose: () => {
      const mins = (Date.now() - t0) / 60000;
      g.s.training.minutes += mins;
      g.save();
    },
  });
}

/** Called when switching pets mid-walk. */
export function abortWalk(ui) { ui.walk = null; $('#sheetClose').hidden = false; }
