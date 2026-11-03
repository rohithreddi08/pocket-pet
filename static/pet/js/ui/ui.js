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
    const pct = s.xp / xpToNext(s.level);
    $('#levelRing').setAttribute('stroke-dashoffset', String(RING_C * (1 - pct)));
    $('#btnDaily').classList.toggle('badge', this.game.dailyAvailable());
  }

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
      dock.append(btn('🎾', 'Ball', () => this.a.throwBall()), tool('🔴', 'Laser', 'laser'), btn('🎮', 'Games', () => this.openGames()));
    } else if (id === 'kitchen') {
      dock.append(btn('🍽️', 'Feed', () => this.openTray()), btn('🛒', 'Groceries', () => this.openShop('food')));
    } else if (id === 'bathroom') {
      dock.append(tool('🧽', 'Sponge', 'sponge'), tool('🚿', 'Shower', 'shower'));
    } else if (id === 'bedroom') {
      dock.append(btn('💡', 'Lights', () => this.a.toggleLights()), btn('😴', 'Nap', () => this.a.sleep()), btn('⏱️', 'Focus', () => this.openFocus()));
    }
  }

  setTool(name) {
    this.tool = name;
    document.querySelectorAll('.dock-btn.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
    const hints = {
      laser: 'Hold a finger on the floor — move the red dot!',
      sponge: 'Rub the sponge over the fur to make foam',
      shower: 'Hold anywhere to rinse the foam off',
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
          t === 'food' ? h('div', { class: 'card-sub' }, `+${it.food} food · own ${count}`) : null,
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
  openTray() {
    const tray = $('#tray');
    const s = this.game.s;
    const items = Object.entries(FOODS).filter(([id]) => (s.inventory[id] || 0) > 0);
    tray.replaceChildren(
      h('div', { class: 'tray-head' }, h('b', {}, '🍽️ Fridge'), h('button', { class: 'x', onclick: () => this.closeTray() }, '✕')),
      items.length
        ? h('div', { class: 'tray-items' }, ...items.map(([id, f]) => h('button', {
          class: 'food', onclick: () => { this.a.feed(id); this.openTray(); },
        }, h('span', { class: 'fi' }, f.icon), h('span', { class: 'fc' }, `×${s.inventory[id]}`))))
        : h('div', { class: 'tray-empty' }, 'The fridge is empty! ', h('button', { class: 'primary', onclick: () => { this.closeTray(); this.openShop('food'); } }, 'Buy food')),
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
      h('label', {}, 'Cat voice pitch', pitch),
      h('label', {}, 'Microphone sensitivity', sens),
      h('div', { class: 'stats' },
        `🍗 Fed ${st.fed} · 🤚 Petted ${st.petted} · 🛁 Washed ${st.washed} · 😴 Naps ${st.slept} · 🗣️ Chats ${st.talked} · 🎮 Games ${st.games} · ⏱️ Focus ${st.focusMin} min`),
      h('p', { class: 'muted small' }, 'Cat model: “Somali Cat Animated ver 1.2” by DreamNoms (CC BY 4.0). Progress is saved on this device.'),
      reset));
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
      h('p', {}, 'A little Somali kitten just moved in. What will you call them?'),
      input,
      h('button', { class: 'primary', onclick: go }, 'Let\'s go!'),
      h('p', { class: 'muted small' }, 'Tip: tap the 🎙️ button and talk — your cat repeats everything you say!')));
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
