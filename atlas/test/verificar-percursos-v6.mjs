// Percursos v6 REAIS — gate de navegador sobre o dataset publicado ou
// sobre o candidato congelado (--candidate usa bytes exatos via
// interceptacao, nunca publica). Uso:
//   node atlas/test/verificar-percursos-v6.mjs [--candidate]
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080";
const CANDIDATO = process.argv.includes("--candidate");

const SHA_CANDIDATO =
  "5677f7a5abaed8d0ad7bc724512c143d30a7d7489232294bd1dcb8ece33ee75d";
const SHA_SIDECAR_CAND =
  "8601f82315844a24fb80182472909f9b815684581d341de5272e00b8f0195991";

const DATA_PATH = join(DIR, "..", "data",
  CANDIDATO ? "atlas-percursos-v6-candidato.json"
    : "atlas-percursos-v6.json");
const SIDECAR_PATH = join(DIR, "..", "data",
  CANDIDATO ? "nomes-percursos-v6-evidencias-candidato.json"
    : "nomes-percursos-v6-evidencias.json");

if (!existsSync(DATA_PATH)) {
  console.log("STOP: " + (CANDIDATO
    ? "atlas-percursos-v6-candidato.json ausente."
    : "atlas-percursos-v6.json ainda nao publicado."));
  process.exit(1);
}
const DATA_BYTES = readFileSync(DATA_PATH);
const DATA = JSON.parse(DATA_BYTES.toString("utf8"));
const MAN = JSON.parse(
  readFileSync(join(DIR, "..", "data", "mapa.json"), "utf8"));

/* em modo candidato os bytes servidos sao exatamente os congelados —
   divergencia de hash interrompe antes de qualquer navegador */
if (CANDIDATO) {
  const h = createHash("sha256").update(DATA_BYTES).digest("hex");
  if (h !== SHA_CANDIDATO) {
    console.log("STOP: candidato divergente " + h);
    process.exit(1);
  }
  if (existsSync(SIDECAR_PATH)) {
    const hs = createHash("sha256")
      .update(readFileSync(SIDECAR_PATH)).digest("hex");
    if (hs !== SHA_SIDECAR_CAND) {
      console.log("STOP: sidecar candidato divergente " + hs);
      process.exit(1);
    }
  }
}

let browser = null;
const results = [];
const pageErrors = [];
const requests = [];
const tileResponses = [];
const failedReqs = [];

function check(name, ok, detail) {
  const linha = (ok ? "PASS" : "FAIL") + " " + name +
    (detail ? " — " + detail : "");
  results.push(linha);
  console.log(linha);
  return ok;
}

/* despeja resultados parciais se a suite abortar no meio */
function despejaParcial(e) {
  try {
    writeFileSync(join(OUT, "percursos-v6-resultados.txt"),
      results.join("\n") + "\n# ABORTADO: " +
        (e && e.message || e) + "\n");
  } catch {}
}

/* ---------- derivados do artefato (mecanico, sem rederivacao) ------ */
const rotas = {};
DATA.routes.forEach((r) => { rotas[r.id] = r; });
const segsV6 = (rid, cap) => rotas[rid].segments
  .filter((s) => s.id.includes("-v6-") && s.startChapter === cap);

/* fronteiras liquidadas: cada -v6- ausente em cap-1, presente em cap */
const FRONTEIRAS = [
  ["jon", 86], ["jon", 96],
  ["samwell", 86], ["samwell", 96],
  ["asha", 123], ["asha", 129],
  ["victarion", 123], ["victarion", 334],
  ["arya", 99], ["arya", 156], ["arya", 217],
  ["littlefinger", 138],
  ["theon", 291], ["theon", 303], ["theon", 308],
  ["aegon", 332],
  ["tyrion", 311], ["tyrion", 318]
];

/* capitulos a partir dos quais a posicao ja nao existe (corte) */
const CORTES = [
  ["robb", 194], ["catelyn", 194], ["eddard", 65],
  ["joffrey", 203], ["tywin", 220], ["robert", 49], ["renly", 106]
];

const vic123 = segsV6("victarion", 123)[0];
const aeg0 = segsV6("aegon", 332)[0];
const aeg1 = segsV6("aegon", 332)[1];
const tyr318 = segsV6("tyrion", 318)[0];

/* ---------- contrato do artefato (node, sem navegador) ------------- */
check("v6: datasetId atlas-saga-v6",
  DATA.datasetId === "atlas-saga-v6", DATA.datasetId);
check("v6: schemaVersion 2", DATA.schemaVersion === 2);
check("v6: 240 pontos de controle",
  DATA.controlPoints.length === 240, "n=" + DATA.controlPoints.length);
check("v6: 27 rotas", DATA.routes.length === 27,
  "n=" + DATA.routes.length);
