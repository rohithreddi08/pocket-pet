// ============================================================================
// world.js — the real world around your pet.
// ----------------------------------------------------------------------------
// · Weather + sunrise/sunset: Open-Meteo (open-meteo.com, CC BY 4.0, no key) —
//   only after you opt in (Settings → Real world) with a city or your location.
// · Festivals with fireworks: caldays (caldays.com, CC BY 4.0, no key) public
//   holidays for your country, plus fixed fireworks nights (New Year's Eve,
//   Bonfire Night).
// · Dog breed health: Breed Health Score (breedhealthscore.com, CC BY 4.0),
//   saved by app.py to data/breed-health.json.
// · Food energy: USDA FoodData Central (public domain), saved by app.py to
//   data/ingredients-fdc.json.
// Everything degrades gracefully: offline, the game uses its built-in values.
// ============================================================================
import { BREEDS } from './species.js';
import { INGREDIENTS } from './cooking.js';

export const WORLD = {
  weather: null,            // {temp, feels, code, rain, snow, storm, cloud, icon, label, place, at}
  sun: { rise: 6.5, set: 19, real: false },
  country: null,
  holidays: [],             // [{date, name}]
  breedHealth: null,        // {source, attribution, breeds: {id: {...}}}
  foodEnergy: null,
};
const listeners = new Set();
export const onWorld = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => { for (const fn of listeners) fn(WORLD); };

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`pocketpet.world.${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`pocketpet.world.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const getJSON = async (url, ms = 12000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
};

// ------------------------------------------------------------ country (for festivals)
const TZ_COUNTRY = {
  'Asia/Kolkata': 'in', 'Asia/Calcutta': 'in', 'Europe/London': 'gb', 'Europe/Dublin': 'ie', 'Australia/Sydney': 'au',
  'Australia/Melbourne': 'au', 'Asia/Singapore': 'sg', 'Asia/Dubai': 'ae', 'Asia/Karachi': 'pk', 'Asia/Dhaka': 'bd',
  'Asia/Kathmandu': 'np', 'Asia/Colombo': 'lk', 'America/Toronto': 'ca', 'America/Vancouver': 'ca', 'Pacific/Auckland': 'nz',
};
export function detectCountry() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  if (tz.startsWith('America/')) return 'us';
  for (const l of navigator.languages || [navigator.language]) {
    const m = /-([A-Za-z]{2})$/.exec(l || '');
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// ------------------------------------------------------------ weather codes (WMO, as Open-Meteo reports them)
export function describe(code) {
  if (code === 0) return { icon: '☀️', label: 'Clear', cloud: 0 };
  if (code <= 2) return { icon: '🌤️', label: 'Partly cloudy', cloud: 0.35 };
  if (code === 3) return { icon: '☁️', label: 'Overcast', cloud: 0.85 };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog', cloud: 0.9, fog: true };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle', cloud: 0.8, rain: 0.35 };
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: code >= 65 ? 'Heavy rain' : 'Rain', cloud: 0.9, rain: code >= 65 ? 1 : 0.7 };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow', cloud: 0.85, snow: 0.7 };
  if (code >= 80 && code <= 82) return { icon: '🌧️', label: 'Showers', cloud: 0.8, rain: code === 82 ? 1 : 0.6 };
  if (code === 85 || code === 86) return { icon: '🌨️', label: 'Snow showers', cloud: 0.8, snow: 0.8 };
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm', cloud: 1, rain: 0.9, storm: true };
  return { icon: '🌡️', label: 'Weather', cloud: 0.3 };
}

const hourOf = (iso) => { const m = /T(\d\d):(\d\d)/.exec(iso || ''); return m ? +m[1] + +m[2] / 60 : null; };

/** Find a place by name (Open-Meteo geocoding). */
export async function geocode(name) {
  const r = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
  const p = r.results?.[0];
  if (!p) return null;
  return { lat: +p.latitude.toFixed(2), lon: +p.longitude.toFixed(2), place: [p.name, p.admin1, p.country].filter(Boolean).join(', '), country: (p.country_code || '').toLowerCase() };
}

/** Current weather + today's sunrise/sunset for a place (cached 20 min). */
export async function fetchWeather(loc, force = false) {
  const cached = store.get('weather');
  if (!force && cached && cached.lat === loc.lat && cached.lon === loc.lon && Date.now() - cached.at < 20 * 60000) {
    applyWeather(cached);
    return WORLD.weather;
  }
  const q = `latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code,is_day,wind_speed_10m&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
  const r = await getJSON(`https://api.open-meteo.com/v1/forecast?${q}`);
  const c = r.current || {};
  const w = {
    lat: loc.lat, lon: loc.lon, place: loc.place, at: Date.now(),
    temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, wind: c.wind_speed_10m, precip: c.precipitation,
    rise: hourOf(r.daily?.sunrise?.[0]), set: hourOf(r.daily?.sunset?.[0]),
  };
  store.set('weather', w);
  applyWeather(w);
  return WORLD.weather;
}
function applyWeather(w) {
  WORLD.weather = { ...w, ...describe(w.code) };
  if (w.rise != null && w.set != null) WORLD.sun = { rise: w.rise, set: w.set, real: true };
  changed();
}
export function clearWeather() {
  WORLD.weather = null;
  WORLD.sun = { rise: 6.5, set: 19, real: false };
  changed();
}

