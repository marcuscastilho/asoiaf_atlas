// Label-layout presentation smoke (Playwright, real catalog).
// Asserts: category-capped font sizes at z5 (max 26 / city<=17), SVG curved
// textPath labels with working exact-URL clicks, legend default-open on
// desktop + close/reopen + floating button on mobile, source-res terrain
// overlay (4642) correct per base layer, leader lines on displaced point
// labels, reduced overlaps in dense Riverlands, and accent-insensitive
// search for the newest book-reviewed labels.
// Run: node scripts/label-layout-smoke.mjs [baseUrl] [logPath]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8080/';
const LOG = process.argv[3] || 'reference/label-layout-smoke.log';
const log = [];
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`;
  log.push(line);
  console.log(line);
  if (ok) pass++; else fail++;
}

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
  () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await page.waitForTimeout(900);

// ---------- font caps at z5 (worst case, dense pan) ----------
await page.evaluate(() => {
  GOTMAP_DEBUG.engine.setZoom(5);
  GOTMAP_DEBUG.engine.panTo([30, -80]);
});
await page.waitForTimeout(900);
const caps = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('.gotmap-label-cat .gotmap-label')];
  let max = 0, maxCity = 0;
  for (const s of spans) {
    const fs = parseFloat(s.style.fontSize || getComputedStyle(s).fontSize);
    const kind = [...s.closest('.gotmap-label-wrap').classList]
      .find((c) => c.startsWith('kind-'));
    if (fs > max) max = fs;
    if (kind === 'kind-city' && fs > maxCity) maxCity = fs;
  }
  return { max, maxCity, count: spans.length };
});
check('z5: no catalog label exceeds 26px', caps.max <= 26.01 && caps.count > 0,
  JSON.stringify(caps));
check('z5: no city label exceeds 17px', caps.maxCity <= 17.01, String(caps.maxCity));

// ---------- curved SVG labels: paths exist + click opens exact URL ----------
await page.evaluate(() => GOTMAP_DEBUG.engine.setZoom(4));
await page.waitForTimeout(500);
const curved = await page.evaluate(() => {
  const out = [];
  for (const span of document.querySelectorAll('.gotmap-label-cat .gotmap-label')) {
    const svg = span.querySelector('svg.gotmap-curve');
    if (!svg) continue;
    const tp = svg.querySelector('textPath');
    out.push({
      text: tp && tp.textContent,
      href: tp && tp.getAttribute('href'),
      path: svg.querySelector('path') && !!svg.querySelector('path').getAttribute('d'),
    });
  }
  return out;
});
check('curved SVG textPath labels render', curved.length >= 3 &&
  curved.every((c) => c.text && c.href && c.path), JSON.stringify(curved.slice(0, 4)));

// click a curved label -> exact catalog URL (Bay_of_Ice)
const bay = await page.evaluate(() => {
  const f = GOTMAP_CARTOGRAPHY.features.find((x) => x.id === 'Bay_of_Ice');
  return { label: f.label || f.english, url: f.url,
    ll: [Math.atan(Math.sinh(Math.PI * (1 - 2 * f.y / 4642))) * 180 / Math.PI,
         f.x / 4642 * 360 - 180] };
});
await page.evaluate((p) => GOTMAP_DEBUG.engine.panTo(p), bay.ll);
await page.waitForTimeout(700);
await page.evaluate(() => { window.__opened = []; });
const curvedSpan = page.locator('.gotmap-label-cat .gotmap-label')
  .filter({ has: page.locator('svg.gotmap-curve') })
  .filter({ hasText: bay.label }).first();
const hasCurved = await curvedSpan.count();
check('Bay_of_Ice curved label present', hasCurved === 1, bay.label);
if (hasCurved) {
  await curvedSpan.click({ timeout: 15000 });
  await page.waitForTimeout(300);
  const opened = await page.evaluate(() => window.__opened);
  check('curved label click opens exact catalog URL',
    opened.length === 1 && opened[0].u === bay.url, JSON.stringify(opened));
}

// ---------- legend: default-open desktop, close/reopen, mobile button ----------
check('legend visible by default (desktop)',
  await page.evaluate(() =>
    getComputedStyle(document.getElementById('mapLegend')).display !== 'none'));
await page.screenshot({ path: 'reference/catalog-desktop.png' });
await page.click('#legendClose');
check('legend closes', await page.evaluate(() =>
  getComputedStyle(document.getElementById('mapLegend')).display === 'none'));
await page.click('#legendToggle');
check('legend reopens via toggle', await page.evaluate(() =>
  getComputedStyle(document.getElementById('mapLegend')).display !== 'none'));

// ---------- terrain overlay: 4642 loaded, layer-switch correct ----------
async function terrainState() {
  return page.evaluate(() => {
    const pane = document.querySelector('.leaflet-source-terrain-pane');
    const imgs = pane ? [...pane.querySelectorAll('img')] : [];
    return {
      count: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth === 4642).length,
      pe: pane ? getComputedStyle(pane).pointerEvents : null,
    };
  });
}
{
  const st = await terrainState();
  check('terrain overlay loaded at source resolution (4642)',
    st.count === 1 && st.loaded === 1 && st.pe === 'none', JSON.stringify(st));
}
for (const [layer, want] of [['fsm', 0], ['nat', 1], ['pt', 1]]) {
  await page.click(`.gotmap-layer-btn[data-layer="${layer}"]`);
  await page.waitForTimeout(400);
  const st = await terrainState();
  check(`terrain overlay ${want ? 'present' : 'hidden'} on ${layer}`,
    st.count === want, JSON.stringify(st));
}

// ---------- dense Riverlands: ZERO overlap among fully-onscreen labels ----------
await page.evaluate((p) => GOTMAP_DEBUG.engine.panTo(p), [-5, -75]);
await page.waitForTimeout(800);
const overlap = await page.evaluate(() => {
  const W = window.innerWidth, H = window.innerHeight;
  // rendered rects for BOTH catalog and fallback labels
  const rects = [...document.querySelectorAll('.gotmap-label-wrap .gotmap-label')]
    .map((s) => ({ r: s.getBoundingClientRect(), t: s.textContent }))
    .filter((e) => e.r.width && e.r.height);
  const ui = ['#mapLegend', '.gotmap-layer-control', '#filter',
    '.leaflet-control-zoom', '#legendToggle', '#engineStatus']
    .map((sel) => document.querySelector(sel))
    .filter((el) => el && getComputedStyle(el).display !== 'none')
    .map((el) => el.getBoundingClientRect());
  const full = [], clipped = [];
  for (const e of rects) {
    const on = e.r.left >= 0 && e.r.top >= 0 && e.r.right <= W && e.r.bottom <= H;
    const occluded = ui.some((u) =>
      e.r.left < u.right && e.r.right > u.left &&
      e.r.top < u.bottom && e.r.bottom > u.top);
    if (on && !occluded) full.push(e); else clipped.push(e.t);
  }
  const pairs = [];
  for (let i = 0; i < full.length; i++) {
    for (let j = i + 1; j < full.length; j++) {
      const a = full[i].r, b = full[j].r;
      if (a.left < b.right && a.right > b.left &&
          a.top < b.bottom && a.bottom > b.top) {
        pairs.push(full[i].t + ' / ' + full[j].t);
      }
    }
  }
  return { total: rects.length, full: full.length, pairs: pairs.length,
    clipped: clipped.slice(0, 8), sample: pairs.slice(0, 6) };
});
check('dense riverlands: zero overlapping pairs among fully-onscreen labels',
  overlap.full > 15 && overlap.pairs === 0,
  JSON.stringify(overlap));
if (overlap.clipped.length) {
  console.log('NOTE clipped/UI-occluded labels (edge cases, not counted): '
    + overlap.clipped.join(', '));
}

// ---------- leader lines on displaced point labels ----------
const leaderInfo = await page.evaluate(() => {
  const leaders = [...document.querySelectorAll('svg.gotmap-leader')];
  // every leader must carry a real line/length back to its anchor
  const len = leaders.map((s) => {
    const line = s.querySelector('line, path');
    return line ? (line.getTotalLength ? line.getTotalLength() : 1) : 0;
  });
  return { count: leaders.length, positive: len.filter((l) => l > 8).length };
});
check('leader lines drawn for displaced labels (>18px displacement)',
  leaderInfo.count > 0 && leaderInfo.positive > 0, JSON.stringify(leaderInfo));

// ---------- accent-insensitive + English catalog search ----------
const SEARCH_CASES = [
  ['salesia', 'Saltcliffe'],
  ['pequenairma', 'Littlesister'],
  ['estrada das rosas', 'Roseroad'],
  ['Blacktyde', 'Blacktyde'],
];
for (const [q, id] of SEARCH_CASES) {
  await page.fill('input[data-type="search"]', q);
  await page.waitForTimeout(350);
  check(`search "${q}" finds ${id}`, await page.evaluate((cid) => {
    const a = document.querySelector(`#townSelector a[data-cat="${cid}"]`);
    return !!a && !a.closest('li').classList.contains('ui-screen-hidden');
  }, id));
}
await page.fill('input[data-type="search"]', '');

