// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// "What is here, and who has looked?" — a click on the sky opens this report.
import { el, api, raHMS, decDMS, toGalactic, num, yr, fmtDate, spinner, errBox, esc } from './util.js';
import { STRIP } from './surveys.js';
import * as S from './sky.js';

let seq = 0;
const H2F = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits';

function constellation(ra, dec) {
  try { return window.Astronomy ? Astronomy.Constellation(ra / 15, dec).name : ''; } catch { return ''; }
}

function radiusFor(fov) {
  // search radius follows the zoom: ~1/40 of the view, 3″ … 15′
  return Math.min(0.25, Math.max(3 / 3600, fov / 40));
}

function section(title, sub) {
  const body = el('div', { class: 'sec-body' }, spinner(sub || 'Asking…'));
  const s = el('section', { class: 'rep-sec' }, el('h3', {}, title), body);
  return { s, body };
}

export function openPoint(ra, dec, host, { fov, label } = {}) {
  const my = ++seq;
  const v = S.view();
  fov = fov || v.fov;
  const r = radiusFor(fov);
  const g = toGalactic(ra, dec);
  S.clear('here');
  S.overlay('here', '#f1d48e', 2).add(A.circle(ra, dec, Math.max(r, fov / 300), { color: '#f1d48e', lineWidth: 2 }));

  host.innerHTML = '';
  const con = constellation(ra, dec);
  host.append(
    el('div', { class: 'rep-head' },
      el('div', { class: 'eyebrow' }, label ? 'Object' : 'This spot in the sky'),
      el('h2', {}, label || `${raHMS(ra)}  ${decDMS(dec)}`),
      el('div', { class: 'muted small mono' }, `RA ${ra.toFixed(5)}°  Dec ${dec.toFixed(5)}°  ·  l ${g.l.toFixed(3)}°  b ${g.b.toFixed(3)}°`),
      el('div', { class: 'muted small' }, (con ? `In ${con} · ` : '') + `search radius ${r * 3600 < 120 ? (r * 3600).toFixed(0) + '″' : (r * 60).toFixed(1) + '′'}`)),
  );

  // in every light — cut-outs rendered by CDS hips2fits, straight from the HiPS servers
  const sfov = Math.min(30, Math.max(0.15, fov / 2));
  const strip = el('div', { class: 'strip' });
  for (const s of STRIP) {
    const u = `${H2F}?hips=${encodeURIComponent(s.id)}&width=120&height=120&fov=${sfov.toFixed(4)}&projection=TAN&coordsys=icrs&ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}&format=jpg`;
    const img = el('img', { src: u, alt: s.label, loading: 'lazy', title: `${s.label} — click to switch the sky to this survey` });
    img.addEventListener('error', () => { img.replaceWith(el('div', { class: 'noimg' }, 'no data')); });
    strip.append(el('figure', { onclick: () => S.setBase(s.id) }, img, el('figcaption', {}, s.label)));
  }
  host.append(el('section', { class: 'rep-sec' }, el('h3', {}, 'In every kind of light'),
    el('div', { class: 'muted small' }, `${sfov < 1 ? (sfov * 60).toFixed(1) + '′' : sfov.toFixed(1) + '°'} wide, gamma rays → radio`), strip));

  const simbad = section('What is here', 'SIMBAD (CDS Strasbourg)…');
  const exo = section('Planets around other stars', 'NASA Exoplanet Archive…');
  const looked = section('Which telescopes have looked here', 'MAST · ESO · HEASARC archives (MAST can take a minute)…');
  const gaia = section('Stars measured by Gaia', 'ESA Gaia DR3…');
  host.append(simbad.s, exo.s, looked.s, gaia.s);

  const q = (kind, rr = r) => api(`/api/point?kind=${kind}&ra=${ra.toFixed(4)}&dec=${dec.toFixed(4)}&r=${rr.toFixed(5)}`);
  const stale = () => my !== seq;

  q('simbad').then((d) => { if (!stale()) renderSimbad(simbad.body, d, ra, dec); }).catch((e) => { if (!stale()) simbad.body.replaceChildren(errBox(e, 'SIMBAD')); });
  q('exo', Math.max(r, 2 / 60)).then((d) => { if (!stale()) renderExo(exo.body, d); }).catch((e) => { if (!stale()) exo.body.replaceChildren(errBox(e, 'The Exoplanet Archive')); });
  q('gaia', Math.min(r, 0.17)).then((d) => { if (!stale()) renderGaia(gaia.body, d); }).catch((e) => { if (!stale()) gaia.body.replaceChildren(errBox(e, 'Gaia')); });

  // three archives into one section, each filling its own slot as it answers
  const slots = { heasarc: el('div', {}, spinner('HEASARC — X-ray, gamma, UV, IR missions…')),
    eso: el('div', {}, spinner('ESO — VLT, VISTA, VST, ALMA, APEX…')),
    mast: el('div', {}, spinner('MAST — Hubble, Webb, TESS, GALEX, Kepler… (slowest)')) };
  looked.body.replaceChildren(slots.mast, slots.eso, slots.heasarc);
  q('mast', Math.min(r, 0.25)).then((d) => { if (!stale()) renderMast(slots.mast, d); }).catch((e) => { if (!stale()) slots.mast.replaceChildren(errBox(e, 'MAST')); });
  q('eso', Math.min(r, 0.25)).then((d) => { if (!stale()) renderEso(slots.eso, d); }).catch((e) => { if (!stale()) slots.eso.replaceChildren(errBox(e, 'The ESO archive')); });
  q('heasarc', Math.min(r, 0.25)).then((d) => { if (!stale()) renderHea(slots.heasarc, d); }).catch((e) => { if (!stale()) slots.heasarc.replaceChildren(errBox(e, 'HEASARC')); });
}