check("v6: 133 segmentos",
  DATA.routes.reduce((n, r) => n + r.segments.length, 0) === 133);
check("v6: 157 posicoes",
  DATA.routes.reduce((n, r) => n + r.positions.length, 0) === 157);
check("v6: 5 livros nos limites liquidados",
  JSON.stringify(DATA.books.map((b) => [b.startChapter, b.endChapter]))
    === JSON.stringify([[0, 72], [73, 142], [143, 224], [225, 270],
      [271, 343]]));
check("v6: 344 capitulos", DATA.chapters.length === 344);
const coberturas = DATA.routes
  .reduce((n, r) => n + ((r.bookCoverage || []).length), 0);
check("v6: 135 celulas bookCoverage (27x5)",
  coberturas === 135, "n=" + coberturas);
check("v6: todas as 27 rotas tem bookCoverage",
  DATA.routes.every((r) => Array.isArray(r.bookCoverage) &&
    r.bookCoverage.length === 5));
const nDesc = DATA.controlPoints.filter(
  (p) => p.identificationStatus === "geographically-described").length;
const nMemb = DATA.controlPoints.filter(
  (p) => p.identificationStatus === "named-group-member").length;
check("v6: 18 descritos + 5 membros de conjunto (herdados)",
  nDesc === 18 && nMemb === 5, nDesc + "/" + nMemb);

/* cada fronteira tem exatamente os -v6- esperados no artefato */
for (const [cid, cap] of FRONTEIRAS) {
  const alvos = segsV6(cid, cap);
  const esperados = (cid === "aegon" || cid === "littlefinger") ? 2 : 1;
  check("fronteira: " + cid + "@" + cap + " tem " + esperados +
    " seg(s) -v6- no artefato",
    alvos.length === esperados, alvos.map((s) => s.id).join(","));
}
check("arianne: rota sem segmentos (Vaith cancelado)",
  rotas.arianne.segments.length === 0,
  "segs=" + rotas.arianne.segments.length);
check("dados: victarion@123 pernas mar/fluvial/terra",
  vic123 && JSON.stringify(
    (vic123.transportLegs || []).map((l) => l.mode))
    === JSON.stringify(["sea", "river", "land"]));
check("dados: aegon@332 misto fluvial+mar + terrestre com lacuna",
  aeg0 && aeg1 &&
  JSON.stringify((aeg0.transportLegs || []).map((l) => l.mode))
    === JSON.stringify(["river", "sea"]) &&
  aeg1.travelMode === "land" && aeg1.gapBefore === true);
check("dados: tyrion@311/318 pernas mar",
  segsV6("tyrion", 311).concat(segsV6("tyrion", 318))
    .every((s) => (s.transportLegs || [])
      .every((l) => l.mode === "sea")));

/* ---------- navegador ---------- */
/* todo o trafego de browser fica sob try/catch/finally: qualquer
   falha despeja parciais, propaga (exit!=0) e fecha o browser */
try {
browser = await chromium.launch();

async function novaPagina(vp, opts) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    if (!f || !/aborted/i.test(f.errorText)) {
      failedReqs.push(r.url());
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/tiles/")) {
      tileResponses.push(resp.status() + " " + resp.url());
    }
  });
  if (CANDIDATO) {
    /* somente as duas URLs v6 sao fixadas nos bytes congelados;
       todo o resto flui real (tiles, v5, portal) */
    await page.route("**/data/atlas-percursos-v6.json", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: DATA_BYTES }));
    if (existsSync(SIDECAR_PATH)) {
      await page.route(
        "**/data/nomes-percursos-v6-evidencias.json", (route) =>
          route.fulfill({
            status: 200, contentType: "application/json",
            body: readFileSync(SIDECAR_PATH) }));
    }
  }
  await page.goto((opts && opts.url) || BASE + "/atlas/",
    { waitUntil: "networkidle" });
  await page.waitForSelector("#lista-personagens input[type=checkbox]",
    { state: "attached", timeout: 45000 });
  return { ctx, page };
}

const livroDe = (cap) =>
  DATA.books.find((b) => cap >= b.startChapter && cap <= b.endChapter);

async function irPara(page, cap) {
  const lv = livroDe(cap);
  if (lv) {
    const atual = await page.evaluate(() =>
      document.querySelector("#livro-select").value);
    if (atual !== lv.id) {
      await page.selectOption("#livro-select", lv.id);
      await page.waitForTimeout(250);
    }
  }
  await page.selectOption("#cap-select", String(cap));
  await page.waitForTimeout(350);
}

async function solo(page, rtId) {
  await page.evaluate(() =>
    document.querySelector("#btn-limpar-sel").click());
  await page.waitForTimeout(250);
  await page.check("#chk-" + rtId);
  await page.waitForTimeout(350);
}

/* janelas puras no navegador: mesmo filtro do app, sem fallback de
   ultima posicao conhecida — rt e o objeto JSON do artefato */
