// ============================================================================
// guide.js — the in-app care guide for the pet at home (cat or dog), with the
// sources the simulation is based on.
// ============================================================================
import { h } from './dom.js';
import { breedOf, pronoun, ageLabel, ageMonths, stageName, weightKg, dailyKcal, mealsPerDay, dailyFoodGrams } from '../species.js';

const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
const row = (sign, meaning) => h('tr', {}, h('td', {}, sign), h('td', {}, meaning));

export function guideFor(game) {
  const pet = game.pet;
  const breed = breedOf(pet);
  const name = pet.name || 'your pet';
  const she = pronoun(pet); const her = pronoun(pet, 'obj');
  const ham = pet.species === 'hamster';
  const facts = h('div', { class: 'facts' },
    h('span', {}, `🎂 ${ageLabel(ageMonths(pet))} · ${stageName(pet)}`),
    h('span', {}, ham ? `⚖️ ~${Math.round(weightKg(pet) * 1000) || Math.round(breed.kg[0] * 1000)} g` : `⚖️ ~${weightKg(pet)} kg`),
    h('span', {}, ham ? `🌾 ~${dailyFoodGrams(pet)} g of mix a day (~${dailyKcal(pet)} kcal)` : `🔥 ~${dailyKcal(pet)} kcal/day in ${mealsPerDay(pet)} meals`));
  const intro = [
    h('p', {}, `${name} is a ${breed.name}. ${breed.about}`),
    facts,
    breed.modelNote ? h('p', { class: 'muted small' }, `ℹ️ ${breed.modelNote}`) : null,
  ];
  if (ham) return hamsterGuide(game, breed, name, she, her, intro);
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

function hamsterGuide(game, breed, name, she, her, intro) {
  const syrian = game.pet.breed === 'syrian';
  return h('div', { class: 'guide' },
    ...intro,
    h('h3', {}, '🌙 A hamster\'s day'),
    h('p', {}, `Hamsters are nocturnal: ${name} sleeps in ${her === 'him' ? 'his' : 'her'} nest through the day and wakes around dusk, then is busy for most of the night — running several kilometres on the wheel, foraging, burrowing and hoarding. Don't wake a sleeping hamster: it is stressful and the usual reason hamsters bite. Spend time with ${her} in the evening.`),
    h('h3', {}, '🏠 The home'),
    h('ul', {},
      h('li', {}, 'Floor space of at least 100 × 50 cm (bigger is better) — most pet-shop cages are far too small.'),
      h('li', {}, 'Deep bedding (15–20 cm+) of paper or aspen so it can dig tunnels; no cotton-wool "fluff" (it tangles legs and blocks guts) and no scented or cedar/pine shavings.'),
      h('li', {}, `A solid-surface wheel big enough that the back stays straight: ${syrian ? '28 cm or more for a Syrian' : 'about 20 cm or more for a dwarf'}.`),
      h('li', {}, 'At least one hide/nest box, a sand bath (chinchilla sand, not dust), chew toys, and a water bottle or bowl.'),
      h('li', {}, 'Somewhere quiet and away from direct sun, radiators and draughts — and probably not your bedroom: the wheel runs all night.'),
      h('li', {}, 'One hamster per tank. Syrians always live alone; even dwarf pairs often end up fighting.')),
    h('h3', {}, '👀 Reading body language'),
    h('table', {},
      row('Standing up on hind legs', 'Curious — sniffing the air, checking something out'),
      row('Freezing still', 'Alert or scared; give it a moment'),
      row('Cheeks bulging', 'Pouches full of food — it will carry it to its hoard'),
      row('Washing face and ears', 'Relaxed and comfortable'),
      row('Ears flat, on its back, teeth showing', 'Frightened and defensive — back off'),
      row('Chewing the cage bars', 'Bored or stressed — usually a sign the home is too small'),
      row('Squeaking', 'Fear or pain')),
    h('h3', {}, '✋ Taming and handling'),
    h('p', {}, `Let ${name} settle for a few days first. Then rest your hand in the tank and let ${her} come and sniff it; offer treats from your palm. When ${she} climbs on, scoop ${her} up with two cupped hands, low over a soft surface — never grab from above (that's how predators attack). Short sessions, every evening. Robos are usually too fast and nervous to handle much.`),
    h('h3', {}, '🍽️ Food'),
    h('ul', {},
      h('li', {}, `A good hamster mix or pellets as the base: about ${dailyFoodGrams(game.pet)} g a day for ${name}, given in the evening. Scatter some in the bedding so ${she} can forage.`),
      h('li', {}, 'Small amounts of fresh veg most days (broccoli, cucumber, carrot, kale) and a little protein a few times a week (boiled egg, plain cooked chicken, mealworms).'),
      h('li', {}, 'Remove fresh food that isn\'t eaten — and check the hoard, so nothing rots in the nest.'),
      h('li', {}, 'Fresh water every day. Dwarf hamsters (especially Winter Whites) are prone to diabetes: little or no sugary fruit.')),
    h('h3', {}, '⚠️ Never feed'),
    h('p', {}, 'Onion, garlic, leeks, citrus, raw beans or potato, rhubarb, almonds (bitter), apple seeds, chocolate and sweets, sticky foods that can get stuck in the cheek pouches, and anything seasoned.'),
    h('h3', {}, '🧹 Cleaning'),
    h('p', {}, 'Spot-clean the toilet corner every day or two and refresh the sand. Change only part of the bedding every few weeks, and leave some old bedding and the nest: hamsters rely on familiar smells, and a full clean-out is stressful. Never bathe a hamster in water — it can get chilled and ill; the sand bath does the job.'),
    h('h3', {}, '🩺 Health'),
    h('p', {}, 'Hamsters hide illness. See an exotics vet for: a wet or dirty bottom ("wet tail" is an emergency), weight loss, overgrown teeth, lumps, or not eating. They live only 2–3 years, so a hamster over 18 months is a senior.'),
    h('h3', {}, '🧪 What a simulation can\'t do'),
    h('p', {}, 'This is a model of documented hamster behaviour, not a real animal. The 3D model has no skeleton, so legs, cheeks and whiskers don\'t move — the body is moved as a whole. Ask a vet for real-life care.'),
    h('h3', {}, '📚 Sources'),
    h('ul', {},
      h('li', {}, a(breed.source[0], breed.source[1])),
      h('li', {}, a('https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters', 'RSPCA — hamsters')),
      h('li', {}, a('https://www.aspca.org/pet-care/small-pet-care', 'ASPCA — small pet care')),
      h('li', {}, a('https://www.bluecross.org.uk/pet-advice/hamster-care', 'Blue Cross — hamster care')),
      h('li', {}, a('https://en.wikipedia.org/wiki/Golden_hamster', 'Wikipedia — Golden (Syrian) hamster'))),
  );
}
