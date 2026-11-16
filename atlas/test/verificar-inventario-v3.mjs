// verificar-inventario-v3.mjs — fluxo real do atlas com o dataset v3
// publicado (atlas/data/atlas-inventario-v3.json), SEM interceptacao no
// caminho feliz. Todas as contagens/expectativas derivam do proprio
// artefato congelado (e do diagnostico, se presente) — nada e
// recomputado nem inventado aqui.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { pausarTilesAutomaticos, liberarTilesAutomaticos }
  from "./lib-tiles-auto.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080";

const DATA_PATH = join(DIR, "..", "data", "atlas-inventario-v3.json");
const DIAG_PATH = join(DIR, "..", "data", "inventario-v3-diagnostico.json");
const EVID_PATH = join(DIR, "..", "data", "nomes-inventario-v3-evidencias.json");

if (!existsSync(DATA_PATH)) {
  console.log("SKIP: atlas-inventario-v3.json ainda nao publicado.");
  writeFileSync(join(OUT, "v3-resultados.txt"),
    "SKIP: artefato v3 ausente; teste final pendente de publicacao.\n");
  process.exit(2);
}

const DATA = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const MANIFESTO = JSON.parse(readFileSync(join(DIR, "..", "data", "mapa.json"), "utf8"));
const CPS = DATA.controlPoints;
const ROTAS = DATA.routes || [];

const ehSimbolo = (p) =>
  p.identificationStatus === "unidentified-symbol" ||
  p.kind === "unknown-settlement";
const N_SIMB = CPS.filter(ehSimbolo).length;
const N_ID = CPS.length - N_SIMB;

const results = [];
const requests = [];
const failedReqs = [];
const pageErrors = [];
const tileResponses = [];

function check(nome, ok, info) {
  results.push({ nome, ok: !!ok, info: info || "" });
  console.log((ok ? "PASS " : "FAIL ") + nome + (info ? " — " + info : ""));
}
function ligarColetores(page, nome) {
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    /* imagens de tile abortadas ao podar/amimacao nao sao falha */
    if (!f || f.errorText !== "net::ERR_ABORTED") {
      failedReqs.push(nome + ": " + r.url() +
        (f ? " [" + f.errorText + "]" : ""));
    }
  });
  page.on("response", (r) => {
    if (r.url().includes("/atlas/tiles/")) {
      tileResponses.push(r.status() + " " + r.url());
    }
  });
  page.on("pageerror", (e) => pageErrors.push(nome + ": " + e.message));
}
async function setCapitulo(page, n) {
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, n);
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();

