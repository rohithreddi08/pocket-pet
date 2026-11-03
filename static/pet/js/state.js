// ============================================================================
// state.js — the save file, needs simulation and economy.
// ----------------------------------------------------------------------------
// Needs are 0–100 and "good when high": food, energy, fun, clean.
// They drift in real time (also while the app is closed, capped at 12 h) so
// coming back after a day feels like coming home to a cat that missed you.
// ============================================================================

const KEY = 'pocketpet.save.v1';

// Per real hour. Asleep, energy refills instead of draining.
const RATES = { food: -8, energy: -6, fun: -9, clean: -4 };
const SLEEP_ENERGY_RATE = 40;
const MAX_OFFLINE_HOURS = 12;

export const NEEDS = [
  { id: 'food',   icon: '🍗', label: 'Food' },
  { id: 'energy', icon: '⚡', label: 'Energy' },
  { id: 'fun',    icon: '🎾', label: 'Fun' },
  { id: 'clean',  icon: '🫧', label: 'Clean' },
];

// like: love | like | dislike | spicy
export const FOODS = {
  fish:     { name: 'Fish',     icon: '🐟', price: 12, food: 30, fun: 6,  like: 'love' },
  chicken:  { name: 'Chicken',  icon: '🍗', price: 15, food: 38, fun: 4,  like: 'love' },
  milk:     { name: 'Milk',     icon: '🥛', price: 8,  food: 14, fun: 4,  like: 'like' },
  cookie:   { name: 'Cookie',   icon: '🍪', price: 6,  food: 8,  fun: 12, like: 'like' },
  cake:     { name: 'Cake',     icon: '🍰', price: 25, food: 20, fun: 25, like: 'love' },
  broccoli: { name: 'Broccoli', icon: '🥦', price: 4,  food: 18, fun: -8, like: 'dislike' },
  chili:    { name: 'Chili',    icon: '🌶️', price: 5,  food: 4,  fun: 10, like: 'spicy' },
};

export const HATS = {
  bow:    { name: 'Pink Bow',   icon: '🎀', price: 40,  level: 1 },
  party:  { name: 'Party Hat',  icon: '🥳', price: 60,  level: 2 },
  beanie: { name: 'Beanie',     icon: '🧶', price: 80,  level: 3 },
  flower: { name: 'Flower',     icon: '🌼', price: 50,  level: 3 },
  wizard: { name: 'Wizard Hat', icon: '🧙', price: 150, level: 5 },
  crown:  { name: 'Crown',      icon: '👑', price: 250, level: 7 },
};

export const THEMES = {
  cream:    { name: 'Cream',    price: 0,   walls: ['#f3e6d3', '#f6efe2', '#dfeef0', '#e8e1f2'] },
  mint:     { name: 'Mint',     price: 120, walls: ['#d6efe3', '#e4f4ea', '#d3ecee', '#dceee6'] },
  peach:    { name: 'Peach',    price: 120, walls: ['#fbdcc9', '#fde7d6', '#f7d9d2', '#f9e0d8'] },
  lavender: { name: 'Lavender', price: 160, walls: ['#e3dcf5', '#ebe5f8', '#dcdff5', '#e6dcf3'] },
  midnight: { name: 'Midnight', price: 220, walls: ['#3d4669', '#47507a', '#3b5470', '#3a3f63'] },
};

export function xpToNext(level) { return 40 + level * 40; }

function clamp(v) { return Math.max(0, Math.min(100, v)); }
function today() { return new Date().toISOString().slice(0, 10); }

function defaultSave() {
  return {
    v: 1,
    name: null,                     // set on first launch
    createdAt: Date.now(),
    lastTick: Date.now(),
    needs: { food: 70, energy: 80, fun: 60, clean: 85 },
    asleep: false,
    coins: 60,
    xp: 0,
    level: 1,
    inventory: { fish: 2, milk: 2, chicken: 1, cookie: 1, broccoli: 1, chili: 1 },
    hats: [],
    hat: null,
    themes: ['cream'],
    theme: 'cream',
    room: 0,
    daily: { last: null, streak: 0 },
    stats: { fed: 0, petted: 0, washed: 0, slept: 0, talked: 0, games: 0, focusMin: 0 },
    best: { memory: 0, catch: 0 },
    settings: { sound: true, voicePitch: 1.6, micSensitivity: 0.5 },
  };
}

/** Tiny event emitter so the UI can react to state changes. */
class Emitter {
  constructor() { this.handlers = {}; }
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this.handlers[evt] = (this.handlers[evt] || []).filter((h) => h !== fn); }
  emit(evt, data) { for (const fn of this.handlers[evt] || []) fn(data); }
}

export class Game extends Emitter {
  constructor() {
    super();
    this.s = this._load();
    this._catchUp();
    this._dirty = false;
    this._saveTimer = 0;
  }

