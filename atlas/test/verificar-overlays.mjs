// Verificacao focada das localidades + trajeto piloto em /atlas/.
// Usa fixture sintetico minimo interceptando data/piloto-norte.json
// (tileSetId/sourceSha256 reais do manifesto recorte-v1 para passar na
// validacao). Uso: node atlas/test/verificar-overlays.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "evidencias");
mkdirSync(OUT, { recursive: true });

const SHA_REAL =
  "deafeff759278a8fbf1fcdcced58c5b7cf18e21fb3edec26b968bd96b6076e3d";

// Fixture SINTETICO — apenas geometria minima para exercitar o renderer;
// nao representa cronologia ou geografia reais do livro.
function fixture(sha) {
  const chapters = [];
  for (let i = 0; i <= 72; i++) {
    chapters.push({ index: i, title: "Capítulo " + i });
  }
  return {
    schemaVersion: 1,
    mapId: "o-mundo-conhecido",
    tileSetId: "o-mundo-conhecido-recorte-v1",
    sourceSha256: sha,
    coordinateSystem: "cropped-native-pixels",
    mapWidth: 21654,
    mapHeight: 14428,
    cropBoxOriented: [0, 2336, 21654, 16764],
    controlPoints: [
      {
        id: "castelo-negro", originalKey: "Castle_Black",
        label: "Castelo Negro", english: "Castle Black",
        x: 16000, y: 1200, status: "manual-review",
        sourceLatLng: [0, 0],
        evidence: [
          { kind: "livro", label: "Mapa oficial", locator: "p. 12" }
        ],
        note: ""
      },
      {
        id: "winterfell", originalKey: "Winterfell",
        label: "Winterfell", english: "Winterfell",
        x: 15000, y: 4000, status: "manual-review",
        sourceLatLng: [0, 0], evidence: [], note: ""
      },
      {
        id: "torre-ambar", originalKey: "Amber_Tower",
        label: "Torre Âmbar", english: "Amber Tower",
        x: 12000, y: 8000, status: "manual-review",
        sourceLatLng: [0, 0], evidence: [], note: ""
      }
    ],
    chapters,
    route: {
      id: "jon-agot-north",
      character: "Jon Snow",
      book: "A Guerra dos Tronos",
      status: "approximate",
      notice: "Trajeto aproximado transferido; em revisão.",
      segments: [
        {
          id: "s1", sourceRecordIndex: 1,
          startChapter: 18, endChapter: 30,
          points: [[15000, 4000], [16000, 1200]],
          status: "approximate"
        }
      ],
      positions: [
        {
          id: "p-a", sourceRecordIndex: 2,
          startChapter: 18, endChapter: 19, locationId: "winterfell"
        },
        {
          id: "p-b", sourceRecordIndex: 3,
          startChapter: 20, endChapter: 72, locationId: "castelo-negro"
        }
      ],
      omittedSourceRecordIndices: [4, 5],
      evidence: []
    },
    calibration: { method: "manual", notice: "", controlPointResiduals: [] }
  };
}

const results = [];
const consoleLog = [];
const requests = [];
const tileResponses = [];
const failedReqs = [];

function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : ""));
  return ok;
}

async function setCapitulo(page, n) {
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, n);
  await page.waitForTimeout(350);
}

const browser = await chromium.launch();

async function ligarColetores(page, tag) {
  /* fixture de retaguarda: inventario v3 deve estar ausente para a
     cadeia cair no v2 interceptado */
  await page.route("**/atlas/data/atlas-inventario-v3.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" })
  );
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    if (!f || !/aborted/i.test(f.errorText)) {
      failedReqs.push(tag + " " + r.url() + " " + (f ? f.errorText : "?"));
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/tiles/")) {
      tileResponses.push(tag + " " + resp.status() + " " + resp.url());
    }
  });
  page.on("pageerror", (e) => consoleLog.push("[pageerror " + tag + "] " + e.message));
}