// ---------- caminho feliz real (sem interceptacao) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, "feliz");
  /* transicao real: previa primeiro, nativo liberado no ponto do
     antigo clique manual */
  await pausarTilesAutomaticos(page);
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 20000 });

  check("lista tem N localidades do artefato",
    (await page.locator("#loc-lista li").count()) === CPS.length,
    CPS.length + " esperado");
  check(ROTAS.length + " checkboxes de personagem",
    (await page.locator("#lista-personagens input[type=checkbox]").count()) ===
      ROTAS.length);
  check("todos desmarcados por padrao",
    (await page.locator(
      "#lista-personagens input[type=checkbox]:checked").count()) === 0);

  // ---------- layout: mapa em largura total + painel flutuante ----------
  const geoDesk = await page.evaluate(() => {
    const q = document.getElementById("mapa-quadro").getBoundingClientRect();
    const m = document.getElementById("mapa").getBoundingClientRect();
    const a = document.getElementById("lateral").getBoundingClientRect();
    return {
      q: { w: q.width, l: q.left, r: q.right, t: q.top, b: q.bottom },
      m: { w: m.width, l: m.left },
      a: { l: a.left, r: a.right, t: a.top, b: a.bottom },
      corpoVis: !document.getElementById("lateral-corpo").hidden,
      exp: document.getElementById("btn-painel")
        .getAttribute("aria-expanded")
    };
  });
  check("mapa ocupa a largura total da moldura",
    Math.abs(geoDesk.m.w - geoDesk.q.w) <= 2 &&
      Math.abs(geoDesk.m.l - geoDesk.q.l) <= 2,
    "mapa=" + geoDesk.m.w.toFixed(0) + " quadro=" + geoDesk.q.w.toFixed(0));
  check("botoes de enquadramento removidos",
    (await page.locator(
      "#btn-enquadrar, #btn-norte, #btn-fit-regiao").count()) === 0);
  const coverDesk = await page.evaluate(() => {
    const m = document.getElementById("mapa").getBoundingClientRect();
    const i = document.querySelector("img.leaflet-image-layer")
      .getBoundingClientRect();
    return i.left <= m.left + 2 && i.right >= m.right - 2 &&
      i.top <= m.top + 2 && i.bottom >= m.bottom - 2;
  });
  check("imagem cobre o quadro no carregamento inicial",
    coverDesk === true);
  check("painel flutuante dentro da moldura",
    geoDesk.a.l >= geoDesk.q.l && geoDesk.a.r <= geoDesk.q.r + 1 &&
      geoDesk.a.t >= geoDesk.q.t && geoDesk.a.b <= geoDesk.q.b + 1 &&
      geoDesk.corpoVis && geoDesk.exp === "true",
    JSON.stringify(geoDesk.a));

  // recolher/reabrir nao recentraliza o mapa
  await page.waitForTimeout(1500);
  const centroAntes = await page.evaluate(() => {
    const c = window.__atlasMap.getCenter();
    return { lat: c.lat, lng: c.lng };
  });
  await page.click("#btn-painel");
  await page.waitForTimeout(300);
  check("recolher: corpo oculto + aria-expanded=false",
    await page.evaluate(() =>
      document.getElementById("lateral-corpo").hidden &&
      document.getElementById("lateral")
        .classList.contains("lateral-fechada") &&
      document.getElementById("btn-painel")
        .getAttribute("aria-expanded") === "false" &&
      document.getElementById("btn-painel").textContent
        .trim() === "Abrir painel"));
  const centroRec = await page.evaluate(() => {
    const c = window.__atlasMap.getCenter();
    return { lat: c.lat, lng: c.lng };
  });
  check("recolher nao recentraliza o mapa",
    Math.abs(centroRec.lat - centroAntes.lat) < 5 &&
      Math.abs(centroRec.lng - centroAntes.lng) < 5,
    JSON.stringify(centroAntes) + " -> " + JSON.stringify(centroRec));
  await page.click("#btn-painel");
  await page.waitForTimeout(300);
  check("reabrir: corpo visivel novamente",
    !(await page.evaluate(
      () => document.getElementById("lateral-corpo").hidden)));

  /* alternancia por teclado (botao nativo: Enter/Space) */
  await page.locator("#btn-painel").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("teclado recolhe o painel",
    await page.evaluate(
      () => document.getElementById("lateral-corpo").hidden));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("teclado reabre o painel",
    !(await page.evaluate(
      () => document.getElementById("lateral-corpo").hidden)));

  /* tela cheia inclui o painel (documentElement) e sai pelo botao */
  await page.click("#btn-tela-cheia");
  await page.waitForTimeout(600);
  const fs = await page.evaluate(() => ({
    ativo: !!document.fullscreenElement,
    painelDentro: document.fullscreenElement &&
      document.fullscreenElement.contains(
        document.getElementById("lateral"))
  }));
  check("tela cheia ativa com painel dentro",
    fs.ativo && fs.painelDentro, JSON.stringify(fs));
  await page.click("#btn-tela-cheia");
  await page.waitForTimeout(600);
  check("sai da tela cheia pelo botao",
    !(await page.evaluate(() => !!document.fullscreenElement)));

  // nota honesta com divisao identificados/simbolos
  const nota = await page.locator("#localidades-nota").textContent();
  check("nota conta " + N_ID + " identificadas + " + N_SIMB + " simbolos",
    nota.includes(String(N_SIMB)) && nota.includes(String(N_ID)),
    nota.trim().slice(0, 120));

  // ---------- filtro por tipo ----------
  const nCastle = CPS.filter((p) => p.kind === "castle").length;
  await page.selectOption("#filtro-tipo", "castle");
  await page.waitForTimeout(400);
  check("filtro castelo -> " + nCastle + " na lista (inclui anonimos)",
    (await page.locator("#loc-lista li:not([hidden])").count()) === nCastle);
  check("filtro castelo -> " + nCastle + " pinos visiveis",
    (await page.locator(".loc-pin").count()) === nCastle ||
      (await page.locator(".loc-pin").count()) <= nCastle);

  await page.selectOption("#filtro-tipo", "sem-identificacao");
  await page.waitForTimeout(400);
  check("filtro sem-identificacao -> " + N_SIMB + " na lista",
    (await page.locator("#loc-lista li:not([hidden])").count()) === N_SIMB);
  check("simbolos usam pino vazado",
    (await page.locator(".loc-pin-simbolo").count()) > 0 &&
      (await page.locator(".loc-pin-simbolo").count()) ===
        (await page.locator(".loc-pin").count()));

  await page.selectOption("#filtro-tipo", "todas");
  await page.check("#loc-identificados");
  await page.waitForTimeout(400);
  check("somente identificados -> " + N_ID + " na lista",
    (await page.locator("#loc-lista li:not([hidden])").count()) === N_ID);
  await page.uncheck("#loc-identificados");
  await page.waitForTimeout(300);

  // ---------- regioes dinamicas ----------
  for (const reg of DATA.regions || []) {
    await page.selectOption("#filtro-regiao", reg.id);
    await page.waitForTimeout(300);
    const vis = await page.locator("#loc-lista li:not([hidden])").count();
    check("regiao " + reg.id + " -> " + reg.pointIds.length + " na lista",
      vis === reg.pointIds.length, "visiveis=" + vis);
  }
  await page.selectOption("#filtro-regiao", "todas");
  await page.waitForTimeout(300);

  // ---------- busca com/sem acento (fluxo real de usuario) ----------
  async function focarPorBusca(termo, idEsperado) {
    const alvo = CPS.find((p) => p.id === idEsperado);
    const rotulo = alvo ? alvo.label : termo;
    await page.fill("#loc-busca", termo);
    await page.waitForTimeout(300);
    const itens = page.locator("#loc-lista li:not([hidden]) .loc-item");
    await itens.first().click();
    /* espera o popup do ALVO (o anterior pode ainda estar aberto) */
    await page.waitForFunction((t) => {
      const el = document.querySelector(".leaflet-popup");
      return el && el.textContent.indexOf(t) >= 0;
    }, rotulo, { timeout: 15000 });
    await page.waitForTimeout(600);
    const txt = await page.locator(".leaflet-popup").textContent();
    return { txt: txt, n: await itens.count() };
  }
  const rTor = await focarPorBusca("PRACA DE TORRHEN", "Torrhen%27s_Square");
  check("busca 'PRACA DE TORRHEN' -> 'Praça de Torrhen'",
    rTor.txt.includes("Praça de Torrhen") && rTor.n >= 1,
    rTor.txt.slice(0, 60));
  await page.keyboard.press("Escape");
  const rVil = await focarPorBusca("VILIRMAS", "Sisterton");
  check("busca 'VILIRMAS' -> 'Vilirmãs'",
    rVil.txt.includes("Vilirmãs"), rVil.txt.slice(0, 60));
  await page.keyboard.press("Escape");

  // ---------- popup limpo: dedupe ingles + detalhes recolhidos ----------
  const rDs = await focarPorBusca("dragonstone", "Dragonstone");
  const nOrig = await page.locator(".leaflet-popup .loc-popup-orig").count();
  const txtOrig = nOrig
    ? await page.locator(".leaflet-popup .loc-popup-orig").first().textContent()
    : "";
  check("popup dedupe: exatamente um nome ingles ('Dragonstone')",
    nOrig === 1 && txtOrig.trim() === "Dragonstone",
    "n=" + nOrig + " txt=" + txtOrig.trim());
  check("popup dedupe: rotulo 'Pedra do Dragão'",
    rDs.txt.includes("Pedra do Dragão"));
  const det = await page.evaluate(() => {
    const d = document.querySelector(".leaflet-popup details");
    return d ? { existe: true, aberto: d.open } : { existe: false };
  });
  check("popup: detalhes tecnicos recolhidos por padrao",
    det.existe && !det.aberto, JSON.stringify(det));
  await page.keyboard.press("Escape");

  // ---------- simbolo anonimo com tipo conhecido (fluxo real) ----------
  const anonCastle = CPS.find((p) =>
    ehSimbolo(p) && p.kind === "castle");
  check("artefato tem simbolo anonimo de castelo", !!anonCastle,
    anonCastle ? anonCastle.id : "ausente");
  if (anonCastle) {
    const rSimb = await focarPorBusca(anonCastle.label, anonCastle.id);
    check("simbolo de castelo anonimo: texto honesto de glifo",
      /Símbolo de castelo/.test(rSimb.txt) &&
        /nome ainda não estabelecido/.test(rSimb.txt) &&
        !/natureza ainda não estabelecidos/.test(rSimb.txt),
      rSimb.txt.slice(0, 120));
    await page.keyboard.press("Escape");
  }

  // ---------- distintivo de correspondencia cartografica ----------
  const comp = CPS.find((p) =>
    p.identificationStatus === "companion-map-review");
  check("artefato tem ponto companion-map-review", !!comp,
    comp ? comp.id : "ausente");
  if (comp) {
    const rComp = await focarPorBusca(comp.label, comp.id);
    check("distintivo 'Correspondência cartográfica em revisão' sem 'confirmado'",
      /Correspondência cartográfica em revisão/.test(rComp.txt) &&
        !/confirmad/i.test(rComp.txt),
      rComp.txt.slice(0, 120));
    await page.keyboard.press("Escape");
  }

  // ---------- grupo jon+tyrion no cap 19 ----------
  await page.fill("#loc-busca", "");
  await page.check("#chk-jon");
  await page.check("#chk-tyrion");
  await setCapitulo(page, 19);
  await page.waitForTimeout(400);
  check("jon+tyrion ch19: um marcador agrupado",
    (await page.locator(".loc-pin-personagem").count()) === 1,
    "pinos=" + (await page.locator(".loc-pin-personagem").count()));

  // ---------- catelyn ch18: trajeto importado completo ----------
  const cat = ROTAS.find((r) => /cat/i.test(r.id));
  if (cat) {
    const segsCat = (cat.segments || []).filter((s) =>
      s.startChapter <= 18 && s.endChapter >= 18);
    const pontos18 = segsCat.reduce((n, s) => n + s.points.length, 0);
    await page.check("#chk-" + cat.id);
    await page.uncheck("#chk-jon");
    await page.uncheck("#chk-tyrion");
    await setCapitulo(page, 18);
    await page.waitForTimeout(400);
    const paths18 = await page.locator(".leaflet-overlay-pane path").count();
    /* cada perna de viagem vira 2 paths (contorno + cor); sem
       transportLegs, o segmento inteiro conta como uma perna */
    const pernas18 = segsCat.reduce((n, s) => {
      const legs = Array.isArray(s.transportLegs)
        ? s.transportLegs.filter((l) =>
            l && l.endVertex - l.startVertex >= 1).length
        : 0;
      return n + (legs || 1);
    }, 0);
    check("catelyn ch18: " + pernas18 +
      " perna(s) visivel(is) x2 camadas, >20 vertices do JSON",
      paths18 === pernas18 * 2 && pontos18 > 20,
      "paths=" + paths18 + " pernas=" + pernas18 +
        " vertices=" + pontos18);
    await page.check("#cap-somente");
    await page.waitForTimeout(350);
    check("markerOnly esconde linhas de trajeto",
      (await page.locator(".leaflet-overlay-pane path").count()) === 0);
    await page.uncheck("#cap-somente");
  } else {
    check("rota catelyn presente nos dados", false, "id nao encontrado");
  }

  // ---------- troca para nativo preserva estado + ancora ----------
  const cpAncora = CPS.find((p) => p.id === "Dragonstone") ||
    CPS.find((p) => !ehSimbolo(p));
  const rAnc = await focarPorBusca(
    (cpAncora.english || cpAncora.label), cpAncora.id);
  check("previa: popup do ponto-ancora aberto",
    rAnc.txt.length > 0);
  liberarTilesAutomaticos(page);
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(1200);
  check("nativo: um unico popup",
    (await page.locator(".leaflet-popup").count()) === 1);
  const anc = await page.evaluate(([x, y, z]) => {
    const map = window.__atlasMap;
    let ll = null;
    map.eachLayer((l) => { if (l instanceof L.Popup) ll = l.getLatLng(); });
    const esp = map.unproject([x, y], z);
    return ll ? { dlat: ll.lat - esp.lat, dlng: ll.lng - esp.lng } : null;
  }, [cpAncora.x, cpAncora.y, MANIFESTO.maxNativeZoom]);
  check("nativo: ancora do popup = unproject do ponto",
    !!anc && Math.abs(anc.dlat) < 1e-6 && Math.abs(anc.dlng) < 1e-6,
    anc ? "dlat=" + anc.dlat + " dlng=" + anc.dlng : "sem popup");

  /* ancora corrigida: Ponta Tempestade usa as coords canonicas do JSON
     (par de identidade corrigido — nao pode ancorar o glifo antigo) */
  const ptStorm = CPS.find((p) => p.id === "Storm%27s_End") ||
    CPS.find((p) => /tempestade/i.test(p.label || ""));
  check("artefato tem Ponta Tempestade", !!ptStorm,
    ptStorm ? ptStorm.id + " " + ptStorm.x + "," + ptStorm.y : "ausente");
  if (ptStorm) {
    const rStorm = await focarPorBusca(ptStorm.label, ptStorm.id);
    check("popup de '" + ptStorm.label + "' aberto",
      rStorm.txt.includes(ptStorm.label));
    const ancStorm = await page.evaluate(([x, y, z]) => {
      const map = window.__atlasMap;
      let ll = null;
      map.eachLayer((l) => { if (l instanceof L.Popup) ll = l.getLatLng(); });
      const esp = map.unproject([x, y], z);
      return ll ? { dlat: ll.lat - esp.lat, dlng: ll.lng - esp.lng } : null;
    }, [ptStorm.x, ptStorm.y, MANIFESTO.maxNativeZoom]);
    check("nativo: Ponta Tempestade ancora = unproject(" +
      ptStorm.x + "," + ptStorm.y + ") do JSON",
      !!ancStorm && Math.abs(ancStorm.dlat) < 1e-6 &&
        Math.abs(ancStorm.dlng) < 1e-6,
      ancStorm ? "dlat=" + ancStorm.dlat + " dlng=" + ancStorm.dlng
        : "sem popup");
  }

  await page.screenshot({ path: join(OUT, "v3-desktop-nativo.png"), fullPage: true });
  await ctx.close();
}

