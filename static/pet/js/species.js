// ============================================================================
// species.js — what lives in the pet store: species, breeds, coats, ages,
// personalities, and the facts each simulation is built on.
// ----------------------------------------------------------------------------
// One 3D model can stand in for closely related breeds (same body plan,
// different coat colour / size). Where we do that the breed says so in
// `modelNote`, so nobody is misled about what they're looking at.
// ============================================================================

export const MONTH_MS = 30.44 * 864e5;

export const SPECIES = {
  cat: {
    id: 'cat', name: 'Cats', one: 'cat', baby: 'kitten', icon: '🐈',
    model: '../cat/assets/cat_rigged.glb',
    // Ages (months) where life stages change. Kittens can go home at ~8 weeks.
    adultAt: 12, seniorAt: 132,
    sleepHours: '12–16 h', mealsPerDay: { baby: 4, adult: 2, senior: 2 },
  },
  dog: {
    id: 'dog', name: 'Dogs', one: 'dog', baby: 'puppy', icon: '🐕',
    adultAt: 12, seniorAt: 96,
    sleepHours: '12–14 h', mealsPerDay: { baby: 3, adult: 2, senior: 2 },
  },
};

// Dog coats map onto the dog models' material names.
const HUSKY_MATS = { main: ['Material'], light: ['Material.001'], dark: ['Material.006'] };
const SHIBA_MATS = { main: ['Main'], light: ['Main_Light'], dark: ['Black'] };

