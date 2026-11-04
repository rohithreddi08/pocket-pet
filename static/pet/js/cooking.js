// ============================================================================
// cooking.js — home-cooked pet food: ingredients, recipes, hazards.
// ----------------------------------------------------------------------------
// Real cooking takes real time here: you wash your hands, pick safe
// ingredients, trim bones, chop, cook until the centre reaches a safe
// temperature, let it cool, add the vet supplement and weigh out portions.
//
// Nutrition notes the recipes follow (see the Care Guide sources):
//  • Cats are obligate carnivores: meat/fish first, few carbs, and a
//    vet-formulated supplement (taurine, calcium) is essential — home-made
//    diets without one are not balanced.
//  • Dogs do well on lean meat + cooked grains/veg + a supplement.
//  • Everything is cooked plain: no onion, garlic, salt, spices; no cooked
//    bones (they splinter).
// ============================================================================

// kcal per 100 g as served (cooked).
export const INGREDIENTS = {
  chicken:  { name: 'Chicken breast', icon: '🍗', price: 8, kcal: 165, prep: 'trim', grams: 300 },
  turkey:   { name: 'Turkey mince',   icon: '🦃', price: 9, kcal: 190, prep: 'none', grams: 300 },
  fish:     { name: 'White fish fillet', icon: '🐟', price: 9, kcal: 90, prep: 'debone', grams: 250 },
  beef:     { name: 'Lean beef mince', icon: '🥩', price: 10, kcal: 215, prep: 'none', grams: 300 },
  egg:      { name: 'Eggs',           icon: '🥚', price: 3, kcal: 155, prep: 'crack', grams: 100 },
  rice:     { name: 'Rice',           icon: '🍚', price: 3, kcal: 130, prep: 'rinse', grams: 200, dogOnly: true },
  oats:     { name: 'Oats',           icon: '🌾', price: 3, kcal: 70,  prep: 'none', grams: 150, dogOnly: true },
  pumpkin:  { name: 'Pumpkin',        icon: '🎃', price: 3, kcal: 26,  prep: 'chop', grams: 100 },
  sweetpot: { name: 'Sweet potato',   icon: '🍠', price: 3, kcal: 90,  prep: 'chop', grams: 100 },
  carrot:   { name: 'Carrots',        icon: '🥕', price: 2, kcal: 35,  prep: 'chop', grams: 100, dogOnly: true },
  beans:    { name: 'Green beans',    icon: '🫛', price: 2, kcal: 31,  prep: 'chop', grams: 100, dogOnly: true },
  berries:  { name: 'Blueberries',    icon: '🫐', price: 4, kcal: 57,  prep: 'rinse', grams: 50, dogOnly: true },
  catvit:   { name: 'Cat diet supplement (taurine + calcium)', icon: '💊', price: 6, kcal: 0, prep: 'none', grams: 5, catOnly: true },
  dogvit:   { name: 'Dog diet supplement (calcium + vitamins)', icon: '💊', price: 6, kcal: 0, prep: 'none', grams: 5, dogOnly: true },
  broccoli: { name: 'Broccoli',       icon: '🥦', price: 2, kcal: 35,  prep: 'chop', grams: 100, for: ['dog', 'hamster'] },
  cucumber: { name: 'Cucumber',       icon: '🥒', price: 2, kcal: 15,  prep: 'chop', grams: 100, for: ['hamster'] },
};

/** Can this ingredient go in food for that species? */
export function ingredientFor(f, species) {
  if (f.for) return f.for.includes(species);
  if (species === 'hamster') return !f.catOnly && !f.dogOnly && ['egg', 'pumpkin', 'sweetpot', 'chicken'].some((k) => INGREDIENTS[k] === f);
  return !(species === 'dog' && f.catOnly) && !(species === 'cat' && f.dogOnly);
}

// Things in a human kitchen that must never go in pet food.
export const HAZARDS = {
  onion:     { name: 'Onion', icon: '🧅', why: 'Onions (raw, cooked or powdered) damage red blood cells in cats and dogs.' },
  garlic:    { name: 'Garlic', icon: '🧄', why: 'Garlic is even more toxic than onion to cats and dogs.' },
  grapes:    { name: 'Grapes', icon: '🍇', why: 'Grapes and raisins can cause sudden kidney failure in dogs (and are risky for cats).' },
  chocolate: { name: 'Chocolate', icon: '🍫', why: 'Chocolate contains theobromine — toxic to dogs and cats.' },
  salt:      { name: 'Salt', icon: '🧂', why: 'Pet food should be unseasoned — too much salt is dangerous for pets.' },
  chilli:    { name: 'Chilli', icon: '🌶️', why: 'Spicy food upsets pets\' stomachs. Keep it plain.' },
  milk:      { name: 'Milk', icon: '🥛', why: 'Most adult cats and many dogs are lactose-intolerant: milk causes upset tummies.' },
  bones:     { name: 'Cooked bones', icon: '🦴', why: 'Cooked bones splinter and can choke or tear the gut. Always debone.' },
};

