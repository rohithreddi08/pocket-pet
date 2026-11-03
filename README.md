# 🐾 Pocket Pet

A cozy 3D virtual cat for hostel residents and busy students. No mess, no dorm
rules, no cost — a little companion that lives in your browser (and on your
phone's home screen).

## What you can do
| Room | Things to do |
|---|---|
| 🛋️ **Living room** | Throw the ball and watch it chase · laser pointer (hold & drag on the floor) · mini-games |
| 🍳 **Kitchen** | Open the fridge and feed it — loves fish, hates broccoli, chili is… spicy · buy groceries |
| 🛁 **Bathroom** | Scrub with the sponge to lather foam, rinse in the shower, watch it shake dry |
| 🛏️ **Bedroom** | Lights off → it curls up in its bed and sleeps (energy refills) · focus timer for studying |

Everywhere:
- **🎙️ Talk** — say something and your cat repeats it in a squeaky cat voice.
- **Touch** — tap the head (purrs), belly (giggles), tail (annoyed); stroke to pet;
  poke it too much and it gets grumpy and turns away.
- **Needs** — food, energy, fun and cleanliness drift in real time, even while
  the app is closed (capped at 12 h). Thought bubbles tell you what it wants.
- **Coins, XP & levels** — earned from care, mini-games, focus sessions and a
  daily treat streak. Spend them on food, hats (bow, party hat, beanie, flower,
  wizard hat, crown) and room colour themes.
- **Mini-games** — *Purr-fect Memory* (repeat the sequence) and *Fish Frenzy*
  (catch treats, dodge boots).
- **Works offline / installable** — it's a PWA; progress is saved on the device.

Swipe left/right (or use the ‹ › arrows) to move between rooms — the cat walks
through the doorways with you.

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
