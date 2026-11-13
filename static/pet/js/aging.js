// ============================================================================
// aging.js — growing old in real time: age-related diseases and a lifespan.
// ----------------------------------------------------------------------------
// Every pet gets a hidden lifespan when it first comes home, drawn around its
// breed's real median (dogs: Breed Health Score / McMillan et al. 2024; cats:
// typical indoor-cat lifespans; hamsters: 2–3 years). It is never shown — you
// find out the way real owners do: the pet slows down, sleeps more, and the
// conditions of old age appear.
//
// Care changes it: long stretches of poor health or neglect and obesity
// shorten it; consistently good health lengthens it a little.
//
// Age-related diseases appear in real time, more likely with age (and breed,
// size and weight), and progress over weeks and months. They can't be cured
// but most can be managed — a daily medicine slows them down, if you keep
// giving it and get the prescription refilled every month.
//
// At the end: when the lifespan is reached, or after days of critical illness,
// the pet passes away.
// ============================================================================

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
// health.js hands over its full condition table (acute + chronic) so causes of death can be ranked
export const CONDITIONS_REF = { table: {}, get() { return this.table; } };
const YEAR_H = 8766;

// median lifespan (years) where the breed data doesn't give one
const CAT_LIFE = { somali: 13.5, abyssinian: 14, dlh: 14, russianblue: 15, dsh: 14 };
const DOG_LIFE = { indie: 13 };                     // the Indie isn't in Breed Health Score
const HAMSTER_LIFE = { syrian: 2.5, winterwhite: 2, robo: 3 };

export function medianLifeYears(pet, breed) {
  if (pet.species === 'hamster') return HAMSTER_LIFE[pet.breed] || 2.5;
  if (pet.species === 'dog') return breed.health?.lifespan || DOG_LIFE[pet.breed] || 12.5;
  return CAT_LIFE[pet.breed] || 14;
}

