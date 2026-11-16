// Zoom level-of-detail smoke (Playwright, real catalog).
// Asserts the settled LOD policy: catalog eligible counts grow with zoom,
// minor names hidden at overview return at z4, majors/large water/forest
// stay visible when geometrically onscreen, z4 detail style unchanged,
// terrain/glyph overlays untouched, full search intact at all zooms,
// coalesced move events run at most one layout pass (signature skip),
// DOM nodes/leader survive an unchanged-style re-pass, and layer switches
// respect LOD. Visual/timing quality is asserted via policy, not walltime.
// Run: node scripts/zoom-detail-smoke.mjs [baseUrl] [logPath]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8080/';
const LOG = process.argv[3] || 'reference/zoom-detail-smoke.log';
const log = [];
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`;
  log.push(line);
  console.log(line);
  if (ok) pass++; else fail++;
}
const settle = async (page) => page.waitForTimeout(700);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  window.__opened = [];
  window.open = function (u, t, f) { window.__opened.push({ u, t, f }); return null; };
});
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(
  () => window.GOTMAP_DEBUG && GOTMAP_DEBUG.engine, null, { timeout: 20000 });
// instrument the layout pass counter once
await page.evaluate(() => {
  const orig = GOTMAP_LABELS.placeLabels;
  window.__plCount = 0;
  GOTMAP_LABELS.placeLabels = function () {
    window.__plCount++;
    return orig.apply(this, arguments);
  };
});
await page.waitForTimeout(900);

// pick representative features once: a minor castle (minZ4), a major city,
// a large sea (nativeSize>=27 -> z1) and a forest (z2)
const feats = await page.evaluate(() => {
  const F = GOTMAP_CARTOGRAPHY.features;
  const majors = (window.GOTI18N && GOTI18N.majorTowns) || [];
  const pick = (pred) => {
    const f = F.find(pred);
    if (!f) return null;
    const label = f.label || f.english;
    return { id: f.id, kind: f.kind, native: f.fontSize,
      label: label,
      disp: (f.key && GOTI18N.towns && GOTI18N.towns[f.key]) || label,
      ll: [Math.atan(Math.sinh(Math.PI * (1 - 2 * f.y / 4642))) * 180 / Math.PI,
           f.x / 4642 * 360 - 180] };
  };
  // preferred hidden-minor fixture: Eyrie ('Ninho da Águia') exercises
  // accent-insensitive search; fall back to any non-major catalog castle
  const eyrie = (window.locations && locations.Eyrie) ? {
    id: 'Eyrie', kind: 'castle', label: 'Eyrie',
    disp: (GOTI18N.towns && GOTI18N.towns.Eyrie) || 'Eyrie',
    ll: [locations.Eyrie.lat, locations.Eyrie.lng] } : null;
  return {
    minor: eyrie || pick((f) => f.kind === 'castle' &&
      !majors.includes(f.id) && !majors.includes(f.key)),
    sea: pick((f) => f.kind === 'water' && f.fontSize >= 27),
    forest: pick((f) => f.kind === 'forest'),
  };
});
check('minor fixture exists (Eyrie preferred)', !!feats.minor,
  feats.minor ? feats.minor.id + ' ' + feats.minor.disp : 'none');
const counts = async (page) => page.evaluate(() => ({
  eligible: GOTMAP_DEBUG.lastLayout().items
    .filter((i) => i.id.charAt(0) === 'c').length,
  search: document.querySelectorAll('#townSelector li').length,
  raw: Object.keys(window.locations || {}).length,
  catalog: ((window.GOTMAP_CARTOGRAPHY || {}).features || []).length,
}));

// ---------- eligible counts increase with zoom at same camera ----------
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([-5, -75]));
const rows = [];
for (const z of [2, 3, 4]) {
  await page.evaluate((zz) => GOTMAP_DEBUG.engine.setZoom(zz), z);
  await page.waitForTimeout(500); // panTo during zoom animation is dropped
  await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([-5, -75]));
  await page.waitForTimeout(900);
  rows.push(await counts(page));
}
check('catalog eligible counts grow z2 -> z3 -> z4',
  rows[0].eligible > 0 && rows[0].eligible <= rows[1].eligible &&
  rows[1].eligible < rows[2].eligible, JSON.stringify(rows));
check('frozen data intact at all zooms (245 raw / 208 catalog / 387 search)',
  rows.every((r) => r.raw === 245 && r.catalog === 208 && r.search === 387),
  JSON.stringify(rows.map((r) => [r.raw, r.catalog, r.search])));

// ---------- minor hidden at z2, back at z4; majors/water/forest keep z2 ----------
async function catCount(name) {
  return page.evaluate((n) => {
    return [...document.querySelectorAll('.gotmap-label-wrap .gotmap-label')]
      .filter((s) => s.textContent.trim() === n).length;
  }, name);
}
if (feats.minor) {
  await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(2));
  await page.waitForTimeout(500);
  await page.evaluate((ll) => GOTMAP_DEBUG.engine.panTo(ll), feats.minor.ll);
  await page.waitForTimeout(800);
  check('minor name hidden at z2', (await catCount(feats.minor.disp)) === 0,
    feats.minor.id + ' ' + feats.minor.disp);
  await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(4));
  await page.waitForTimeout(500);
  await page.evaluate((ll) => GOTMAP_DEBUG.engine.panTo(ll), feats.minor.ll);
  await page.waitForTimeout(900);
  check('minor name returns at z4', (await catCount(feats.minor.disp)) === 1);
}
// zoom back to 2 and verify major + large water + forest survive
await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(2));
await page.waitForTimeout(500);
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([56.6, -109.1]));
await page.waitForTimeout(800);
const wh = await page.evaluate(() =>
  [...document.querySelectorAll('.gotmap-label-cat .gotmap-label')]
    .filter((s) => /Porto Branco|White Harbor/.test(s.textContent)).length);
check('major city (Porto Branco) eligible at z2', wh === 1, 'count=' + wh);
if (feats.sea) {
  await page.evaluate((ll) => GOTMAP_DEBUG.engine.panTo(ll), feats.sea.ll);
  await page.waitForTimeout(500);
  check('large sea stays at z2', (await catCount(feats.sea.label)) >= 1,
    feats.sea.id + ' ' + feats.sea.label);
}
if (feats.forest) {
  await page.evaluate((ll) => GOTMAP_DEBUG.engine.panTo(ll), feats.forest.ll);
  await page.waitForTimeout(500);
  check('forest stays at z2', (await catCount(feats.forest.label)) >= 1,
    feats.forest.id + ' ' + feats.forest.label);
}

// ---------- z4 detail style unchanged (city 14px / stroke ~1.12) ----------
await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(4));
await page.waitForTimeout(500);
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([56.6, -109.1]));
await page.waitForTimeout(800);
const st = await page.evaluate(() => {
  const s = [...document.querySelectorAll('.gotmap-label-cat .gotmap-label')]
    .find((x) => /Porto Branco|White Harbor/.test(x.textContent));
  return s ? { fs: parseFloat(s.style.fontSize),
    sw: parseFloat(s.style.webkitTextStrokeWidth || '0') } : null;
});
check('z4 city font 14 / stroke ~1.12 unchanged',
  !!st && Math.abs(st.fs - 14) < 0.6 && Math.abs(st.sw - 1.12) < 0.2,
  JSON.stringify(st));

// ---------- terrain + glyph overlays unchanged at every zoom ----------
const overlays = await page.evaluate(() => ({
  terrain: [...document.querySelectorAll('.leaflet-source-terrain-pane img')]
    .map((i) => ({ src: i.src.split('/').pop(), nw: i.naturalWidth })),
  glyphs: [...document.querySelectorAll('.leaflet-source-symbols-pane img')]
    .map((i) => i.src.split('/').pop()),
}));
check('terrain 4642 + glyph image URLs unchanged',
  overlays.terrain.length === 1 && overlays.terrain[0].nw === 4642 &&
  overlays.terrain[0].src === 'terrain.jpg' &&
  overlays.glyphs.join(',') === 'locations.png,spec_locations.png',
  JSON.stringify(overlays));

// ---------- search + popup work for a minor hidden at z2 ----------
await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(2));
await page.waitForTimeout(500);
if (feats.minor) {
  // accent-stripped query: 'Ninho da Águia' -> 'ninho da aguia' must match
  const q = feats.minor.disp.normalize('NFD').replace(/[̀-ͯ]/g, '');
  await page.fill('input[data-type="search"]', q);
  await page.waitForTimeout(350);
  const found = await page.evaluate((id) => {
    const a = document.querySelector(`#townSelector a[data-cat="${id}"],` +
      ` #townSelector a[href="#@${id}"]`);
    return !!a && !a.closest('li').classList.contains('ui-screen-hidden');
  }, feats.minor.id);
  check('accent-stripped search finds a minor hidden at z2', found,
    q + ' -> ' + feats.minor.disp);
  if (found) {
    await page.evaluate((id) => {
      const a = document.querySelector(`#townSelector a[data-cat="${id}"],` +
        ` #townSelector a[href="#@${id}"]`);
      a.click();
    }, feats.minor.id);
    await page.waitForTimeout(600);
    const ptxt = await page.evaluate(() => {
      const p = document.querySelector('.leaflet-popup-content');
      return p ? p.textContent : '';
    });
    check('popup opens for z2-hidden minor with matching name',
      ptxt.indexOf(feats.minor.disp) >= 0 || ptxt.indexOf(feats.minor.id) >= 0,
      ptxt.slice(0, 90));
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => {
      const b = document.querySelector('.leaflet-popup-close-button');
      if (b) b.click();
    });
  }
}
await page.fill('input[data-type="search"]', '');

