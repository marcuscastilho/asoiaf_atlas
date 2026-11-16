// Verificacao do carregamento AUTOMATICO dos tiles nativos em /atlas/
// — sem botao, sem acao do usuario; previa como apoio e reserva.
// Uso: node atlas/test/verificar-tiles-auto.mjs
// (servidor http-server na raiz do projeto, porta 8080)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "evidencias");
mkdirSync(OUT, { recursive: true });

const MANIFESTO_URL = "**/atlas/data/mapa.json";
const PREVIEW_URL = "**/o-mundo-conhecido-recorte-v1-preview.webp";
const TILES_URL = "**/atlas/tiles/**";
/* casos em que tiles 404/abortados sao INTENCIONAIS — nao sujam a
   higiene global de respostas */
const TAGS_TILES_RUINS = new Set(["C", "D", "E", "I"]);

const results = [];
const pageErrors = [];
const requests = [];
const tileRespRuins = [];
const failedReqs = [];

function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name +
    (detail ? " — " + detail : ""));
  return ok;
}

function despejaParcial(e) {
  try {
    results.push("FATAL " + (e && e.message ? e.message : String(e)));
    writeFileSync(join(OUT, "tiles-auto-resultados.txt"),
      results.join("\n") + "\n");
  } catch (_) { /* noop */ }
}

function ligarColetores(page, tag) {
  page.on("request", (r) => requests.push(tag + " " + r.url()));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    /* route.abort() dispara net::ERR_FAILED (nao "aborted"): os
       casos intencionais sao filtrados por tag+recurso no assert
       global; ERR_ABORTED de navegacao do Leaflet e benigno */
    if (!f || !/aborted/i.test(f.errorText)) {
      failedReqs.push(tag + " " + r.url() + " " +
        (f ? f.errorText : "?"));
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/atlas/tiles/") && resp.status() !== 200 &&
        !TAGS_TILES_RUINS.has(tag.split("-")[0])) {
      tileRespRuins.push(tag + " " + resp.status() + " " + resp.url());
    }
  });
  page.on("pageerror", (e) =>
    pageErrors.push("[" + tag + "] " + e.message));
}

/* a malha nativa: instancia L.TileLayer -> getContainer() (raiz
   .leaflet-layer no tilePane, zIndex 1 — NAO o .leaflet-tile-container
   por-nivel, que herda posicionamento relativo) */
function apoioSobTiles() {
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
}

function leituraVista() {
  const map = window.__atlasMap;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng, z: map.getZoom() };
}

