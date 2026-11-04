// ============================================================================
// ui.js — HUD, room dock, sheets (shop, wardrobe, games, settings, daily),
// food tray, focus timer, toasts and the thought bubble.
// The UI never touches Three.js; it calls `actions` provided by main.js.
// ============================================================================
import { h, $ } from './dom.js';
import { NEEDS, FOODS, HATS, THEMES, xpToNext } from '../state.js';
import { ROOMS } from '../world/House.js';
import { memoryGame } from '../games/memory.js';
import { catchGame } from '../games/catch.js';

const RING_C = 2 * Math.PI * 20;

export class UI {
  constructor({ game, sound, actions }) {
    this.game = game;
    this.sound = sound;
    this.a = actions;
    this.tool = null;
    this._cleanup = null;

    this._buildHud();
    this._bindSide();
    game.on('change', () => this.refresh());
    game.on('coins', ({ n }) => { if (n > 0) this._bump('#coins'); });
    game.on('levelup', ({ level, reward }) => {
      this.toast(`🎉 Level ${level}! +${reward} coins`, 'big');
      this.a.celebrate();
    });
    this.refresh();
  }

  // ------------------------------------------------------------------ HUD
  _buildHud() {
    const needs = $('#needs');
    this.rings = {};
    for (const n of NEEDS) {
      // innerHTML so the <svg> gets the SVG namespace (createElement('svg') wouldn't render).
      const ring = h('div', {
        class: 'need', title: n.label,
        html: `<svg viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="20"/><circle class="fg" cx="24" cy="24" r="20" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg><span class="icon">${n.icon}</span>`,
      });
      needs.append(ring);
      this.rings[n.id] = ring;
    }
  }

