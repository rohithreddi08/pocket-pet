// ============================================================================
// state.js — the save file, needs simulation and economy.
// ----------------------------------------------------------------------------
// A profile (you: coins, level, groceries, fridge, settings) owns several
// pets. One pet is "on screen" at a time; the others keep living their lives
// in the background (they eat from their bowls, nap, use the litter box /
// pee pad) and you can switch to them from your profile.
//
// Needs (0–100, good when high): food, water, energy, play (exercise for
// dogs), groom. Bond = trust, built with gentle, consistent care.
// Rates depend on species, life stage (kittens/puppies eat, play and sleep
// more; seniors slow down) and breed (long coats need more brushing).
// Everything keeps going while the app is closed, capped at 12 h.
// ============================================================================
import { BREEDS, SPECIES, PERSONALITIES, breedOf, lifeStage, newPetFrom, dailyKcal, mealsPerDay, ageMonths } from './species.js';
import {
  defaultHealth, normalizeHealth, tickHealth, treatPrice, verdict, CRITICAL, vitality, worst, healthLabel, symptomsOf, CONDITIONS, VET,
  diagnose, treat, giveDose, dosesDue, prevention,
} from './health.js';
import {DEV, DEV_COINS} from './dev.js';

const KEY = 'pocketpet.save.v1';
const MAX_OFFLINE_HOURS = 12;
export const MAX_PETS = DEV.unlimitedPets ? Infinity : 4;   // dev.js can lift the limit

// Per real hour, for an adult.
const RATES = {
  cat: { food: -7, water: -9, play: -10, groom: -2.5, awake: -18, sleep: 22 },
  dog: { food: -6, water: -9, play: -12, groom: -2, awake: -20, sleep: 24 },
  hamster: { food: -6, water: -8, play: -9, groom: -1.5, awake: -16, sleep: 20 },
};
const STAGE = {              // multipliers per life stage
  baby:   { food: 1.5, play: 1.4, awake: 1.45 },
  young:  { food: 1.2, play: 1.2, awake: 1.1 },
  adult:  {},
  senior: { food: 0.9, play: 0.7, awake: 1.3 },
};
const LITTER_PER_VISIT = 22;

const NEED_DEFS = {
  food:   { id: 'food',   icon: '🍗', label: 'Food' },
  water:  { id: 'water',  icon: '💧', label: 'Water' },
  energy: { id: 'energy', icon: '⚡', label: 'Energy' },
  play:   { id: 'play',   icon: '🧶', label: 'Play' },
  groom:  { id: 'groom',  icon: '🪮', label: 'Grooming' },
};
export const NEEDS = Object.values(NEED_DEFS);
export function needsFor(species) {
  if (species === 'dog') return NEEDS.map((n) => (n.id === 'play' ? { ...n, icon: '🦮', label: 'Exercise & play' } : n));
  if (species === 'hamster') {
    return NEEDS.map((n) => (n.id === 'play' ? { ...n, icon: '🎡', label: 'Exercise (wheel) & foraging' }
      : n.id === 'groom' ? { ...n, icon: '⏳', label: 'Grooming (sand bath)' } : n));
  }
  return NEEDS;
}