const segsNoCap = (page, rt, cap) => page.evaluate(({ rt, cap }) =>
  window.GOTATLAS.pure.segmentosNoCapitulo(
    rt, cap, false, window.GOTCORE).map((s) => s.id),
  { rt, cap });
const posNoCap = (page, rt, cap) => page.evaluate(({ rt, cap }) => {
  const p = window.GOTATLAS.pure.posicaoNoCapitulo(
    rt, cap, false, window.GOTCORE);
  return p ? p.locationId : null;
}, { rt, cap });

/* polilinhas interativas (cor 4px) com tooltip e dash */
async function coletaLinhas(page) {
  return page.evaluate(() => {
    const out = [];
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Polyline && !(l instanceof L.Polygon) &&
          l.options.interactive && l.options.weight === 4) {
        out.push({
          dash: l.options.dashArray || null,
          pts: l.getLatLngs().map((p) => [p.lat, p.lng]),
          tip: l.getTooltip && l.getTooltip()
            ? l.getTooltip().getContent().textContent : ""
        });
      }
    });
    return out;
  });
}

/* projeta pontos nativos para latlng no zoom maximo */
const espNat = (page, pts) => page.evaluate((args) =>
  args.pts.map((pt) => {
    const ll = window.__atlasMap.unproject(pt, args.z);
    return [ll.lat, ll.lng];
  }), { pts, z: MAN.maxNativeZoom });

const casaSeq = (ptsA, ptsB, tol) =>
  ptsA.length === ptsB.length &&
  ptsA.every((pt, i) => Math.abs(pt[0] - ptsB[i][0]) < tol &&
    Math.abs(pt[1] - ptsB[i][1]) < tol);

/* casa uma perna (fatia de pontos nativos) com uma polilinha */
async function achaPerna(page, linhas, pts) {
  const esp = await espNat(page, pts);
  return linhas.find((ln) => casaSeq(ln.pts, esp, 1e-4)) || null;
}

const pinosPos = (page) => page.evaluate(() => {
  const out = [];
  window.__atlasMap.eachLayer((l) => {
    if (l instanceof L.Marker &&
        l.options.alt === "Posição de personagem") {
      out.push(l.options.title || "");
    }
  });
  return out;
});