// ---------- coalesced settle events: no pass for identical geometry ----------
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([-5, -75]));
await page.waitForTimeout(700);
const plBefore = await page.evaluate(() => window.__plCount);
await page.evaluate(() => {
  // real Leaflet event dispatch in one frame, geometry unchanged
  const m = GOTMAP_DEBUG.engine.map;
  m.fire('moveend'); m.fire('zoomend'); m.fire('viewreset');
});
await page.waitForTimeout(320); // >2 frames + 60ms scheduler fallback
const plAfter = await page.evaluate(() => window.__plCount);
check('coalesced move/zoom/viewreset add no layout pass',
  plAfter === plBefore, `${plBefore} -> ${plAfter}`);
// an actual obstacle change must recompute
await page.click('#legendClose');
await page.waitForTimeout(400);
const plAfter2 = await page.evaluate(() => window.__plCount);
check('legend/obstacle change recomputes layout',
  plAfter2 > plAfter, `${plAfter} -> ${plAfter2}`);
await page.click('#legendToggle');
await page.waitForTimeout(400);

// ---------- shared-renderer memoization on an independent probe label ----------
const ident = await page.evaluate(() => {
  const eng = GOTMAP_DEBUG.engine;
  const c = eng.getCenter();
  const ov = eng.label([c[0] - 3, c[1] + 10], 'SondaDOM',
    { className: 'gotmap-label-cat', kind: 'city', centered: true });
  ov.setStyle({ fontSize: 14, strokeWidth: 1.12, kind: 'city',
    offsetX: 24, offsetY: 12, leader: { dx: 24, dy: 12 } });
  ov.setVisible(true);
  const el = ov.raw.getElement();
  if (!el) return { ok: false, reason: 'no element' };
  const span1 = el.querySelector('.gotmap-label');
  const lead1 = el.querySelector('svg.gotmap-leader');
  // identical style with a NEW leader object + redundant setVisible(true)
  ov.setStyle({ fontSize: 14, strokeWidth: 1.12, kind: 'city',
    offsetX: 24, offsetY: 12, leader: { dx: 24, dy: 12 } });
  ov.setVisible(true);
  const same = el.querySelector('.gotmap-label') === span1 &&
    el.querySelector('svg.gotmap-leader') === lead1 && !!lead1;
  // hide -> change font -> show: cached style re-applied on add
  ov.setVisible(false);
  ov.setStyle({ fontSize: 11 });
  ov.setVisible(true);
  const el2 = ov.raw.getElement();
  const sp = el2 && el2.querySelector('.gotmap-label');
  const restored = !!sp && sp.textContent === 'SondaDOM' &&
    sp.style.fontSize === '11px';
  ov.setVisible(false);
  return { ok: true, same: same, restored: restored };
});
check('identical style reuses span+leader DOM nodes',
  ident.ok && ident.same, JSON.stringify(ident));
