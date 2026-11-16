// Real-catalog smoke checks (Playwright) - runs against the shipped
// assets/js/cartography.js, NOT an injected fixture.
// Hard requirements once the catalog has features: named source labels
// (Kingswood forest, Bay_of_Ice water, White_Harbor city) render with the
// source palette + white stroke; label click opens the exact original
// reference URL; raw point click opens custom loc.url verbatim; markers are
// transparent hit targets; native font scaling z3->z5; fsm AND nat hide
// catalog labels, pt restores; no collision suppression; repeated ids ->
// one search entry; '#@<id>' hash navigation; accent-insensitive search;
// legend 10 sprites + Portão local addition + close (desktop+mobile);
// zero page errors/failed requests.
// Exits 0 with SKIP only while the catalog is still the empty placeholder.
// Run: node scripts/cartography-smoke.mjs [baseUrl] [logPath]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import LAY from '../assets/js/label-layout.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8080/';
const LOG = process.argv[3] || 'reference/cartography-smoke.log';
const log = [];
let pass = 0, fail = 0, skip = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`;
  log.push(line);
  console.log(line);
  if (ok) pass++; else fail++;
}
function note(name, detail) {
  const line = `SKIP ${name} :: ${detail}`;
  log.push(line);
  console.log(line);
  skip++;
}

const HIT_GIF =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const FONT_SPEC = (kind, z) => LAY.fontStyle(kind, z).fontSize;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const transportFails = []; // requestfailed: canceled/refused etc, NOT HTTP status
const httpFails = [];      // real >=400 responses
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) =>
  transportFails.push({
    url: r.url(),
    errorText: r.failure() && r.failure().errorText,
    resourceType: r.resourceType(),
  }));
page.on('response', (r) => { if (r.status() >= 400) httpFails.push(r.url() + ' -> ' + r.status()); });
await page.addInitScript(() => {
  window.__opened = [];
  window.open = function (u, t, f) {
    window.__opened.push({ u: String(u), t: t, f: f });
    return null;
  };
});
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(
  () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await page.waitForTimeout(800);

const catCount = await page.evaluate(() =>
  (window.GOTMAP_CARTOGRAPHY || { features: [] }).features.length);

if (!catCount) {
  note('all checks', 'assets/js/cartography.js still ships the empty placeholder');
  log.push(`RESULT ${pass} pass / ${fail} fail / ${skip} skipped`);
  console.log(`${pass} pass / ${fail} fail / ${skip} skipped -> ${LOG}`);
  writeFileSync(LOG, log.join('\n') + '\n', 'utf-8');
  await browser.close();
  process.exit(0);
}

// helpers evaluated in-page: mirror the app's catalog resolution
const toLL = (f) => [
  Math.atan(Math.sinh(Math.PI * (1 - 2 * f.y / 4642))) * 180 / Math.PI,
  f.x / 4642 * 360 - 180,
];
function findFeature(pred) {
  return page.evaluate((src) => {
    const p = eval('(' + src + ')');
    const C = window.GOTMAP_CARTOGRAPHY;
    const f = C.features.find(p);
    if (!f) return null;
    const key = f.key && window.locations[f.key] ? f.key : null;
    let name;
    if (key) {
      const loc = window.locations[key];
      name = (window.GOTI18N.towns[key]) ||
        (loc.title ? loc.title.replace(/^\d+:\s*/, '')
          : key.replace(/_/g, ' ').replace(/%27/g, "'"));
    } else {
      name = f.label || f.english || '';
    }
    return {
      f, key, name,
      url: key
        ? ((window.locations[key] && window.locations[key].url) ||
            'https://awoiaf.westeros.org/index.php/' + key)
        : (f.url || null),
      ll: [Math.atan(Math.sinh(Math.PI * (1 - 2 * f.y / C.height))) * 180 / Math.PI,
           f.x / C.width * 360 - 180],
    };
  }, String(pred));
}
async function pan(ll) {
  await page.evaluate((p) => GOTMAP_DEBUG.engine.panTo(p), ll);
  await page.waitForTimeout(450);
}
async function labelStats(name) {
  return page.evaluate((t) => {
    const spans = [...document.querySelectorAll('.gotmap-label-cat .gotmap-label')]
      .filter((s) => s.textContent === t);
    if (!spans.length) return null;
    const s = spans[0];
    const cs = getComputedStyle(s);
    return {
      count: spans.length,
      color: cs.color,
      stroke: cs.webkitTextStrokeColor || cs.getPropertyValue('-webkit-text-stroke-color'),
      fontSize: parseFloat(s.style.fontSize || cs.fontSize),
    };
  }, name);
}
// real pointer click on the exact-text label span (hit-testing preserved;
// if another interactive label legitimately covers it this genuinely fails)
async function clickLabel(name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loc = page.locator('.gotmap-label-cat .gotmap-label')
    .filter({ hasText: new RegExp('^' + esc + '$') }).first();
  await loc.waitFor({ timeout: 15000 });
  await loc.click({ timeout: 15000 });
}

// ---------- named source labels ----------
const kingswood = await findFeature((f) => f.id === 'Kingswood' && f.kind === 'forest');
check('Kingswood exists in catalog', !!kingswood);
if (kingswood) {
  await pan(kingswood.ll);
  const st = await labelStats(kingswood.name);
  check('Kingswood label green #283519 + white stroke',
    !!st && st.color === 'rgb(40, 53, 25)' &&
      /rgb\(255,\s*255,\s*255\)|#fff/i.test(String(st.stroke)),
    JSON.stringify(st));
}

const bayOfIce = await findFeature((f) => (f.id === 'Bay_of_Ice' || f.key === 'Bay_of_Ice') && f.kind === 'water');
check('Bay_of_Ice exists in catalog', !!bayOfIce);
if (bayOfIce) {
  await pan(bayOfIce.ll);
  const st = await labelStats(bayOfIce.name);
  check('Bay_of_Ice label blue-grey #829aa4', !!st && st.color === 'rgb(130, 154, 164)',
    st && st.color);
}

// ---------- White Harbor: red label + exact original URL on click ----------
const whiteHarbor = await findFeature((f) => f.key === 'White_Harbor');
check('White_Harbor keyed feature exists', !!whiteHarbor);
if (whiteHarbor) {
  await pan(whiteHarbor.ll);
  const st = await labelStats(whiteHarbor.name);
  check('White_Harbor label localized + red #692323',
    !!st && st.color === 'rgb(105, 35, 35)' && whiteHarbor.name === 'Porto Branco',
    JSON.stringify(st));
  await page.evaluate(() => { window.__opened = []; });
  await clickLabel(whiteHarbor.name);
  const opened = await page.evaluate(() => window.__opened);
  const expected = whiteHarbor.url;
  check('White_Harbor label click opens exactly one original URL',
    opened.length === 1 && opened[0].u === expected && opened[0].t === '_blank',
    JSON.stringify(opened));
}

// ---------- raw point click: custom loc.url verbatim ----------
await page.evaluate(() => {
  const l = window.locations.Execution_Holdfast;
  GOTMAP_DEBUG.engine.panTo([l.lat, l.lng]);
});
await page.waitForTimeout(400);
await page.evaluate(() => { window.__opened = []; });
// dispatchEvent: an interactive catalog label may legitimately sit on top of
// the 16px transparent hit target; we assert the marker's own click handler.
const ehLoc = page.locator('img.leaflet-marker-icon[title="Fortaleza da execução"]').first();
await ehLoc.waitFor({ timeout: 15000 });
await ehLoc.dispatchEvent('click');
const openedCustom = await page.evaluate(() => window.__opened);
check('raw point click opens custom loc.url verbatim (single open)',
  openedCustom.length === 1 &&
    openedCustom[0].u === 'https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_1',
  JSON.stringify(openedCustom));

// ---------- transparent hit targets ----------
check('markers are transparent hit targets (source symbols uncovered)',
  await page.evaluate((gif) => {
    const icons = [...document.querySelectorAll('.leaflet-marker-icon')];
    const hits = icons.filter((i) => i.src === gif);
    return icons.length > 200 && hits.length >= 240;
  }, HIT_GIF));

// ---------- native font scaling z3 -> z5 (label must exist at both) ----------
// NOTE: maxBounds clamps the center at low zoom, so after each setZoom the
// target may genuinely sit offscreen - re-pan to it and require its projected
// point inside the viewport before asserting the label is rendered.
if (whiteHarbor) {
  await pan(whiteHarbor.ll);
  const zoomRows = [];
  for (const z of [3, 5]) {
    await page.evaluate((zz) => GOTMAP_DEBUG.engine.setZoom(zz), z);
    await page.waitForTimeout(400);
    await pan(whiteHarbor.ll);
    // wait for the post-move rebuild to settle: the label may be culled
    // transiently mid-animation and must come back once the pan ends
    const settled = await page.waitForFunction(
      () => GOTMAP_DEBUG.visibleFeatures().includes('White_Harbor'),
      null, { timeout: 10000 }).then(() => true, () => false);
    const pt = await page.evaluate((p) => ({
      pt: GOTMAP_DEBUG.engine.project(p),
      size: GOTMAP_DEBUG.engine.getContainerSize(),
    }), whiteHarbor.ll);
    const inView = pt.pt && pt.pt.x > 0 && pt.pt.y > 0 &&
      pt.pt.x < pt.size.w && pt.pt.y < pt.size.h;
    check(`z${z}: White_Harbor projects inside viewport after re-pan`, inView,
      JSON.stringify(pt));
    const st = await labelStats(whiteHarbor.name);
    zoomRows.push({ z, st, settled, expect: FONT_SPEC('city', z) });
  }
  check('catalog label present at z3 AND z5 (no suppression)',
    zoomRows.every((r) => !!r.st && r.settled),
    JSON.stringify(zoomRows.map((r) => ({ st: r.st, settled: r.settled }))));
  check('category font size scales per spec',
    zoomRows.every((r) => r.st && Math.abs(r.st.fontSize - r.expect) < 0.6),
    JSON.stringify(zoomRows.map((r) => ({ z: r.z, fs: r.st && r.st.fontSize, exp: r.expect }))));
  await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(4));
  await page.waitForTimeout(300);
}

// ---------- layer visibility: fsm AND nat hide, pt restores ----------
// source-symbol overlays: real locations.png + spec_locations.png restored
// above tiles on pt/nat (fsm tiles draw their own), non-interactive pane.
async function symbolState() {
  return page.evaluate(() => {
    const pane = document.querySelector('.leaflet-source-symbols-pane');
    const imgs = pane ? [...pane.querySelectorAll('img.leaflet-image-layer')] : [];
    return {
      count: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth === 4642).length,
      pe: pane ? getComputedStyle(pane).pointerEvents : null,
    };
  });
}
if (whiteHarbor) await pan(whiteHarbor.ll);
for (const layer of ['fsm', 'nat']) {
  await page.click(`.gotmap-layer-btn[data-layer="${layer}"]`);
  await page.waitForTimeout(400);
  check(`${layer} layer hides catalog labels`,
    await page.evaluate(() => GOTMAP_DEBUG.visibleFeatures().length === 0));
  const ss = await symbolState();
  check(`source-symbol overlays ${layer === 'fsm' ? 'hidden on fsm' : 'present on nat'}`,
    layer === 'fsm' ? ss.count === 0 : ss.count === 2 && ss.loaded === 2,
    JSON.stringify(ss));
}
await page.click('.gotmap-layer-btn[data-layer="pt"]');
await page.waitForTimeout(400);
check('pt layer restores catalog labels',
  await page.evaluate(() => GOTMAP_DEBUG.visibleFeatures().length > 0));
{
  const ss = await symbolState();
  check('source-symbol overlays restored on pt, loaded 4642 + non-interactive',
    ss.count === 2 && ss.loaded === 2 && ss.pe === 'none', JSON.stringify(ss));
}

// ---------- no collision drop: visible count == DOM-visible labels ----------
check('catalog labels not collision-dropped', await page.evaluate(() => {
  const vis = GOTMAP_DEBUG.visibleFeatures().length;
  const dom = document.querySelectorAll('.gotmap-label-cat .gotmap-label').length;
  return vis === dom && vis > 0;
}, null), String(await page.evaluate(() => GOTMAP_DEBUG.visibleFeatures().length)));

// ---------- repeated ids -> single search entry ----------
const dup = await page.evaluate(() => {
  const counts = {};
  for (const f of (window.GOTMAP_CARTOGRAPHY || { features: [] }).features) {
    if (f.key && window.locations[f.key]) continue;
    if (f.id) counts[f.id] = (counts[f.id] || 0) + 1;
  }
  const repeated = Object.entries(counts).find(([, n]) => n > 1);
  if (!repeated) return null;
  return {
    id: repeated[0], instances: repeated[1],
    searchItems: document.querySelectorAll(`#townSelector a[data-cat="${repeated[0]}"]`).length,
  };
});
if (dup) {
  check('repeated label instances -> single search entry',
    dup.searchItems === 1, JSON.stringify(dup));
} else note('dedupe', 'catalog has no repeated ids');

