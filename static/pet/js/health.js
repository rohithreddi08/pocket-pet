// ============================================================================
// health.js — real-time health: neglect makes pets ill, like in real life.
// ----------------------------------------------------------------------------
// Every pet has a health score (0–100), a body-condition score (BCS 1–9,
// 5 = ideal), preventive care (vaccines, flea & worm treatment, check-ups) and
// a list of conditions. Conditions come from what actually causes them:
//
//   no food for hours          → weight loss; cats: fatty liver (hepatic lipidosis)
//   no water                   → dehydration
//   dirty litter box / stress  → cystitis (FLUTD) in cats
//   dog made to hold its bladder → urinary tract infection
//   dirty tank + stress        → wet tail in hamsters (an emergency)
//   no brushing (long coats)   → matted fur; dogs → hot spots (skin infection)
//   no exercise / play         → stress & anxiety behaviours
//   overfeeding                → overweight (BCS rises)
//   no chews (hamster)         → overgrown teeth
//   no flea/worm treatment     → fleas
//   unvaccinated               → cat flu / kennel cough (random, more likely)
//
// Untreated conditions get worse over real hours; health falls; the pet shows
// symptoms (sleeps more, slower, off its food, won't play). A vet visit
// diagnoses and treats; medicine courses need every dose on time. It all keeps
// running while the app is closed (via Game._catchUp).
// Sources: see the care guides (ASPCA, AKC, Cornell, RSPCA, Blue Cross, Merck).
// ============================================================================

const H = 3.6e6;            // ms per hour
const DAY = 24 * H;
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// The vet's price list (coins).
export const VET = {
  consult: { name: 'Consultation & diagnosis', icon: '🩺', price: 30 },
  checkup: { name: 'Yearly health check', icon: '📋', price: 25 },
  vaccine: { name: 'Vaccination booster', icon: '💉', price: 40 },
  parasite: { name: 'Flea & worm treatment', icon: '🐛', price: 15 },
};

/**
 * Condition catalogue. Rates are per real hour.
 *  worsen: severity gained per hour while untreated (and the cause continues)
 *  heal:   severity lost per hour once treated / once the cause is fixed
 *  weight: how much a fully severe condition costs the health score
 *  treat:  what the vet does — 'course' (medicine doses), 'procedure' (done at the vet),
 *          'care' (no medicine: fix the cause at home)
 */
