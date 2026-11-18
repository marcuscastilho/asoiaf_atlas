// Percursos v7 — itinerarios continuos por personagem.
// Duas camadas:
//   1) invariantes do artefato (node): cobertura de posicoes, continuidade
//      de segmentos, monotonicidade, ids resolviveis — cruza o JSON com
//      as paradas da fonte em percursos-v7-diagnostico.json;
//   2) navegador: marcadores por capitulo (Arya/Jon/Daenerys), cadeia
//      polilinha conectada, overlay pontilhado amarelo em trecho deduzido,
//      higiene de rede/erros.
// Uso: node atlas/test/verificar-percursos-v7.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080";
const DATA_PATH = join(DIR, "..", "data", "atlas-percursos-v7.json");
const DIAG_PATH = join(DIR, "..", "data", "percursos-v7-diagnostico.json");

if (!existsSync(DATA_PATH) || !existsSync(DIAG_PATH)) {
  console.log("STOP: atlas-percursos-v7.json/diagnostico ausente — rode o builder.");
  process.exit(1);
}
const DATA = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const DIAG = JSON.parse(readFileSync(DIAG_PATH, "utf8"));
const MAN = JSON.parse(
  readFileSync(join(DIR, "..", "data", "mapa.json"), "utf8"));

const results = [];
const pageErrors = [];
const requests = [];
const failedReqs = [];

function check(name, ok, detail) {
  const linha = (ok ? "PASS" : "FAIL") + " " + name +
    (detail ? " — " + detail : "");
  results.push(linha);
  console.log(linha);
  return ok;
}

const cps = {};
DATA.controlPoints.forEach((p) => { cps[p.id] = p; });
const wdiag = {};
(DIAG.waypoints || []).forEach((w) => { wdiag[w.id] = w; });

function coordsDe(at) {
  if (at.startsWith("w:")) {
    const w = wdiag[at];
    return w ? w.final : null;
  }
  const p = cps[at];
  return p ? [p.x, p.y] : null;
}
const eq = (a, b) => !!a && !!b &&
  Math.abs(a[0] - b[0]) <= 0.51 && Math.abs(a[1] - b[1]) <= 0.51;

/* ---------- contrato do artefato (node, sem navegador) ------------- */
check("v7: datasetId atlas-saga-v7",
  DATA.datasetId === "atlas-saga-v7", DATA.datasetId);
check("v7: 242 pontos de controle (240 v6 + 2 auditoria)",
  DATA.controlPoints.length === 242, "n=" + DATA.controlPoints.length);
check("v7: 27 rotas", DATA.routes.length === 27,
  "n=" + DATA.routes.length);
check("v7: 344 capitulos", DATA.chapters.length === 344);
check("v7: 5 livros nos limites liquidados",
  JSON.stringify(DATA.books.map((b) => [b.startChapter, b.endChapter]))
    === JSON.stringify([[0, 72], [73, 142], [143, 224], [225, 270],
      [271, 343]]));

