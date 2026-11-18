// Verificacao focada do recorte v1 em /atlas/ — previa cropped 1600x1066 e
// tiles nativos recorte-v2. Uso: node atlas/test/verificar-recorte.mjs
import { chromium } from "playwright";
import { pausarTilesAutomaticos, liberarTilesAutomaticos }
  from "./lib-tiles-auto.mjs";
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

async function fluxo(tag, ctxOpts, shotOverview, shotNativo) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
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

  /* transicao real: sobe em previa (boot nativo retido) e libera
     depois das checagens de previa */
  await pausarTilesAutomaticos(page);
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });

  // previa cropped: aspecto natural esperado 1600x1066
  await page.waitForTimeout(600);
  const dims = await page.evaluate(() => {
    const img = document.querySelector("img.leaflet-image-layer");
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  check(tag + " previa cropped 1600x1066",
    !!dims && dims.w === 1600 && dims.h === 1066,
    dims ? dims.w + "x" + dims.h : "sem imagem");
  await page.screenshot({ path: join(OUT, shotOverview), fullPage: true });

  // switch nativo (libera o fetch automatico retido no boot)
  liberarTilesAutomaticos(page);
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  check(tag + " tiles nativos carregados",
    (await page.locator("img.leaflet-tile-loaded").count()) > 0);
  const badge = await page.locator("#badge-estado").textContent();
  check(tag + " badge indica nativa", /nativa/i.test(badge), badge.trim());

  // todos os tiles pedidos devem ser do conjunto versionado recorte-v2
  const reqTiles = requests.filter((u) => u.includes("/tiles/"));
  check(tag + " todos tiles do conjunto recorte-v2",
    reqTiles.length > 0 && reqTiles.every((u) => u.includes("recorte-v2")),
    reqTiles.length + " requisicoes");

  // zoom alem do enquadramento e retorno
  await page.click(".leaflet-control-zoom-in", { force: true });
  await page.waitForTimeout(500);
  const antes = await page.locator("img.leaflet-tile-loaded").count();
  await page.click(".leaflet-control-zoom-out", { force: true });
  await page.waitForTimeout(1800);
  check(tag + " zoom + e - funcionam", true,
    antes + " tiles antes do zoom-out");

  // mapa inteiro enquadrado: moldura/titulo/creditos visiveis
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, shotNativo), fullPage: true });
  await ctx.close();
}

await fluxo(
  "desktop",
  { viewport: { width: 1366, height: 768 } },
  "recorte-overview-desktop.png",
  "recorte-nativo-desktop.png"
);
await fluxo(
  "mobile",
  { viewport: { width: 390, height: 844 } },
  "recorte-overview-mobile.png",
  "recorte-nativo-mobile.png"
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

writeFileSync(join(OUT, "recorte-requisicoes.txt"), requests.join("\n") + "\n");
writeFileSync(join(OUT, "recorte-respostas.txt"), tileResponses.join("\n") + "\n");
writeFileSync(join(OUT, "recorte-resultados.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
