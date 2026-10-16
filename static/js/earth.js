// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// Earth view: the ground observatories and the telescopes in orbit, on a 3D globe (CesiumJS, no ion account).
import { el, num, api, toast } from './util.js';
import { fetchFleet, satPosition, observatories, bandColor } from './scopes.js';
import * as S from './sky.js';

let viewer = null;
let loading = null;
let satEntities = [];
let timer = null;
let pointingCache = null;

function loadCesium() {
  if (window.Cesium) return Promise.resolve();
  if (loading) return loading;
  window.CESIUM_BASE_URL = 'vendor/cesium/';
  loading = new Promise((res, rej) => {
    const css = el('link', { rel: 'stylesheet', href: 'vendor/cesium/Widgets/widgets.css' });
    document.head.append(css);
    const s = el('script', { src: 'vendor/cesium/Cesium.js' });
    s.onload = () => res(); s.onerror = () => rej(new Error('Cesium failed to load'));
    document.head.append(s);
  });
  return loading;
}

async function ensureObservatories() {
  if (observatories.length) return observatories;
  const d = await (await fetch('data/observatories.json')).json();
  observatories.push(...d.sites);
  return observatories;
}

export async function openEarth({ site } = {}) {
  const wrap = document.getElementById('earth');
  wrap.classList.remove('hidden');
  document.body.classList.add('earth-on');
  const info = document.getElementById('earth-info');
  if (!viewer) {
    info.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spin' }), 'Building the globe…'));
    try { await loadCesium(); } catch (e) { info.textContent = e.message; return; }
    const C = window.Cesium;
    C.Ion.defaultAccessToken = 'unused-no-ion'; // no Cesium ion: bundled Natural Earth II imagery, ellipsoid terrain
    viewer = new C.Viewer('earth-globe', {
      baseLayer: C.ImageryLayer.fromProviderAsync(C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl('Assets/Textures/NaturalEarthII'))),
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, vrButton: false,
      projectionPicker: false, terrainProvider: new C.EllipsoidTerrainProvider(), msaaSamples: 4,
      contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' } },
    });
    const s = viewer.scene;
    viewer.showRenderLoopErrors = false;
    s.renderError.addEventListener((sc, err) => { console.error('earth render error', err); });
    s.globe.enableLighting = true;
    s.globe.dynamicAtmosphereLighting = true;
    s.globe.dynamicAtmosphereLightingFromSun = true;
    s.globe.showGroundAtmosphere = true;
    s.globe.baseColor = C.Color.fromCssColorString('#0a1424');
    s.skyAtmosphere.show = true;
    s.highDynamicRange = false;
    s.screenSpaceCameraController.minimumZoomDistance = 2000;
    s.screenSpaceCameraController.maximumZoomDistance = 1.5e8;
    viewer.clock.shouldAnimate = true;
    viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(-40, 15, 32000000) });
    await addObservatories(C);
    await addFleet(C);
    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((m) => {
      const p = viewer.scene.pick(m.position);
      if (p && p.id && p.id._lts) showInfo(p.id._lts);
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    info.replaceChildren(el('div', { class: 'muted small' }, 'Click an observatory or a telescope. Telescopes move in real time.'));
  }
  if (site) {
    const C = window.Cesium;
    viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(site.lon, site.lat - 0.6, 900000), orientation: { pitch: C.Math.toRadians(-55) }, duration: 2.2 });
    showInfo({ kind: 'site', o: site });
  }
}

export function closeEarth() {
  document.getElementById('earth').classList.add('hidden');
  document.body.classList.remove('earth-on');
}

async function addObservatories(C) {
  const list = await ensureObservatories();
  for (const o of list) {
    const e = viewer.entities.add({
      position: C.Cartesian3.fromDegrees(o.lon, o.lat, Math.max(0, o.elev)),
      point: { pixelSize: 9, color: C.Color.fromCssColorString(bandColor(o.band)), outlineColor: C.Color.BLACK, outlineWidth: 1.5, disableDepthTestDistance: 5e6 },
      label: { text: o.name, font: '12px Inter, sans-serif', fillColor: C.Color.fromCssColorString('#ece4cf'), showBackground: true,
        backgroundColor: C.Color.fromCssColorString('rgba(10,11,13,0.75)'), pixelOffset: new C.Cartesian2(0, -16),
        distanceDisplayCondition: new C.DistanceDisplayCondition(0, 4500000), scale: 0.95 },
    });
    e._lts = { kind: 'site', o };
  }
}