// Cat coats tint the Somali texture: saturation, then an RGB multiplier.
export const BREEDS = {
  // ------------------------------------------------------------------ cats
  somali: {
    species: 'cat', name: 'Somali', origin: 'Breeder', length: 1.55, kg: [3, 5], adultAt: 12,
    model: '../cat/assets/cat_rigged.glb',
    coat: 'long', groomRate: 1,
    traits: { energy: 0.9, vocal: 0.3, cuddly: 0.5, independent: 0.5 },
    about: 'The long-haired “fox cat”: very active, curious, loves heights, follows its people around. Quiet chirps rather than loud meows.',
    coats: {
      ruddy: { name: 'Ruddy', sat: 1, tint: [1, 1, 1] },
      red:   { name: 'Red (sorrel)', sat: 1.25, tint: [1.22, 0.86, 0.72] },
      blue:  { name: 'Blue', sat: 0.2, tint: [0.82, 0.86, 0.96] },
      fawn:  { name: 'Fawn', sat: 0.45, tint: [1.2, 1.06, 0.94] },
    },
    price: 260,
    source: ['https://cfa.org/breed/somali/', 'CFA — Somali'],
  },
  abyssinian: {
    species: 'cat', name: 'Abyssinian', origin: 'Breeder', length: 1.5, kg: [3, 5], adultAt: 12,
    model: '../cat/assets/cat_rigged.glb',
    modelNote: 'Shown with the Somali model — the Somali is the long-haired Abyssinian; a real Aby has a short ticked coat.',
    coat: 'short', groomRate: 0.55,
    traits: { energy: 0.95, vocal: 0.25, cuddly: 0.45, independent: 0.55 },
    about: 'One of the oldest breeds: athletic, inquisitive and busy. Short coat needs little brushing. Wants company and climbing space.',
    coats: {
      ruddy: { name: 'Ruddy', sat: 1, tint: [1, 1, 1] },
      red:   { name: 'Red', sat: 1.25, tint: [1.22, 0.86, 0.72] },
      blue:  { name: 'Blue', sat: 0.2, tint: [0.82, 0.86, 0.96] },
      fawn:  { name: 'Fawn', sat: 0.45, tint: [1.2, 1.06, 0.94] },
    },
    price: 240,
    source: ['https://cfa.org/breed/abyssinian/', 'CFA — Abyssinian'],
  },
  dlh: {
    species: 'cat', name: 'Domestic Longhair', origin: 'Rescue', length: 1.55, kg: [3.5, 5.5], adultAt: 12,
    model: '../cat/assets/cat_rigged.glb',
    modelNote: 'Mixed-breed cats vary a lot; shown with the Somali body and a matching coat colour.',
    coat: 'long', groomRate: 1,
    traits: { energy: 0.65, vocal: 0.5, cuddly: 0.6, independent: 0.5 },
    about: 'A mixed-breed long-haired cat — the kind you meet at every shelter. Personalities vary; most adapt well to flat life.',
    coats: {
      ginger: { name: 'Ginger tabby', sat: 1.2, tint: [1.25, 0.9, 0.62] },
      grey:   { name: 'Grey tabby', sat: 0.1, tint: [0.85, 0.85, 0.88] },
      cream:  { name: 'Cream', sat: 0.22, tint: [1.38, 1.25, 1.06] },
      smoke:  { name: 'Black smoke', sat: 0.05, tint: [0.32, 0.32, 0.35] },
    },
    price: 50,
    source: ['https://www.aspca.org/pet-care/cat-care/general-cat-care', 'ASPCA — general cat care'],
  },

  // ------------------------------------------------------------------ dogs
  husky: {
    species: 'dog', name: 'Siberian Husky', origin: 'Breeder', length: 1.85, kg: [16, 27], adultAt: 12,
    model: './models/husky.glb', mats: HUSKY_MATS, coat: 'double', groomRate: 1.2,
    traits: { energy: 1, vocal: 0.9, cuddly: 0.6, independent: 0.7 },
    voice: { size: 0.75, howler: true },
    about: 'Bred to pull sleds for miles: needs a LOT of daily exercise, “talks” and howls rather than barks, friendly with everyone, and an escape artist. Sheds heavily.',
    coats: {
      grey:   { name: 'Grey & white', main: '#5a5c58', light: '#e9eae4', dark: '#2e2e2e' },
      black:  { name: 'Black & white', main: '#262626', light: '#f1f1ee', dark: '#141414' },
      copper: { name: 'Red & white', main: '#9a5a33', light: '#f3ece4', dark: '#3d2418' },
      agouti: { name: 'Agouti', main: '#4a4237', light: '#b9ae9c', dark: '#1d1a16' },
    },
    price: 320,
    source: ['https://www.akc.org/dog-breeds/siberian-husky/', 'AKC — Siberian Husky'],
  },
  malamute: {
    species: 'dog', name: 'Alaskan Malamute', origin: 'Breeder', length: 2.15, kg: [34, 39], adultAt: 18,
    model: './models/husky.glb', mats: HUSKY_MATS, coat: 'double', groomRate: 1.3,
    modelNote: 'Shown with the Husky model (both are Arctic sled dogs); a real Malamute is bigger and heavier-boned.',
    traits: { energy: 0.9, vocal: 0.8, cuddly: 0.6, independent: 0.8 },
    voice: { size: 0.95, howler: true },
    about: 'A powerful freight sled dog: affectionate and playful, but strong-willed — needs firm, kind training and lots of exercise. “Woo-woos” more than barks.',
    coats: {
      grey:  { name: 'Grey & white', main: '#6d6f6a', light: '#f0f0ec', dark: '#2e2e2e' },
      black: { name: 'Black & white', main: '#2a2a2a', light: '#f2f2ef', dark: '#151515' },
      seal:  { name: 'Seal & white', main: '#3a302a', light: '#ece6de', dark: '#1a1512' },
      red:   { name: 'Red & white', main: '#8f5a3c', light: '#f3ebe2', dark: '#3a2418' },
    },
    price: 340,
    source: ['https://www.akc.org/dog-breeds/alaskan-malamute/', 'AKC — Alaskan Malamute'],
  },
  shiba: {
    species: 'dog', name: 'Shiba Inu', origin: 'Breeder', length: 1.35, kg: [8, 11], adultAt: 10,
    model: './models/shiba.glb', mats: SHIBA_MATS, coat: 'double', groomRate: 0.9,
    traits: { energy: 0.7, vocal: 0.3, cuddly: 0.35, independent: 0.95 },
    voice: { size: 0.45, scream: true },
    about: 'An ancient Japanese spitz: alert, bold, very clean and famously independent — almost cat-like. Not big on cuddles on demand. Rarely barks, but has the famous “Shiba scream”.',
    coats: {
      red:    { name: 'Red', main: '#b5652a', light: '#f4ece0', dark: '#2e2e2e' },
      sesame: { name: 'Sesame', main: '#7d5131', light: '#efe4d3', dark: '#2a1d14' },
      blacktan: { name: 'Black & tan', main: '#2a2522', light: '#e9d9c2', dark: '#141210' },
      cream:  { name: 'Cream', main: '#e3cfae', light: '#f8f3ea', dark: '#3a3530' },
    },
    price: 300,
    source: ['https://www.akc.org/dog-breeds/shiba-inu/', 'AKC — Shiba Inu'],
  },
  akita: {
    species: 'dog', name: 'Akita', origin: 'Breeder', length: 2.1, kg: [32, 45], adultAt: 18,
    model: './models/shiba.glb', mats: SHIBA_MATS, coat: 'double', groomRate: 1.1,
    modelNote: 'Shown with the Shiba Inu model scaled up (both Japanese spitz breeds); a real Akita is far larger and heavier.',
    traits: { energy: 0.6, vocal: 0.2, cuddly: 0.45, independent: 0.85 },
    voice: { size: 0.95 },
    about: 'Dignified, quiet and deeply loyal to its family; reserved with strangers. Needs early socialisation and an experienced owner.',
    coats: {
      red:     { name: 'Red', main: '#b46a33', light: '#f5ede2', dark: '#2e2e2e' },
      white:   { name: 'White', main: '#f1ece3', light: '#fbf8f2', dark: '#3a3530' },
      brindle: { name: 'Brindle', main: '#4c3a2c', light: '#e8dccb', dark: '#1c1510' },
    },
    price: 360,
    source: ['https://www.akc.org/dog-breeds/akita/', 'AKC — Akita'],
  },
  indie: {
    species: 'dog', name: 'Indie (Indian Pariah Dog)', origin: 'Rescue', length: 1.6, kg: [15, 25], adultAt: 12,
    model: './models/shiba.glb', mats: SHIBA_MATS, coat: 'short', groomRate: 0.5,
    modelNote: 'Shown with the Shiba Inu model, which shares the Indie\'s pointed ears and curled tail.',
    traits: { energy: 0.75, vocal: 0.55, cuddly: 0.6, independent: 0.6 },
    voice: { size: 0.65 },
    about: 'One of the world\'s oldest landrace dogs: hardy, clever, alert and very loyal once it trusts you. Short coat, few health problems. Thousands wait in shelters.',
    coats: {
      fawn:  { name: 'Fawn', main: '#c08a55', light: '#f1e4d0', dark: '#2e2e2e' },
      brown: { name: 'Brown', main: '#6e4a2f', light: '#e2d2bd', dark: '#21170f' },
      black: { name: 'Black', main: '#1f1d1c', light: '#d9d2c8', dark: '#111' },
      white: { name: 'White & tan', main: '#efe7da', light: '#fbf8f2', dark: '#8a5a33' },
    },
    price: 40,
    source: ['https://en.wikipedia.org/wiki/Indian_pariah_dog', 'Wikipedia — Indian pariah dog'],
  },
};

