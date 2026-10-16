// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// Where the world's telescopes are, and what they are pointed at right now.
import { el, api, ago, fmtDate, num, spinner, errBox, raHMS, decDMS } from './util.js';
import * as S from './sky.js';
import { json2satrec } from '../vendor/satellite/io.js';
import { propagate } from '../vendor/satellite/propagation.js';
import { gstime } from '../vendor/satellite/propagation/gstime.js';
import { eciToGeodetic } from '../vendor/satellite/transforms.js';

export const SCOPE_COLORS = { jwst: '#f1d48e', chandra: '#a78bfa', hst: '#38e1ff', tess: '#f87171' };
const BAND_COLORS = { optical: '#f1d48e', infrared: '#fb923c', radio: '#22d3ee', mm: '#2dd4bf', gamma: '#c084fc', neutrino: '#60a5fa', gw: '#f472b6', solar: '#facc15', cosmic: '#a3e635' };
export const bandColor = (b) => BAND_COLORS[b] || '#d9b25f';

let fleet = [];            // [{name, band, about, satrec}]
let fleetTimer = null;
export const getFleet = () => fleet;

export function buildScopes(host, { openEarth } = {}) {
  host.innerHTML = '';
  const now = el('div', {}, spinner('JWST schedule · Chandra schedule · MAST…'));
  const orbit = el('div', {}, spinner('Orbits from CelesTrak…'));
  const deep = el('div', {}, spinner('JPL Horizons…'));
  const ground = el('div', {}, spinner('Observatories…'));
  host.append(
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Looking right now'), now),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'In orbit around Earth', el('button', { class: 'btn small right', onclick: () => openEarth && openEarth() }, '🌍 Earth view')), orbit),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Deep space'), deep),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'On the ground', el('button', { class: 'btn small right', onclick: () => openEarth && openEarth() }, '🌍 Earth view')), ground));
  loadPointing(now);
  loadFleet(orbit);
  loadDeep(deep);
  loadGround(ground, openEarth);
}

// ---------------------------------------------------------------- pointing
function fovShape(ov, ra, dec, fov, color) {
  ov.add(A.circle(ra, dec, Math.max(fov / 2, 0.01), { color, lineWidth: 2 }));
}