  refresh() {
    const s = this.game.s;
    for (const n of NEEDS) {
      const v = s.needs[n.id];
      const ring = this.rings[n.id];
      const fg = ring.querySelector('.fg');
      fg.setAttribute('stroke-dashoffset', String(RING_C * (1 - v / 100)));
      fg.style.stroke = v > 60 ? '#40c057' : v > 30 ? '#fab005' : '#fa5252';
      ring.classList.toggle('low', v < 25);
    }
    $('#coins span').textContent = s.coins;
    $('#petName').textContent = s.name || 'Your cat';
    const m = this.game.mood();
    $('#mood').textContent = `${m.emoji} ${m.label}`;
    $('#levelNum').textContent = s.level;
    $('#bondBar').style.width = `${s.bond}%`;
    $('#bondLabel').textContent = this.game.bondLabel();
    $('#bond').title = `Trust: ${Math.round(s.bond)}/100 — grows with gentle, consistent care`;
    const pct = s.xp / xpToNext(s.level);
    $('#levelRing').setAttribute('stroke-dashoffset', String(RING_C * (1 - pct)));
    $('#btnDaily').classList.toggle('badge', this.game.dailyAvailable());
    // Keep bowl/litter levels on the dock buttons current.
    if (this._dockRoom === 'kitchen' || this._dockRoom === 'bathroom') {
      const key = `${this._dockRoom}|${Math.round(s.bowl.food / 5)}|${Math.round(s.bowl.water / 5)}|${s.litter > 60 ? 2 : s.litter > 25 ? 1 : 0}`;
      if (key !== this._dockKey) {
        this._dockKey = key;
        this._dock(this._dockRoom);
        document.querySelectorAll('.dock-btn.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === this.tool));
      }
    }
  }

  /** "Mochi: Napping on the cat tree" + a chip when the cat is in another room. */
  status(pet, room) {
    const name = this.game.s.name || 'Your cat';
    const here = pet.room === room && !pet.travelling;
    $('#status').textContent = here && pet.status ? `${name}: ${pet.status}` : '';
    const where = $('#where');
    if (!here) {
      const r = ROOMS[pet.room];
      this._whereRoom = pet.room;
      where.textContent = pet.travelling ? `🐾 ${name} is on the move… ${pet.status ? `(${pet.status.toLowerCase()})` : ''}` : `🐾 ${name} is in the ${r.name}${pet.status ? ` — ${pet.status.toLowerCase()}` : ''} ›`;
      where.hidden = false;
    } else {
      where.hidden = true;
    }
  }

  hint(text) { this.toast(`💡 ${text}`, 'hint'); }

  _bump(sel) {
    const el = $(sel); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  // ------------------------------------------------------------------ rooms + dock
  setRoom(i) {
    const r = ROOMS[i];
    $('#roomTitle').textContent = `${r.icon} ${r.name}`;
    $('#navL').disabled = i === 0;
    $('#navR').disabled = i === ROOMS.length - 1;
    $('#navL').title = i > 0 ? ROOMS[i - 1].name : '';
    $('#navR').title = i < ROOMS.length - 1 ? ROOMS[i + 1].name : '';
    this.setTool(null);
    this._dock(r.id);
  }

  _dock(id) {
    const dock = $('#dock');
    dock.replaceChildren();
    const btn = (icon, label, fn, cls = '') => h('button', { class: `dock-btn ${cls}`, onclick: () => { this.sound.click(); fn(); } }, h('span', { class: 'i' }, icon), h('span', { class: 'l' }, label));
    const tool = (icon, label, name) => {
      const b = btn(icon, label, () => this.setTool(this.tool === name ? null : name), 'tool');
      b.dataset.tool = name;
      return b;
    };
    if (id === 'living') {
      dock.append(btn('🎾', 'Ball', () => this.a.throwBall()), tool('🔴', 'Laser', 'laser'), btn('🍪', 'Treat', () => this.openTray('treat')), btn('🎮', 'Games', () => this.openGames()));
    } else if (id === 'kitchen') {
      const b = this.game.s.bowl;
      dock.append(
        btn('🥣', `Meal ${Math.round(b.food)}%`, () => this.openTray('meal')),
        btn('💧', `Water ${Math.round(b.water)}%`, () => { this.a.refillWater(); this._dock('kitchen'); }),
        btn('🍪', 'Treat', () => this.openTray('treat')),
        btn('🛒', 'Groceries', () => this.openShop('food')));
    } else if (id === 'bathroom') {
      const dirt = Math.round(this.game.s.litter);
      dock.append(
        tool('🪮', 'Brush', 'brush'),
        btn('🧹', `Litter ${dirt > 60 ? '⚠️' : dirt > 25 ? '•' : '✓'}`, () => { this.a.scoop(); this._dock('bathroom'); }),
        btn('🚰', 'Tap', () => this.a.toggleTap()),
        tool('🧽', 'Bath', 'sponge'), tool('🚿', 'Rinse', 'shower'));
    } else if (id === 'bedroom') {
      dock.append(btn('💡', 'Lights', () => this.a.toggleLights()), btn('🍪', 'Treat', () => this.openTray('treat')), btn('⏱️', 'Focus', () => this.openFocus()));
    }
    this._dockRoom = id;
  }

  setTool(name) {
    this.tool = name;
    document.querySelectorAll('.dock-btn.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
    const hints = {
      laser: 'Hold a finger on the floor — move the red dot! (End with a toy she can catch)',
      sponge: 'Lather the fur — most cats only tolerate baths',
      shower: 'Hold anywhere to rinse the foam off',
      brush: 'Brush along the back — a Somali\'s long coat needs regular brushing',
    };
    const hint = $('#toolHint');
    hint.textContent = hints[name] || '';
    hint.classList.toggle('show', !!name);
    document.body.dataset.tool = name || '';
    this.a.onTool?.(name);
  }

  // ------------------------------------------------------------------ side buttons
  _bindSide() {
    $('#navL').onclick = () => { this.sound.click(); this.a.go(-1); };
    $('#navR').onclick = () => { this.sound.click(); this.a.go(1); };
    $('#btnShop').onclick = () => { this.sound.click(); this.openShop('food'); };
    $('#btnGames').onclick = () => { this.sound.click(); this.openGames(); };
    $('#btnWardrobe').onclick = () => { this.sound.click(); this.openWardrobe(); };
    $('#btnDaily').onclick = () => { this.sound.click(); this.openDaily(); };
    $('#btnSettings').onclick = () => { this.sound.click(); this.openSettings(); };
    $('#btnTalk').onclick = () => this.a.toggleTalk();
    $('#btnBlink').onclick = () => this.a.slowBlink();
    $('#btnGuide').onclick = () => { this.sound.click(); this.openGuide(); };
    $('#where').onclick = () => { this.sound.click(); this.a.goto(this._whereRoom); };
    $('#sheetClose').onclick = () => this.closeSheet();
    $('#sheet').addEventListener('pointerdown', (e) => {
      if (e.target.id === 'sheet' && !$('#sheetClose').hidden) this.closeSheet();   // not during onboarding
    });
  }

  setTalk(state) {
    const b = $('#btnTalk');
    b.dataset.state = state;
    b.title = { off: 'Talk to your cat', listening: 'Listening… say something!', hearing: 'Hearing you…', talking: 'Talking back!' }[state] || '';
    $('#talkLabel').textContent = state === 'off' ? '' : state === 'talking' ? '🔊' : state === 'hearing' ? '👂' : '🎙️';
  }

  // ------------------------------------------------------------------ sheets
  openSheet(title, body, { wide = false, onClose = null } = {}) {
    this.closeSheet(true);
    $('#sheetTitle').textContent = title;
    $('#sheetBody').replaceChildren(body);
    $('#sheet').classList.toggle('wide', wide);
    $('#sheet').classList.remove('hidden');
    this._onSheetClose = onClose;
  }

  closeSheet(silent = false) {
    if ($('#sheet').classList.contains('hidden')) return;
    this._cleanup?.(); this._cleanup = null;
    $('#sheet').classList.add('hidden');
    const cb = this._onSheetClose; this._onSheetClose = null;
    if (!silent) cb?.();
  }

  // Shop ---------------------------------------------------------------------
  openShop(tab = 'food') {
    const s = this.game.s;
    const tabs = h('div', { class: 'tabs' });
    const grid = h('div', { class: 'grid' });
    const render = (t) => {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      grid.replaceChildren();
      const table = t === 'food' ? FOODS : t === 'hat' ? HATS : THEMES;
      for (const [id, it] of Object.entries(table)) {
        const owned = t === 'hat' ? s.hats.includes(id) : t === 'theme' ? s.themes.includes(id) : false;
        const locked = it.level && s.level < it.level;
        const count = t === 'food' ? s.inventory[id] || 0 : null;
        const sw = t === 'theme' ? h('span', { class: 'swatch' }, ...it.walls.map((c) => h('i', { style: `background:${c}` }))) : null;
        const card = h('div', { class: `card ${locked ? 'locked' : ''}` },
          sw || h('div', { class: 'card-icon' }, it.icon),
          h('div', { class: 'card-name' }, it.name),
          t === 'food' ? h('div', { class: 'card-sub' }, `${it.kind === 'meal' ? 'Meal (bowl)' : it.kind === 'catnip' ? 'Catnip' : 'Treat'} · own ${count}`) : null,
          locked ? h('div', { class: 'card-sub' }, `🔒 Level ${it.level}`) : null,
          owned
            ? h('button', { class: 'buy owned', onclick: () => { if (t === 'hat') this.game.wearHat(id); else this.game.useTheme(id); this.sound.pop(); render(t); } },
              (t === 'hat' ? s.hat === id : s.theme === id) ? '✓ Using' : 'Use')
            : h('button', {
              class: 'buy', disabled: locked || s.coins < it.price,
              onclick: () => {
                const r = this.game.buy(t, id);
                if (r.ok) {
                  this.sound.coin();
                  if (t === 'hat') this.game.wearHat(id);
                  if (t === 'theme') this.game.useTheme(id);
                  this.toast(`Bought ${it.name}!`);
                } else { this.sound.error(); this.toast(r.why); }
                render(t);
              },
            }, it.price ? `🪙 ${it.price}` : 'Free'),
        );
        grid.append(card);
      }
    };
    for (const [t, label] of [['food', '🍗 Food'], ['hat', '🎩 Hats'], ['theme', '🎨 Rooms']]) {
      tabs.append(h('button', { 'data-t': t, onclick: () => { this.sound.click(); render(t); } }, label));
    }
    render(tab);
    this.openSheet('🛒 Shop', h('div', {}, tabs, grid), { wide: true });
  }

  openWardrobe() {
    const s = this.game.s;
    const grid = h('div', { class: 'grid' });
    const render = () => {
      grid.replaceChildren(
        h('div', { class: `card ${!s.hat ? 'sel' : ''}`, onclick: () => { this.game.wearHat(null); this.sound.pop(); render(); } }, h('div', { class: 'card-icon' }, '🚫'), h('div', { class: 'card-name' }, 'No hat')),
        ...s.hats.map((id) => h('div', { class: `card ${s.hat === id ? 'sel' : ''}`, onclick: () => { this.game.wearHat(id); this.sound.pop(); render(); } },
          h('div', { class: 'card-icon' }, HATS[id].icon), h('div', { class: 'card-name' }, HATS[id].name))),
      );
      if (!s.hats.length) grid.append(h('p', { class: 'muted' }, 'No hats yet — visit the shop! 🛒'));
    };
    render();
    this.openSheet('👒 Wardrobe', h('div', {}, grid, h('button', { class: 'primary', onclick: () => this.openShop('hat') }, 'Shop hats')));
  }

  // Games ----------------------------------------------------------------------
  openGames() {
    const s = this.game.s;
    const list = h('div', { class: 'grid' },
      h('div', { class: 'card game-card', onclick: () => this.playGame('memory') },
        h('div', { class: 'card-icon' }, '🧠'), h('div', { class: 'card-name' }, 'Purr-fect Memory'), h('div', { class: 'card-sub' }, `Best: round ${s.best.memory}`)),
      h('div', { class: 'card game-card', onclick: () => this.playGame('catch') },
        h('div', { class: 'card-icon' }, '🐟'), h('div', { class: 'card-name' }, 'Fish Frenzy'), h('div', { class: 'card-sub' }, `Best: ${s.best.catch}`)),
    );
    this.openSheet('🎮 Mini-games', h('div', {}, h('p', { class: 'muted' }, 'Earn coins and cheer your cat up!'), list));
  }

  playGame(id) {
    const body = h('div', { class: 'game-wrap' });
    const finish = (score) => {
      this._cleanup?.(); this._cleanup = null;
      const coins = id === 'memory' ? score * 5 : score;
      const best = this.game.s.best[id] || 0;
      if (score > best) this.game.s.best[id] = score;
      this.game.addCoins(coins, 'game');
      this.game.addNeed('fun', Math.min(35, 8 + score * (id === 'memory' ? 4 : 1)));
      this.game.addXp(5 + Math.floor(score / 2));
      this.game.count('games');
      this.game.save();
      if (coins > 0) this.sound.coin();
      body.replaceChildren(h('div', { class: 'result' },
        h('div', { class: 'big' }, score > best ? '🏆' : '😺'),
        h('h3', {}, score > best ? 'New best!' : 'Nice play!'),
        h('p', {}, `Score ${score} · +${coins} 🪙`),
        h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.playGame(id) }, 'Play again'),
          h('button', { onclick: () => this.openGames() }, 'Back'))));
    };
    this.openSheet(id === 'memory' ? '🧠 Purr-fect Memory' : '🐟 Fish Frenzy', body, { wide: true });
    this._cleanup = (id === 'memory' ? memoryGame : catchGame)(body, { sound: this.sound, onEnd: finish });
  }