/** Normal deviate (Box-Muller). */
function gauss() {
  const u = 1 - Math.random(); const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Give the pet its hidden lifespan if it has none yet. */
export function ensureLife(pet, breed, ageMonths) {
  const h = pet.health;
  if (h.life?.base) return h.life;
  const median = medianLifeYears(pet, breed) * 12;
  let base = median * clamp(1 + 0.16 * gauss(), 0.6, 1.35);
  // a pet adopted old still gets some time with you
  const minLeft = pet.species === 'hamster' ? 3 : 8;
  base = Math.max(base, ageMonths + minLeft + Math.random() * minLeft * 2);
  h.life = { base, adj: 0 };
  return h.life;
}
export const lifeMonths = (h) => (h.life ? h.life.base + h.life.adj : Infinity);

/** How frail the pet is now: 0 until ~80% of its lifespan, then rising to 1 at the end. */
export function frailty(pet, ageMonths) {
  const L = lifeMonths(pet.health);
  if (!Number.isFinite(L)) return 0;
  return clamp((ageMonths - 0.8 * L) / (0.2 * L));
}

// ------------------------------------------------------------ age-related diseases
// hazard(): chance per year of developing it now. worsen: severity per hour untreated (≈ months to end stage);
// managedK: how much a managed (medicated, on time) disease slows down. Sources: Cornell Feline Health Center,
// AAHA/AVMA senior care guidance, Merck Veterinary Manual; hamster figures from exotic-animal medicine texts.
const yr = (a) => a / 12;
const kg = (breed) => (breed.kg ? (breed.kg[0] + breed.kg[1]) / 2 : 5);
export const CHRONIC = {
  ckd: {
    species: ['cat', 'dog'], name: 'Chronic kidney disease', icon: '🫘', weight: 70, worsen: 1 / (24 * 120), managedK: 0.3,
    symptoms: ['drinking and peeing much more', 'losing weight', 'scruffy coat, bad breath'],
    cause: 'The kidneys wear out with age — one of the most common illnesses of older cats.',
    treat: { kind: 'manage', what: 'Kidney diet + daily medicine (refill monthly)', price: 70, doses: 30, every: 24 },
    advice: 'Senior blood tests catch it early. Keep fresh water everywhere and wet food in the diet.',
    hazard: (p, b, age) => (p.species === 'cat' ? clamp((yr(age) - 7) / 8) * 0.12 : clamp((yr(age) - 9) / 6) * 0.04),
  },
  hyperthyroid: {
    species: ['cat'], name: 'Hyperthyroidism', icon: '🦋', weight: 45, worsen: 1 / (24 * 150), managedK: 0.2,
    symptoms: ['always hungry but losing weight', 'restless and yowling at night', 'drinking more'],
    cause: 'An overactive thyroid gland — very common in cats over 10.',
    treat: { kind: 'manage', what: 'Daily thyroid tablets (refill monthly)', price: 55, doses: 30, every: 24 },
    advice: 'Very treatable when caught: weigh senior cats regularly.',
    hazard: (p, b, age) => clamp((yr(age) - 10) / 4) * 0.06,
  },
  dental: {
    species: ['cat', 'dog'], name: 'Dental disease', icon: '🦷', weight: 25, worsen: 1 / (24 * 110), managedK: 1,
    symptoms: ['bad breath', 'red gums, brown tartar', 'chewing on one side, dropping food'],
    cause: 'Plaque and tartar build up over the years; most adult pets have some.',
    treat: { kind: 'procedure', what: 'Dental clean under anaesthetic', price: 90 },
    advice: 'Brush teeth with pet toothpaste and use dental chews; a dental check every year.',
    hazard: (p, b, age) => clamp((yr(age) - 2) / 4) * (p.species === 'dog' && kg(b) < 12 ? 0.16 : 0.1),
  },
  arthritis: {
    species: ['cat'], name: 'Arthritis', icon: '🦴', weight: 30, worsen: 1 / (24 * 240), managedK: 0.3,
    symptoms: ['no longer jumps up high', 'stiff after sleeping', 'missing the litter box'],
    cause: 'Joints wear with age; extra weight speeds it up. Most cats over 12 have some.',
    treat: { kind: 'manage', what: 'Daily pain relief + joint support (refill monthly)', price: 50, doses: 30, every: 24 },
    advice: 'Ramps or steps to favourite spots, a low-sided litter box, and a lean body weight.',
    hazard: (p, b, age) => clamp((yr(age) - 9) / 5) * 0.09 * (p.health.bcs >= 7 ? 2 : 1),
  },
  diabetes: {
    species: ['cat', 'dog', 'hamster'], name: 'Diabetes', icon: '🩸', weight: 55, worsen: 1 / (24 * 90), managedK: 0.15,
    symptoms: ['drinking and peeing a lot', 'losing weight while eating well', 'weak, wobbly back legs'],
    cause: 'Obesity is the biggest risk (and dwarf hamsters, especially Winter Whites, are prone).',
    treat: { kind: 'manage', what: 'Insulin or medicine + special diet (refill monthly)', price: 80, doses: 30, every: 24 },
    advice: 'Keep pets lean; no sugary treats for dwarf hamsters.',
    hazard: (p, b, age) => {
      if (p.species === 'hamster') return age > 5 ? (p.breed === 'winterwhite' ? 0.3 : 0.05) * (p.health.bcs >= 7 ? 2 : 1) : 0;
      return clamp((yr(age) - 5) / 5) * (p.health.bcs >= 7 ? 0.06 : 0.008);
    },
  },
  heart: {
    species: ['dog'], name: 'Heart disease (leaky mitral valve)', icon: '🫀', weight: 60, worsen: 1 / (24 * 200), managedK: 0.3,
    symptoms: ['coughing, especially at night', 'tiring quickly on walks', 'breathing fast while asleep'],
    cause: 'Heart valves thicken with age — most common in small breeds.',
    treat: { kind: 'manage', what: 'Daily heart medicine (refill monthly)', price: 75, doses: 30, every: 24 },
    advice: 'Count resting breaths while asleep: over 30 a minute means see the vet.',
    hazard: (p, b, age) => clamp((yr(age) - 7) / 5) * (kg(b) < 12 ? 0.07 : 0.025),
  },
  cancer: {
    species: ['cat', 'dog'], name: 'Cancer', icon: '🎗️', weight: 85, worsen: 1 / (24 * 75), managedK: 0.45,
    symptoms: ['a new lump that grows', 'losing weight', 'tired, off food'],
    cause: 'Cancer becomes more common with age — and in large dog breeds.',
    treat: { kind: 'manage', what: 'Treatment and comfort care from the vet (refill monthly)', price: 140, doses: 30, every: 24 },
    advice: 'Check your pet for lumps every month; any new lump needs a vet visit.',
    hazard: (p, b, age) => clamp((yr(age) - 8) / 5) * (p.species === 'dog' && kg(b) > 25 ? 0.05 : 0.025),
  },
  dementia: {
    species: ['cat', 'dog'], name: 'Cognitive dysfunction (dementia)', icon: '🌫️', weight: 35, worsen: 1 / (24 * 300), managedK: 0.5,
    symptoms: ['confused, stares at walls', 'cries at night', 'forgets the litter box or house training'],
    cause: 'The ageing brain — like dementia in people.',
    treat: { kind: 'manage', what: 'Supplements, enrichment and a steady routine (refill monthly)', price: 45, doses: 30, every: 24 },
    advice: 'Keep routines predictable, use night lights, and keep the mind busy with gentle games.',
    hazard: (p, b, age) => clamp((yr(age) - (p.species === 'cat' ? 13 : 10)) / 4) * 0.08,
  },
  thyroidlow: {
    species: ['dog'], name: 'Hypothyroidism', icon: '🦋', weight: 30, worsen: 1 / (24 * 200), managedK: 0.1, breed: /hypothyroid/i,
    symptoms: ['gaining weight without eating more', 'tired, seeks warmth', 'thinning coat'],
    cause: 'An underactive thyroid — this breed is prone to it (Breed Health Score).',
    treat: { kind: 'manage', what: 'Daily thyroid tablets (refill monthly)', price: 50, doses: 30, every: 24 },
    advice: 'Easy to manage once diagnosed with a blood test.',
    hazard: (p, b, age) => (yr(age) > 3 ? 0.03 : 0),
  },
  eyesight: {
    species: ['dog'], name: 'Failing eyesight', icon: '👁️', weight: 20, worsen: 1 / (24 * 400), managedK: 1, breed: /retinal|cataract|glaucoma|corneal/i,
    symptoms: ['bumping into things in the dark', 'cloudy eyes', 'nervous in new places'],
    cause: 'An inherited eye disease in this breed (Breed Health Score).',
    treat: { kind: 'care', what: 'Keep furniture in place, use your voice, and have the eyes checked' },
    advice: 'Blind dogs adapt well with a steady home layout.',
    hazard: (p, b, age) => clamp((yr(age) - 4) / 4) * 0.04,
  },
  tumour: {
    species: ['hamster'], name: 'Tumour', icon: '🎗️', weight: 85, worsen: 1 / (24 * 30), managedK: 0.6,
    symptoms: ['a lump under the skin', 'losing weight', 'less active on the wheel'],
    cause: 'Tumours are very common in hamsters over about a year and a half.',
    treat: { kind: 'manage', what: 'Comfort care from an exotics vet (refill monthly)', price: 60, doses: 30, every: 24 },
    advice: 'Feel your hamster gently for lumps each week.',
    hazard: (p, b, age) => clamp((age - 14) / 8) * 0.6,      // age in months for hamsters
  },
  heartfail: {
    species: ['hamster'], name: 'Heart failure', icon: '🫀', weight: 75, worsen: 1 / (24 * 40), managedK: 0.5,
    symptoms: ['breathing fast', 'cold, bluish feet', 'tires after a few steps'],
    cause: 'A common illness of older hamsters.',
    treat: { kind: 'manage', what: 'Heart medicine from an exotics vet (refill monthly)', price: 55, doses: 30, every: 24 },
    advice: 'Keep the tank warm and quiet.',
    hazard: (p, b, age) => clamp((age - 15) / 8) * 0.35,
  },
  ageing: {
    name: 'Old age', icon: '🕯️', weight: 48, worsen: 0, managedK: 1, frailty: true,
    symptoms: { cat: ['sleeping most of the day', 'thinner, bonier back', 'slower, more careful'], dog: ['sleeping much more', 'slow, stiff walks', 'greying muzzle, cloudy eyes'], hamster: ['hardly uses the wheel', 'thin, scruffy coat', 'sleeps most of the time'] },
    cause: 'The body is slowing down with age.',
    treat: { kind: 'care', what: 'Comfort: warmth, soft bedding, easy-to-reach food, water and toilet, and gentle company' },
    advice: 'Quality of life matters most now. Talk to your vet about comfort and how to keep each day good.',
  },
};

/**
 * Real-time ageing for one tick. add(pet, id, sev) starts a condition. Returns a death {cause} or null.
 * ctx: {age (months), noDeath}.
 */
export function tickAging(pet, breed, hours, ctx, add) {
  const h = pet.health;
  const age = ctx.age;
  if (!Number.isFinite(age)) return null;
  const life = ensureLife(pet, breed, age);
  const scale = life.base / 160;                         // a hamster's months count for more

  // care shifts the lifespan: poor health and obesity shorten it, good health lengthens it a little
  if (h.score < 30) life.adj -= hours * 0.03 * scale;
  if (h.bcs >= 7) life.adj -= hours * 0.0002 * (h.bcs - 6) * scale;
  if (h.score > 85) life.adj = Math.min(12 * scale, life.adj + hours * 0.00006 * scale);

  // new age-related diseases
  for (const [id, def] of Object.entries(CHRONIC)) {
    if (!def.hazard || h.conds[id] || !def.species.includes(pet.species)) continue;
    if (def.breed && !(breed.health?.conditions || []).some((c) => def.breed.test(c))) continue;
    const perYear = def.hazard(pet, breed, age);
    if (perYear > 0 && Math.random() < (perYear / YEAR_H) * hours) add(pet, id, 0.08);
  }

  // old age itself, from ~80% of the lifespan
  const fr = frailty(pet, age);
  if (fr > 0.05) {
    if (!h.conds.ageing) add(pet, 'ageing', fr);
    if (h.conds.ageing) h.conds.ageing.sev = fr;
  }

  // the end: the lifespan reached, or days of critical illness
  h.critical = h.score <= 6 ? (h.critical || 0) + hours : 0;
  if (ctx.noDeath) return null;
  if (age >= lifeMonths(h)) return { cause: 'ageing' };
  const chronicEnd = Object.entries(h.conds).find(([id, c]) => CHRONIC[id] && !CHRONIC[id].frailty && c.sev >= 0.99);
  if (chronicEnd && h.critical >= 72) return { cause: chronicEnd[0] };
  if (h.critical >= 48) {
    // a frail old pet passes away of old age; otherwise of its most serious illness
    if (fr > 0.5) return { cause: 'ageing' };
    const lethal = Object.entries(h.conds).filter(([id]) => (CONDITIONS_REF.get()[id]?.weight || 0) >= 40 && id !== 'ageing');
    const worst = (lethal.length ? lethal : Object.entries(h.conds)).sort((a, b) => b[1].sev * (CONDITIONS_REF.get()[b[0]]?.weight || 1) - a[1].sev * (CONDITIONS_REF.get()[a[0]]?.weight || 1))[0];
    return { cause: worst ? worst[0] : 'illness' };
  }
  return null;
}