// ------------------------------------------------------------ festivals with fireworks
/** Public holidays for the country (caldays), cached a week. */
export async function fetchHolidays(cc) {
  if (!cc) return [];
  const year = new Date().getFullYear();
  const key = `holidays.${cc}.${year}`;
  const cached = store.get(key);
  if (cached && Date.now() - cached.at < 7 * 864e5) { WORLD.holidays = cached.list; return cached.list; }
  const r = await getJSON(`https://caldays.com/api/holidays/${cc}`);
  const list = (r.holidays || []).map((x) => ({ date: x.date, name: x.name }));
  store.set(key, { at: Date.now(), list });
  WORLD.holidays = list;
  changed();
  return list;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/**
 * Fireworks nights near this date for this country: [{name, day (YYYY-MM-DD), from, to (hours on that day; to may
 * pass midnight)}]. Diwali and US Independence Day come from the holiday list; the rest are fixed dates.
 */
export function fireworksNights(cc, holidays, year) {
  const out = [{ name: "New Year's Eve fireworks", day: `${year}-12-31`, from: 21, to: 25 }, { name: "New Year's Eve fireworks", day: `${year - 1}-12-31`, from: 21, to: 25 }];
  if (cc === 'gb') out.push({ name: 'Bonfire Night fireworks', day: `${year}-11-05`, from: 18, to: 23.5 });
  for (const h of holidays) {
    const n = h.name.toLowerCase();
    if (cc === 'in' && (n.includes('diwali') || n.includes('deepavali'))) {
      out.push({ name: 'Diwali fireworks', day: h.date, from: 18, to: 24.5 });
      const eve = new Date(`${h.date}T12:00`); eve.setDate(eve.getDate() - 1);
      out.push({ name: 'Diwali fireworks (Choti Diwali)', day: ymd(eve), from: 18.5, to: 23 });
    }
    if (cc === 'us' && n === 'independence day') out.push({ name: 'Fourth of July fireworks', day: h.date, from: 20, to: 24 });
  }
  return out;
}
/** Fireworks happening right now, or null. */
export function fireworksNow(now = new Date()) {
  const nights = fireworksNights(WORLD.country, WORLD.holidays, now.getFullYear());
  for (const f of nights) {
    const start = new Date(`${f.day}T00:00`).getTime() + f.from * 3.6e6;
    const end = new Date(`${f.day}T00:00`).getTime() + f.to * 3.6e6;
    if (now.getTime() >= start && now.getTime() < end) return f;
  }
  return null;
}
/** A fireworks night later today (for the morning warning), or null. */
export function fireworksTonight(now = new Date()) {
  const today = ymd(now);
  return fireworksNights(WORLD.country, WORLD.holidays, now.getFullYear()).find((f) => f.day === today) || null;
}
/** Loud noises scaring pets right now: fireworks or a thunderstorm. */
export function noiseNow(now = new Date()) {
  const f = fireworksNow(now);
  if (f) return { kind: 'fireworks', name: f.name };
  if (WORLD.weather?.storm && Date.now() - WORLD.weather.at < 3 * 3.6e6) return { kind: 'thunder', name: 'Thunderstorm' };
  return null;
}

// ------------------------------------------------------------ data saved by app.py
async function loadLocalData() {
  try {
    const d = await getJSON('./data/breed-health.json');
    WORLD.breedHealth = d;
    for (const [id, h] of Object.entries(d.breeds || {})) if (BREEDS[id]) BREEDS[id].health = { ...h, source: d.source, sourceUrl: d.sourceUrl };
  } catch { /* not synced yet */ }
  try {
    const d = await getJSON('./data/ingredients-fdc.json');
    WORLD.foodEnergy = d;
    for (const [id, f] of Object.entries(d.foods || {})) {
      if (INGREDIENTS[id] && Number.isFinite(f.kcal)) Object.assign(INGREDIENTS[id], { kcal: f.kcal, fdc: f.description, fdcId: f.fdcId });
    }
  } catch { /* not synced yet */ }
}

/**
 * Start everything. settings: game.s.settings ({world: {weather, lat, lon, place, country}}).
 * Weather refreshes every 20 minutes while the app is open.
 */
export async function startWorld(game) {
  await loadLocalData();
  const ws = game.s.settings.world || {};
  WORLD.country = ws.country || detectCountry();
  fetchHolidays(WORLD.country).catch(() => {});
  const refresh = () => {
    const cur = game.s.settings.world || {};
    if (cur.weather && cur.lat != null) fetchWeather({ lat: cur.lat, lon: cur.lon, place: cur.place }).catch(() => {});
  };
  refresh();
  setInterval(refresh, 20 * 60000);
  changed();
}