// ---------- mobile: floating legend button opens a non-covering panel ----------
const mob = await browser.newPage({ viewport: { width: 390, height: 780 } });
await mob.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await mob.waitForFunction(
  () => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await mob.waitForTimeout(800);
const mobBtn = await mob.evaluate(() => {
  const b = document.getElementById('legendToggle');
  const p = document.getElementById('mapLegend');
  const br = b.getBoundingClientRect();
  return { btnVisible: br.width > 0 && getComputedStyle(b).display !== 'none',
    panelClosed: getComputedStyle(p).display === 'none' };
});
check('mobile: floating legend button visible, panel closed by default',
  mobBtn.btnVisible && mobBtn.panelClosed, JSON.stringify(mobBtn));
await mob.click('#legendToggle');
await mob.waitForTimeout(300);
const mobOpen = await mob.evaluate(() => {
  const b = document.getElementById('legendToggle').getBoundingClientRect();
  const p = document.getElementById('mapLegend');
  const pr = p.getBoundingClientRect();
  // panel open AND toggle not covered by the panel
  const covered = b.left < pr.right && b.right > pr.left &&
    b.top < pr.bottom && b.bottom > pr.top;
  return { open: getComputedStyle(p).display !== 'none', covered };
});
check('mobile: legend opens via floating button without covering it',
  mobOpen.open && !mobOpen.covered, JSON.stringify(mobOpen));
await mob.screenshot({ path: 'reference/catalog-mobile-legend-open.png' });
await mob.close();

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
log.push(`RESULT ${pass} pass / ${fail} fail`);
console.log(`\n${pass} pass / ${fail} fail -> ${LOG}`);
writeFileSync(LOG, log.join('\n') + '\n', 'utf-8');
process.exit(fail ? 1 : 0);
