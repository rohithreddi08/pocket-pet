// ============================================================================
// store.js — your profile (all your pets) and the pet store.
// ----------------------------------------------------------------------------
// The store has a Cats and a Dogs section; each day brings new animals of
// different breeds, ages (baby → senior), coats and personalities, from
// breeders and rescues — like a real pet shop / shelter.
// ============================================================================
import { h } from './dom.js';
import {
  SPECIES, BREEDS, PERSONALITIES, AGE_FILTERS, listings, breedOf, ageLabel, ageMonths, stageName, pronoun,
} from '../species.js';
import { MAX_PETS, needsFor } from '../state.js';
import { thumbnail } from '../pet/factory.js';
import { coatSwatch } from '../pet/coats.js';

// How well each breed copes with flat / hostel life (the people this app is for).
const FLAT = {
  somali: ['👍 Good', 'Fine indoors with cat trees, window perches and daily play.'],
  abyssinian: ['👍 Good', 'Fine indoors if it gets climbing space and lots of play.'],
  dlh: ['🌟 Great', 'Most adapt easily to flat life.'],
  husky: ['⚠️ Hard', 'Needs 1–2 h of hard exercise daily, sheds a lot and howls — tough in a flat or hostel.'],
  malamute: ['⚠️ Hard', 'Big, strong and needs lots of exercise and space.'],
  shiba: ['👌 OK', 'Small and clean, but needs daily walks and a secure lead.'],
  akita: ['⚠️ Hard', 'Large and needs an experienced owner; check building rules.'],
  indie: ['👍 Good', 'Adaptable and low-maintenance; needs daily walks.'],
  russianblue: ['🌟 Great', 'Quiet, calm and happy indoors with climbing spots and a routine.'],
  dsh: ['🌟 Great', 'Most adapt easily to flat life.'],
  germanshepherd: ['⚠️ Hard', 'A large working dog that needs long daily walks, training and a job to do.'],
  pug: ['🌟 Great', 'Small, quiet and happy with short walks — but keep it cool: pugs overheat easily.'],
  syrian: ['🌟 Great', 'Small, quiet (by day!) and often allowed where cats and dogs are not. Needs a big tank — and it runs at night, so keep it out of your bedroom if you sleep lightly.'],
  winterwhite: ['🌟 Great', 'Small and quiet; needs a big tank and a 20 cm+ wheel.'],
  robo: ['👍 Good', 'Tiny and quiet, but too fast and nervous to handle much — one to watch rather than cuddle.'],
};

function img(promise, cls = 'thumb') {
  const el = h('img', { class: cls, alt: '' });
  promise.then((url) => { el.src = url; }).catch(() => { el.replaceWith(h('div', { class: `${cls} ph` }, '🐾')); });
  return el;
}

function meter(label, v) {
  return h('div', { class: 'meter' }, h('span', {}, label), h('i', {}, h('b', { style: `width:${Math.round(v * 100)}%` })));
}

// ---------------------------------------------------------------------------
export function openProfile(ui) {
  const g = ui.game;
  const list = h('div', { class: 'pets' });
  let armed = null;
  const render = () => {
    list.replaceChildren();
    for (const p of g.pets) {
      const b = breedOf(p);
      const active = p.id === g.pet.id;
      const mood = g.mood(p);
      const needs = needsFor(p.species).map((n) => h('i', {
        title: `${n.label} ${Math.round(p.needs[n.id])}%`,
        style: `--v:${p.needs[n.id]}%;--c:${p.needs[n.id] > 60 ? '#40c057' : p.needs[n.id] > 30 ? '#fab005' : '#fa5252'}`,
      }, n.icon));
      const rehome = h('button', {
        class: 'link small',
        onclick: (e) => {
          e.stopPropagation();
          if (armed !== p.id) { armed = p.id; rehome.textContent = `Tap again: ${p.name} goes to a loving new home`; return; }
          if (g.rehome(p.id)) { ui.toast(`${p.name} went to a loving new home. 💛`); render(); }
        },
      }, 'Rehome…');
      list.append(h('div', { class: `pet-card ${active ? 'on' : ''}` },
        img(thumbnail(p.breed, p.coat, { months: ageMonths(p) })),
        h('div', { class: 'pet-info' },
          h('b', {}, `${p.name || 'Unnamed'} ${p.sex === 'male' ? '♂' : '♀'}`),
          h('div', { class: 'small muted' }, `${b.name} · ${ageLabel(ageMonths(p))} (${stageName(p)})`),
          h('div', { class: 'small' }, `${mood.emoji} ${mood.label} · 💗 ${g.bondLabel(p.bond)} · ${(PERSONALITIES[p.personality] || {}).icon || ''} ${(PERSONALITIES[p.personality] || {}).name || ''}`),
          h('div', { class: 'small', style: p.health && p.health.score < 65 ? 'color:#e03131;font-weight:600' : '' },
            `🩺 Health ${Math.round(p.health?.score ?? 100)}/100${Object.keys(p.health?.conds || {}).length ? ` · ${Object.keys(p.health.conds).length} problem${Object.keys(p.health.conds).length > 1 ? 's' : ''}` : ''}`),
          h('div', { class: 'mini-needs' }, ...needs)),
        h('div', { class: 'pet-actions' },
          active ? h('span', { class: 'tag' }, '🏠 At home')
            : h('button', { class: 'buy', onclick: () => { ui.closeSheet(); ui.a.switchPet(p.id); } }, `Spend time with ${p.name}`),
          !active && g.pets.length > 1 ? rehome : null)));
    }
  };
  render();
  const s = g.s;
  ui.openSheet('🙂 Your profile', h('div', {},
    h('div', { class: 'me' },
      h('div', {}, h('b', {}, `Level ${s.level}`), h('small', {}, `${s.xp} XP`)),
      h('div', {}, h('b', {}, `🪙 ${s.coins}`), h('small', {}, 'coins')),
      h('div', {}, h('b', {}, `${g.pets.length}/${Number.isFinite(MAX_PETS) ? MAX_PETS : '∞'}`), h('small', {}, 'pets'))),
    h('h3', { class: 'sec' }, '🐾 My pets'),
    h('p', { class: 'muted small' }, 'One pet is at home on screen at a time. The others keep living their routine — eating from their bowls, napping — so check on everyone!'),
    list,
    h('button', { class: 'primary wide-btn', onclick: () => openStore(ui) }, g.p.firstAdoptFree ? '🏪 Visit the Pet Store — first adoption free!' : '🏪 Visit the Pet Store')), { wide: true });
}