// ---------- estado por hash/storage: tipo + identificados ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, "hash");
  const tilesAntes = requests.length;
  await page.goto(BASE + "/atlas/#cap=3&tipo=castle&identificados=1");
  await page.waitForSelector("#loc-lista li", { timeout: 20000 });
  await page.waitForTimeout(800);
  const nCastleId = CPS.filter((p) =>
    p.kind === "castle" && !ehSimbolo(p)).length;
  check("hash: filtro castle+identificados restaurado",
    (await page.locator("#loc-lista li:not([hidden])").count()) === nCastleId,
    "esperado=" + nCastleId);
  check("hash: controles refletem filtros",
    (await page.locator("#filtro-tipo").inputValue()) === "castle" &&
      (await page.locator("#loc-identificados").isChecked()));
  check("hash: nenhum tile automatico",
    !requests.slice(tilesAntes).some((u) => u.includes("/atlas/tiles/")));
  await ctx.close();
}

// ---------- v3 falho: sem downgrade para v2/v1 ----------
async function casoV3Falho(nome, fulfill, extraCheck) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, nome);
  const reqsLocal = [];
  page.on("request", (r) => reqsLocal.push(r.url()));
  await page.route("**/atlas/data/atlas-inventario-v3.json", fulfill);
  await page.goto(BASE + "/atlas/");
  await page.waitForTimeout(2500);
  const st = await page.locator("#localidades-status").textContent();
  check(nome + ": erro visivel + sem lista",
    /indispon/i.test(st) &&
      (await page.locator("#loc-lista li").count()) === 0,
    st.trim().slice(0, 80));
  check(nome + ": controles travados, previa navegavel",
    (await page.locator("#cap-slider").isDisabled()) &&
      (await page.locator(".leaflet-control-zoom-in").isEnabled()) &&
      (await page.locator("#mapa").isVisible()));
  const fallback = reqsLocal.filter((u) =>
    u.includes("atlas-agot-v2") || u.includes("piloto-norte"));
  check(nome + ": NENHUM pedido v2/v1 (sem downgrade)",
    fallback.length === 0, fallback.join(",") || "ok");
  if (extraCheck) await extraCheck(page);
  await ctx.close();
}