  // Food tray --------------------------------------------------------------------
  /** kind: 'meal' (goes in the bowl) | 'treat' (hand-fed, incl. catnip) */
  openTray(kind = 'meal') {
    const tray = $('#tray');
    const s = this.game.s;
    const items = Object.entries(FOODS).filter(([id, f]) => (s.inventory[id] || 0) > 0 && (kind === 'meal' ? f.kind === 'meal' : f.kind !== 'meal'));
    const title = kind === 'meal'
      ? `🥣 Fill the food bowl (now ${Math.round(s.bowl.food)}%)`
      : `🍪 Treats — ${this.game.treatsLeftToday()} left today`;
    tray.replaceChildren(
      h('div', { class: 'tray-head' }, h('b', {}, title), h('button', { class: 'x', onclick: () => this.closeTray() }, '✕')),
      items.length
        ? h('div', { class: 'tray-items' }, ...items.map(([id, f]) => h('button', {
          class: 'food', title: f.name,
          onclick: () => { if (kind === 'meal') { this.a.fillBowl(id); this.closeTray(); } else this.a.treat(id); },
        }, h('span', { class: 'fi' }, f.icon), h('span', { class: 'fc' }, `×${s.inventory[id]}`))))
        : h('div', { class: 'tray-empty' }, kind === 'meal' ? 'No cat food left! ' : 'No treats left! ',
          h('button', { class: 'primary', onclick: () => { this.closeTray(); this.openShop('food'); } }, 'Buy some')),
      kind === 'meal' ? h('p', { class: 'muted small' }, 'Adult cats do best on a couple of measured meals a day. She\'ll eat from the bowl by herself when hungry.') : null,
    );
    tray.classList.remove('hidden');
  }