/* ---------- caminho feliz ---------- */
{
  const { ctx, page } = await novaPagina(
    { width: 1366, height: 900 });

  const nota = await page.textContent("#localidades-nota");
  check("UI: dataset v6 carregado — 240 referências",
    /240 referências/.test(nota || ""), (nota || "").slice(0, 60));
  check("UI: 27 perfis selecionáveis",
    await page.locator("#lista-personagens input").count() === 27);
  check("UI: 5 livros no seletor",
    await page.locator("#livro-select option").count() === 5);
  check("UI: 27 rotulos de cobertura (um por rota)",
    await page.locator(".pers-cobertura").count() === 27);
  check("UI: nota de cobertura nao-vazia, sem % nem completude",
    await page.evaluate(() =>
      [...document.querySelectorAll(".pers-cobertura")]
        .every((sp) => sp.textContent.trim().length > 0 &&
          !/%|\bcompleto\b|\bcompleta\b/i.test(sp.textContent))));

  /* as 135 notas: cada rotulo pertence ao SEU personagem — le o
     .pers-cobertura dentro do li de cada #chk-{rid} e compara com o
     notice exato do livro selecionado; falha se o no nao existir */
  for (const lv of DATA.books) {
    await page.selectOption("#livro-select", lv.id);
    await page.waitForTimeout(250);
    let okLivro = true;
    let det = "";
    for (const rt of DATA.routes) {
      const esperado = (rt.bookCoverage
        .find((c) => c.bookId === lv.id) || {}).notice;
      const atual = await page.evaluate((rid) => {
        const cb = document.getElementById("chk-" + rid);
        const li = cb && cb.closest(".pers-item");
        const sp = li && li.querySelector(".pers-cobertura");
        return sp ? sp.textContent.trim() : null;
      }, rt.id);
      if (atual === null || atual !== (esperado || "").trim()) {
        okLivro = false;
        det = rt.id + " => " + JSON.stringify(atual);
        break;
      }
    }
    check("cobertura: notices exatos por personagem, livro " + lv.id,
      okLivro, det || "27/27 exatos");
  }

  /* fronteiras -v6- via filtro puro do app (mesma funcao do render) */
  for (const [cid, cap] of FRONTEIRAS) {
    const rt = rotas[cid];
    const alvos = segsV6(cid, cap).map((s) => s.id);
    const antes = await segsNoCap(page, rt, cap - 1);
    const depois = await segsNoCap(page, rt, cap);
    check("fronteira: " + cid + "@" + cap +
      " ausente em " + (cap - 1) + ", presente em " + cap,
      alvos.every((id) => !antes.includes(id)) &&
        alvos.every((id) => depois.includes(id)),
      "antes=" + antes.filter((i) => i.includes("-v6-")).join(",") +
        " depois=" + depois.filter((i) => i.includes("-v6-")).join(","));
  }

  /* posicoes de cena / cortes — janelas puras, sem fallback */
  check("pos: jon@86 em Brancarbor, nada em 85/87",
    await posNoCap(page, rotas.jon, 86) === "scan-v4-white-tree-glyph" &&
    await posNoCap(page, rotas.jon, 85) === null &&
    await posNoCap(page, rotas.jon, 87) === null);
  check("pos: samwell@86 em Brancarbor, nada em 85/87",
    await posNoCap(page, rotas.samwell, 86) ===
      "scan-v4-white-tree-glyph" &&
    await posNoCap(page, rotas.samwell, 85) === null &&
    await posNoCap(page, rotas.samwell, 87) === null);
  check("pos: arianne@238 em Lancassolar, nada em 237/239",
    await posNoCap(page, rotas.arianne, 238) === "Sunspear" &&
    await posNoCap(page, rotas.arianne, 237) === null &&
    await posNoCap(page, rotas.arianne, 239) === null);
  check("pos: LF retorno corrigido 138 (nada em 135-137)",
    await posNoCap(page, rotas.littlefinger, 135) === null &&
    await posNoCap(page, rotas.littlefinger, 136) === null &&
    await posNoCap(page, rotas.littlefinger, 137) === null &&
    await posNoCap(page, rotas.littlefinger, 138) === "King%27s_Landing");
  check("pos: aegon@332 no Poleiro, nada em 333 (cena)",
    await posNoCap(page, rotas.aegon, 332) === "scan-site-v4-300" &&
    await posNoCap(page, rotas.aegon, 333) === null);
  check("pos: tyrion NUNCA em Meereen (318/337/343)",
    await posNoCap(page, rotas.tyrion, 318) === null &&
    await posNoCap(page, rotas.tyrion, 337) === null &&
    await posNoCap(page, rotas.tyrion, 343) === null);
  check("pos: victarion@334 sem pino de cidade",
    await posNoCap(page, rotas.victarion, 334) === null);
  check("pos: theon fora de Winterfell apos 321",
    await posNoCap(page, rotas.theon, 322) === null);
  check("pos: jon fora de Castelo Negro apos 339",
    await posNoCap(page, rotas.jon, 340) === null);
  for (const [cid, cap] of CORTES) {
    check("corte: " + cid + " sem pino em " + cap,
      await posNoCap(page, rotas[cid], cap) === null);
  }

  /* livros: limites liquidados + 'Ver livro completo' para no livro;
     o botao so habilita com ao menos um personagem selecionado */
  await page.check("#chk-jon");
  await page.selectOption("#livro-select", "acok");
  await page.waitForTimeout(300);
  const lim = await page.evaluate(() => ({
    min: document.querySelector("#cap-slider").min,
    max: document.querySelector("#cap-slider").max,
    cap: document.querySelector("#cap-slider").value
  }));
  check("livros: ACOK limita 73..142 e salta ao inicio, nao ao fim",
    lim.min === "73" && lim.max === "142" && lim.cap === "73",
    JSON.stringify(lim));
  await page.click("#btn-livro-completo");
  await page.waitForTimeout(300);
  check("livros: 'Ver livro completo' para no fim do LIVRO (142)",
    await page.evaluate(() =>
      document.querySelector("#cap-slider").value === "142"));
  await page.selectOption("#livro-select", "adwd");
  await page.waitForTimeout(300);
  await page.click("#btn-livro-completo");
  await page.waitForTimeout(300);
  check("livros: 'Ver livro completo' em ADWD vai a 343",
    await page.evaluate(() =>
      document.querySelector("#cap-slider").value === "343"));

  /* fluxo Asha: 122 -> 123 -> 124 -> 129 em DOM real */
  await page.selectOption("#livro-select", "acok");
  await page.waitForTimeout(250);
  await solo(page, "asha");
  /* troca de livro preserva os personagens selecionados */
  await page.selectOption("#livro-select", "agot");
  await page.waitForTimeout(250);
  await page.selectOption("#livro-select", "acok");
  await page.waitForTimeout(250);
  check("livros: troca de livro preserva selecao (asha marcada)",
    await page.evaluate(() =>
      document.querySelector("#chk-asha").checked === true));
  await irPara(page, 122);
  const lins122 = await page.evaluate(() => {
    let n = 0;
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Polyline && l.options.interactive &&
          l.options.weight === 4) n++;
    });
    return n;
  });
  check("asha@122: nenhuma linha de percurso nova ainda",
    lins122 === 0, "linhas=" + lins122);
  await irPara(page, 123);
  check("asha@123: pino de cena em Bosque Profundo",
    (await pinosPos(page)).some((t) => /asha/i.test(t)),
    (await pinosPos(page)).join(" | ").slice(0, 80));
  await irPara(page, 124);
  check("asha@124: pino de cena some (sem presenca continua)",
    !(await pinosPos(page)).some((t) => /asha/i.test(t)),
    (await pinosPos(page)).join(" | ").slice(0, 80) || "ok");
  await irPara(page, 129);
  check("asha@129: pino em Winterfell",
    (await pinosPos(page)).some((t) => /asha/i.test(t)),
    (await pinosPos(page)).join(" | ").slice(0, 80));

  /* rotulo de modo misto exibe as pernas declaradas */
  await irPara(page, 123);
  const tipsAsha = await page.evaluate(() => {
    const out = [];
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Polyline && l.options.interactive &&
          l.options.weight === 4 && l.getTooltip()) {
        out.push(l.getTooltip().getContent().textContent);
      }
    });
    return out;
  });
  check("asha@123: tooltip misto exibe 'mar + terra'",
    tipsAsha.some((t) =>
      /misto \(mar \+ terra\)/.test(t)),
    tipsAsha.join(" | ").slice(0, 120));

  /* popup do trecho de 123 nao antecipa destino futuro */
  await irPara(page, 123);
  await page.locator(".leaflet-popup-close-button")
    .click({ timeout: 2500 }).catch(() => {});
  const abriuPop = await page.evaluate(() => {
    let ok = false;
    window.__atlasMap.eachLayer((l) => {
      if (!ok && l instanceof L.Polyline && l.options.interactive &&
          l.options.weight === 4) {
        l.fire("click", { latlng: l.getLatLngs()[0] });
        ok = true;
      }
    });
    return ok;
  });
  await page.waitForSelector(".leaflet-popup",
    { state: "visible", timeout: 8000 }).catch(() => {});
  const txtPop = await page.locator(".leaflet-popup")
    .textContent().catch(() => "");
  check("asha@123: popup do trecho nao antecipa Winterfell",
    !!txtPop && !/winterfell/i.test(txtPop),
    (txtPop || "sem popup").slice(0, 90));
  await page.locator(".leaflet-popup-close-button")
    .click({ timeout: 2500 }).catch(() => {});

  /* busca preservada */
  await page.fill("#loc-busca", "Griffin's Roost");
  await page.waitForTimeout(400);
  const grifo = await page.evaluate(() =>
    [...document.querySelectorAll("#loc-lista li:not([hidden])")]
      .map((l) => l._ponto && l._ponto.id).filter(Boolean));
  check("busca 'Griffin's Roost' resolve o ponto corrigido",
    JSON.stringify(grifo) === JSON.stringify(["scan-site-v4-300"]),
    JSON.stringify(grifo));
  await page.fill("#loc-busca", "Sinistres Gris");
  await page.waitForTimeout(400);
  const gris = await page.evaluate(() =>
    [...document.querySelectorAll("#loc-lista li:not([hidden])")]
      .map((l) => l._ponto && l._ponto.id).filter(Boolean));
  check("busca 'Sinistres Gris' resolve Ghaston Grey",
    JSON.stringify(gris) === JSON.stringify(["scan-site-v4-475"]),
    JSON.stringify(gris));
  await page.fill("#loc-busca", "");
  await page.waitForTimeout(300);

  /* filtro identificados preservado */
  const idsDesc = new Set(DATA.controlPoints
    .filter((p) => p.identificationStatus === "geographically-described")
    .map((p) => p.id));
  const idsMemb = new Set(DATA.controlPoints
    .filter((p) => p.identificationStatus === "named-group-member")
    .map((p) => p.id));
  await page.check("#loc-identificados");
  await page.waitForTimeout(400);
  const visIds = await page.evaluate(() =>
    [...document.querySelectorAll("#loc-lista li:not([hidden])")]
      .map((l) => l._ponto && l._ponto.id).filter(Boolean));
  check("filtro: 18 descritos ocultos, 5 membros mantidos",
    visIds.every((id) => !idsDesc.has(id)) &&
      [...idsMemb].every((id) => visIds.includes(id)),
    "visiveis=" + visIds.length);
  await page.uncheck("#loc-identificados");
  await page.waitForTimeout(300);

  /* Fontes: sidecar v6 so sob demanda, 115 registros historicos */
  const pediuEvid = () =>
    requests.some((u) => u.includes("percursos-v6-evidencias"));
  check("fontes: sidecar v6 nao carrega antes de abrir",
    !pediuEvid());
  await page.evaluate(() => {
    document.getElementById("sec-fontes").open = true;
    document.getElementById("sec-fontes")
      .dispatchEvent(new Event("toggle"));
  });
  await page.waitForFunction(() =>
    document.querySelectorAll(".evid-item").length > 0 ||
      /indispon/i.test(
        document.querySelector("#fontes-evidencias").textContent),
    null, { timeout: 15000 }).catch(() => {});
  const nEvid = await page.locator(".evid-item").count();
  check("fontes: sidecar v6 com 115 registros historicos",
    pediuEvid() && nEvid === 115, "itens=" + nEvid);
  const evTxt = await page.locator("#fontes-evidencias").textContent();
  check("fontes: sem nova certificacao de nomes",
    /não amplia|históric|LeYa|não certifica/i.test(evTxt || ""),
    (evTxt || "").slice(0, 80));

  await page.screenshot(
    { path: join(OUT, "percursos-v6-desktop.png") });
  await ctx.close();
}