// Per-pet personality (real individuals differ even within a breed).
export const PERSONALITIES = {
  playful:     { name: 'Playful',     icon: '🧶', bond: 25, play: 1.25, follow: 1, vocal: 1.1, about: 'Always up for a game.' },
  cuddly:      { name: 'Cuddly',      icon: '🤗', bond: 35, play: 1,    follow: 1.15, vocal: 1, about: 'Loves company and touch.' },
  shy:         { name: 'Shy',         icon: '🙈', bond: 8,  play: 0.9,  follow: 0.6, vocal: 0.7, about: 'Needs patience — trust comes slowly, then it\'s for life.' },
  independent: { name: 'Independent', icon: '😎', bond: 20, play: 0.9,  follow: 0.7, vocal: 0.8, about: 'Affectionate on its own terms.' },
  chatty:      { name: 'Chatty',      icon: '💬', bond: 25, play: 1,    follow: 1, vocal: 1.6, about: 'Has opinions and shares them.' },
  calm:        { name: 'Calm',        icon: '🍃', bond: 25, play: 0.8,  follow: 0.9, vocal: 0.8, about: 'Easy-going and relaxed.' },
};

export const NAMES = {
  female: ['Mochi', 'Luna', 'Nala', 'Kiara', 'Hazel', 'Pepper', 'Maple', 'Miso', 'Yuki', 'Ginger', 'Coco', 'Biscuit', 'Juno', 'Kaju', 'Laddu', 'Pari'],
  male: ['Simba', 'Oreo', 'Milo', 'Leo', 'Bruno', 'Kuro', 'Rocky', 'Tofu', 'Sheru', 'Max', 'Toby', 'Loki', 'Bolt', 'Raja', 'Hachi', 'Cookie'],
};

// ---------------------------------------------------------------- ages
export function breedOf(pet) { return BREEDS[pet.breed] || BREEDS.somali; }

/** Current age in months (pets grow up in real time). */
export function ageMonths(pet, now = Date.now()) {
  return (pet.ageAtAdoption ?? 24) + Math.max(0, now - (pet.adoptedAt ?? now)) / MONTH_MS;
}

/** 'baby' | 'young' | 'adult' | 'senior' */
export function lifeStage(pet, now = Date.now()) {
  const m = ageMonths(pet, now);
  const sp = SPECIES[pet.species] || SPECIES.cat;
  const adultAt = breedOf(pet).adultAt || sp.adultAt;
  if (m < Math.min(6, adultAt / 2)) return 'baby';
  if (m < adultAt) return 'young';
  const senior = pet.species === 'dog' && breedOf(pet).kg[1] > 30 ? 84 : sp.seniorAt;   // big dogs age sooner
  return m >= senior ? 'senior' : 'adult';
}

export function stageName(pet) {
  const sp = SPECIES[pet.species] || SPECIES.cat;
  const st = lifeStage(pet);
  return st === 'baby' ? sp.baby[0].toUpperCase() + sp.baby.slice(1) : st === 'young' ? 'Young' : st === 'senior' ? 'Senior' : 'Adult';
}

