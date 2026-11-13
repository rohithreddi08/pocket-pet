// ============================================================================
// ui/health.js — the 🩺 Health sheet: how the pet is, symptoms, the vet,
// medicine at home and preventive care.
// ============================================================================
import { h } from './dom.js';
import { CONDITIONS, VET, symptomsOf, healthLabel, prevention, dosesDue, verdict, treatPrice } from '../state.js';
import { breedOf, weightKg, ageMonths } from '../species.js';
import { frailty } from '../health.js';

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

  // --- medical report: every illness with the vet's verdict — cure it, control it, or care at home
  const conds = Object.entries(hl.conds);
  const undiagnosed = conds.filter(([, c]) => !c.dx);
  const due = dosesDue(pet);
  const list = h('div', { class: 'hconds' });
  const BADGE = {
    unknown: ['❓', 'Not diagnosed yet', '#868e96'],
    cure: ['💊', 'Curable', '#1c7ed6'],
    critical: ['🚑', 'Critical', '#e03131'],
    curing: ['💊', 'Being cured', '#1c7ed6'],
    control: ['🔁', 'Can’t be cured — can be controlled', '#e8590c'],
    controlled: ['✅', 'Under control', '#2f9e44'],
    care: ['🏠', 'Care at home', '#7048e8'],
  };
  for (const [id, c] of conds) {
    const def = CONDITIONS[id];
    const sym = symptomsOf(id, pet.species);
    const v = verdict(id, c);
    const [bi, bt, bc] = BADGE[v];
    const badge = h('span', { class: 'hbadge', style: `background:${bc}` }, `${bi} ${bt}`);
    if (v === 'unknown') {
      list.append(h('div', { class: 'hcond' },
        h('div', { class: 'hc-head' }, h('b', {}, `${name} is ${sym[0]}`), badge),
        bar(100 - c.sev * 100, 'thin'),
        h('p', { class: 'small' }, `Other signs: ${sym.slice(1).join(', ') || '—'}. Since ${ago(c.since)}.`),
        h('p', { class: 'small muted' }, 'You can’t tell what’s wrong from symptoms alone — book a vet consultation below to find out, and whether it can be cured.')));
      continue;
    }
    const d = due.find((x) => x.id === id);
    const price = treatPrice(pet, id);
    const actions = [];
    let plan;
    if (v === 'cure') {
      plan = def.treat.kind === 'procedure'
        ? `This can be cured: ${def.treat.what.toLowerCase()} at the vet.`
        : `This can be cured: ${def.treat.what.toLowerCase()} — ${def.treat.doses} doses, one every ${def.treat.every} h. Give every dose and it goes away completely.`;
      actions.push(h('button', { class: 'primary', onclick: () => pay(g.vetTreat(id)) }, `💊 ${def.treat.kind === 'procedure' ? def.treat.what : 'Medicine to cure it'} · 🪙 ${price}`));
    } else if (v === 'critical') {
      plan = `It has gone too far to cure straight away. Emergency care controls it first (fluids, pain relief, support), then ${def.treat.kind === 'procedure' ? 'the vet treats it' : `the ${def.treat.doses}-dose course cures it`}. Don’t wait — it is getting worse.`;
      actions.push(h('button', { class: 'primary danger', onclick: () => pay(g.vetTreat(id)) }, `🚑 Emergency care to control it · 🪙 ${price}`));
    } else if (v === 'curing') {
      const cc = c.course;
      plan = cc && cc.given < cc.doses
        ? `On the cure: medicine ${Math.floor(cc.given)}/${cc.doses}. Keep giving it on time — stopping early lets it come back.`
        : `Treated — ${name} is recovering. Nothing more to buy; keep up good care.`;
    } else if (v === 'control' || v === 'controlled') {
      if (def.treat.kind === 'manage') {
        const cc = c.course;
        plan = v === 'controlled'
          ? `Controlled with ${def.treat.what.toLowerCase()}: day ${Math.floor(cc.given)} of ${cc.doses} on this prescription. It won’t go away, but on medicine it barely progresses.`
          : `${cc ? 'The prescription ran out or doses are late — it is getting worse again' : 'There’s no cure, but medicine controls it'}: ${def.treat.what.toLowerCase()}.`;
        if (!cc || cc.given >= cc.doses) actions.push(h('button', { class: 'primary', onclick: () => pay(g.vetTreat(id)) }, `${cc ? '🔁 Refill medicine' : '💊 Medicine to control it'} · 🪙 ${price}`));
      } else {
        plan = `It keeps coming back with age. ${def.treat.what} resets it; good home care slows it.`;
        if (c.sev > 0.3) actions.push(h('button', { class: 'primary', onclick: () => pay(g.vetTreat(id)) }, `${def.treat.what} · 🪙 ${price}`));
      }
    } else {
      plan = `No medicine needed — it gets better with care: ${def.treat.what.toLowerCase()}.`;
    }
    if (d) {
      actions.push(h('button', {
        class: d.due ? 'primary' : '', onclick: () => {
          const r = g.giveMedicine(id);
          if (!r.ok) { ui.sound.error(); ui.toast(r.why, 'big'); return; }
          ui.sound.pop();
          ui.toast(r.left ? `💊 Dose given — ${r.left} to go. ${name} wasn’t thrilled, but it’s working.` : def.treat.kind === 'manage' ? '💊 Last dose of this prescription — refill it to keep it under control.' : '💊 Course finished! Finishing every dose matters — stopping early lets illness come back.', 'big');
          rerender();
        },
      }, d.due ? `💊 Give dose now${d.late ? ' (late!)' : ''}` : `💊 Next dose in ${Math.max(1, Math.ceil((d.c.course.nextAt - Date.now()) / 3.6e6))} h`));
    }
    list.append(h('div', { class: `hcond dx v-${v}` },
      h('div', { class: 'hc-head' }, h('b', {}, `${def.icon} ${def.name}`), badge),
      bar(100 - c.sev * 100, 'thin'),
      h('p', { class: 'small' }, `Signs: ${sym.join(', ')}. ${def.cause}`),
      h('p', { class: 'small' }, h('b', {}, 'Vet’s plan: '), plan, ' ', h('i', {}, def.advice)),
      actions.length ? h('div', { class: 'row wrap' }, ...actions) : null));
  }
  // cured lately — it's over, nothing to do
  const cured = (hl.cured || []).filter((x) => Date.now() - x.at < 14 * 864e5 && !hl.conds[x.id] && CONDITIONS[x.id]).reverse();
  for (const x of cured) {
    list.append(h('div', { class: 'hcond v-cured' },
      h('div', { class: 'hc-head' }, h('b', {}, `${CONDITIONS[x.id].icon} ${CONDITIONS[x.id].name}`), h('span', { class: 'hbadge', style: 'background:#2f9e44' }, '✅ Cured')),
      h('p', { class: 'small' }, `Cured ${ago(x.at)} — it’s okay now, no more medicine needed. Keep up the care so it doesn’t come back.`)));
  }
  if (!conds.length) list.prepend(h('p', {}, `✅ ${name} is healthy — no illness found.`));

  // --- tips to improve health, from how things actually are right now
  const tips = healthTips(g, pet, name, ham, conds, due);

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
    ...seniorNote(pet, name, ham),
    h('h3', {}, '📋 Medical report'), list,
    h('h3', {}, '💡 Tips to improve health'), h('ul', { class: 'htips small' }, ...tips.map((t) => h('li', {}, t))),
    h('h3', {}, 'The vet'), vet,
    h('h3', {}, 'Prevention'), ...prevRows,
    emergency, log,
    h('p', { class: 'muted small' }, `Health changes in real time — also while the app is closed. ${breedOf(pet).name}s are cared for best with a steady daily routine. This simulates common illnesses; it is not veterinary advice.`)), { wide: true });
}