/* ---------- nativo: pernas mistas, aegon separado, tyrion ---------- */
{
  const { ctx, page } = await novaPagina(
    { width: 1366, height: 900 });
  /* nativo sobe sozinho no boot — espera os tiles como ponto de
     sincronia antes das leituras de geometria */
  await page.waitForSelector("img.leaflet-tile-loaded",
    { timeout: 30000 });

  /* victarion@123: 3 pernas reais mar/fluvial/terra */
  await solo(page, "victarion");
  await irPara(page, 123);
  await page.waitForTimeout(600);
  const pernasVic = vic123.transportLegs.map((l) =>
    vic123.points.slice(l.startVertex, l.endVertex + 1));
  const linhasV = await coletaLinhas(page);
  const detalhes = [];
  for (let i = 0; i < pernasVic.length; i++) {
    const alvo = await achaPerna(page, linhasV, pernasVic[i]);
    if (!alvo) {
      detalhes.push("perna " + i + " ausente");
    } else {
      const esperado =
        vic123.transportLegs[i].mode === "sea" ? "3 7" : "8 5";
      if (alvo.dash !== esperado) {
        detalhes.push("perna " + i + " dash=" + alvo.dash);
      }
    }
  }
  check("nativo: victarion@123 renderiza as 3 pernas mar/fluvial/terra",
    pernasVic.length === 3 && detalhes.length === 0,
    detalhes.join("; ") || "3 pernas ok");
  check("nativo: tooltip misto exibe 'mar + fluvial + terra'",
    linhasV.some((ln) =>
      /misto \(mar \+ fluvial \+ terra\)/.test(ln.tip)),
    (linhasV.map((l) => l.tip).join(" | ") || "sem tip")
      .slice(0, 130));
  await page.screenshot(
    { path: join(OUT, "percursos-v6-vic123.png") });

  /* aegon: nada antes de 332; em 332 duas feicoes separadas */
  const aeg331 = await segsNoCap(page, rotas.aegon, 331);
  check("aegon@331: nenhum -v6- elegivel",
    aeg331.filter((i) => i.includes("-v6-")).length === 0,
    aeg331.join(","));
  await solo(page, "aegon");
  await irPara(page, 331);
  await page.waitForTimeout(500);
  const nLin331 = (await coletaLinhas(page)).length;
  await irPara(page, 332);
  await page.waitForTimeout(600);
  const lins332 = await coletaLinhas(page);
  check("nativo: aegon 331->332 adiciona exatamente as 3 pernas novas",
    lins332.length === nLin331 + 3,
    nLin331 + " -> " + lins332.length);
  const pernasAeg = aeg0.transportLegs.map((l) =>
    aeg0.points.slice(l.startVertex, l.endVertex + 1))
    .concat(aeg1.transportLegs.map((l) =>
      aeg1.points.slice(l.startVertex, l.endVertex + 1)));
  let casaAeg = 0;
  for (const perna of pernasAeg) {
    if (await achaPerna(page, lins332, perna)) casaAeg++;
  }
  check("nativo: aegon@332 renderiza fluvial+mar e a perna terrestre",
    casaAeg === 3, "pernas renderizadas=" + casaAeg + "/3");
  check("nativo: aegon@332 tooltip misto exibe 'fluvial + mar'",
    lins332.some((ln) =>
      /misto \(fluvial \+ mar\)/.test(ln.tip)),
    (lins332.map((l) => l.tip).join(" | ") || "sem tip")
      .slice(0, 130));
  /* lacuna honesta: nenhuma linha liga o fim da aproximacao maritima
     ao inicio do corredor terrestre */
  const espPonte = await espNat(page,
    [aeg0.points[aeg0.points.length - 1], aeg1.points[0]]);
  const temPonte = lins332.some((ln) =>
    ln.pts.length === 2 && casaSeq(ln.pts, espPonte, 1e-4));
  check("nativo: nenhuma linha automatica liga mar->terra (gapBefore)",
    !temPonte);
  await page.evaluate((args) => {
    const pts = args.flat.map((p) =>
      window.__atlasMap.unproject(p, args.z));
    window.__atlasMap.fitBounds(L.latLngBounds(pts),
      { padding: [40, 40] });
  }, { flat: aeg0.points.concat(aeg1.points), z: MAN.maxNativeZoom });
  await page.waitForTimeout(800);
  await page.screenshot(
    { path: join(OUT, "percursos-v6-aegon332.png") });

  /* tyrion: 310 sem nada, 311 golfo, 318 foz fora de Meereen */
  const tyr310 = await segsNoCap(page, rotas.tyrion, 310);
  check("tyrion@310: nenhum -v6- elegivel",
    tyr310.filter((i) => i.includes("-v6-")).length === 0,
    tyr310.join(","));
  await solo(page, "tyrion");
  await irPara(page, 311);
  await page.waitForTimeout(600);
  const lins311 = await coletaLinhas(page);
  const tyr311 = segsV6("tyrion", 311)[0];
  const perna311 = tyr311.transportLegs.map((l) =>
    tyr311.points.slice(l.startVertex, l.endVertex + 1))[0];
  check("nativo: tyrion@311 perna mar no Golfo renderizada",
    !!(await achaPerna(page, lins311, perna311)),
    "linhas=" + lins311.length);
  await irPara(page, 318);
  await page.waitForTimeout(600);
  const linsT = await coletaLinhas(page);
  const tPerna = tyr318.transportLegs.map((l) =>
    tyr318.points.slice(l.startVertex, l.endVertex + 1))[0];
  const linhaT = await achaPerna(page, linsT, tPerna);
  check("nativo: tyrion@318 perna mar ate a foz renderizada",
    !!linhaT);
  if (linhaT) {
    /* clique na perna exata do trecho 318 (nao em qualquer linha) */
    await page.evaluate((args) => {
      window.__atlasMap.eachLayer((l) => {
        if (l instanceof L.Polyline && l.options.interactive &&
            l.options.weight === 4) {
          const a = l.getLatLngs()[0];
          const b = l.getLatLngs()[l.getLatLngs().length - 1];
          if (Math.abs(a.lat - args.p0[0]) < 1e-4 &&
              Math.abs(a.lng - args.p0[1]) < 1e-4 &&
              Math.abs(b.lat - args.p1[0]) < 1e-4 &&
              Math.abs(b.lng - args.p1[1]) < 1e-4) {
            l.fire("click", { latlng: l.getLatLngs()[0] });
          }
        }
      });
    }, { p0: linhaT.pts[0], p1: linhaT.pts[linhaT.pts.length - 1] });
    await page.waitForSelector(".leaflet-popup",
      { state: "visible", timeout: 8000 }).catch(() => {});
    const tp = await page.locator(".leaflet-popup")
      .textContent().catch(() => "");
    check("tyrion@318: popup declara 'fora' de Meereen",
      /fora/i.test(tp || ""), (tp || "").slice(0, 90));
    check("tyrion@318: popup mantem incerteza (aproximado/nao exato)",
      /aproximad|não é posição exata|medida/i.test(tp || ""),
      (tp || "").slice(0, 90));
    await page.locator(".leaflet-popup-close-button")
      .click({ timeout: 2500 }).catch(() => {});
  }
  await page.screenshot(
    { path: join(OUT, "percursos-v6-tyrion318.png") });
  await ctx.close();
}

