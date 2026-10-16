// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// DOM replaceChildren/append turn null into the text "null": filter, so optional parts can be written inline
for (const P of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['replaceChildren', 'append']) {
    const orig = P[m];
    P[m] = function (...k) { return orig.apply(this, k.flat().filter((x) => x != null && x !== false)); };
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, { timeout = 120000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(path, { signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, retry: j.retry_in_s });
    j._fetched = r.headers.get('X-Fetched-At');
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timed out');
    throw e;
  } finally { clearTimeout(t); }
}

// ---- coordinates
export function raHMS(ra) {
  let h = ((ra % 360) + 360) % 360 / 15;
  const hh = Math.floor(h); h = (h - hh) * 60;
  const mm = Math.floor(h); const ss = (h - mm) * 60;
  return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m ${ss.toFixed(1).padStart(4, '0')}s`;
}
export function decDMS(dec) {
  const s = dec < 0 ? '−' : '+'; let d = Math.abs(dec);
  const dd = Math.floor(d); d = (d - dd) * 60;
  const mm = Math.floor(d); const ss = (d - mm) * 60;
  return `${s}${String(dd).padStart(2, '0')}° ${String(mm).padStart(2, '0')}′ ${ss.toFixed(0).padStart(2, '0')}″`;
}
const D2R = Math.PI / 180;
// ICRS -> galactic (IAU 1958 / Hipparcos rotation)
const GM = [[-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669]];
export function toGalactic(ra, dec) {
  const v = [Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)];
  const g = GM.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  return { l: ((Math.atan2(g[1], g[0]) / D2R) + 360) % 360, b: Math.asin(Math.max(-1, Math.min(1, g[2]))) / D2R };
}
export function angDist(ra1, de1, ra2, de2) {
  const a = Math.sin((de2 - de1) * D2R / 2) ** 2 + Math.cos(de1 * D2R) * Math.cos(de2 * D2R) * Math.sin((ra2 - ra1) * D2R / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / D2R;
}
// "10.68 41.27", "00 42 44.3 +41 16 09", "00:42:44 +41:16:09", "10.68,+41.27"
export function parseCoords(s) {
  const t = s.trim().replace(/[hdm°′″'":,]/g, ' ').replace(/s(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  let m = t.match(/^(\d+(?:\.\d+)?) ([+-−]?\d+(?:\.\d+)?)$/);
  if (m) { const ra = +m[1], dec = +m[2].replace('−', '-'); if (ra <= 360 && Math.abs(dec) <= 90) return { ra, dec }; }
  m = t.match(/^(\d{1,2}) (\d{1,2}) (\d+(?:\.\d+)?) ([+-−]?)(\d{1,2}) (\d{1,2}) (\d+(?:\.\d+)?)$/);
  if (m) {
    const ra = (+m[1] + m[2] / 60 + m[3] / 3600) * 15;
    const dec = (m[4] === '-' || m[4] === '−' ? -1 : 1) * (+m[5] + m[6] / 60 + m[7] / 3600);
    if (ra <= 360 && Math.abs(dec) <= 90) return { ra, dec };
  }
  return null;
}

// ---- time / numbers
export function ago(isoOrMs) {
  const t = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!isFinite(t)) return '';
  let s = (Date.now() - t) / 1000; const fut = s < 0; s = Math.abs(s);
  const out = s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 129600 ? `${Math.round(s / 3600)} h` : s < 86400 * 60 ? `${Math.round(s / 86400)} d` : s < 86400 * 730 ? `${Math.round(s / 86400 / 30.4)} mo` : `${Math.round(s / 86400 / 365.25)} yr`;
  return fut ? `in ${out}` : `${out} ago`;
}
export function fmtDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!isFinite(d)) return '—';
  return withTime ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : d.toISOString().slice(0, 10);
}
export const yr = (iso) => (iso ? String(iso).slice(0, 4) : '—');
export function num(n, d = 0) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }); }

export function toast(msg, ms = 3200) {
  const t = el('div', { class: 'toast glass' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, ms);
}

export function spinner(text = 'Loading…') { return el('div', { class: 'loading' }, el('span', { class: 'spin' }), text); }
export function errBox(e, what) {
  return el('div', { class: 'errbox' }, `${what || 'This source'} did not answer: ${e && e.message ? e.message : e}`);
}

export function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('lts.' + k)); localStorage.setItem('lts.' + k, JSON.stringify(v)); } catch { return null; } }
export const isPhone = () => window.matchMedia('(max-width: 767px)').matches;
