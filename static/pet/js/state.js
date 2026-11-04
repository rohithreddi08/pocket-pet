// ============================================================================
// state.js — the save file, needs simulation and economy.
// ----------------------------------------------------------------------------
// Modelled on real cat care (see the Care Guide sheet for sources):
//   needs   food, water, energy, play, groom   (0–100, good when high)
//   bond    trust between you and the cat; grows with gentle, consistent care
//   bowls   meals go in the food bowl, water in the water bowl — the cat eats
//           and drinks by itself when it needs to, like a real cat
//   litter  the box gets used and needs scooping daily
// Energy follows a real cat's rhythm: many short naps adding up to ~14 h/day.
// Everything keeps going (gently) while the app is closed, capped at 12 h.
// ============================================================================

const KEY = 'pocketpet.save.v1';

// Per real hour.
const RATES = { food: -7, water: -9, play: -10, groom: -2.5 };
const AWAKE_ENERGY = -18;      // with SLEEP_ENERGY this balances at ~14 h sleep a day
const SLEEP_ENERGY = 22;
const LITTER_PER_VISIT = 22;
const MAX_OFFLINE_HOURS = 12;

export const NEEDS = [
  { id: 'food',   icon: '🍗', label: 'Food' },
  { id: 'water',  icon: '💧', label: 'Water' },
  { id: 'energy', icon: '⚡', label: 'Energy' },
  { id: 'play',   icon: '🧶', label: 'Play' },
  { id: 'groom',  icon: '🪮', label: 'Grooming' },
];

// meal: goes in the bowl (portion = how much of the bowl it fills)
// treat: hand-fed; only a few a day are healthy
export const FOODS = {
  wet:     { name: 'Wet food',       icon: '🥫', price: 6,  kind: 'meal',  portion: 60, food: 45, like: 'love' },
  kibble:  { name: 'Dry kibble',     icon: '🥣', price: 4,  kind: 'meal',  portion: 70, food: 40, like: 'like' },
  chicken: { name: 'Plain chicken',  icon: '🍗', price: 8,  kind: 'treat', food: 12, play: 2, like: 'love' },
  salmon:  { name: 'Cooked salmon',  icon: '🐟', price: 9,  kind: 'treat', food: 10, play: 2, like: 'love' },
  treats:  { name: 'Cat treats',     icon: '🍪', price: 3,  kind: 'treat', food: 4,  play: 4, like: 'love' },
  catnip:  { name: 'Catnip',         icon: '🌿', price: 7,  kind: 'catnip', play: 25 },
  grass:   { name: 'Cat grass',      icon: '🌱', price: 4,  kind: 'treat', food: 2,  play: 3, like: 'like' },
};
export const TREATS_PER_DAY = 5;

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

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }
function today() { return new Date().toISOString().slice(0, 10); }

/** 0..1: how active a cat tends to be at this hour (crepuscular: dawn + dusk peaks). */
export function activityAt(hour) {
  const peak = (h, c, w) => {
    const d = ((h - c + 36) % 24) - 12;          // signed hours from c, wrapped to [-12, 12)
    return Math.exp(-(d * d) / (2 * w * w));
  };
  return Math.min(1, 0.3 + 0.7 * Math.max(peak(hour, 6.5, 1.6), peak(hour, 19, 2)));
}

function defaultSave() {
  return {
    v: 2,
    name: null,
    createdAt: Date.now(),
    lastTick: Date.now(),
    needs: { food: 70, water: 80, energy: 80, play: 60, groom: 85 },
    bond: 25,
    asleep: false,
    bowl: { food: 0, foodType: null, water: 70 },
    litter: 10,                        // how dirty the box is
    bladder: 45,                       // minutes until the next litter-box visit
    treats: { day: today(), count: 0 },
    coins: 60,
    xp: 0,
    level: 1,
    inventory: { wet: 3, kibble: 3, treats: 3, chicken: 1 },
    hats: [],
    hat: null,
    themes: ['cream'],
    theme: 'cream',
    room: 0,                           // where YOU are looking
    catRoom: 0,                        // where the cat is
    daily: { last: null, streak: 0 },
    stats: { fed: 0, petted: 0, brushed: 0, washed: 0, slept: 0, talked: 0, games: 0, focusMin: 0, scooped: 0, blinks: 0 },
    best: { memory: 0, catch: 0 },
    settings: { sound: true, voicePitch: 1.6, micSensitivity: 0.5, parrot: false },
  };
}