/* ---------- mobile 390/320 ---------- */
for (const largura of [390, 320]) {
  const { ctx, page } = await novaPagina(
    { width: largura, height: largura === 390 ? 844 : 720 });
  await page.screenshot(
    { path: join(OUT, "percursos-v6-mobile-" + largura +
      "-recolhido.png") });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth -
      document.documentElement.clientWidth);
  check("mobile " + largura + ": sem overflow horizontal",
    overflow <= 0, "overflow=" + overflow);
  await page.evaluate(() =>
    document.querySelector("#btn-painel").click());
  await page.waitForTimeout(400);
  check("mobile " + largura + ": livro-select acessivel apos expandir",
    await page.evaluate(() => {
      const s = document.querySelector("#livro-select");
      return s && !s.hidden &&
        s.getBoundingClientRect().width > 0;
    }));
  check("mobile " + largura + ": 27 notas de cobertura presentes",
    await page.locator(".pers-cobertura").count() === 27);
  await page.selectOption("#livro-select", "adwd");
  await page.waitForTimeout(300);
  check("mobile " + largura + ": ADWD vai ao cap. 271",
    await page.evaluate(() =>
      document.querySelector("#cap-slider").value === "271"));
  await page.screenshot(
    { path: join(OUT, "percursos-v6-mobile-" + largura +
      "-expandido.png") });
  await ctx.close();
}