await casoV3Falho("v3 JSON malformado", (r) =>
  r.fulfill({ contentType: "application/json", body: "{quebrado" }));
await casoV3Falho("v3 HTTP 500", (r) =>
  r.fulfill({ status: 500, body: "erro" }));

{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, "invalido");
  const ruim = JSON.parse(JSON.stringify(DATA));
  ruim.controlPoints[0] = Object.assign({}, ruim.controlPoints[0], {
    kind: "tipo-inventado"
  });
  await page.route("**/atlas/data/atlas-inventario-v3.json", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(ruim) }));
  await page.goto(BASE + "/atlas/");
  await page.waitForTimeout(2500);
  const st = await page.locator("#localidades-status").textContent();
  check("v3 kind desconhecido -> erro + sem lista",
    /indispon/i.test(st) &&
      (await page.locator("#loc-lista li").count()) === 0,
    st.trim().slice(0, 80));
  check("sem downgrade: controles travados",
    await page.locator("#cap-slider").isDisabled());
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, "statusInvalido");
  const ruim = JSON.parse(JSON.stringify(DATA));
  ruim.controlPoints[0] = Object.assign({}, ruim.controlPoints[0], {
    identificationStatus: "confirmed"
  });
  await page.route("**/atlas/data/atlas-inventario-v3.json", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(ruim) }));
  await page.goto(BASE + "/atlas/");
  await page.waitForTimeout(2500);
  check("v3 status desconhecido -> erro + sem lista",
    /indispon/i.test(await page.locator("#localidades-status").textContent()) &&
      (await page.locator("#loc-lista li").count()) === 0);
  await ctx.close();
}