async function loadPointing(box) {
  let d;
  try { d = await api('/api/pointing', { timeout: 180000 }); } catch (e) { box.replaceChildren(errBox(e, 'The schedules')); return; }
  const ov = S.overlay('pointing', '#f1d48e', 2);
  S.clear('pointing');
  const cat = S.catalog('pointing-pts', { color: '#38e1ff', sourceSize: 9, shape: 'square' }, (x) => {
    if (x._open) x._open();
  });
  S.clear('pointing-pts');
  const cards = [];
  for (const t of d.telescopes) {
    const col = SCOPE_COLORS[t.id] || '#d9b25f';
    if (t.visits) {
      const cur = t.visits.find((v) => v.state === 'now') || t.visits.find((v) => v.state === 'done');
      const pos = (v) => v && (v.pos || (v.ra != null ? { ra: v.ra, dec: v.dec, how: 'schedule' } : null));
      const cp = pos(cur);
      if (cp) {
        fovShape(ov, cp.ra, cp.dec, t.fov_deg * 8, col);
        cat.addSources([A.source(cp.ra, cp.dec, { _open: () => S.flyTo(cp.ra, cp.dec, Math.max(0.05, t.fov_deg * 4)), name: t.telescope })]);
      }
      const nextRows = t.visits.filter((v) => v.state === 'next').slice(0, 4);
      cards.push(el('div', { class: 'scope-card', style: { borderColor: col } },
        el('div', { class: 'sc-head' }, el('span', { class: 'dot', style: { background: col } }), el('b', {}, t.telescope === 'JWST' ? 'James Webb Space Telescope' : 'Chandra X-ray Observatory'),
          el('span', { class: 'muted small' }, cur && cur.state === 'now' ? `  · until ${fmtDate(cur.end, true).slice(11)}` : '  · between targets')),
        cur ? el('div', { class: 'sc-now' },
          el('div', { class: 'big' }, cur.target || '(calibration)'),
          el('div', { class: 'muted small' }, [cur.instrument, cur.category, cur.keywords].filter(Boolean).join(' · ')),
          cp ? el('div', { class: 'small mono muted' }, `${raHMS(cp.ra)} ${decDMS(cp.dec)} · ${cp.how}`) : el('div', { class: 'small muted' }, 'position not published yet'),
          cp ? el('button', { class: 'btn gold', onclick: () => S.flyTo(cp.ra, cp.dec, Math.max(0.05, t.fov_deg * 4)) }, `Look where ${t.telescope === 'JWST' ? 'Webb' : 'Chandra'} is looking`) : null) : null,
        nextRows.length ? el('div', { class: 'rows' }, el('div', { class: 'muted small sub' }, 'Up next'), ...nextRows.map((v) => {
          const p = pos(v);
          return el('div', { class: 'row' + (p ? ' link' : ''), onclick: () => p && S.flyTo(p.ra, p.dec, Math.max(0.05, t.fov_deg * 4)) },
            el('span', { class: 'r-name' }, v.target || '(calibration)'), el('span', { class: 'muted small' }, v.instrument || ''), el('span', { class: 'r-num muted small' }, ago(v.start)));
        })) : null,
        el('div', { class: 'muted small' }, t.source)));
    } else if (t.recent) {
      const pts = t.recent.slice(0, 25);
      for (const p of pts) fovShape(ov, p.ra, p.dec, t.fov_deg * (t.id === 'tess' ? 1 : 6), col);
      if (!pts.length) continue;
      cards.push(el('div', { class: 'scope-card', style: { borderColor: col } },
        el('div', { class: 'sc-head' }, el('span', { class: 'dot', style: { background: col } }), el('b', {}, t.telescope === 'Hubble' ? 'Hubble Space Telescope' : t.telescope),
          el('span', { class: 'muted small' }, `  · ${pts.length} recent pointings`)),
        el('div', { class: 'rows' }, ...pts.slice(0, 6).map((p) => el('div', { class: 'row link', onclick: () => S.flyTo(p.ra, p.dec, 0.15) },
          el('span', { class: 'r-name' }, p.target || '—'), el('span', { class: 'muted small' }, p.instrument || ''), el('span', { class: 'r-num muted small' }, ago(p.t_utc))))),
        el('div', { class: 'muted small' }, t.source)));
    }
  }
  const errs = Object.entries(d.errors || {}).map(([k, v]) => el('div', { class: 'errbox' }, `${k}: ${v}`));
  box.replaceChildren(...cards, ...errs,
    el('label', { class: 'toggle small' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => { S.show('pointing', e.target.checked); S.show('pointing-pts', e.target.checked); } }), ' draw where they point on the sky'));
}

// ---------------------------------------------------------------- orbit
export async function fetchFleet() {
  if (fleet.length) return fleet;
  const d = await api('/api/space');
  fleet = d.telescopes.map((t) => { let satrec = null; try { satrec = json2satrec(t.omm); } catch { /* bad element set */ } return Object.assign({}, t, { satrec }); }).filter((t) => t.satrec);
  return fleet;
}

export function satPosition(t, date = new Date()) {
  const pv = propagate(t.satrec, date);
  if (!pv || !pv.position) return null;
  const g = eciToGeodetic(pv.position, gstime(date));
  const v = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null;
  return { lat: g.latitude * 180 / Math.PI, lon: ((g.longitude * 180 / Math.PI) + 540) % 360 - 180, alt: g.height, kms: v, eci: pv.position };
}

