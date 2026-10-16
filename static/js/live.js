// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// The changing sky: gravitational waves, gamma-ray flashes, new supernovae, and our Sun.
import { el, api, ago, fmtDate, num, spinner, errBox, toast } from './util.js';
import * as S from './sky.js';

const GW_COLOR = '#c084fc';
const GRB_COLOR = '#fb923c';
const SN_COLOR = '#4ade80';
const GBM_LABEL = { GRB: 'Gamma-ray burst', SFLARE: 'Solar flare', TGF: 'Terrestrial gamma flash (from thunderstorms)', SGR: 'Magnetar outburst', TRANSNT: 'Transient', LOCLPAR: 'Local particles', DISTPAR: 'Distant particles', UNCERT: 'Unclassified', GRO: 'Galactic source' };
let showLow = false;

export function buildLive(host) {
  host.innerHTML = '';
  const gw = el('div', {}, spinner('LIGO · Virgo · KAGRA alerts…'));
  const grb = el('div', {}, spinner('Fermi GBM triggers…'));
  const sn = el('div', {}, spinner('ZTF alerts via ALeRCE…'));
  const sun = el('div', {}, spinner('SDO + NOAA…'));
  host.append(
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Gravitational waves', el('span', { class: 'dot', style: { background: GW_COLOR } })),
      el('div', { class: 'muted small' }, 'Ripples in space-time from colliding black holes and neutron stars. Pick one to see where in the sky it could have come from.'), gw),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Gamma-ray flashes · last 45 days', el('span', { class: 'dot', style: { background: GRB_COLOR } })),
      el('div', { class: 'muted small' }, 'Fermi’s Gamma-ray Burst Monitor triggers — distant explosions, magnetars, solar flares and even thunderstorms.'), grb),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'New supernova candidates · 12 days', el('span', { class: 'dot', style: { background: SN_COLOR } })),
      el('div', { class: 'muted small' }, 'Freshly exploded stars found by the Zwicky Transient Facility at Palomar, classified by the ALeRCE broker.'), sn),
    el('section', { class: 'rep-sec' }, el('h3', {}, 'Our star, right now'), sun));
  loadGW(gw); loadGRB(grb); loadSN(sn); loadSun(sun);
}

// ---------------------------------------------------------------- gravitational waves
async function loadGW(box) {
  let d;
  try { d = await api('/api/gw'); } catch (e) { box.replaceChildren(errBox(e, 'GraceDB')); return; }
  const render = () => {
    const ev = d.events.filter((e) => showLow || e.significant).slice(0, 25);
    box.replaceChildren(
      el('div', { class: 'muted small sub' }, d.note || ''),
      el('label', { class: 'toggle small' }, el('input', { type: 'checkbox', checked: showLow, onchange: (e) => { showLow = e.target.checked; render(); } }), ' include low-significance alerts'),
      el('div', { class: 'rows' }, ...ev.map((e) => el('div', { class: 'row link', onclick: () => openGW(e, box) },
        el('span', { class: 'r-name mono' }, e.gw_id || e.id),
        el('span', { class: 'muted small' }, `${fmtDate(e.t0_utc)} · ${ago(e.t0_utc)}`),
        el('span', { class: 'r-num small ' + (e.significant ? 'gold' : 'muted') }, e.per_year != null ? (e.per_year < 1e-3 ? 'very significant' : `false alarm ${e.per_year < 1 ? '1 per ' + num(1 / e.per_year, 0) + ' yr' : num(e.per_year, 0) + '/yr'}`) : '')))),
      el('div', { class: 'gw-card', id: 'gw-card' }));
  };
  render();
}