function simbadLink(id) { return `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(id)}`; }

function renderSimbad(body, d, ra, dec) {
  const objs = d.objects || [];
  if (!objs.length) { body.replaceChildren(el('div', { class: 'muted' }, 'SIMBAD lists nothing catalogued this close. Empty-looking sky is still full of faint galaxies — zoom in and try a deep survey.')); return; }
  const top = objs[0];
  const facts = [];
  if (top.sp_type) facts.push(`spectral type ${top.sp_type}`);
  if (top.rvz_redshift != null && Math.abs(top.rvz_redshift) > 0.003) facts.push(`redshift z = ${top.rvz_redshift.toFixed(4)}`);
  if (top.plx_value > 0) facts.push(`~${num(3261.56 / top.plx_value, 0)} light-years away`);
  const card = el('div', { class: 'hero-obj' },
    el('div', { class: 'name' }, el('a', { href: simbadLink(top.main_id), target: '_blank', rel: 'noopener' }, top.main_id)),
    el('div', { class: 'type' }, top.description || top.otype || ''),
    facts.length ? el('div', { class: 'muted small' }, facts.join(' · ')) : null,
    el('div', { class: 'muted small' }, `${top.d_arcsec}″ from where you clicked`));
  const cat = S.catalog('simbad', { color: '#f1d48e', sourceSize: 9, shape: 'circle' }, (data) => { S.goTo(data.ra, data.dec); });
  S.clear('simbad');
  cat.addSources(objs.map((o) => A.source(o.ra, o.dec, o)));
  const list = el('div', { class: 'rows' }, ...objs.slice(1, 14).map((o) =>
    el('div', { class: 'row link', onclick: () => S.goTo(o.ra, o.dec) },
      el('span', { class: 'r-name' }, o.main_id), el('span', { class: 'r-type muted' }, o.description || o.otype), el('span', { class: 'r-num mono muted' }, `${o.d_arcsec}″`))));
  body.replaceChildren(card, objs.length > 1 ? el('div', { class: 'muted small sub' }, `${objs.length - 1} more nearby`) : null, list);
}

