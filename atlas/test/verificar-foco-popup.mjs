// verificar-foco-popup.mjs — focos do ultimo lote de correcoes:
//  (a) popup de foco sobrevive a troca previa->nativo atualizado para a
//      latlng nativa do marcador (getLatLng === unproject(x,y,maxZ)),
//      permanece unico e nao ressurge apos fechamento do usuario.
//  (b) botoes dependentes de selecao/posicao (limparSel/focusPers)
//      nascem desabilitados apos destravar e reagem ao estado real.
// Roda contra dados reais v2; sem interceptacao de dados.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { pausarTilesAutomaticos, liberarTilesAutomaticos }
  from "./lib-tiles-auto.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080/atlas/";

const results = [];
const pageErrors = [];
function check(nome, ok, info) {
  results.push({ nome, ok: !!ok, info: info || "" });
  console.log((ok ? "PASS " : "FAIL ") + nome + (info ? " — " + info : ""));
}
async function setCapitulo(page, n) {
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, n);
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();

// ---------- (a) popup de foco segue a ancora nativa ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  /* isola a suite no salto v4: continua exercitando o v3 real quando
     o v4 for publicado */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v7.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  page.on("pageerror", (e) => pageErrors.push("[desktop] " + e.message));
  /* popup aberto em previa; nativo liberado no ponto do clique antigo */
  await pausarTilesAutomaticos(page);
  await page.goto(BASE);
  await page.waitForSelector("#loc-lista li", { timeout: 15000, state: "attached" });

  await page.fill("#loc-busca", "CASTELO");
  await page.waitForTimeout(300);
  await page.locator("#loc-lista li:not([hidden]) .loc-item").first().click();
  await page.waitForFunction(() => {
    const p = document.querySelector(".leaflet-popup");
    /* o popup exibe label + english ("Castelo Negro"/"Castle Black"),
       nao mais o originalKey cru "Castle_Black" (refatoracao prev3) */
    return p && p.textContent.includes("Castle Black");
  }, null, { timeout: 12000 });

  // transicao previa->nativo (boot automatico retido ate aqui)
  liberarTilesAutomaticos(page);
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(1200);

  check("nativo: um unico popup apos troca",
    (await page.locator(".leaflet-popup").count()) === 1,
    "pops=" + (await page.locator(".leaflet-popup").count()));

  const anc = await page.evaluate(() => {
    const map = window.__atlasMap;
    let ll = null;
    map.eachLayer((l) => { if (l instanceof L.Popup) ll = l.getLatLng(); });
    const esp = map.unproject([4260, 2370], 6);
    return ll ? { dlat: ll.lat - esp.lat, dlng: ll.lng - esp.lng } : null;
  });
  check("nativo: ancora do popup = unproject([4260,2370],6)",
    !!anc && Math.abs(anc.dlat) < 1e-6 && Math.abs(anc.dlng) < 1e-6,
    anc ? "dlat=" + anc.dlat.toFixed(9) + " dlng=" + anc.dlng.toFixed(9) : "sem popup");

  // fechamento pelo usuario: nao ressurge em refresh de zoom
  await page.locator(".leaflet-popup-close-button")
    .dispatchEvent("click");
  await page.waitForTimeout(400);
  check("popup fechado pelo usuario",
    (await page.locator(".leaflet-popup").count()) === 0);
  await page.evaluate(() => {
    const map = window.__atlasMap;
    map.setZoom(map.getZoom() + 1);
  });
  await page.waitForTimeout(900);
  check("popup nao ressurge apos zoom/refresh",
    (await page.locator(".leaflet-popup").count()) === 0);
  await ctx.close();
}

// ---------- (b) botoes dependentes de estado apos destravar ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  /* isola a suite no salto v4: continua exercitando o v3 real quando
     o v4 for publicado */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v7.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  page.on("pageerror", (e) => pageErrors.push("[botoes] " + e.message));
  await page.goto(BASE);
  await page.waitForSelector("#loc-lista li", { timeout: 15000, state: "attached" });

  check("inicial: limpar selecao desabilitado",
    await page.locator("#btn-limpar-sel").isDisabled());
  check("inicial: focar posicoes desabilitado",
    await page.locator("#btn-focus-pers").isDisabled());

  await page.check("#chk-jon");
  await page.waitForTimeout(300);
  check("jon marcado: limpar selecao habilita",
    !(await page.locator("#btn-limpar-sel").isDisabled()));
  check("jon ch0 com posicao: focar habilita",
    !(await page.locator("#btn-focus-pers").isDisabled()));

  await setCapitulo(page, 1);
  check("jon ch1 sem posicao: focar desabilita",
    await page.locator("#btn-focus-pers").isDisabled());
  check("jon ch1: limpar selecao continua habilitado",
    !(await page.locator("#btn-limpar-sel").isDisabled()));
  await ctx.close();
}

check("sem pageerrors", pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "));

const falhas = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "foco-popup-resultados.txt"),
  results.map((r) => (r.ok ? "PASS " : "FAIL ") + r.nome +
    (r.info ? " — " + r.info : "")).join("\n") + "\n");
console.log("\n" + results.length + " checagens, " + falhas.length + " falhas");
if (pageErrors.length) console.log("PAGEERRORS:\n" + pageErrors.join("\n"));
await browser.close();
process.exit(falhas.length ? 1 : 0);