async function openGW(e, box) {
  const card = box.querySelector('#gw-card');
  card.replaceChildren(spinner(`Reading the ${e.id} sky map…`));
  let m;
  try { m = await api(`/api/gw/map?id=${encodeURIComponent(e.id)}`, { timeout: 180000 }); } catch (err) { card.replaceChildren(errBox(err, 'GraceDB')); return; }
  if (m.error) { card.replaceChildren(el('div', { class: 'muted' }, m.error)); return; }
  S.addMoc('gw90', m.moc90, { color: GW_COLOR, fillColor: GW_COLOR, fill: true, opacity: 0.28, perimeter: true, lineWidth: 1 });
  S.addMoc('gw50', m.moc50, { color: '#e9d5ff', fillColor: GW_COLOR, fill: true, opacity: 0.45, perimeter: true, lineWidth: 2 });
  const fov = Math.min(180, Math.max(8, Math.sqrt(m.area90_deg2) * 2.2));
  S.flyTo(m.peak[0], m.peak[1], fov);
  const p = m.p_astro || {};
  const order = [['BBH', 'two black holes'], ['BNS', 'two neutron stars'], ['NSBH', 'neutron star + black hole'], ['Terrestrial', 'noise on Earth']];
  card.replaceChildren(
    el('div', { class: 'name' }, e.gw_id || e.id, el('a', { class: 'small', href: e.page, target: '_blank', rel: 'noopener' }, '  GraceDB ↗')),
    el('div', { class: 'muted small' }, `${fmtDate(e.t0_utc, true)} · sky map ${m.file}`),
    el('div', { class: 'kv' },
      el('div', {}, el('b', {}, `${num(m.area90_deg2)} deg²`), el('span', { class: 'muted small' }, ' 90% region (the full Moon is 0.2 deg²)')),
      m.dist_mpc ? el('div', {}, el('b', {}, `${num(m.dist_mpc * 3.2616, 0)} million ly`), el('span', { class: 'muted small' }, ` ± ${num((m.dist_std || 0) * 3.2616, 0)}`)) : null),
    Object.keys(p).length ? el('div', { class: 'bars' }, ...order.filter(([k]) => p[k] != null).map(([k, label]) => el('div', { class: 'bar' },
      el('span', { class: 'small' }, label), el('span', { class: 'track' }, el('span', { class: 'fill', style: { width: `${(p[k] * 100).toFixed(1)}%`, background: k === 'Terrestrial' ? '#6b7280' : GW_COLOR } })),
      el('span', { class: 'small mono' }, `${(p[k] * 100).toFixed(0)}%`)))) : null,
    el('button', { class: 'btn small', onclick: () => { S.removeMoc('gw90'); S.removeMoc('gw50'); card.replaceChildren(); } }, 'Clear from sky'));
}

// ---------------------------------------------------------------- Fermi GBM
async function loadGRB(box) {
  let d;
  try { d = await api('/api/grb'); } catch (e) { box.replaceChildren(errBox(e, 'HEASARC')); return; }
  const tr = d.triggers || [];
  const grbs = tr.filter((t) => t.type === 'GRB' || t.type === 'SGR');
  const ov = S.overlay('grb', GRB_COLOR, 1.5);
  S.clear('grb');
  for (const t of grbs) {
    if (t.ra == null) continue;
    const c = A.circle(t.ra, t.dec, Math.max(0.5, Math.min(25, t.err_deg || 1)), { color: GRB_COLOR, lineWidth: 1.5 });
    c.data = t;
    ov.add(c);
  }
  S.onFootprint('grb', (t) => { if (t && t.name) toast(`${t.name} · ${GBM_LABEL[t.type] || t.type} · ${fmtDate(t.t_utc, true)} · error circle ${num(t.err_deg, 1)}°`, 5000); });
  const counts = {};
  for (const t of tr) counts[t.type] = (counts[t.type] || 0) + 1;
  box.replaceChildren(
    el('div', { class: 'chips-row' }, ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => el('span', { class: 'chip', title: GBM_LABEL[k] || k }, `${k} ${n}`))),
    el('label', { class: 'toggle small' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => S.show('grb', e.target.checked) }), ' draw burst error circles on the sky'),
    el('div', { class: 'rows' }, ...tr.slice(0, 18).map((t) => el('div', { class: 'row link', onclick: () => t.ra != null && S.flyTo(t.ra, t.dec, Math.max(10, (t.err_deg || 3) * 4)) },
      el('span', { class: 'r-name mono' }, t.name), el('span', { class: 'muted small' }, GBM_LABEL[t.type] || t.type),
      el('span', { class: 'r-num muted small' }, ago(t.t_utc))))),
    el('div', { class: 'muted small' }, d.source));
}

