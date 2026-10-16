// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// Tonight from where you are: dark hours, Moon, planets, the best showpieces, and your horizon drawn on the sky.
// Ephemerides: astronomy-engine (MIT, Don Cross), computed in the browser.
import { el, num, store, toast } from './util.js';
import * as S from './sky.js';

const AE = () => window.Astronomy;
const DEFAULT_LOC = { lat: 37.7749, lon: -122.4194, name: 'San Francisco (default — set yours)' };
const CITIES = [['San Francisco', 37.7749, -122.4194], ['Los Angeles', 34.0522, -118.2437], ['Denver', 39.7392, -104.9903], ['New York', 40.7128, -74.006],
  ['London', 51.5072, -0.1276], ['Paris', 48.8566, 2.3522], ['Tokyo', 35.6762, 139.6503], ['Sydney', -33.8688, 151.2093],
  ['Santiago', -33.4489, -70.6693], ['Cape Town', -33.9249, 18.4241], ['Mumbai', 19.076, 72.8777], ['Honolulu', 21.3069, -157.8583]];
const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const SHOWPIECES = [
  ['Andromeda Galaxy (M31)', 10.6847, 41.269, 'galaxy'], ['Orion Nebula (M42)', 83.8221, -5.3911, 'nebula'], ['Pleiades (M45)', 56.75, 24.1167, 'cluster'],
  ['Hercules Cluster (M13)', 250.4235, 36.4613, 'globular'], ['Ring Nebula (M57)', 283.3963, 33.0292, 'planetary nebula'], ['Dumbbell Nebula (M27)', 299.9016, 22.7212, 'planetary nebula'],
  ['Whirlpool Galaxy (M51)', 202.4696, 47.1952, 'galaxy'], ["Bode's Galaxy (M81)", 148.8882, 69.0653, 'galaxy'], ['Cigar Galaxy (M82)', 148.9685, 69.6797, 'galaxy'],
  ['Pinwheel Galaxy (M101)', 210.8023, 54.3488, 'galaxy'], ['Sombrero Galaxy (M104)', 189.9976, -11.6231, 'galaxy'], ['Lagoon Nebula (M8)', 270.9042, -24.3867, 'nebula'],
  ['Eagle Nebula (M16)', 274.7, -13.8067, 'nebula'], ['Omega Nebula (M17)', 275.1958, -16.1717, 'nebula'], ['Trifid Nebula (M20)', 270.6, -23.03, 'nebula'],
  ['Triangulum Galaxy (M33)', 23.4621, 30.6599, 'galaxy'], ['Beehive Cluster (M44)', 130.1, 19.6667, 'cluster'], ['M3 globular cluster', 205.5484, 28.3773, 'globular'],
  ['M22 globular cluster', 279.0998, -23.9048, 'globular'], ['Double Cluster', 34.75, 57.13, 'cluster'], ['North America Nebula', 314.75, 44.33, 'nebula'],
  ['Veil Nebula', 311.42, 30.72, 'supernova remnant'], ['Helix Nebula', 337.4108, -20.8372, 'planetary nebula'], ['Omega Centauri', 201.697, -47.4795, 'globular'],
  ['47 Tucanae', 6.0236, -72.0813, 'globular'], ['Large Magellanic Cloud', 80.8942, -69.7561, 'galaxy'], ['Small Magellanic Cloud', 13.1867, -72.8286, 'galaxy'],
  ['Carina Nebula', 161.265, -59.8667, 'nebula'], ['Crab Nebula (M1)', 83.6331, 22.0145, 'supernova remnant'], ['Galactic Centre', 266.4168, -29.0078, 'Milky Way core'],
  ['Albireo', 292.6804, 27.9597, 'double star'], ['Betelgeuse', 88.7929, 7.4071, 'red supergiant'], ['Vega', 279.2347, 38.7837, 'star'],
  ['Centaurus A', 201.3651, -43.0191, 'galaxy'], ['Sculptor Galaxy', 11.888, -25.2883, 'galaxy'], ['M87 (the first black hole image)', 187.7059, 12.3911, 'galaxy'],
  ["Cat's Eye Nebula", 269.6392, 66.6331, 'planetary nebula'], ['M35', 92.225, 24.3333, 'cluster'], ['Wild Duck Cluster (M11)', 282.7708, -6.2667, 'cluster'],
  ['Butterfly Cluster (M6)', 265.0833, -32.2533, 'cluster'], ['Ptolemy Cluster (M7)', 268.4625, -34.7928, 'cluster'],
];

let loc = store('loc') || DEFAULT_LOC;
let horizonOn = store('horizon') ?? false;
let solarOn = store('solar') ?? true;
let tick = null;

