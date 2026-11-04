// ============================================================================
// guide.js — the in-app care guide for the pet at home (cat or dog), with the
// sources the simulation is based on.
// ============================================================================
import { h } from './dom.js';
import { breedOf, pronoun, ageLabel, ageMonths, stageName, weightKg, dailyKcal, mealsPerDay } from '../species.js';

const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
const row = (sign, meaning) => h('tr', {}, h('td', {}, sign), h('td', {}, meaning));

export function guideFor(game) {
  const pet = game.pet;
  const breed = breedOf(pet);
  const name = pet.name || 'your pet';
  const she = pronoun(pet); const her = pronoun(pet, 'obj');
  const facts = h('div', { class: 'facts' },
    h('span', {}, `🎂 ${ageLabel(ageMonths(pet))} · ${stageName(pet)}`),
    h('span', {}, `⚖️ ~${weightKg(pet)} kg`),
    h('span', {}, `🔥 ~${dailyKcal(pet)} kcal/day in ${mealsPerDay(pet)} meals`));
  const intro = [
    h('p', {}, `${name} is a ${breed.name}. ${breed.about}`),
    facts,
    breed.modelNote ? h('p', { class: 'muted small' }, `ℹ️ ${breed.modelNote}`) : null,
  ];
  return pet.species === 'dog' ? dogGuide(game, breed, name, she, her, intro) : catGuide(game, breed, name, she, her, intro);
}

function catGuide(game, breed, name, she, her, intro) {
  return h('div', { class: 'guide' },
    ...intro,
    h('h3', {}, '🕰️ A cat\'s day'),
    h('p', {}, `Cats sleep about 12–16 hours a day in many short naps (kittens and seniors even more), and are most active at dawn and dusk. You can't make a cat sleep; dim the lights and ${she} may choose to.`),
    h('h3', {}, '👀 Reading body language'),
    h('table', {},
      row('Tail straight up', 'Happy, confident, saying hello'),
      row('Tip of tail twitching', 'Focused — hunting, watching birds'),
      row('Tail lashing / thumping', 'Irritated or overstimulated — stop and give space'),
      row('Ears sideways (“airplane”)', 'Annoyed or uneasy'),
      row('Slow blink', 'Trust and affection — blink slowly back (😌 button)'),
      row('Head-butt / cheek rub', 'Marking you as “mine” — a big compliment'),
      row('Kneading + purring', 'Content and relaxed'),
      row('Belly on show', 'Trust — but NOT an invitation. Most cats swat if you touch it.')),
    h('h3', {}, '🤚 Petting'),
    h('p', {}, `Cheeks, chin and the top of the head are favourites; the back is usually fine. Avoid the tail, paws and belly. Every cat has a petting limit: watch for the tail lashing and ears turning sideways, then stop before ${she} swats.`),
    h('h3', {}, '✅ Daily care checklist'),
    h('ul', {},
      h('li', {}, `Measured meals in the bowl (${she} eats when hungry) + always-fresh water. Kittens need 3–4 small meals.`),
      h('li', {}, 'Scoop the litter box every day. A dirty box makes cats unhappy.'),
      h('li', {}, 'Play sessions every day. End laser play with something the cat can actually “catch”.'),
      h('li', {}, breed.coat === 'long' ? 'Brush the long coat a few times a week. Baths are rarely needed.' : 'A short coat needs only a quick weekly brush. Baths are rarely needed.'),
      h('li', {}, 'Treats: only a few a day (under ~10% of calories).')),
    h('h3', {}, '🍳 Home cooking for cats'),
    h('p', {}, 'Cats are obligate carnivores: home-made food should be mostly cooked meat or fish, with very few carbs, and it must include a vet-formulated supplement (taurine, calcium) — without one it isn\'t balanced. Cook plain, remove every bone, cool before serving, and keep it in the fridge for no more than 3 days. Ask your vet before switching to home-cooked food long-term.'),
    h('h3', {}, '⚠️ Never feed'),
    h('p', {}, 'Onions, garlic and chives (any form), chocolate, grapes and raisins, alcohol, caffeine, xylitol, cooked bones. Most adult cats are lactose-intolerant, so skip the saucer of milk.'),
    h('h3', {}, '🧪 What a simulation can\'t do'),
    h('p', {}, 'This is a model of documented behaviour, not a real animal: every cat has its own personality, and the 3D model only has a few animations, so lying down and some poses are approximated. Talk to a vet for real-life care.'),
    h('h3', {}, '📚 Sources'),
    h('ul', {},
      h('li', {}, a(breed.source[0], breed.source[1])),
      h('li', {}, a('https://cfa.org/breed/somali/', 'Cat Fanciers\' Association — Somali')),
      h('li', {}, a('https://www.hillspet.com/cat-care/nutrition-feeding/toxic-foods-for-cats', 'Hill\'s Pet — foods toxic to cats')),
      h('li', {}, a('https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets', 'ASPCA — people foods to avoid feeding your pets')),
      h('li', {}, a('https://en.wikipedia.org/wiki/Cat_behavior', 'Wikipedia — Cat behavior')),
      h('li', {}, a('https://www.rover.com/blog/how-much-do-cats-sleep/', 'Rover — how much cats sleep')),
      h('li', {}, a('https://countrygrovevet.ca/2025/10/10/how-to-read-cat-body-language-ears-eyes-and-tail-clues/', 'Country Grove Vet — reading body language')),
      h('li', {}, a('https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals', 'Merck Veterinary Manual — energy needs (RER = 70 × kg^0.75)'))),
  );
}

