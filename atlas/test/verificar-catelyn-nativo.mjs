// Verificacao estrita de render nativo: catelyn ch18, 28 vertices.
// Somente leitura tecnica (L.Polyline.getLatLngs vs unproject JSON),
// sem revalidar cartografia nem dados.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(AQUI, "evidencias");
const BASE = "http://127.0.0.1:8080";

const DADOS = JSON.parse(
  readFileSync(join(AQUI, "../data/atlas-inventario-v3.json"), "utf8"));
const cat = DADOS.routes.find((r) => r.id === "catelyn");
const SEG = cat.segments.find(
  (s) => s.startChapter <= 18 && s.endChapter >= 18);
const POS = cat.positions.find(
  (p) => p.startChapter <= 18 && p.endChapter >= 18);
const LOC = DADOS.controlPoints.find((p) => p.id === POS.locationId);
const MAXZ = 6;

const resultados = [];
function check(nome, ok, info) {
  resultados.push((ok ? "PASS" : "FAIL") + " " + nome +
    (info ? " — " + info : ""));
  console.log(resultados[resultados.length - 1]);
}

const browser = await chromium.launch();
const page = await (await browser.newContext({
  viewport: { width: 1366, height: 900 }
})).newPage();
/* isola a suite no salto v4: continua exercitando o v3 real quando
   o v4 for publicado */
await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
  route.fulfill({ status: 404, body: "ausente" }));
/* fixa o salto mais novo: sem este pino a suite carregaria
   o v6 publicado em vez do conjunto pretendido */
await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
  route.fulfill({ status: 404, body: "ausente" }));
await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
  route.fulfill({ status: 404, body: "ausente" }));
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto(BASE + "/atlas/");
await page.waitForSelector("#loc-lista li", { timeout: 20000 });
await page.check("#chk-catelyn");
await page.locator("#cap-slider").evaluate((el) => {
  el.value = "18";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(400);
await page.click("#btn-tiles");
await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
await page.waitForTimeout(1200);

/* ---------- 1: pernas interativas == unproject(pts JSON, 6) ---------- */
/* cada transportLeg vira um par (contorno 8px + linha 4px); as linhas
   interativas (weight 4) carregam os vertices da sua faixa inclusiva */
const LEGS = (Array.isArray(SEG.transportLegs) ? SEG.transportLegs : [])
  .filter((l) => l && l.endVertex - l.startVertex >= 1);
const pernasEsperadas = LEGS.length
  ? LEGS.map((l) => [l.startVertex, l.endVertex])
  : [[0, SEG.points.length - 1]];

const diffs = await page.evaluate(([pts, pernas]) => {
  const map = window.__atlasMap;
  const linhas = [];
  map.eachLayer((l) => {
    if (l instanceof L.Polyline && !(l instanceof L.Polygon) &&
        l.options.interactive) {
      linhas.push(l.getLatLngs());
    }
  });
  if (linhas.length !== pernas.length) {
    return { erro: "pernas " + linhas.length + " != " + pernas.length };
  }
  let maxD = 0;
  for (let k = 0; k < pernas.length; k++) {
    const [a, b] = pernas[k];
    const esp = pts.slice(a, b + 1);
    const ll = linhas[k];
    if (ll.length !== esp.length) {
      return { erro: "perna " + k + ": " + ll.length +
        " != " + esp.length };
    }
    esp.forEach(([x, y], i) => {
      const e = map.unproject([x, y], 6);
      maxD = Math.max(maxD,
        Math.abs(ll[i].lat - e.lat), Math.abs(ll[i].lng - e.lng));
    });
  }
  return { pernas: linhas.length, maxDelta: maxD };
}, [SEG.points, pernasEsperadas]);
check("nativo: " + pernasEsperadas.length +
  " perna(s) == unproject(JSON,6) vertice a vertice",
  !diffs.erro && diffs.maxDelta === 0,
  JSON.stringify(diffs));

/* ---------- 2: marcador de posicao == unproject(King's Landing) ---------- */
const marcador = await page.evaluate(([x, y]) => {
  const map = window.__atlasMap;
  let alvo = null;
  map.eachLayer((l) => {
    if (l instanceof L.Marker && l.getElement &&
        l.getElement() && l.getElement().querySelector(".loc-pin")) {
      alvo = l;
    }
  });
  if (!alvo) return { erro: "sem marcador" };
  const esp = map.unproject([x, y], 6);
  const ll = alvo.getLatLng();
  return {
    cls: alvo.getElement().querySelector(".loc-pin").className,
    dlat: Math.abs(ll.lat - esp.lat),
    dlng: Math.abs(ll.lng - esp.lng)
  };
}, [LOC.x, LOC.y]);
check("nativo: marcador " + LOC.id + " == unproject(4350,7400)",
  !marcador.erro && marcador.dlat === 0 && marcador.dlng === 0,
  JSON.stringify(marcador));

/* ---------- 3: SVG renderizavel, visivel, no overlay-pane ---------- */
const svg = await page.evaluate(() => {
  const path = document.querySelector(".leaflet-overlay-pane path");
  if (!path) return { erro: "sem path no overlay-pane" };
  const cs = getComputedStyle(path);
  const pane = path.closest(".leaflet-pane");
  const tilePane = document.querySelector(".leaflet-tile-pane");
  return {
    d: (path.getAttribute("d") || "").length,
    fill: cs.fill, stroke: cs.stroke,
    strokeWidth: cs.strokeWidth, opacity: cs.opacity,
    display: cs.display, visibility: cs.visibility,
    pane: pane && pane.className,
    paneZ: pane && getComputedStyle(pane).zIndex,
    tileZ: tilePane && getComputedStyle(tilePane).zIndex,
    dash: cs.strokeDasharray
  };
});
check("svg: path nao-vazio no overlay-pane acima dos tiles",
  !svg.erro && svg.d > 20 && svg.display !== "none" &&
    svg.visibility !== "hidden" && parseFloat(svg.opacity) > 0 &&
    parseFloat(svg.strokeWidth) > 0 &&
    /overlay/.test(svg.pane || "") &&
    parseFloat(svg.paneZ) > parseFloat(svg.tileZ),
  JSON.stringify(svg));

/* ---------- 4: screenshot focado na geometria (Baia da Agua Negra) ---------- */
await page.evaluate(() => {
  const map = window.__atlasMap;
  let alvo = null;
  map.eachLayer((l) => {
    if (l instanceof L.Polyline && !(l instanceof L.Polygon)) alvo = l;
  });
  map.closePopup();
  map.fitBounds(alvo.getBounds().pad(0.35), { animate: false });
});
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, "v3-catelyn-nativo.png") });

check("sem pageerrors", errs.length === 0, errs.join(" | ") || "ok");

await browser.close();
const falhas = resultados.filter((r) => r.startsWith("FAIL"));
console.log("\n" + resultados.length + " checagens, " + falhas.length + " falhas");
process.exit(falhas.length ? 1 : 0);