/* ---------- v6 PRESENTE invalido/500: falha fechado ---------------- */
for (const [nome, fulfill] of [
  ["v6 invalido", { status: 200, contentType: "application/json",
    body: JSON.stringify({ schemaVersion: 2, datasetId: "atlas-saga-v6",
      mapId: "o-mundo-conhecido",
      tileSetId: "o-mundo-conhecido-recorte-v1",
      sourceSha256: "0".repeat(64),
      coordinateSystem: "cropped-native-pixels",
      mapWidth: 21654, mapHeight: 14428,
      cropBoxOriented: [0, 2336, 21654, 16764],
      chapters: [{ index: 0 }, { index: 9 }],
      controlPoints: [{ id: "x", x: 1, y: 1 }] }) }],
  ["v6 HTTP 500", { status: 500, body: "erro" }]
]) {
  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  let pediuAntigo = false;
  page.on("request", (r) => {
    if (/inventario-v5|inventario-v4|inventario-v3|atlas-agot-v2|piloto-norte/
        .test(r.url())) {
      pediuAntigo = true;
    }
  });
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill(fulfill));
  await page.goto(BASE + "/atlas/");
  let st = "";
  try {
    await page.waitForFunction(() => {
      const s = document.querySelector("#localidades-status");
      return s && /indisponíveis|inválid|erro/i.test(s.textContent);
    }, null, { timeout: 15000 });
  } catch {}
  st = await page.textContent("#localidades-status");
  check(nome + ": status indisponível/erro",
    /indisponíveis|inválid|erro/i.test(st || ""),
    (st || "(vazio)").slice(0, 80));
  check(nome + ": controles travados, livro oculto",
    await page.evaluate(() =>
      document.querySelector("#loc-busca").disabled &&
      document.querySelector("#livro-select").hidden));
  check(nome + ": NUNCA requisita v5/v4/v3/v2/v1",
    pediuAntigo === false);
  check(nome + ": sem pageerror fatal",
    errs.length === 0, errs.slice(0, 1).join(" | "));
  await ctx.close();
}