export const CONDITIONS = {
  dehydration: {
    name: 'Dehydration', icon: '🏜️', weight: 70, worsen: 0.035, heal: 0.15, selfHeal: true,
    symptoms: ['lethargic', 'dry, tacky gums', 'skin slow to spring back'],
    cause: 'No water for hours.', treat: { kind: 'procedure', what: 'Fluids under the skin / IV', price: 45 },
    advice: 'Always keep fresh water available and refill it every day.',
  },
  malnutrition: {
    name: 'Weight loss from underfeeding', icon: '🦴', weight: 55, worsen: 0.012, heal: 0.03, selfHeal: true,
    symptoms: ['weak', 'ribs and hips easy to feel', 'dull coat'],
    cause: 'Not fed enough for too long.', treat: { kind: 'care', what: 'Small, regular, measured meals to rebuild weight' },
    advice: 'Feed measured meals every day — the portion guide in the kitchen shows how much.',
  },
  lipidosis: {
    species: ['cat'], name: 'Fatty liver (hepatic lipidosis)', icon: '🟡', weight: 90, worsen: 0.02, heal: 0.012,
    symptoms: ['won\'t eat', 'yellow tinge to gums and ears (jaundice)', 'hiding'],
    cause: 'Cats that go without food for a couple of days can develop this life-threatening liver disease.',
    treat: { kind: 'course', what: 'Hospital feeding + liver support medicine', price: 120, doses: 6, every: 12 },
    advice: 'Never let a cat go more than a day without eating — call a vet if it stops eating.',
  },
  cystitis: {
    species: ['cat'], name: 'Cystitis (FLUTD)', icon: '🚽', weight: 50, worsen: 0.01, heal: 0.03,
    symptoms: ['straining in the litter box', 'peeing small amounts often', 'peeing outside the box'],
    cause: 'Stress and a dirty litter box make cats hold their urine. A male cat that strains and can\'t pee is an emergency.',
    treat: { kind: 'course', what: 'Pain relief + more water (wet food)', price: 50, doses: 5, every: 24 },
    advice: 'Scoop the litter box every day and keep the routine calm.',
  },
  uti: {
    species: ['dog'], name: 'Urinary tract infection', icon: '🚽', weight: 45, worsen: 0.01, heal: 0.03,
    symptoms: ['needs to pee very often', 'accidents indoors', 'licking'],
    cause: 'Being made to hold its bladder for too long.', treat: { kind: 'course', what: 'Antibiotics', price: 45, doses: 7, every: 12 },
    advice: 'Take your dog out regularly — adults every 4–6 hours, puppies far more often.',
  },
  wettail: {
    species: ['hamster'], name: 'Wet tail (proliferative ileitis)', icon: '💧', weight: 95, worsen: 0.04, heal: 0.02,
    symptoms: ['wet, dirty bottom', 'hunched and lethargic', 'not eating'],
    cause: 'Stress and a dirty tank. It can kill a hamster within 1–2 days.',
    treat: { kind: 'course', what: 'Antibiotics + fluids from an exotics vet', price: 60, doses: 6, every: 12 },
    advice: 'Spot-clean every day or two and avoid stressful changes. Wet tail is an emergency.',
  },
  matted: {
    name: 'Matted fur', icon: '🧶', weight: 25, worsen: 0.006, heal: 0.03, needs: 'longcoat',
    symptoms: ['tangled clumps in the coat', 'scratching', 'sore skin under the mats'],
    cause: 'A long coat that isn\'t brushed.', treat: { kind: 'procedure', what: 'Clipping the mats out', price: 35 },
    advice: 'Brush long coats several times a week.',
  },
  hotspots: {
    species: ['dog'], name: 'Hot spots (skin infection)', icon: '🔴', weight: 30, worsen: 0.008, heal: 0.03,
    symptoms: ['licking and chewing one spot', 'red, moist, smelly patch'],
    cause: 'A dirty, unbrushed coat traps moisture against the skin.', treat: { kind: 'course', what: 'Cleaning + medicated spray', price: 40, doses: 5, every: 24 },
    advice: 'Brush regularly and dry the coat after baths and walks in the rain.',
  },
  stress: {
    name: 'Stress & boredom', icon: '😣', weight: 30, worsen: 0.008, heal: 0.04, selfHeal: true,
    symptoms: { cat: ['over-grooming bald patches', 'hiding', 'scratching furniture'], dog: ['chewing things', 'barking and whining', 'pacing'], hamster: ['chewing the bars', 'pacing the same path', 'jumpy'] },
    cause: 'Not enough play, exercise and company.', treat: { kind: 'care', what: 'Daily play, exercise and enrichment' },
    advice: 'Play every day; give dogs walks, cats hunting games and hamsters a big tank to explore.',
  },
  overweight: {
    name: 'Overweight', icon: '⚖️', weight: 25, worsen: 0, heal: 0, bcs: true,
    symptoms: ['hard to feel the ribs', 'no waist', 'tires quickly'],
    cause: 'More food than it burns (big portions, too many treats, little exercise).', treat: { kind: 'care', what: 'Measured portions, fewer treats, more exercise' },
    advice: 'Weigh portions and keep treats under ~10% of the diet.',
  },
  teeth: {
    species: ['hamster'], name: 'Overgrown teeth', icon: '🦷', weight: 45, worsen: 0.004, heal: 0.05,
    symptoms: ['dropping food', 'drooling', 'losing weight'],
    cause: 'Hamster teeth never stop growing; without things to gnaw they overgrow.', treat: { kind: 'procedure', what: 'Teeth trim', price: 35 },
    advice: 'Always leave a safe wooden chew in the tank.',
  },
  fleas: {
    species: ['cat', 'dog'], name: 'Fleas', icon: '🦟', weight: 20, worsen: 0.004, heal: 0.04,
    symptoms: ['scratching and biting at the fur', 'black specks (flea dirt) in the coat'],
    cause: 'No regular flea treatment.', treat: { kind: 'course', what: 'Flea treatment for the pet and home', price: 25, doses: 2, every: 24 },
    advice: 'Use a vet-recommended flea and worm treatment regularly.',
  },
  catflu: {
    species: ['cat'], name: 'Cat flu (upper respiratory infection)', icon: '🤧', weight: 40, worsen: 0.01, heal: 0.02, random: 0.0006,
    symptoms: ['sneezing', 'runny eyes and nose', 'off food (can\'t smell it)'],
    cause: 'Viruses that spread between cats; vaccination protects.', treat: { kind: 'course', what: 'Supportive care, eye drops, antibiotics if needed', price: 45, doses: 6, every: 24 },
    advice: 'Keep your cat\'s vaccinations up to date.',
  },
  kennelcough: {
    species: ['dog'], name: 'Kennel cough', icon: '🤧', weight: 30, worsen: 0.008, heal: 0.025, random: 0.0005,
    symptoms: ['honking cough', 'gagging', 'tired'],
    cause: 'Infection caught from other dogs; vaccination reduces it.', treat: { kind: 'course', what: 'Rest + cough medicine', price: 40, doses: 5, every: 24 },
    advice: 'Keep vaccinations up to date.',
  },
  resp: {
    species: ['hamster'], name: 'Respiratory infection', icon: '🤧', weight: 50, worsen: 0.012, heal: 0.02, random: 0.0002,
    symptoms: ['sneezing', 'clicking breathing', 'wet nose'],
    cause: 'Draughts, damp or dusty bedding, or a cold room.', treat: { kind: 'course', what: 'Antibiotics from an exotics vet', price: 45, doses: 5, every: 24 },
    advice: 'Use dust-free paper bedding and keep the tank out of draughts.',
  },
};

