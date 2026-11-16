// Playwright smoke test for the pt-BR clone.
// Leaflet (default config) + fake-Google fallback scenarios via route
// interception - no real API key needed.
// Run: node scripts/smoke.mjs [baseUrl]
// Writes: reference/local-smoke.log, reference/local-desktop.png (fresh
// [0,-105] z4 view BEFORE mutations), reference/local-mobile.png,
// reference/local-mobile-menu.png, reference/local-regions.png,
// reference/local-wall.png
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8080/';
const log = [];
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`;
  log.push(line);
  console.log(line);
  if (ok) pass++; else fail++;
}

const browser = await chromium.launch();

async function newPage(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.errors = { console: [], pageerrors: [], failed: [] };
  page.on('console', (m) => { if (m.type() === 'error') page.errors.console.push(m.text()); });
  page.on('pageerror', (e) => page.errors.pageerrors.push(String(e)));
  page.on('requestfailed', (r) => page.errors.failed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  page.on('response', (r) => { if (r.status() >= 400) page.errors.failed.push(r.status() + ' ' + r.url()); });
  return page;
}

async function waitReady(page) {
  await page.waitForFunction(() => window.GOTMAP_DEBUG && window.GOTMAP_DEBUG.engine, null, { timeout: 20000 });
  await page.waitForTimeout(800);
}

// minimal fake google.maps API - enough for createGoogleEngine to construct
// the map and all overlay objects used by initMap.
const FAKE_GOOGLE = `
window.google = { maps: {
  LatLng: function (a, b) { this.lat_ = a; this.lng_ = b; this.lat = () => a; this.lng = () => b; },
  Size: function (w, h) { this.width = w; this.height = h; },
  Point: function (x, y) { this.x = x; this.y = y; },
  MapTypeId: { ROADMAP: 'roadmap' },
  event: {
    addListener: function (o, n, f) { (o._ls = o._ls || {}); (o._ls[n] = o._ls[n] || []).push(f); },
    clearInstanceListeners: function (o) { o._ls = {}; },
    trigger: function (o, n, a) { ((o._ls || {})[n] || []).forEach(function (f) { f(a); }); },
  },
  Map: function (el, opts) {
    this.el = el; this.opts = opts;
    this.mapTypes = { set: (k, v) => { (this._mt = this._mt || {})[k] = v; } };
    this.setMapTypeId = (id) => { this._tid = id; google.maps.event.trigger(this, 'maptypeid_changed'); };
    this.getMapTypeId = () => this._tid;
    this.getCenter = () => this._c || this.opts.center;
    this.getZoom = () => this.opts.zoom;
    this.panTo = (c) => { this._c = c; };
  },
  ImageMapType: function (o) { Object.assign(this, o); },
  GroundOverlay: function (url, bounds, opts) {
    this.url = url; this.bounds = bounds; this.opts = opts;
    this.setMap = (m) => { this._map = m; };
  },
  Marker: function (o) { this._o = o; this._v = !!o.visible;
    this.setVisible = (v) => { this._v = v; }; this.getVisible = () => this._v; },
  Polyline: function (o) { this._o = o; this._v = !!o.visible;
    this.setVisible = (v) => { this._v = v; }; this.getVisible = () => this._v; },
  Polygon: function (o) { this._o = o; this._v = !!o.visible;
    this.setVisible = (v) => { this._v = v; }; this.getVisible = () => this._v; },
  OverlayView: function () { },
  InfoWindow: function (o) { this._o = o; this.open = function () { }; },
} };
window.google.maps.OverlayView.prototype = {
  setMap: function (m) { this.map_ = m; if (m && this.onAdd) this.onAdd(); },
  getPanes: function () { return { overlayImage: document.createElement('div') }; },
  getProjection: function () {
    return {
      fromLatLngToDivPixel: () => ({ x: 0, y: 0 }),
      fromLatLngToContainerPixel: () => ({ x: 0, y: 0 }),
    };
  },
};
setTimeout(function () { window.__gotmapGoogleReady && window.__gotmapGoogleReady(); }, 50);
`;

async function overlapReport(page, sel) {
  return page.evaluate((s) => {
    const rects = [...document.querySelectorAll(s)]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    let n = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) n++;
      }
    }
    return { count: rects.length, overlaps: n };
  }, sel);
}

function hitTest(sel) {
  const e = document.querySelector(sel);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return h ? (h === e || e.contains(h) || h.closest(sel) === e ? 'self' : h.tagName + (h.id ? '#' + h.id : '') + '.' + String(h.className).split(' ')[0]) : 'null';
}

// ---------------- desktop ----------------
const page = await newPage(1440, 900);
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await waitReady(page);

check('leaflet engine initialized', await page.evaluate(() => GOTMAP_DEBUG.engine.kind === 'leaflet'));
check('map centered near [0,-105] z4', await page.evaluate(() => {
  const c = GOTMAP_DEBUG.engine.getCenter();
  return Math.abs(c[0]) < 2 && Math.abs(c[1] + 105) < 3 && GOTMAP_DEBUG.engine.getZoom() === 4;
}), JSON.stringify(await page.evaluate(() => GOTMAP_DEBUG.engine.getCenter())));
check('no page errors', page.errors.pageerrors.length === 0, page.errors.pageerrors.join(' | '));
check('no failed/broken requests', page.errors.failed.length === 0, page.errors.failed.slice(0, 5).join(' | '));
check('no console errors', page.errors.console.length === 0, page.errors.console.slice(0, 5).join(' | '));
check('tile images actually rendered', await page.evaluate(() =>
  [...document.querySelectorAll('.leaflet-tile-loaded')].length > 0
));
check('map startup text removed', await page.evaluate(() =>
  ![...document.querySelector('#map_canvas').childNodes].some((n) => n.nodeType === 3)
));
check('pt town labels visible at z4', await page.evaluate(() => GOTMAP_DEBUG.labelCount() > 0),
  String(await page.evaluate(() => GOTMAP_DEBUG.labelCount())));
check('gold filter panel 200px right5', await page.evaluate(() => {
  const r = document.getElementById('filter').getBoundingClientRect();
  return Math.abs(r.width - 200) < 3 && Math.abs((innerWidth - r.right) - 5) < 3;
}));
// real stacking: elements must actually receive hits, not just exist
check('panel h4 hit-tests itself (not map)', (await page.evaluate(hitTest, '#filter h4')) === 'self',
  String(await page.evaluate(hitTest, '#filter h4')));
check('slider hit-tests inside filter', await page.evaluate(() => {
  const e = document.querySelector('#chapGroup .ui-slider') || document.querySelector('#chapGroup');
  const r = e.getBoundingClientRect();
  const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return !!(h && h.closest('#filter'));
}));
check('catalog labels present and not collision-dropped', await page.evaluate(() => {
  const feats = (window.GOTMAP_CARTOGRAPHY || { features: [] }).features.length;
  const vis = GOTMAP_DEBUG.visibleFeatures ? GOTMAP_DEBUG.visibleFeatures().length : 0;
  // Leaflet removes hidden label icons from the DOM entirely, so the DOM
  // count of catalog labels must equal the engine-visible feature count.
  const dom = document.querySelectorAll('.gotmap-label-cat .gotmap-label').length;
  return vis === dom && (feats === 0 || vis > 0);
}, null), String(await page.evaluate(() =>
  GOTMAP_DEBUG.visibleFeatures ? GOTMAP_DEBUG.visibleFeatures().length : -1)));
check('concise engine status', await page.evaluate(() =>
  document.getElementById('engineStatus').textContent === 'Mapa: Leaflet'
));
// FRESH screenshot at [0,-105] z4 before any mutation (compare to original)
await page.screenshot({ path: 'reference/local-desktop.png' });

// search Porto Real -> popup
await page.fill('input[data-type="search"]', 'Porto Real');
await page.waitForTimeout(400);
await page.click('a[href="#@King%27s_Landing"]');
await page.waitForSelector('.leaflet-popup', { timeout: 5000 });
const popupHtml = await page.evaluate(() => document.querySelector('.leaflet-popup-content')?.innerHTML || '');
check('search Porto Real opens localized popup', popupHtml.includes('Porto Real') && popupHtml.includes("King's Landing"), popupHtml.slice(0, 120));

// select Eddard -> paths appear; slider change updates
await page.evaluate(() => document.querySelector('.leaflet-popup-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.check('#toggle_eddard');
await page.waitForTimeout(300);
const eddardVisible = await page.evaluate(() => GOTMAP_DEBUG.visiblePaths().filter((p) => p.character === 'eddard').length);
check('Eddard path overlays visible at ch0', eddardVisible > 0, String(eddardVisible));
const title0 = await page.textContent('#chapTitle');
await page.evaluate(() => { $('#chapSlider').val(30).slider('refresh').trigger('change'); });
await page.waitForTimeout(300);
const title30 = await page.textContent('#chapTitle');
check('slider change updates chapter title', title0 !== title30 && /Guerra dos Tronos/.test(title30), title30.trim());
const centerAfter = await page.evaluate(() => GOTMAP_DEBUG.engine.getCenter());
check('selecting character panned to marker', Math.abs(centerAfter[1] + 123) < 40, JSON.stringify(centerAfter));

// TWOW sample chapter renders localized (last slider position)
await page.evaluate(() => { $('#chapSlider').val(344).slider('refresh').trigger('change'); });
await page.waitForTimeout(200);
const twTitle = await page.textContent('#chapTitle');
check('TWOW sample chapter shows pt book + amostra',
  /Ventos do Inverno/.test(twTitle) && /amostra/.test(twTitle), twTitle.trim());
await page.evaluate(() => { $('#chapSlider').val(30).slider('refresh').trigger('change'); });

// marker-only hides lines and arrows
await page.click('#pathDisplay');
await page.waitForTimeout(300);
const kinds = await page.evaluate(() => GOTMAP_DEBUG.visiblePaths().map((p) => p.kind));
check('marker-only leaves only markers', kinds.every((k) => k === 'marker'), kinds.join(','));
await page.click('#pathDisplay'); // back to full path
await page.waitForTimeout(200);
const kindsFull = await page.evaluate(() => GOTMAP_DEBUG.visiblePaths().map((p) => p.kind));
check('full path restores lines/arrows', kindsFull.some((k) => k !== 'marker'), kindsFull.join(','));

// books-only runtime: no episode controls or data anywhere
check('no episode controls in DOM', await page.evaluate(() =>
  !document.querySelector('#epSlider, #epGroup, #epTitle, #sliderType, #radio_episodes')));
check('no episodes variable at runtime',
  await page.evaluate(() => typeof window.episodes === 'undefined'));
check('aegon hidden at chapter 0', await page.evaluate(() => $('.aegonListItem').first().css('display') === 'none'));

// arrow clamp: down below 0 and up beyond max both clamp
await page.evaluate(() => { $('#chapSlider').val(0).slider('refresh').trigger('change'); });
await page.click('#slideDown');
await page.waitForTimeout(150);
check('lower arrow clamps at 0', (await page.evaluate(() => $('#chapSlider').val())) === '0');
await page.evaluate(() => { $('#chapSlider').val(344).slider('refresh').trigger('change'); });
await page.click('#slideUp');
await page.waitForTimeout(150);
check('upper arrow clamps at max', (await page.evaluate(() => $('#chapSlider').val())) === '344');
await page.evaluate(() => { $('#chapSlider').val(0).slider('refresh').trigger('change'); });

// select-all respects hidden aegon
await page.click('#allCharacters');
await page.waitForTimeout(400);
const aegonChecked = await page.evaluate(() => $('#toggle_aegon').prop('checked'));
const aegonVisible = await page.evaluate(() => GOTMAP_DEBUG.visiblePaths().some((p) => p.character === 'aegon'));
check('select-all does not leak aegon', !aegonChecked && !aegonVisible);
const nVisible = await page.evaluate(() => GOTMAP_DEBUG.visiblePaths().length);
check('select-all shows many overlays', nVisible >= 25, String(nVisible));
await page.click('#allCharacters'); // hide all
await page.waitForTimeout(400);

// regions polygons
await page.check('#toggle_regions');
await page.waitForTimeout(300);
check('regions: 10 polygons visible', await page.evaluate(() =>
  GOTMAP_DEBUG.regions.filter((r) => r.getVisible()).length === 10
));
await page.screenshot({ path: 'reference/local-regions.png' });
await page.uncheck('#toggle_regions');

// nobility: sigil markers with real images (incl. Night's Watch black flag)
await page.check('#toggle_nobility');
await page.waitForTimeout(600);
const noble = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.leaflet-marker-pane img.leaflet-marker-icon')];
  const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
  return {
    total: imgs.length,
    loaded: loaded.length,
    blackFlag: imgs.some((i) => (i.src || '').includes('black_flag.png')),
    visible: GOTMAP_DEBUG.nobility.filter((n) => n.getVisible()).length,
  };
});
check('nobility overlays visible', noble.visible > 50, JSON.stringify(noble));
check('nobility sigil images loaded', noble.loaded > 0, JSON.stringify(noble));
check('Night\'s Watch uses local black_flag.png', noble.blackFlag);
await page.uncheck('#toggle_nobility');

// about lightbox open/close (keyboard)
await page.click('#infoLink');
check('about opens', await page.isVisible('#lightbox'));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('about closes on Escape', !(await page.isVisible('#lightbox')));

// layer modes
await page.click('.gotmap-layer-btn[data-layer="nat"]');
await page.waitForTimeout(400);
check('Sem nomes hides labels', await page.evaluate(() => GOTMAP_DEBUG.labelCount() === 0));
await page.click('.gotmap-layer-btn[data-layer="fsm"]');
await page.waitForTimeout(400);
const fsmTile = await page.evaluate(() =>
  [...document.querySelectorAll('.leaflet-tile')].some((i) => (i.src || '').includes('/fsm/')));
check('Original (inglês) uses fsm tiles', fsmTile && (await page.evaluate(() => GOTMAP_DEBUG.engine.getBaseLayer())) === 'fsm');
await page.click('.gotmap-layer-btn[data-layer="pt"]');
await page.waitForTimeout(400);
check('pt layer restores labels', await page.evaluate(() => GOTMAP_DEBUG.labelCount() > 0));

check('desktop no page errors (end)', page.errors.pageerrors.length === 0, page.errors.pageerrors.join(' | '));

// ---------------- Wall view (Castle Black) labels + screenshot --------------
const wpage = await newPage(1440, 900);
await wpage.goto(BASE + '#@Castle_Black', { waitUntil: 'load' });
await waitReady(wpage);
await wpage.waitForTimeout(700);
check('wall hash centers near Castle Black', await wpage.evaluate(() => {
  const c = GOTMAP_DEBUG.engine.getCenter();
  return Math.abs(c[0] - 76.7) < 3 && Math.abs(c[1] + 111) < 6;
}), JSON.stringify(await wpage.evaluate(() => GOTMAP_DEBUG.engine.getCenter())));
check('wall labels do not overlap (non-catalog labels)', await (async () => {
  const sel = '.leaflet-marker-pane .gotmap-label-wrap:not(.gotmap-label-cat) .gotmap-label';
  const r = await overlapReport(wpage, sel);
  return r.overlaps === 0;
})(), JSON.stringify(await overlapReport(wpage,
  '.leaflet-marker-pane .gotmap-label-wrap:not(.gotmap-label-cat) .gotmap-label')));
await wpage.screenshot({ path: 'reference/local-wall.png' });
await wpage.close();

// ---------------- hashes ----------------
const hpage = await newPage(1440, 900);
await hpage.goto(BASE + '#@999,999', { waitUntil: 'load' });
await waitReady(hpage);
check('malformed coord hash does not crash', hpage.errors.pageerrors.length === 0);
await hpage.goto(BASE + '#@does-not-exist', { waitUntil: 'load' });
await waitReady(hpage);
check('unknown key hash does not crash', hpage.errors.pageerrors.length === 0);
await hpage.goto(BASE + '#@10.5,-80.3', { waitUntil: 'load' });
await waitReady(hpage);
const hc = await hpage.evaluate(() => GOTMAP_DEBUG.engine.getCenter());
check('coord hash centers map', Math.abs(hc[0] - 10.5) < 2 && Math.abs(hc[1] + 80.3) < 2, JSON.stringify(hc));
await hpage.goto(BASE + "#@King%27s_Landing", { waitUntil: 'load' });
await waitReady(hpage);
check('key hash opens town popup', await hpage.evaluate(() => {
  const h = document.querySelector('.leaflet-popup-content')?.innerHTML || '';
  return h.includes('Porto Real');
}));
await hpage.close();
await page.close();

// ---------------- mobile ----------------
const mpage = await newPage(390, 844);
await mpage.goto(BASE, { waitUntil: 'load' });
await waitReady(mpage);
check('mobile: menu button hit-tests itself', (await mpage.evaluate(hitTest, '#menuButton')) === 'self',
  String(await mpage.evaluate(hitTest, '#menuButton')));
check('mobile: menu icon image painted', await mpage.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('menuButton'));
  return cs.backgroundImage.includes('menu.png');
}));
check('mobile: filter hidden initially', !(await mpage.isVisible('#filter')));
await mpage.screenshot({ path: 'reference/local-mobile.png' });

await mpage.click('#menuButton');
await mpage.waitForTimeout(300);
check('mobile: menu opens filter', await mpage.isVisible('#filter'));
await mpage.screenshot({ path: 'reference/local-mobile-menu.png' });
await mpage.click('#showCharacterPaths');
await mpage.waitForTimeout(300);
check('mobile: character list opens', await mpage.isVisible('#handheldToggles'));
const overflow = await mpage.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
check('mobile: no horizontal overflow', overflow <= 0, 'overflow=' + overflow);

// mobile character labels toggle the REAL underlying checkboxes
await mpage.click('#handheldToggles label[for="toggle_asha"]');
await mpage.waitForTimeout(300);
check('mobile: Asha label checks underlying toggle', await mpage.evaluate(() =>
  document.getElementById('toggle_asha').checked &&
  GOTMAP_DEBUG.visiblePaths().some((p) => p.character === 'asha')
));
await mpage.click('#handheldToggles label[for="toggle_victarion"]');
await mpage.waitForTimeout(200);
check('mobile: Victarion label checks underlying toggle', await mpage.evaluate(() =>
  document.getElementById('toggle_victarion').checked
));
// mobile select-all + marker-only proxies work on the canonical controls
await mpage.click('#hhSelectAll');
await mpage.waitForTimeout(400);
check('mobile: select-all checks visible toggles', await mpage.evaluate(() =>
  document.getElementById('toggle_eddard').checked &&
  !document.getElementById('toggle_aegon').checked
));
await mpage.click('#hhPathDisplay');
await mpage.waitForTimeout(300);
check('mobile: marker-only via proxy', await mpage.evaluate(() =>
  GOTMAP_DEBUG.visiblePaths().every((p) => p.kind === 'marker')
));
await mpage.click('#hhPathDisplay'); // restore full path
await mpage.waitForTimeout(200);

// back to menu, regions/nobility labels toggle real checkboxes
await mpage.click('#closeCharList');
await mpage.waitForTimeout(200);
await mpage.click('#htRegions');
await mpage.waitForTimeout(300);
check('mobile: regions label toggles real checkbox', await mpage.evaluate(() =>
  document.getElementById('toggle_regions').checked &&
  GOTMAP_DEBUG.regions.filter((r) => r.getVisible()).length === 10
));
await mpage.click('#htNobility');
await mpage.waitForTimeout(400);
check('mobile: nobility label toggles real checkbox', await mpage.evaluate(() =>
  document.getElementById('toggle_nobility').checked &&
  GOTMAP_DEBUG.nobility.some((n) => n.getVisible())
));
await mpage.click('#htNobility');
await mpage.waitForTimeout(200);
await mpage.click('#htRegions');
await mpage.waitForTimeout(200);

// mobile about: open from menu, Escape must restore the menu (never blank)
await mpage.click('#aboutThisSite');
await mpage.waitForTimeout(200);
check('mobile: about opens from menu', await mpage.isVisible('#lightbox'));
await mpage.keyboard.press('Escape');
await mpage.waitForTimeout(300);
check('mobile: Escape restores menu view', await mpage.isVisible('#filter'));
// about -> map link returns to map view
await mpage.click('#aboutThisSite');
await mpage.waitForTimeout(200);
await mpage.click('#lightboxLink');
await mpage.waitForTimeout(400);
check('mobile: about link lands on map', await mpage.isVisible('#map_canvas') && !(await mpage.isVisible('#filter')));

// mobile search -> popup on the map
await mpage.click('#menuButton');
await mpage.waitForTimeout(200);
await mpage.fill('input[data-type="search"]', 'Porto Real');
await mpage.waitForTimeout(400);
await mpage.click('a[href="#@King%27s_Landing"]');
await mpage.waitForSelector('.leaflet-popup', { timeout: 5000 });
check('mobile: search popup opens on map', await mpage.isVisible('#map_canvas'));

// breakpoint transitions normalize views + engine resize
await mpage.setViewportSize({ width: 1440, height: 900 });
await mpage.waitForTimeout(500);
check('desktop: panel visible after widen', await mpage.isVisible('#filter'));
await mpage.setViewportSize({ width: 390, height: 844 });
await mpage.waitForTimeout(500);
check('mobile: menu button back after shrink', await mpage.isVisible('#menuButton'));
check('mobile: engine still alive after resizes', await mpage.evaluate(() => GOTMAP_DEBUG.engine.getZoom() >= 1));
check('mobile: no page errors', mpage.errors.pageerrors.length === 0, mpage.errors.pageerrors.join(' | '));
await mpage.close();

// ---------------- fake Google fallback scenarios ----------------
// Scenario A: script loads, engine boots, THEN gm_authFailure fires late
// (the common real-world order) -> exactly one clean Leaflet fallback.
const gpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
gpage.errors = { pageerrors: [] };
gpage.on('pageerror', (e) => gpage.errors.pageerrors.push(String(e)));
await gpage.route('**/config.js', (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: "window.GOTMAP_CONFIG = { googleMapsApiKey: 'FAKE_KEY' };",
}));
await gpage.route('**/maps/api/js*', (route) =>
  route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_GOOGLE }));
await gpage.goto(BASE, { waitUntil: 'load' });
await gpage.waitForFunction(() => window.GOTMAP_DEBUG && GOTMAP_DEBUG.engine.kind === 'google', null, { timeout: 20000 });
check('google: engine booted with fake API', true);
await gpage.evaluate(() => window.gm_authFailure());
await gpage.waitForFunction(() => GOTMAP_DEBUG.engine.kind === 'leaflet', null, { timeout: 10000 });
await gpage.waitForTimeout(800);
check('google: late auth failure -> single Leaflet fallback', true);
check('google: fallback warning visible', await gpage.evaluate(() => {
  const el = document.getElementById('engineStatus');
  return getComputedStyle(el).display !== 'none' && el.textContent.includes('Google Maps indisponível');
}));
// expected entries = 245 raw locations + distinct catalog-only ids
// (catalog merges into search without duplicating raw keys)
const expectedTowns = await gpage.evaluate(() =>
  Object.keys(window.locations).length +
  new Set((window.GOTMAP_CARTOGRAPHY || { features: [] }).features
    .filter((f) => !(f.key && window.locations[f.key]))
    .map((f) => f.id).filter(Boolean)).size);
check('google: no duplicated town list entries', await gpage.evaluate((exp) =>
  document.querySelectorAll('#townSelector li').length === exp, expectedTowns
), String(await gpage.evaluate(() => document.querySelectorAll('#townSelector li').length)) +
  ' expected ' + expectedTowns);
check('google: map works after fallback', await gpage.evaluate(() =>
  GOTMAP_DEBUG.labelCount() > 0 && GOTMAP_DEBUG.engine.getZoom() === 4
));
check('google: second auth failure ignored (no dup)', await gpage.evaluate(async (exp) => {
  window.gm_authFailure();
  await new Promise((r) => setTimeout(r, 300));
  return document.querySelectorAll('#townSelector li').length === exp;
}, expectedTowns));
check('google: no page errors in fallback flow', gpage.errors.pageerrors.length === 0, gpage.errors.pageerrors.join(' | '));
await gpage.close();

// Scenario B: script fails to load -> fallback via onerror
const bpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
bpage.errors = { pageerrors: [] };
bpage.on('pageerror', (e) => bpage.errors.pageerrors.push(String(e)));
await bpage.route('**/config.js', (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: "window.GOTMAP_CONFIG = { googleMapsApiKey: 'FAKE_KEY' };",
}));
await bpage.route('**/maps/api/js*', (route) => route.abort());
await bpage.goto(BASE, { waitUntil: 'load' });
await bpage.waitForFunction(() => window.GOTMAP_DEBUG && GOTMAP_DEBUG.engine.kind === 'leaflet', null, { timeout: 20000 });
check('google: script error -> Leaflet fallback', true);
check('google: error warning visible', await bpage.evaluate(() =>
  document.getElementById('engineStatus').textContent.includes('Google Maps indisponível')
));
check('google: no page errors after script abort', bpage.errors.pageerrors.length === 0);
await bpage.close();

// Scenario C: script request never completes -> 15s timeout -> fallback
const tpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
tpage.errors = { pageerrors: [] };
tpage.on('pageerror', (e) => tpage.errors.pageerrors.push(String(e)));
await tpage.route('**/config.js', (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: "window.GOTMAP_CONFIG = { googleMapsApiKey: 'FAKE_KEY' };",
}));
await tpage.route('**/maps/api/js*', () => new Promise(() => {})); // never resolves
await tpage.goto(BASE, { waitUntil: 'domcontentloaded' });
await tpage.waitForFunction(() => window.GOTMAP_DEBUG && GOTMAP_DEBUG.engine.kind === 'leaflet', null, { timeout: 25000 });
check('google: script timeout -> Leaflet fallback', true);
check('google: timeout warning visible', await tpage.evaluate(() =>
  document.getElementById('engineStatus').textContent.includes('Google Maps indisponível')
));
await tpage.close();

await browser.close();
log.push(`\n${pass} passed, ${fail} failed`);
writeFileSync('reference/local-smoke.log', log.join('\n') + '\n');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