// ---------- '#@<id>' hash navigation + accent-insensitive search ----------
const catOnlyId = await page.evaluate(() => {
  for (const f of (window.GOTMAP_CARTOGRAPHY || { features: [] }).features) {
    if (f.key && window.locations[f.key]) continue;
    if (f.id) return f.id;
  }
  return null;
});
check('catalog has an id-bearing catalog-only feature', !!catOnlyId);
// custom id characters: apostrophe (%27) and parentheses
const specialIds = await page.evaluate(() => {
  const ids = (window.GOTMAP_CARTOGRAPHY || { features: [] }).features
    .map((f) => f.id).filter(Boolean);
  return {
    apostrophe: ids.find((i) => i.includes('%27')) || null,
    parens: ids.find((i) => i.includes('(')) || null,
  };
});
const HASH_IDS = [catOnlyId, specialIds.apostrophe, specialIds.parens]
  .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
for (const hid of HASH_IDS) {
  const cpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  cpage.on('pageerror', (e) => errors.push('hashpage: ' + String(e)));
  await cpage.goto(BASE + '#@' + hid, { waitUntil: 'load', timeout: 30000 });
  await cpage.waitForFunction(
    () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
  await cpage.waitForTimeout(700);
  check(`catalog-id hash '#@${hid}' opens catalog popup`,
    await cpage.evaluate(() => {
      const el = document.querySelector('.leaflet-popup-content');
      return !!el && el.innerHTML.length > 0;
    }));
  await cpage.close();
}
if (catOnlyId) {

  const raw = await page.evaluate((id) => {
    const f = window.GOTMAP_CARTOGRAPHY.features.find((x) => x.id === id);
    return f ? (f.label || f.english) : null;
  }, catOnlyId);
  if (raw) {
    const ascii = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    await page.fill('input[data-type="search"]', ascii);
    await page.waitForTimeout(350);
    check('catalog feature searchable accent-insensitively', await page.evaluate((id) => {
      const a = document.querySelector(`#townSelector a[data-cat="${id}"]`);
      return !!a && !a.closest('li').classList.contains('ui-screen-hidden');
    }, catOnlyId));
    await page.fill('input[data-type="search"]', '');
  }
}

// ---------- legend: DEFAULT OPEN on desktop + sprites + gate + close ----------
check('legend open by default on desktop',
  await page.evaluate(() =>
    getComputedStyle(document.getElementById('mapLegend')).display !== 'none'));
await page.click('#legendClose');
await page.waitForTimeout(150);
check('legend close button hides panel',
  await page.evaluate(() =>
    getComputedStyle(document.getElementById('mapLegend')).display === 'none'));
await page.click('#legendToggle');
await page.waitForTimeout(200);
const legendCheck = await page.evaluate(() => {
  const p = document.querySelector('#mapLegend');
  if (!p || getComputedStyle(p).display === 'none') return null;
  const imgs = [...p.querySelectorAll('img')];
  return {
    imgs: imgs.length,
    spritesOk: imgs.every((i) => i.src.includes('assets/img/map-symbols/') && i.naturalWidth > 0),
    gate: !!p.querySelector('.gate-glyph'),
    close: !!p.querySelector('#legendClose'),
    expanded: document.getElementById('legendToggle').getAttribute('aria-expanded'),
    mobileExpanded: document.getElementById('htLegend').getAttribute('aria-expanded'),
  };
});
check('legend: 10 source sprites + gate addition + close + aria-expanded',
  !!legendCheck && legendCheck.imgs === 10 && legendCheck.spritesOk &&
    legendCheck.gate && legendCheck.close &&
    legendCheck.expanded === 'true' && legendCheck.mobileExpanded === 'true',
  JSON.stringify(legendCheck));
await page.click('#legendClose');
await page.waitForTimeout(150);

const mpage = await browser.newPage({ viewport: { width: 420, height: 800 } });
mpage.on('pageerror', (e) => errors.push('mobile: ' + String(e)));
await mpage.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await mpage.waitForFunction(
  () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await mpage.waitForTimeout(600);
check('mobile: legend closed by default + floating button visible',
  await mpage.evaluate(() =>
    getComputedStyle(document.getElementById('mapLegend')).display === 'none' &&
    getComputedStyle(document.getElementById('legendToggle')).display !== 'none'));
await mpage.click('#menuButton');
await mpage.waitForTimeout(300);
await mpage.click('#htLegend');
await mpage.waitForTimeout(200);
check('mobile legend opens via menu + closes',
  await mpage.evaluate(() => getComputedStyle(document.getElementById('mapLegend')).display !== 'none'));
await mpage.click('#legendClose');
await mpage.close();

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
check('no HTTP >=400 responses', httpFails.length === 0, httpFails.slice(0, 5).join(' | '));
// Only deliberate tile-image cancellations are informational: ERR_ABORTED +
// resourceType 'image' + same origin + a nat/fsm keyhole tile pathname.
const baseOrigin = new URL(BASE).origin;
const isCanceledTile = (f) => {
  if (f.errorText !== 'net::ERR_ABORTED' || f.resourceType !== 'image') return false;
  try {
    const u = new URL(f.url);
    return u.origin === baseOrigin &&
      /^\/assets\/tiles\/(nat|fsm)\/t[qrst]*\.jpg$/.test(u.pathname);
  } catch { return false; }
};
const canceledTiles = transportFails.filter(isCanceledTile);
const realTransport = transportFails.filter((f) => !isCanceledTile(f));
check('no transport-failed requests (excluding canceled obsolete tiles)',
  realTransport.length === 0,
  realTransport.map((f) => f.url + ' -> ' + f.errorText).slice(0, 5).join(' | ') ||
    canceledTiles.length + ' canceled obsolete tiles during navigation');

// ---------- regional + mobile screenshots (same browser session) ----------
const REGIONS = [
  ['north', [66.25, -123.33]],      // centered on Winterfell
  ['riverlands', [-5, -75]],        // dense label area
  ['dorne', [-43.58, -84.57]],      // centered on Sunspear
  ['essos', [-5, 40]],
];
try {
  await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(4));
  for (const [name, ll] of REGIONS) {
    await page.evaluate((p) => GOTMAP_DEBUG.engine.panTo(p), ll);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'reference/catalog-' + name + '.png' });
    console.log('SHOT reference/catalog-' + name + '.png');
  }
  const mshot = await browser.newPage({ viewport: { width: 420, height: 800 } });
  await mshot.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await mshot.waitForFunction(
    () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
  await mshot.waitForTimeout(900);
  await mshot.screenshot({ path: 'reference/catalog-mobile.png' });
  console.log('SHOT reference/catalog-mobile.png');
  await mshot.close();
} catch (e) { console.log('SHOT-ERR ' + String(e)); }

await browser.close();
log.push(`RESULT ${pass} pass / ${fail} fail / ${skip} skipped`);
console.log(`\n${pass} pass / ${fail} fail / ${skip} skipped -> ${LOG}`);
writeFileSync(LOG, log.join('\n') + '\n', 'utf-8');
process.exit(fail ? 1 : 0);