export function defaultHealth(now = Date.now()) {
  return {
    score: 100, bcs: 5,
    conds: {},                   // id → { since, sev, dx (diagnosed), course: {given, doses, nextAt}, treated }
    neglect: { hungry: 0, thirsty: 0, dirty: 0, unbrushed: 0, bored: 0, held: 0, nochew: 0 },
    vaccinatedAt: now,           // pets come from the shop/rescue vaccinated
    parasiteAt: now,
    checkupAt: now,
    lastChewAt: now,
    fedToday: { day: null, kcal: 0 },
    log: [],
  };
}

export function normalizeHealth(h) {
  const d = defaultHealth();
  return { ...d, ...h, neglect: { ...d.neglect, ...(h?.neglect || {}) }, conds: { ...(h?.conds || {}) }, log: (h?.log || []).slice(-30) };
}

const longCoat = (breed) => breed.coat === 'long' || breed.coat === 'double';

export function symptomsOf(id, species) {
  const s = CONDITIONS[id].symptoms;
  return Array.isArray(s) ? s : s[species] || [];
}

/** Worst current severity (0..1). */
export function worst(h) { return Math.max(0, ...Object.values(h.conds).map((c) => c.sev)); }

export function healthLabel(h) {
  const s = h.score;
  return s >= 85 ? 'Healthy' : s >= 65 ? 'A bit off' : s >= 40 ? 'Unwell' : s >= 20 ? 'Seriously ill' : 'Critical';
}

/** Is preventive care overdue? (days) */
export function prevention(pet) {
  const h = pet.health; const now = Date.now();
  const out = [];
  if (pet.species !== 'hamster') {
    const vd = (now - h.vaccinatedAt) / DAY;
    if (vd > 365) out.push({ id: 'vaccine', overdue: Math.round(vd - 365), text: 'Vaccination booster overdue' });
    const pd = (now - h.parasiteAt) / DAY;
    if (pd > 30) out.push({ id: 'parasite', overdue: Math.round(pd - 30), text: 'Flea & worm treatment due' });
  }
  const cd = (now - h.checkupAt) / DAY;
  if (cd > 365) out.push({ id: 'checkup', overdue: Math.round(cd - 365), text: 'Yearly health check due' });
  return out;
}

function addCond(pet, id, sev = 0.15, now = Date.now()) {
  const h = pet.health;
  if (h.conds[id]) return null;
  const def = CONDITIONS[id];
  if (def.species && !def.species.includes(pet.species)) return null;
  h.conds[id] = { since: now, sev, dx: false, treated: false };
  h.log.push({ t: now, text: `Started showing signs: ${symptomsOf(id, pet.species)[0]}` });
  return id;
}

/**
 * Advance one pet's health by `hours` of real time.
 * @param {object} pet  pet record (needs, litter, bladder, health …)
 * @param {object} breed
 * @param {number} hours
 * @param {{stage: string, offline?: boolean, rates?: object}} ctx
 * @returns {string[]} ids of conditions that just started
 */
