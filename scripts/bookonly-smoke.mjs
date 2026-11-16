// Focused book-only + source-renderer smoke checks (Playwright).
// Covers: no episode UI/data, transparent hit targets, direct original-URL
// point clicks, Ctrl/Meta share hash, injected cartography catalog labels
// (kind colors / white stroke / native scaling / angle), legend visibility
// on desktop + mobile, and search still panning to a popup.
// Run: node scripts/bookonly-smoke.mjs [baseUrl] [logPath]
// Writes: reference/bookonly-smoke.log, reference/bookonly-legend.png
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8080/';
const LOG = process.argv[3] || 'reference/bookonly-smoke.log';
const log = [];
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`;
  log.push(line);
  console.log(line);
  if (ok) pass++; else fail++;
}

const HIT_GIF =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// cartography catalog fixture (injected - the real assets/js/cartography.js
// is authored separately; interface is frozen). x/y are label centers on
// the original 4642px artwork; (967,2321) projects to ~ map center [0,-105].
const CATALOG_FIXTURE = `window.GOTMAP_CARTOGRAPHY = {
  width: 4642, height: 4642,
  features: [
    { key: 'Winterfell', english: 'Winterfell', kind: 'city',
      x: 967, y: 2321, fontSize: 30, angle: 0 },
    { english: 'Fake Forest', label: 'Fake Forest', kind: 'forest',
      x: 1067, y: 2221, fontSize: 20, angle: -15 },
    { english: 'Narrow Sea', label: 'Narrow Sea', kind: 'water',
      x: 867, y: 2421, fontSize: 24 }
  ]
};`;

const browser = await chromium.launch();

// ---------------- desktop ----------------
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  window.__opened = [];
  const orig = window.open;
  window.open = function (u, t, f) {
    window.__opened.push({ u: String(u), t: t, f: f });
    return orig ? null : null;
  };
});
await page.route('**/assets/js/cartography.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: CATALOG_FIXTURE }));
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(
  () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await page.waitForTimeout(800);

check('leaflet engine initialized',
  await page.evaluate(() => GOTMAP_DEBUG.engine.kind === 'leaflet'));

// --- books-only UI / data ---
check('no episode controls in DOM', await page.evaluate(() =>
  !document.querySelector('#epSlider, #epGroup, #epTitle, #sliderType, #radio_episodes')));
check('no episodes variable at runtime',
  await page.evaluate(() => typeof window.episodes === 'undefined'));
check('chapter slider still drives spoilers', await page.evaluate(() => {
  const s = document.querySelector('#chapSlider');
  return s && parseInt(s.max, 10) === window.chapters.length - 1;
}));
check('about title is books-only', await page.evaluate(() =>
  document.querySelector('#lightbox h1').textContent
    .includes('Crônicas de Gelo e Fogo')));
check('no HBO/Fandom links rendered', await page.evaluate(() =>
  !document.querySelector('a[href*="hbo.com"], a[href*="fandom.com"]')));

// --- transparent hit targets ---
check('town markers are transparent hit targets', await page.evaluate((gif) => {
  const icons = [...document.querySelectorAll('.leaflet-marker-icon')];
  const hits = icons.filter((i) => i.src === gif);
  return icons.length > 200 && hits.length >= 240;
}, HIT_GIF), HIT_GIF.slice(0, 40));

// --- direct original-URL clicks ---
// pan so the target markers are inside the viewport (default view is ocean)
async function panTo(key) {
  await page.evaluate((k) => {
    const l = window.locations[k];
    GOTMAP_DEBUG.engine.panTo([l.lat, l.lng]);
  }, key);
  await page.waitForTimeout(400);
}
await panTo('Winterfell');
await page.click('img.leaflet-marker-icon[title="Winterfell"]');
const opened0 = await page.evaluate(() => window.__opened);
check('Winterfell click opens default awoiaf URL directly',
  opened0.length === 1 &&
  opened0[0].u === 'https://awoiaf.westeros.org/index.php/Winterfell' &&
  opened0[0].t === '_blank',
  JSON.stringify(opened0));

// custom chapter URL preserved verbatim (Execution Holdfast -> AGOT ch.1)
await panTo('Execution_Holdfast');
await page.click('img.leaflet-marker-icon[title="Fortaleza da execução"]');
const opened1 = await page.evaluate(() => window.__opened);
check('custom loc.url opened verbatim',
  opened1.length === 2 &&
  opened1[1].u === 'https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_1',
  opened1[1] && opened1[1].u);

// Ctrl+click shares the hash, opens nothing external
await panTo('Winterfell');
await page.click('img.leaflet-marker-icon[title="Winterfell"]', { modifiers: ['Control'] });
await page.waitForTimeout(150);
const afterCtrl = await page.evaluate(() => ({
  opened: window.__opened.length, hash: window.location.hash,
}));
check('ctrl+click shares hash without external open',
  afterCtrl.opened === 2 && afterCtrl.hash === '#@Winterfell',
  afterCtrl.hash);

// --- catalog label rendering ---
// back to the fixture labels' position (catalog features sit near [0,-105])
await page.evaluate(() => GOTMAP_DEBUG.engine.panTo([0, -105]));
await page.waitForTimeout(500);
const labelStats = await page.evaluate(() => {
  const out = {};
  for (const kind of ['city', 'forest', 'water']) {
    const span = document.querySelector(`.gotmap-label-cat.kind-${kind} .gotmap-label`);
    if (!span) { out[kind] = null; continue; }
    const cs = getComputedStyle(span);
    out[kind] = {
      text: span.textContent,
      color: cs.color,
      stroke: cs.webkitTextStrokeColor || cs.getPropertyValue('-webkit-text-stroke-color'),
      strokeW: cs.webkitTextStrokeWidth || cs.getPropertyValue('-webkit-text-stroke-width'),
      fontSize: parseFloat(span.style.fontSize || cs.fontSize),
      transform: span.style.transform,
    };
  }
  return out;
});
check('catalog city label localized + red #692323',
  !!labelStats.city && labelStats.city.color === 'rgb(105, 35, 35)',
  JSON.stringify(labelStats.city));
check('catalog forest label green #283519',
  !!labelStats.forest && labelStats.forest.color === 'rgb(40, 53, 25)',
  labelStats.forest && labelStats.forest.color);
check('catalog water label blue-grey #829aa4',
  !!labelStats.water && labelStats.water.color === 'rgb(130, 154, 164)',
  labelStats.water && labelStats.water.color);
check('catalog labels have white text stroke', await page.evaluate(() => {
  const span = document.querySelector('.gotmap-label-cat .gotmap-label');
  if (!span) return false;
  const cs = getComputedStyle(span);
  const c = cs.webkitTextStrokeColor || cs.getPropertyValue('-webkit-text-stroke-color');
  return /rgb\(255,\s*255,\s*255\)|#fff/i.test(String(c));
}));
check('native font size scaled with zoom (30px @ z4 -> ~26.5px)',
  !!labelStats.city && Math.abs(labelStats.city.fontSize - 26.466) < 1.5,
  labelStats.city && labelStats.city.fontSize);
check('catalog angle respected (forest -15deg)',
  !!labelStats.forest &&
    /translate\(-50%,\s*-50%\)\s*rotate\(-15deg\)/.test(labelStats.forest.transform),
  labelStats.forest && labelStats.forest.transform);
check('debug.visibleFeatures exposes catalog coverage',
  await page.evaluate(() => {
    const v = GOTMAP_DEBUG.visibleFeatures();
    return v.includes('Winterfell') && v.length === 3;
  }));

// label click -> same original URL
await page.click('.gotmap-label-cat.kind-city .gotmap-label');
const opened2 = await page.evaluate(() => window.__opened);
check('catalog label click opens same original URL',
  opened2.length === 3 &&
  opened2[2].u === 'https://awoiaf.westeros.org/index.php/Winterfell',
  opened2[2] && opened2[2].u);

// fallback town label for a non-catalog location still exists
check('non-catalog location keeps fallback label',
  await page.evaluate(() => GOTMAP_DEBUG.labelCount() > 0));

// --- search merges catalog-only features ---
await page.fill('input[data-type="search"]', 'Fake Forest');
await page.waitForTimeout(350);
check('catalog-only feature merged into search',
  await page.evaluate(() => {
    const a = document.querySelector('a[href="#@cat1"]');
    return !!a && !a.closest('li').classList.contains('ui-screen-hidden');
  }));
check('catalog feature does not duplicate raw location keys',
  await page.evaluate(() =>
    document.querySelectorAll('#townSelector a[href="#@Winterfell"]').length === 1));

// --- legend (desktop) ---
check('legend toggle visible on desktop',
  await page.isVisible('#legendToggle'));
await page.click('#legendToggle');
await page.waitForTimeout(200);
check('legend panel opens with 10 source sprites + gate addition', await page.evaluate(() => {
  const p = document.querySelector('#mapLegend');
  if (!p || getComputedStyle(p).display === 'none') return false;
  const imgs = [...p.querySelectorAll('img')];
  return imgs.length === 10 &&
    imgs.every((i) => i.src.includes('assets/img/map-symbols/') && i.naturalWidth > 0) &&
    !!p.querySelector('.gate-glyph');
}));
await page.screenshot({ path: 'reference/bookonly-legend.png' });
await page.click('#legendToggle');

// --- search -> popup still works ---
await page.fill('input[data-type="search"]', 'winterfell');
await page.waitForTimeout(350);
await page.click('#townSelector a[href="#@Winterfell"]');
await page.waitForFunction(() => {
  const el = document.querySelector('.leaflet-popup-content');
  return el && el.innerHTML.includes('Winterfell');
}, null, { timeout: 5000 });
check('search still pans to a popup',
  await page.evaluate(() =>
    document.querySelector('.leaflet-popup-content').innerHTML.includes('Winterfell')));

// ---------------- mobile ----------------
const mpage = await browser.newPage({ viewport: { width: 420, height: 800 } });
mpage.on('pageerror', (e) => errors.push('mobile: ' + String(e)));
await mpage.route('**/assets/js/cartography.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: CATALOG_FIXTURE }));
await mpage.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await mpage.waitForFunction(
  () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await mpage.waitForTimeout(600);
await mpage.click('#menuButton');
await mpage.waitForTimeout(300);
check('mobile menu exposes legend button', await mpage.isVisible('#htLegend'));
await mpage.click('#htLegend');
await mpage.waitForTimeout(200);
check('mobile legend panel opens', await mpage.evaluate(() => {
  const p = document.querySelector('#mapLegend');
  return p && getComputedStyle(p).display !== 'none' && p.offsetHeight > 0;
}));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
log.push(`RESULT ${pass} pass / ${fail} fail`);
console.log(`\n${pass} pass / ${fail} fail -> ${LOG}`);
writeFileSync(LOG, log.join('\n') + '\n', 'utf-8');
process.exit(fail ? 1 : 0);
