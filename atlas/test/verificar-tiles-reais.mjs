// Verificacao narrow do fluxo NATIVO REAL em /atlas/ — manifesto e tiles
// gerados pela build real. Uso: node atlas/test/verificar-tiles-reais.mjs
// (servidor http-server na raiz, porta 8080)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "evidencias");
mkdirSync(OUT, { recursive: true });

const results = [];
const consoleLog = [];
const requests = [];
const tileResponses = [];
const failedReqs = [];

function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : ""));
  return ok;
}

const browser = await chromium.launch();

async function fluxoNativo(tag, ctxOpts, shot, panProgramatico) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    /* abortos do proprio Leaflet ao trocar de zoom/pan nao sao falha */
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

  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });

  const tilesAntes = tileResponses.length;
  /* carga automatica no boot — sem acao do usuario */
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  check(tag + " tiles nativos carregados",
    (await page.locator("img.leaflet-tile-loaded").count()) > 0);
  const apoio = await page.evaluate(() => {
    const img = document.querySelector("img.leaflet-image-layer");
    let tileZ = null;
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.TileLayer && tileZ === null) {
        tileZ = l.getContainer().style.zIndex;
      }
    });
    return img ? {
      paneTile: !!img.closest(".leaflet-tile-pane"),
      z: img.style.zIndex,
      tileZ: tileZ
    } : null;
  });
  check(tag + " previa mantida como apoio sob os tiles",
    !!apoio && apoio.paneTile && apoio.z === "0" && apoio.tileZ === "1",
    apoio ? JSON.stringify(apoio) : "sem image-layer");
  const badge = await page.locator("#badge-estado").textContent();
  check(tag + " badge indica nativa", /nativa/i.test(badge), badge.trim());

  // zoom ate o nivel nativo maximo
  for (let i = 0; i < 18; i++) {
    const desabilitado = await page.evaluate(() =>
      document
        .querySelector(".leaflet-control-zoom-in")
        .classList.contains("leaflet-disabled")
    );
    if (desabilitado) break;
    await page.click(".leaflet-control-zoom-in", { force: true });
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  const reqZ6 = requests.filter((u) => u.includes("/tiles/") && u.includes("/6/"));
  check(tag + " tiles requisitados em /6/ (nativo maximo)", reqZ6.length > 0,
    reqZ6.length + " requisicoes z6");

  // pan; espera novos tiles serem requisitados (contagem de requests —
  // o Leaflet poda/recicla <img>, entao o numero de imagens nao cresce)
  const reqTilesAntes = requests.filter((u) => u.includes("/atlas/tiles/")).length;
  if (panProgramatico) {
    /* pan direto no mapa: marcadores interativos podem capturar o foco do
       clique e a emulacao touch engole eventos de mouse; panBy cobre o
       mesmo cenario (deslocar a vista => novos tiles) de forma deterministica */
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.__atlasMap.panBy([-320, -220]));
      await page.waitForTimeout(400);
    }
  } else {
    const box = await page.locator("#mapa").boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 200, cy - 140, { steps: 12 });
    await page.mouse.up();
  }
  let reqTilesDepois = reqTilesAntes;
  for (let i = 0; i < 30 && reqTilesDepois === reqTilesAntes; i++) {
    await page.waitForTimeout(500);
    reqTilesDepois = requests.filter((u) =>
      u.includes("/atlas/tiles/")).length;
  }
  check(tag + " pan carrega novos tiles", reqTilesDepois > reqTilesAntes,
    reqTilesAntes + " -> " + reqTilesDepois);

  await page.screenshot({ path: join(OUT, shot), fullPage: true });
  check(tag + " tiles novos neste fluxo", tileResponses.length > tilesAntes,
    tileResponses.length - tilesAntes + " respostas de tile");
  await ctx.close();
}

await fluxoNativo(
  "desktop",
  { viewport: { width: 1366, height: 768 } },
  "nativo-real-desktop.png",
  true /* pan programatico: deterministico, nao depende de foco/marcadores */
);
await fluxoNativo(
  "mobile",
  { viewport: { width: 390, height: 844 } },
  "nativo-real-mobile.png",
  true
);

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

writeFileSync(join(OUT, "tiles-reais-requisicoes.txt"), requests.join("\n") + "\n");
writeFileSync(join(OUT, "tiles-reais-respostas.txt"), tileResponses.join("\n") + "\n");
writeFileSync(join(OUT, "tiles-reais-resultados.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