/** Older pets: what to watch for and how to keep the senior years good. No ages or lifespans — the body tells you. */
function seniorNote(pet, name, ham) {
  const fr = frailty(pet, ageMonths(pet));
  if (fr < 0.25) return [];
  const her = pet.sex === 'male' ? 'him' : 'her';
  const lines = fr > 0.75
    ? `${name} is very frail now. Keep ${her} warm and comfortable, with food, water and ${ham ? 'nest' : pet.species === 'dog' ? 'bed' : 'litter'} close by, and spend quiet time together. Talk to the vet about comfort care and how to keep each day a good one.`
    : `${name} is slowing down — sleeping more and moving more carefully. Senior check-ups ${ham ? 'with an exotics vet' : 'twice a year (with blood tests)'} catch age-related illness early, when it's easiest to manage.`;
  return [h('div', { class: 'hcond', style: 'border-color:#e9d7f5;background:#fbf7ff' }, h('p', { class: 'small' }, h('b', {}, '🕯️ Senior years · '), lines))];
}

/** Practical tips, most urgent first, from the pet's needs, body, routine and illnesses. */
function healthTips(g, pet, name, ham, conds, due) {
  const t = [];
  const n = g.needs; const hl = pet.health; const nl = hl.neglect || {};
  const dog = pet.species === 'dog';
  const crit = conds.filter(([id, c]) => c.dx && verdict(id, c) === 'critical');
  if (crit.length) t.push(`🚑 Treat ${crit.map(([id]) => CONDITIONS[id].name.toLowerCase()).join(' and ')} today — critical illness gets worse fast.`);
  if (conds.some(([, c]) => !c.dx)) t.push('🩺 Something is wrong — a vet consultation finds out what, and whether it can be cured.');
  if (due.some((d) => d.late)) t.push('⏰ A dose is late. Give it now and keep to the schedule — late medicine works less well.');
  else if (due.some((d) => d.due)) t.push('💊 Medicine is due — give it on time.');
  if (conds.some(([id, c]) => c.dx && verdict(id, c) === 'control')) t.push('🔁 Keep long-term illnesses on daily medicine and refill before it runs out — controlled, they barely progress.');
  if (n.water < 40) t.push(`💧 Fresh water now — ${name} is thirsty. ${ham ? 'Check the bottle spout works.' : 'Clean the bowl daily.'}`);
  if (n.food < 40) t.push(`🍽️ ${name} is hungry. Feed measured meals on a regular schedule.`);
  if (hl.bcs >= 7) t.push(`⚖️ ${name} is overweight: measure portions, keep treats under 10% of food, and add ${dog ? 'longer walks' : 'more play'}. Extra weight leads to diabetes, joint pain and a shorter life.`);
  else if (hl.bcs <= 3.5) t.push(`⚖️ ${name} is too thin: small, frequent, good-quality meals${conds.length ? ', and ask the vet why' : ''}.`);
  if (n.groom < 40 || nl.dirty > 0 || nl.unbrushed > 0) t.push(`🪮 ${ham ? 'Spot-clean the tank daily and change bedding weekly' : dog ? 'Brush and clean up after walks' : 'Scoop the litter daily and brush the coat'} — dirt and mats cause skin infections.`);
  if (n.play < 40 || nl.bored > 0) t.push(`🎾 More ${dog ? 'walks and play' : ham ? 'wheel time, tunnels and things to explore' : 'play — two short wand-toy sessions a day'}: boredom causes stress, which weakens health.`);
  if (n.energy < 30) t.push(`😴 Let ${name} rest somewhere quiet and warm.`);
  for (const p of prevention(pet)) t.push(`${VET[p.id].icon} ${VET[p.id].name} is overdue by ${p.overdue} days — prevention costs far less than treatment.`);
  if (ham && Date.now() - (hl.lastChewAt || 0) > 10 * 864e5) t.push('🪵 Give a fresh wooden chew — hamster teeth never stop growing.');
  if (frailty(pet, ageMonths(pet)) >= 0.25) t.push(`🕯️ ${name} is getting older: check-ups ${ham ? 'with an exotics vet' : 'every 6 months'}, softer food, and a bed that’s easy to reach.`);
  if (t.length < 3) {
    t.push(`🗓️ A steady routine — meals, ${dog ? 'walks' : 'play'} and sleep at the same times every day — keeps ${name} calm and healthy.`);
    t.push('👀 Watch for small changes in eating, drinking, toileting or energy — illness caught early is easier to cure.');
    if (!ham) t.push('🩺 Yearly check-ups and vaccinations prevent most serious illness.');
  }
  return t.slice(0, 7);
}