const obs = () => new (AE().Observer)(loc.lat, loc.lon, 0);
const t = (d) => AE().MakeTime(d || new Date());
const hhmm = (at) => (at ? at.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
function altOf(ra, dec, d) { return AE().Horizon(t(d), obs(), ra / 15, dec, 'normal'); }

function phaseName(deg) {
  const n = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return n[Math.round(deg / 45) % 8];
}

export function buildTonight(host) {
  host.innerHTML = '';
  const locBox = el('div', { class: 'loc' });
  const body = el('div', {});
  host.append(el('section', { class: 'rep-sec' }, el('h3', {}, 'Your sky'), locBox), body);
  const renderLoc = () => {
    const sel = el('select', { onchange: (e) => { if (!e.target.value) return; const c = CITIES[+e.target.value]; setLoc({ lat: c[1], lon: c[2], name: c[0] }); } },
      el('option', { value: '' }, 'Pick a city…'), ...CITIES.map((c, i) => el('option', { value: i }, c[0])));
    const la = el('input', { type: 'number', step: '0.01', value: loc.lat.toFixed(3), 'aria-label': 'latitude', class: 'num' });
    const lo = el('input', { type: 'number', step: '0.01', value: loc.lon.toFixed(3), 'aria-label': 'longitude', class: 'num' });
    locBox.replaceChildren(el('div', { class: 'small' }, el('b', {}, loc.name)),
      el('div', { class: 'loc-row' }, sel, la, lo, el('button', { class: 'btn small', onclick: () => {
        const a = +la.value; const b = +lo.value;
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) setLoc({ lat: a, lon: b, name: `${a.toFixed(2)}°, ${b.toFixed(2)}°` });
      } }, 'Set')),
      el('button', { class: 'btn small', onclick: () => {
        if (!navigator.geolocation) { toast('This browser has no location service.'); return; }
        navigator.geolocation.getCurrentPosition((p) => setLoc({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'My location' }),
          () => toast('Location blocked here (browsers only share it over https). Type your latitude/longitude instead.', 6000), { timeout: 8000 });
      } }, '📍 Use my location'));
  };
  const setLoc = (l) => { loc = l; store('loc', l); renderLoc(); render(); drawSky(); };
  const render = () => renderBody(body);
  renderLoc(); render(); drawSky();
  clearInterval(tick);
  tick = setInterval(() => { if (!host.isConnected) { clearInterval(tick); return; } render(); drawSky(); }, 60000);
}

function renderBody(body) {
  const E = AE(); const o = obs(); const now = new Date();
  const sunEq = E.Equator('Sun', t(now), o, true, true);
  const sunAlt = E.Horizon(t(now), o, sunEq.ra, sunEq.dec, 'normal').altitude;
  const state = sunAlt > 0 ? 'Daytime' : sunAlt > -6 ? 'Civil twilight' : sunAlt > -12 ? 'Nautical twilight' : sunAlt > -18 ? 'Astronomical twilight' : 'Fully dark';
  // tonight's dark window: astronomical dusk → dawn (sun below −18°); at high latitude in summer there may be none
  const dusk = sunAlt < -18 ? t(now) : E.SearchAltitude('Sun', o, -1, t(now), 1, -18);
  const dawn = dusk ? E.SearchAltitude('Sun', o, +1, dusk, 1, -18) : null;
  const sunset = E.SearchRiseSet('Sun', o, -1, t(now), 1); const sunrise = E.SearchRiseSet('Sun', o, +1, t(now), 1);
  const ill = E.Illumination('Moon', t(now)); const ph = E.MoonPhase(t(now));
  const mEq = E.Equator('Moon', t(now), o, true, true); const mHor = E.Horizon(t(now), o, mEq.ra, mEq.dec, 'normal');
  const mRise = E.SearchRiseSet('Moon', o, +1, t(now), 1); const mSet = E.SearchRiseSet('Moon', o, -1, t(now), 1);

  const darkHours = dusk && dawn ? (dawn.date - dusk.date) / 3600e3 : 0;
  const samples = [];
  if (dusk && dawn) for (let i = 0; i <= 8; i++) samples.push(new Date(dusk.date.getTime() + (dawn.date - dusk.date) * i / 8));
  else samples.push(now);

  const planets = PLANETS.map((p) => {
    const eq = E.Equator(p, t(now), o, true, true); const h = E.Horizon(t(now), o, eq.ra, eq.dec, 'normal');
    const best = Math.max(...samples.map((d) => { const q = E.Equator(p, t(d), o, true, true); return E.Horizon(t(d), o, q.ra, q.dec, 'normal').altitude; }));
    const j = E.Equator(p, t(now), o, false, true);
    return { p, alt: h.altitude, az: h.azimuth, best, mag: E.Illumination(p, t(now)).mag, rise: E.SearchRiseSet(p, o, +1, t(now), 1), set: E.SearchRiseSet(p, o, -1, t(now), 1), ra: j.ra * 15, dec: j.dec };
  });
  const shows = SHOWPIECES.map(([n, ra, dec, kind]) => {
    let best = -90; let when = null;
    for (const d of samples) { const a = altOf(ra, dec, d).altitude; if (a > best) { best = a; when = d; } }
    return { n, ra, dec, kind, best, when, now: altOf(ra, dec, now).altitude };
  }).filter((s) => s.best > 20).sort((a, b) => b.best - a.best);

  const dir = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
  body.replaceChildren(
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Now'),
      el('div', { class: 'kv' },
        el('div', {}, el('b', {}, state), el('span', { class: 'muted small' }, ` · Sun ${sunAlt.toFixed(1)}°`)),
        el('div', { class: 'small' }, `Sunset ${hhmm(sunset)} · sunrise ${hhmm(sunrise)}`),
        el('div', { class: 'small' }, dusk && dawn ? `Truly dark ${hhmm(dusk)} → ${hhmm(dawn)} (${darkHours.toFixed(1)} h)` : 'No fully dark sky tonight at this latitude'),
        el('div', { class: 'small' }, `🌙 ${phaseName(ph)}, ${(ill.phase_fraction * 100).toFixed(0)}% lit · ${mHor.altitude > 0 ? `up, ${mHor.altitude.toFixed(0)}° high in the ${dir(mHor.azimuth)}` : 'below the horizon'} · rises ${hhmm(mRise)}, sets ${hhmm(mSet)}`)),
      el('label', { class: 'toggle small' }, el('input', { type: 'checkbox', checked: horizonOn, onchange: (e) => { horizonOn = e.target.checked; store('horizon', horizonOn); drawSky(); } }), ' draw my horizon and zenith on the sky'),
      el('label', { class: 'toggle small' }, el('input', { type: 'checkbox', checked: solarOn, onchange: (e) => { solarOn = e.target.checked; store('solar', solarOn); drawSky(); } }), ' show the Sun, Moon and planets on the sky')),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Planets'),
      el('div', { class: 'rows' }, ...planets.map((x) => el('div', { class: 'row link', onclick: () => S.flyTo(x.ra, x.dec, 2) },
        el('span', { class: 'r-name' }, x.p), el('span', { class: 'muted small' }, x.alt > 0 ? `up ${x.alt.toFixed(0)}° ${dir(x.az)} · mag ${x.mag.toFixed(1)}` : `rises ${hhmm(x.rise)}`),
        el('span', { class: 'r-num small ' + (x.best > 20 ? 'gold' : 'muted') }, x.best > 20 ? `best ${x.best.toFixed(0)}°` : 'low tonight'))))),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Best sights tonight'),
      el('div', { class: 'muted small sub' }, shows.length ? 'Highest during the dark hours first. Click to fly there.' : 'Nothing on the list climbs above 20° tonight.'),
      el('div', { class: 'rows' }, ...shows.slice(0, 18).map((s) => el('div', { class: 'row link', onclick: () => S.flyTo(s.ra, s.dec, s.kind === 'galaxy' && s.n.includes('Magellanic') ? 12 : 1.2) },
        el('span', { class: 'r-name' }, s.n), el('span', { class: 'muted small' }, s.kind),
        el('span', { class: 'r-num small' }, `${s.best.toFixed(0)}° at ${s.when ? s.when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}`))))),
    el('div', { class: 'muted small' }, 'Times in your browser’s time zone. Ephemerides: astronomy-engine.'));
}

