// ============================================================================
// ui.js — HUD, room dock, sheets (shop, wardrobe, games, settings, daily,
// guide), food tray, focus timer, toasts and the thought bubble.
// Bigger features live in their own files: store.js (profile + pet store),
// kitchen.js (cooking), outdoor.js (walks + training).
// The UI never touches Three.js; it calls `actions` provided by main.js.
// ============================================================================
import { h, $ } from './dom.js';
import { needsFor, FOODS, HATS, THEMES, xpToNext } from '../state.js';
import { INGREDIENTS, ingredientFor } from '../cooking.js';
import { breedOf, pronoun, stageName, ageLabel, ageMonths } from '../species.js';
import { ROOMS } from '../world/House.js';
import { memoryGame } from '../games/memory.js';
import { catchGame } from '../games/catch.js';
import { openProfile, openStore } from './store.js';
import { openCook, fridgeList } from './kitchen.js';
import { openWalk, openTrain } from './outdoor.js';
import { guideFor } from './guide.js';
import { openHealth } from './health.js';
import { WORLD, geocode, fetchWeather, clearWeather, detectCountry, fetchHolidays } from '../world.js';

const RING_C = 2 * Math.PI * 20;

export class UI {
  constructor({ game, sound, actions }) {
    this.game = game;
    this.sound = sound;
    this.a = actions;
    this.tool = null;
    this._cleanup = null;

    this._buildNeeds();
    this._bindSide();
    game.on('change', () => this.refresh());
    game.on('coins', ({ n }) => { if (n > 0) this._bump('#coins'); });
    game.on('levelup', ({ level, reward }) => {
      this.toast(`🎉 Level ${level}! +${reward} coins`, 'big');
      this.a.celebrate();
    });
    this.refresh();
  }

  get dog() { return this.game.species === 'dog'; }
  get ham() { return this.game.species === 'hamster'; }
  get treatIcon() { return this.dog ? '🦴' : this.ham ? '🐛' : '🍪'; }
  get petName() { return this.game.s.name || 'Your pet'; }
  pron(k = 'subj') { return pronoun(this.game.pet, k); }

  // ------------------------------------------------------------------ HUD
  _buildNeeds() {
    const needs = $('#needs');
    needs.replaceChildren();
    this.rings = {};
    this._needDefs = needsFor(this.game.species);
    for (const n of this._needDefs) {
      // innerHTML so the <svg> gets the SVG namespace (createElement('svg') wouldn't render).
      const ring = h('div', {
        class: 'need', title: n.label,
        html: `<svg viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="20"/><circle class="fg" cx="24" cy="24" r="20" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg><span class="icon">${n.icon}</span>`,
      });
      needs.append(ring);
      this.rings[n.id] = ring;
    }
  }

  /** A different pet is now at home: rebuild species-specific bits. */
  petChanged() {
    this._buildNeeds();
    const dog = this.dog;
    const blink = $('#btnBlink');
    blink.textContent = dog ? '📣' : this.ham ? '✋' : '😌';
    blink.title = dog ? 'Call your dog — “Come!”' : this.ham ? 'Offer your hand to sniff — how hamsters learn to trust you' : 'Slow blink — cats read it as trust';
    $('#btnGuide').title = `${breedOf(this.game.pet).name} care guide`;
    $('#btnTalk').title = `Talk to ${this.petName}`;
    if (this._roomIndex != null) this.setRoom(this._roomIndex);
    this.refresh();
  }

