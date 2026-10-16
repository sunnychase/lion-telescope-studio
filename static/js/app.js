// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// Lion Telescope Studio — main: sky, wavelength ladder, panel tabs, search, share, capture.
import { $, $$, el, api, toast, parseCoords, raHMS, decDMS, store, isPhone } from './util.js';
import { LADDER, LADDER_START, LIBRARY, SHOWCASE, surveyName, ladderAt } from './surveys.js';
import * as S from './sky.js';
import { openPoint } from './point.js';
import { buildLive } from './live.js';
import { buildScopes } from './scopes.js';
import { buildTonight, initTonightOverlays } from './tonight.js';
import { openEarth, closeEarth } from './earth.js';

const built = {};
let projection = 'AIT';
let grid = false;
let ladderMode = true;   // false once a library survey or showpiece is chosen; the spectrum bar turns it back on

// ---------------------------------------------------------------- state in the URL hash
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const n = (k) => (h.has(k) && isFinite(+h.get(k)) ? +h.get(k) : null);
  return { ra: n('ra'), dec: n('dec'), fov: n('fov'), w: n('w'), s: h.get('s'), p: h.get('p') };
}
let hashTimer = null;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const v = S.view();
    const h = new URLSearchParams({ ra: v.ra.toFixed(4), dec: v.dec.toFixed(4), fov: v.fov.toPrecision(4), w: (+$('#ladder-range').value).toFixed(2), p: projection });
    const b = S.baseSurvey();
    if (b && !LADDER.some((l) => l.id === b)) h.set('s', b);
    history.replaceState(null, '', '#' + h.toString());
  }, 400);
}

// ---------------------------------------------------------------- wavelength ladder
function setLadder(x, { quiet } = {}) {
  x = Math.max(0, Math.min(LADDER.length - 1, x));
  const i = Math.floor(x); const f = x - i;
  ladderMode = true;
  const a = LADDER[i]; const b = LADDER[Math.min(i + 1, LADDER.length - 1)];
  const fov = S.view().fov;
  const sa = ladderAt(a, fov); const sb = ladderAt(b, fov);
  S.setBase(sa.id);
  S.setBlend(f > 0.02 && b !== a ? sb.id : null, f);
  const cur = f > 0.5 ? b : a; const cs = f > 0.5 ? sb : sa;
  $('#band-now').replaceChildren(el('span', { class: 'swatch', style: { background: cur.color } }), el('b', {}, cur.band), el('span', { class: 'muted' }, ` · ${cs.scope}`));
  $$('#ladder-labels span').forEach((s, k) => s.classList.toggle('on', k === Math.round(x)));
  const card = $('#band-card');
  if (card) card.replaceChildren(el('div', { class: 'eyebrow' }, 'You are seeing'), el('h2', {}, cur.band), el('div', {}, cur.scope), el('div', { class: 'muted small' }, cur.what));
  if (!quiet) writeHash();
}

function buildLadder() {
  const labels = $('#ladder-labels');
  labels.replaceChildren(...LADDER.map((l, i) => el('span', { title: `${l.band} — ${l.scope}`, style: { '--c': l.color }, onclick: () => { $('#ladder-range').value = i; setLadder(i); } }, l.short)));
  const r = $('#ladder-range');
  r.max = LADDER.length - 1;
  r.addEventListener('input', () => { setLadder(+r.value); $('#ladder-hint').textContent = 'between two bands you see both blended'; });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === '[' || e.key === ']') { const v = Math.round(+r.value) + (e.key === ']' ? 1 : -1); r.value = Math.max(0, Math.min(LADDER.length - 1, v)); setLadder(+r.value); }
  });
}

// ---------------------------------------------------------------- tabs
function showTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab-page').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + name));
  if (!built[name]) {
    built[name] = true;
    if (name === 'live') buildLive($('#tab-live'));
    if (name === 'scopes') buildScopes($('#tab-scopes'), { openEarth });
    if (name === 'tonight') buildTonight($('#tab-tonight'));
  }
  store('tab', name);
  if (isPhone()) $('#panel').classList.add('open');
}