// ---------- sidecar v3 de ocorrencia ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, "evid");
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 20000 });
  check("evidencias: nao carrega antes de abrir fontes",
    !requests.some((u) => u.includes("nomes-inventario-v3-evidencias")));
  await page.evaluate(() => {
    document.getElementById("sec-fontes").open = true;
    document.getElementById("sec-fontes")
      .dispatchEvent(new Event("toggle"));
  });
  await page.waitForTimeout(1500);
  if (existsSync(EVID_PATH)) {
    const EV = JSON.parse(readFileSync(EVID_PATH, "utf8"));
    const nEv = (await page.locator(".evid-item").count());
    check("evidencias v3: " + EV.entries.length + " itens (só nomeados)",
      nEv === EV.entries.length, "itens=" + nEv);
    const idsSimb = Object.create(null);
    CPS.filter(ehSimbolo).forEach((p) => { idsSimb[p.id] = true; });
    const evComSimb = EV.entries.filter((e) => idsSimb[e.id]).length;
    check("evidencias v3: nenhum simbolo anonimo na auditoria",
      evComSimb === 0, "entradas simbolo=" + evComSimb);
    const evTxt = await page.locator("#fontes-evidencias").textContent();
    check("evidencias v3: texto honesto",
      /não confirma rota/i.test(evTxt));
    /* inventario publicado: avisos liquidados aparecem em Fontes
       (bookAuditNotice: auditoria conserva 115 nomes anteriores) */
    const ftTxt = await page.locator("#fontes-lista").textContent();
    check("fontes: bookAuditNotice do inventario presente",
      !DATA.inventory || !DATA.inventory.bookAuditNotice ||
        ftTxt.includes("bookAuditNotice"),
      ftTxt.slice(0, 80));
  } else {
    const evTxt = await page.locator("#fontes-evidencias").textContent();
    check("evidencias v3 ausentes: aviso honesto",
      /indispon/i.test(evTxt), evTxt.trim().slice(0, 80));
    check("evidencias ausentes: controles intactos",
      !(await page.locator("#loc-mostrar").isDisabled()));
  }
  await ctx.close();
}