/* ---------- v6 404 explicito: cai para o v5 real ------------------- */
{
  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const invResps = [];
  page.on("response", (r) => {
    if (/inventario|percursos|piloto|agot/.test(r.url())) {
      invResps.push(r.status() + " " + r.url().split("/").pop());
    }
  });
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#lista-personagens input[type=checkbox]",
    { state: "attached", timeout: 45000 });
  const nota = await page.textContent("#localidades-nota");
  check("v6 404: fallback carrega v5 real (240 referências)",
    /240 referências/.test(nota || ""), (nota || "").slice(0, 60));
  check("v6 404: resposta foi 404 do v6 + 200 do v5",
    invResps.some((s) => /^404 atlas-percursos-v6/.test(s)) &&
      invResps.some((s) => /^200 atlas-inventario-v5/.test(s)),
    invResps.join(", "));
  check("v6 404: sem rotulos de cobertura no v5 (campo ausente)",
    await page.locator(".pers-cobertura").count() === 0);
  check("v6 404: livro-select funciona no fallback",
    await page.evaluate(() =>
      !document.querySelector("#livro-select").hidden));
  await ctx.close();
}

/* ---------- higiene de rede/erros + smoke do portal ---------------- */
{
  const ext = requests.filter((u) => !u.includes("127.0.0.1"));
  check("nenhuma requisição externa", ext.length === 0,
    ext.slice(0, 3).join(", ") || "ok");
  const mestres = requests.filter((u) =>
    /mapas\/jpeg|master|original/i.test(u));
  check("nenhum fetch de imagem mestre", mestres.length === 0,
    mestres.join(", ") || "ok");
  check("tiles realmente requisitados no nativo",
    tileResponses.length > 0, "n=" + tileResponses.length);
  check("todas respostas de tile HTTP 200",
    tileResponses.every((t) => t.startsWith("200 ")),
    tileResponses.filter((t) => !t.startsWith("200 "))
      .slice(0, 3).join(", ") || "ok");
  check("nenhuma requisição falha", failedReqs.length === 0,
    failedReqs.slice(0, 3).join(", ") || "ok");
  check("sem pageerrors", pageErrors.length === 0,
    pageErrors.slice(0, 2).join(" | "));

  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const resp = await page.goto(
    BASE + "/", { waitUntil: "domcontentloaded" });
  check("portal raiz responde 200", resp && resp.status() === 200,
    "status=" + (resp && resp.status()));
  check("portal raiz: titulo preservado",
    /Mapa de As Crônicas de Gelo e Fogo/i.test(
      (await page.title()) || ""));
  check("portal raiz: sem pageerrors", errs.length === 0,
    errs.slice(0, 1).join(" | "));
  await ctx.close();
}

await browser.close();
browser = null;
} catch (e) {
  despejaParcial(e);
  throw e;
} finally {
  if (browser) await browser.close();
}
writeFileSync(join(OUT, "percursos-v6-resultados.txt"),
  results.join("\n") + "\n");
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
