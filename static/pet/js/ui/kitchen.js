// ============================================================================
// kitchen.js — cook real food for your pet, step by step.
// ----------------------------------------------------------------------------
//   wash hands → gather safe ingredients (hazards are on the shelf too) →
//   trim / debone / chop / rinse → cook on the hob (real minutes, stir when
//   asked, check the core temperature) → let it cool → add the supplement →
//   weigh portions for YOUR pet → serve one, fridge the rest (3 days).
// The pot keeps cooking if you close the sheet — and can burn.
// ============================================================================
import { h } from './dom.js';
import { INGREDIENTS, HAZARDS, RECIPES, FRIDGE_DAYS, recipeKcal100, recipeGrams, missingFor } from '../cooking.js';
import { FOODS } from '../state.js';
import { weightKg, dailyKcal, mealsPerDay } from '../species.js';

const COOL_SECONDS = 45;
const rand = (a, b) => a + Math.random() * (b - a);

function stepsFor(r) {
  const steps = [{ k: 'wash', title: 'Wash your hands', icon: '🧼' }, { k: 'gather', title: 'Gather the ingredients', icon: '🧺' }];
  for (const [id] of r.items) {
    const ing = INGREDIENTS[id];
    const t = { trim: 'Trim the fat & check for bones', debone: 'Remove the pin bones', chop: 'Peel & chop', rinse: 'Rinse', crack: 'Crack the egg' }[ing.prep];
    if (t) steps.push({ k: ing.prep, item: id, title: `${t}: ${ing.name.toLowerCase()}`, icon: ing.icon });
  }
  steps.push({ k: 'cook', title: r.cook.method, icon: r.makes ? '♨️' : '🍲' });
  steps.push({ k: 'cool', title: 'Let it cool down', icon: '🌬️' });
  if (r.items.some(([id]) => id === 'catvit' || id === 'dogvit')) steps.push({ k: 'mix', title: 'Mix in the supplement', icon: '💊' });
  steps.push({ k: r.makes ? 'bites' : 'portion', title: r.makes ? 'Cut into bites' : 'Weigh out portions', icon: '⚖️' });
  return steps;
}

/** Buttons for the meal tray: home-cooked portions in the fridge. */
export function fridgeList(ui) {
  const g = ui.game;
  return g.fridge().map((m) => {
    const rec = g.portionGrams(m.kcal100);
    const days = Math.max(0, Math.ceil((m.expires - Date.now()) / 864e5));
    return h('button', {
      class: 'food home', title: `${m.name} — ${m.grams} g left, ${days} day(s) until it should be thrown away`,
      onclick: () => { ui.a.serveMeal(m.id, Math.min(rec, m.grams)); ui.closeTray(); },
    }, h('span', { class: 'fi' }, m.icon), h('span', { class: 'fc' }, `${Math.round(m.grams)}g`), h('span', { class: 'fd' }, `${days}d`));
  });
}

export function openCook(ui) {
  const g = ui.game;
  const c = g.p.cooking;
  if (c && RECIPES[c.recipe]?.species === g.species) return renderStep(ui);
  if (c) {
    // Something for another pet is on the stove.
    ui.openSheet('🍳 Kitchen', h('div', { class: 'center' },
      h('p', {}, `You're in the middle of “${RECIPES[c.recipe]?.name}” for your ${RECIPES[c.recipe]?.species}. Finish it first, or bin it.`),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => renderStep(ui, true) }, 'Carry on cooking'),
        h('button', { class: 'danger', onclick: () => { g.p.cooking = null; g.save(); ui.sound.squish(); openCook(ui); } }, 'Bin it'))));
    return;
  }
  pickRecipe(ui);
}