// Store-bought food. meal: goes in the bowl (portion = % of the bowl it fills)
// treat: hand-fed; only a few a day are healthy.
export const FOODS = {
  // cats
  wet:     { species: 'cat', name: 'Cat wet food',  icon: '🥫', price: 6,  kind: 'meal',  portion: 60, like: 'love' },
  kibble:  { species: 'cat', name: 'Cat kibble',    icon: '🥣', price: 4,  kind: 'meal',  portion: 70, like: 'like' },
  chicken: { species: 'cat', name: 'Plain chicken', icon: '🍗', price: 8,  kind: 'treat', food: 12, play: 2, like: 'love' },
  salmon:  { species: 'cat', name: 'Cooked salmon', icon: '🐟', price: 9,  kind: 'treat', food: 10, play: 2, like: 'love' },
  treats:  { species: 'cat', name: 'Cat treats',    icon: '🍪', price: 3,  kind: 'treat', food: 4,  play: 4, like: 'love' },
  catnip:  { species: 'cat', name: 'Catnip',        icon: '🌿', price: 7,  kind: 'catnip', play: 25 },
  grass:   { species: 'cat', name: 'Cat grass',     icon: '🌱', price: 4,  kind: 'treat', food: 2,  play: 3, like: 'like' },
  // dogs
  dwet:    { species: 'dog', name: 'Dog wet food',  icon: '🥫', price: 7,  kind: 'meal',  portion: 60, like: 'love' },
  dkibble: { species: 'dog', name: 'Dog kibble',    icon: '🥣', price: 5,  kind: 'meal',  portion: 70, like: 'like' },
  biscuit: { species: 'dog', name: 'Dog biscuits',  icon: '🦴', price: 3,  kind: 'treat', food: 4,  play: 3, like: 'love' },
  chew:    { species: 'dog', name: 'Dental chew',   icon: '🪵', price: 6,  kind: 'treat', food: 6,  play: 8, groom: 4, like: 'love' },
  pbutter: { species: 'dog', name: 'Peanut butter (xylitol-free)', icon: '🥜', price: 5, kind: 'treat', food: 5, play: 4, like: 'love' },
  carrot:  { species: 'dog', name: 'Carrot sticks', icon: '🥕', price: 2,  kind: 'treat', food: 2,  play: 2, like: 'like' },
  bites:   { species: 'dog', name: 'Home-made pumpkin bites', icon: '🍪', price: 0, kind: 'treat', food: 4, play: 4, like: 'love', homemade: true },
  // hamsters (a seed + pellet mix is the base diet; fresh food and protein in tiny amounts)
  hmix:     { species: 'hamster', name: 'Hamster seed & pellet mix', icon: '🌾', price: 4, kind: 'meal', portion: 60, like: 'like' },
  mealworm: { species: 'hamster', name: 'Dried mealworms', icon: '🐛', price: 3, kind: 'treat', food: 3, play: 2, like: 'love' },
  hveg:     { species: 'hamster', name: 'Cucumber & broccoli bits', icon: '🥦', price: 2, kind: 'treat', food: 3, play: 2, like: 'like' },
  hegg:     { species: 'hamster', name: 'Boiled egg (tiny piece)', icon: '🥚', price: 2, kind: 'treat', food: 4, play: 1, like: 'love' },
  hseed:    { species: 'hamster', name: 'Sunflower seeds (fatty — a few)', icon: '🌻', price: 2, kind: 'treat', food: 3, play: 3, like: 'love' },
  hfresh:   { species: 'hamster', name: 'Home-made egg & veggie mix', icon: '🥗', price: 0, kind: 'treat', food: 4, play: 2, like: 'love', homemade: true },
  hchew:    { species: 'hamster', name: 'Applewood chew stick', icon: '🪵', price: 3, kind: 'treat', food: 0, play: 6, groom: 3, like: 'like' },
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
export function today() { return new Date().toISOString().slice(0, 10); }

/** 0..1: how active a cat tends to be at this hour (crepuscular: dawn + dusk peaks). */
// Sunrise and sunset (hours). Defaults until world.js knows the real ones for your place.
const SUN = { rise: 6.5, set: 19 };
export function setSun({ rise, set }) { if (Number.isFinite(rise) && Number.isFinite(set)) Object.assign(SUN, { rise, set }); }

export function activityAt(hour, species = 'cat') {
  const peak = (h, c, w) => {
    const d = ((h - c + 36) % 24) - 12;          // signed hours from c, wrapped to [-12, 12)
    return Math.exp(-(d * d) / (2 * w * w));
  };
  if (species === 'hamster') {
    // Hamsters are nocturnal: up from dusk, busiest around midnight, asleep by day.
    return Math.min(1, 0.06 + 0.94 * Math.max(peak(hour, SUN.set + 4, 2.6), 0.8 * peak(hour, SUN.rise - 3, 1.8)));
  }
  if (species === 'dog') {
    // Dogs fit their people's day: up in the morning and evening, sleep at night.
    const night = hour < 6 || hour >= 23;
    return night ? 0.15 : Math.min(1, 0.45 + 0.55 * Math.max(peak(hour, Math.max(6.5, SUN.rise + 1), 1.8), peak(hour, SUN.set, 2.2)));
  }
  // cats are crepuscular: their peaks follow the real dawn and dusk
  return Math.min(1, 0.3 + 0.7 * Math.max(peak(hour, SUN.rise, 1.6), peak(hour, SUN.set, 2)));
}

// Keys that belong to you (the profile); everything else belongs to a pet.
const SHARED = new Set(['v', 'pets', 'activeId', 'createdAt', 'coins', 'devSavedCoins', 'xp', 'level', 'inventory', 'pantry', 'meals',
  'cooking', 'hats', 'themes', 'theme', 'room', 'daily', 'best', 'settings', 'adopted', 'firstAdoptFree', 'memorial']);

function defaultPet(over = {}) {
  return {
    id: 'p1', species: 'cat', breed: 'somali', coat: 'ruddy', sex: 'female', personality: 'playful',
    ageAtAdoption: 24, adoptedAt: Date.now(),
    name: null,
    lastTick: Date.now(),
    needs: { food: 70, water: 80, energy: 80, play: 60, groom: 85 },
    bond: 25,
    asleep: false,
    bowl: { food: 0, foodType: null, water: 70, quality: 0 },
    litter: 10,                        // litter box (cats) / pee pad (dogs): how dirty
    bladder: 45,                       // minutes until the next toilet trip
    treats: { day: today(), count: 0 },
    hat: null,
    catRoom: 0,                        // where the pet is
    out: false,                        // dog out on a walk
    accident: null,                    // {x, z, room} puddle to clean up
    tricks: {},                        // dog training progress 0–100
    training: { day: today(), minutes: 0 },
    walks: { day: today(), count: 0, minutes: 0 },
    stats: { fed: 0, petted: 0, brushed: 0, washed: 0, slept: 0, talked: 0, games: 0, focusMin: 0, scooped: 0, blinks: 0, cooked: 0, walks: 0 },
    health: defaultHealth(),
    ...over,
  };
}

function defaultProfile() {
  return {
    v: 3,
    createdAt: Date.now(),
    pets: [defaultPet()],
    activeId: 'p1',
    coins: 60,
    xp: 0,
    level: 1,
    inventory: { wet: 3, kibble: 3, treats: 3, chicken: 1 },
    pantry: { chicken: 1, pumpkin: 1, catvit: 1 },
    meals: [],                         // home-cooked portions in the fridge
    cooking: null,                     // a recipe in progress
    hats: [],
    themes: ['cream'],
    theme: 'cream',
    room: 0,                           // where YOU are looking
    daily: { last: null, streak: 0 },
    best: { memory: 0, catch: 0 },
    adopted: [],                       // store listing ids already adopted
    memorial: [],                      // pets who have passed away
    firstAdoptFree: true,
    settings: { sound: true, voicePitch: 1.6, micSensitivity: 0.5, parrot: false },
  };
}

/** v1/v2 (single cat, flat) → v3 (profile + pets). */
function migrate(data) {
  if (!data.v || data.v < 2) {
    const n = data.needs || {};
    data.needs = { food: n.food ?? 70, water: 80, energy: n.energy ?? 80, play: n.fun ?? 60, groom: n.clean ?? 85 };
    data.inventory = { wet: 3, kibble: 3, treats: 3, chicken: 1 };
    data.catRoom = data.room ?? 0;
    data.v = 2;
  }
  if (data.v === 2) {
    const base = defaultProfile();
    const profile = { ...base };
    const pet = defaultPet({ ageAtAdoption: 24, adoptedAt: data.createdAt || Date.now() });
    for (const [k, v] of Object.entries(data)) {
      if (SHARED.has(k)) profile[k] = v;
      else pet[k] = v;
    }
    pet.id = 'p1';
    profile.pets = [pet];
    profile.activeId = 'p1';
    profile.v = 3;
    profile.pantry = { ...base.pantry, ...(data.pantry || {}) };
    return profile;
  }
  return data;
}

function normalizePet(p) {
  const d = defaultPet();
  return {
    ...d, ...p,
    needs: { ...d.needs, ...p.needs },
    bowl: { ...d.bowl, ...p.bowl },
    treats: { ...d.treats, ...p.treats },
    training: { ...d.training, ...p.training },
    walks: { ...d.walks, ...p.walks },
    stats: { ...d.stats, ...p.stats },
    tricks: { ...p.tricks },
    health: normalizeHealth(p.health),
  };
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
    this.p = this._load();
    this._devCoins();
    this._bind();
    this.offlineHours = this._catchUp(this.pet);
    for (const other of this.p.pets) if (other !== this.pet) this._catchUp(other);
    this._lost = this.p.pets.filter((x) => x !== this.pet && x.health?.dead);
    for (const x of this._lost) this._bury(x);
    this._saveTimer = 0;
    this._othersTimer = 0;
  }

  // ---------------------------------------------------------------- persistence
  _load() {
    const base = defaultProfile();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const data = migrate(JSON.parse(raw));
      const inv = {};
      for (const [k, v] of Object.entries(data.inventory || {})) if (FOODS[k]) inv[k] = v;
      const p = {
        ...base, ...data,
        inventory: inv,
        pantry: { ...data.pantry },
        meals: Array.isArray(data.meals) ? data.meals : [],
        daily: { ...base.daily, ...data.daily },
        best: { ...base.best, ...data.best },
        settings: { ...base.settings, ...data.settings },
        pets: (data.pets?.length ? data.pets : base.pets).map(normalizePet),
      };
      if (!p.pets.some((x) => x.id === p.activeId)) p.activeId = p.pets[0].id;
      return p;
    } catch (e) {
      console.warn('[state] save unreadable, starting fresh', e);
      return base;
    }
  }

  /** `game.s` reads/writes the active pet, or the profile for shared keys. */
  _bind() {
    this.pet = this.p.pets.find((x) => x.id === this.p.activeId) || this.p.pets[0];
    const prof = this.p; const pet = this.pet;
    this.s = new Proxy({}, {
      get: (_, k) => (SHARED.has(k) ? prof[k] : pet[k]),
      set: (_, k, v) => { (SHARED.has(k) ? prof : pet)[k] = v; return true; },
      has: (_, k) => k in prof || k in pet,
      ownKeys: () => [...new Set([...Object.keys(prof), ...Object.keys(pet)])],
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.p)); } catch { /* private mode etc. */ }
  }

  reset() {
    const name = this.pet.name;
    this.p = defaultProfile();
    this.p.pets[0].name = name;
    this._bind();
    this.save();
    this.emit('reset');
    this.emit('pet');
    this.emit('change');
  }

  // ---------------------------------------------------------------- pets
  get species() { return this.pet.species; }
  get breed() { return breedOf(this.pet); }
  get stage() { return lifeStage(this.pet); }
  get pets() { return this.p.pets; }
  traits() {
    const b = this.breed.traits; const p = PERSONALITIES[this.pet.personality] || PERSONALITIES.calm;
    return { ...b, play: p.play, follow: p.follow, vocal: b.vocal * p.vocal };
  }

  _rates(pet) {
    const r = RATES[pet.species] || RATES.cat;
    const m = STAGE[lifeStage(pet)];
    const b = breedOf(pet);
    const pers = PERSONALITIES[pet.personality] || PERSONALITIES.calm;
    return {
      food: r.food * (m.food || 1),
      water: r.water,
      play: r.play * (m.play || 1) * (0.6 + 0.4 * b.traits.energy / 0.8) * pers.play,
      groom: r.groom * (b.groomRate || 1),
      awake: r.awake * (m.awake || 1),
      sleep: r.sleep,
    };
  }

  canAdopt(listing) {
    if (this.p.pets.length >= MAX_PETS) return { ok: false, why: `Your home has room for ${MAX_PETS} pets — that's already a full house!` };
    if (this.p.adopted.includes(listing.id)) return { ok: false, why: 'Already adopted' };
    const price = this.p.firstAdoptFree ? 0 : listing.price;
    if (this.p.coins < price) return { ok: false, why: 'Not enough coins' };
    return { ok: true, price };
  }

  adopt(listing, name) {
    const can = this.canAdopt(listing);
    if (!can.ok) return can;
    this.p.coins -= can.price;
    this.p.firstAdoptFree = false;
    this.p.adopted.push(listing.id);
    const pet = normalizePet(newPetFrom(listing, name));
    pet.catRoom = this.p.room;
    // A new pet comes home with a bag of the food it's used to.
    const starter = pet.species === 'dog' ? { dkibble: 3, biscuit: 3 }
      : pet.species === 'hamster' ? { hmix: 3, mealworm: 2, hveg: 2 } : { kibble: 3, treats: 3 };
    for (const [k, v] of Object.entries(starter)) this.p.inventory[k] = (this.p.inventory[k] || 0) + v;
    this.p.pets.push(pet);
    this.save();
    this.emit('change');
    return { ok: true, pet };
  }

  switchPet(id) {
    if (id === this.pet.id) return false;
    const next = this.p.pets.find((x) => x.id === id);
    if (!next) return false;
    if (this.dead) this._bury(this.pet);        // leaving a pet who has passed away: into the memorial
    this.pet.lastTick = Date.now();
    this._catchUp(next);
    next.catRoom = this.p.room;          // your pet comes to greet you
    next.out = false;
    this.p.activeId = id;
    this._bind();
    this.save();
    this.emit('pet');
    this.emit('change');
    return true;
  }

  rehome(id) {
    if (this.p.pets.length <= 1 || id === this.pet.id) return false;
    this.p.pets = this.p.pets.filter((x) => x.id !== id);
    this.save(); this.emit('change');
    return true;
  }

  /** While you were away (or looking after another pet) it lived its life. */
  _catchUp(pet) {
    const hours = Math.min(MAX_OFFLINE_HOURS, Math.max(0, (Date.now() - (pet.lastTick || Date.now())) / 3.6e6));
    if (hours < 0.02) return hours;   // too soon — keep counting from the old lastTick
    pet.lastTick = Date.now();
    const before = { needs: { ...pet.needs }, litter: pet.litter, bladder: pet.bladder };
    const r = this._rates(pet);
    const n = pet.needs; const b = pet.bowl;
    n.food = clamp(n.food + r.food * hours);
    n.water = clamp(n.water + r.water * hours);
    // It ate/drank from the bowls when it needed to.
    const eat = Math.min(b.food * 0.75, Math.max(0, 85 - n.food));
    n.food += eat; b.food = clamp(b.food - eat / 0.75);
    if (b.food <= 0) b.foodType = null;
    const drink = Math.min(b.water, Math.max(0, 90 - n.water));
    n.water += drink; b.water = clamp(b.water - drink);
    // Napped on and off: energy drifts toward ~75.
    n.energy = clamp(n.energy + (75 - n.energy) * Math.min(1, hours / 3));
    n.play = clamp(n.play + r.play * hours * (pet.species === 'dog' ? 0.8 : 0.6));
    n.groom = clamp(n.groom - (pet.species === 'dog' ? 1.2 : 0.8) * hours);
    // Toilet: cats use the box; a dog left alone uses its pee pad.
    pet.litter = clamp(pet.litter + LITTER_PER_VISIT * hours / (pet.species === 'dog' ? 4 : 5));
    pet.bladder = Math.max(pet.bladder - hours * 60, pet.species === 'dog' ? 30 : 20);
    // Neglect costs trust; a well-kept pet trusts you a little more.
    const worst = Math.min(n.food, n.water, n.play);
    pet.bond = clamp(pet.bond + (worst < 15 ? -1.5 : 0.3) * hours);
    pet.asleep = false;
    pet.out = false;
    // Health over the absence: step through it with needs interpolated from
    // before → now, so "hungry for the last 2 hours" isn't counted as 12.
    const after = { needs: { ...pet.needs }, litter: pet.litter, bladder: pet.bladder };
    const STEPS = Math.max(1, Math.ceil(hours));
    const sick = [];
    for (let i = 1; i <= STEPS; i += 1) {
      const k = i / STEPS;
      for (const key of Object.keys(after.needs)) pet.needs[key] = before.needs[key] + (after.needs[key] - before.needs[key]) * k;
      pet.litter = before.litter + (after.litter - before.litter) * k;
      pet.bladder = before.bladder + (after.bladder - before.bladder) * k;
      if (pet.health.dead) break;
      const at = Date.now() - (1 - k) * hours * 3.6e6;
      sick.push(...tickHealth(pet, breedOf(pet), hours / STEPS, { stage: lifeStage(pet, at), offline: true, now: at, age: ageMonths(pet, at), noDeath: DEV.noDeath }));
    }
    Object.assign(pet.needs, after.needs); pet.litter = after.litter; pet.bladder = after.bladder;
    if (sick.length) (this._offlineSick ||= []).push({ pet, ids: sick });
    return hours;
  }

  /**
   * Developer mode (dev.js): keep the wallet full while it's on, putting the real balance aside; give the real
   * balance back when it's switched off.
   */
  _devCoins() {
    const p = this.p;
    if (DEV.unlimitedCoins) {
      if (p.devSavedCoins == null) p.devSavedCoins = p.coins;
      if (p.coins !== DEV_COINS) p.coins = DEV_COINS;
    } else if (p.devSavedCoins != null) {
      p.coins = p.devSavedCoins;
      delete p.devSavedCoins;
    }
  }

  /** Call every frame with real seconds. */
  tick(dt, { focus = false, asleep = false, out = false } = {}) {
    if (this.dead) {
      if (!this._deathShown) { this._deathShown = this.pet.id; this.emit('death', this.pet); }
      return;
    }
    const h = (dt / 3600) * (focus ? 0.5 : 1);
    const r = this._rates(this.pet);
    const n = this.s.needs;
    n.food = clamp(n.food + r.food * h);
    n.water = clamp(n.water + r.water * h);
    n.play = clamp(n.play + r.play * h * (asleep ? 0.2 : 1));
    n.groom = clamp(n.groom + r.groom * h);
    if (DEV.unlimitedCoins && this.p.coins !== DEV_COINS) { this._devCoins(); this.emit('change'); }
    n.energy = clamp(n.energy + (asleep ? r.sleep : r.awake * vitality(this.pet).energy) * h);
    if (!out) this.s.bladder -= dt / 60;
    // Health runs on real time (checked every few seconds).
    this._healthAcc = (this._healthAcc || 0) + dt;
    if (this._healthAcc > 5) {
      const n = this.noise;
      const scared = !!(n?.active && !this.pet.out && Date.now() - (n.comfortedAt || 0) > 5 * 60000);
      const ids = tickHealth(this.pet, this.breed, this._healthAcc / 3600, { stage: this.stage, scared, age: ageMonths(this.pet), noDeath: DEV.noDeath });
      this._healthAcc = 0;
      if (ids.length) this.emit('sick', ids);
      this.emit('health');
    }
    this.pet.lastTick = Date.now();
    this._saveTimer += dt;
    if (this._saveTimer > 5) { this._saveTimer = 0; this.save(); }
    // The other pets live on in the background.
    this._othersTimer += dt;
    if (this._othersTimer > 60) {
      this._othersTimer = 0;
      for (const other of [...this.p.pets]) {
        if (other === this.pet) continue;
        this._catchUp(other);
        if (other.health?.dead) { this._bury(other); this.emit('lost', other); }
      }
    }
  }

  // ---------------------------------------------------------------- the end of a life
  get dead() { return !!this.pet.health?.dead; }
  /** Move a pet who has passed away into the memorial. */
  _bury(pet) {
    if (!this.p.memorial) this.p.memorial = [];
    const d = pet.health.dead || {};
    this.p.memorial.push({
      id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, coat: pet.coat, sex: pet.sex,
      age: d.age ?? ageMonths(pet), cause: d.cause || 'ageing', at: d.at || Date.now(), adoptedAt: pet.adoptedAt,
    });
    this.p.pets = this.p.pets.filter((x) => x !== pet);
    this.save();
    this.emit('change');
  }
  /** After the active pet passes away: go on with another pet, if there is one. Returns the new pet or null. */
  moveOn() {
    const gone = this.pet;
    const next = this.p.pets.find((x) => x !== gone && !x.health?.dead);
    if (!next) return null;
    this._catchUp(next);
    next.catRoom = this.p.room;
    this.p.activeId = next.id;
    this._bury(gone);
    this._bind();
    this.save();
    this.emit('pet'); this.emit('change');
    return next;
  }

  // ---------------------------------------------------------------- derived
  get needs() { return this.s.needs; }
  get bond() { return this.s.bond; }

  bondLabel(b = this.s.bond) {
    return b < 20 ? 'Shy' : b < 45 ? 'Warming up' : b < 70 ? 'Friends' : b < 90 ? 'Best friends' : 'Soulmates';
  }

  mood(pet = this.pet) {
    const n = pet.needs;
    const dog = pet.species === 'dog';
    const low = NEEDS.filter((x) => n[x.id] < 25).map((x) => x.id);
    if (pet.litter > 75) low.push('litter');
    if (dog && pet.bladder < -10) low.unshift('walk');
    const ham = pet.species === 'hamster';
    const face = dog ? { happy: '🐶', ok: '🐕', sad: '🥺', grumpy: '😤' }
      : ham ? { happy: '🐹', ok: '🐹', sad: '😟', grumpy: '😤' } : { happy: '😸', ok: '😺', sad: '😿', grumpy: '😾' };
    if (pet.health?.dead) return { id: 'gone', emoji: '🌈', label: 'Passed away', low: [] };
    if (pet.out) return { id: 'out', emoji: '🦮', label: 'Out for a walk', low: [] };
    const hs = pet.health?.score ?? 100;
    if (hs < 65) return { id: 'sick', emoji: hs < 25 ? '🚑' : '🤒', label: healthLabel(pet.health), low: ['health', ...low] };
    if (pet.asleep) return { id: 'asleep', emoji: '😴', label: 'Napping', low };
    const min = Math.min(n.food, n.water, n.energy, n.play, n.groom);
    if (n.food < 25) return { id: 'hungry', emoji: dog ? '🥺' : '🙀', label: 'Hungry', low };
    if (n.water < 25) return { id: 'thirsty', emoji: face.sad, label: 'Thirsty', low };
    if (dog && pet.bladder < -10) return { id: 'potty', emoji: '🚪', label: 'Needs to go out!', low };
    if (pet.litter > 75) return { id: 'litter', emoji: face.grumpy, label: dog ? 'Pee pad is dirty!' : ham ? 'Toilet corner needs cleaning' : 'Box is dirty!', low };
    if (n.play < 25) return { id: 'bored', emoji: dog ? '🥱' : ham ? '😟' : '😼', label: dog ? 'Needs exercise' : ham ? 'Bored — bar-chewing risk' : 'Restless', low };
    if (n.energy < 20) return { id: 'tired', emoji: '😪', label: 'Sleepy', low };
    if (n.groom < 25) return { id: 'scruffy', emoji: face.grumpy, label: 'Scruffy', low };
    if (min >= 60) return { id: 'happy', emoji: face.happy, label: 'Happy', low };
    return { id: 'content', emoji: face.ok, label: 'Content', low };
  }

  // ---------------------------------------------------------------- mutations
  addNeed(id, delta) { if (!(id in this.s.needs)) return; this.s.needs[id] = clamp(this.s.needs[id] + delta); this.emit('change'); }
  addBond(delta) { this.s.bond = clamp(this.s.bond + delta); this.emit('change'); }

  addCoins(n, why) {
    this.p.coins = Math.max(0, this.p.coins + Math.round(n));
    this.emit('coins', { n, why });
    this.emit('change');
  }

  addXp(n) {
    this.p.xp += n;
    while (this.p.xp >= xpToNext(this.p.level)) {
      this.p.xp -= xpToNext(this.p.level);
      this.p.level += 1;
      this.p.coins += 25 * this.p.level;
      this.emit('levelup', { level: this.p.level, reward: 25 * this.p.level });
    }
    this.emit('change');
  }

  count(stat, n = 1) { this.s.stats[stat] = (this.s.stats[stat] || 0) + n; }
  setName(name) { this.pet.name = name; this.save(); this.emit('change'); }
  setRoom(i) { this.p.room = i; }
  setCatRoom(i) { this.pet.catRoom = i; }
  setAsleep(v) { this.pet.asleep = v; this.emit('change'); }
  setOut(v) { this.pet.out = v; this.emit('change'); }

  // Food ---------------------------------------------------------------------
  hasFood(id) { return (this.p.inventory[id] || 0) > 0; }
  foodsFor(kind) {
    return Object.entries(FOODS).filter(([id, f]) => f.species === this.species && this.hasFood(id)
      && (kind === 'meal' ? f.kind === 'meal' : f.kind !== 'meal'));
  }

  /** Put a store-bought meal in the bowl. */
  fillBowl(id) {
    const f = FOODS[id];
    if (!f || f.kind !== 'meal' || !this.hasFood(id)) return false;
    if (this.s.bowl.food > 70) return false;
    this.p.inventory[id] -= 1;
    if (this.s.needs.food > 80) this.pet.overfed = (this.pet.overfed || 0) + 0.6;   // topping up a full pet
    this.s.bowl.food = clamp(this.s.bowl.food + f.portion);
    this.s.bowl.foodType = id;
    this.s.bowl.quality = f.like === 'love' ? 75 : 60;
    this.save(); this.emit('bowl'); this.emit('change');
    return true;
  }

  /** Recommended home-cooked portion for one meal (grams). */
  portionGrams(kcalPer100) {
    return Math.round((dailyKcal(this.pet) / mealsPerDay(this.pet)) / kcalPer100 * 100);
  }

  /** Serve a portion of home-cooked food from the fridge. */
  serveMeal(mealId, grams) {
    const m = this.p.meals.find((x) => x.id === mealId);
    if (!m || m.species !== this.species) return { ok: false, why: 'That meal isn\'t for this pet' };
    if (this.s.bowl.food > 70) return { ok: false, why: 'The bowl is still full' };
    const g = Math.min(m.grams, grams ?? m.portion ?? 100);
    const rec = this.portionGrams(m.kcal100);
    m.grams -= g;
    if (m.grams < 5) this.p.meals = this.p.meals.filter((x) => x !== m);
    // 60% of the bowl = one right-sized meal.
    this.s.bowl.food = clamp(this.s.bowl.food + 60 * (g / rec));
    if (g / rec > 1.3) this.pet.overfed = (this.pet.overfed || 0) + (g / rec - 1);
    this.s.bowl.foodType = 'home';
    this.s.bowl.quality = m.quality;
    this.count('fed');
    this.save(); this.emit('bowl'); this.emit('change');
    return { ok: true, grams: g, rec, ratio: g / rec };
  }

  /** Fridge contents for the current pet, oldest first; drops expired food. */
  fridge() {
    const now = Date.now();
    const before = this.p.meals.length;
    this.p.meals = this.p.meals.filter((m) => m.expires > now);
    if (this.p.meals.length !== before) this.save();
    return this.p.meals.filter((m) => m.species === this.species).sort((a, b) => a.made - b.made);
  }

  refillWater() {
    this.s.bowl.water = 100;
    this.save(); this.emit('bowl'); this.emit('change');
  }

  /** The pet takes a few bites/laps from a bowl. Returns how much it got. */
  eatFromBowl(dt) {
    const b = this.s.bowl; const n = this.s.needs;
    if (b.food <= 0 || n.food >= 98) return 0;
    const bite = Math.min(b.food, 6 * dt);
    b.food = clamp(b.food - bite);
    const like = (b.quality ?? 60) >= 70 ? 1 : 0.9;
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
  useTreat(id, { training = false } = {}) {
    const f = FOODS[id];
    if (!f || f.kind === 'meal' || !this.hasFood(id)) return null;
    if (f.kind === 'treat' && !training) {
      if (this.treatsLeftToday() <= 0) return { refused: 'too-many' };
      this.s.treats.count += 1;
    }
    this.p.inventory[id] -= 1;
    if (id === 'hchew') this.s.health.lastChewAt = Date.now();   // a fresh chew keeps hamster teeth worn down
    if (!training) this.pet.overfed = (this.pet.overfed || 0) + 0.08;
    const k = training ? 0.3 : 1;                 // training uses tiny pieces
    if (f.food) this.addNeed('food', f.food * k);
    if (f.play) this.addNeed('play', f.play * k);
    if (f.groom) this.addNeed('groom', f.groom * k);
    this.count('fed');
    this.addXp(training ? 1 : 3);
    this.save();
    return f;
  }

  // Toilet -------------------------------------------------------------------------
  useLitter() {
    this.s.litter = clamp(this.s.litter + LITTER_PER_VISIT);
    this.s.bladder = this.nextBladder();
    this.emit('litter'); this.emit('change');
  }

  /** Minutes until the next toilet trip. Puppies can't hold it long. */
  nextBladder() {
    const st = this.stage;
    if (this.species === 'dog') return { baby: 50, young: 110, adult: 200, senior: 140 }[st] + Math.random() * 40;
    if (this.species === 'hamster') return 50 + Math.random() * 50;
    return 40 + Math.random() * 40;
  }

  scoop() {
    if (this.s.litter < 5) return false;
    this.s.litter = 0;
    this.count('scooped');
    this.addXp(3); this.addCoins(2, 'care');
    this.emit('litter'); this.save();
    return true;
  }

  setAccident(a) { this.s.accident = a; this.emit('accident'); this.save(); }

  // Walks + training (dogs) -----------------------------------------------------------
  finishWalk(minutes, events) {
    const w = this.s.walks;
    if (w.day !== today()) { w.day = today(); w.count = 0; w.minutes = 0; }
    w.count += 1; w.minutes += minutes;
    this.s.bladder = this.nextBladder();
    const n = this.s.needs;
    n.play = clamp(n.play + Math.min(70, 10 + minutes * 5));
    n.energy = clamp(n.energy - Math.min(30, minutes * 2));
    n.groom = clamp(n.groom - minutes * 0.8);           // muddy paws
    this.addBond(1 + Math.min(4, minutes / 4) + (events.social || 0) * 0.5);
    this.count('walks');
    this.addXp(4 + Math.round(minutes));
    this.addCoins(Math.round(minutes * 2), 'walk');
    this.save();
  }

  trainingLeftToday() {
    const t = this.s.training;
    if (t.day !== today()) { t.day = today(); t.minutes = 0; }
    return Math.max(0, 15 - t.minutes);
  }

  // Shop ---------------------------------------------------------------------
  buy(kind, id, table) {
    const item = table[id];
    if (!item) return { ok: false, why: 'Unknown item' };
    if (kind === 'hat' && this.p.hats.includes(id)) return { ok: false, why: 'Already owned' };
    if (kind === 'theme' && this.p.themes.includes(id)) return { ok: false, why: 'Already owned' };
    if (item.level && this.p.level < item.level) return { ok: false, why: `Unlocks at level ${item.level}` };
    if (this.p.coins < item.price) return { ok: false, why: 'Not enough coins' };
    this.p.coins -= item.price;
    if (kind === 'food') this.p.inventory[id] = (this.p.inventory[id] || 0) + 1;
    if (kind === 'ingredient') this.p.pantry[id] = (this.p.pantry[id] || 0) + 1;
    if (kind === 'hat') this.p.hats.push(id);
    if (kind === 'theme') this.p.themes.push(id);
    this.save();
    this.emit('change');
    return { ok: true };
  }

  wearHat(id) { this.s.hat = id; this.save(); this.emit('hat', id); this.emit('change'); }
  useTheme(id) { this.p.theme = id; this.save(); this.emit('theme', id); this.emit('change'); }

  // Daily reward ---------------------------------------------------------------
  dailyAvailable() { return this.p.daily.last !== today(); }

  claimDaily() {
    if (!this.dailyAvailable()) return 0;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    this.p.daily.streak = this.p.daily.last === y ? this.p.daily.streak + 1 : 1;
    this.p.daily.last = today();
    const reward = 20 + Math.min(7, this.p.daily.streak) * 10;
    this.addCoins(reward, 'daily');
    this.save();
    return reward;
  }

  // Health + vet ---------------------------------------------------------------------
  get health() { return this.pet.health; }
  healthIssues() {
    const h = this.health;
    const conds = Object.keys(h.conds).length;
    return { conds, due: dosesDue(this.pet).filter((d) => d.due).length, prevent: prevention(this.pet).length, score: h.score };
  }
  _pay(price) {
    if (this.p.coins < price) return false;
    this.p.coins -= price; this.emit('coins', { n: -price, why: 'vet' }); return true;
  }
  vetConsult() {
    if (!this._pay(VET.consult.price)) return { ok: false, why: `A consultation costs 🪙 ${VET.consult.price}.` };
    const ids = diagnose(this.pet);
    this.addXp(3); this.save(); this.emit('change'); this.emit('health');
    return { ok: true, ids };
  }
  vetTreat(id) {
    const price = treatPrice(this.pet, id);
    if (price && this.p.coins < price) return { ok: false, why: `That treatment costs 🪙 ${price}.` };
    const r = treat(this.pet, id);
    if (r.ok && price) this._pay(price);
    if (r.ok) { this.addBond(-1); this.addXp(4); }      // vet trips are stressful, but worth it
    this.save(); this.emit('change'); this.emit('health');
    return r;
  }
  vetPrevent(kind) {
    const it = VET[kind];
    if (!this._pay(it.price)) return { ok: false, why: `${it.name} costs 🪙 ${it.price}.` };
    const h = this.health;
    if (kind === 'vaccine') h.vaccinatedAt = Date.now();
    if (kind === 'parasite') { h.parasiteAt = Date.now(); if (h.conds.fleas?.dx) h.conds.fleas.treated = true; }
    if (kind === 'checkup') { h.checkupAt = Date.now(); diagnose(this.pet); }
    h.log.push({ t: Date.now(), text: it.name });
    this.addXp(3); this.save(); this.emit('change'); this.emit('health');
    return { ok: true };
  }
  giveMedicine(id) {
    const r = giveDose(this.pet, id);
    if (r.ok) { this.addXp(2); this.addBond(-0.3); this.save(); this.emit('health'); this.emit('change'); }
    return r;
  }

  setting(key, value) { this.p.settings[key] = value; this.save(); this.emit('settings'); }
}

export { BREEDS, SPECIES, CONDITIONS, VET, symptomsOf, worst, healthLabel, prevention, dosesDue, vitality, treatPrice, verdict, CRITICAL };