let nSegs = 0, nPos = 0, nWpos = 0;
for (const rt of DATA.routes) {
  const f = DIAG.fonte && DIAG.fonte[rt.id];
  if (!f) { check("v7 " + rt.id + ": fonte no diagnostico", false); continue; }
  const stops = f.stops;
  const limite = f.death == null ? 343 : f.death;
  nSegs += rt.segments.length;
  nPos += rt.positions.length;

  /* cobertura: uma posicao por capitulo de stops[0].ch ate limite,
     contigua e sem buraco */
  const poss = rt.positions;
  let cobOk = poss.length > 0 &&
    poss[0].startChapter === stops[0].ch &&
    poss[poss.length - 1].endChapter === limite;
  for (let i = 1; i < poss.length; i++) {
    if (poss[i].startChapter !== poss[i - 1].endChapter + 1) cobOk = false;
  }
  check(rt.id + ": posicoes cobrem cap. " + stops[0].ch + "–" + limite +
    " contiguamente", cobOk,
    poss.length + " posicoes");

  /* todo capitulo coberto por exatamente uma posicao */
  const vistos = new Map();
  poss.forEach((p) => {
    for (let c = p.startChapter; c <= p.endChapter; c++) {
      vistos.set(c, (vistos.get(c) || 0) + 1);
    }
  });
  let dup = 0, fora = 0;
  vistos.forEach((n, c) => {
    if (n !== 1) dup++;
    if (c < stops[0].ch || c > limite) fora++;
  });
  check(rt.id + ": exatamente 1 posicao/capitulo dentro do intervalo",
    dup === 0 && fora === 0, "dup=" + dup + " fora=" + fora);

  /* ids: paradas e posicoes resolvem; waypoints trazem x/y/label */
  let idsOk = true;
  stops.forEach((s) => { if (!coordsDe(s.at)) idsOk = false; });
  poss.forEach((p) => {
    if (typeof p.locationId === "string") {
      if (!cps[p.locationId]) idsOk = false;
    } else if (!(typeof p.label === "string" && p.label &&
                 isFinite(p.x) && isFinite(p.y))) {
      idsOk = false;
    } else nWpos++;
  });
  check(rt.id + ": paradas/posicoes resolviveis", idsOk);

  /* monotonicidade e continuidade da cadeia de segmentos */
  let mono = true, cont = true;
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].ch < stops[i - 1].ch) mono = false;
  }
  rt.segments.forEach((seg, i) => {
    const dst = stops[i + 1];
    const org = stops[i];
    if (!eq(seg.points[0], coordsDe(org.at)) ||
        !eq(seg.points[seg.points.length - 1], coordsDe(dst.at)) ||
        seg.startChapter !== dst.ch || seg.endChapter !== 343) {
      cont = false;
    }
    if (i > 0) {
      const ant = rt.segments[i - 1];
      if (!eq(ant.points[ant.points.length - 1], seg.points[0])) {
        cont = false;
      }
    }
  });
  if (rt.segments.length !== stops.length - 1) cont = false;
  check(rt.id + ": capitulos monotonicos", mono);
  check(rt.id + ": " + rt.segments.length + " segmentos formam cadeia " +
    "continua parada a parada", cont);

  /* transportLegs dentro dos limites e cobrindo todos os vertices */
  let legsOk = true;
  rt.segments.forEach((seg) => {
    const legs = seg.transportLegs;
    if (!Array.isArray(legs) || !legs.length) { legsOk = false; return; }
    if (legs[0].startVertex !== 0 ||
        legs[legs.length - 1].endVertex !== seg.points.length - 1) {
      legsOk = false;
    }
    for (let i = 1; i < legs.length; i++) {
      /* convencao: o vertice de juncao pertence as duas pernas */
      if (legs[i].startVertex !== legs[i - 1].endVertex) legsOk = false;
    }
    legs.forEach((l) => {
      if (!/^(land|sea|river|mixed|embarkation)$/.test(l.mode)) legsOk = false;
    });
  });
  check(rt.id + ": transportLegs contiguas e modos validos", legsOk);
}
check("v7: 206 segmentos", nSegs === 206, "n=" + nSegs);
check("v7: 229 posicoes", nPos === 229, "n=" + nPos);
check("v7: posicoes de waypoint embutidas (x/y/label)",
  nWpos > 0, "n=" + nWpos);

/* invariantes do builder nao podem ter erros registrados */
check("v7: diagnostico sem erros de invariante",
  (DIAG.invariantes && DIAG.invariantes.erros || []).length === 0,
  JSON.stringify((DIAG.invariantes || {}).erros || []).slice(0, 200));