function migrate(data, base) {
  if (!data.v || data.v < 2) {
    // v1 → v2: fun→play, clean→groom, new needs, cat-safe food only.
    const n = data.needs || {};
    data.needs = { food: n.food ?? 70, water: 80, energy: n.energy ?? 80, play: n.fun ?? 60, groom: n.clean ?? 85 };
    data.inventory = { ...base.inventory };
    data.catRoom = data.room ?? 0;
    data.v = 2;
  }
  return data;
}

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
    this._saveTimer = 0;
  }

  // ---------------------------------------------------------------- persistence
  _load() {
    const base = defaultSave();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const data = migrate(JSON.parse(raw), base);
      const inv = {};
      for (const [k, v] of Object.entries(data.inventory || {})) if (FOODS[k]) inv[k] = v;
      return {
        ...base, ...data,
        needs: { ...base.needs, ...data.needs },
        bowl: { ...base.bowl, ...data.bowl },
        treats: { ...base.treats, ...data.treats },
        inventory: inv,
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
  }

  reset() {
    const name = this.s.name;
    this.s = defaultSave();
    this.s.name = name;
    this.save();
    this.emit('reset');
    this.emit('change');
  }

  /** While you were away the cat lived its life: napped, ate and drank from its bowls, used the box. */
  _catchUp() {
    const hours = Math.min(MAX_OFFLINE_HOURS, Math.max(0, (Date.now() - this.s.lastTick) / 3.6e6));
    this.offlineHours = hours;
    this.s.lastTick = Date.now();
    if (hours < 0.02) return;
    const n = this.s.needs; const b = this.s.bowl;
    n.food = clamp(n.food + RATES.food * hours);
    n.water = clamp(n.water + RATES.water * hours);
    // It ate/drank from the bowls when it needed to.
    const eat = Math.min(b.food * 0.75, Math.max(0, 85 - n.food));
    n.food += eat; b.food = clamp(b.food - eat / 0.75);
    const drink = Math.min(b.water, Math.max(0, 90 - n.water));
    n.water += drink; b.water = clamp(b.water - drink);
    // Napped on and off: energy drifts toward ~75.
    n.energy = clamp(n.energy + (75 - n.energy) * Math.min(1, hours / 3));
    n.play = clamp(n.play + RATES.play * hours * 0.6);           // played alone a little
    n.groom = clamp(n.groom - 0.8 * hours);                        // self-grooming mostly keeps up
    this.s.litter = clamp(this.s.litter + LITTER_PER_VISIT * hours / 5);
    // Neglect costs trust; a well-kept cat trusts you a little more.
    const worst = Math.min(n.food, n.water, n.play);
    this.s.bond = clamp(this.s.bond + (worst < 15 ? -1.5 : 0.3) * hours);
    this.s.asleep = false;
  }

  /** Call every frame with real seconds. */
  tick(dt, { focus = false, asleep = false } = {}) {
    const h = (dt / 3600) * (focus ? 0.5 : 1);
    const n = this.s.needs;
    n.food = clamp(n.food + RATES.food * h);
    n.water = clamp(n.water + RATES.water * h);
    n.play = clamp(n.play + RATES.play * h * (asleep ? 0.2 : 1));
    n.groom = clamp(n.groom + RATES.groom * h);
    n.energy = clamp(n.energy + (asleep ? SLEEP_ENERGY : AWAKE_ENERGY) * h);
    this.s.bladder -= dt / 60;
    this.s.lastTick = Date.now();
    this._saveTimer += dt;
    if (this._saveTimer > 5) { this._saveTimer = 0; this.save(); }
  }

  // ---------------------------------------------------------------- derived
  get needs() { return this.s.needs; }
  get bond() { return this.s.bond; }

  bondLabel() {
    const b = this.s.bond;
    return b < 20 ? 'Shy' : b < 45 ? 'Warming up' : b < 70 ? 'Friends' : b < 90 ? 'Best friends' : 'Soulmates';
  }

  mood() {
    const n = this.s.needs;
    const low = NEEDS.filter((x) => n[x.id] < 25).map((x) => x.id);
    if (this.s.litter > 75) low.push('litter');
    if (this.s.asleep) return { id: 'asleep', emoji: '😴', label: 'Napping', low };
    const min = Math.min(n.food, n.water, n.energy, n.play, n.groom);
    if (n.food < 25) return { id: 'hungry', emoji: '🙀', label: 'Hungry', low };
    if (n.water < 25) return { id: 'thirsty', emoji: '😿', label: 'Thirsty', low };
    if (this.s.litter > 75) return { id: 'litter', emoji: '😾', label: 'Box is dirty!', low };
    if (n.play < 25) return { id: 'bored', emoji: '😼', label: 'Restless', low };
    if (n.energy < 20) return { id: 'tired', emoji: '😪', label: 'Sleepy', low };
    if (n.groom < 25) return { id: 'scruffy', emoji: '😾', label: 'Scruffy', low };
    if (min >= 60) return { id: 'happy', emoji: '😸', label: 'Happy', low };
    return { id: 'content', emoji: '😺', label: 'Content', low };
  }

  // ---------------------------------------------------------------- mutations
  addNeed(id, delta) { this.s.needs[id] = clamp(this.s.needs[id] + delta); this.emit('change'); }
  addBond(delta) { this.s.bond = clamp(this.s.bond + delta); this.emit('change'); }

  addCoins(n, why) {
    this.s.coins = Math.max(0, this.s.coins + Math.round(n));
    this.emit('coins', { n, why });
    this.emit('change');
  }

  addXp(n) {
    this.s.xp += n;
    while (this.s.xp >= xpToNext(this.s.level)) {
      this.s.xp -= xpToNext(this.s.level);
      this.s.level += 1;
      this.s.coins += 25 * this.s.level;
      this.emit('levelup', { level: this.s.level, reward: 25 * this.s.level });
    }
    this.emit('change');
  }

  count(stat, n = 1) { this.s.stats[stat] = (this.s.stats[stat] || 0) + n; }
  setName(name) { this.s.name = name; this.save(); this.emit('change'); }
  setRoom(i) { this.s.room = i; }
  setCatRoom(i) { this.s.catRoom = i; }
  setAsleep(v) { this.s.asleep = v; this.emit('change'); }

  // Food ---------------------------------------------------------------------
  hasFood(id) { return (this.s.inventory[id] || 0) > 0; }

  /** Put a meal in the bowl. */
  fillBowl(id) {
    const f = FOODS[id];
    if (!f || f.kind !== 'meal' || !this.hasFood(id)) return false;
    if (this.s.bowl.food > 70) return false;
    this.s.inventory[id] -= 1;
    this.s.bowl.food = clamp(this.s.bowl.food + f.portion);
    this.s.bowl.foodType = id;
    this.save(); this.emit('bowl'); this.emit('change');
    return true;
  }

  refillWater() {
    this.s.bowl.water = 100;
    this.save(); this.emit('bowl'); this.emit('change');
  }

  /** The cat takes a few bites/laps from a bowl. Returns how much it got. */
  eatFromBowl(dt) {
    const b = this.s.bowl; const n = this.s.needs;
    if (b.food <= 0 || n.food >= 98) return 0;
    const bite = Math.min(b.food, 6 * dt);
    b.food = clamp(b.food - bite);
    const like = FOODS[b.foodType]?.like === 'love' ? 1 : 0.9;
    n.food = clamp(n.food + bite * 0.75 * like);
    if (b.food <= 0) b.foodType = null;
    this.emit('bowl');
    return bite;
  }

  drink(dt) {
    const b = this.s.bowl; const n = this.s.needs;
    if (b.water <= 0 || n.water >= 98) return 0;
    const sip = Math.min(b.water, 8 * dt);
    b.water = clamp(b.water - sip);
    n.water = clamp(n.water + sip);
    this.emit('bowl');
    return sip;
  }

  treatsLeftToday() {
    if (this.s.treats.day !== today()) this.s.treats = { day: today(), count: 0 };
    return Math.max(0, TREATS_PER_DAY - this.s.treats.count);
  }

  /** Hand-feed a treat / catnip. Returns the food, or null. */
  useTreat(id) {
    const f = FOODS[id];
    if (!f || f.kind === 'meal' || !this.hasFood(id)) return null;
    if (f.kind === 'treat') {
      if (this.treatsLeftToday() <= 0) return { refused: 'too-many' };
      this.s.treats.count += 1;
    }
    this.s.inventory[id] -= 1;
    if (f.food) this.addNeed('food', f.food);
    if (f.play) this.addNeed('play', f.play);
    this.count('fed');
    this.addXp(3);
    this.save();
    return f;
  }

  // Litter -------------------------------------------------------------------------
  useLitter() {
    this.s.litter = clamp(this.s.litter + LITTER_PER_VISIT);
    this.s.bladder = 40 + Math.random() * 40;
    this.emit('litter'); this.emit('change');
  }

  scoop() {
    if (this.s.litter < 5) return false;
    this.s.litter = 0;
    this.count('scooped');
    this.addXp(3); this.addCoins(2, 'care');
    this.emit('litter'); this.save();
    return true;
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