export function tickHealth(pet, breed, hours, ctx) {
  if (!(hours > 0)) return [];
  const h = pet.health;
  const n = pet.needs;
  const nl = h.neglect;
  const sp = pet.species;
  const started = [];
  const now = ctx.now ?? Date.now();
  const add = (p, id, sev) => addCond(p, id, sev, now);

  // --- how long has each kind of neglect been going on (hours)
  const track = (key, bad) => { nl[key] = bad ? nl[key] + hours : Math.max(0, nl[key] - hours * 2); };
  track('hungry', n.food < 12);
  track('thirsty', n.water < 12);
  track('dirty', pet.litter > 75);
  track('unbrushed', n.groom < 20);
  track('bored', n.play < 15);
  track('held', sp === 'dog' && !pet.out && pet.bladder < -30);
  nl.nochew = sp === 'hamster' ? (Date.now() - (h.lastChewAt || Date.now())) / H : 0;

  // --- causes → conditions (thresholds in real hours)
  const stress = nl.bored > 12 || nl.dirty > 12 || pet.bond < 10;
  if (nl.thirsty > (sp === 'hamster' ? 4 : 8)) started.push(add(pet, 'dehydration'));
  if (nl.hungry > (sp === 'hamster' ? 8 : 16)) started.push(add(pet, 'malnutrition'));
  if (sp === 'cat' && nl.hungry > 36) started.push(add(pet, 'lipidosis', 0.25));
  if (sp === 'cat' && nl.dirty > 24 && (stress || Math.random() < 0.5)) started.push(add(pet, 'cystitis'));
  if (sp === 'dog' && nl.held > 2) started.push(add(pet, 'uti'));
  if (sp === 'hamster' && nl.dirty > 18 && stress) started.push(add(pet, 'wettail', 0.25));
  if (longCoat(breed) && sp !== 'hamster' && nl.unbrushed > (breed.coat === 'long' ? 36 : 60)) started.push(add(pet, 'matted'));
  if (sp === 'dog' && nl.unbrushed > 72) started.push(add(pet, 'hotspots'));
  if (nl.bored > 24) started.push(add(pet, 'stress'));
  if (sp === 'hamster' && nl.nochew > 24 * 14) started.push(add(pet, 'teeth'));
  if (sp !== 'hamster' && (Date.now() - h.parasiteAt) / DAY > 45 && Math.random() < hours * 0.01) started.push(add(pet, 'fleas'));
  // Infections: rare; much more likely when unvaccinated, run-down, very young or old.
  const vaccinated = sp === 'hamster' || (Date.now() - h.vaccinatedAt) / DAY < 365;
  const frail = (ctx.stage === 'baby' || ctx.stage === 'senior' ? 1.8 : 1) * (h.score < 50 ? 2 : 1);
  for (const [id, def] of Object.entries(CONDITIONS)) {
    if (!def.random || (def.species && !def.species.includes(sp))) continue;
    if (Math.random() < hours * def.random * (vaccinated ? 0.15 : 1) * frail) started.push(add(pet, id));
  }

  // --- body condition (BCS 1–9): over/under-feeding moves it slowly (days)
  if (n.food > 92 && (pet.overfed || 0) > 0) h.bcs = Math.min(9, h.bcs + hours * 0.02 * pet.overfed);
  else if (nl.hungry > 4) h.bcs = Math.max(1, h.bcs - hours * 0.02);
  else if (n.play > 60 && h.bcs > 5) h.bcs = Math.max(5, h.bcs - hours * 0.004);
  else if (h.bcs < 5 && n.food > 50) h.bcs = Math.min(5, h.bcs + hours * 0.01);
  pet.overfed = Math.max(0, (pet.overfed || 0) - hours * 0.1);
  if (h.bcs >= 7) started.push(add(pet, 'overweight'));
  if (h.conds.overweight) { h.conds.overweight.sev = clamp((h.bcs - 6) / 3, 0, 1); if (h.bcs < 6.5) remove(pet, 'overweight'); }

  // --- progress existing conditions
  const causeGone = {
    dehydration: n.water > 40, malnutrition: n.food > 40 && nl.hungry === 0, stress: n.play > 50 && nl.bored === 0,
    matted: false, teeth: false,
  };
  for (const [id, c] of Object.entries(h.conds)) {
    const def = CONDITIONS[id];
    if (def.bcs) continue;
    const course = c.course;
    const onMeds = course && course.given > 0;
    const healing = c.treated || (def.selfHeal && causeGone[id]) || (def.treat.kind === 'care' && causeGone[id]);
    if (healing) {
      // Late medicine doses slow recovery.
      const late = course && course.given < course.doses && Date.now() > course.nextAt + 6 * H;
      c.sev -= def.heal * hours * (late ? 0.3 : 1);
    } else if (onMeds) {
      c.sev -= def.heal * hours * 0.5;
    } else {
      c.sev += def.worsen * hours * (h.score < 40 ? 1.3 : 1);
    }
    c.sev = clamp(c.sev, 0, 1);
    if (c.sev <= 0) remove(pet, id, true);
  }

  // --- health score drifts toward what the conditions allow
  let target = 100;
  for (const [id, c] of Object.entries(h.conds)) target -= CONDITIONS[id].weight * c.sev;
  if (h.bcs <= 3) target -= (4 - h.bcs) * 8;
  if (ctx.stage === 'senior') target -= 4;
  target = clamp(target);
  h.score = clamp(h.score + (target - h.score) * Math.min(1, hours * 0.6));
  return started.filter(Boolean);
}