// ---------- fluxo principal: desktop + fixture ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  /* isola a suite no salto v4: continua exercitando o caminho v2 do
     fixture quando o v4 for publicado */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await ligarColetores(page, "desktop");
  await page.route("**/atlas/data/atlas-agot-v2.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fixture(SHA_REAL))
    })
  );
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });

  check("lista tem 3 localidades",
    (await page.locator("#loc-lista li").count()) === 3);
  /* a vista inicial preenche o quadro (cover): o culling desenha
     apenas os pinos dentro da vista; afastar redesenha todos */
  const pinsIni = await page.locator(".loc-pin").count();
  check("marcadores de localidade na vista inicial (culling)",
    pinsIni >= 1 && pinsIni <= 3, "pinos=" + pinsIni);
  await page.evaluate(() =>
    window.__atlasMap.zoomOut(2, { animate: false }));
  await page.waitForTimeout(600);
  check("3 marcadores de localidade apos afastar",
    (await page.locator(".loc-pin").count()) === 3);
  check("checkbox Jon desmarcado por padrao",
    !(await page.locator("#chk-jon").isChecked()));
  check("sem path de trajeto inicial",
    (await page.locator(".leaflet-overlay-pane path").count()) === 0);

  // liga personagem: ch0 ainda sem segmento (range 18-30)
  await page.check("#chk-jon");
  await page.waitForTimeout(300);
  check("ch0 nao ativa linha",
    (await page.locator(".leaflet-overlay-pane path").count()) === 0);

  await setCapitulo(page, 17);
  check("ch17 ainda sem linha",
    (await page.locator(".leaflet-overlay-pane path").count()) === 0);
  await setCapitulo(page, 18);
  check("ch18 ativa linha do segmento",
    (await page.locator(".leaflet-overlay-pane path").count()) >= 1);
  check("ch18 mostra marcador de posicao (winterfell)",
    (await page.locator(".loc-pin-jon").count()) === 1);
  const titulo18 = await page.locator("#cap-titulo").textContent();
  check("titulo do capitulo exibido", /18/.test(titulo18), titulo18.trim());
  const aria18 = await page.locator("#cap-slider").getAttribute("aria-valuetext");
  check("slider aria-valuetext = titulo", aria18 === titulo18, aria18);

  // foco por item da lista deve dar zoom sensivel (nao apenas pan):
  // baseline baixa via controle real de zoom do mapa
  await page.click(".leaflet-control-zoom-out");
  await page.click(".leaflet-control-zoom-out");
  await page.waitForTimeout(900);
  const zoomMundo = await page.evaluate(() => window.__atlasMap.getZoom());
  await page.locator(".loc-item").first().click();
  await page.waitForTimeout(1400);
  const zoomFoco = await page.evaluate(() => window.__atlasMap.getZoom());
  check("foco da busca aumenta o zoom", zoomFoco > zoomMundo + 1,
    zoomMundo.toFixed(2) + " -> " + zoomFoco.toFixed(2));

  await setCapitulo(page, 19);
  check("ch19 mantem linha e posicao",
    (await page.locator(".leaflet-overlay-pane path").count()) >= 1 &&
      (await page.locator(".loc-pin-jon").count()) === 1);

  // somente posicao atual: esconde linha, mantem marcador
  await page.check("#cap-somente");
  await page.waitForTimeout(350);
  check("markerOnly esconde linha",
    (await page.locator(".leaflet-overlay-pane path").count()) === 0);
  check("markerOnly mantem marcador de posicao",
    (await page.locator(".loc-pin-jon").count()) === 1);
  await page.uncheck("#cap-somente");

  // capitulo sem posicao de referencia
  await setCapitulo(page, 1);
  check("ch1 sem marcador de posicao",
    (await page.locator(".loc-pin-jon").count()) === 0);
  const nota1 = await page.locator("#cap-nota").textContent();
  check("nota de omitidos/sem referencia",
    /sem refer.ncia|omitidos/i.test(nota1), nota1.trim());

  // busca com acento e caixa
  await page.fill("#loc-busca", "ambar");
  const visAmbar = await page.locator("#loc-lista li:not([hidden])").count();
  check("busca 'ambar' encontra 'Torre Âmbar'", visAmbar === 1);
  await page.fill("#loc-busca", "CASTELO");
  const visCastelo = await page.locator("#loc-lista li:not([hidden])").count();
  check("busca 'CASTELO' encontra 'Castelo Negro'", visCastelo === 1);
  await page.fill("#loc-busca", "");

  // popup do marcador: conteudo via textContent
  await setCapitulo(page, 0);
  await page.locator(".loc-pin").first().click({ force: true });
  await page.waitForSelector(".leaflet-popup", { timeout: 8000 });
  await page.waitForTimeout(1600);
  check("um unico popup apos clique no pino",
    (await page.locator(".leaflet-popup").count()) === 1,
    "pops=" + (await page.locator(".leaflet-popup").count()));
  const popupTxt = await page.locator(".leaflet-popup").first().textContent();
  check("popup com status de revisao",
    /revis/i.test(popupTxt) && /Castelo Negro|Winterfell|Torre/.test(popupTxt),
    popupTxt.trim().slice(0, 80));
  await page.keyboard.press("Escape");

  // previa -> nativo preserva estado e marcador
  await page.check("#chk-jon");
  await setCapitulo(page, 18);
  check("pre-switch: linha + posicao na previa",
    (await page.locator(".leaflet-overlay-pane path").count()) >= 1 &&
      (await page.locator(".loc-pin-jon").count()) === 1);

  await page.click("#btn-tiles");
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(600);
  check("pos-switch: estado preservado (jon + cap18)",
    (await page.locator("#chk-jon").isChecked()) &&
      (await page.locator("#cap-slider").inputValue()) === "18");
  check("pos-switch: linha + posicao redesenhadas",
    (await page.locator(".leaflet-overlay-pane path").count()) >= 1 &&
      (await page.locator(".loc-pin-jon").count()) === 1);
  const pinsNat = await page.locator(".loc-pin").count();
  check("pos-switch: marcadores de localidade mantidos",
    pinsNat >= 1 && pinsNat <= 3, "pinos=" + pinsNat);
  await page.evaluate(() =>
    window.__atlasMap.zoomOut(2, { animate: false }));
  await page.waitForTimeout(900);
  /* .loc-pin tambem cobre o pino de posicao (jon em ch18): conta so
     os de localidade, excluindo .loc-pin-jon/.loc-pin-personagem */
  check("pos-switch: culling redesenha todos os pinos ao afastar",
    (await page.locator(
      ".loc-pin:not(.loc-pin-jon):not(.loc-pin-personagem)").count())
      === 3,
    "loc-pin=" + (await page.locator(".loc-pin").count()));

  // posicao do marcador corresponde a unproject do ponto calibrado
  const desvio = await page.evaluate(() => {
    const map = window.__atlasMap;
    const pt = map.unproject([15000, 4000], map.getMaxZoom()); // winterfell
    const c = map.latLngToContainerPoint(pt);
    const el = document
      .querySelector(".loc-pin-jon")
      .closest(".leaflet-marker-icon");
    const r = el.getBoundingClientRect();
    const mb = map.getContainer().getBoundingClientRect();
    return {
      dx: Math.abs(r.left + r.width / 2 - mb.left - c.x),
      dy: Math.abs(r.top + r.height / 2 - mb.top - c.y)
    };
  });
  check("marcador nativo na posicao calibrada",
    desvio.dx < 4 && desvio.dy < 4,
    "dx=" + desvio.dx.toFixed(1) + " dy=" + desvio.dy.toFixed(1));

  await page.screenshot({ path: join(OUT, "overlays-desktop.png"), fullPage: true });
  await ctx.close();
}