check('hidden label restores cached style on re-add',
  ident.ok && ident.restored);

// ---------- pan away + back: no stranded labels ----------
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([40, 60]));
await page.waitForTimeout(600);
const stray = await page.evaluate(() =>
  [...document.querySelectorAll('.gotmap-label-cat .gotmap-label')]
    .filter((s) => {
      const r = s.getBoundingClientRect();
      return r.width && (r.left < -50 || r.top < -50 ||
        r.right > innerWidth + 50 || r.bottom > innerHeight + 50);
    }).length);
check('pan away leaves no stranded visible labels', stray <= 2, 'stray=' + stray);
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([-5, -75]));
await page.waitForTimeout(600);

// ---------- layer switches respect LOD ----------
await page.click('.gotmap-layer-btn[data-layer="fsm"]');
await page.waitForTimeout(400);
check('fsm hides LOD names', await page.evaluate(() =>
  document.querySelectorAll('.gotmap-label-cat .gotmap-label').length === 0));
await page.click('.gotmap-layer-btn[data-layer="pt"]');
await page.waitForTimeout(600);
check('pt restores LOD names', await page.evaluate(() =>
  document.querySelectorAll('.gotmap-label-cat .gotmap-label').length > 0));

// ---------- screenshots ----------
await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(2));
await page.waitForTimeout(500);
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([25, -110]));
await page.waitForTimeout(800);
await page.screenshot({ path: 'reference/zoom-detail-overview.png' });
await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(4));
await page.waitForTimeout(500);
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([20, -113])); // Riverlands
await page.waitForTimeout(800);
await page.screenshot({ path: 'reference/zoom-detail-detail.png' });
const mob = await browser.newPage({ viewport: { width: 390, height: 780 } });
await mob.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await mob.waitForFunction(
  () => window.GOTMAP_DEBUG && GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await mob.waitForTimeout(900);
await mob.screenshot({ path: 'reference/zoom-detail-mobile.png' });
await mob.close();

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
log.push(`RESULT ${pass} pass / ${fail} fail`);
console.log(`\n${pass} pass / ${fail} fail -> ${LOG}`);
writeFileSync(LOG, log.join('\n') + '\n', 'utf-8');
process.exit(fail ? 1 : 0);