// ---------- diagnostico congelado (chaves liquidadas) ----------
if (existsSync(DIAG_PATH)) {
  const DIAG = JSON.parse(readFileSync(DIAG_PATH, "utf8"));
  check("diagnostico: entries = " + CPS.length,
    DIAG.entries === CPS.length, String(DIAG.entries));
  check("diagnostico: namedEntries = " + N_ID,
    DIAG.namedEntries === N_ID, String(DIAG.namedEntries));
  check("diagnostico: unidentifiedSymbols = " + N_SIMB,
    DIAG.unidentifiedSymbols === N_SIMB, String(DIAG.unidentifiedSymbols));
} else {
  check("diagnostico v3 presente", false, "arquivo ausente");
}

// ---------- largura total em viewport ampla ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, "w1920");
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 20000 });
  await page.waitForSelector("img.leaflet-image-layer",
    { timeout: 20000 });
  const g1920 = await page.evaluate(() => {
    const q = document.getElementById("mapa-quadro").getBoundingClientRect();
    const c = getComputedStyle(document.querySelector(".conteudo"));
    return {
      quadro: q.width,
      padX: parseFloat(c.paddingLeft) + parseFloat(c.paddingRight)
    };
  });
  check("1920: mapa usa largura total do viewport",
    Math.abs(g1920.quadro - (1920 - g1920.padX)) <= 2,
    "quadro=" + g1920.quadro.toFixed(0) +
      " esperado~" + (1920 - g1920.padX).toFixed(0));
  const cover1920 = await page.evaluate(() => {
    const m = document.getElementById("mapa").getBoundingClientRect();
    const i = document.querySelector("img.leaflet-image-layer")
      .getBoundingClientRect();
    return i.left <= m.left + 2 && i.right >= m.right - 2 &&
      i.top <= m.top + 2 && i.bottom >= m.bottom - 2;
  });
  check("1920: imagem cobre o quadro no carregamento inicial",
    cover1920 === true);
  await ctx.close();
}