function dogGuide(game, breed, name, she, her, intro) {
  const stage = game.stage;
  const walkMins = stage === 'baby' ? `About 5 minutes per month of age, twice a day (${name}: ~${Math.max(10, Math.round(ageMonths(game.pet)) * 5)} min)`
    : breed.traits.energy > 0.85 ? 'At least 1–2 hours of exercise a day — this is a working breed'
      : stage === 'senior' ? 'Shorter, gentler walks, more often' : 'About 1 hour of walks and play a day';
  return h('div', { class: 'guide' },
    ...intro,
    h('h3', {}, '🕰️ A dog\'s day'),
    h('p', {}, `Dogs sleep 12–14 hours a day (puppies up to 18–20). Unlike cats they fit their people's routine: awake in the morning and evening, asleep at night. They are social animals: ${name} will follow you from room to room and wants to be included.`),
    h('h3', {}, '🦮 Walks & toilet'),
    h('ul', {},
      h('li', {}, walkMins + '.'),
      h('li', {}, 'Puppies can hold their bladder about 1 hour per month of age (max ~8 h for adults). Take them out after waking, eating and playing.'),
      h('li', {}, `When ${she} waits by the door and whines, ${she} needs to go out. If nobody takes ${her}, ${she}'ll use the pee pad — or have an accident.`),
      h('li', {}, 'Never punish accidents: dogs can\'t link a scolding to something done earlier. Clean with an enzyme cleaner and walk more often.'),
      h('li', {}, 'Always pick up after your dog on walks.')),
    h('h3', {}, '👀 Reading body language'),
    h('table', {},
      row('Loose, wide wag + wiggly body', 'Happy and friendly'),
      row('Tail high and stiff', 'Alert, aroused — give a moment'),
      row('Tail tucked, ears back', 'Scared or anxious'),
      row('Head tilt', 'Listening hard to you'),
      row('Lip licking, yawning, turning away', 'Calming signals: “that\'s enough, please”'),
      row('Growl', 'A warning — respect it and back off; never punish a growl'),
      row('Rolling over for a rub', 'Trust (most dogs love belly rubs when relaxed)')),
    h('h3', {}, '🎓 Training'),
    h('p', {}, 'Use positive reinforcement: mark the right behaviour and reward within 1–2 seconds. Keep sessions short (5–15 minutes) and fun; ignore mistakes rather than scolding. Puppies learn fast; independent breeds (Shiba, Akita, Malamute) need extra patience.'),
    h('h3', {}, '✅ Daily care checklist'),
    h('ul', {},
      h('li', {}, `Two measured meals (puppies 3–4) + fresh water always.`),
      h('li', {}, 'Walks and play every day; mental games and chew toys too.'),
      h('li', {}, breed.coat === 'double' ? 'Brush the double coat several times a week (daily when shedding). Bath about monthly or when muddy.' : 'Weekly brushing; bath when dirty.'),
      h('li', {}, 'Treats under ~10% of daily calories — use small pieces for training.'),
      h('li', {}, 'No laser pointers: they can trigger obsessive chasing in dogs. Play fetch or tug instead.')),
    h('h3', {}, '🍳 Home cooking for dogs'),
    h('p', {}, 'Lean meat, cooked grains or starchy veg and some vegetables make a good base, but home-made diets need a vet-formulated supplement (especially calcium) to be balanced. Cook plain — no salt, onion, garlic or spices — remove bones and fat, cool before serving, refrigerate for up to 3 days. Ask your vet before switching for good.'),
    h('h3', {}, '⚠️ Never feed'),
    h('p', {}, 'Chocolate, grapes and raisins, onions, garlic and chives, xylitol (sugar-free gum, some peanut butters), macadamia nuts, alcohol, caffeine, cooked bones.'),
    h('h3', {}, '🧪 What a simulation can\'t do'),
    h('p', {}, 'This is a model of documented dog behaviour, not a real animal: every dog is an individual. The dog model is low-poly and has a limited set of animations, so sitting is approximated. Talk to a vet for real-life care.'),
    h('h3', {}, '📚 Sources'),
    h('ul', {},
      h('li', {}, a(breed.source[0], breed.source[1])),
      h('li', {}, a('https://www.akc.org/expert-advice/lifestyle/why-do-dogs-sleep-so-much/', 'AKC — why do dogs sleep so much?')),
      h('li', {}, a('https://www.sleepfoundation.org/animals-and-sleep/how-much-do-dogs-sleep', 'Sleep Foundation — how much do dogs sleep?')),
      h('li', {}, a('https://www.akc.org/expert-advice/training/how-to-potty-train-a-puppy/', 'AKC — how to potty train a puppy')),
      h('li', {}, a('https://www.akc.org/expert-advice/advice/how-to-read-dog-body-language/', 'AKC — how to read dog body language')),
      h('li', {}, a('https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets', 'ASPCA — people foods to avoid feeding your pets')),
      h('li', {}, a('https://en.wikipedia.org/wiki/Dog_behavior', 'Wikipedia — Dog behavior')),
      h('li', {}, a('https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals', 'Merck Veterinary Manual — energy needs (RER = 70 × kg^0.75)'))),
  );
}
