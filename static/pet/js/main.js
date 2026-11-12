// ============================================================================
// main.js — boots the app and wires world, pet, input and UI together.
// You and your pet each have a room: the camera shows yours, the pet lives
// its own life around the house (and usually follows you). You can own
// several pets; one is at home on screen at a time.
// ============================================================================
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { normalizeName } from '../../cat/BoneMap.js';
import { House, ROOMS } from './world/House.js';
import { Outdoor } from './world/Outdoor.js';
import { Particles } from './world/Particles.js';
import { Accessories } from './pet/Accessories.js';
import { buildPet, disposePet } from './pet/factory.js';
import { Game, FOODS, THEMES, vitality, symptomsOf, CONDITIONS, setSun } from './state.js';
import { WORLD, onWorld, startWorld, noiseNow, fireworksTonight } from './world.js';
import { breedOf, pronoun } from './species.js';
import { Sound, Voice, audioContext } from './audio.js';
import { UI } from './ui/ui.js';
import { $ } from './ui/dom.js';

const HDR_URL = '../cat/assets/studio.hdr';

const progress = (p, text) => {
  $('#loadBar').style.width = `${Math.round(p * 100)}%`;
  if (text) $('#loadingText').textContent = text;
};

async function boot() {
  const game = new Game();
  const sound = new Sound();
  sound.enabled = game.s.settings.sound;
  const voice = new Voice();

  // -------------------------------------------------------------- renderer
  const canvas = $('#scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2340');
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);

  progress(0.1, 'Tidying the house…');
  const house = new House(scene);
  // The street outside: drawn first each frame, seen through the window openings; walks happen there.
  const outdoor = new Outdoor(renderer);
  scene.background = null;
  const fx = new Particles(scene);

  try {
    const hdr = await new RGBELoader().loadAsync(HDR_URL);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose(); pmrem.dispose();
  } catch (e) { console.warn('[pet] environment map failed; continuing without it', e); }

  const applyTheme = (id) => house.applyTheme((THEMES[id] || THEMES.cream).walls);
  applyTheme(game.s.theme);
  game.on('theme', applyTheme);

  // -------------------------------------------------------------- the pet
  // These are swapped when you switch pets (see spawnPet).
  let built = null; let pet = null; let root = null; let bones = null; let tracker = null; let layer = null;
  let hats = null;
  const petMeshes = [];

  async function spawnPet() {
    const record = game.pet;
    if (built) { pet.sound.purr(false); hats?.wear(null); disposePet(built, scene); }
    built = await buildPet(record, { scene, camera, house, fx, sound, voice, game });
    ({ pet, root, bones, tracker, layer } = built);
    pet._baseSpeed0 = pet.baseSpeed;
    hats = new Accessories(root, bones.head);
    hats.wear(game.s.hat);
    petMeshes.length = 0;
    root.traverse((o) => { if (o.isMesh) petMeshes.push(o); });
    house.setSpecies(record.species, built.length);
    house.setLitter(game.s.litter);
    house.setAccident(game.s.accident);
    syncBowls();
    pet.onHint = showHint;
    pet.setViewRoom(room);
    ui?.petChanged();
    window.pocketPet && Object.assign(window.pocketPet, { pet, rig: built.rig });
    return pet;
  }

  progress(0.35, `Waking up ${game.s.name || 'your pet'}…`);
  let room = game.s.room || 0;
  house.focusRoom(room);
  const syncBowls = () => house.setBowls(game.s.bowl.food, game.s.bowl.water, game.s.bowl.foodType === 'kibble' || game.s.bowl.foodType === 'dkibble' ? 'kibble' : 'wet');
  game.on('bowl', syncBowls);
  game.on('litter', () => house.setLitter(game.s.litter));
  game.on('accident', () => house.setAccident(game.s.accident));
  game.on('hat', (id) => { hats?.wear(id); if (id) setTimeout(() => pet.react('headshake'), 300); });
  let ui = null;
  await spawnPet();
  progress(0.8, 'Almost there…');

  const isDog = () => game.species === 'dog';
  const isHam = () => game.species === 'hamster';
  /** Too unwell to play? Says so and returns true. */
  const tooSick = () => {
    if (vitality(game.pet).playful) return false;
    ui.toast(`🤒 ${name()} is too unwell to play. Check 🩺 Health — a vet visit may be needed.`, 'big');
    return true;
  };
  const symptomLine = (id, p = game.pet) => `${p.name || 'Your pet'} is ${symptomsOf(id, p.species)[0]}`;
  const name = () => game.s.name || 'Your pet';
  const she = (k) => pronoun(game.pet, k);

  // Which part of the pet did we touch? (dominant bone of the hit triangle)
  function regionOf(hit) {
    const o = hit.object;
    if (!o.isSkinnedMesh || !hit.face) return 'body';
    const si = o.geometry.getAttribute('skinIndex');
    const sw = o.geometry.getAttribute('skinWeight');
    let best = 0; let bw = -1;
    for (let k = 0; k < 4; k += 1) {
      const w = sw.getComponent(hit.face.a, k);
      if (w > bw) { bw = w; best = si.getComponent(hit.face.a, k); }
    }
    const n = normalizeName(o.skeleton.bones[best]?.name || '');
    if (/\b(head|ear|eye|neck|jaw|whisker|nose)/.test(n)) return 'head';
    if (/\btail/.test(n)) return 'tail';
    if (/\b(thigh|heel|arm|paw|foot|leg|toe|hand|shin|calf)/.test(n) || /\bhip\b.*\b(l|r)\b/.test(n)) return 'leg';
    // Underside of the torso = belly.
    const nrm = hit.face.normal.clone().transformDirection(o.matrixWorld);
    const chestY = (bones.chest || bones.hip || root).getWorldPosition(new THREE.Vector3()).y;
    return nrm.y < -0.35 || hit.point.y < chestY * 0.8 ? 'belly' : 'body';
  }

  // -------------------------------------------------------------- UI + actions
  let focus = null;
  let showering = false;
  let ballPlay = 0;
  let laserOn = false;

  const laserDot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: '#ff1744', toneMapped: false }));
  laserDot.rotation.x = -Math.PI / 2; laserDot.visible = false; scene.add(laserDot);
  const laserGlow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: '#ff5252', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
  laserGlow.rotation.x = -Math.PI / 2; laserDot.add(laserGlow); laserGlow.position.z = -0.001;

  const showerHead = new THREE.Group();
  showerHead.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.12, 20), new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.9, roughness: 0.2 })));
  showerHead.visible = false; scene.add(showerHead);

  function goRoom(i) {
    if (i < 0 || i >= ROOMS.length || i === room) return;
    stopPlay();
    ui.closeTray();
    room = i;
    game.setRoom(i);
    ui.setRoom(i);
    house.focusRoom(i);
    pet.setViewRoom(i);
  }

  function stopPlay() {
    if (pet.act?.id === 'play') pet.stopChase();
    ballPlay = 0;
    laserOn = false; laserDot.visible = false;
  }

  /** Bring the pet to the room you're in (if it's willing), then do something. */
  function summon(then, speed = 1.3) {
    if (pet.room === room && !pet.travelling) { then(); return; }
    pet.interrupt(true);
    pet.goToRoom(room, then, speed);
  }

  const hintSeen = new Map();
  function showHint(msg) {
    const last = hintSeen.get(msg) || 0;
    if (Date.now() - last < 90000) return;
    hintSeen.set(msg, Date.now());
    ui.hint(msg);
  }

  const actions = {
    go: (d) => goRoom(room + d),
    goto: (i) => goRoom(i),
    celebrate: () => pet.celebrate(),
    species: () => game.species,
    fillBowl: (id) => {
      if (game.s.bowl.food > 70) { ui.toast('The bowl is still full'); return; }
      if (game.fillBowl(id)) {
        sound.pop();
        ui.toast(`${FOODS[id].icon} Bowl filled — ${name()} will eat when hungry`);
        game.addXp(2);
      }
    },
    serveMeal: (mealId, grams) => {
      const r = game.serveMeal(mealId, grams);
      if (!r.ok) { ui.toast(r.why); return r; }
      sound.pop();
      game.addXp(3);
      const verdict = r.ratio > 1.3 ? ' — that\'s more than one meal; overfeeding leads to weight gain.'
        : r.ratio < 0.7 ? ' — a bit small for a full meal.' : ' — a well-sized portion.';
      ui.toast(`🍲 ${r.grams} g of home-cooked food in the bowl${verdict}`, 'big');
      if (!pet.outside && !pet.sleeping && game.needs.food < 90) setTimeout(() => { if (!pet.act || pet.act.interruptible) { pet.interrupt(); pet._startBowl('food'); } }, 1200);
      return r;
    },
    refillWater: () => { game.refillWater(); sound.pop(); ui.toast('💧 Fresh water'); game.addXp(1); },
    treat: (id) => {
      const f = FOODS[id];
      if (pet.outside) { ui.toast(`${name()} is out`); return; }
      if (f.kind === 'treat' && game.treatsLeftToday() <= 0) {
        ui.toast(`That's enough treats for today — treats should stay under ~10% of a ${game.species}'s diet.`);
        if (pet.inView) pet.refuse();
        return;
      }
      ui.closeTray();
      const ok = pet.comeForTreat(() => {
        const got = game.useTreat(id);
        if (!got || got.refused) return;
        flyFood(f.icon);
        if (f.kind === 'catnip') {
          setTimeout(() => {
            const reacted = pet.catnip();
            if (!reacted) ui.hint('No reaction — about 1 in 3 cats aren\'t affected by catnip. It\'s genetic!');
          }, 600);
        } else {
          setTimeout(() => pet.eatTreat(f), 500);
        }
      });
      if (!ok) ui.toast(`${name()} is fast asleep 😴`);
      else if (pet.room !== room) ui.toast(`🔔 ${name()} heard the treat bag…`);
    },
    throwBall: () => {
      if (room !== 0 || isHam() || tooSick()) return;
      stopPlay();
      const b = house.ball;
      b.held = false;
      const away = new THREE.Vector3((Math.random() - 0.5) * 2, 0, -1);
      house.kickBall(away, 2.8);
      sound.boing();
      ballPlay = 18;
      if (pet.outside) return;
      if (pet.sleeping && game.bond < 30) { ui.toast(`${name()} opens one eye… and goes back to sleep.`); return; }
      if (pet.act?.id === 'toy') pet._endAct();
      summon(() => {
        pet.startChase(() => (b.held ? null : b.mesh.position), () => {
          game.addNeed('play', isDog() ? 7 : 5); game.addNeed('energy', -1.5); game.addXp(1);
          // Somalis often fetch; most dogs live for it (independent breeds less so).
          const fetchP = isDog() ? Math.min(0.92, 0.45 + game.bond / 200) * (pet.traits.independent > 0.8 ? 0.6 : 1) : (game.bond > 40 ? 0.45 : 0);
          if (Math.random() < fetchP) {
            b.held = true; b.vel.set(0, 0, 0);
            pet.fetch(b.mesh, () => {
              b.held = false;
              b.mesh.position.y = b.r;
              house.kickBall(camera.position.clone().sub(b.mesh.position).setY(0), 0.8);
              ui.toast(`${name()} brought the ball back! Tap it to throw again.`);
              game.addBond(0.5);
            });
            ballPlay = 0;
          } else {
            const dir = b.mesh.position.clone().sub(root.position).setY(0);
            dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
            house.kickBall(dir, 2.2 + Math.random() * 1.2);
          }
        }, pet.len * 0.45, 1.5 * Math.sqrt(pet.len / 1.55));
      });
    },
    toggleLights: () => {
      const r = house.rooms[room];
      house.setLights(room, !r.lightsOn);
      sound.click();
      pet.lightsChanged(room, r.lightsOn);
    },
    scoop: () => {
      if (isHam()) {
        if (game.scoop()) { sound.squish(); ui.toast('🧹 Toilet corner spot-cleaned — do this every day or two. Leave the rest of the bedding: it smells of home.'); }
        else ui.toast('The toilet corner is clean ✨');
        return;
      }
      if (game.scoop()) { sound.squish(); ui.toast(isDog() ? '🧻 Fresh pee pad down' : '🧹 Litter box scooped — do this daily'); }
      else ui.toast(isDog() ? 'The pad is clean ✨' : 'The litter box is already clean ✨');
    },
    // --- hamsters ---------------------------------------------------------------
    freshSand: () => {
      const day = new Date().toISOString().slice(0, 10);
      if (game.s.sandDay === day) { ui.toast('The sand bath is already fresh today ✨'); return; }
      game.s.sandDay = day;
      game.addNeed('groom', 12); game.addXp(2); sound.squish();
      ui.toast('⏳ Fresh chinchilla/hamster sand (not dust!) in the bath. Hamsters clean their coat by rolling in it — never bathe a hamster in water.', 'big');
    },
    changeBedding: () => {
      const last = game.s.beddingAt || 0;
      const days = (Date.now() - last) / 864e5;
      if (days < 7) {
        ui.toast(`Only ${Math.max(1, Math.round(days))} day${Math.round(days) === 1 ? '' : 's'} since the last change — full clean-outs stress hamsters. Spot-clean instead; change part of the bedding every few weeks.`, 'big');
        return;
      }
      game.s.beddingAt = Date.now();
      game.s.litter = 0; game.emit('litter');
      game.addBond(-1); game.addXp(4); sound.squish();
      ui.toast('🛏️ Bedding refreshed. Tip: keep a handful of the old bedding and the nest — it keeps the tank smelling like home.', 'big');
    },
    toggleTap: () => {
      const on = house.toggleTap();
      sound.click();
      if (on && pet.room === 2 && !pet.sleeping && !isDog()) pet.interrupt();
      ui.toast(on ? '🚰 Tap dripping — Somalis are famously fascinated by water' : 'Tap off');
    },
    slowBlink: () => {
      if (game.noise?.active) {
        game.noise.comfortedAt = Date.now();
        game.addBond(0.5);
        sound.purr?.(false);
        ui.toast(`🫂 You stay calmly near ${name()} and speak softly. A safe hiding spot and a calm person help — never force a cuddle or scold fear.`, 'big');
        if (!pet.outside && !pet.sleeping) pet.interrupt?.(false);
        return;
      }
      if (isHam()) {
        const r = pet.call();
        ui.toast(r === 'ok' ? '✋ You rest your hand in the tank and keep still…'
          : r === 'ignored' ? `${name()} froze — not sure about your hand yet. Keep it still; trust takes days.`
            : `${name()} is asleep — hamsters sleep by day. Try in the evening.`);
        return;
      }
      if (isDog()) {
        const r = pet.call();
        ui.toast(r === 'ok' ? `📣 “${name()}, come!”` : r === 'ignored' ? `📣 ${name()} heard you… and decided to think about it. Practise “Come” in training.` : r === 'away' ? `${name()} is out` : `${name()} is fast asleep`);
        return;
      }
      if (pet.slowBlink() === 'away') ui.toast(pet.sleeping ? `${name()} is asleep` : `${name()} isn't in this room`);
      else ui.toast('😌 You slowly blink…');
    },
    toggleTalk: async () => {
      audioContext();
      if (voice.state !== 'off') { voice.disable(); ui.toast('Microphone off'); return; }
      try {
        voice.pitch = game.s.settings.voicePitch;
        voice.sensitivity = game.s.settings.micSensitivity;
        voice.parrot = game.s.settings.parrot;
        await voice.enable();
        ui.toast(voice.parrot
          ? `🎙️ Say something — ${name()} will repeat it!`
          : `🎙️ Talk to ${name()} — pets recognise their person's voice`, 'big');
      } catch (e) {
        const inFrame = window.self !== window.top;
        ui.toast(inFrame
          ? 'Microphone is blocked inside the embedded view — open the app full screen to talk.'
          : `Microphone unavailable: ${e.message || e.name}`, 'big');
        if (inFrame) window.open(location.href, '_blank', 'noopener');
      }
    },
    startFocus: (minutes) => {
      focus = { endsAt: Date.now() + minutes * 60000, minutes };
      ui.showFocus(focus.endsAt, () => endFocus(false));
      pet.interrupt(true);
      pet._startNap(room);
      ui.toast(`Focus for ${minutes} min — ${name()} will nap nearby 📚`, 'big');
    },
    onTool: (tool) => {
      if (tool !== 'laser') { laserOn = false; laserDot.visible = false; if (!ballPlay && pet.act?.id === 'play') pet.stopChase(); }
      if (tool !== 'shower') stopShower();
    },
    // --- several pets ---------------------------------------------------------
    switchPet: async (id) => {
      if (!game.switchPet(id)) return;
      $('#loading').classList.remove('done');
      progress(0.5, `Bringing ${name()} home…`);
      stopPlay(); endFocus(false);
      if (ui.walk) { ui.walk = null; $('#sheetClose').hidden = false; }
      await spawnPet();
      progress(1, 'Ready!');
      setTimeout(() => $('#loading').classList.add('done'), 200);
      setTimeout(() => pet.greet(), 600);
    },
    // --- dogs -------------------------------------------------------------------
    startWalk: (onGone) => {
      goRoom(0);
      pet.goOut(onGone);
    },
    endWalk: (onBack) => {
      stopWalk3d();
      goRoom(0);
      pet.comeHome(onBack);
    },
    trick: (id, done) => {
      if (!isDog() || tooSick()) return false;
      summon(() => pet.doTrick(id, done));
      return true;
    },
    cleanPuddle: () => {
      if (!game.s.accident) return;
      game.setAccident(null);
      sound.squish(); sound.sparkle();
      game.addXp(2);
      ui.toast('🧽 Cleaned with an enzyme cleaner — it removes the smell so it doesn\'t happen in the same spot again.');
    },
    cooking: () => { if (!pet.sleeping && !pet.outside) pet.beg(); },
    sizzle: (on) => sound.sizzle(on),
  };

  function endFocus(completed) {
    if (!focus) return;
    const mins = completed ? focus.minutes : Math.floor((Date.now() - (focus.endsAt - focus.minutes * 60000)) / 60000);
    focus = null;
    ui.hideFocus();
    if (completed) {
      const coins = mins * 2;
      game.addCoins(coins, 'focus'); game.addXp(mins); game.count('focusMin', mins);
      ui.toast(`🌟 Focus complete! +${coins} coins`, 'big');
      pet.wake(true);
      setTimeout(() => pet.greet(), 800);
    } else {
      ui.toast('Focus session ended');
    }
    game.save();
  }

  function stopShower() {
    if (!showering) return;
    showering = false;
    showerHead.visible = false;
    sound.shower(false);
    pet.shakeOff();
  }

  // Food arcing from your hand to the pet's mouth.
  const flying = [];
  function flyFood(icon) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '100px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.fillText(icon, 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.setScalar(0.35);
    scene.add(s);
    flying.push({ s, from: camera.position.clone().add(new THREE.Vector3(0, -1.2, -1.5)), t: 0 });
  }

  ui = new UI({ game, sound, actions });
  ui.setRoom(room);
  ui.petChanged();
  voice.onState = (st) => ui.setTalk(st);
  voice.onHeard = () => pet.heard();
  game.on('settings', () => {
    sound.enabled = game.s.settings.sound;
    voice.pitch = game.s.settings.voicePitch;
    voice.sensitivity = game.s.settings.micSensitivity;
    voice.parrot = game.s.settings.parrot;
  });
  game.on('reset', async () => { applyTheme('cream'); await spawnPet(); });

  // The real world: sunrise/sunset + weather in the window, festival fireworks and thunder.
  onWorld((w) => {
    house.setSky(w.sun, w.weather);
    outdoor.setTime(new Date(), w.sun, w.weather);
    setSun(w.sun);
    ui.weather(w.weather);
  });
  startWorld(game).then(() => {
    const tonight = fireworksTonight();
    const key = `pocketpet.fwwarn.${new Date().toDateString()}`;
    let warned = false;
    try { warned = !!localStorage.getItem(key); localStorage.setItem(key, '1'); } catch { /* private mode */ }
    if (tonight && !warned && new Date().getHours() < tonight.from) {
      setTimeout(() => ui.hint(`Tonight: ${tonight.name}. Keep ${name()} indoors, close the windows and curtains, and give ${she('obj')} a safe place to hide.`), 5000);
    }
  });
  game.noise = { active: false, comfortedAt: 0 };
  let nextBang = 2;
  let noiseKind = null;
  // Health: new symptoms, and what happened while you were away.
  game.on('sick', (ids) => {
    ui.toast(`🤒 ${symptomLine(ids[0])}. Open 🩺 Health to see what to do.`, 'big');
    ui.refresh();
  });
  if (game._offlineSick?.length) {
    setTimeout(() => {
      for (const { pet: p, ids } of game._offlineSick) ui.toast(`🤒 While you were away: ${symptomLine(ids[0], p)}.`, 'big');
      game._offlineSick = [];
    }, 4500);
  }
  let sickNag = 60;

  // -------------------------------------------------------------- input
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const interactiveMeshes = [];
  for (const it of house.interactables) it.object.traverse((o) => { if (o.isMesh) interactiveMeshes.push(o); });

  function cast(e, targets) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(targets.filter((m) => m.visible && m.parent?.visible !== false), false)[0] || null;
  }

  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    audioContext();
    canvas.setPointerCapture(e.pointerId);
    const petHit = pet.outside ? null : cast(e, petMeshes);
    const itemHit = petHit ? null : cast(e, interactiveMeshes);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), catHit: petHit, itemHit, moved: 0, stroking: false, last: performance.now() };
    if (ui.tool === 'laser') {
      const f = cast(e, house.floors);
      if (f) setLaser(f.point);
    } else if (ui.tool === 'shower') {
      if (!pet.inView) { ui.toast(`${name()} isn't here`); return; }
      showering = true; showerHead.visible = true; sound.shower(true);
      pet.interrupt(true); pet.stop(); pet.sitting = false;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    tracker?.setPointer(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
    pet.pointerActive = e.pointerType === 'mouse' || !!down;
    if (!down) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - down.last) / 1000);
    down.last = now;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (ui.tool === 'laser') {
      const f = cast(e, house.floors);
      if (f) setLaser(f.point);
      return;
    }
    const hit = (ui.tool || down.catHit) ? cast(e, petMeshes) : null;
    if (ui.tool === 'sponge') {
      if (hit && (down.lastScrub || 0) + 50 < now) {
        down.lastScrub = now;
        if (pet.scrub(hit.point)) game.addNeed('groom', 0.7);
      }
      return;
    }
    if (ui.tool === 'brush') {
      if (hit) { pet.brush(hit.point, dt, regionOf(hit)); game.count('brushed', 0); }
      return;
    }
    if (down.catHit && down.moved > 14 && hit) {
      down.stroking = true;
      pet.stroke(regionOf(hit), dt);
    }
  });

  const endPointer = (e) => {
    if (!down) return;
    const d = down; down = null;
    pet.pointerActive = e.pointerType === 'mouse';
    if (ui.tool === 'shower') { stopShower(); return; }
    if (ui.tool === 'brush' && d.moved > 14) { game.count('brushed'); return; }
    if (ui.tool) return;
    const dx = e.clientX - d.x; const dy = e.clientY - d.y;
    const quick = performance.now() - d.t < 450;
    if (!d.catHit && quick && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goRoom(room + (dx < 0 ? 1 : -1));
      return;
    }
    if (d.moved > 12 || d.stroking) return;
    if (d.catHit) {
      const res = pet.touch(regionOf(d.catHit));
      if (res === 'shy') ui.hint(isDog()
        ? `${name()} is still nervous. Let ${she('obj')} come to you; gentle chin scratches, treats and walks build trust.`
        : `${name()} is still shy. Build trust with slow blinks 😌, meals and gentle head scratches.`);
    } else if (d.itemHit) {
      onItem(d.itemHit.object.userData.interactive);
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { tracker?.setPointer(null); pet.pointerActive = false; });

  function onItem(id) {
    if (id === 'ball') actions.throwBall();
    else if (id === 'fridge') ui.openTray('meal');
    else if (id === 'lamp') actions.toggleLights();
    else if (id === 'litter') actions.scoop();
    else if (id === 'tap') actions.toggleTap();
    else if (id === 'puddle') actions.cleanPuddle();
    else if (id === 'door') { if (isDog()) ui.openWalk(); else if (!isHam()) ui.toast('Indoor cats are safest indoors 🏠'); }
    else if (id === 'cage') {
      ui.toast(pet.sleeping
        ? `🐹 ${name()} is asleep in the nest. Hamsters are nocturnal — come back in the evening.`
        : `🐹 ${name()}: ${pet.status || 'busy being a hamster'}`);
    }
    else if (id === 'bed') ui.toast(isDog() ? 'Dogs pick their own nap time too 🐕' : 'Cats nap when *they* decide to 😼');
    else if (id === 'duck') {
      sound.boing(); sound.pop();
      house.duck.userData.squeak = 0.5;
      fx.spawn('bubble', house.duck.getWorldPosition(new THREE.Vector3()), { count: 4 });
    }
  }

  function setLaser(point) {
    const b = house.rooms[room].bounds;
    point.x = THREE.MathUtils.clamp(point.x, b.x0, b.x1);
    point.z = THREE.MathUtils.clamp(point.z, b.z0 - 0.3, b.z1);
    laserDot.position.set(point.x, 0.012, point.z);
    laserDot.visible = true;
    if (!laserOn) {
      if (tooSick()) { laserDot.visible = false; ui.setTool(null); return; }
      laserOn = true;
      if (pet.sleeping && game.bond < 30) return;
      summon(() => pet.startChase(() => (laserDot.visible ? laserDot.position : null), () => {
        game.addNeed('play', 3); game.addNeed('energy', -1); game.addXp(1);
      }, 0.6, 1.7));
    }
  }

  // -------------------------------------------------------------- resize / camera
  let camDist = 6.4;
  function resize() {
    const w = window.innerWidth; const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const portrait = camera.aspect < 0.9;
    camDist = portrait ? 4.6 : 6.4;
    const halfWidth = portrait ? 1.7 : 3.3;
    const hfov = 2 * Math.atan(halfWidth / camDist);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect);
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vfov), 38, 80);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let camX = house.rooms[room].cx;
  let camZoom = 0;
  const parallax = new THREE.Vector2();

  // -------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let elapsed = 0;
  const headV = new THREE.Vector3();
  let uiTimer = 0;

  if (game.offlineHours > 0.5 && game.s.name) {
    setTimeout(() => {
      ui.toast(`${name()} missed you! (away ${Math.round(game.offlineHours)}h)`, 'big');
      pet.greet();
    }, 1500);
  }

  // ---- walks on the real street
  let walk3d = false;
  let skyTimer = 0;
  const headTmp = new THREE.Vector3();
  function startWalk3d() {
    walk3d = true;
    outdoor.startWalk(root);
    document.getElementById('sheet').classList.add('walk3d');
    document.body.classList.add('walking');
  }
  function stopWalk3d() {
    if (!walk3d) return;
    walk3d = false;
    outdoor.stopWalk();
    document.getElementById('sheet').classList.remove('walk3d');
    document.body.classList.remove('walking');
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;

    game.tick(dt, { focus: !!focus, asleep: pet.sleeping, out: pet.outside });
    if (focus && Date.now() >= focus.endsAt) endFocus(true);

    if (ballPlay > 0) {
      ballPlay -= dt;
      if (ballPlay <= 0 || room !== 0) { ballPlay = 0; if (pet.act?.id === 'play') pet.stopChase(); }
    }
    if (showering) {
      if (pet.rinse(dt)) game.addNeed('groom', 1);
      showerHead.position.copy(pet.headPosition(headV)).add(new THREE.Vector3(0, 1.1, 0));
      if (pet.foamCount === 0 && pet.wet >= 1) {
        game.addNeed('groom', 15); game.count('washed'); game.addXp(3);
        sound.sparkle();
        ui.setTool(null);
        ui.toast(isDog()
          ? `${name()} is clean! Dogs need a bath every month or so (or when muddy) — too often dries the skin.`
          : `${name()} is clean — though most cats only need a bath rarely; brushing is what a long coat really needs.`, 'big');
      }
    }
    if (house.duck.userData.squeak > 0) {
      house.duck.userData.squeak -= dt;
      house.duck.scale.setScalar(1 + Math.sin(house.duck.userData.squeak * 30) * 0.12);
    }

    for (let i = flying.length - 1; i >= 0; i -= 1) {
      const f = flying[i]; f.t += dt / 0.6;
      const to = pet.headPosition(headV).clone().add(pet.noseDir().multiplyScalar(0.2));
      const p = f.from.clone().lerp(to, Math.min(1, f.t));
      p.y += Math.sin(Math.min(1, f.t) * Math.PI) * 0.6;
      f.s.position.copy(p);
      f.s.scale.setScalar(0.35 * (1 - f.t * 0.5));
      if (f.t >= 1) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); flying.splice(i, 1); }
    }

    // Fireworks or thunder outside: bangs at random, the pet gets frightened, you can comfort it.
    const noise = noiseNow();
    game.noise.active = !!noise;
    if (noise && noise.kind !== noiseKind) {
      noiseKind = noise.kind;
      ui.hint(`${noise.kind === 'thunder' ? '⛈️ A thunderstorm outside' : `🎆 ${noise.name} outside`} — ${name()} is frightened. Close the curtains, stay calm nearby (${isDog() ? '📣' : isHam() ? '✋' : '😌'} button to comfort), and let ${she('obj')} hide.`);
    } else if (!noise) noiseKind = null;
    if (noise) {
      nextBang -= dt;
      if (nextBang <= 0) {
        nextBang = noise.kind === 'thunder' ? 9 + Math.random() * 18 : 2.5 + Math.random() * 7;
        sound.boom(noise.kind);
        if (noise.kind === 'thunder') outdoor.flash();
        const comforted = Date.now() - (game.noise.comfortedAt || 0) < 5 * 60000;
        if (!pet.outside && (!pet.act || pet.act.interruptible !== false) && Math.random() < (comforted ? 0.25 : 0.7)) {
          if (isHam()) { pet._fleeToNest?.(); }
          else if (isDog()) { pet.say?.('whine'); pet.interrupt?.(true); pet.goToRoom?.(room, () => {}); }
          else if (!pet.sleeping) { pet.interrupt?.(true); pet._startNap?.(3); }
          if (pet.status !== undefined && !pet.sleeping) pet.status = isHam() ? 'Frozen, then bolted into the nest' : isDog() ? 'Trembling and panting at the bangs' : 'Hiding — scared of the bangs';
        }
      }
    }

    // Illness shows in behaviour: slower, sleepier; very ill pets just lie down.
    const vit = vitality(game.pet);
    if (pet._baseSpeed0 != null) pet.baseSpeed = pet._baseSpeed0 * vit.speed;
    pet.speedScale = vit.speed;
    sickNag -= dt;
    if (sickNag <= 0) {
      sickNag = 180;
      const h = game.health;
      const worstId = Object.entries(h.conds).sort((a, b) => b[1].sev - a[1].sev)[0]?.[0];
      const due = game.healthIssues().due;
      if (due) ui.hint(`💊 ${name()}'s medicine is due — open 🩺 Health. Missing doses slows recovery.`);
      else if (worstId && pet.inView && h.conds[worstId].sev > 0.3) {
        ui.hint(h.conds[worstId].dx && !h.conds[worstId].treated && CONDITIONS[worstId].treat.kind !== 'care'
          ? `${name()} still needs treatment for ${CONDITIONS[worstId].name.toLowerCase()}.`
          : `${symptomLine(worstId)}.`);
      }
      if (h.score < 25 && !pet.sleeping && !pet.outside && (!pet.act || pet.act.interruptible !== false)) {
        pet.interrupt?.(true);
        pet._startNap?.(pet.room);
      }
    }

    voice.update(dt);
    layer.restore();
    // the sun moves: re-place it every minute
    skyTimer -= dt;
    if (skyTimer <= 0) { skyTimer = 60; outdoor.setTime(new Date(), WORLD.sun, WORLD.weather); }
    const walkingOut = !!(ui.walk?.out && pet.outside && isDog());
    if (walkingOut && !walk3d) startWalk3d();
    else if (!walkingOut && walk3d) stopWalk3d();
    if (walk3d) {
      const res = outdoor.walkUpdate(dt, ui.walk?.pending?.ev || null, pet.len, pet.headPosition(headTmp), camera);
      built.rig?.update(res.pose, 0, res.speed, dt);
    }
    pet.update(dt);
    house.update(dt, elapsed);
    house.updateTap(dt, fx);
    fx.update(dt);
    laserDot.scale.setScalar(1 + Math.sin(elapsed * 20) * 0.15);

    // Camera frames YOUR room — or, for a hamster, a close-up of its tank. (On a walk, the street camera leads.)
    if (!walk3d) {
    const portrait = camera.aspect < 0.9;
    const tank = isHam() && room === 0 ? house.cage.center : null;
    camX += ((tank ? tank.x : house.rooms[room].cx) - camX) * Math.min(1, dt * 3);
    camZoom += ((tank ? 1 : 0) - camZoom) * Math.min(1, dt * 3);
    parallax.lerp(tracker?.pointer || new THREE.Vector2(), Math.min(1, dt * 2));
    const c = house.cage.center;
    const lerp = THREE.MathUtils.lerp;
    camera.position.set(
      camX + parallax.x * 0.25,
      lerp(portrait ? 1.55 : 1.75, c.y + (portrait ? 1.2 : 1.05), camZoom) + parallax.y * 0.1,
      lerp(camDist, c.z + (portrait ? 5.2 : 4.4), camZoom));
    camera.lookAt(camX, lerp(portrait ? 0.85 : 0.95, c.y - 0.05, camZoom), lerp(0, c.z, camZoom));
    }

    // Thought bubble over the head when a need is low and the pet is here.
    const mood = game.mood();
    const lowIcon = { health: game.noise?.active ? '😨' : '🤒', food: isHam() ? '🌾' : '🍗', water: '💧', energy: '😴', play: isDog() ? '🦮' : isHam() ? '🎡' : '🧶', groom: isHam() ? '⏳' : '🪮', litter: isDog() ? '🧻' : isHam() ? '🧹' : '🚽', walk: '🚪' }[mood.low[0]];
    if (lowIcon && pet.inView && !pet.sleeping && !pet.reactions.length) {
      pet.headPosition(headV).add(new THREE.Vector3(0, isHam() ? 0.18 : 0.3 + pet.len * 0.15, 0)).project(camera);
      ui.thought(lowIcon, (headV.x * 0.5 + 0.5) * window.innerWidth, (-headV.y * 0.5 + 0.5) * window.innerHeight);
    } else {
      ui.thought(null);
    }
    uiTimer -= dt;
    if (uiTimer <= 0) {
      uiTimer = 0.4;
      ui.refresh();
      ui.status(pet, room);
    }

    // the street first (through the windows), then the flat over it
    outdoor.update(dt, walk3d ? root.position : { x: camX, z: -18 });
    renderer.autoClear = false;
    renderer.clear();
    outdoor.render(camera);
    if (!walk3d) {
      renderer.clearDepth();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  progress(1, 'Ready!');
  setTimeout(() => $('#loading').classList.add('done'), 250);
  requestAnimationFrame(frame);

  if (!game.s.name) {
    ui.askName((n) => {
      audioContext();
      sound.chirp(2);
      pet.greet();
      ui.toast(`Welcome home, ${n}! 🏡`, 'big');
      setTimeout(() => ui.hint(`${n} is a ${breedOf(game.pet).name} — curious, very active and a little independent. Tap your profile (top left) for the 🏪 Pet Store — your first adoption is free.`), 3500);
    });
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
  window.addEventListener('pagehide', () => game.save());
  window.pocketPet = { game, pet, house, outdoor, rig: built.rig, voice, scene, camera, actions, ui, get current() { return pet; } };
}

boot().catch((e) => {
  console.error(e);
  $('#loadingText').textContent = `Couldn't start: ${e.message}`;
  $('#loading').classList.add('error');
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* optional */ });
}