async function addFleet(C) {
  let fleet;
  try { fleet = await fetchFleet(); } catch (e) { toast('Orbits unavailable: ' + e.message); return; }
  for (const t of fleet) {
    const pos = new C.CallbackProperty(() => {
      const p = satPosition(t, C.JulianDate.toDate(viewer.clock.currentTime));
      return p ? C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000) : undefined;
    }, false);
    // one orbit of trail, recomputed every 30 s
    const trail = [];
    const rebuild = () => {
      trail.length = 0;
      const now = Date.now();
      const period = (2 * Math.PI / t.satrec.no) * 60 * 1000; // satrec.no is rad/min
      const span = Math.min(period, 6 * 3600 * 1000);
      for (let i = 0; i <= 120; i++) {
        const p = satPosition(t, new Date(now - span / 2 + (span * i) / 120));
        if (p) trail.push(C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000));
      }
    };
    rebuild();
    const col = C.Color.fromCssColorString(t.norad === 20580 ? '#38e1ff' : t.norad === 25867 ? '#a78bfa' : '#f1d48e');
    const e = viewer.entities.add({
      position: pos,
      point: { pixelSize: 8, color: col, outlineColor: C.Color.WHITE, outlineWidth: 1 },
      label: { text: t.name.replace(' Space Telescope', '').replace(' X-ray Observatory', ''), font: '12px Inter, sans-serif', fillColor: col,
        pixelOffset: new C.Cartesian2(0, -14), showBackground: true, backgroundColor: C.Color.fromCssColorString('rgba(10,11,13,0.7)') },
      polyline: { positions: new C.CallbackProperty(() => trail, false), width: 1.2, material: col.withAlpha(0.45) },
    });
    e._lts = { kind: 'sat', t };
    satEntities.push({ e, rebuild });
  }
  clearInterval(timer);
  timer = setInterval(() => satEntities.forEach((s) => s.rebuild()), 30000);
}

async function showInfo(x) {
  const info = document.getElementById('earth-info');
  if (x.kind === 'site') {
    const o = x.o;
    info.replaceChildren(el('div', { class: 'eyebrow' }, 'Observatory'), el('h3', {}, o.name),
      el('div', { class: 'muted small' }, `${o.country} · ${num(o.elev)} m above sea level · ${o.lat.toFixed(3)}°, ${o.lon.toFixed(3)}°`),
      el('p', {}, o.what), el('a', { href: o.url, target: '_blank', rel: 'noopener' }, 'Website ↗'));
    return;
  }
  const t = x.t; const p = satPosition(t);
  const card = [el('div', { class: 'eyebrow' }, 'Space telescope'), el('h3', {}, t.name), el('div', { class: 'muted small' }, `${t.band} · ${t.about}`),
    p ? el('div', { class: 'small mono' }, `${num(p.alt, 0)} km up · ${num(p.kms, 2)} km/s`) : null];
  const key = { 20580: 'hst', 25867: 'chandra' }[t.norad];
  if (key) {
    try {
      pointingCache = pointingCache || await api('/api/pointing', { timeout: 120000 });
      const sc = pointingCache.telescopes.find((s) => s.id === key);
      let tgt = null;
      if (sc && sc.visits) { const v = sc.visits.find((v) => v.state === 'now') || sc.visits[0]; if (v) tgt = { name: v.target, ra: v.ra ?? v.pos?.ra, dec: v.dec ?? v.pos?.dec }; }
      if (sc && sc.recent && sc.recent.length) tgt = { name: sc.recent[0].target, ra: sc.recent[0].ra, dec: sc.recent[0].dec, recent: true };
      if (tgt && tgt.ra != null) {
        card.push(el('div', { class: 'sc-now' }, el('div', { class: 'muted small' }, tgt.recent ? 'Most recent target' : 'Pointed at'), el('div', { class: 'big' }, tgt.name || '—'),
          el('button', { class: 'btn gold', onclick: () => { closeEarth(); S.flyTo(tgt.ra, tgt.dec, 0.2); } }, 'Look through it →')));
      }
    } catch { /* schedules unavailable: the card still shows the orbit */ }
  }
  info.replaceChildren(...card);
}