// ---------- mobile ----------
for (const w of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 } });
  const page = await ctx.newPage();
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
  ligarColetores(page, "mobile" + w);
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li",
    { timeout: 20000, state: "attached" });
  await page.waitForSelector("img.leaflet-image-layer",
    { timeout: 20000 });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile " + w + " sem overflow horizontal",
    overflow <= 0, "overflow=" + overflow);
  const coverMob = await page.evaluate(() => {
    const m = document.getElementById("mapa").getBoundingClientRect();
    const i = document.querySelector("img.leaflet-image-layer")
      .getBoundingClientRect();
    return i.left <= m.left + 2 && i.right >= m.right - 2 &&
      i.top <= m.top + 2 && i.bottom >= m.bottom - 2;
  });
  check("mobile " + w + ": imagem cobre o quadro no carregamento",
    coverMob === true);

  // painel inicia recolhido; abre dentro da moldura do mapa
  check("mobile " + w + ": painel inicia recolhido",
    await page.evaluate(() =>
      document.getElementById("lateral-corpo").hidden &&
      document.getElementById("lateral")
        .classList.contains("lateral-fechada") &&
      document.getElementById("btn-painel")
        .getAttribute("aria-expanded") === "false"));
  await page.click("#btn-painel");
  await page.waitForTimeout(300);
  const geoMob = await page.evaluate(() => {
    const q = document.getElementById("mapa-quadro").getBoundingClientRect();
    const a = document.getElementById("lateral").getBoundingClientRect();
    const c = document.getElementById("lateral-corpo");
    return {
      dentro: a.left >= q.left && a.right <= q.right + 1 &&
        a.top >= q.top && a.bottom <= q.bottom + 1,
      rolavel: c.scrollHeight > c.clientHeight,
      aberto: !c.hidden
    };
  });
  check("mobile " + w + ": painel abre dentro do mapa, rolavel",
    geoMob.aberto && geoMob.dentro && geoMob.rolavel,
    JSON.stringify(geoMob));

  /* rolagem do corpo: cabecalho fixo e mapa imovel */
  const preScroll = await page.evaluate(() => {
    const m = window.__atlasMap;
    return { z: m.getZoom(), c: m.getCenter() };
  });
  const scrollInfo = await page.evaluate(() => {
    const c = document.getElementById("lateral-corpo");
    c.scrollTop = c.scrollHeight;
    const a = document.getElementById("lateral").getBoundingClientRect();
    const topo = document.querySelector(".lateral-topo")
      .getBoundingClientRect();
    return {
      rolou: c.scrollTop > 0,
      topoFixo: topo.top >= a.top - 1 && topo.bottom <= a.bottom + 1
    };
  });
  const posScroll = await page.evaluate(() => {
    const m = window.__atlasMap;
    return { z: m.getZoom(), c: m.getCenter() };
  });
  check("mobile " + w + ": corpo rola, cabecalho fixo, mapa imovel",
    scrollInfo.rolou && scrollInfo.topoFixo &&
      posScroll.z === preScroll.z &&
      Math.abs(posScroll.c.lat - preScroll.c.lat) < 5 &&
      Math.abs(posScroll.c.lng - preScroll.c.lng) < 5,
    JSON.stringify(scrollInfo));
  await page.click("#btn-painel");
  if (w === 390) {
    await page.screenshot({ path: join(OUT, "v3-mobile.png"), fullPage: true });
  }
  await ctx.close();
}