function pickRecipe(ui) {
  const g = ui.game;
  const name = g.s.name;
  const grid = h('div', { class: 'grid recipes' });
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.species !== g.species) continue;
    const missing = missingFor(r, g.s.pantry);
    const kcal = recipeKcal100(r);
    grid.append(h('div', { class: 'card recipe' },
      h('div', { class: 'card-icon' }, r.icon),
      h('div', { class: 'card-name' }, r.name),
      h('div', { class: 'card-sub' }, r.items.map(([i]) => INGREDIENTS[i].icon).join(' ')),
      h('div', { class: 'card-sub' }, `${r.makes ? `${r.makes.count} treats` : `${recipeGrams(r)} g · ${kcal} kcal/100 g`} · ~${Math.round(r.cook.seconds / 60 + 2)} min`),
      h('div', { class: 'card-sub' }, r.note),
      missing.length
        ? h('button', { class: 'buy owned', onclick: () => buyMissing(ui, r, () => pickRecipe(ui)) }, `Need ${missing.map((i) => INGREDIENTS[i].icon).join('')} — buy`)
        : h('button', { class: 'buy', onclick: () => start(ui, id) }, 'Cook this')));
  }
  ui.openSheet('🍳 Cook for ' + (name || 'your pet'), h('div', {},
    h('p', { class: 'muted small' }, `Real food takes real time: about 4–6 minutes of washing, prepping, cooking and cooling. ${name} needs ~${dailyKcal(g.pet)} kcal a day (${weightKg(g.pet)} kg, ${mealsPerDay(g.pet)} meals).`),
    grid,
    h('p', { class: 'muted small' }, '⚕️ Home-made diets need a vet-formulated supplement to be complete. Ask your vet before switching for good.')), { wide: true });
}

function buyMissing(ui, r, then) {
  const g = ui.game;
  const missing = missingFor(r, g.s.pantry);
  const cost = missing.reduce((s, i) => s + INGREDIENTS[i].price, 0);
  if (g.s.coins < cost) { ui.sound.error(); ui.toast(`Not enough coins (need 🪙 ${cost})`); return; }
  for (const i of missing) g.buy('ingredient', i, INGREDIENTS);
  ui.sound.coin();
  ui.toast(`🛒 Bought ${missing.map((i) => INGREDIENTS[i].name).join(', ')} for 🪙 ${cost}`);
  then();
}

function start(ui, recipeId) {
  const g = ui.game;
  const r = RECIPES[recipeId];
  g.p.cooking = { recipe: recipeId, step: 0, steps: stepsFor(r), quality: 100, notes: [], gathered: [], startedAt: Date.now() };
  g.save();
  ui.a.cooking();
  renderStep(ui);
}

function note(c, good, text, penalty = 0) {
  c.notes.push({ good, text });
  c.quality = Math.max(0, c.quality - penalty);
}

function next(ui) {
  const g = ui.game; const c = g.p.cooking;
  c.step += 1;
  g.save();
  ui.sound.pop();
  renderStep(ui);
}

/** Header with progress through the recipe. */
function frame(ui, c, body, foot) {
  const r = RECIPES[c.recipe];
  const st = c.steps[c.step];
  const dots = h('div', { class: 'steps' }, ...c.steps.map((s, i) => h('i', { class: i < c.step ? 'done' : i === c.step ? 'on' : '', title: s.title }, s.icon)));
  const bin = h('button', {
    class: 'link small', onclick: () => {
      if (bin.dataset.armed) { g0(ui).p.cooking = null; g0(ui).save(); ui.sound.squish(); ui.a.sizzle(false); ui.closeSheet(); ui.toast('Binned. Ingredients wasted 😢'); return; }
      bin.dataset.armed = '1'; bin.textContent = 'Tap again to bin it';
    },
  }, 'Give up');
  ui.openSheet(`${r.icon} ${r.name}`, h('div', { class: 'cook' },
    dots,
    h('h3', { class: 'step-title' }, `${st.icon} Step ${c.step + 1}/${c.steps.length}: ${st.title}`),
    body,
    h('div', { class: 'row cook-foot' }, ...(foot || []), bin)), { wide: true, onClose: () => ui.a.sizzle(false) });
}
const g0 = (ui) => ui.game;