  closeTray() { $('#tray').classList.add('hidden'); }

  // Daily -------------------------------------------------------------------------
  openDaily() {
    const g = this.game;
    const avail = g.dailyAvailable();
    const streak = g.s.daily.streak;
    const days = h('div', { class: 'days' }, ...Array.from({ length: 7 }, (_, i) => h('div', {
      class: `day ${i < (avail ? streak : streak) ? 'got' : ''}`,
    }, h('small', {}, `Day ${i + 1}`), h('b', {}, `${20 + (i + 1) * 10}`))));
    const btn = h('button', {
      class: 'primary', disabled: !avail,
      onclick: () => {
        const r = g.claimDaily();
        if (r) { this.sound.coin(); this.toast(`🎁 +${r} coins! Streak ${g.s.daily.streak} 🔥`, 'big'); this.a.celebrate(); }
        this.closeSheet();
      },
    }, avail ? 'Claim reward' : 'Come back tomorrow!');
    this.openSheet('🎁 Daily treat', h('div', { class: 'center' }, h('p', {}, `Visit every day to grow your streak (current: ${streak} 🔥)`), days, btn));
  }

  // Settings ------------------------------------------------------------------------
  openSettings() {
    const g = this.game; const s = g.s;
    const name = h('input', { type: 'text', maxlength: 16, value: s.name || '' });
    const pitch = h('input', { type: 'range', min: 1.1, max: 2.2, step: 0.05, value: s.settings.voicePitch });
    const sens = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.settings.micSensitivity });
    const sound = h('input', { type: 'checkbox' }); sound.checked = s.settings.sound;
    const parrot = h('input', { type: 'checkbox' }); parrot.checked = s.settings.parrot;
    parrot.onchange = () => g.setting('parrot', parrot.checked);
    let armed = false;
    const reset = h('button', {
      class: 'danger', onclick: () => {
        if (!armed) { armed = true; reset.textContent = 'Tap again to erase everything'; return; }
        g.reset(); this.closeSheet(); this.toast('Fresh start! 🐣');
      },
    }, 'Reset progress');
    name.onchange = () => { const v = name.value.trim(); if (v) { g.setName(v); this.toast(`Hi, ${v}! 😺`); } };
    pitch.oninput = () => g.setting('voicePitch', Number(pitch.value));
    sens.oninput = () => g.setting('micSensitivity', Number(sens.value));
    sound.onchange = () => g.setting('sound', sound.checked);
    const st = s.stats;
    this.openSheet('⚙️ Settings', h('div', { class: 'form' },
      h('label', {}, 'Name', name),
      h('label', { class: 'inline' }, sound, ' Sound effects'),
      h('label', { class: 'inline' }, parrot, ' Cartoon mode: repeat my voice back (real cats don\'t do this)'),
      h('label', {}, 'Cartoon voice pitch', pitch),
      h('label', {}, 'Microphone sensitivity', sens),
      h('div', { class: 'stats' },
        `💗 Trust ${Math.round(s.bond)}/100 (${g.bondLabel()}) · 🍪 Treats ${st.fed} · 🤚 Petted ${st.petted} · 🪮 Brushed ${st.brushed} · 🧹 Scooped ${st.scooped} · 😌 Blinks ${st.blinks} · 😴 Naps ${st.slept} · 🗣️ Talked ${st.talked} · 🛁 Baths ${st.washed} · 🎮 Games ${st.games} · ⏱️ Focus ${st.focusMin} min`),
      h('p', { class: 'muted small' }, 'Cat model: “Somali Cat Animated ver 1.2” by DreamNoms (CC BY 4.0). Progress is saved on this device.'),
      reset));
  }

  // Care guide --------------------------------------------------------------------
  openGuide() {
    const name = this.game.s.name || 'your cat';
    const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
    const row = (sign, meaning) => h('tr', {}, h('td', {}, sign), h('td', {}, meaning));
    this.openSheet('📖 Somali care guide', h('div', { class: 'guide' },
      h('p', {}, `${name} behaves like a Somali — the long-haired cousin of the Abyssinian, nicknamed the “fox cat”. Everything below is what the app simulates, and what you'd see in a real Somali.`),
      h('h3', {}, '🦊 Personality'),
      h('ul', {},
        h('li', {}, 'Very active, curious and bold — needs play every day, loves high perches and jumping.'),
        h('li', {}, 'Follows its people from room to room and shows affection with head-butts and kneading.'),
        h('li', {}, 'Affectionate but not a lap cat — it decides when cuddles happen.'),
        h('li', {}, 'Fairly quiet: chirps and trills more than loud meows. Often fascinated by water.')),
      h('h3', {}, '🕰️ A cat\'s day'),
      h('p', {}, 'Cats sleep about 12–16 hours a day in many short naps, and are most active at dawn and dusk. Don\'t worry if she naps a lot — that\'s normal. You can\'t make a cat sleep; dim the lights and she may choose to.'),
      h('h3', {}, '👀 Reading body language'),
      h('table', {},
        row('Tail straight up', 'Happy, confident, saying hello'),
        row('Tip of tail twitching', 'Focused — hunting, watching birds'),
        row('Tail lashing / thumping', 'Irritated or overstimulated — stop and give space'),
        row('Ears sideways (“airplane”)', 'Annoyed or uneasy'),
        row('Slow blink', 'Trust and affection — blink slowly back (😌 button)'),
        row('Head-butt / cheek rub', 'Marking you as “mine” — a big compliment'),
        row('Kneading + purring', 'Content and relaxed'),
        row('Belly on show', 'Trust — but NOT an invitation. Most cats swat if you touch it.')),
      h('h3', {}, '🤚 Petting'),
      h('p', {}, 'Cheeks, chin and the top of the head are favourites; the back is usually fine. Avoid the tail, paws and belly. Every cat has a petting limit: watch for the tail lashing and ears turning sideways, then stop before she swats.'),
      h('h3', {}, '✅ Daily care checklist'),
      h('ul', {},
        h('li', {}, 'Measured meals in the bowl (she eats when hungry) + always-fresh water.'),
        h('li', {}, 'Scoop the litter box every day. A dirty box makes cats unhappy.'),
        h('li', {}, 'Play sessions every day — Somalis are high-energy. End laser play with something she can “catch”.'),
        h('li', {}, 'Brush the long coat regularly. Baths are rarely needed.'),
        h('li', {}, 'Treats: only a few a day.')),
      h('h3', {}, '⚠️ Never feed'),
      h('p', {}, 'Chocolate, onions, garlic and chives (any form) are toxic to cats. Most adult cats are lactose-intolerant, so skip the saucer of milk.'),
      h('h3', {}, '🧪 What a simulation can\'t do'),
      h('p', {}, 'This is a model of documented behaviour, not a real animal: every cat has its own personality, and the 3D model only has a few animations (idle, walk, sit), so lying down and some poses are approximated. Talk to a vet for real-life care.'),
      h('h3', {}, '📚 Sources'),
      h('ul', {},
        h('li', {}, a('https://cfa.org/breed/somali/', 'Cat Fanciers\' Association — Somali')),
        h('li', {}, a('https://www.hillspet.com/cat-care/cat-breeds/somali', 'Hill\'s Pet — Somali breed profile')),
        h('li', {}, a('https://www.hillspet.com/cat-care/nutrition-feeding/toxic-foods-for-cats', 'Hill\'s Pet — foods toxic to cats')),
        h('li', {}, a('https://en.wikipedia.org/wiki/Cat_behavior', 'Wikipedia — Cat behavior')),
        h('li', {}, a('https://www.rover.com/blog/how-much-do-cats-sleep/', 'Rover — how much cats sleep')),
        h('li', {}, a('https://countrygrovevet.ca/2025/10/10/how-to-read-cat-body-language-ears-eyes-and-tail-clues/', 'Country Grove Vet — reading body language'))),
    ), { wide: true });
  }

  // Onboarding --------------------------------------------------------------------
  askName(done) {
    const input = h('input', { type: 'text', maxlength: 16, placeholder: 'e.g. Mochi', value: 'Mochi' });
    const go = () => {
      const v = input.value.trim() || 'Mochi';
      this.game.setName(v);
      this.closeSheet(true);
      $('#sheetClose').hidden = false;
      done(v);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    this.openSheet('🐾 Meet your new cat!', h('div', { class: 'center form' },
      h('div', { class: 'big' }, '😺'),
      h('p', {}, 'A Somali cat just moved in — curious, playful and a little independent. What will you call her?'),
      input,
      h('button', { class: 'primary', onclick: go }, 'Let\'s go!'),
      h('p', { class: 'muted small' }, 'She has her own routine: she eats from her bowl, naps, explores and follows you around. Gentle care builds trust 💗 — she may be a bit shy at first.')));
    $('#sheetClose').hidden = true;
    this._onSheetClose = null;
    setTimeout(() => input.focus(), 50);
  }

  // Focus timer ---------------------------------------------------------------------
  openFocus() {
    const opts = [10, 15, 25, 45, 60];
    this.openSheet('⏱️ Focus session', h('div', { class: 'center' },
      h('p', {}, 'Study or work while your cat naps next to you. Needs drain slower, and you earn coins when you finish.'),
      h('div', { class: 'row wrap' }, ...opts.map((m) => h('button', { class: 'chip', onclick: () => { this.closeSheet(); this.a.startFocus(m); } }, `${m} min`)))));
  }

  showFocus(endsAt, onCancel) {
    const bar = $('#focusBar');
    bar.hidden = false;
    const label = bar.querySelector('b');
    bar.querySelector('button').onclick = onCancel;
    clearInterval(this._focusInt);
    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      const m = Math.floor(left / 60000); const sec = Math.floor((left % 60000) / 1000);
      label.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };
    tick();
    this._focusInt = setInterval(tick, 500);
  }

  hideFocus() { clearInterval(this._focusInt); $('#focusBar').hidden = true; }

  // Toasts + thought bubble ---------------------------------------------------------
  toast(text, kind = '') {
    const t = h('div', { class: `toast ${kind}` }, text);
    $('#toasts').append(t);
    setTimeout(() => t.classList.add('out'), kind === 'big' ? 2600 : 1900);
    setTimeout(() => t.remove(), kind === 'big' ? 3100 : 2400);
  }

  thought(icon, x, y) {
    const el = $('#thought');
    if (!icon) { el.classList.add('hidden'); return; }
    if (el.textContent !== icon) el.textContent = icon;
    el.classList.remove('hidden');
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}