// ---------- manifesto/dados divergentes ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  /* isola a suite no salto v4: continua exercitando o caminho v2 do
     fixture quando o v4 for publicado */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await ligarColetores(page, "divergente");
  await page.route("**/atlas/data/atlas-agot-v2.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fixture("f".repeat(64)))
    })
  );
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForTimeout(1200);
  check("divergencia: nenhum marcador",
    (await page.locator(".loc-pin").count()) === 0);
  const stDiv = await page.locator("#localidades-status").textContent();
  check("divergencia: erro visivel no painel",
    /indispon|divergent/i.test(stDiv), stDiv.trim().slice(0, 90));
  check("divergencia: controles desabilitados",
    await page.locator("#cap-slider").isDisabled());
  check("divergencia: mapa segue navegavel",
    (await page.locator("img.leaflet-image-layer").count()) === 1);
  await ctx.close();
}

// ---------- dados ausentes (404) ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  /* isola a suite no salto v4: continua exercitando o caminho v2 do
     fixture quando o v4 for publicado */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await ligarColetores(page, "sem-dados");
  await page.route("**/atlas/data/atlas-agot-v2.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" })
  );
  /* v2 falha -> fallback v1 tambem precisa falhar neste cenario */
  await page.route("**/atlas/data/piloto-norte.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" })
  );
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForTimeout(1200);
  const st404 = await page.locator("#localidades-status").textContent();
  check("sem dados: erro visivel", /indispon/i.test(st404), st404.trim().slice(0, 90));
  check("sem dados: overlay continua", (await page.locator("img.leaflet-image-layer").count()) === 1);
  await ctx.close();
}