/**
 * items: [ingredient id, grams used]. cook: method + real seconds on the hob.
 * makes: 'meal' (portions in the fridge) or a treat id + count.
 */
export const RECIPES = {
  // ------------------------------------------------------------- cats
  cat_chicken: {
    species: 'cat', name: 'Poached chicken & pumpkin', icon: '🍲',
    items: [['chicken', 300], ['pumpkin', 60], ['catvit', 5]],
    cook: { method: 'Poach the chicken', seconds: 150, temp: 74 },
    note: 'Mostly meat — cats are obligate carnivores. Pumpkin adds a little fibre.',
  },
  cat_fish: {
    species: 'cat', name: 'Steamed fish & egg', icon: '🐟',
    items: [['fish', 250], ['egg', 50], ['catvit', 5]],
    cook: { method: 'Steam the fish, boil the egg', seconds: 120, temp: 63 },
    note: 'Fish once or twice a week is plenty; always remove pin bones.',
  },
  cat_turkey: {
    species: 'cat', name: 'Turkey & sweet potato', icon: '🥘',
    items: [['turkey', 300], ['sweetpot', 40], ['catvit', 5]],
    cook: { method: 'Brown the turkey', seconds: 140, temp: 74 },
    note: 'Just a spoon of sweet potato — cats need very few carbs.',
  },
  // ------------------------------------------------------------- dogs
  dog_chicken: {
    species: 'dog', name: 'Chicken, rice & carrots', icon: '🍲',
    items: [['chicken', 300], ['rice', 200], ['carrot', 100], ['dogvit', 5]],
    cook: { method: 'Simmer chicken & rice', seconds: 180, temp: 74 },
    note: 'A classic, gentle dog meal.',
  },
  dog_turkey: {
    species: 'dog', name: 'Turkey & sweet-potato stew', icon: '🥘',
    items: [['turkey', 300], ['sweetpot', 100], ['beans', 100], ['dogvit', 5]],
    cook: { method: 'Stew everything', seconds: 180, temp: 74 },
    note: 'Lean turkey with fibre-rich veg.',
  },
  dog_beef: {
    species: 'dog', name: 'Beef, oats & pumpkin', icon: '🍛',
    items: [['beef', 300], ['oats', 150], ['pumpkin', 100], ['dogvit', 5]],
    cook: { method: 'Brown the beef, cook the oats', seconds: 160, temp: 71 },
    note: 'Use lean mince and drain the fat.',
  },
  dog_bites: {
    species: 'dog', name: 'Pumpkin & blueberry bites (treats)', icon: '🍪',
    items: [['pumpkin', 100], ['oats', 150], ['egg', 50], ['berries', 50]],
    cook: { method: 'Bake', seconds: 150, temp: 75 },
    makes: { treat: 'bites', count: 10 },
    note: 'Training treats. Still count toward the daily treat limit.',
  },
  // ------------------------------------------------------------- hamsters
  ham_fresh: {
    species: 'hamster', name: 'Egg & veggie fresh mix', icon: '🥗',
    items: [['egg', 20], ['broccoli', 30], ['cucumber', 30]],
    cook: { method: 'Hard-boil the egg, lightly steam the broccoli', seconds: 90, temp: 72 },
    makes: { treat: 'hfresh', count: 8 },
    note: 'Fresh food is a small daily extra (about a teaspoon), not the main diet. Chop it tiny, and remove anything uneaten next morning — hamsters hoard, and fresh food goes off in the nest.',
  },
};

export function recipeKcal100(r) {
  let kcal = 0; let g = 0;
  for (const [id, grams] of r.items) { kcal += INGREDIENTS[id].kcal * grams / 100; g += grams; }
  return Math.round(kcal / g * 100);
}

export function recipeGrams(r) { return r.items.reduce((s, [, g]) => s + g, 0); }

/** Ingredients still missing from the pantry. */
export function missingFor(r, pantry) {
  return r.items.filter(([id]) => !(pantry[id] > 0)).map(([id]) => id);
}

/** Fresh home-cooked food keeps ~3 days in the fridge. */
export const FRIDGE_DAYS = 3;
