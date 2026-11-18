// Verificacao do PILOTO REAL em /atlas/ — dados congelados
// data/piloto-norte.json (sem interceptacao no caminho feliz).
// Uso: node atlas/test/verificar-piloto-real.mjs
import { chromium } from "playwright";
import { pausarTilesAutomaticos, liberarTilesAutomaticos }
  from "./lib-tiles-auto.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });

const DADOS = JSON.parse(
  readFileSync(join(DIR, "..", "data", "piloto-norte.json"), "utf8")
);
const MANIFESTO = JSON.parse(
  readFileSync(join(DIR, "..", "data", "mapa.json"), "utf8")
);

const results = [];
const consoleLog = [];
const requests = [];
const tileResponses = [];
const failedReqs = [];

function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : ""));
  return ok;
}

function ligarColetores(page, tag) {
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

async function setCapitulo(page, n) {
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, n);
  await page.waitForTimeout(350);
}

function cpPorId(id) {
  return DADOS.controlPoints.find((p) => p.id === id);
}

function locNoCapitulo(c) {
  const pos = DADOS.route.positions.find(
    (p) => p.startChapter <= c && c <= p.endChapter
  );
  return pos ? cpPorId(pos.locationId) : null;
}

const browser = await chromium.launch();

// ---------- desktop: portal + fluxo feliz real ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  /* fixa a cascata no piloto-norte: todos os saltos mais novos em
     404 fazem o loader cair no conjunto que esta suite congela */
  for (const u of ["atlas-percursos-v7", "atlas-percursos-v6", "atlas-inventario-v5",
      "atlas-inventario-v4", "atlas-inventario-v3", "atlas-agot-v2"]) {
    await page.route("**/atlas/data/" + u + ".json", (route) =>
      route.fulfill({ status: 404, body: "ausente" }));
  }
  ligarColetores(page, "desktop");
  /* transicao real: previa primeiro, nativo liberado no ponto do
     antigo clique manual */
  await pausarTilesAutomaticos(page);

  const r1 = await page.goto(BASE + "/");
  check("portal / responde 200", r1.status() === 200, "HTTP " + r1.status());

  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForSelector("#loc-lista li", { timeout: 15000, state: "attached" });

  check("6 entradas na lista", (await page.locator("#loc-lista li").count()) === 6);
  check("6 marcadores de localidade (excluindo Jon)",
    (await page.locator(".loc-pin:not(.loc-pin-jon)").count()) === 6);
  check("Jon desmarcado por padrao", !(await page.locator("#chk-jon").isChecked()));
  check("slider max = 72 do arquivo",
    (await page.locator("#cap-slider").getAttribute("max")) === "72");
  const titulo0 = await page.locator("#cap-titulo").textContent();
  /* a UI normaliza "Livro-N: Título" -> "Título" (mesma regra de
     tituloCapitulo em overlays.js); o conteudo vem do arquivo */
  const esperado0 = (() => {
    const t = DADOS.chapters[0].title || "";
    const dois = t.indexOf(":");
    return (dois >= 0 ? t.slice(dois + 1).trim() : t.trim()) ||
      "Capítulo 0";
  })();
  check("titulo do capitulo do arquivo congelado",
    titulo0.trim() === esperado0,
    titulo0.trim() + " vs " + esperado0);

  await page.check("#chk-jon");
  await page.waitForTimeout(350);
  check("ch0: Jon em Winterfell, sem linha",
    (await page.locator(".loc-pin-jon").count()) === 1 &&
      (await page.locator(".leaflet-overlay-pane path").count()) === 0);

  await setCapitulo(page, 1);
  check("ch1: sem posicao de referencia",
    (await page.locator(".loc-pin-jon").count()) === 0);

  await setCapitulo(page, 18);
  check("ch18: Jon em Winterfell, ainda sem linha",
    (await page.locator(".loc-pin-jon").count()) === 1 &&
      (await page.locator(".leaflet-overlay-pane path").count()) === 0);

  await setCapitulo(page, 19);
  check("ch19: Jon em Castle_Black + uma linha tracejada",
    (await page.locator(".loc-pin-jon").count()) === 1 &&
      (await page.locator(
        ".leaflet-overlay-pane path[stroke-dasharray]").count()) === 1);

  // posicao do marcador de posicao vs transformacao esperada (previa)
  const desvioJon = await page.evaluate(([x, y, W, H]) => {
    const map = window.__atlasMap;
    const img = document.querySelector("img.leaflet-image-layer");
    const exp = [
      img.naturalHeight * (1 - y / H),
      img.naturalWidth * (x / W)
    ];
    const c = map.latLngToContainerPoint([exp[0], exp[1]]);
    const el = document
      .querySelector(".loc-pin-jon")
      .closest(".leaflet-marker-icon");
    const r = el.getBoundingClientRect();
    const mb = map.getContainer().getBoundingClientRect();
    return {
      dx: Math.abs(r.left + r.width / 2 - mb.left - c.x),
      dy: Math.abs(r.top + r.height / 2 - mb.top - c.y)
    };
  }, [4260, 2370, MANIFESTO.width, MANIFESTO.height]); // Castle_Black
  check("previa: Jon no centro esperado (Castle_Black)",
    desvioJon.dx <= 4 && desvioJon.dy <= 4,
    "dx=" + desvioJon.dx.toFixed(1) + " dy=" + desvioJon.dy.toFixed(1));

  // centros dos 6 marcadores de localidade vs transformacao esperada
  const desviosLoc = await page.evaluate(([cps, W, H]) => {
    const map = window.__atlasMap;
    const img = document.querySelector("img.leaflet-image-layer");
    const mb = map.getContainer().getBoundingClientRect();
    const icons = [...document.querySelectorAll(
      ".leaflet-marker-icon .loc-pin:not(.loc-pin-jon)"
    )].map((n) => n.closest(".leaflet-marker-icon"));
    return icons.map((el, i) => {
      const p = cps[i];
      const c = map.latLngToContainerPoint([
        img.naturalHeight * (1 - p.y / H),
        img.naturalWidth * (p.x / W)
      ]);
      const r = el.getBoundingClientRect();
      return Math.max(
        Math.abs(r.left + r.width / 2 - mb.left - c.x),
        Math.abs(r.top + r.height / 2 - mb.top - c.y)
      );
    });
  }, [DADOS.controlPoints.map((p) => ({ x: p.x, y: p.y })), MANIFESTO.width, MANIFESTO.height]);
  check("previa: 6 marcadores nos centros esperados (<=4px)",
    desviosLoc.length === 6 && desviosLoc.every((d) => d <= 4),
    desviosLoc.map((d) => d.toFixed(1)).join(","));

  // busca acento/caixa
  await page.fill("#loc-busca", "CASTELO");
  check("busca 'CASTELO' -> 1 resultado",
    (await page.locator("#loc-lista li:not([hidden])").count()) === 1);
  await page.fill("#loc-busca", "fosso cailin");
  check("busca 'fosso cailin' -> 1 resultado",
    (await page.locator("#loc-lista li:not([hidden])").count()) === 1);

  // estado a preservar no switch: query + rotulos + jon + ch19
  await page.check("#loc-rotulos");
  /* rotulos so renderizam acima do limiar de zoom da previa
     (~0.76) e so para pinos dentro da vista: centraliza no
     aglomerado do Norte antes de medir */
  await page.evaluate(() => {
    const img = document.querySelector("img.leaflet-image-layer");
    window.__atlasMap.setView(
      [img.naturalHeight * (1 - 2370 / 14428),
        img.naturalWidth * (4260 / 21654)],
      1.5, { animate: false });
  });
  await page.waitForTimeout(700);
  check("rotulos visiveis", (await page.locator(".loc-label").count()) >= 1,
    "n=" + (await page.locator(".loc-label").count()));

  liberarTilesAutomaticos(page);
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(700);

  check("nativo: query preservada",
    (await page.locator("#loc-busca").inputValue()) === "fosso cailin");
  check("nativo: jon + ch19 preservados",
    (await page.locator("#chk-jon").isChecked()) &&
      (await page.locator("#cap-slider").inputValue()) === "19");
  /* rotulos preservados como ESTADO: no nativo so aparecem com
     zoom >= 3; zoom minimo revela todos os marcadores da vista */
  check("nativo: toggle de rotulos preservado",
    await page.locator("#loc-rotulos").isChecked());
  await page.evaluate(() =>
    window.__atlasMap.setZoom(window.__atlasMap.getMinZoom()));
  await page.waitForTimeout(600);
  check("nativo: marcadores preservados (vista ampla)",
    (await page.locator(".loc-pin:not(.loc-pin-jon)").count()) === 6);
  await page.evaluate(() => window.__atlasMap.setZoom(3.5));
  await page.waitForTimeout(600);
  check("nativo: rotulos renderizam com zoom suficiente",
    (await page.locator(".loc-label").count()) >= 1,
    "n=" + (await page.locator(".loc-label").count()));
  check("nativo: posicao visivel e linha presente",
    (await page.locator(".loc-pin-jon").count()) === 1 &&
      (await page.locator(
        ".leaflet-overlay-pane path[stroke-dasharray]").count()) === 1);

  /* centraliza o Jon antes de medir o desvio do marcador */
  await page.evaluate(([x, y]) =>
    window.__atlasMap.setView(
      window.__atlasMap.unproject([x, y],
        window.__atlasMap.getMaxZoom()), 4, { animate: false }),
    [4260, 2370]);
  await page.waitForTimeout(400);

  // posicao do marcador nativo vs unproject real
  const desvioNat = await page.evaluate(([x, y]) => {
    const map = window.__atlasMap;
    const c = map.latLngToContainerPoint(map.unproject([x, y], map.getMaxZoom()));
    const el = document
      .querySelector(".loc-pin-jon")
      .closest(".leaflet-marker-icon");
    const r = el.getBoundingClientRect();
    const mb = map.getContainer().getBoundingClientRect();
    return {
      dx: Math.abs(r.left + r.width / 2 - mb.left - c.x),
      dy: Math.abs(r.top + r.height / 2 - mb.top - c.y)
    };
  }, [4260, 2370]); // Castle_Black, ch19
  check("nativo: Jon no centro esperado (<=4px)",
    desvioNat.dx <= 4 && desvioNat.dy <= 4,
    "dx=" + desvioNat.dx.toFixed(1) + " dy=" + desvioNat.dy.toFixed(1));

  await page.evaluate(() => {
    const map = window.__atlasMap;
    map.setView(map.unproject([16000, 1200], 6), 4, { animate: false });
  });
  await page.waitForTimeout(1400);
  await page.screenshot({
    path: join(OUT, "piloto-real-norte-nativo.png"),
    fullPage: true
  });
  await page.screenshot({
    path: join(OUT, "piloto-real-desktop.png"),
    fullPage: true
  });
  await ctx.close();
}

