# 🐾 Pocket Pet

A cozy 3D virtual cat for hostel residents and busy students. No mess, no dorm
rules, no cost — a little companion that lives in your browser (and on your
phone's home screen).

## 🏪 Pet Store — raise several pets
Tap your profile (top left) or 🏪 to open the **Pet Store**. It has **Cats**, **Dogs** and
**Hamsters** sections, with new animals every day from breeders and 🏠 rescues (low adoption fee —
adopt, don't shop). Your first adoption is free; your home holds up to 4 pets.

| Section | Breeds | Ages | 
|---|---|---|
| 🐈 Cats | Somali, Abyssinian, Domestic Longhair, Russian Blue, Domestic Shorthair (Indie cat) | kitten (2–4 months), young, adult, senior |
| 🐕 Dogs | Siberian Husky, Alaskan Malamute, Shiba Inu, Akita, Indie (Indian Pariah Dog), German Shepherd, Pug | puppy, young, adult, senior |
| 🐹 Hamsters | Syrian, Winter White dwarf, Roborovski dwarf | pup (6–9 weeks), young, adult, senior (18 months+) |

Models: Somali (DreamNoms), a separate low-poly **shorthair cat** (J-Toastie — it only ships
with an idle clip, so walk/trot/sit/lie/eat clips are generated from its skeleton in
`js/pet/clipSynth.js`), Quaternius' **Husky, Shiba, German Shepherd and Pug**, and a
**hamster** (Poly by Google). Breeds without their own model reuse the closest body plan
and say so on their store card.

Each animal has its own coat colour, sex and personality (playful, cuddly, shy,
independent, chatty, calm), and the store shows its energy, voice, grooming needs and
how well the breed copes with **flat / hostel life**. Pets **grow up in real time**: a
2-month kitten is small with a big head, eats 3–4 small meals and sleeps more; seniors
slow down and stop making big jumps. One pet is at home on screen at a time; the
others keep living their routine in the background — switch between them from your
profile.

## 🐹 Hamsters live in a proper tank
A hamster gets a glass tank in the living room (100 × 50 cm floor, deep bedding, a solid
wheel, a hide, a sand bath, a chew, a bowl and a bottle) and the camera zooms in on it.
- **Nocturnal**: asleep in the nest by day, busy from dusk — wheel-running, foraging,
  burrowing, sitting up to eat, stuffing its cheek pouches and hoarding in the nest,
  grooming, gnawing, sand-bathing, using one toilet corner.
- **Prey animal**: tap it while it sleeps and it wakes startled (and may nip); trust
  builds by ✋ offering your hand, treats from your palm, and only then gentle strokes.
- Care: ~1 tablespoon of mix a day (dwarfs less), fresh veg and a little protein,
  spot-clean the toilet corner, fresh sand (never a water bath), partial bedding changes
  no more than weekly. Cook a tiny egg & veggie mix in the kitchen.
- The model has no skeleton, so it moves as a whole (bob, sit up, curl, roll).
  Care guide sources: RSPCA, Blue Cross, ASPCA.

## 🐕 Dogs behave like dogs
- Fit your day (active morning and evening, asleep at night), follow you everywhere,
  greet you with a whole-body wiggle, bring you the ball, beg while you cook.
- **Walks** (🦮 in the living room): clip the lead, head out of the front door, and
  deal with what happens — sniff stops, wee breaks, picking up poo 🛍️, other dogs,
  squirrels, a thirsty dog. Then wipe muddy paws.
- **Toilet:** when the bladder is full the dog waits by the door and whines; puppies
  can't hold it long. If nobody comes it uses the pee pad — or has an accident
  (clean it up; never scold).
- **Training** (🎓): Sit, Down, Paw, Spin, Speak, Come. Give the cue; if the dog gets
  it right, reward within ~2 seconds. Short sessions (15 min/day), positive
  reinforcement only. Independent breeds learn slower; puppies faster.
- Body language: wag speed and height, tucked tail, ears back, the head tilt when you
  talk, calming signals (lip lick, turning away) when it's had enough. Most dogs love
  belly rubs once they trust you. No laser pointer for dogs (vets advise against it).

## 🍳 Cook real food
In the kitchen, **Cook** a vet-informed recipe for the pet at home (3 for cats, 4 for
dogs, including home-made training treats). It takes real time and effort, about
4–6 minutes:
1. Wash your hands.
2. Pick the ingredients. Onion, garlic, grapes, chocolate and other hazards are on the
   shelf too, and each one comes with an explanation.
3. Trim fat, pick out the bones, chop and rinse.
4. Cook on the hob in real time, stirring when it bubbles, until a thermometer shows
   the centre is safe (74 °C for chicken).
5. Let it cool below 40 °C.
6. Mix in the vet supplement (taurine and calcium for cats).
7. Weigh portions for *your* pet. Grams are worked out from its weight, age and the
   recipe's calories (RER = 70 × kg^0.75).

Serve one portion and fridge the rest; it keeps for 3 days, then it's thrown out. The
pot keeps cooking (and can burn) if you walk away. You get a quality score at the end.
Fresh ingredients are in the shop (🛒 → 🥕 Fresh).

## A cat that behaves like a real Somali
The cat lives its own life, based on documented Somali traits and general cat
behaviour (sources in the in-app 📖 guide):

- **Its own routine.** It eats from its bowl when hungry, drinks, uses the litter
  box, grooms after meals, explores, perches on the cat tree and sofa, watches
  birds through the window (and chatters at them), gets evening zoomies, and
  naps 12–16 h a day in short naps — most active at dawn and dusk, following
  your real clock.
- **Somali personality.** Very active and curious, follows you from room to
  room, greets you with head-rubs when you come home, kneads when content,
  chirps and trills more than it meows, fascinated by a dripping tap, fetches the
  ball. Affectionate but not a lap cat.
- **Real body language.** Tail up = happy; tail lashing + ears sideways =
  irritated; twitching tail tip = hunting; slow blinks = trust (blink back with 😌).
- **Petting has limits.** Cheeks and head are favourites. Keep stroking and you'll
  see the warning signs, then a swat. Belly = swat, unless trust is very high.
- **Trust (💗)** grows with meals, gentle petting, slow blinks and play; drops when
  you ignore its signals or neglect it.
- **Real care.** Cat-safe food only: measured meals in the bowl, a few treats a day,
  catnip (about 1 in 3 cats don't react, and it's random per cat). Fresh water,
  daily litter scooping, brushing for the long coat; baths are rarely needed and
  it tolerates them at best.
- **Talking.** It hears you: its ears turn, it looks at you, it may chirp back or
  come when called. Repeating your voice Talking-Tom-style is an optional
  *Cartoon mode* in Settings, because real cats don't do that.

| Room | Things to do |
|---|---|
| 🛋️ **Living room** | Ball (it chases and sometimes fetches) · laser (stalk → butt-wiggle → pounce) · treats · mini-games |
| 🍳 **Kitchen** | Fill the food bowl · fresh water · treats · groceries |
| 🛁 **Bathroom** | Brush · scoop the litter box · dripping tap · bath & rinse |
| 🛏️ **Bedroom** | Dim the lights (it may choose to nap) · treats · focus timer while it naps nearby |

Also: coins, XP and levels; daily treat streak; hats and room themes; mini-games
(*Purr-fect Memory*, *Fish Frenzy*). Works offline and installs as a PWA; progress
is saved on the device. Swipe or use the ‹ › arrows to change rooms. The cat
stays where it is (asleep, eating…) or follows you.

**Limits:** it's a simulation of documented behaviour, not a real animal. The cat
model has only 5 animations (idle, walk, sit down, sit, stand up). Lying down,
grooming, kneading and similar poses are approximated on top with procedural
motion, so a sleeping cat sits with its head down rather than curling up. The dogs are
low-poly models with their own set of animations; sitting is procedural, and they
sleep lying on their side. Some breeds share a model, recoloured and resized: Abyssinian
and Domestic Longhair use the Somali; Malamute uses the Husky; Akita and Indie use the
Shiba. The store says so on each of them. Walks are about 3× faster than real ones.

## Run
```bash
pip install -r requirements.txt
streamlit run app.py
```
`app.py` embeds the game. Use the **Open full screen** button for voice: browsers
only give microphone access to the top-level page. On a phone, open that link
and *Add to Home Screen*.

You can also serve `static/` with any web server and open `/pet/index.html`.
Microphone access needs `https://` or `localhost`.

## Project layout
```
app.py                  Streamlit launcher (embeds the game)
app_classic.py          the original Streamlit version (pet_engine.py, storage.py, minigames.py)
static/pet/             the game
  index.html styles.css manifest.json sw.js icons/
  js/main.js            boot, camera, input, game actions
  js/state.js           save file (profile + pets), needs, economy, shop catalogue
  js/species.js         pet store: species, breeds, coats, ages, personalities, nutrition
  js/cooking.js         ingredients, recipes, kitchen hazards
  js/audio.js           synthesized cat sounds + talk-back voice
  js/world/             House (rooms, furniture, lights), textures, particles
  js/pet/               Pet (cat brain), Dog (dog brain), Hamster (hamster brain + model),
                        factory (models, coats, ages, store thumbnails), clipSynth
                        (generated clips), Accessories (hats)
  js/ui/                HUD, sheets, tray, toasts; store.js (profile + pet store),
                        kitchen.js (cooking), outdoor.js (walks + training), guide.js
  models/               husky, shiba, german_shepherd, pug, cat_shorthair, hamster (.glb)
                        + CREDITS.txt
  js/games/             mini-games
static/cat/             cat engine shared with the game + the original 3D garden viewer
  CatLoader ClipRig BoneMap PoseLayer HeadTracker Procedural …
  assets/cat_rigged.glb the cat model
static/vendor/three/    three.js r160 (bundled so it works offline)
```

## Swapping the cat model
Put a **rigged, animated** cat at `static/cat/assets/cat_rigged.glb`. Everything is
auto-detected: nose direction and size, clips → poses by name (`Idle`, `Walk`,
`Run/Trot`, `Sit_Down`/`Sit_Idle`/`Stand_Up`, `Lie_Down`/`Sleep`, `Eat`,
`Jump/Pounce`, `Meow`, `Lick/Groom`, …), head / ear / eye / spine / tail bones,
blink & jaw blendshapes, hat placement. The browser console line `[ClipRig]`
shows which clip each pose uses. Check that the model's license allows serving
it from your app, and update the credit in `app.py`, the settings sheet and below.

## Credits
- Cat model: [Somali Cat Animated ver 1.2](https://sketchfab.com/3d-models/somali-cat-animated-ver-12-e185c3fd92b64c32b4515a32b29252fc)
  by [DreamNoms](https://sketchfab.com/DreamNoms), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Used unmodified (a stray helper cube in the file is skipped at load time).
- Dog models: [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html)
  by Quaternius, [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (Husky and Shiba Inu,
  converted to .glb; `static/pet/models/LICENSE-Quaternius.txt`). Lie-down / sleep / get-up
  clips are derived in code from the pack's own animation.
- Shorthair cat: [Cat](https://poly.pizza/m/DJ9rpAhrh3) by J-Toastie,
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Made matte and given generated clips at load time.
- [German Shepherd](https://poly.pizza/m/Hssa6NPc6W) by Quaternius, CC0, and
  [Characters Pug](https://poly.pizza/m/xvcUwuKl4c) by Quaternius, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
  (their backpacks are hidden at load time).
- [Hamster](https://poly.pizza/m/3YtzEQ5TVUP) by Poly by Google, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Full list: `static/pet/models/CREDITS.txt`.
- [three.js](https://threejs.org) r160, MIT license (`static/vendor/three/LICENSE`).
- Everything else (house, furniture, textures, sounds, icons) is generated in code.