async function loadFleet(box) {
  try { await fetchFleet(); } catch (e) { box.replaceChildren(errBox(e, 'CelesTrak')); return; }
  const rows = fleet.map((t) => {
    const pos = el('span', { class: 'r-num mono small muted' });
    const row = el('div', { class: 'row' }, el('span', { class: 'r-name' }, t.name), el('span', { class: 'muted small' }, t.band), pos);
    row._pos = pos; row._t = t;
    return row;
  });
  const tick = () => {
    if (!box.isConnected) { clearInterval(fleetTimer); return; }
    for (const r of rows) {
      const p = satPosition(r._t);
      r._pos.textContent = p ? `${num(p.alt, 0)} km · ${p.lat >= 0 ? 'N' : 'S'}${Math.abs(p.lat).toFixed(1)} ${p.lon >= 0 ? 'E' : 'W'}${Math.abs(p.lon).toFixed(1)}` : '—';
    }
  };
  box.replaceChildren(el('div', { class: 'muted small sub' }, 'Live positions, computed in your browser from the latest orbital elements.'), el('div', { class: 'rows' }, ...rows));
  clearInterval(fleetTimer); fleetTimer = setInterval(tick, 1000); tick();
}

// ---------------------------------------------------------------- deep space
async function loadDeep(box) {
  let d;
  try { d = await api('/api/deep'); } catch (e) { box.replaceChildren(errBox(e, 'JPL Horizons')); return; }
  const cat = S.catalog('deep', { color: '#f1d48e', sourceSize: 14, shape: 'triangle', displayLabel: true, labelColumn: 'name', labelColor: '#f1d48e', labelFont: '12px Inter, sans-serif' }, (x) => S.flyTo(x.ra, x.dec, 20));
  S.clear('deep');
  cat.addSources(d.craft.filter((c) => c.ra != null).map((c) => A.source(c.ra, c.dec, { name: c.name.replace('James Webb Space Telescope', 'JWST'), ra: c.ra, dec: c.dec })));
  box.replaceChildren(el('div', { class: 'muted small sub' }, 'Too far to draw on the globe — but you can see where they sit in our sky (gold triangles).'),
    el('div', { class: 'rows' }, ...d.craft.map((c) => el('div', { class: 'row' + (c.ra != null ? ' link' : ''), onclick: () => c.ra != null && S.flyTo(c.ra, c.dec, 30) },
      el('span', { class: 'r-name' }, c.name), el('span', { class: 'muted small' }, `${c.band} · ${c.where}`),
      el('span', { class: 'r-num mono small' }, c.dist_km ? (c.dist_km > 1e7 ? `${num(c.dist_au, 2)} AU` : `${num(c.dist_km / 1e6, 2)} M km`) : '—')))),
    el('div', { class: 'muted small' }, `JPL Horizons, ${fmtDate(d.t_utc, true)}`));
}

// ---------------------------------------------------------------- ground
export let observatories = [];
async function loadGround(box, openEarth) {
  try { const d = await (await fetch('data/observatories.json')).json(); observatories = d.sites; } catch (e) { box.replaceChildren(errBox(e, 'The observatory list')); return; }
  const groups = {};
  for (const o of observatories) (groups[o.band] = groups[o.band] || []).push(o);
  const names = { optical: 'Optical & infrared', radio: 'Radio', mm: 'Millimetre', gamma: 'Gamma-ray (Cherenkov)', gw: 'Gravitational waves', neutrino: 'Neutrinos', solar: 'Solar', cosmic: 'Cosmic rays' };
  box.replaceChildren(...Object.entries(groups).map(([b, list]) => el('details', { class: 'grp' },
    el('summary', {}, el('span', { class: 'dot', style: { background: bandColor(b) } }), `${names[b] || b} · ${list.length}`),
    el('div', { class: 'rows' }, ...list.map((o) => el('div', { class: 'row link', title: o.what, onclick: () => openEarth && openEarth({ site: o }) },
      el('span', { class: 'r-name' }, o.name), el('span', { class: 'muted small' }, o.country), el('span', { class: 'r-num muted small' }, `${num(o.elev)} m`)))))));
}