// ---------- mobile ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const u of ["atlas-percursos-v7", "atlas-percursos-v6", "atlas-inventario-v5",
      "atlas-inventario-v4", "atlas-inventario-v3", "atlas-agot-v2"]) {
    await page.route("**/atlas/data/" + u + ".json", (route) =>
      route.fulfill({ status: 404, body: "ausente" }));
  }
  ligarColetores(page, "mobile");
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForSelector("#loc-lista li", { timeout: 15000, state: "attached" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check("mobile sem overflow horizontal", overflow <= 1, "overflow=" + overflow);
  /* pinos de localidade tem culling por vista: zoom minimo revela
     todos os 6 antes de contar */
  await page.evaluate(() =>
    window.__atlasMap.setZoom(window.__atlasMap.getMinZoom()));
  await page.waitForTimeout(600);
  check("mobile: 6 pontos de localidade",
    (await page.locator(".loc-pin:not(.loc-pin-jon)").count()) === 6);
  await page.click("#btn-painel");
  await page.waitForTimeout(300);
  await page.check("#chk-jon");
  await page.waitForTimeout(350);
  check("mobile: Jon posiciona no ch0",
    (await page.locator(".loc-pin-jon").count()) === 1);
  await page.screenshot({ path: join(OUT, "piloto-real-mobile.png"), fullPage: true });
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
/* /assets/tiles/nat/ do portal tambem contem "/tiles/" — so interessa
   o conjunto versionado do atlas */
const reqTiles = requests.filter((u) => u.includes("/atlas/tiles/"));
check("todos tiles do conjunto recorte-v2",
  reqTiles.length > 0 && reqTiles.every((u) => u.includes("recorte-v2")),
  reqTiles.length + " requisicoes");
const tilesRuins = tileResponses.filter((l) => !/ 200 /.test(l));
check("todas respostas de tile HTTP 200", tilesRuins.length === 0,
  tilesRuins.join(" | ") || "ok");
check("nenhuma requisicao falha", failedReqs.length === 0,
  failedReqs.join(" | ") || "ok");
const erros = consoleLog.filter((l) => l.startsWith("[pageerror"));
check("sem pageerrors", erros.length === 0, erros.join(" | ") || "ok");

writeFileSync(join(OUT, "piloto-real-requisicoes.txt"), requests.join("\n") + "\n");
writeFileSync(join(OUT, "piloto-real-resultados.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