function drawSky() {
  if (!S.sky()) return;
  const E = AE(); const o = obs(); const now = t(new Date());
  S.clear('horizon'); S.clear('horizon-pts'); S.clear('solar');
  if (horizonOn) {
    const rot = E.Rotation_HOR_EQJ(now, o);
    const toEq = (alt, az) => { const v = E.RotateVector(rot, E.VectorFromHorizon(new E.Spherical(alt, az, 1), now, '')); const q = E.EquatorFromVector(v); return [q.ra * 15, q.dec]; };
    const ov = S.overlay('horizon', '#4ade80', 2);
    const ring = []; for (let az = 0; az <= 360; az += 3) ring.push(toEq(0, az));
    for (let i = 0; i < ring.length - 1; i += 1) ov.add(A.polyline([ring[i], ring[i + 1]], { color: '#4ade80', lineWidth: 2 }));
    const cat = S.catalog('horizon-pts', { color: '#4ade80', sourceSize: 12, shape: 'cross', displayLabel: true, labelColumn: 'n', labelColor: '#4ade80', labelFont: '13px Inter, sans-serif' });
    const pts = [['Zenith', 90, 0], ['N', 0, 0], ['E', 0, 90], ['S', 0, 180], ['W', 0, 270]].map(([n, alt, az]) => { const [ra, dec] = toEq(alt, az); return A.source(ra, dec, { n }); });
    cat.addSources(pts);
  }
  if (solarOn) {
    const cat = S.catalog('solar', { color: '#facc15', sourceSize: 14, shape: 'circle', displayLabel: true, labelColumn: 'n', labelColor: '#facc15', labelFont: '12px Inter, sans-serif' },
      (x) => S.flyTo(x.ra, x.dec, x.n === 'Sun' || x.n === 'Moon' ? 3 : 1));
    cat.addSources(['Sun', 'Moon', ...PLANETS].map((p) => { const q = E.Equator(p, now, o, false, true); return A.source(q.ra * 15, q.dec, { n: p, ra: q.ra * 15, dec: q.dec }); }));
  }
}

export function initTonightOverlays() { try { drawSky(); } catch (e) { console.warn('tonight overlay', e); } }
