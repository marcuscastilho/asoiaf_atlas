// Targeted Playwright check: resolved town names (online + local-book
// evidence) and their search aliases resolve to the right raw data keys
// and localized popups.
// Run: node scripts/translation-smoke.mjs [baseUrl] [logPath]
// Writes: reference/translation-smoke.log (or logPath),
//         reference/translation-popup.png, reference/book-popup.png
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8080/';
const LOG = process.argv[3] || 'reference/translation-smoke.log';
const log = [];
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`;
  log.push(line);
  console.log(line);
  if (ok) pass++; else fail++;
}

// [query, rawKey, expected text in popup]
const CASES = [
  ['archotes', 'Torches', 'Archotes'],
  ['monte oco', 'Hollow_Hill', 'Monte Oco'],
  ['casasolar', 'Sunflower_Hall', 'Solar de Girassol'],
  ['torre dos prantos', 'Weeping_Tower', 'Torre dos Prantos'],
  ['Wyl', 'Wyl_(Dorne)', 'Wyl'],
  ['Donella Manderly', 'Donella_Manderly', 'Donella Manderly'],
  ['Torches', 'Torches', 'Archotes'],           // English key still finds it
  ['Sunhouse', 'Sunflower_Hall', 'Solar de Girassol'], // English alias
  ['Casassolar', 'Sunflower_Hall', 'Solar de Girassol'], // alternate pt spelling
  ['Donella Hornwood', 'Donella_Manderly', 'Donella Manderly'], // married name
  // local-book decisions (docs/local-book-reference.json): preferred forms
  ['poleiro do grifo', 'Griffin%27s_Roost', 'Poleiro do Grifo'],
  ['toca funda', 'Deep_Den', 'Toca Funda'],
  ['despenhadeiro', 'The_Crag', 'Despenhadeiro'],
  ['tombastela', 'Starfall', 'Tombastela'],
  ['ponta afiada', 'Sharp_Point', 'Ponta Afiada'],
  ['solar de bolotas', 'Acorn_Hall', 'Solar de Bolotas'],
  ['nocticantiga', 'Nightsong', 'Nocticantiga'],
  // old labels kept as aliases -> same key, new preferred in popup
  ['ninho do grifo', 'Griffin%27s_Roost', 'Poleiro do Grifo'],
  ['penhasco', 'The_Crag', 'Despenhadeiro'],
  ['queda da estrela', 'Starfall', 'Tombastela'],
  ['solar de bolota', 'Acorn_Hall', 'Solar de Bolotas'],
  ['canto noturno', 'Nightsong', 'Nocticantiga'],
  // preferred form is the direct LeYa evidence; online label kept as alias
  ['solar de girassol', 'Sunflower_Hall', 'Solar de Girassol'],
  ['ilha silenciosa', 'Quiet_Isle', 'Ilha Quieta'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
await page.waitForTimeout(800);

check('leaflet engine initialized', await page.evaluate(() => GOTMAP_DEBUG.engine.kind === 'leaflet'));

for (const [query, key, expect] of CASES) {
  await page.fill('input[data-type="search"]', query);
  await page.waitForTimeout(350);
  const linkSel = `a[href="#@${key}"]`;
  const found = await page.evaluate((sel) => {
    const a = document.querySelector(sel);
    return a ? !a.closest('li').classList.contains('ui-screen-hidden') : false;
  }, linkSel);
  check(`search "${query}" offers ${key}`, found);
  if (!found) continue;
  await page.click(linkSel);
  // wait for THIS popup's content (previous popup may still be open)
  await page.waitForFunction((txt) => {
    const el = document.querySelector('.leaflet-popup-content');
    return el && el.innerHTML.includes(txt);
  }, expect, { timeout: 5000 });
  const html = await page.evaluate(() =>
    document.querySelector('.leaflet-popup-content')?.innerHTML || '');
  check(`popup for ${key} shows "${expect}"`, html.includes(expect), html.slice(0, 90));
  await page.evaluate(() =>
    document.querySelector('.leaflet-popup-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(150);
  if (query === 'casasolar') await page.screenshot({ path: 'reference/translation-popup.png' });
  if (query === 'tombastela') await page.screenshot({ path: 'reference/book-popup.png' });
}

// raw keys/coords untouched by the localization
check('raw data keys unchanged', await page.evaluate(() =>
  ['Torches', 'Hollow_Hill', 'Sunflower_Hall', 'Weeping_Tower', 'Wyl_(Dorne)', 'Donella_Manderly']
    .every((k) => Object.prototype.hasOwnProperty.call(locations, k))
));
check('no page/console errors', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();
log.push(`\n${pass} passed, ${fail} failed`);
writeFileSync(LOG, log.join('\n') + '\n');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