function renderExo(body, d) {
  const p = d.planets || [];
  if (!p.length) { body.replaceChildren(el('div', { class: 'muted' }, 'No confirmed planets known within 2′ of here.')); return; }
  const by = {};
  for (const x of p) (by[x.hostname] = by[x.hostname] || []).push(x);
  body.replaceChildren(...Object.entries(by).map(([host, ps]) => el('div', { class: 'planet-sys' },
    el('div', { class: 'name' }, host, el('span', { class: 'muted small' }, ps[0].sy_dist ? `  ·  ${num(ps[0].sy_dist * 3.2616, 0)} light-years` : '')),
    ...ps.map((x) => el('div', { class: 'row' },
      el('span', { class: 'r-name' }, el('a', { href: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(x.pl_name)}`, target: '_blank', rel: 'noopener' }, x.pl_name)),
      el('span', { class: 'muted small' }, [x.pl_rade ? `${num(x.pl_rade, 1)} × Earth` : null, x.pl_orbper ? `year = ${num(x.pl_orbper, x.pl_orbper < 10 ? 2 : 0)} d` : null, x.pl_eqt ? `${num(x.pl_eqt)} K` : null].filter(Boolean).join(' · ')),
      el('span', { class: 'muted small' }, `${x.discoverymethod || ''} · ${x.disc_facility || ''} ${x.disc_year || ''}`))))));
}

function renderGaia(body, d) {
  const s = d.stars || [];
  if (!s.length) { body.replaceChildren(el('div', { class: 'muted' }, 'No Gaia stars in this small circle.')); return; }
  const cat = S.catalog('gaia', { color: '#7dd3fc', sourceSize: 7, shape: 'plus' }, (data) => S.goTo(data.ra, data.dec));
  S.clear('gaia');
  cat.addSources(s.map((x) => A.source(x.ra, x.dec, x)));
  body.replaceChildren(el('div', { class: 'muted small sub' }, `${s.length}${s.length >= 40 ? '+' : ''} stars (brightest first) — Gaia measured each one's distance and motion`),
    el('div', { class: 'rows' }, ...s.slice(0, 10).map((x) => el('div', { class: 'row' },
      el('span', { class: 'r-name mono' }, `G ${num(x.phot_g_mean_mag, 1)}`),
      el('span', { class: 'muted small' }, [x.dist_ly ? `${num(x.dist_ly, 0)} ly` : 'distance uncertain', x.teff_gspphot ? `${num(x.teff_gspphot)} K` : null, x.radial_velocity != null ? `${x.radial_velocity > 0 ? 'receding' : 'approaching'} ${num(Math.abs(x.radial_velocity), 0)} km/s` : null].filter(Boolean).join(' · ')),
      el('span', { class: 'r-num mono muted' }, x.source_id.slice(-6))))));
}

const MAST_NAMES = { HST: 'Hubble', JWST: 'James Webb', TESS: 'TESS', GALEX: 'GALEX', K2: 'Kepler K2', Kepler: 'Kepler', PS1: 'Pan-STARRS', SWIFT: 'Swift UVOT', IUE: 'IUE', FUSE: 'FUSE', HLA: 'Hubble Legacy Archive', HLSP: 'High-level science products', SPITZER_SHA: 'Spitzer', EUVE: 'EUVE', WUPPE: 'WUPPE', HUT: 'HUT', BEFS: 'BEFS', TUES: 'TUES', IMAPS: 'IMAPS', HST_SM4: 'Hubble', SDSS: 'SDSS', PS2: 'Pan-STARRS' };

function renderMast(slot, d) {
  const c = d.collections || [];
  const head = el('div', { class: 'arch-head' }, 'MAST', el('span', { class: 'muted small' }, ' · space telescopes at STScI'));
  if (!c.length) { slot.replaceChildren(head, el('div', { class: 'muted small' }, 'No MAST observations cover this spot.')); return; }
  const rows = c.slice(0, 10).map((b) => el('div', { class: 'row' },
    el('span', { class: 'r-name' }, MAST_NAMES[b.collection] || b.collection),
    el('span', { class: 'muted small' }, b.instruments.map(([i]) => i).slice(0, 3).join(', ')),
    el('span', { class: 'r-num mono' }, `${num(b.n)}${d.truncated ? '+' : ''}`, el('span', { class: 'muted' }, ` · ${yr(b.first_utc)}–${yr(b.last_utc)}`))));
  const pv = (d.previews || []).length ? el('div', { class: 'previews' }, ...d.previews.map((p) => el('a', { href: p.jpeg, target: '_blank', rel: 'noopener', title: `${p.collection} ${p.instrument} ${p.filters || ''} · ${p.target || ''} · ${fmtDate(p.t_utc)}` },
    el('img', { src: p.jpeg, loading: 'lazy', alt: p.target || 'preview', onerror: (e) => e.target.closest('a').remove() }),
    el('span', {}, `${MAST_NAMES[p.collection] || p.collection} · ${yr(p.t_utc)}`)))) : null;
  slot.replaceChildren(head, el('div', { class: 'rows' }, ...rows), pv,
    d.truncated ? el('div', { class: 'muted small' }, 'Over 5,000 observations — counts are a lower bound.') : null);
}

function renderEso(slot, d) {
  const ins = d.instruments || [];
  const head = el('div', { class: 'arch-head' }, 'ESO', el('span', { class: 'muted small' }, ' · Chile: Paranal, La Silla, Chajnantor'));
  if (!ins.length) { slot.replaceChildren(head, el('div', { class: 'muted small' }, 'No ESO or ALMA data here.')); return; }
  slot.replaceChildren(head, el('div', { class: 'rows' }, ...ins.slice(0, 10).map((b) => el('div', { class: 'row' },
    el('span', { class: 'r-name' }, b.label || b.instrument), el('span', {}),
    el('span', { class: 'r-num mono' }, num(b.n), el('span', { class: 'muted' }, ` · ${yr(b.first_utc)}–${yr(b.last_utc)}`))))));
}

function renderHea(slot, d) {
  const m = d.missions || [];
  const head = el('div', { class: 'arch-head' }, 'HEASARC', el('span', { class: 'muted small' }, ' · NASA high-energy archive'));
  if (!m.length) { slot.replaceChildren(head, el('div', { class: 'muted small' }, 'No pointed X-ray or gamma-ray observations here.')); return; }
  slot.replaceChildren(head, el('div', { class: 'rows' }, ...m.slice(0, 12).map((b) => el('div', { class: 'row' },
    el('span', { class: 'r-name' }, b.mission), el('span', { class: 'muted small' }, b.band), el('span', { class: 'r-num mono' }, num(b.n))))));
}

export { esc };