function remove(pet, id, recovered = false) {
  const h = pet.health;
  if (!h.conds[id]) return;
  delete h.conds[id];
  if (recovered) h.log.push({ t: Date.now(), text: `Recovered from ${CONDITIONS[id].name.toLowerCase()}` });
}

// ---------------------------------------------------------------- the vet
/** Consultation: names every condition (symptoms → diagnosis) and gives advice. */
export function diagnose(pet) {
  const h = pet.health;
  for (const c of Object.values(h.conds)) c.dx = true;
  h.log.push({ t: Date.now(), text: 'Vet consultation' });
  return Object.keys(h.conds);
}

/** Start/do the treatment for a diagnosed condition. */
export function treat(pet, id) {
  const h = pet.health; const c = h.conds[id]; const def = CONDITIONS[id];
  if (!c || !c.dx) return { ok: false, why: 'The vet needs to examine first' };
  if (def.treat.kind === 'care') return { ok: false, why: def.treat.what };
  if (def.treat.kind === 'procedure') {
    c.treated = true; c.sev = Math.min(c.sev, 0.3);
    h.log.push({ t: Date.now(), text: `${def.treat.what} at the vet` });
    return { ok: true, text: `${def.treat.what} — done. ${pet.name} will feel better over the next hours.` };
  }
  c.course = { doses: def.treat.doses, given: 1, every: def.treat.every, nextAt: Date.now() + def.treat.every * H };
  c.treated = true;
  h.log.push({ t: Date.now(), text: `Started ${def.treat.what.toLowerCase()} (${def.treat.doses} doses, every ${def.treat.every} h)` });
  return { ok: true, text: `First dose given at the clinic. Give the rest at home: ${def.treat.doses - 1} more, one every ${def.treat.every} hours.` };
}

/** Medicine due now (at home). */
export function dosesDue(pet) {
  return Object.entries(pet.health.conds)
    .filter(([, c]) => c.course && c.course.given < c.course.doses)
    .map(([id, c]) => ({ id, c, due: Date.now() >= c.course.nextAt - 0.5 * H, late: Date.now() > c.course.nextAt + 6 * H }));
}

export function giveDose(pet, id) {
  const c = pet.health.conds[id];
  if (!c?.course || c.course.given >= c.course.doses) return { ok: false, why: 'No medicine due' };
  if (Date.now() < c.course.nextAt - 0.5 * H) {
    const hrs = Math.ceil((c.course.nextAt - Date.now()) / H);
    return { ok: false, why: `Not yet — the next dose is due in about ${hrs} h. Doubling up on medicine is dangerous.` };
  }
  c.course.given += 1;
  c.course.nextAt = Date.now() + c.course.every * H;
  if (c.course.given >= c.course.doses) pet.health.log.push({ t: Date.now(), text: `Finished the course for ${CONDITIONS[id].name.toLowerCase()}` });
  return { ok: true, left: c.course.doses - c.course.given };
}

/** Health-driven behaviour knobs for the pet brains (1 = normal). */
export function vitality(pet) {
  const s = pet.health?.score ?? 100;
  return { speed: 0.55 + 0.45 * Math.min(1, s / 80), energy: s < 60 ? 1 + (60 - s) / 40 : 1, playful: s >= 50, appetite: s < 40 ? 0.5 : 1 };
}