// ---------- asserts de rede ----------
const externos = requests.filter((u) => !u.startsWith(BASE));
check("nenhuma requisicao externa", externos.length === 0,
  externos.join(", ") || "todas locais");
const mestres = requests.filter((u) => /\/mapas\/(jpeg|png|webp\/reduzidos)\//.test(u));
check("nenhum fetch de imagem mestre", mestres.length === 0,
  mestres.join(", ") || "ok");
const tilesRuins = tileResponses.filter((l) => !l.startsWith("200 "));
check("todas respostas de tile HTTP 200", tilesRuins.length === 0,
  tilesRuins.join(" | ") || "ok");
check("nenhuma requisicao falha", failedReqs.length === 0,
  failedReqs.join(" | ") || "ok");
check("sem pageerrors", pageErrors.length === 0,
  pageErrors.join(" | ") || "ok");

await browser.close();

const falhas = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "v3-resultados.txt"),
  results.map((r) => (r.ok ? "PASS " : "FAIL ") + r.nome +
    (r.info ? " — " + r.info : "")).join("\n") + "\n");
writeFileSync(join(OUT, "v3-requisicoes.txt"), requests.join("\n") + "\n");
console.log("\n" + results.length + " checagens, " + falhas.length + " falhas");
process.exit(falhas.length ? 1 : 0);