function buildSkyTab() {
  const host = $('#tab-sky');
  const lib = LIBRARY.map((g) => el('details', { class: 'grp', open: g.group === 'Visible' },
    el('summary', {}, `${g.group} · ${g.items.length}`),
    el('div', { class: 'chips-col' }, ...g.items.map((it) => el('button', { class: 'surv', title: `${it.by} — covers ${(it.sky * 100).toFixed(0)}% of the sky`, onclick: () => { S.setBase(it.id); S.setBlend(null, 0); markSurvey(it.name); writeHash(); } },
      el('span', {}, it.name), el('span', { class: 'muted small' }, `${it.by} · ${(it.sky * 100).toFixed(0)}%`))))));
  const H2F = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits';
  const show = el('div', { class: 'showcase' }, ...SHOWCASE.map((s) => el('button', { class: 'show', title: `${s.name} — ${s.by}`, onclick: () => {
    S.setBlend(null, 0); S.setBase(s.id); S.flyTo(s.ra, s.dec, s.fov); markSurvey(s.name); writeHash();
  } }, el('img', { loading: 'lazy', alt: s.name, src: `${H2F}?hips=${encodeURIComponent(s.id)}&width=150&height=100&fov=${(s.fov * 0.9).toFixed(4)}&projection=TAN&coordsys=icrs&ra=${s.ra}&dec=${s.dec}&format=jpg`, onerror: (e) => e.target.classList.add('noimg') }),
  el('span', { class: 'cap' }, s.name), el('span', { class: 'by' }, s.by))));
  const blendSel = el('select', { id: 'blend-sel' }, el('option', { value: '' }, 'none'), ...LIBRARY.flatMap((g) => g.items.map((it) => el('option', { value: it.id }, `${g.group}: ${it.name}`))));
  const blendOp = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.5, id: 'blend-op' });
  const applyBlend = () => S.setBlend(blendSel.value || null, +blendOp.value);
  blendSel.addEventListener('change', applyBlend); blendOp.addEventListener('input', applyBlend);
  host.replaceChildren(
    el('section', { class: 'rep-sec band-card', id: 'band-card' }),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Showpieces'), el('div', { class: 'muted small sub' }, 'The deepest pictures ever taken of these places. Click one to fly there.'), show),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'All surveys'), el('div', { class: 'muted small sub' }, 'From 55 sky surveys by telescopes on every continent and in orbit.'), ...lib),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Blend a second survey on top'), el('div', { class: 'blend' }, blendSel, blendOp)));
}
function markSurvey(name) {
  ladderMode = false;
  $('#band-now').replaceChildren(el('span', { class: 'swatch', style: { background: '#f1d48e' } }), el('b', {}, name));
  const card = $('#band-card');
  if (card) card.replaceChildren(el('div', { class: 'eyebrow' }, 'You are seeing'), el('h2', {}, name), el('div', { class: 'muted small' }, 'Drag the spectrum bar below to return to the all-sky views.'));
}

// ---------------------------------------------------------------- search
async function search(q) {
  q = q.trim(); if (!q) return;
  const c = parseCoords(q);
  if (c) { S.flyTo(c.ra, c.dec, Math.min(S.view().fov, 2)); openHere(c.ra, c.dec); return; }
  try {
    const r = await api('/api/resolve?q=' + encodeURIComponent(q));
    if (!r.found) { toast(`No object called “${q}” found by CDS Sesame.`); return; }
    const fov = /G|Gx|AGN|ClG|GrG/.test(r.otype) ? 0.6 : /HII|Cl|OpC|GlC|SNR|ISM|Neb/.test(r.otype) ? 1.2 : /PN/.test(r.otype) ? 0.2 : 0.25;
    S.flyTo(r.ra, r.dec, fov);
    setTimeout(() => openHere(r.ra, r.dec, { fov, label: r.name.replace(/\s+/g, ' ') }), 1500);
  } catch (e) { toast('Search failed: ' + e.message); }
}