// ---------------------------------------------------------------- ALeRCE supernova candidates
async function loadSN(box) {
  let d;
  try { d = await api('/api/transients'); } catch (e) { box.replaceChildren(errBox(e, 'ALeRCE')); return; }
  const t = d.transients || [];
  const cat = S.catalog('sn', { color: SN_COLOR, sourceSize: 11, shape: 'rhomb' }, (x) => {
    toast(`${x.oid} · first seen ${ago(x.first_utc)} · ${x.ndet} detection(s) · SN probability ${x.p}`, 5000);
  });
  S.clear('sn');
  cat.addSources(t.map((x) => A.source(x.ra, x.dec, x)));
  box.replaceChildren(
    el('div', { class: 'muted small sub' }, `${t.length} candidates on the sky (green diamonds)`),
    el('label', { class: 'toggle small' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => S.show('sn', e.target.checked) }), ' show on the sky'),
    el('div', { class: 'rows' }, ...t.slice(0, 14).map((x) => el('div', { class: 'row link', onclick: () => S.flyTo(x.ra, x.dec, 0.15) },
      el('span', { class: 'r-name mono' }, x.oid), el('span', { class: 'muted small' }, `seen ${ago(x.first_utc)} · ${x.ndet} det.`),
      el('a', { class: 'r-num small', href: x.url, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, 'ALeRCE ↗')))));
}

// ---------------------------------------------------------------- the Sun
const SDO_CH = [['0193', '193 Å corona'], ['0171', '171 Å loops'], ['0304', '304 Å chromosphere'], ['0131', '131 Å flares'], ['HMIIC', 'visible (sunspots)'], ['HMIB', 'magnetic field']];

async function loadSun(box) {
  const img = el('img', { class: 'sun-img', alt: 'The Sun from NASA SDO', src: '/api/sun?ch=0193' });
  const ch = el('div', { class: 'seg' }, ...SDO_CH.map(([c, l], i) => el('button', { class: i === 0 ? 'on' : '', onclick: (e) => {
    img.src = `/api/sun?ch=${c}`; [...ch.children].forEach((b) => b.classList.remove('on')); e.target.classList.add('on');
  } }, l)));
  const wx = el('div', {}, spinner('NOAA space weather…'));
  box.replaceChildren(el('div', { class: 'sun-wrap' }, img), ch,
    el('div', { class: 'muted small' }, 'NASA Solar Dynamics Observatory, latest image (refreshed every 15 min).'), wx);
  try {
    const d = await api('/api/spaceweather');
    const cv = el('canvas', { class: 'spark', width: 600, height: 120 });
    wx.replaceChildren(el('div', { class: 'small' }, 'X-ray brightness, last 24 h (GOES) — spikes are flares'), cv,
      d.flares && d.flares.length ? el('div', { class: 'chips-row' }, ...d.flares.slice(-8).reverse().map((f) => el('span', { class: 'chip ' + (f.class[0] === 'X' ? 'hot' : f.class[0] === 'M' ? 'warm' : ''), title: f.peak }, `${f.class} ${ago(f.peak)}`))) : null,
      d.kp && d.kp.length ? el('div', { class: 'small' }, `Geomagnetic Kp now ${d.kp[d.kp.length - 1][1].toFixed(1)}${d.kp[d.kp.length - 1][1] >= 5 ? ' — storm: auroras likely at high latitudes' : ''}`) : null);
    drawXray(cv, d.xray || []);
  } catch (e) { wx.replaceChildren(errBox(e, 'NOAA SWPC')); }
}

function drawXray(cv, pts) {
  const c = cv.getContext('2d'); const W = cv.width; const H = cv.height;
  c.clearRect(0, 0, W, H);
  const lo = -8.5; const hi = -3.5; // log10 W/m2: A … X
  const y = (f) => H - ((Math.log10(Math.max(f, 1e-9)) - lo) / (hi - lo)) * H;
  c.font = '11px Inter, sans-serif';
  [['A', -8], ['B', -7], ['C', -6], ['M', -5], ['X', -4]].forEach(([l, e]) => {
    const yy = y(10 ** e); c.strokeStyle = 'rgba(217,178,95,0.15)'; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke();
    c.fillStyle = 'rgba(217,178,95,0.6)'; c.fillText(l, W - 12, yy - 2);
  });
  if (!pts.length) return;
  c.strokeStyle = '#f1d48e'; c.lineWidth = 1.5; c.beginPath();
  pts.forEach(([, f], i) => { const xx = (i / (pts.length - 1)) * (W - 16); i ? c.lineTo(xx, y(f)) : c.moveTo(xx, y(f)); });
  c.stroke();
}