// ---------------------------------------------------------------------------
export function openStore(ui, species = 'cat') {
  const g = ui.game;
  let band = 'all';
  const tabs = h('div', { class: 'tabs' });
  const chips = h('div', { class: 'chips' });
  const grid = h('div', { class: 'grid store' });
  const banner = h('p', { class: 'banner' });
  const render = () => {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === species));
    chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.b === band));
    banner.replaceChildren(...[
      g.p.firstAdoptFree ? h('b', {}, '🎁 Your first adoption is free! ') : null,
      `New ${SPECIES[species].name.toLowerCase()} arrive every day. 🏠 Rescue animals have low adoption fees — adopt, don't shop!`,
      g.pets.length >= MAX_PETS ? h('b', {}, ` Your home is full (${MAX_PETS} pets).`) : null].filter(Boolean));
    grid.replaceChildren();
    const items = listings(species).filter((l) => band === 'all' || l.band === band);
    if (!items.length) grid.append(h('p', { class: 'muted' }, 'None in this age group today — try tomorrow!'));
    for (const l of items) {
      const b = BREEDS[l.breed];
      const taken = g.p.adopted.includes(l.id);
      const pers = PERSONALITIES[l.personality];
      grid.append(h('div', { class: `card listing ${taken ? 'locked' : ''}`, onclick: () => !taken && meet(ui, l, () => openStore(ui, species)) },
        img(thumbnail(l.breed, l.coat, { months: l.months })),
        h('div', { class: 'badges' },
          h('span', { class: `badge ${l.rescue ? 'rescue' : ''}` }, l.rescue ? '🏠 Rescue' : '🏅 Breeder'),
          h('span', { class: 'badge' }, `${l.band === 'baby' ? SPECIES[species].baby : l.band}`)),
        h('div', { class: 'card-name' }, `${l.name} ${l.sex === 'male' ? '♂' : '♀'}`),
        h('div', { class: 'card-sub' }, `${b.name}`),
        h('div', { class: 'card-sub' }, h('i', { class: 'dot', style: `background:${coatSwatch(b, l.coat)}` }), ` ${b.coats[l.coat].name} · ${ageLabel(l.months)}`),
        h('div', { class: 'card-sub' }, `${pers.icon} ${pers.name}`),
        h('button', { class: `buy ${taken ? 'owned' : ''}`, disabled: taken }, taken ? 'Adopted ✓' : g.p.firstAdoptFree ? 'Meet · Free' : `Meet · 🪙 ${l.price}`)));
    }
  };
  for (const [t, sp] of Object.entries(SPECIES)) tabs.append(h('button', { 'data-t': t, onclick: () => { species = t; ui.sound.click(); render(); } }, `${sp.icon} ${sp.name}`));
  for (const [id, label] of AGE_FILTERS) chips.append(h('button', { class: 'chip', 'data-b': id, onclick: () => { band = id; render(); } }, label));
  render();
  ui.openSheet('🏪 Pet Store', h('div', {}, tabs, banner, chips, grid), { wide: true });
}

