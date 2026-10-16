// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// A thin layer over Aladin Lite v3 (GPL-3.0, CDS Strasbourg): survey layers, named overlays, one click router.
import { LADDER, LADDER_START } from './surveys.js';
import A from '../vendor/aladin/aladin.js';
window.A = A; // the other modules draw shapes with the global A.circle / A.source …

let aladin = null;
const hipsCache = new Map();
const overlays = new Map();      // name -> {kind, obj}
const objHandlers = new Map();   // overlay name -> fn(data, src)
let clickHandler = null;
let objHitAt = 0;
let viewListeners = [];

export function hips(id) {
  if (!hipsCache.has(id)) hipsCache.set(id, A.HiPS(id, { name: id }));
  return hipsCache.get(id);
}

export async function initSky(div, { ra = 266.4, dec = -29.0, fov = 360, survey = LADDER[LADDER_START].id, projection = 'AIT' } = {}) {
  await A.init;
  aladin = A.aladin(div, {
    survey, fov, target: `${ra} ${dec}`, projection, cooFrame: 'ICRS', log: false, samp: false,
    showZoomControl: false, showLayersControl: false, showFullscreenControl: false, showSimbadPointerControl: false,
    showCooGridControl: false, showSettingsControl: false, showShareControl: false, showStatusBar: false,
    showFrame: false, showFov: false, showCooLocation: false, showProjectionControl: false, showContextMenu: false,
    showReticle: false, showCooGrid: false, backgroundColor: 'rgb(5, 6, 9)', mode: 'dark', inertia: true,
    gridOptions: { color: 'rgb(217, 178, 95)', opacity: 0.35, thickness: 1, labelSize: 11, showLabels: true },
  });
  baseId = survey;
  aladin.on('objectClicked', (obj) => {
    if (!obj) return;
    objHitAt = performance.now();
    const name = obj.catalog && obj.catalog.name;
    const fn = objHandlers.get(name);
    if (fn) fn(obj.data || {}, obj);
  });
  aladin.on('footprintClicked', (fp) => {
    objHitAt = performance.now();
    const name = fp && fp.overlay && fp.overlay.name;
    const fn = name && objHandlers.get(name);
    if (fn) fn((fp && fp.data) || {}, fp);
  });
  aladin.on('click', (e) => {
    if (!e || e.isDragging) return;
    setTimeout(() => { if (performance.now() - objHitAt > 120 && clickHandler) clickHandler(e.ra, e.dec); }, 0);
  });
  aladin.on('positionChanged', () => viewListeners.forEach((f) => f()));
  aladin.on('zoomChanged', () => viewListeners.forEach((f) => f()));
  return aladin;
}

export const sky = () => aladin;
export function onSkyClick(fn) { clickHandler = fn; }
export function onView(fn) { viewListeners.push(fn); }

let baseId = null;
let blendId = null;
export function setBase(id) { if (id === baseId) return; baseId = id; aladin.setImageLayer(hips(id)); }
export const baseSurvey = () => baseId;
export function setBlend(id, opacity) {
  if (!id || opacity <= 0.001) {
    if (blendId) { try { aladin.removeImageLayer('blend'); } catch { /* none */ } blendId = null; }
    return;
  }
  if (blendId !== id) { aladin.setOverlayImageLayer(hips(id), 'blend'); blendId = id; }
  const lay = aladin.getOverlayImageLayer('blend');
  if (lay && lay.setOpacity) lay.setOpacity(opacity);
}

export function goTo(ra, dec, fov) {
  if (fov) aladin.setFoV(fov);
  aladin.gotoRaDec(ra, dec);
}
// a gentle fly: zoom out a little, recentre, zoom in (Aladin has no animateTo in every build; this works everywhere)
export function flyTo(ra, dec, fov) {
  const start = aladin.getRaDec(); const f0 = aladin.getFov()[0];
  const f1 = fov || f0; const t0 = performance.now(); const dur = 1400;
  const mid = Math.min(180, Math.max(f0, f1) * 2.5);
  let dra = ((ra - start[0] + 540) % 360) - 180;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const fov = k < 0.5 ? f0 + (mid - f0) * (e * 2) : mid + (f1 - mid) * ((e - 0.5) * 2);
    aladin.setFoV(Math.max(0.0005, fov));
    aladin.gotoRaDec((start[0] + dra * e + 360) % 360, start[1] + (dec - start[1]) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  if (Math.abs(dra) < 1e-6 && Math.abs(dec - start[1]) < 1e-6) { aladin.setFoV(f1); return; }
  requestAnimationFrame(step);
}

export function view() {
  const [ra, dec] = aladin.getRaDec(); const fov = aladin.getFov()[0];
  return { ra, dec, fov };
}

// ---- overlays: graphic (shapes), catalog (points), moc
export function overlay(name, color = '#d9b25f', lineWidth = 2) {
  let o = overlays.get(name);
  if (!o) { o = { kind: 'graphic', obj: A.graphicOverlay({ name, color, lineWidth }) }; aladin.addOverlay(o.obj); overlays.set(name, o); }
  return o.obj;
}
export function catalog(name, opts = {}, onPick) {
  let o = overlays.get(name);
  if (!o) {
    o = { kind: 'catalog', obj: A.catalog(Object.assign({ name, sourceSize: 12, color: '#d9b25f', shape: 'circle', onClick: null }, opts)) };
    aladin.addCatalog(o.obj); overlays.set(name, o);
  }
  if (onPick) objHandlers.set(name, onPick);
  return o.obj;
}
export function onFootprint(name, fn) { objHandlers.set(name, fn); }
export function clear(name) {
  const o = overlays.get(name); if (!o) return;
  try { o.obj.removeAll ? o.obj.removeAll() : null; } catch { /* already empty */ }
}
export function show(name, on) {
  const o = overlays.get(name); if (!o) return;
  try { on ? o.obj.show() : o.obj.hide(); } catch { /* not supported for this kind */ }
}
export function removeMoc(name) {
  const o = overlays.get(name); if (!o) return;
  try { aladin.removeLayer(o.obj); } catch { try { aladin.removeOverlay(o.obj); } catch { /* gone */ } }
  overlays.delete(name);
}
export function addMoc(name, json, opts) {
  removeMoc(name);
  const m = A.MOCFromJSON(json, Object.assign({ name }, opts));
  aladin.addMOC(m); overlays.set(name, { kind: 'moc', obj: m });
  return m;
}
export function setProjection(p) { aladin.setProjection(p); }
export function setGrid(on) { aladin.setCooGrid({ enabled: !!on, color: 'rgb(217, 178, 95)', opacity: 0.35, labelSize: 11 }); }
export function snapshot() { return aladin.getViewDataURL({ format: 'image/png' }); }
