# 🐾 Pocket Pet

A cozy 3D virtual cat for hostel residents and busy students. No mess, no dorm
rules, no cost — a little companion that lives in your browser (and on your
phone's home screen).

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

**Limits:** it's a simulation of documented behaviour, not a real animal. The 3D
model has only 5 animations (idle, walk, sit down, sit, stand up). Lying down,
grooming, kneading and similar poses are approximated on top with procedural
motion, so a sleeping cat sits with its head down rather than curling up.

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
  js/state.js           save file, needs, economy, shop catalogue
  js/audio.js           synthesized cat sounds + talk-back voice
  js/world/             House (rooms, furniture, lights), textures, particles
  js/pet/               Pet (behaviour + body language), Accessories (hats)
  js/ui/                HUD, sheets, tray, toasts
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
- [three.js](https://threejs.org) r160, MIT license (`static/vendor/three/LICENSE`).
- Everything else (house, furniture, textures, sounds, icons) is generated in code.