// ---------------------------------------------------------------------------
function meet(ui, l, back) {
  const g = ui.game;
  const b = BREEDS[l.breed];
  const pers = PERSONALITIES[l.personality];
  const sp = SPECIES[l.species];
  const fake = { ...l, ageAtAdoption: l.months, adoptedAt: Date.now() };
  const flat = FLAT[l.breed] || ['', ''];
  const nameIn = h('input', { type: 'text', maxlength: 16, value: l.name });
  const can = g.canAdopt(l);
  const she = pronoun(l); const her = pronoun(l, 'obj');
  const adopt = h('button', {
    class: 'primary', disabled: !can.ok,
    onclick: () => {
      const r = g.adopt(l, nameIn.value.trim() || l.name);
      if (!r.ok) { ui.sound.error(); ui.toast(r.why); return; }
      ui.sound.coin(); ui.sound.sparkle();
      ui.openSheet('🎉 Adopted!', h('div', { class: 'center' },
        img(thumbnail(l.breed, l.coat, { months: l.months }), 'thumb big'),
        h('h3', {}, `Welcome to the family, ${r.pet.name}!`),
        h('p', {}, `${r.pet.name} came with a bag of the food ${she}'s used to. ${l.band === 'baby' ? `${sp.baby[0].toUpperCase() + sp.baby.slice(1)}s need small, frequent meals, lots of sleep and gentle handling.` : ''}`),
        h('p', { class: 'muted small' }, `${pers.about} Trust starts at ${Math.round(r.pet.bond)} — be patient and consistent.`),
        h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: () => { ui.closeSheet(); ui.a.switchPet(r.pet.id); } }, `Bring ${r.pet.name} home now`),
          h('button', { onclick: () => openProfile(ui) }, 'Later'))));
    },
  }, can.ok ? (can.price ? `Adopt for 🪙 ${can.price}` : 'Adopt — free!') : can.why);
  ui.openSheet(`${sp.icon} Meet ${l.name}`, h('div', { class: 'meet' },
    img(thumbnail(l.breed, l.coat, { months: l.months }), 'thumb big'),
    h('div', { class: 'badges' },
      h('span', { class: `badge ${l.rescue ? 'rescue' : ''}` }, l.rescue ? '🏠 Rescue' : '🏅 Breeder'),
      h('span', { class: 'badge' }, `${l.sex === 'male' ? '♂ Male' : '♀ Female'}`),
      h('span', { class: 'badge' }, `${ageLabel(l.months)} · ${stageName(fake)}`),
      h('span', { class: 'badge' }, b.coats[l.coat].name)),
    h('p', {}, h('b', {}, `${b.name}. `), b.about),
    h('p', {}, h('b', {}, `${pers.icon} ${pers.name}: `), pers.about),
    h('div', { class: 'meters' },
      meter('Energy', b.traits.energy), meter('Voice', b.traits.vocal), meter('Cuddles', b.traits.cuddly), meter('Independence', b.traits.independent),
      meter('Grooming', Math.min(1, (b.groomRate || 1) / 1.3))),
    h('p', { class: 'small' }, h('b', {}, `Flat / hostel life: ${flat[0]}. `), flat[1]),
    h('p', { class: 'small muted' }, `Adult weight ${l.species === 'hamster' ? `${Math.round(b.kg[0] * 1000)}–${Math.round(b.kg[1] * 1000)} g` : `${b.kg[0]}–${b.kg[1]} kg`}. ${l.species === 'dog' ? 'Needs daily walks, training and company.'
      : l.species === 'hamster' ? 'Needs a tank of at least 100 × 50 cm with deep bedding, a solid wheel (28 cm+ for a Syrian), a hide and a sand bath. Lives alone. Lifespan only 2–3 years.'
        : 'Needs a litter box, scratching post and daily play.'} ${she[0].toUpperCase() + she.slice(1)} will grow up in real time — you'll raise ${her} from ${ageLabel(l.months)}.`),
    (b.health ? h('p', { class: 'small' }, h('b', {}, '🧬 Breed health: '),
      `median lifespan ${b.health.lifespan} years · common conditions: ${b.health.conditions.join(', ')}${b.health.brachycephalic ? ' · flat-faced: breathing problems and overheating' : ''} · health grade ${b.health.grade}. `,
      h('a', { href: b.health.url || 'https://breedhealthscore.com', target: '_blank', rel: 'noopener' }, 'Breed Health Score')) : null),
    b.modelNote ? h('p', { class: 'small muted' }, `ℹ️ ${b.modelNote}`) : null,
    h('label', { class: 'form' }, 'Name', nameIn),
    h('div', { class: 'row' }, adopt, h('button', { onclick: back }, 'Back'))), { wide: true });
}