let browser;
try {
  /* manifesto real: usado pelos casos G/H para comparar a vista */
  const MAN = await (await fetch(BASE + "/atlas/data/mapa.json")).json();
  if (!MAN || !MAN.nativePixelsValidated) {
    console.log("STOP: manifesto de tiles invalido ou ausente em " +
      BASE + "/atlas/data/mapa.json");
    process.exit(1);
  }

  browser = await chromium.launch();

  /* ================= A: desktop real, ZERO interacao ================= */
  {
    const tag = "A";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);

    const rRoot = await page.goto(BASE + "/");
    check("A portal / HTTP 200", rRoot.status() === 200);
    const tituloPortal = await page.title();
    check("A portal titulo correto",
      /Mapa de As Crônicas de Gelo e Fogo/.test(tituloPortal),
      tituloPortal.slice(0, 60));
    const mapRoot = await page.evaluate(
      () => !!document.querySelector(".leaflet-container"));
    check("A portal Leaflet inicializa", !!mapRoot);

    const rA = await page.goto(BASE + "/atlas/",
      { waitUntil: "domcontentloaded" });
    check("A /atlas/ HTTP 200", rA.status() === 200);
    check("A nenhum #btn-tiles no DOM",
      (await page.locator("#btn-tiles").count()) === 0);
    const barra = await page.locator(".barra-controles").textContent();
    check("A toolbar sem acao manual de tiles",
      !/Carregar tiles/i.test(barra || ""), (barra || "").trim().slice(0, 80));

    await page.waitForSelector("img.leaflet-tile-loaded",
      { timeout: 30000 });
    check("A tiles nativos carregam sozinhos",
      (await page.locator("img.leaflet-tile-loaded").count()) > 0);
    await page.waitForSelector("img.leaflet-image-layer",
      { timeout: 20000 });
    const apoio = await page.evaluate(apoioSobTiles);
    check("A previa e apoio sob os tiles (tilePane z0 < z1)",
      !!apoio && apoio.paneTile && apoio.z === "0" &&
        apoio.tileZ === "1",
      apoio ? JSON.stringify(apoio) : "sem image-layer");
    const badge = await page.locator("#badge-estado").textContent();
    check("A badge indica resolucao nativa", /nativa/i.test(badge),
      (badge || "").trim());

    /* zoom, pan, ajuda e tela cheia continuam funcionando */
    const z0 = await page.evaluate(() => window.__atlasMap.getZoom());
    await page.click(".leaflet-control-zoom-in");
    await page.waitForTimeout(500);
    const z1 = await page.evaluate(() => window.__atlasMap.getZoom());
    check("A zoom + funciona no nativo", z1 > z0,
      z0.toFixed(2) + " -> " + z1.toFixed(2));
    const cPan = await page.evaluate(() => {
      const c0 = window.__atlasMap.getCenter();
      /* animate:false — o centro tem de mudar na mesma leitura */
      window.__atlasMap.panBy([180, 120], { animate: false });
      const c1 = window.__atlasMap.getCenter();
      return c0.lat !== c1.lat || c0.lng !== c1.lng;
    });
    await page.waitForTimeout(300);
    check("A pan move o centro no nativo", cPan);

    await page.click("#btn-ajuda");
    check("A ajuda abre", await page.locator("#painel-ajuda").isVisible());
    await page.click("#btn-ajuda");

    await page.click("#btn-tela-cheia");
    await page.waitForTimeout(600);
    const fsOn = await page.evaluate(() => !!document.fullscreenElement);
    const fsMsg = await page.locator("#mapa-status").textContent();
    check("A tela cheia entra ou avisa sem falhar",
      fsOn || /tela cheia/i.test(fsMsg || ""),
      fsOn ? "fullscreen ativo" : (fsMsg || "").trim().slice(0, 60));
    if (fsOn) {
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: join(OUT, "tiles-auto-desktop.png") });
    await ctx.close();
  }

  /* ================= B: mobile 390 / 320 ================= */
  for (const w of [390, 320]) {
    const tag = "B" + w;
    const ctx = await browser.newContext({
      viewport: { width: w, height: 844 },
      hasTouch: true,
      isMobile: true
    });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("img.leaflet-tile-loaded",
      { timeout: 30000 });
    check(tag + " nativo automatico tambem no mobile",
      (await page.locator("img.leaflet-tile-loaded").count()) > 0);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth);
    check(tag + " sem overflow horizontal", overflow <= 1,
      "overflow=" + overflow);
    check(tag + " painel inicia recolhido",
      await page.locator("#lateral-corpo").isHidden());
    await page.click("#btn-painel");
    check(tag + " painel expande",
      await page.locator("#lateral-corpo").isVisible());
    await page.screenshot(
      { path: join(OUT, "tiles-auto-mobile-" + w + ".png") });
    await ctx.close();
  }

  /* ===== C: manifesto 404 / 500 / JSON quebrado / nao validado ===== */
  const casosC = [
    ["404", (route) => route.fulfill({ status: 404, body: "ausente" })],
    ["500", (route) => route.fulfill({ status: 500, body: "erro" })],
    ["json-quebrado", (route) => route.fulfill({
      contentType: "application/json", body: "{quebrado" })],
    ["nao-validado", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        nativePixelsValidated: false, width: 100, height: 100,
        tileSize: 512, minZoom: 0, maxNativeZoom: 6, maxZoom: 6,
        tileUrl: "tiles/{z}/{x}/{y}.webp"
      })
    })],
    ["dimensoes-invalidas", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(Object.assign({}, MAN, { width: 0 }))
    })]
  ];
  for (const [nome, handler] of casosC) {
    const tag = "C-" + nome;
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    const pedidosTiles = [];
    page.on("request", (r) => {
      if (r.url().includes("/atlas/tiles/")) {
        pedidosTiles.push(r.url());
      }
    });
    await page.route(MANIFESTO_URL, handler);
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("img.leaflet-image-layer",
      { timeout: 20000 });
    /* janela honesta para um fetch indevido de tile aparecer */
    await page.waitForTimeout(1500);
    check(tag + " previa mantida",
      (await page.locator("img.leaflet-image-layer").count()) === 1);
    check(tag + " nenhum tile requisitado",
      pedidosTiles.length === 0, pedidosTiles.length + " pedidos");
    check(tag + " erro fatal nao exibido",
      await page.locator("#mapa-erro").isHidden());
    const st = await page.locator("#mapa-status").textContent();
    check(tag + " status menciona a previa",
      /pr[eé]via/i.test(st || ""), (st || "").trim().slice(0, 70));
    const zA = await page.evaluate(() => window.__atlasMap.getZoom());
    await page.click(".leaflet-control-zoom-in");
    await page.waitForTimeout(400);
    const zB = await page.evaluate(() => window.__atlasMap.getZoom());
    check(tag + " zoom continua navegavel na previa", zB > zA,
      zA.toFixed(2) + " -> " + zB.toFixed(2));
    await ctx.close();
  }

  /* ========== D: TODOS os tiles falham (404 e abort) ========== */
  for (const [nome, handler] of [
    ["404", (route) => route.fulfill({ status: 404, body: "ausente" })],
    ["abort", (route) => route.abort()]
  ]) {
    const tag = "D-" + nome;
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    await page.route(TILES_URL, handler);
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("img.leaflet-image-layer",
      { timeout: 20000 });
    /* espera o aviso de falha parcial/total (sem sleep magico) */
    await page.waitForFunction(() =>
      /Falha/.test(
        document.querySelector("#mapa-status").textContent || ""),
      null, { timeout: 20000 }).catch(() => {});
    check(tag + " previa visivel como reserva",
      (await page.locator("img.leaflet-image-layer").count()) === 1);
    check(tag + " sem erro fatal enquanto a previa existe",
      await page.locator("#mapa-erro").isHidden());
    const st = await page.locator("#mapa-status").textContent();
    check(tag + " status honesto sobre o apoio da previa",
      /pr[eé]via/i.test(st || ""), (st || "").trim().slice(0, 70));
    const badge = await page.locator("#badge-estado").textContent();
    check(tag + " badge NAO anuncia nativa sem pixels",
      !/nativa/i.test(badge || ""), (badge || "").trim());
    if (nome === "404") {
      await page.screenshot(
        { path: join(OUT, "tiles-auto-fallback-total.png") });
    }
    await ctx.close();
  }

  /* ============ E: falha parcial (1 tile fora, resto 200) ============ */
  {
    const tag = "E";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    let pedidoN = 0;
    await page.route(TILES_URL, (route) => {
      pedidoN++;
      if (pedidoN === 1) {
        return route.fulfill({ status: 404, body: "ausente" });
      }
      return route.fallback();
    });
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("img.leaflet-tile-loaded",
      { timeout: 30000 });
    check("E pixels nativos chegam apesar de 1 tile falho",
      (await page.locator("img.leaflet-tile-loaded").count()) > 0);
    /* mais tiles tardios nao podem apagar o aviso de falha parcial */
    await page.waitForFunction(() =>
      document.querySelectorAll("img.leaflet-tile-loaded").length >= 4,
      null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    const st = await page.locator("#mapa-status").textContent();
    check("E aviso de falha parcial persiste a sucessos tardios",
      /Falha/i.test(st || "") && /pr[eé]via/i.test(st || ""),
      (st || "").trim().slice(0, 70));
    check("E previa segue como apoio na area do tile falho",
      (await page.locator("img.leaflet-image-layer").count()) === 1);
    check("E sem erro fatal com nativo parcial",
      await page.locator("#mapa-erro").isHidden());
    await ctx.close();
  }

  /* ===== F: previa bloqueada, nativo real funciona sem ela ===== */
  {
    const tag = "F";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    await page.route(PREVIEW_URL, (route) => route.abort());
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("img.leaflet-tile-loaded",
      { timeout: 30000 });
    await page.waitForTimeout(600);
    check("F nativo carrega sem previa",
      (await page.locator("img.leaflet-tile-loaded").count()) > 0);
    check("F erro fatal apagado quando pixels chegam",
      await page.locator("#mapa-erro").isHidden());
    const badge = await page.locator("#badge-estado").textContent();
    check("F badge indica nativa", /nativa/i.test(badge || ""),
      (badge || "").trim());
    await ctx.close();
  }

  /* ==== G: previa tardia nao reseta vista/estado do nativo ==== */
  {
    const tag = "G";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    let liberaPrevia;
    const portao = new Promise((res) => { liberaPrevia = res; });
    await page.route(PREVIEW_URL, async (route) => {
      await portao;
      return route.fallback();
    });
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("img.leaflet-tile-loaded",
      { timeout: 30000 });
    await page.waitForFunction(() =>
      /nativa/i.test(
        document.querySelector("#badge-estado").textContent || ""),
      null, { timeout: 15000 });
    /* leva a vista para longe do enquadramento inicial: se a previa
       tardia tocasse o mapa, a regressao seria visivel */
    await page.evaluate((maxZ) => {
      window.__atlasMap.setView(
        window.__atlasMap.unproject([9000, 7000], maxZ), 4.5,
        { animate: false });
    }, MAN.maxNativeZoom);
    await page.waitForTimeout(300);
    const antes = await page.evaluate(leituraVista);
    const stAntes = await page.locator("#mapa-status").textContent();
    liberaPrevia();
    await page.waitForSelector("img.leaflet-image-layer",
      { timeout: 20000 });
    await page.waitForTimeout(600);
    const depois = await page.evaluate(leituraVista);
    check("G previa tardia entra como apoio",
      (await page.locator("img.leaflet-image-layer").count()) === 1);
    check("G previa tardia NAO move centro/zoom",
      depois.lat === antes.lat && depois.lng === antes.lng &&
        depois.z === antes.z,
      JSON.stringify(antes) + " -> " + JSON.stringify(depois));
    const stDepois = await page.locator("#mapa-status").textContent();
    const badge = await page.locator("#badge-estado").textContent();
    check("G status/badge nativos preservados na chegada tardia",
      stDepois === stAntes && /nativa/i.test(badge || ""),
      (badge || "").trim() + " | " + (stDepois || "").trim().slice(0, 50));
    await ctx.close();
  }

  /* ==== H: manifesto atrasado preserva vista da previa ==== */
  {
    const tag = "H";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    let liberaManifesto;
    const portao = new Promise((res) => { liberaManifesto = res; });
    await page.route(MANIFESTO_URL, async (route) => {
      await portao;
      return route.fallback();
    });
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("img.leaflet-image-layer",
      { timeout: 20000 });
    /* usuario navega para longe das bordas antes do nativo chegar */
    await page.click(".leaflet-control-zoom-in");
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__atlasMap.panBy([260, -180]));
    await page.waitForTimeout(400);
    const antes = await page.evaluate(() => {
      const map = window.__atlasMap;
      const img = document.querySelector("img.leaflet-image-layer");
      const c = map.getCenter();
      return {
        nx: c.lng / img.naturalWidth,
        ny: 1 - c.lat / img.naturalHeight,
        z: map.getZoom(),
        natW: img.naturalWidth
      };
    });
    liberaManifesto();
    await page.waitForSelector("img.leaflet-tile-loaded",
      { timeout: 30000 });
    const depois = await page.evaluate((m) => {
      const map = window.__atlasMap;
      const p = map.project(map.getCenter(), m.maxNativeZoom);
      return {
        nx: p.x / m.width,
        ny: p.y / m.height,
        z: map.getZoom()
      };
    }, MAN);
    check("H centro normalizado preservado (<=0.005)",
      Math.abs(depois.nx - antes.nx) <= 0.005 &&
        Math.abs(depois.ny - antes.ny) <= 0.005,
      JSON.stringify(antes) + " -> " + JSON.stringify(depois));
    /* escala efetiva de pixels: a conversao esperada e
       zoomAlvo = z0 + log2(natW * 2^maxZ / W); tolera zoomSnap 0.25 */
    const zoomEsp = antes.z +
      Math.log2(antes.natW * Math.pow(2, MAN.maxNativeZoom) / MAN.width);
    check("H escala efetiva preservada (<=~10%, snap 0.25)",
      Math.abs(depois.z - zoomEsp) <= Math.log2(1.10),
      "zoomEsp=" + zoomEsp.toFixed(3) + " real=" +
        depois.z.toFixed(3));
    await ctx.close();
  }

  /* == C2: manifesto falha ANTES da previa -> aviso nao e apagado == */
  {
    const tag = "C2";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    await page.route(MANIFESTO_URL, (route) =>
      route.fulfill({ status: 404, body: "ausente" }));
    let liberaPrevia;
    const portao = new Promise((res) => { liberaPrevia = res; });
    await page.route(PREVIEW_URL, async (route) => {
      await portao;
      return route.fallback();
    });
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    /* manifesto falhou primeiro: aviso de fallback ja esta no ar */
    await page.waitForFunction(() =>
      /pr[eé]via/i.test(
        document.querySelector("#mapa-status").textContent || ""),
      null, { timeout: 15000 });
    liberaPrevia();
    await page.waitForSelector("img.leaflet-image-layer",
      { timeout: 20000 });
    await page.waitForTimeout(400);
    const st = await page.locator("#mapa-status").textContent();
    check("C2 aviso de fallback sobrevive a chegada da previa",
      /pr[eé]via/i.test(st || ""), (st || "").trim().slice(0, 70));
    check("C2 previa carrega mesmo sem manifesto",
      (await page.locator("img.leaflet-image-layer").count()) === 1);
    check("C2 sem erro fatal (previa ok)",
      await page.locator("#mapa-erro").isHidden());
    await ctx.close();
  }

  /* ==== I-reverso: tiles falham ANTES do erro da previa -> fatal ==== */
  {
    const tag = "I-reverso";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    await page.route(TILES_URL, (route) => route.abort());
    /* previa segurada: so aborta DEPOIS de todos os tiles falharem —
       o onerror tardio ainda precisa revelar o fatal */
    let liberaPrevia;
    const portao = new Promise((res) => { liberaPrevia = res; });
    await page.route(PREVIEW_URL, async (route) => {
      await portao;
      return route.abort();
    });
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    /* 'load' do tileLayer com zero pixels => nativo falhou; a previa
       ainda esta pendente (nao falhou), entao so aviso por ora */
    await page.waitForFunction(() =>
      /Falha/.test(
        document.querySelector("#mapa-status").textContent || ""),
      null, { timeout: 20000 });
    check("I-reverso aviso de reserva antes do erro da previa",
      await page.locator("#mapa-erro").isHidden());
    liberaPrevia();
    await page.waitForFunction(() =>
      !document.querySelector("#mapa-erro").hidden,
      null, { timeout: 15000 }).catch(() => {});
    check("I-reverso fatal quando a previa falha por ultimo",
      await page.locator("#mapa-erro").isVisible());
    await ctx.close();
  }

  /* ========== I: previa E tiles indisponiveis -> erro honesto ========== */
  {
    const tag = "I";
    const ctx = await browser.newContext(
      { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    ligarColetores(page, tag);
    await page.route(PREVIEW_URL, (route) => route.abort());
    await page.route(TILES_URL, (route) => route.abort());
    /* domcontentloaded: recursos segurados por gates de teste nao
       podem virar dependencia circular do evento load do goto */
    await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      !document.querySelector("#mapa-erro").hidden,
      null, { timeout: 20000 }).catch(() => {});
    check("I erro fatal compreensivel exibido",
      await page.locator("#mapa-erro").isVisible());
    const txt = await page.locator("#mapa-erro").textContent();
    check("I mensagem fala do mapa, nao so da previa",
      /mapa/i.test(txt || ""), (txt || "").trim().slice(0, 70));
    await page.screenshot(
      { path: join(OUT, "tiles-auto-ambos-falham.png") });
    await ctx.close();
  }

  await browser.close();
  browser = null;
} catch (e) {
  despejaParcial(e);
  throw e;
} finally {
  if (browser) {
    await browser.close();
  }
}