export function ageLabel(months) {
  const m = Math.floor(months);
  if (m < 12) return `${Math.max(2, m)} month${m === 1 ? '' : 's'}`;
  const y = Math.floor(m / 12); const r = m % 12;
  return r && y < 3 ? `${y} yr ${r} mo` : `${y} year${y === 1 ? '' : 's'}`;
}

/** 0.5 … 1: body size relative to adult (growth is fast early, then slows). */
export function growth(pet, now = Date.now()) {
  const m = ageMonths(pet, now);
  const adultAt = breedOf(pet).adultAt || 12;
  const k = Math.max(0, Math.min(1, (m - 1.5) / (adultAt - 1.5)));
  return 0.5 + 0.5 * Math.pow(k, 0.6);
}

/** Body weight (kg) right now — used for portion sizes. */
export function weightKg(pet, now = Date.now()) {
  const [lo, hi] = breedOf(pet).kg;
  const adult = pet.sex === 'male' ? hi * 0.92 + lo * 0.08 : lo * 0.65 + hi * 0.35;
  return +(adult * Math.pow(growth(pet, now), 3)).toFixed(1);       // mass ∝ length³
}

/**
 * Daily energy need (kcal). RER = 70 × kg^0.75, times a life-stage factor —
 * the standard veterinary estimate (e.g. WSAVA / Merck Veterinary Manual).
 */
export function dailyKcal(pet) {
  const kg = weightKg(pet);
  const rer = 70 * Math.pow(kg, 0.75);
  const st = lifeStage(pet);
  const f = pet.species === 'dog'
    ? { baby: 3, young: 2, adult: 1.6, senior: 1.4 }[st]
    : { baby: 2.5, young: 2, adult: 1.2, senior: 1.1 }[st];
  return Math.round(rer * f);
}

export function mealsPerDay(pet) {
  const sp = SPECIES[pet.species] || SPECIES.cat;
  const st = lifeStage(pet);
  return sp.mealsPerDay[st === 'young' ? 'adult' : st] || 2;
}

// ---------------------------------------------------------------- the store
function rng(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AGE_BANDS = {
  baby:   { label: 'Baby',   months: [2, 4],   price: 1.15 },
  young:  { label: 'Young',  months: [6, 18],  price: 1 },
  adult:  { label: 'Adult',  months: [24, 72], price: 0.8 },
  senior: { label: 'Senior', months: [96, 132], price: 0.4 },
};
export const AGE_FILTERS = [['all', 'All ages'], ...Object.entries(AGE_BANDS).map(([k, v]) => [k, v.label])];

/**
 * Today's animals for a species. Deterministic per day, like a real shop's
 * stock: come back tomorrow for new arrivals.
 */
export function listings(species, day = new Date().toISOString().slice(0, 10)) {
  const r = rng(`${day}|${species}`);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const breeds = Object.entries(BREEDS).filter(([, b]) => b.species === species);
  const out = [];
  const bands = Object.keys(AGE_BANDS);
  for (let i = 0; i < 8; i += 1) {
    const [breedId, breed] = breeds[i % breeds.length];
    const band = i < 3 ? 'baby' : pick(bands);
    const [a0, a1] = AGE_BANDS[band].months;
    const months = Math.round(a0 + r() * (a1 - a0));
    const sex = r() < 0.5 ? 'female' : 'male';
    const coatId = pick(Object.keys(breed.coats));
    const personality = pick(Object.keys(PERSONALITIES));
    const name = pick(NAMES[sex]);
    const rescue = breed.origin === 'Rescue' || (band === 'senior') || r() < 0.15;
    const base = rescue ? Math.min(breed.price, 60) : breed.price;
    const price = Math.round((base * AGE_BANDS[band].price) / 5) * 5;
    out.push({
      id: `${day}-${species}-${i}`, species, breed: breedId, coat: coatId, sex, months, band, personality, name,
      rescue, price: Math.max(rescue ? 20 : 60, price),
    });
  }
  return out;
}

export function newPetFrom(listing, name) {
  const p = PERSONALITIES[listing.personality] || PERSONALITIES.calm;
  return {
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    species: listing.species, breed: listing.breed, coat: listing.coat, sex: listing.sex,
    personality: listing.personality, name: name || listing.name,
    ageAtAdoption: listing.months, adoptedAt: Date.now(),
    bond: p.bond,
  };
}

export function pronoun(pet, kind = 'subj') {
  const f = pet?.sex !== 'male';
  return { subj: f ? 'she' : 'he', obj: f ? 'her' : 'him', pos: f ? 'her' : 'his', Subj: f ? 'She' : 'He' }[kind];
}
