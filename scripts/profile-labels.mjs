// Local diagnostic, not a benchmark gate. Measures the same camera views
// before/after presentation changes; timings cover placement, not total FPS.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/profile-labels.mjs <output.json>');
const scenarios = [
  { name: 'world-z2', zoom: 2, center: [0, 0] },
  { name: 'westeros-z3', zoom: 3, center: [30, -100] },
  { name: 'riverlands-z4', zoom: 4, center: [-5, -75] },
];
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.GOTMAP_DEBUG?.engine, null, { timeout: 20000 });
  await page.evaluate(() => {
    const original = GOTMAP_LABELS.placeLabels;
    const probe = window.__labelProbe = { runs: [], original };
    function measured(...args) {
      const start = performance.now();
      const value = original(...args);
      probe.runs.push({ ms: performance.now() - start, items: args[0].length });
      measured.lastBoosted = original.lastBoosted;
      measured.lastRounds = original.lastRounds;
      return value;
    }
    GOTMAP_LABELS.placeLabels = measured;
  });
  for (const scenario of scenarios) {
    await page.evaluate(() => { window.__labelProbe.runs = []; });
    await page.evaluate(({ zoom, center }) => {
      GOTMAP_DEBUG.engine.setZoom(zoom);
      GOTMAP_DEBUG.engine.panTo(center);
    }, scenario);
    await page.waitForTimeout(600);
    await page.evaluate((center) => GOTMAP_DEBUG.engine.panTo(center), scenario.center);
    await page.waitForTimeout(900);
    const gestureRuns = await page.evaluate(() => window.__labelProbe.runs.slice());
    // Sample settled projection explicitly: the old synchronous listeners
    // can leave lastLayout describing an intermediate zoom/pan frame.
    await page.evaluate(() => {
      const engine = GOTMAP_DEBUG.engine;
      if (engine.kind === 'leaflet') engine.map.fire('moveend');
    });
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const state = GOTMAP_DEBUG.lastLayout();
      const probe = window.__labelProbe;
      const runs = probe.runs.slice();
      const input = JSON.parse(JSON.stringify({
        items: state.items, viewport: state.viewport, obstacles: state.obstacles,
      }));
      probe.original(input.items, input.viewport, input.obstacles);
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        probe.original(input.items, input.viewport, input.obstacles);
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      return {
        actualCenter: GOTMAP_DEBUG.engine.getCenter(),
        actualZoom: GOTMAP_DEBUG.engine.getZoom(),
        layoutZoom: state.zoom,
        placementCalls: runs,
        placementTotalMs: runs.reduce((sum, run) => sum + run.ms, 0),
        placementMedianMs: samples[1],
        placementSamplesMs: samples,
        layoutItems: input.items.length,
        visibleCatalog: GOTMAP_DEBUG.visibleFeatures().length,
        visibleFallback: GOTMAP_DEBUG.labelCount(),
        allCatalogInstances: GOTMAP_CARTOGRAPHY.features.length,
        allRawLocations: Object.keys(window.locations).length,
        searchEntries: document.querySelectorAll('#townSelector li').length,
        terrain: [...document.querySelectorAll('.leaflet-source-terrain-pane img')]
          .map((image) => ({ width: image.naturalWidth, height: image.naturalHeight })),
        layoutInput: input,
      };
    });
    result.gesturePlacementCalls = gestureRuns;
    results.push({ ...scenario, ...result });
    console.log(JSON.stringify({
      name: scenario.name, layoutItems: result.layoutItems,
      visibleCatalog: result.visibleCatalog, placementCalls: result.placementCalls.length,
      placementTotalMs: result.placementTotalMs, placementMedianMs: result.placementMedianMs,
    }));
  }
} finally {
  await browser.close();
}
writeFileSync(output, JSON.stringify({
  capturedAt: new Date().toISOString(),
  viewport: { width: 1440, height: 900 },
  note: 'Placement-only local timings, 1 warmup + 3 samples per captured view; no FPS claim.',
  scenarios: results,
}, null, 2) + '\n');