/* ================= asserts globais de rede/erro ================= */
const externos = requests.map((l) => l.replace(/^\S+ /, ""))
  .filter((u) => !u.startsWith(BASE));
check("nenhuma requisicao externa", externos.length === 0,
  externos.slice(0, 4).join(", ") || "todas locais");
const mestres = requests.map((l) => l.replace(/^\S+ /, ""))
  .filter((u) => /\/mapas\/(jpeg|png|webp\/reduzidos)\//.test(u));
check("nenhum fetch de imagem mestre", mestres.length === 0,
  mestres.join(", ") || "ok");
check("respostas de tile ruins so nos casos intencionais",
  tileRespRuins.length === 0,
  tileRespRuins.slice(0, 4).join(" | ") || "ok");
/* requisicoes falhas so sao aceitaveis nos cenarios intencionais:
   tiles abortados em D e I, previa abortada em F e I. ERR_ABORTED
   de navegacao do Leaflet nem chega aqui (filtrado no coletor) */
const falhasInesperadas = failedReqs.filter((l) => {
  const partes = l.split(" ");
  const t = partes[0].split("-")[0];
  const url = partes[1] || "";
  const ehTile = url.includes("/atlas/tiles/");
  const ehPrevia = url.includes("preview.webp");
  if (ehTile && (t === "D" || t === "I")) return false;
  if (ehPrevia && (t === "F" || t === "I")) return false;
  return true;
});
check("nenhuma requisicao falha inesperada",
  falhasInesperadas.length === 0,
  falhasInesperadas.slice(0, 4).join(" | ") || "ok");
check("sem pageerrors", pageErrors.length === 0,
  pageErrors.slice(0, 4).join(" | ") || "ok");

writeFileSync(join(OUT, "tiles-auto-requisicoes.txt"),
  requests.join("\n") + "\n");
writeFileSync(join(OUT, "tiles-auto-resultados.txt"),
  results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL") ||
  r.startsWith("FATAL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