/* ---------- navegador --------------------------------------------- */
let browser = null;
try {
  browser = await chromium.launch();

  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    if (!f || !/aborted/i.test(f.errorText)) {
      failedReqs.push(r.url());
    }
  });
  const resps = [];
  page.on("response", (r) => resps.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/atlas/", { waitUntil: "networkidle" });
  await page.waitForSelector("#lista-personagens input[type=checkbox]",
    { state: "attached", timeout: 45000 });
  check("pagina carregou atlas-percursos-v7.json (HTTP 200)",
    resps.some((s) => s.startsWith("200 ") &&
      s.includes("atlas-percursos-v7.json")));

  const livroDe = (cap) =>
    DATA.books.find((b) => cap >= b.startChapter && cap <= b.endChapter);
  async function irPara(cap) {
    const lv = livroDe(cap);
    if (lv) {
      const atual = await page.evaluate(() =>
        document.querySelector("#livro-select").value);
      if (atual !== lv.id) {
        await page.selectOption("#livro-select", lv.id);
        await page.waitForTimeout(250);
      }
    }
    await page.evaluate((c) => {
      const s = document.querySelector("#cap-slider");
      s.value = String(c);
      s.dispatchEvent(new Event("input"));
    }, cap);
    await page.waitForTimeout(400);
  }
  async function solo(rt) {
    await page.evaluate(() =>
      document.querySelector("#btn-limpar-sel").click());
    await page.waitForTimeout(250);
    await page.check("#chk-" + rt);
    await page.waitForTimeout(400);
  }

  /* Arya: marcador no lugar esperado por capitulo (texto do painel
     "Nome — local" + posicao do marcador em px nativos) */
  const aryaCasos = [
    [20, "Porto Real"], [80, "Estrada do Rei"], [99, "Harrenhal"],
    [160, "Estalagem do Ajoelhado"], [172, "Septo de Pedra"],
    [193, "Gêmeas"], [217, "Salinas"], [231, "Braavos"]
  ];
  await solo("arya");
  for (const [cap, lugar] of aryaCasos) {
    await irPara(cap);
    const st = await page.locator("#pers-atual").textContent()
      .catch(() => "");
    check("arya@" + cap + ": painel mostra '" + lugar + "'",
      !!st && st.includes("—") && st.includes(lugar),
      (st || "").trim().slice(0, 90));
  }
  /* posicao exata do marcador em px nativos: capitulo 80 usa o
     waypoint Estrada do Rei (sem controlPoint) */
  await irPara(80);
  const pins = await page.evaluate(() => {
    const out = [];
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Marker &&
          l.options.alt === "Posição de personagem") {
        const p = window.__atlasMap.project(l.getLatLng(), 6);
        out.push([Math.round(p.x), Math.round(p.y)]);
      }
    });
    return out;
  });
  check("arya@80: marcador unico na Estrada do Rei (~[4330,7150])",
    pins.length === 1 &&
      Math.abs(pins[0][0] - 4330) < 120 && Math.abs(pins[0][1] - 7150) < 120,
    JSON.stringify(pins));

  /* cadeia conectada: todas as pernas da cor da Arya formam uma unica
     componente com exatamente duas pontas livres (inicio e fim) */
  await irPara(231);
  const cadeia = await page.evaluate(() => {
    const map = window.__atlasMap;
    const lines = [];
    map.eachLayer((l) => {
      if (l instanceof L.Polyline && l.options.interactive !== false &&
          l.options.color !== "#ffe600" && l.options.color !== "#2b2118") {
        const ll = l.getLatLngs();
        lines.push({
          a: map.project(ll[0], 6),
          b: map.project(ll[ll.length - 1], 6)
        });
      }
    });
    /* grafo por ponta compartilhada (<=2px) */
    const chave = (p) => Math.round(p.x / 2) + "," + Math.round(p.y / 2);
    const graus = new Map();
    const adj = new Map();
    const add = (k, i) => {
      graus.set(k, (graus.get(k) || 0) + 1);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(i);
    };
    lines.forEach((l, i) => { add(chave(l.a), i); add(chave(l.b), i); });
    /* componentes: union por ponta comum */
    const visit = new Set();
    let comps = 0;
    lines.forEach((l, i) => {
      if (visit.has(i)) return;
      comps++;
      const fila = [i];
      while (fila.length) {
        const cur = fila.pop();
        if (visit.has(cur)) continue;
        visit.add(cur);
        [lines[cur].a, lines[cur].b].forEach((p) => {
          (adj.get(chave(p)) || []).forEach((j) => {
            if (!visit.has(j)) fila.push(j);
          });
        });
      }
    });
    let pontas = 0;
    graus.forEach((n) => { if (n === 1) pontas++; });
    return { lines: lines.length, comps, pontas };
  });
  check("arya: rota desenhada e UMA cadeia polilinha conectada",
    cadeia.comps === 1 && cadeia.lines >= 15 && cadeia.pontas === 2,
    JSON.stringify(cadeia));

  /* overlay deduzido: pelo menos uma linha amarela pontilhada */
  const overlay = await page.evaluate(() => {
    let n = 0;
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Polyline && l.options.color === "#ffe600" &&
          l.options.dashArray === "1 7") n++;
    });
    return n;
  });
  check("arya: overlay pontilhado amarelo #ffe600 em trecho deduzido",
    overlay > 0, "n=" + overlay);
  await page.screenshot({ path: join(OUT, "v7-arya-231.png") });

  /* Jon e Daenerys: marcador no lugar esperado */
  await solo("jon");
  await irPara(191);
  const stJon = await page.locator("#pers-atual").textContent()
    .catch(() => "");
  check("jon@191: painel mostra Castelo Negro",
    !!stJon && /Castelo Negro/.test(stJon), (stJon || "").trim());

  await solo("daenerys");
  await irPara(200);
  const stDan = await page.locator("#pers-atual").textContent()
    .catch(() => "");
  check("daenerys@200: painel mostra Meereen",
    !!stDan && /Meereen/.test(stDan), (stDan || "").trim());
  await page.screenshot({ path: join(OUT, "v7-daenerys-200.png") });

  /* legenda deduzida visivel no painel */
  check("legenda 'Pontilhado amarelo' presente no painel",
    await page.locator(".pers-legenda").textContent()
      .then((t) => /Pontilhado amarelo = caminho deduzido/i.test(t || ""))
      .catch(() => false));

  /* higiene */
  const ext = requests.filter((u) => !u.includes("127.0.0.1"));
  check("nenhuma requisição externa", ext.length === 0,
    ext.slice(0, 3).join(", ") || "ok");
  check("nenhuma requisição falha", failedReqs.length === 0,
    failedReqs.slice(0, 3).join(", ") || "ok");
  check("sem pageerrors", pageErrors.length === 0,
    pageErrors.slice(0, 2).join(" | "));
  await ctx.close();
  await browser.close();
  browser = null;
} catch (e) {
  results.push("# ABORTADO: " + (e && e.message || e));
  throw e;
} finally {
  if (browser) await browser.close();
}
writeFileSync(join(OUT, "percursos-v7-resultados.txt"),
  results.join("\n") + "\n");
