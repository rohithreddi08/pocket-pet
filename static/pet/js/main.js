// ============================================================================
// main.js — boots the app and wires world, cat, input and UI together.
// ============================================================================
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CatLoader } from '../../cat/CatLoader.js';
import { mapBones, normalizeName } from '../../cat/BoneMap.js';
import { PoseLayer } from '../../cat/PoseLayer.js';
import { HeadTracker } from '../../cat/HeadTracker.js';
import { Procedural } from '../../cat/Procedural.js';
import { House, ROOMS, ROOM_W } from './world/House.js';
import { Particles } from './world/Particles.js';
import { Pet } from './pet/Pet.js';
import { Accessories } from './pet/Accessories.js';
import { Game, THEMES } from './state.js';
import { Sound, Voice, audioContext } from './audio.js';
import { UI } from './ui/ui.js';
import { $ } from './ui/dom.js';

const MODEL_URLS = ['../cat/assets/cat_rigged.glb', '../cat/assets/cat.glb'];
const HDR_URL = '../cat/assets/studio.hdr';

const progress = (p, text) => {
  $('#loadBar').style.width = `${Math.round(p * 100)}%`;
  if (text) $('#loadingText').textContent = text;
};

async function firstExisting(urls) {
  for (const u of urls) {
    try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok) return u; } catch { /* next */ }
  }
  return urls[urls.length - 1];
}

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
  const fx = new Particles(scene);

  try {
    const hdr = await new RGBELoader().loadAsync(HDR_URL);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose(); pmrem.dispose();
  } catch (e) { console.warn('[pet] environment map failed; continuing without it', e); }

  // -------------------------------------------------------------- cat
  progress(0.35, 'Waking up your cat…');
  const modelUrl = await firstExisting(MODEL_URLS);
  const { root, rig, kind } = await CatLoader.load(modelUrl, scene, { targetLength: 1.55, facing: -Math.PI / 2 });
  if (kind !== 'rigged') throw new Error('The cat model has no animations. Put a rigged, animated cat at static/cat/assets/cat_rigged.glb.');
  progress(0.8, 'Almost there…');

  const bones = mapBones(root);
  const layer = new PoseLayer();
  const tracker = bones.head ? new HeadTracker({ camera, headBone: bones.head, root, layer, maxAngle: 0.9 }) : null;
  const procedural = new Procedural({
    root, layer, chestBone: bones.chest, hipBone: bones.hip, earLBone: bones.earL, earRBone: bones.earR, tailBones: bones.tail,
  });
  const hats = new Accessories(root, bones.head);       // measure in rest pose, before animating
  hats.wear(game.s.hat);
  game.on('hat', (id) => hats.wear(id));
  const applyTheme = (id) => house.applyTheme((THEMES[id] || THEMES.cream).walls);
  applyTheme(game.s.theme);
  game.on('theme', applyTheme);

  const pet = new Pet({ root, rig, bones, layer, tracker, procedural, house, fx, sound, voice, game, camera });
  let room = pet.room;
  house.focusRoom(room);

  // Which part of the cat did we touch? (dominant bone of the hit triangle)
  const catMeshes = [];
  root.traverse((o) => { if (o.isMesh) catMeshes.push(o); });
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
    const chestY = (bones.chest || bones.hip || root).getWorldPosition(new THREE.Vector3()).y;
    return hit.point.y < chestY * 0.85 ? 'belly' : 'body';
  }

  // -------------------------------------------------------------- UI + actions
  let focus = null;              // { endsAt, minutes }
  let laser = null;              // { dot, point }
  let showering = false;
  let ballPlay = 0;

  const laserDot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: '#ff1744', toneMapped: false }));
  laserDot.rotation.x = -Math.PI / 2; laserDot.visible = false; scene.add(laserDot);
  const laserGlow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: '#ff5252', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
  laserGlow.rotation.x = -Math.PI / 2; laserDot.add(laserGlow); laserGlow.position.z = -0.001;

  const showerHead = new THREE.Group();
  showerHead.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.12, 20), new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.9, roughness: 0.2 })));
  showerHead.visible = false; scene.add(showerHead);

  function goRoom(i) {
    if (i < 0 || i >= ROOMS.length || pet.travelling) return;
    if (focus) { ui.toast('Shh… focus session in progress 🤫'); return; }
    stopPlay();
    ui.closeTray();
    room = i;
    ui.setRoom(i);
    house.focusRoom(i);
    pet.goToRoom(i);
  }

  function stopPlay() {
    pet.stopChase();
    ballPlay = 0;
    laser = null; laserDot.visible = false;
  }

  const actions = {
    go: (d) => goRoom(room + d),
    celebrate: () => pet.celebrate(),
    feed: (id) => {
      if (pet.travelling) return;
      if (game.needs.food > 96) { pet.refuse(); ui.toast(`${game.s.name} is full! 😸`); return; }
      const f = game.useFood(id);
      if (!f) return;
      pet.feed(f);
      flyFood(f.icon);          // the food arcs from the tray to the cat's mouth
      if (f.like !== 'dislike') game.addCoins(1, 'care');
    },
    throwBall: () => {
      if (room !== 0) return;
      stopPlay();
      const b = house.ball;
      const away = b.mesh.position.clone().sub(root.position).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.6);
      house.kickBall(away, 2.8);
      sound.boing();
      ballPlay = 14;
      pet.startChase(() => b.mesh.position, () => {
        const dir = b.mesh.position.clone().sub(root.position).setY(0);
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
        house.kickBall(dir, 2.2 + Math.random() * 1.2);
        pet.pounce();
        game.addNeed('fun', 4); game.addNeed('energy', -1.5); game.addXp(1);
      }, 0.75, 1.5);
    },
    toggleLights: () => {
      const r = house.rooms[room];
      house.setLights(room, !r.lightsOn);
      sound.click();
      if (!r.lightsOn && room === 3 && game.needs.energy < 92) pet.sleep();
      if (r.lightsOn && pet.sleeping && !focus) pet.wake();
    },
    sleep: () => {
      if (game.needs.energy > 92) { ui.toast(`${game.s.name} isn't sleepy`); pet.refuse(); return; }
      if (room !== 3) goRoom(3);
      house.setLights(3, false);
      pet.sleep();
    },
    toggleTalk: async () => {
      audioContext();
      if (voice.state !== 'off') { voice.disable(); ui.toast('Talking off'); return; }
      try {
        voice.pitch = game.s.settings.voicePitch;
        voice.sensitivity = game.s.settings.micSensitivity;
        await voice.enable();
        ui.toast(`🎙️ Say something — ${game.s.name} will repeat it!`, 'big');
      } catch (e) {
        const inFrame = window.self !== window.top;
        ui.toast(inFrame
          ? 'Microphone is blocked inside the embedded view — open the app full screen to talk.'
          : `Microphone unavailable: ${e.message || e.name}`, 'big');
        if (inFrame) window.open(location.href, '_blank', 'noopener');
      }
    },
    startFocus: (minutes) => {
      if (room !== 3) goRoom(3);
      house.setLights(3, false);
      pet.sleep();
      focus = { endsAt: Date.now() + minutes * 60000, minutes };
      ui.showFocus(focus.endsAt, () => endFocus(false));
      ui.toast(`Focus for ${minutes} min — you've got this! 📚`, 'big');
    },
    onTool: (name) => {
      if (name !== 'laser') { laser = null; laserDot.visible = false; if (!ballPlay) pet.stopChase(); }
      if (name !== 'shower') stopShower();
    },
  };

  function endFocus(completed) {
    if (!focus) return;
    const mins = completed ? focus.minutes : Math.floor((Date.now() - (focus.endsAt - focus.minutes * 60000)) / 60000);
    focus = null;
    ui.hideFocus();
    house.setLights(3, true);
    pet.wake();
    if (completed) {
      const coins = mins * 2;
      game.addCoins(coins, 'focus'); game.addXp(mins); game.addNeed('fun', 15);
      game.count('focusMin', mins);
      ui.toast(`🌟 Focus complete! +${coins} coins`, 'big');
      pet.celebrate();
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

  // Food flying in an arc from the tray to the mouth.
  const flying = [];
  function flyFood(icon) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '100px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.fillText(icon, 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.setScalar(0.35);
    const from = camera.position.clone().add(new THREE.Vector3(0, -1.2, -1.5));
    scene.add(s);
    flying.push({ s, from, t: 0 });
  }

  const ui = new UI({ game, sound, actions });
  ui.setRoom(room);
  voice.onState = (st) => {
    ui.setTalk(st);
    if (st === 'hearing') { pet.wake(false); }
    if (st === 'talking') { game.count('talked'); game.addNeed('fun', 2); }
  };
  game.on('settings', () => {
    sound.enabled = game.s.settings.sound;
    voice.pitch = game.s.settings.voicePitch;
    voice.sensitivity = game.s.settings.micSensitivity;
  });
  game.on('reset', () => { hats.wear(null); applyTheme('cream'); pet.wake(false); });

  // -------------------------------------------------------------- input
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const interactiveMeshes = [];
  for (const it of house.interactables) it.object.traverse((o) => { if (o.isMesh) interactiveMeshes.push(o); });

  function cast(e, targets) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(targets, false)[0] || null;
  }

  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    audioContext();
    canvas.setPointerCapture(e.pointerId);
    const catHit = cast(e, catMeshes);
    const itemHit = catHit ? null : cast(e, interactiveMeshes);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), catHit, itemHit, moved: 0, stroking: false, lastScrub: 0 };
    if (ui.tool === 'laser') {
      const f = cast(e, house.floors);
      if (f) setLaser(f.point);
    } else if (ui.tool === 'shower') {
      showering = true; showerHead.visible = true; sound.shower(true);
      pet.stop(); pet.sitting = false;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    tracker?.setPointer(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
    pet.pointerActive = e.pointerType === 'mouse' || !!down;
    if (!down) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (ui.tool === 'laser') {
      const f = cast(e, house.floors);
      if (f) setLaser(f.point);
      return;
    }
    if (ui.tool === 'sponge') {
      const now = performance.now();
      if (now - down.lastScrub > 50) {
        const hit = cast(e, catMeshes);
        if (hit) {
          down.lastScrub = now;
          if (pet.scrub(hit.point)) game.addNeed('clean', 0.9);
        }
      }
      return;
    }
    if (down.catHit && down.moved > 14) {
      const hit = cast(e, catMeshes);
      if (hit) { down.stroking = true; pet.stroke(1 / 30); }
    }
  });

  const endPointer = (e) => {
    if (!down) return;
    const d = down; down = null;
    pet.pointerActive = e.pointerType === 'mouse';
    if (ui.tool === 'shower') { stopShower(); return; }
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
      if (res === 'angry') ui.toast(`${game.s.name} has had enough poking! 😾`);
    } else if (d.itemHit) {
      onItem(d.itemHit.object.userData.interactive);
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { tracker?.setPointer(null); pet.pointerActive = false; });

  function onItem(id) {
    if (id === 'ball') actions.throwBall();
    else if (id === 'fridge') ui.openTray();
    else if (id === 'lamp') actions.toggleLights();
    else if (id === 'bed') actions.sleep();
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
    if (!laser) {
      laser = { point: laserDot.position };
      pet.startChase(() => (laserDot.visible ? laserDot.position : null), () => {
        pet.pounce();
        game.addNeed('fun', 3); game.addNeed('energy', -1); game.addXp(1);
      }, 0.6, 1.7);
    }
  }

  // -------------------------------------------------------------- resize / camera
  let camDist = 6.4;
  function resize() {
    const w = window.innerWidth; const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Landscape: show ~6.6 units of the room at the cat's depth. Portrait
    // (phones): frame tighter so the cat stays big, like a pet in your hand.
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
  const parallax = new THREE.Vector2();

  // -------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let elapsed = 0;
  const headV = new THREE.Vector3();
  let hintTimer = 0;

  if (game.offlineHours > 0.5 && game.s.name) {
    setTimeout(() => ui.toast(`${game.s.name} missed you! (away ${Math.round(game.offlineHours)}h)`, 'big'), 1200);
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);   // allow big steps so slow devices don't run in slow motion
    elapsed += dt;

    game.tick(dt, { focus: !!focus });
    if (focus && Date.now() >= focus.endsAt) endFocus(true);

    // Play sessions wind down by themselves.
    if (ballPlay > 0) {
      ballPlay -= dt;
      if (ballPlay <= 0 || room !== 0) { ballPlay = 0; pet.stopChase(); }
    }
    if (showering) {
      const removed = pet.rinse(dt);
      showerHead.position.copy(pet.headPosition(headV)).add(new THREE.Vector3(0, 1.1, 0));
      if (removed) { game.addNeed('clean', 1.2); }
      if (pet.foamCount === 0 && pet.wet >= 1) {
        game.addNeed('clean', 10); game.count('washed'); game.addXp(3); game.addCoins(3, 'care');
        sound.sparkle();
        ui.setTool(null);
        ui.toast(`${game.s.name} is squeaky clean! ✨`);
      }
    }
    if (house.duck.userData.squeak > 0) {
      house.duck.userData.squeak -= dt;
      house.duck.scale.setScalar(1 + Math.sin(house.duck.userData.squeak * 30) * 0.12);
    }

    // Flying food
    for (let i = flying.length - 1; i >= 0; i -= 1) {
      const f = flying[i]; f.t += dt / 0.6;
      const to = pet.headPosition(headV).clone().add(pet.noseDir().multiplyScalar(0.2));
      const p = f.from.clone().lerp(to, Math.min(1, f.t));
      p.y += Math.sin(Math.min(1, f.t) * Math.PI) * 0.6;
      f.s.position.copy(p);
      f.s.scale.setScalar(0.35 * (1 - f.t * 0.5));
      if (f.t >= 1) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); flying.splice(i, 1); }
    }

    voice.update(dt);
    layer.restore();
    pet.update(dt);
    house.update(dt, elapsed);
    fx.update(dt);
    laserDot.scale.setScalar(1 + Math.sin(elapsed * 20) * 0.15);

    // Camera: follow the cat while it walks between rooms, else frame the room.
    const target = pet.travelling ? THREE.MathUtils.clamp(root.position.x, 0, (ROOMS.length - 1) * ROOM_W) : house.rooms[room].cx;
    camX += (target - camX) * Math.min(1, dt * (pet.travelling ? 3 : 2.5));
    parallax.lerp(tracker?.pointer || new THREE.Vector2(), Math.min(1, dt * 2));
    const portrait = camera.aspect < 0.9;
    camera.position.set(camX + parallax.x * 0.25, (portrait ? 1.55 : 1.75) + parallax.y * 0.1, camDist);
    camera.lookAt(camX, portrait ? 0.85 : 0.95, 0);

    // Thought bubble over the head when a need is low.
    hintTimer -= dt;
    const mood = game.mood();
    const lowIcon = { food: '🍗', energy: '😴', fun: '🎾', clean: '🛁' }[mood.low[0]];
    if (lowIcon && !pet.sleeping && !pet.travelling && !pet.reactions.length) {
      pet.headPosition(headV).add(new THREE.Vector3(0, 0.55, 0)).project(camera);
      ui.thought(lowIcon, (headV.x * 0.5 + 0.5) * window.innerWidth, (-headV.y * 0.5 + 0.5) * window.innerHeight);
    } else {
      ui.thought(null);
    }
    if (hintTimer <= 0) { hintTimer = 0.5; ui.refresh(); }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  progress(1, 'Ready!');
  setTimeout(() => $('#loading').classList.add('done'), 250);
  requestAnimationFrame(frame);

  if (!game.s.name) {
    ui.askName((name) => {
      audioContext();
      sound.meow({ pitch: 1.1, mood: 'happy' });
      pet.react('hop'); pet.react('love');
      ui.toast(`Welcome home, ${name}! 🏡`, 'big');
    });
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
  window.addEventListener('pagehide', () => game.save());

  // handy for debugging in the console
  window.pocketPet = { game, pet, house, rig, voice, scene, camera };
}

boot().catch((e) => {
  console.error(e);
  $('#loadingText').textContent = `Couldn't start: ${e.message}`;
  $('#loading').classList.add('error');
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* optional */ });
}
