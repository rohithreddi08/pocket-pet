// ============================================================================
// ui/health.js — the 🩺 Health sheet: how the pet is, symptoms, the vet,
// medicine at home and preventive care.
// ============================================================================
import { h } from './dom.js';
import { CONDITIONS, VET, symptomsOf, healthLabel, prevention, dosesDue } from '../state.js';
import { breedOf, weightKg } from '../species.js';

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const bar = (v, cls = '') => h('div', { class: `hbar ${cls}` }, h('i', { style: `width:${Math.round(v)}%;background:${v > 70 ? '#40c057' : v > 40 ? '#fab005' : '#fa5252'}` }));
const BCS = ['', 'Emaciated', 'Very thin', 'Thin', 'Slightly lean', 'Ideal', 'Slightly heavy', 'Overweight', 'Obese', 'Severely obese'];

export function openHealth(ui) {
  const g = ui.game;
  const pet = g.pet;
  const hl = g.health;
  const name = g.s.name || 'Your pet';
  const ham = pet.species === 'hamster';
  const rerender = () => openHealth(ui);
  const pay = (r, okText) => {
    if (!r.ok) { ui.sound.error(); ui.toast(r.why, 'big'); return; }
    ui.sound.coin(); if (okText || r.text) ui.toast(okText || r.text, 'big'); rerender();
  };

  // --- summary
  const bcs = Math.round(hl.bcs);
  const kg = weightKg(pet) * (1 + (hl.bcs - 5) * 0.1);
  const summary = h('div', { class: 'hsum' },
    h('div', {}, h('b', {}, `${healthLabel(hl)} · ${Math.round(hl.score)}/100`), bar(hl.score)),
    h('div', { class: 'small' }, `⚖️ ${ham ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(1)} kg`} · body condition ${bcs}/9 (${BCS[bcs]})`));

  // --- conditions
  const conds = Object.entries(hl.conds);
  const undiagnosed = conds.filter(([, c]) => !c.dx);
  const due = dosesDue(pet);
  const list = h('div', { class: 'hconds' });
  if (!conds.length) list.append(h('p', { class: 'muted' }, `No signs of illness. Keep it that way: food, water, a clean ${ham ? 'tank' : pet.species === 'dog' ? 'home and regular walks' : 'litter box'}, grooming and play every day.`));
  for (const [id, c] of conds) {
    const def = CONDITIONS[id];
    const sym = symptomsOf(id, pet.species);
    if (!c.dx) {
      list.append(h('div', { class: 'hcond' },
        h('div', { class: 'hc-head' }, h('b', {}, `❓ ${name} is ${sym[0]}`), bar(100 - c.sev * 100, 'thin')),
        h('p', { class: 'small' }, `Other signs: ${sym.slice(1).join(', ') || '—'}. Since ${ago(c.since)}.`),
        h('p', { class: 'small muted' }, 'You can\'t tell what\'s wrong from symptoms alone — a vet can.')));
      continue;
    }
    const d = due.find((x) => x.id === id);
    const actions = [];
    if (!c.treated && def.treat.kind !== 'care') {
      actions.push(h('button', { class: 'primary', onclick: () => pay(g.vetTreat(id)) }, `${def.treat.what} · 🪙 ${def.treat.price}`));
    }
    if (d) {
      actions.push(h('button', {
        class: d.due ? 'primary' : '', onclick: () => {
          const r = g.giveMedicine(id);
          if (!r.ok) { ui.sound.error(); ui.toast(r.why, 'big'); return; }
          ui.sound.pop();
          ui.toast(r.left ? `💊 Dose given — ${r.left} to go. ${name} wasn't thrilled, but it's working.` : '💊 Course finished! Finishing every dose matters — stopping early lets illness come back.', 'big');
          rerender();
        },
      }, d.due ? `💊 Give dose now${d.late ? ' (late!)' : ''}` : `💊 Next dose in ${Math.max(1, Math.ceil((d.c.course.nextAt - Date.now()) / 3.6e6))} h`));
    }
    const course = c.course ? ` · medicine ${c.course.given}/${c.course.doses}` : '';
    list.append(h('div', { class: 'hcond dx' },
      h('div', { class: 'hc-head' }, h('b', {}, `${def.icon} ${def.name}`), bar(100 - c.sev * 100, 'thin')),
      h('p', { class: 'small' }, `Signs: ${sym.join(', ')}. ${def.cause}`),
      h('p', { class: 'small' }, h('b', {}, c.treated ? `✅ Being treated${course}. ` : def.treat.kind === 'care' ? '🏠 Treat at home: ' : '⚠️ Not treated yet. '), def.treat.kind === 'care' ? def.treat.what : '', ' ', h('i', {}, def.advice)),
      actions.length ? h('div', { class: 'row wrap' }, ...actions) : null));
  }

  // --- vet
  const vet = h('div', { class: 'row wrap' },
    h('button', { class: undiagnosed.length ? 'primary' : '', onclick: () => {
      const r = g.vetConsult();
      if (!r.ok) { ui.sound.error(); ui.toast(r.why); return; }
      ui.sound.coin();
      ui.toast(r.ids.length ? `🩺 The vet examined ${name}: ${r.ids.map((i) => CONDITIONS[i].name).join(', ')}.` : `🩺 The vet says ${name} is healthy!`, 'big');
      rerender();
    } }, `${VET.consult.icon} ${ham ? 'Exotics vet' : 'Vet'} consultation · 🪙 ${VET.consult.price}`));

  // --- prevention
  const prev = prevention(pet);
  const prevRows = [
    !ham ? ['vaccine', `Vaccinations (${pet.species === 'cat' ? 'cat flu, enteritis; rabies where required' : 'distemper, parvo, hepatitis, kennel cough; rabies where required'})`, hl.vaccinatedAt, 365] : null,
    !ham ? ['parasite', 'Flea & worm treatment', hl.parasiteAt, 30] : null,
    ['checkup', 'Yearly health check', hl.checkupAt, 365],
  ].filter(Boolean).map(([id, label, at, days]) => {
    const over = prev.find((p) => p.id === id);
    const left = Math.round(days - (Date.now() - at) / 864e5);
    return h('div', { class: 'hprev' },
      h('span', {}, `${VET[id].icon} ${label}`),
      h('small', { class: over ? 'warn' : 'muted' }, over ? `overdue by ${over.overdue} days` : `next in ${left} days`),
      h('button', { class: over ? 'primary small' : 'small', onclick: () => pay(g.vetPrevent(id), `${VET[id].icon} ${VET[id].name} done.`) }, `🪙 ${VET[id].price}`));
  });
  if (ham) prevRows.push(h('p', { class: 'small muted' }, `Hamsters aren't vaccinated. 🦷 Teeth: give a fresh wooden chew (Shop → Food) at least every two weeks — last one ${ago(hl.lastChewAt)}.`));

  const emergency = h('details', { class: 'small' },
    h('summary', {}, '🚑 In real life, go to a vet straight away if…'),
    h('ul', {},
      ...(ham
        ? ['wet, dirty bottom or diarrhoea (wet tail)', 'not eating or drinking for a day', 'breathing with clicks or open mouth', 'bleeding, or a lump that grows']
        : ['it strains to pee and nothing comes out (especially male cats)', 'it hasn\'t eaten for a day (cats) or keeps vomiting', 'breathing is laboured or gums are pale/blue', 'it collapses, has a seizure or ate something toxic'])
        .map((t) => h('li', {}, t))));

  const log = h('details', { class: 'small' }, h('summary', {}, '📜 Health history'),
    h('ul', {}, ...hl.log.slice(-10).reverse().map((e) => h('li', {}, `${ago(e.t)} — ${e.text}`))));

  ui.openSheet(`🩺 ${name}'s health`, h('div', { class: 'health' },
    summary,
    h('h3', {}, 'Right now'), list,
    h('h3', {}, 'The vet'), vet,
    h('h3', {}, 'Prevention'), ...prevRows,
    emergency, log,
    h('p', { class: 'muted small' }, `Health changes in real time — also while the app is closed. ${breedOf(pet).name}s are cared for best with a steady daily routine. This simulates common illnesses; it is not veterinary advice.`)), { wide: true });
}