  // ---------------------------------------------------------------- persistence
  _load() {
    const base = defaultSave();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      // Merge so saves from older versions pick up new fields.
      return {
        ...base, ...data,
        needs: { ...base.needs, ...data.needs },
        inventory: { ...data.inventory },
        daily: { ...base.daily, ...data.daily },
        stats: { ...base.stats, ...data.stats },
        best: { ...base.best, ...data.best },
        settings: { ...base.settings, ...data.settings },
      };
    } catch {
      return base;
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* private mode etc. */ }
    this._dirty = false;
  }

  reset() {
    const name = this.s.name;
    this.s = defaultSave();
    this.s.name = name;
    this.save();
    this.emit('reset');
    this.emit('change');
  }

  _catchUp() {
    const hours = Math.min(MAX_OFFLINE_HOURS, Math.max(0, (Date.now() - this.s.lastTick) / 3.6e6));
    this._advance(hours);
    this.s.lastTick = Date.now();
    this.offlineHours = hours;
  }

  _advance(hours) {
    const n = this.s.needs;
    n.food = clamp(n.food + RATES.food * hours);
    n.fun = clamp(n.fun + RATES.fun * hours * (this.s.asleep ? 0.3 : 1));
    n.clean = clamp(n.clean + RATES.clean * hours);
    n.energy = clamp(n.energy + (this.s.asleep ? SLEEP_ENERGY_RATE : RATES.energy) * hours);
  }

  /** Call every frame with real seconds. */
  tick(dt, { focus = false } = {}) {
    // Focus sessions slow decay — the pet shouldn't punish you for studying.
    this._advance((dt / 3600) * (focus ? 0.4 : 1));
    this.s.lastTick = Date.now();
    this._saveTimer += dt;
    if (this._saveTimer > 5) { this._saveTimer = 0; this.save(); }
  }

  // ---------------------------------------------------------------- derived
  get needs() { return this.s.needs; }

  mood() {
    const n = this.s.needs;
    const low = NEEDS.filter((x) => n[x.id] < 25).map((x) => x.id);
    if (this.s.asleep) return { id: 'asleep', emoji: '😴', label: 'Asleep', low };
    const min = Math.min(n.food, n.energy, n.fun, n.clean);
    if (min >= 65) return { id: 'happy', emoji: '😸', label: 'Happy', low };
    if (min >= 35) return { id: 'content', emoji: '😺', label: 'Content', low };
    if (n.food < 25) return { id: 'hungry', emoji: '🙀', label: 'Hungry', low };
    if (n.energy < 25) return { id: 'tired', emoji: '😪', label: 'Sleepy', low };
    if (n.clean < 25) return { id: 'dirty', emoji: '😾', label: 'Grubby', low };
    if (n.fun < 25) return { id: 'bored', emoji: '😿', label: 'Bored', low };
    return { id: 'meh', emoji: '😼', label: 'Meh', low };
  }

  // ---------------------------------------------------------------- mutations
  addNeed(id, delta) {
    this.s.needs[id] = clamp(this.s.needs[id] + delta);
    this.emit('change');
  }

  addCoins(n, why) {
    this.s.coins = Math.max(0, this.s.coins + Math.round(n));
    this.emit('coins', { n, why });
    this.emit('change');
  }

  addXp(n) {
    this.s.xp += n;
    let leveled = false;
    while (this.s.xp >= xpToNext(this.s.level)) {
      this.s.xp -= xpToNext(this.s.level);
      this.s.level += 1;
      leveled = true;
      this.s.coins += 25 * this.s.level;
      this.emit('levelup', { level: this.s.level, reward: 25 * this.s.level });
    }
    this.emit('change');
    return leveled;
  }

  count(stat, n = 1) { this.s.stats[stat] = (this.s.stats[stat] || 0) + n; }

  setName(name) { this.s.name = name; this.save(); this.emit('change'); }
  setRoom(i) { this.s.room = i; }
  setAsleep(v) { this.s.asleep = v; this.emit('change'); }

  // Food ---------------------------------------------------------------------
  hasFood(id) { return (this.s.inventory[id] || 0) > 0; }

  useFood(id) {
    if (!this.hasFood(id)) return null;
    this.s.inventory[id] -= 1;
    const f = FOODS[id];
    this.addNeed('food', f.food);
    this.addNeed('fun', f.fun);
    this.count('fed');
    this.addXp(4);
    this.save();
    return f;
  }

  // Shop ---------------------------------------------------------------------
  buy(kind, id) {
    const table = kind === 'food' ? FOODS : kind === 'hat' ? HATS : THEMES;
    const item = table[id];
    if (!item) return { ok: false, why: 'Unknown item' };
    if (kind === 'hat' && this.s.hats.includes(id)) return { ok: false, why: 'Already owned' };
    if (kind === 'theme' && this.s.themes.includes(id)) return { ok: false, why: 'Already owned' };
    if (item.level && this.s.level < item.level) return { ok: false, why: `Unlocks at level ${item.level}` };
    if (this.s.coins < item.price) return { ok: false, why: 'Not enough coins' };
    this.s.coins -= item.price;
    if (kind === 'food') this.s.inventory[id] = (this.s.inventory[id] || 0) + 1;
    if (kind === 'hat') this.s.hats.push(id);
    if (kind === 'theme') this.s.themes.push(id);
    this.save();
    this.emit('change');
    return { ok: true };
  }

  wearHat(id) { this.s.hat = id; this.save(); this.emit('hat', id); this.emit('change'); }
  useTheme(id) { this.s.theme = id; this.save(); this.emit('theme', id); this.emit('change'); }

  // Daily reward ---------------------------------------------------------------
  dailyAvailable() { return this.s.daily.last !== today(); }

  claimDaily() {
    if (!this.dailyAvailable()) return 0;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    this.s.daily.streak = this.s.daily.last === y ? this.s.daily.streak + 1 : 1;
    this.s.daily.last = today();
    const reward = 20 + Math.min(7, this.s.daily.streak) * 10;
    this.addCoins(reward, 'daily');
    this.save();
    return reward;
  }

  setting(key, value) { this.s.settings[key] = value; this.save(); this.emit('settings'); }
}