function openHere(ra, dec, opts = {}) {
  showTab('here');
  openPoint(ra, dec, $('#tab-here'), opts);
}

// ---------------------------------------------------------------- about
function buildAbout() {
  const src = [
    ['Sky images (HiPS)', 'CDS Strasbourg, ESA ESDC, NASA HEASARC/IPAC/STScI, NRAO, CSIRO, ASTRON, JAXA, MPE — each survey is credited by its makers; tiles load straight from their servers.'],
    ['Sky viewer', 'Aladin Lite v3.6.5 © CDS, Université de Strasbourg/CNRS — GPL-3.0. Its logo stays in the corner, as its terms ask.'],
    ['Object names', 'SIMBAD and Sesame, CDS Strasbourg.'],
    ['Stars', 'ESA Gaia DR3 (Gaia Archive TAP).'],
    ['Exoplanets', 'NASA Exoplanet Archive (Caltech/IPAC).'],
    ['Who looked here', 'MAST at STScI (Hubble, Webb, TESS, GALEX…), ESO Science Archive (VLT, VISTA, VST, ALMA…), NASA HEASARC (Chandra, XMM-Newton, Swift, NuSTAR, NICER, IXPE, XRISM…).'],
    ['Gravitational waves', 'LIGO-Virgo-KAGRA public alerts via GraceDB.'],
    ['Gamma-ray flashes', 'Fermi GBM trigger catalogue via NASA HEASARC.'],
    ['Supernova candidates', 'Zwicky Transient Facility alerts classified by the ALeRCE broker.'],
    ['The Sun', 'NASA SDO latest images; NOAA SWPC GOES X-ray flux, flares and Kp.'],
    ['Telescope schedules', 'STScI weekly JWST schedule; Chandra X-ray Center short-term schedule; MAST for recent Hubble pointings.'],
    ['Orbits & deep space', 'CelesTrak orbital elements (satellite.js, MIT) and JPL Horizons.'],
    ['Tonight', 'astronomy-engine by Don Cross (MIT).'],
    ['Earth view', 'CesiumJS (Apache-2.0) with its bundled Natural Earth II imagery — no Cesium ion.'],
  ];
  $('#about-body').replaceChildren(el('dl', {}, ...src.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    el('p', { class: 'muted small' }, 'Every source is open and keyless. The server caches politely (CelesTrak ≥ 2 h, schedules hourly, archives per spot for a day). Nothing here is affiliated with these observatories.'),
    el('p', { class: 'muted small' }, 'Keys: [ and ] step through the spectrum. Click the sky for a report.'),
    el('p', { class: 'small' }, 'Created by ', el('a', { href: 'https://github.com/sunnychase', target: '_blank', rel: 'noopener' }, 'Sunny Chase'),
      ' in collaboration with Claude (Anthropic) · ', el('a', { href: 'https://github.com/sunnychase/lion-telescope-studio', target: '_blank', rel: 'noopener' }, 'source on GitHub'),
      ' · GPL-3.0-or-later'));
}

// ---------------------------------------------------------------- start
async function main() {
  const h = readHash();
  projection = h.p === 'SIN' ? 'SIN' : 'AIT';
  const w = h.w != null ? h.w : LADDER_START;
  await S.initSky('#sky', { ra: h.ra ?? 266.4, dec: h.dec ?? -29.0, fov: h.fov ?? (isPhone() ? 220 : 300), projection, survey: LADDER[Math.round(w)].id });
  buildLadder(); buildSkyTab(); buildAbout();
  $('#ladder-range').value = w;
  setLadder(w, { quiet: true });
  if (h.s) { S.setBase(h.s); markSurvey(surveyName(h.s)); }
  S.onSkyClick((ra, dec) => openHere(ra, dec));
  S.onView(() => { writeHash(); if (ladderMode) setLadder(+$('#ladder-range').value, { quiet: true }); });
  S.sky().on('mouseMove', (e) => {
    if (!e || e.ra == null) return;
    const v = S.view();
    $('#readout').textContent = `${raHMS(e.ra)}  ${decDMS(e.dec)}   ·   field ${v.fov >= 1 ? v.fov.toFixed(1) + '°' : (v.fov * 60).toFixed(1) + '′'}`;
  });
  initTonightOverlays();

  $$('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { search(e.target.value); e.target.blur(); } });
  $('#btn-collapse').addEventListener('click', () => { $('#panel').classList.add('hidden'); $('#panel-open').classList.remove('hidden'); });
  $('#panel-open').addEventListener('click', () => { $('#panel').classList.remove('hidden'); $('#panel-open').classList.add('hidden'); });
  $('#sheet-handle').addEventListener('click', () => $('#panel').classList.toggle('open'));
  $('#btn-proj').addEventListener('click', () => { projection = projection === 'AIT' ? 'SIN' : 'AIT'; S.setProjection(projection); if (projection === 'SIN' && S.view().fov > 180) S.sky().setFoV(150); writeHash(); toast(projection === 'SIN' ? 'Sphere view — like looking up from inside' : 'Whole-sky view (Hammer-Aitoff)'); });
  $('#btn-grid').addEventListener('click', () => { grid = !grid; S.setGrid(grid); $('#btn-grid').classList.toggle('on', grid); });
  $('#btn-share').addEventListener('click', async () => { writeHash(); await new Promise((r) => setTimeout(r, 450)); try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch { toast(location.href, 6000); } });
  $('#btn-capture').addEventListener('click', async () => {
    try { const url = await S.snapshot(); const a = el('a', { href: url, download: `lion-telescope-studio-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.png` }); document.body.append(a); a.click(); a.remove(); } catch (e) { toast('Capture failed: ' + e.message); }
  });
  $('#btn-full').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}));
  $('#btn-about').addEventListener('click', () => $('#about').classList.remove('hidden'));
  $('#about-close').addEventListener('click', () => $('#about').classList.add('hidden'));
  $('#about').addEventListener('click', (e) => { if (e.target.id === 'about') $('#about').classList.add('hidden'); });
  $('#btn-earth').addEventListener('click', () => openEarth());
  $('#earth-close').addEventListener('click', closeEarth);
  $('#earth-legend').replaceChildren(...[['optical', 'Optical / IR'], ['radio', 'Radio'], ['mm', 'Millimetre'], ['gamma', 'Gamma'], ['gw', 'Grav. waves'], ['neutrino', 'Neutrino'], ['solar', 'Solar'], ['cosmic', 'Cosmic rays']]
    .map(([b, l]) => el('span', {}, el('i', { class: 'dot', style: { background: ({ optical: '#f1d48e', radio: '#22d3ee', mm: '#2dd4bf', gamma: '#c084fc', gw: '#f472b6', neutrino: '#60a5fa', solar: '#facc15', cosmic: '#a3e635' })[b] } }), l)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#about').classList.add('hidden'); closeEarth(); } });

  const clock = () => { $('#utc').textContent = new Date().toISOString().slice(11, 19) + ' UTC'; };
  clock(); setInterval(clock, 1000);
  const tab = store('tab');
  showTab(tab && tab !== 'here' ? tab : 'sky');
  if (isPhone()) $('#panel').classList.remove('open');

  // a reload hint when the page files change on the server
  let ver = null;
  setInterval(async () => { try { const s = await api('/api/status'); if (ver && s.client_version && s.client_version !== ver) toast('A newer version is available — reload to update.', 8000); ver = s.client_version || ver; } catch { /* offline */ } }, 300000);
  window.LTS = { S };
}

main().catch((e) => { console.error(e); document.body.append(el('div', { class: 'fatal glass' }, 'The sky viewer could not start: ' + e.message)); });