  refresh() {
    const s = this.game.s;
    for (const n of this._needDefs) {
      const v = s.needs[n.id];
      const ring = this.rings[n.id];
      const fg = ring.querySelector('.fg');
      fg.setAttribute('stroke-dashoffset', String(RING_C * (1 - v / 100)));
      fg.style.stroke = v > 60 ? '#40c057' : v > 30 ? '#fab005' : '#fa5252';
      ring.classList.toggle('low', v < 25);
    }
    $('#coins span').textContent = s.coins;
    $('#petName').textContent = this.petName;
    const m = this.game.mood();
    $('#mood').textContent = `${m.emoji} ${m.label}`;
    $('#levelNum').textContent = s.level;
    $('#bondBar').style.width = `${s.bond}%`;
    $('#bondLabel').textContent = this.game.bondLabel();
    $('#bond').title = `Trust: ${Math.round(s.bond)}/100 — grows with gentle, consistent care`;
    const pct = s.xp / xpToNext(s.level);
    $('#levelRing').setAttribute('stroke-dashoffset', String(RING_C * (1 - pct)));
    $('#btnDaily').classList.toggle('badge', this.game.dailyAvailable());
    const hi = this.game.healthIssues();
    const hb = $('#btnHealth');
    hb.classList.toggle('badge', hi.conds > 0 || hi.due > 0 || hi.prevent > 0);
    hb.classList.toggle('sick', hi.score < 65);
    hb.title = `Health ${Math.round(hi.score)}/100${hi.due ? ' — medicine due!' : hi.conds ? ' — not well' : ''}`;
    $('#petCount').textContent = this.game.pets.length > 1 ? `🐾${this.game.pets.length}` : '';
    // Keep bowl/litter levels on the dock buttons current.
    if (this._dockRoom === 'kitchen' || this._dockRoom === 'bathroom' || this._dockRoom === 'living') {
      const key = `${this._dockRoom}|${Math.round(s.bowl.food / 5)}|${Math.round(s.bowl.water / 5)}|${s.litter > 60 ? 2 : s.litter > 25 ? 1 : 0}|${s.bladder < 0}|${this.game.p.cooking?.step}`;
      if (key !== this._dockKey) {
        this._dockKey = key;
        this._dock(this._dockRoom);
        document.querySelectorAll('.dock-btn.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === this.tool));
      }
    }
  }

  /** "Mochi: Napping on the cat tree" + a chip when the pet is in another room. */
  status(pet, room) {
    const name = this.petName;
    const where = $('#where');
    if (pet.outside) {
      $('#status').textContent = '';
      where.textContent = `🦮 ${name} is out on a walk with you`;
      where.hidden = false;
      return;
    }
    const here = pet.room === room && !pet.travelling;
    $('#status').textContent = here && pet.status ? `${name}: ${pet.status}` : '';
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
    this._roomIndex = i;
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
    const dog = this.dog;
    const ham = this.ham;
    const s = this.game.s;
    if (id === 'living') {
      if (ham) {
        dock.append(
          btn('🌾', `Food ${Math.round(s.bowl.food)}%`, () => this.openTray('meal')),
          btn('🐛', 'Treat', () => this.openTray('treat')),
          btn('✋', 'Offer hand', () => this.a.slowBlink()),
          btn('🧹', `Spot-clean ${s.litter > 60 ? '⚠️' : s.litter > 25 ? '•' : '✓'}`, () => { this.a.scoop(); this._dock('living'); }),
          btn('🎮', 'Games', () => this.openGames()));
      } else if (dog) {
        dock.append(
          btn('🦮', s.bladder < 0 ? 'Walk ⚠️' : 'Walk', () => this.openWalk(), s.bladder < 0 ? 'alert' : ''),
          btn('🎾', 'Fetch', () => this.a.throwBall()),
          btn('🎓', 'Train', () => this.openTrain()),
          btn('🦴', 'Treat', () => this.openTray('treat')),
          btn('🎮', 'Games', () => this.openGames()));
      } else {
        dock.append(btn('🎾', 'Ball', () => this.a.throwBall()), tool('🔴', 'Laser', 'laser'), btn('🍪', 'Treat', () => this.openTray('treat')), btn('🎮', 'Games', () => this.openGames()));
      }
    } else if (id === 'kitchen') {
      const b = s.bowl;
      const cooking = this.game.p.cooking;
      dock.append(
        btn('🥣', `Meal ${Math.round(b.food)}%`, () => this.openTray('meal')),
        btn('💧', `Water ${Math.round(b.water)}%`, () => { this.a.refillWater(); this._dock('kitchen'); }),
        btn('🍳', cooking ? 'Cooking…' : 'Cook', () => this.openCook(), cooking ? 'alert' : ''),
        btn(this.treatIcon, 'Treat', () => this.openTray('treat')),
        btn('🛒', 'Groceries', () => this.openShop('food')));
    } else if (id === 'bathroom') {
      const dirt = Math.round(s.litter);
      const mark = dirt > 60 ? '⚠️' : dirt > 25 ? '•' : '✓';
      if (ham) {
        dock.append(
          btn('⏳', 'Fresh sand', () => this.a.freshSand()),
          btn('🧹', `Toilet corner ${mark}`, () => { this.a.scoop(); this._dock('bathroom'); }),
          btn('🛏️', 'Bedding', () => this.a.changeBedding()));
      } else if (dog) {
        dock.append(tool('🪮', 'Brush', 'brush'), btn('🧻', `Pad ${mark}`, () => { this.a.scoop(); this._dock('bathroom'); }), tool('🧽', 'Bath', 'sponge'), tool('🚿', 'Rinse', 'shower'));
      } else {
        dock.append(
          tool('🪮', 'Brush', 'brush'),
          btn('🧹', `Litter ${mark}`, () => { this.a.scoop(); this._dock('bathroom'); }),
          btn('🚰', 'Tap', () => this.a.toggleTap()),
          tool('🧽', 'Bath', 'sponge'), tool('🚿', 'Rinse', 'shower'));
      }
    } else if (id === 'bedroom') {
      dock.append(btn('💡', 'Lights', () => this.a.toggleLights()), btn(this.treatIcon, 'Treat', () => this.openTray('treat')), btn('⏱️', 'Focus', () => this.openFocus()));
    }
    this._dockRoom = id;
  }

  setTool(name) {
    this.tool = name;
    document.querySelectorAll('.dock-btn.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
    const p = this.pron('obj');
    const breed = breedOf(this.game.pet);
    const hints = {
      laser: `Hold a finger on the floor — move the red dot! (End with a toy ${this.pron()} can catch)`,
      sponge: this.dog ? 'Lather the coat — use dog shampoo, never human shampoo' : 'Lather the fur — most cats only tolerate baths',
      shower: 'Hold anywhere to rinse the foam off',
      brush: breed.coat === 'long' ? `Brush along the back — a long coat needs regular brushing`
        : breed.coat === 'double' ? `Brush ${p} out — double coats shed (“blow”) heavily twice a year`
          : `Brush along the back — a short coat needs only a quick weekly brush`,
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
    $('#btnHealth').onclick = () => { this.sound.click(); this.openHealth(); };
    $('#btnStore').onclick = () => { this.sound.click(); this.openStore(); };
    $('.profile').onclick = (e) => { if (e.target.closest('#bond')) return; this.sound.click(); this.openProfile(); };
    $('#where').onclick = () => { this.sound.click(); if (this._whereRoom != null) this.a.goto(this._whereRoom); };
    $('#sheetClose').onclick = () => this.closeSheet();
    $('#sheet').addEventListener('pointerdown', (e) => {
      if (e.target.id === 'sheet' && !$('#sheetClose').hidden) this.closeSheet();   // not during onboarding
    });
  }

  setTalk(state) {
    const b = $('#btnTalk');
    b.dataset.state = state;
    b.title = { off: `Talk to ${this.petName}`, listening: 'Listening… say something!', hearing: 'Hearing you…', talking: 'Talking back!' }[state] || '';
    $('#talkLabel').textContent = state === 'off' ? '' : state === 'talking' ? '🔊' : state === 'hearing' ? '👂' : '🎙️';
  }

  // ------------------------------------------------------------------ sheets
  openSheet(title, body, { wide = false, onClose = null } = {}) {
    this.closeSheet(true);
    $('#sheetTitle').textContent = title;
    $('#sheetBody').replaceChildren(body);
    $('#sheet').classList.toggle('wide', wide);
    $('#sheet').classList.remove('hidden');
    $('#sheetBody').parentElement.scrollTop = 0;
    this._onSheetClose = onClose;
  }

  closeSheet(silent = false) {
    if ($('#sheet').classList.contains('hidden')) return;
    this._cleanup?.(); this._cleanup = null;
    $('#sheet').classList.add('hidden');
    const cb = this._onSheetClose; this._onSheetClose = null;
    if (!silent) cb?.();
  }

  get sheetOpen() { return !$('#sheet').classList.contains('hidden'); }

  // Bigger features (separate files) -------------------------------------------
  openProfile() { openProfile(this); }
  openStore(species) { openStore(this, species); }
  openCook() { openCook(this); }
  openWalk() { openWalk(this); }
  openTrain() { openTrain(this); }
  openHealth() { openHealth(this); }

  // Shop ---------------------------------------------------------------------
  openShop(tab = 'food') {
    const s = this.game.s;
    const tabs = h('div', { class: 'tabs' });
    const grid = h('div', { class: 'grid' });
    const note = h('p', { class: 'muted small' });
    const species = this.game.species;
    const render = (t) => {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      grid.replaceChildren();
      note.textContent = t === 'food' ? `Showing food for ${species === 'dog' ? 'dogs' : species === 'hamster' ? 'hamsters' : 'cats'} (${this.petName}).`
        : t === 'ingredient' ? 'Fresh ingredients for home cooking 🍳. One pack makes one recipe.' : '';
      let entries = [];
      if (t === 'food') entries = Object.entries(FOODS).filter(([, f]) => f.species === species && !f.homemade);
      else if (t === 'ingredient') entries = Object.entries(INGREDIENTS).filter(([, f]) => ingredientFor(f, species));
      else if (t === 'hat') entries = Object.entries(HATS);
      else entries = Object.entries(THEMES);
      const table = t === 'food' ? FOODS : t === 'ingredient' ? INGREDIENTS : t === 'hat' ? HATS : THEMES;
      for (const [id, it] of entries) {
        const owned = t === 'hat' ? s.hats.includes(id) : t === 'theme' ? s.themes.includes(id) : false;
        const locked = it.level && s.level < it.level;
        const count = t === 'food' ? s.inventory[id] || 0 : t === 'ingredient' ? s.pantry[id] || 0 : null;
        const sw = t === 'theme' ? h('span', { class: 'swatch' }, ...it.walls.map((c) => h('i', { style: `background:${c}` }))) : null;
        const sub = t === 'food' ? `${it.kind === 'meal' ? 'Meal (bowl)' : it.kind === 'catnip' ? 'Catnip' : 'Treat'} · own ${count}`
          : t === 'ingredient' ? `${it.grams} g pack · own ${count}` : null;
        const card = h('div', { class: `card ${locked ? 'locked' : ''}` },
          sw || h('div', { class: 'card-icon' }, it.icon),
          h('div', { class: 'card-name' }, it.name),
          sub ? h('div', { class: 'card-sub' }, sub) : null,
          locked ? h('div', { class: 'card-sub' }, `🔒 Level ${it.level}`) : null,
          owned
            ? h('button', { class: 'buy owned', onclick: () => { if (t === 'hat') this.game.wearHat(id); else this.game.useTheme(id); this.sound.pop(); render(t); } },
              (t === 'hat' ? s.hat === id : s.theme === id) ? '✓ Using' : 'Use')
            : h('button', {
              class: 'buy', disabled: locked || s.coins < it.price,
              onclick: () => {
                const r = this.game.buy(t, id, table);
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
    for (const [t, label] of [['food', '🍗 Food'], ['ingredient', '🥕 Fresh'], ['hat', '🎩 Hats'], ['theme', '🎨 Rooms']]) {
      tabs.append(h('button', { 'data-t': t, onclick: () => { this.sound.click(); render(t); } }, label));
    }
    render(tab);
    this.openSheet('🛒 Shop', h('div', {}, tabs, note, grid), { wide: true });
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
    this.openSheet('🎮 Mini-games', h('div', {}, h('p', { class: 'muted' }, `Earn coins and cheer ${this.petName} up!`), list));
  }

  playGame(id) {
    const body = h('div', { class: 'game-wrap' });
    const finish = (score) => {
      this._cleanup?.(); this._cleanup = null;
      const coins = id === 'memory' ? score * 5 : score;
      const best = this.game.s.best[id] || 0;
      if (score > best) this.game.s.best[id] = score;
      this.game.addCoins(coins, 'game');
      this.game.addNeed('play', Math.min(25, 5 + score * (id === 'memory' ? 3 : 0.7)));
      this.game.addXp(5 + Math.floor(score / 2));
      this.game.count('games');
      this.game.save();
      if (coins > 0) this.sound.coin();
      body.replaceChildren(h('div', { class: 'result' },
        h('div', { class: 'big' }, score > best ? '🏆' : (this.dog ? '🐶' : this.ham ? '🐹' : '😺')),
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
    const items = this.game.foodsFor(kind);
    const home = kind === 'meal' ? fridgeList(this) : [];
    const title = kind === 'meal'
      ? `🥣 Fill the bowl (now ${Math.round(s.bowl.food)}%)`
      : `${this.treatIcon} Treats — ${this.game.treatsLeftToday()} left today`;
    const buttons = items.map(([id, f]) => h('button', {
      class: 'food', title: f.name,
      onclick: () => { if (kind === 'meal') { this.a.fillBowl(id); this.closeTray(); } else this.a.treat(id); },
    }, h('span', { class: 'fi' }, f.icon), h('span', { class: 'fc' }, `×${s.inventory[id]}`)));
    tray.replaceChildren(...[
      h('div', { class: 'tray-head' }, h('b', {}, title), h('button', { class: 'x', onclick: () => this.closeTray() }, '✕')),
      items.length || home.length
        ? h('div', { class: 'tray-items' }, ...home, ...buttons)
        : h('div', { class: 'tray-empty' }, kind === 'meal' ? `No ${this.game.species} food left! ` : 'No treats left! ',
          h('button', { class: 'primary', onclick: () => { this.closeTray(); this.openShop('food'); } }, 'Buy some')),
      kind === 'meal' ? h('div', { class: 'tray-foot' },
        h('p', { class: 'muted small' }, this.ham
          ? 'About a tablespoon of mix a day for a Syrian (dwarfs: a teaspoon or two), given in the evening when it wakes. Scattering some in the bedding lets it forage, as it would in the wild. It will hoard part of it in the nest — that\'s normal.'
          : this.dog
          ? `Adult dogs do best on two measured meals a day${this.game.stage === 'baby' ? ' (puppies: 3–4 small meals)' : ''}.`
          : `Adult cats do best on a couple of measured meals a day${this.game.stage === 'baby' ? ' (kittens: 3–4 small meals)' : ''}. ${this.pron()[0].toUpperCase() + this.pron().slice(1)}'ll eat from the bowl when hungry.`),
        h('button', { class: 'chip small', onclick: () => { this.closeTray(); this.openCook(); } }, '🍳 Cook fresh food')) : null,
    ].filter(Boolean));
    tray.classList.remove('hidden');
  }

  closeTray() { $('#tray').classList.add('hidden'); }

  // Daily -------------------------------------------------------------------------
  openDaily() {
    const g = this.game;
    const avail = g.dailyAvailable();
    const streak = g.s.daily.streak;
    const days = h('div', { class: 'days' }, ...Array.from({ length: 7 }, (_, i) => h('div', {
      class: `day ${i < streak ? 'got' : ''}`,
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
        if (!armed) { armed = true; reset.textContent = 'Tap again to erase everything (all pets)'; return; }
        g.reset(); this.closeSheet(); this.toast('Fresh start! 🐣');
      },
    }, 'Reset progress');
    name.onchange = () => { const v = name.value.trim(); if (v) { g.setName(v); this.toast(`Hi, ${v}! ${this.dog ? '🐶' : '😺'}`); } };
    pitch.oninput = () => g.setting('voicePitch', Number(pitch.value));
    sens.oninput = () => g.setting('micSensitivity', Number(sens.value));
    sound.onchange = () => g.setting('sound', sound.checked);
    const st = s.stats;
    this.openSheet('⚙️ Settings', h('div', { class: 'form' },
      h('label', {}, `${this.petName}'s name`, name),
      h('label', { class: 'inline' }, sound, ' Sound effects'),
      h('label', { class: 'inline' }, parrot, ' Cartoon mode: repeat my voice back (real pets don\'t do this)'),
      h('label', {}, 'Cartoon voice pitch', pitch),
      h('label', {}, 'Microphone sensitivity', sens),
      h('div', { class: 'stats' },
        `💗 Trust ${Math.round(s.bond)}/100 (${g.bondLabel()}) · 🍪 Fed ${st.fed} · 🍳 Cooked ${st.cooked || 0} · 🤚 Petted ${st.petted} · 🪮 Brushed ${st.brushed} · ${this.dog ? `🦮 Walks ${st.walks || 0}` : `🧹 Cleaned ${st.scooped} · ${this.ham ? '✋ Hand offers' : '😌 Blinks'} ${st.blinks}`} · 😴 Naps ${st.slept} · 🗣️ Talked ${st.talked} · 🛁 Baths ${st.washed} · 🎮 Games ${st.games} · ⏱️ Focus ${st.focusMin} min`),
      this._worldSettings(),
      h('p', { class: 'muted small' }, '3D models: “Somali Cat Animated ver 1.2” by DreamNoms (CC BY 4.0); “Cat” by J-Toastie (CC BY 3.0, via Poly Pizza); Husky, Shiba Inu and German Shepherd by Quaternius (CC0); “Characters Pug” by Quaternius (CC BY 3.0); “Hamster” by Poly by Google (CC BY 3.0). Street: car and street lights by Kay Lousberg (CC0); bus, scooter and street dog by Poly by Google, vendor cart by Alan Zimmerman, tree by Marc Solà (CC BY 3.0). Progress is saved on this device.'),
      reset));
  }

  // Real world: local weather + sunrise (Open-Meteo), festivals (caldays), data credits -------------
  _worldSettings() {
    const g = this.game;
    const ws = () => ({ ...(g.s.settings.world || {}) });
    const save = (patch) => g.setting('world', { ...ws(), ...patch });
    const status = h('p', { class: 'small' });
    const show = () => {
      const w = WORLD.weather; const cur = ws();
      status.textContent = !cur.weather ? 'Off — the game uses a generic day (sunrise 6:30, sunset 19:00).'
        : cur.lat == null ? 'On — pick your city or use your location.'
          : w ? `${w.icon} ${w.label}, ${Math.round(w.temp)} °C (feels ${Math.round(w.feels)} °C) in ${w.place || cur.place}. Sunrise ${fmtH(w.rise)}, sunset ${fmtH(w.set)}.`
            : `Loading the weather for ${cur.place}…`;
    };
    const fmtH = (x) => (x == null ? '—' : `${Math.floor(x)}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`);
    const on = h('input', { type: 'checkbox' }); on.checked = !!ws().weather;
    const city = h('input', { type: 'text', placeholder: 'City, e.g. Hyderabad', value: ws().place || '' });
    const use = async (loc) => {
      save({ weather: true, ...loc });
      on.checked = true;
      status.textContent = `Loading the weather for ${loc.place}…`;
      try { await fetchWeather(loc, true); show(); } catch { status.textContent = 'Couldn’t reach the weather service — check your connection.'; }
    };
    on.onchange = () => {
      save({ weather: on.checked });
      if (!on.checked) clearWeather();
      else if (ws().lat != null) use({ lat: ws().lat, lon: ws().lon, place: ws().place });
      show();
    };
    const find = h('button', { class: 'chip small', onclick: async () => {
      const q = city.value.trim(); if (!q) return;
      status.textContent = 'Searching…';
      try {
        const loc = await geocode(q);
        if (!loc) { status.textContent = `No place called “${q}” found.`; return; }
        city.value = loc.place;
        await use({ lat: loc.lat, lon: loc.lon, place: loc.place });
      } catch { status.textContent = 'Couldn’t reach the place search — check your connection.'; }
    } }, 'Find');
    const here = h('button', { class: 'chip small', onclick: () => {
      if (!navigator.geolocation) { status.textContent = 'Location isn’t available here — type your city instead.'; return; }
      status.textContent = 'Asking for your location…';
      navigator.geolocation.getCurrentPosition(
        (p) => use({ lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), place: 'your location' }),
        () => { status.textContent = 'Location was blocked (or the game is in a frame) — type your city instead.'; },
        { timeout: 10000, maximumAge: 3600000 });
    } }, '📍 Use my location');
    const cc = h('input', { type: 'text', maxlength: 2, style: 'width:4em;text-transform:uppercase', value: (ws().country || WORLD.country || '').toUpperCase() });
    cc.onchange = () => {
      const v = cc.value.trim().toLowerCase();
      save({ country: v || null });
      WORLD.country = v || detectCountry();
      fetchHolidays(WORLD.country).catch(() => {});
      this.toast(`Festivals for ${(WORLD.country || '?').toUpperCase()} — fireworks nights will scare your pets, just like real ones.`);
    };
    show();
    return h('div', { class: 'world-set' },
      h('h4', {}, '🌍 Real world'),
      h('label', { class: 'inline' }, on, ' Use my local weather and sunrise / sunset'),
      h('div', { class: 'row' }, city, find, here),
      status,
      h('p', { class: 'muted small' }, 'Rain, heat and storms change walks and scare pets; cats are busiest at your real dawn and dusk. Only the rounded city position is stored, on this device, and sent to the weather service.'),
      h('label', { class: 'inline' }, 'Country for festivals (fireworks nights): ', cc),
      h('p', { class: 'muted small' }, 'Data: weather by ', h('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener' }, 'Open-Meteo'), ' (CC BY 4.0) · public holiday data powered by ',
        h('a', { href: 'https://caldays.com', target: '_blank', rel: 'noopener' }, 'caldays'), ' (CC BY 4.0) · dog breed health from ',
        h('a', { href: 'https://breedhealthscore.com', target: '_blank', rel: 'noopener' }, 'Breed Health Score'), ' (CC BY 4.0; lifespans: McMillan et al. 2024) · ingredient energy from ',
        h('a', { href: 'https://fdc.nal.usda.gov', target: '_blank', rel: 'noopener' }, 'USDA FoodData Central'), ' (public domain).'));
  }

  /** The weather badge at the top of the screen. */
  weather(w) {
    let el = document.getElementById('weatherChip');
    if (!el) {
      el = h('button', { id: 'weatherChip', onclick: () => { this.sound.click(); this.openSettings(); } });
      document.body.append(el);
    }
    el.hidden = !w;
    if (!w) return;
    el.textContent = `${w.icon} ${Math.round(w.temp)}°`;
    el.title = `${w.label}, ${Math.round(w.temp)} °C (feels ${Math.round(w.feels)} °C) — ${w.place || 'your place'}`;
  }

  // Care guide --------------------------------------------------------------------
  openGuide() {
    this.openSheet(`📖 ${breedOf(this.game.pet).name} care guide`, guideFor(this.game), { wide: true });
  }

  // Onboarding --------------------------------------------------------------------
  askName(done) {
    const pet = this.game.pet;
    const breed = breedOf(pet);
    const input = h('input', { type: 'text', maxlength: 16, placeholder: 'e.g. Mochi', value: 'Mochi' });
    const go = () => {
      const v = input.value.trim() || 'Mochi';
      this.game.setName(v);
      this.closeSheet(true);
      $('#sheetClose').hidden = false;
      done(v);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    this.openSheet('🐾 Meet your new pet!', h('div', { class: 'center form' },
      h('div', { class: 'big' }, '😺'),
      h('p', {}, `A ${breed.name} cat (${ageLabel(ageMonths(pet))}) just moved in — curious, playful and a little independent. What will you call ${this.pron('obj')}?`),
      input,
      h('button', { class: 'primary', onclick: go }, 'Let\'s go!'),
      h('p', { class: 'muted small' }, `${this.pron('Subj')} has ${this.pron('pos')} own routine: eats from ${this.pron('pos')} bowl, naps, explores and follows you around. Gentle care builds trust 💗. Later, visit the 🏪 Pet Store in your profile to adopt more pets — cats, dogs and hamsters of different breeds and ages.`)));
    $('#sheetClose').hidden = true;
    this._onSheetClose = null;
    setTimeout(() => input.focus(), 50);
  }

  // Focus timer ---------------------------------------------------------------------
  openFocus() {
    const opts = [10, 15, 25, 45, 60];
    this.openSheet('⏱️ Focus session', h('div', { class: 'center' },
      h('p', {}, `Study or work while ${this.petName} naps next to you. Needs drain slower, and you earn coins when you finish.`),
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
    const long = kind === 'big' || kind === 'hint' || text.length > 90;
    setTimeout(() => t.classList.add('out'), long ? 3400 : 1900);
    setTimeout(() => t.remove(), long ? 3900 : 2400);
  }

  thought(icon, x, y) {
    const el = $('#thought');
    if (!icon) { el.classList.add('hidden'); return; }
    if (el.textContent !== icon) el.textContent = icon;
    el.classList.remove('hidden');
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

export { stageName };
