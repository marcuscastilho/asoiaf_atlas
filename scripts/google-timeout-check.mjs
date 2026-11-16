// Bounded diagnostic: replicate smoke.mjs scenario C exactly (Google Maps
// script request never resolves -> app must fall back to Leaflet via its
// internal 15s watchdog). 25s wait, same as the suite - no larger retries.
// Output -> reference/google-timeout-check.log
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080/';
const log = [];
const put = (s) => { log.push(s); console.log(s); };
const t0 = Date.now();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageerrors = [], consoleErrs = [];
page.on('pageerror', (e) => pageerrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
await page.route('**/config.js', (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: "window.GOTMAP_CONFIG = { googleMapsApiKey: 'FAKE_KEY' };",
}));
await page.route('**/maps/api/js*', () => new Promise(() => {})); // never resolves

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
put('goto domcontentloaded at ' + (Date.now() - t0) + 'ms');

let fallbackAt = -1;
try {
  await page.waitForFunction(
    () => window.GOTMAP_DEBUG && GOTMAP_DEBUG.engine && GOTMAP_DEBUG.engine.kind === 'leaflet',
    null, { timeout: 25000 });
  fallbackAt = Date.now() - t0;
} catch (e) {
  put('waitForFunction TIMED OUT at 25s');
}
put('leaflet fallback detected at ' + fallbackAt + 'ms');

const snap = await page.evaluate(() => ({
  readyState: document.readyState,
  gotJQuery: typeof window.$ === 'function',
  debugEngineKind: window.GOTMAP_DEBUG && GOTMAP_DEBUG.engine && GOTMAP_DEBUG.engine.kind,
  engineStatus: (document.getElementById('engineStatus') || {}).textContent || '',
  pendingGoogleScript: !!document.querySelector('script[src*="maps.googleapis.com"]'),
  gmAuthFailureAssigned: typeof window.gm_authFailure === 'function',
  googleReadyAssigned: typeof window.__gotmapGoogleReady === 'function',
}));
put('snapshot: ' + JSON.stringify(snap));
put('pageerrors: ' + JSON.stringify(pageerrors));
put('console errors: ' + JSON.stringify(consoleErrs));
put(fallbackAt > 0 ? 'RESULT fallback within 25s (standalone check passed)'
                   : 'RESULT no fallback within 25s (reproduces broad-suite crash)');
await browser.close();
writeFileSync('reference/google-timeout-check.log', log.join('\n') + '\n');
