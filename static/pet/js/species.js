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
  hamster: {
    id: 'hamster', name: 'Hamsters', one: 'hamster', baby: 'pup', icon: '🐹',
    // Weaned at 3–4 weeks, go to new homes at ~6–8 weeks, adult by ~3 months,
    // old by ~18 months; most live 2–3 years.
    adultAt: 3, seniorAt: 18, babyUntil: 2.2,
    sleepHours: '12–14 h, by day', mealsPerDay: { baby: 1, adult: 1, senior: 1 },
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

    russianblue: {
    species: 'cat', name: 'Russian Blue', origin: 'Breeder', length: 1.5, kg: [3, 5.5], adultAt: 12,
    model: './models/cat_shorthair.glb', coat: 'short', groomRate: 0.5,
    swatchBase: [0.36, 0.36, 0.36],
    modelNote: 'Low-poly shorthair model; its walking, sitting and lying animations are generated from its skeleton.',
    traits: { energy: 0.6, vocal: 0.2, cuddly: 0.55, independent: 0.6 },
    about: 'A quiet, gentle cat with a dense silver-blue coat and green eyes. Reserved with strangers, very loyal to its people, and likes a predictable routine — a good flat cat.',
    coats: {
      blue: { name: 'Blue', sat: 0.6, tint: [1.2, 1.34, 1.6] },
    },
    price: 250,
    source: ['https://cfa.org/breed/russian-blue/', 'CFA — Russian Blue'],
  },
  dsh: {
    species: 'cat', name: 'Domestic Shorthair (Indie cat)', origin: 'Rescue', length: 1.5, kg: [3.5, 5.5], adultAt: 12,
    model: './models/cat_shorthair.glb', coat: 'short', groomRate: 0.5,
    swatchBase: [0.36, 0.36, 0.36],
    modelNote: 'Low-poly shorthair model shown in solid colours (no tabby stripes); its walking, sitting and lying animations are generated from its skeleton.',
    traits: { energy: 0.7, vocal: 0.5, cuddly: 0.6, independent: 0.55 },
    about: 'The everyday mixed-breed short-haired cat — street cats, shelter cats and most of the cats in India. Hardy, adaptable, clever; every one has its own personality.',
    coats: {
      black:  { name: 'Black', sat: 0.6, tint: [0.36, 0.36, 0.38] },
      grey:   { name: 'Grey', sat: 0.6, tint: [1.4, 1.4, 1.42] },
      ginger: { name: 'Ginger', sat: 0.5, tint: [2.7, 1.35, 0.5] },
      cream:  { name: 'Cream', sat: 0.5, tint: [2.55, 2.3, 1.8] },
      white:  { name: 'White', sat: 0.5, tint: [2.6, 2.6, 2.55] },
    },
    price: 40,
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

  germanshepherd: {
    species: 'dog', name: 'German Shepherd', origin: 'Breeder', length: 2.0, kg: [22, 40], adultAt: 18,
    model: './models/german_shepherd.glb', coat: 'double', groomRate: 1.2,
    swatchBase: [0.5, 0.3, 0.18],
    modelNote: 'Quaternius low-poly model; the adventure backpack is removed but the harness straps remain.',
    traits: { energy: 0.9, vocal: 0.6, cuddly: 0.6, independent: 0.35 },
    voice: { size: 0.85 },
    about: 'Smart, loyal and very trainable — a working dog that needs a job: long walks, training and puzzle games every day. Protective of its family; sheds all year.',
    coats: {
      blacktan: { name: 'Black & tan', sat: 1, tint: [1, 1, 1] },
      sable:    { name: 'Sable', sat: 0.7, tint: [1.15, 1.02, 0.85] },
      black:    { name: 'Black', sat: 0.2, tint: [0.36, 0.36, 0.38] },
    },
    price: 330,
    source: ['https://www.akc.org/dog-breeds/german-shepherd-dog/', 'AKC — German Shepherd Dog'],
  },
  pug: {
    species: 'dog', name: 'Pug', origin: 'Breeder', length: 1.0, kg: [6, 8], adultAt: 12,
    model: './models/pug.glb', coat: 'short', groomRate: 0.8,
    swatchBase: [0.78, 0.66, 0.42],
    modelNote: 'Quaternius low-poly model; the backpack is removed but the harness and bandana remain.',
    traits: { energy: 0.4, vocal: 0.45, cuddly: 1, independent: 0.25 },
    voice: { size: 0.35 },
    about: 'A small, affectionate clown that just wants to be with you — a classic flat dog. Its flat face (brachycephaly) means breathing problems and overheating: short, cool walks, no hard exercise in the heat, and clean the face wrinkles.',
    coats: {
      fawn:    { name: 'Fawn', sat: 1, tint: [1, 1, 1] },
      apricot: { name: 'Apricot', sat: 1.2, tint: [1.15, 0.95, 0.78] },
      black:   { name: 'Black', sat: 0.15, tint: [0.32, 0.32, 0.34] },
    },
    price: 280,
    source: ['https://www.akc.org/dog-breeds/pug/', 'AKC — Pug'],
  },

  // ------------------------------------------------------------------ hamsters
  // Hamsters must live alone (Syrians fight; even dwarfs often do), so each is its own pet.
  syrian: {
    species: 'hamster', name: 'Syrian hamster', origin: 'Breeder', length: 0.5, kg: [0.1, 0.175], adultAt: 3,
    model: './models/hamster.glb', modelYaw: -Math.PI / 2, coat: 'short', groomRate: 0.6,
    foodG: [10, 15], swatchBase: [0.82, 0.55, 0.28],
    modelNote: 'Low-poly model with no skeleton: it is moved, tilted and squashed as a whole, so legs and cheeks don\'t animate.',
    traits: { energy: 0.85, vocal: 0.1, cuddly: 0.45, independent: 0.9 },
    about: 'The “golden hamster”, about 15 cm long. Nocturnal: sleeps through the day and runs kilometres on its wheel at night. Strictly solitary. Can become tame and enjoy being handled if you are patient.',
    coats: {
      golden:   { name: 'Golden & white', sat: 1, tint: [1, 1, 1] },
      cinnamon: { name: 'Cinnamon', sat: 1.1, tint: [1.15, 0.82, 0.65] },
      cream:    { name: 'Cream', sat: 0.35, tint: [1.3, 1.18, 1.0] },
      black:    { name: 'Black', sat: 0.15, tint: [0.4, 0.38, 0.38] },
    },
    price: 25,
    source: ['https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters', 'RSPCA — hamster care'],
  },
  winterwhite: {
    species: 'hamster', name: 'Winter White dwarf hamster', origin: 'Breeder', length: 0.32, kg: [0.03, 0.045], adultAt: 3,
    model: './models/hamster.glb', modelYaw: -Math.PI / 2, coat: 'short', groomRate: 0.6,
    foodG: [5, 8], swatchBase: [0.82, 0.55, 0.28],
    modelNote: 'Shown with the Syrian hamster model, scaled down and recoloured; a real dwarf hamster is rounder with a dark stripe down its back.',
    traits: { energy: 0.9, vocal: 0.15, cuddly: 0.4, independent: 0.85 },
    about: 'A small (8–10 cm) Russian dwarf hamster. Quick and curious, usually fairly calm when handled gently. Best kept alone. Prone to diabetes, so no sugary fruit.',
    coats: {
      normal:   { name: 'Normal (grey-brown)', sat: 0.2, tint: [0.85, 0.82, 0.8] },
      sapphire: { name: 'Sapphire', sat: 0.05, tint: [0.88, 0.92, 1.05] },
      pearl:    { name: 'Pearl', sat: 0.05, tint: [1.3, 1.3, 1.28] },
    },
    price: 20,
    source: ['https://www.bluecross.org.uk/pet-advice/hamster-care', 'Blue Cross — hamster care'],
  },
  robo: {
    species: 'hamster', name: 'Roborovski dwarf hamster', origin: 'Breeder', length: 0.2, kg: [0.02, 0.025], adultAt: 3,
    model: './models/hamster.glb', modelYaw: -Math.PI / 2, coat: 'short', groomRate: 0.5,
    foodG: [3, 5], swatchBase: [0.82, 0.55, 0.28],
    modelNote: 'Shown with the Syrian hamster model, scaled down and recoloured; a real Robo is tiny (about 5 cm) with white “eyebrows”.',
    traits: { energy: 1, vocal: 0.1, cuddly: 0.15, independent: 1 },
    about: 'The smallest and fastest hamster — fascinating to watch, not to cuddle: Robos are too quick and nervous for much handling. Very active at night.',
    coats: {
      agouti: { name: 'Agouti (sandy)', sat: 0.55, tint: [1.2, 1.05, 0.85] },
      husky:  { name: 'Husky (pale)', sat: 0.25, tint: [1.3, 1.25, 1.15] },
    },
    price: 20,
    source: ['https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters', 'RSPCA — hamster care'],
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
  if (m < (sp.babyUntil ?? Math.min(6, adultAt / 2))) return 'baby';
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
  if (months < 3) return `${Math.max(6, Math.round(months * 4.35))} weeks`;
  const m = Math.floor(months);
  if (m < 12) return `${Math.max(2, m)} month${m === 1 ? '' : 's'}`;
  const y = Math.floor(m / 12); const r = m % 12;
  return r && y < 3 ? `${y} yr ${r} mo` : `${y} year${y === 1 ? '' : 's'}`;
}

/** 0.5 … 1: body size relative to adult (growth is fast early, then slows). */
export function growth(pet, now = Date.now()) {
  const m = ageMonths(pet, now);
  const adultAt = breedOf(pet).adultAt || 12;
  const born = pet.species === 'hamster' ? 0.7 : 1.5;      // age (months) when it can leave its mother
  const k = Math.max(0, Math.min(1, (m - born) / (adultAt - born)));
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
  if (pet.species === 'hamster') return Math.round(dailyFoodGrams(pet) * 3.6);   // a hamster mix is ~360 kcal/100 g
  const kg = weightKg(pet);
  const rer = 70 * Math.pow(kg, 0.75);
  const st = lifeStage(pet);
  const f = pet.species === 'dog'
    ? { baby: 3, young: 2, adult: 1.6, senior: 1.4 }[st]
    : { baby: 2.5, young: 2, adult: 1.2, senior: 1.1 }[st];
  return Math.round(rer * f);
}

/**
 * Hamsters: grams of dry mix a day (about a tablespoon for a Syrian) — fed once,
 * in the evening, often scattered so it can forage.
 */
export function dailyFoodGrams(pet) {
  const [lo, hi] = breedOf(pet).foodG || [10, 15];
  return Math.round((lo + (hi - lo) * 0.5) * (0.6 + 0.4 * growth(pet)));
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
const HAMSTER_BANDS = {
  baby:   { label: 'Baby',   months: [1.5, 2.2], price: 1.1 },
  young:  { label: 'Young',  months: [2.5, 4],   price: 1 },
  adult:  { label: 'Adult',  months: [5, 14],    price: 0.8 },
  senior: { label: 'Senior', months: [18, 22],   price: 0.4 },
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
  const BANDS = species === 'hamster' ? HAMSTER_BANDS : AGE_BANDS;
  const bands = Object.keys(BANDS);
  for (let i = 0; i < 8; i += 1) {
    const [breedId, breed] = breeds[i % breeds.length];
    const band = i < 3 ? 'baby' : pick(bands);
    const [a0, a1] = BANDS[band].months;
    const months = species === 'hamster' ? +(a0 + r() * (a1 - a0)).toFixed(1) : Math.round(a0 + r() * (a1 - a0));
    const sex = r() < 0.5 ? 'female' : 'male';
    const coatId = pick(Object.keys(breed.coats));
    const personality = pick(Object.keys(PERSONALITIES));
    const name = pick(NAMES[sex]);
    const rescue = breed.origin === 'Rescue' || (band === 'senior') || r() < 0.15;
    const base = rescue ? Math.min(breed.price, 60) : breed.price;
    const price = Math.round((base * BANDS[band].price) / 5) * 5;
    const floor = species === 'hamster' ? 10 : rescue ? 20 : 60;
    out.push({
      id: `${day}-${species}-${i}`, species, breed: breedId, coat: coatId, sex, months, band, personality, name,
      rescue, price: Math.max(floor, price),
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