// ---------- mobile ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  /* isola a suite no salto v4: continua exercitando o caminho v2 do
     fixture quando o v4 for publicado */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await ligarColetores(page, "mobile");
  await page.route("**/atlas/data/atlas-agot-v2.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fixture(SHA_REAL))
    })
  );
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForSelector("#loc-lista li",
    { timeout: 15000, state: "attached" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check("mobile sem overflow horizontal", overflow <= 1, "overflow=" + overflow);
  check("mobile: marcadores visiveis",
    (await page.locator(".loc-pin").count()) === 3);
  await page.screenshot({ path: join(OUT, "overlays-mobile.png"), fullPage: true });
  await ctx.close();
}

// ---------- revalidacao no switch nativo (manifesto diverge depois) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  /* isola a suite no salto v4: continua exercitando o caminho v2 do
     fixture quando o v4 for publicado */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await ligarColetores(page, "revalida");
  await page.route("**/atlas/data/atlas-agot-v2.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fixture(SHA_REAL))
    })
  );
  /* primeiro fetch do manifesto (init) passa real; segundo (botao
     tiles) chega adulterado com outro mapId — dados devem invalidar */
  let manifestoReal = null;
  let chamadasMapa = 0;
  await page.route("**/atlas/data/mapa.json", async (route) => {
    chamadasMapa++;
    if (chamadasMapa === 1) {
      const resp = await route.fetch();
      manifestoReal = await resp.json();
      return route.fulfill({ response: resp });
    }
    const falso = Object.assign({}, manifestoReal, { id: "outro-mapa" });
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(falso)
    });
  });
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForSelector(".loc-pin", { timeout: 15000 });
  const pinsRev = await page.locator(".loc-pin").count();
  check("revalida: marcadores validos na previa",
    pinsRev >= 1 && pinsRev <= 3, "pinos=" + pinsRev);
  await page.evaluate(() =>
    window.__atlasMap.zoomOut(2, { animate: false }));
  await page.waitForTimeout(600);
  check("revalida: todos os pinos ao afastar",
    (await page.locator(".loc-pin").count()) === 3);
  await page.click("#btn-tiles");
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(800);
  check("revalida: camadas removidas com manifesto divergente",
    (await page.locator(".loc-pin").count()) === 0);
  const stReval = await page.locator("#localidades-status").textContent();
  check("revalida: erro de divergencia visivel",
    /divergent|indispon/i.test(stReval), stReval.trim().slice(0, 90));
  check("revalida: controles travados",
    await page.locator("#cap-slider").isDisabled());
  await ctx.close();
}

await browser.close();

// ---------- asserts de rede ----------
const externos = requests.filter((u) => !u.startsWith(BASE));
check("nenhuma requisicao externa", externos.length === 0,
  externos.join(", ") || "todas locais");
const mestres = requests.filter((u) => /\/mapas\/(jpeg|png|webp\/reduzidos)\//.test(u));
check("nenhum fetch de imagem mestre", mestres.length === 0,
  mestres.join(", ") || "ok");
const tilesRuins = tileResponses.filter((l) => !/ 200 /.test(l));
check("todas respostas de tile HTTP 200", tilesRuins.length === 0,
  tilesRuins.join(" | ") || "ok");
check("nenhuma requisicao falha", failedReqs.length === 0,
  failedReqs.join(" | ") || "ok");
const erros = consoleLog.filter((l) => l.startsWith("[pageerror"));
check("sem pageerrors", erros.length === 0, erros.join(" | ") || "ok");

writeFileSync(join(OUT, "overlays-requisicoes.txt"), requests.join("\n") + "\n");
writeFileSync(join(OUT, "overlays-resultados.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