/** A button you must hold down for `secs`. */
function holdButton(label, secs, onDone, sound) {
  const bar = h('b');
  const btn = h('button', { class: 'hold' }, h('span', {}, label), h('i', {}, bar));
  let t0 = 0; let raf = 0; let done = false;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
    bar.style.width = `${k * 100}%`;
    if (k >= 1) { done = true; btn.classList.add('ok'); onDone(); return; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', (e) => { if (done) return; e.preventDefault(); t0 = performance.now(); sound?.(); raf = requestAnimationFrame(tick); });
  const stop = () => { if (done) return; cancelAnimationFrame(raf); bar.style.width = '0%'; };
  btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
  return btn;
}

function renderStep(ui, force = false) {
  const g = ui.game; const c = g.p.cooking;
  if (!c) { pickRecipe(ui); return; }
  if (!force && RECIPES[c.recipe].species !== g.species) { openCook(ui); return; }
  const r = RECIPES[c.recipe];
  const st = c.steps[c.step];
  if (!st) { finish(ui); return; }
  const nextBtn = (label = 'Next ›', enabled = true, handler = null) => h('button', { class: 'primary', disabled: !enabled, onclick: handler || (() => next(ui)) }, label);

  switch (st.k) {
    // ------------------------------------------------------------------ hygiene
    case 'wash': {
      const nb = nextBtn('Next ›', false);
      frame(ui, c, h('div', { class: 'center' },
        h('div', { class: 'big' }, '🧼🫧'),
        h('p', {}, 'Raw meat carries bacteria like Salmonella — for you and your pet. Wash for 20 seconds (here: hold the button).'),
        holdButton('Hold to scrub', 3, () => { nb.disabled = false; ui.sound.sparkle(); }, () => ui.sound.shower(true)),
      ), [nb]);
      const stopWater = () => ui.sound.shower(false);
      document.addEventListener('pointerup', stopWater, { once: true });
      break;
    }
    // ------------------------------------------------------------------ gather
    case 'gather': {
      const needed = r.items.map(([id]) => id);
      const shelf = [...needed];
      const extras = Object.keys(INGREDIENTS).filter((i) => !needed.includes(i)).sort(() => Math.random() - 0.5).slice(0, 3);
      const hazards = Object.keys(HAZARDS).sort(() => Math.random() - 0.5).slice(0, 4);
      const all = [...shelf.map((i) => ['ing', i]), ...extras.map((i) => ['ing', i]), ...hazards.map((i) => ['haz', i])].sort(() => Math.random() - 0.5);
      const warn = h('div', { class: 'warn hidden' });
      const nb = nextBtn('Start prepping ›', needed.every((i) => c.gathered.includes(i)));
      const grid = h('div', { class: 'shelf' });
      const draw = () => {
        grid.replaceChildren(...all.map(([kind, id]) => {
          const it = kind === 'ing' ? INGREDIENTS[id] : HAZARDS[id];
          const got = c.gathered.includes(id);
          const own = kind === 'ing' ? g.s.pantry[id] || 0 : null;
          return h('button', {
            class: `shelf-item ${got ? 'got' : ''}`,
            onclick: () => {
              if (got) return;
              if (kind === 'haz') {
                ui.sound.error();
                warn.className = 'warn';
                warn.textContent = `⛔ ${it.name}: ${it.why}`;
                if (!c.notes.some((n) => n.text.includes(it.name))) note(c, false, `Picked up ${it.name.toLowerCase()} (put it back!)`, 5);
                g.save();
                return;
              }
              if (!needed.includes(id)) { ui.sound.click(); warn.className = 'warn soft'; warn.textContent = `${it.icon} ${it.name} isn't in this recipe.`; return; }
              if (!own) {
                if (g.s.coins >= it.price) { g.buy('ingredient', id, INGREDIENTS); ui.sound.coin(); ui.toast(`🛒 Bought ${it.name} (🪙 ${it.price})`); }
                else { ui.sound.error(); ui.toast(`You need ${it.name} — not enough coins`); return; }
              }
              g.s.pantry[id] -= 1;
              c.gathered.push(id);
              ui.sound.pop();
              g.save();
              warn.className = 'warn hidden';
              nb.disabled = !needed.every((i) => c.gathered.includes(i));
              draw();
            },
          }, h('span', { class: 'si' }, it.icon), h('span', { class: 'sn' }, it.name.replace(/ \(.*\)/, '')), own != null && needed.includes(id) && !got ? h('small', {}, own ? `×${own}` : `🪙${it.price}`) : null);
        }));
      };
      draw();
      frame(ui, c, h('div', {},
        h('p', {}, `Tap what this recipe needs: ${needed.map((i) => `${INGREDIENTS[i].icon} ${INGREDIENTS[i].name}`).join(', ')}. Careful — the kitchen shelf has human food on it too.`),
        grid, warn), [nb]);
      break;
    }
    // ------------------------------------------------------------------ prep
    case 'trim': case 'debone': case 'crack': {
      const ing = INGREDIENTS[st.item];
      const n = st.k === 'debone' ? 6 : st.k === 'crack' ? (Math.random() < 0.5 ? 1 : 0) : 4;
      const icon = st.k === 'trim' ? ['🦴', '⚪'] : st.k === 'debone' ? ['🦴'] : ['🥚'];
      const board = h('div', { class: 'board' }, h('div', { class: 'board-food' }, st.k === 'crack' ? '🍳' : ing.icon));
      let left = n;
      const nb = nextBtn('Next ›', n === 0);
      const msg = h('p', { class: 'muted small' }, st.k === 'debone' ? 'Pin bones are tiny and sharp — find them all.' : st.k === 'crack' ? (n ? 'Oops, a bit of shell fell in — pick it out!' : 'Clean crack, no shell. 👌') : 'Cut away fat and any bone — cooked bones splinter.');
      for (let i = 0; i < n; i += 1) {
        const piece = h('button', { class: 'piece', style: `left:${rand(12, 82)}%;top:${rand(15, 75)}%;font-size:${st.k === 'debone' ? 16 : 24}px` }, st.k === 'crack' ? '🫥' : icon[i % icon.length]);
        piece.onclick = () => {
          piece.remove(); ui.sound.chop(); left -= 1;
          if (!left) { nb.disabled = false; ui.sound.sparkle(); msg.textContent = 'All clean ✓'; }
        };
        board.append(piece);
      }
      frame(ui, c, h('div', {}, board, msg), [nb]);
      if (!c.notes.some((x) => x.k === st.k + st.item)) c.notes.push({ good: true, text: st.k === 'debone' ? 'Pin bones removed' : st.k === 'trim' ? 'Fat & bones trimmed' : 'No eggshell', k: st.k + st.item });
      break;
    }
    case 'chop': {
      const ing = INGREDIENTS[st.item];
      let cuts = 0; const need = 8;
      const pieces = h('div', { class: 'pieces' });
      const nb = nextBtn('Next ›', false);
      const knife = h('button', { class: 'board chop' }, h('div', { class: 'board-food' }, ing.icon), h('small', {}, 'Tap to chop'));
      knife.onclick = () => {
        if (cuts >= need) return;
        cuts += 1; ui.sound.chop();
        pieces.append(h('i', {}, ing.icon));
        knife.classList.remove('hit'); void knife.offsetWidth; knife.classList.add('hit');
        if (cuts >= need) { nb.disabled = false; ui.sound.sparkle(); }
      };
      frame(ui, c, h('div', {}, h('p', {}, 'Small pieces cook evenly and are easier to digest.'), knife, pieces), [nb]);
      break;
    }
    case 'rinse': {
      const ing = INGREDIENTS[st.item];
      const nb = nextBtn('Next ›', false);
      frame(ui, c, h('div', { class: 'center' },
        h('div', { class: 'big' }, `🚰${ing.icon}`),
        h('p', {}, ing.prep === 'rinse' && st.item === 'rice' ? 'Rinse the rice until the water runs clear.' : 'Give it a good rinse.'),
        holdButton('Hold under the tap', 2, () => { nb.disabled = false; ui.sound.shower(false); ui.sound.sparkle(); }, () => ui.sound.shower(true))), [nb]);
      document.addEventListener('pointerup', () => ui.sound.shower(false), { once: true });
      break;
    }
    // ------------------------------------------------------------------ cook
    case 'cook': {
      c.cook ||= { start: Date.now(), stirs: 0, missed: 0, nextStir: Date.now() + rand(15, 25) * 1000, stirUntil: 0, checked: false };
      g.save();
      ui.a.cooking();
      const k = c.cook;
      const total = r.cook.seconds * 1000;
      const timer = h('b', { class: 'timer' });
      const temp = h('div', { class: 'thermo' }, h('i'));
      const tempLabel = h('span', { class: 'temp' });
      const status = h('p', { class: 'muted small' });
      const pot = h('div', { class: 'pot' }, h('span', { class: 'steam' }, '♨️'), h('div', { class: 'pot-body' }, r.makes ? '🫓' : '🍲'));
      const stir = h('button', { class: 'chip stir' }, '🥄 Stir');
      const check = h('button', { class: 'chip' }, '🌡️ Check core temp');
      let onNext = null;
      const nb = nextBtn(r.makes ? 'Take out of the oven ›' : 'Take off the heat ›', false, () => onNext());
      const coreAt = (t) => {
        const f = Math.min(1.25, (t - k.start) / total);
        return Math.round(20 + (r.cook.temp + 6 - 20) * (1 - Math.exp(-3.2 * f)) / (1 - Math.exp(-3.2)));
      };
      stir.onclick = () => {
        const now = Date.now();
        if (now < k.stirUntil) { k.stirs += 1; k.stirUntil = 0; k.nextStir = now + rand(18, 30) * 1000; ui.sound.squish(); stir.classList.remove('due'); status.textContent = 'Stirred ✓ — nothing sticking.'; }
        else { ui.sound.click(); status.textContent = 'No need yet — stirring too often cools it down.'; }
        g.save();
      };
      check.onclick = () => {
        const t = coreAt(Date.now());
        k.checked = true;
        ui.sound.click();
        status.textContent = t >= r.cook.temp ? `🌡️ ${t} °C in the centre — safely cooked (needs ${r.cook.temp} °C).` : `🌡️ Only ${t} °C in the centre — not safe yet (needs ${r.cook.temp} °C). Keep cooking.`;
        g.save();
      };
      onNext = () => {
        const t = coreAt(Date.now());
        if (t < r.cook.temp) { ui.sound.error(); status.textContent = `⛔ ${t} °C — undercooked meat can carry Salmonella. Keep cooking.`; return; }
        note(c, k.missed === 0, k.missed ? `Missed ${k.missed} stir${k.missed > 1 ? 's' : ''} (a bit stuck)` : k.stirs ? `Stirred on time (${k.stirs}×)` : 'Kept an eye on the pot', 0);
        note(c, k.checked, k.checked ? `Checked it reached ${r.cook.temp} °C` : 'Didn\'t check the core temperature', k.checked ? 0 : 5);
        const over = (Date.now() - k.start - total) / 1000;
        if (over > 60) note(c, false, 'Overcooked — a bit dry', Math.min(25, Math.round((over - 60) / 4)));
        ui.a.sizzle(false);
        next(ui);
      };
      const tick = () => {
        if (!g.p.cooking || g.p.cooking.steps[g.p.cooking.step]?.k !== 'cook') return;
        const now = Date.now();
        const el = now - k.start; const left = Math.max(0, total - el);
        timer.textContent = left ? `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : 'Ready!';
        const t = coreAt(now);
        tempLabel.textContent = `${t} °C`;
        temp.firstChild.style.height = `${Math.min(100, (t / 90) * 100)}%`;
        temp.classList.toggle('safe', t >= r.cook.temp);
        if (!left) nb.disabled = false;
        if (el > total + 60000) { status.textContent = '🔥 It\'s starting to burn — take it off!'; pot.classList.add('burn'); }
        // Stir prompts.
        if (left && now > k.nextStir && !k.stirUntil) { k.stirUntil = now + 6000; stir.classList.add('due'); status.textContent = 'Bubbling — give it a stir!'; ui.sound.pop(); }
        if (k.stirUntil && now > k.stirUntil) { k.stirUntil = 0; k.missed += 1; k.nextStir = now + rand(18, 30) * 1000; stir.classList.remove('due'); status.textContent = 'Missed it — a little stuck to the bottom.'; c.quality = Math.max(0, c.quality - 4); g.save(); }
      };
      ui.a.sizzle(true);
      frame(ui, c, h('div', { class: 'cook-stage' },
        pot,
        h('div', { class: 'gauges' }, h('div', {}, h('small', {}, 'Time'), timer), h('div', { class: 'tcol' }, temp, tempLabel)),
        h('div', { class: 'row' }, stir, check), status,
        h('p', { class: 'muted small' }, `Cooking plain: no salt, oil, onion or spices. Safe core temperature: ${r.cook.temp} °C. You can close this — the pot keeps going (and can burn!).`)), [nb]);
      tick();
      const iv = setInterval(tick, 250);
      ui._cleanup = () => { clearInterval(iv); ui.a.sizzle(false); };
      break;
    }
    case 'cool': {
      c.cool ||= { start: Date.now(), spread: false };
      g.save();
      const k = c.cool;
      const temp = h('div', { class: 'thermo' }, h('i'));
      const label = h('span', { class: 'temp' });
      const status = h('p', {});
      let onNext = null;
      const nb = nextBtn('Next ›', false, () => onNext());
      const spread = h('button', { class: 'chip', disabled: k.spread }, '🍽️ Spread it on a plate');
      const tempAt = (now) => {
        const secs = (now - k.start) / 1000 * (k.spread ? 1.8 : 1);
        return Math.round(22 + 53 * Math.exp(-secs / (COOL_SECONDS / 2.2)));
      };
      spread.onclick = () => { if (k.spread) return; k.spread = true; spread.disabled = true; ui.sound.pop(); status.textContent = 'Spread thin — it cools much faster.'; g.save(); };
      onNext = () => {
        const t = tempAt(Date.now());
        if (t > 40) { ui.sound.error(); status.textContent = `⛔ Still ${t} °C — hot food can burn a pet's mouth. Wait until it's below 40 °C.`; return; }
        note(c, true, 'Cooled before serving');
        next(ui);
      };
      const tick = () => {
        if (g.p.cooking?.steps[g.p.cooking.step]?.k !== 'cool') return;
        const t = tempAt(Date.now());
        label.textContent = `${t} °C`;
        temp.firstChild.style.height = `${Math.min(100, (t / 90) * 100)}%`;
        temp.classList.toggle('safe', t <= 40);
        if (t <= 40) { nb.disabled = false; if (!status.textContent.includes('Ready')) status.textContent = 'Ready — lukewarm, like fresh prey. ✓'; }
      };
      frame(ui, c, h('div', { class: 'cook-stage' },
        h('div', { class: 'pot cool' }, h('div', { class: 'pot-body' }, r.makes ? '🍪' : '🥘')),
        h('div', { class: 'gauges' }, h('div', { class: 'tcol' }, temp, label)),
        spread, status,
        h('p', { class: 'muted small' }, 'Serve at room temperature or just warm — never hot.')), [nb]);
      tick();
      const iv = setInterval(tick, 250);
      ui._cleanup = () => clearInterval(iv);
      break;
    }
    case 'mix': {
      const vit = r.items.find(([id]) => id === 'catvit' || id === 'dogvit')[0];
      let n = 0;
      const nb = nextBtn('Next ›', false);
      const bowl = h('button', { class: 'board chop' }, h('div', { class: 'board-food' }, '🥣'), h('small', {}, `Tap to sprinkle ${INGREDIENTS[vit].icon} and stir`));
      bowl.onclick = () => { if (n >= 5) return; n += 1; ui.sound.squish(); bowl.classList.remove('hit'); void bowl.offsetWidth; bowl.classList.add('hit'); if (n >= 5) { nb.disabled = false; ui.sound.sparkle(); } };
      frame(ui, c, h('div', {},
        h('p', {}, g.species === 'cat'
          ? 'Cats can\'t make enough taurine themselves — without it they get heart and eye disease. Meat alone is also too low in calcium.'
          : 'Meat is rich in phosphorus but low in calcium; the supplement balances the meal.'),
        bowl), [nb]);
      if (!c.notes.some((x) => x.k === 'vit')) c.notes.push({ good: true, text: 'Balanced with a vet supplement', k: 'vit' });
      break;
    }
    // ------------------------------------------------------------------ portions
    case 'portion': {
      const total = recipeGrams(r);
      const kcal100 = recipeKcal100(r);
      const rec = g.portionGrams(kcal100);
      const slider = h('input', { type: 'range', min: 10, max: Math.max(60, Math.min(total, rec * 3)), step: 5, value: Math.min(total, rec) });
      const out = h('p', {});
      const upd = () => {
        const p = Number(slider.value);
        const ratio = p / rec;
        out.replaceChildren(
          h('b', {}, `${p} g per meal → ${Math.floor(total / p)} portion${Math.floor(total / p) === 1 ? '' : 's'}`),
          h('br'),
          h('span', { class: ratio > 1.25 ? 'bad' : ratio < 0.75 ? 'meh' : 'good' }, ratio > 1.25 ? `Too much — ${g.s.name} needs ~${rec} g per meal. Overfeeding causes obesity.` : ratio < 0.75 ? `A bit little — ~${rec} g per meal is right.` : `✓ Right for ${g.s.name}: ~${rec} g per meal (${Math.round(rec * kcal100 / 100)} kcal).`));
      };
      slider.oninput = upd; upd();
      const done = (serveNow) => {
        const p = Number(slider.value);
        const ratio = p / rec;
        note(c, ratio >= 0.75 && ratio <= 1.25, ratio >= 0.75 && ratio <= 1.25 ? 'Portion sized for your pet' : 'Portion size off', ratio >= 0.75 && ratio <= 1.25 ? 0 : 8);
        const meal = {
          id: `m${Date.now().toString(36)}`, recipe: c.recipe, name: r.name, icon: r.icon, species: r.species,
          made: Date.now(), expires: Date.now() + FRIDGE_DAYS * 864e5, grams: total, kcal100, quality: c.quality, portion: p,
        };
        g.p.meals.push(meal);
        if (serveNow) ui.a.serveMeal(meal.id, p);
        finish(ui, serveNow ? `Served ${p} g; ${Math.max(0, total - p)} g in the fridge (keeps ${FRIDGE_DAYS} days).` : `${total} g in the fridge (keeps ${FRIDGE_DAYS} days).`);
      };
      frame(ui, c, h('div', { class: 'portion' },
        h('div', { class: 'big' }, '⚖️'),
        h('p', {}, `The batch weighs ${total} g (${kcal100} kcal per 100 g). ${g.s.name}: ${weightKg(g.pet)} kg, ${g.stage === 'baby' ? 'growing fast' : g.stage}, ~${dailyKcal(g.pet)} kcal/day over ${mealsPerDay(g.pet)} meals.`),
        h('label', { class: 'form' }, 'Portion size', slider), out), [
        h('button', { class: 'primary', disabled: g.s.bowl.food > 70, title: g.s.bowl.food > 70 ? 'The bowl is still full' : '', onclick: () => done(true) }, '🥣 Serve one now'),
        h('button', { onclick: () => done(false) }, '🧊 Fridge it all'),
      ]);
      break;
    }
    case 'bites': {
      const nb = h('button', { class: 'primary' }, `Cut into ${r.makes.count} bites`);
      nb.onclick = () => {
        g.s.inventory[r.makes.treat] = (g.s.inventory[r.makes.treat] || 0) + r.makes.count;
        finish(ui, `${r.makes.count} ${FOODS[r.makes.treat].name.toLowerCase()} added to your treats. They still count toward the daily treat limit.`);
      };
      frame(ui, c, h('div', { class: 'center' }, h('div', { class: 'big' }, '🔪🍪'), h('p', {}, 'Small bites are best — perfect for training rewards.')), [nb]);
      break;
    }
    default:
      next(ui);
  }
}

function finish(ui, outcome = '') {
  const g = ui.game; const c = g.p.cooking;
  const r = RECIPES[c.recipe];
  const q = Math.round(c.quality);
  for (const m of g.p.meals) if (m.made > c.startedAt) m.quality = q;
  g.p.cooking = null;
  g.count('cooked');
  const coins = 10 + Math.round(q / 10);
  g.addCoins(coins, 'cook'); g.addXp(12);
  g.addBond(1);
  g.save();
  ui.sound.levelUp();
  ui.a.sizzle(false);
  ui.openSheet(`${r.icon} ${r.name} — done!`, h('div', { class: 'center' },
    h('div', { class: 'big' }, q >= 85 ? '🏅' : q >= 60 ? '👍' : '🙂'),
    h('h3', {}, `Quality ${q}/100`),
    h('ul', { class: 'notes' }, ...c.notes.map((n) => h('li', { class: n.good ? 'good' : 'bad' }, `${n.good ? '✓' : '✗'} ${n.text}`))),
    h('p', {}, outcome),
    h('p', { class: 'muted small' }, `+${coins} 🪙 · +12 XP · 💗 trust`),
    h('button', { class: 'primary', onclick: () => ui.closeSheet() }, 'Done')));
}
