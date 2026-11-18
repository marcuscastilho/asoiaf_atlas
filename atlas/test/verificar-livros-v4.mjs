// Verificacao focada do suporte a livros (dataset v4) em /atlas/.
// Fixture SINTETICO interceptando data/atlas-inventario-v4.json — 5
// livros contiguos 0..343 com os limites exatos do contrato; apenas
// geometria minima, sem valor cartografico. Tambem cobre fail-closed
// (v4 presente mas invalido NAO degrada) e fallback 404 -> v3 real.
// Uso: node atlas/test/verificar-livros-v4.mjs  (servidor 8080 ativo)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "evidencias");
mkdirSync(OUT, { recursive: true });

const SHA_REAL =
  "deafeff759278a8fbf1fcdcced58c5b7cf18e21fb3edec26b968bd96b6076e3d";

const LIVROS = [
  { id: "agot", code: "AGOT", title: "A Guerra dos Tronos",
    startChapter: 0, endChapter: 72 },
  { id: "acok", code: "ACOK", title: "A Fúria dos Reis",
    startChapter: 73, endChapter: 142 },
  { id: "asos", code: "ASOS", title: "A Tormenta de Espadas",
    startChapter: 143, endChapter: 224 },
  { id: "affc", code: "AFFC", title: "O Festim dos Corvos",
    startChapter: 225, endChapter: 270 },
  { id: "adwd", code: "ADWD", title: "A Dança dos Dragões",
    startChapter: 271, endChapter: 343 }
];

// Fixture v4 SINTETICO minimo, valido pelo contrato.
function fixtureV4() {
  const chapters = [];
  for (const lv of LIVROS) {
    for (let i = lv.startChapter; i <= lv.endChapter; i++) {
      chapters.push({
        index: i, title: "Capítulo " + i,
        bookId: lv.id, localIndex: i - lv.startChapter
      });
    }
  }
  return {
    schemaVersion: 2, datasetId: "atlas-saga-v4",
    mapId: "o-mundo-conhecido",
    tileSetId: "o-mundo-conhecido-recorte-v1",
    sourceSha256: SHA_REAL,
    coordinateSystem: "cropped-native-pixels",
    mapWidth: 21654, mapHeight: 14428,
    cropBoxOriented: [0, 2336, 21654, 16764],
    books: LIVROS,
    chapters,
    controlPoints: [
      {
        id: "lugar-a", originalKey: "Lugar_A",
        label: "Lugar A", english: "Place A",
        x: 5000, y: 5000, status: "manual-review",
        sourceLatLng: [0, 0], evidence: [], note: ""
      }
    ],
    routes: [
      {
        id: "rota-a", character: "Personagem A",
        color: "#336699", status: "approximate",
        segments: [
          {
            id: "s-acok", sourceRecordIndex: 1,
            startChapter: 73, endChapter: 142,
            points: [[3000, 3000], [5000, 3000]],
            status: "approximate", label: "Trecho ACOK"
          },
          {
            id: "s-adwd", sourceRecordIndex: 2,
            startChapter: 280, endChapter: 300,
            points: [[6500, 3500], [7500, 4500]],
            status: "approximate", label: "Trecho ADWD"
          }
        ],
        positions: [
          {
            id: "pos-a", sourceRecordIndex: 3,
            startChapter: 73, endChapter: 142, locationId: "lugar-a"
          }
        ],
        evidence: []
      }
    ]
  };
}

const results = [];
const pageErrors = [];

function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name +
    (detail ? " — " + detail : ""));
  return ok;
}

const browser = await chromium.launch();

async function novaPagina(largura, altura) {
  const page = await browser.newPage({
    viewport: { width: largura, height: altura }
  });
  /* o salto v5 precede o v4 na cascata: sem este pino a suite
     carregaria o v5 real em vez do fixture sintetico */
  await page.route("**/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v7.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  return page;
}

async function carregar(page, url) {
  await page.goto(url || BASE + "/atlas/", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.querySelector("#localidades-status") ||
      !/Carregando/.test(
        document.querySelector("#localidades-status").textContent),
    { timeout: 15000 });
  return page;
}

/* clica sobre o traco de uma linha visivel (mesma tecnica do
   verificar-rotas-ui): getPointAtLength em coordenadas SVG,
   convertidas a cliente via getScreenCTM, e so clica onde
   elementFromPoint acha o path */
async function clicarNaLinha(page) {
  const pts = await page.evaluate(() => {
    const map = window.__atlasMap;
    if (!map) return [];
    const out = [];
    map.eachLayer((l) => {
      if (l instanceof L.Polyline && !(l instanceof L.Polygon) &&
          l.options.interactive && l.options.weight === 4 && l._path) {
        const path = l._path;
        const total = path.getTotalLength();
        const ctm = path.getScreenCTM();
        for (let d = 8; d < total && out.length < 80; d += 9) {
          const pt = path.getPointAtLength(d);
          out.push({
            x: pt.x * ctm.a + ctm.e,
            y: pt.y * ctm.d + ctm.f
          });
        }
      }
    });
    return out.filter((p) => {
      const el = document.elementFromPoint(p.x, p.y);
      return el && /path/i.test(el.tagName);
    });
  });
  for (const p of pts.slice(0, 40)) {
    await page.mouse.click(p.x, p.y);
    try {
      await page.waitForSelector(".leaflet-popup", { timeout: 600 });
      return await page.locator(".leaflet-popup").textContent();
    } catch (e) { /* tenta o proximo ponto */ }
  }
  return null;
}

async function estado(page) {
  return page.evaluate(() => {
    const slider = document.querySelector("#cap-slider");
    const livro = document.querySelector("#livro-select");
    return {
      cap: Number(slider.value),
      min: Number(slider.min), max: Number(slider.max),
      livro: livro ? livro.value : null,
      livroOculto: livro ? livro.hidden : null,
      antOff: document.querySelector("#cap-ant").disabled,
      proxOff: document.querySelector("#cap-prox").disabled
    };
  });
}

async function escolherLivro(page, id) {
  await page.selectOption("#livro-select", id);
  await page.waitForTimeout(250);
}

async function setCap(page, n) {
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, n);
  await page.waitForTimeout(250);
}

/* ---------- v4 sintetico: livros, limites e navegacao ---------- */
{
  const page = await novaPagina(1366, 900);
  await page.route("**/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(fixtureV4())
    }));
  await carregar(page);
  await page.waitForSelector("#livro-select:not([hidden])",
    { timeout: 5000 });

  let st = await estado(page);
  check("v4: seletor de livro visível", st.livroOculto === false);
  const nLivros = await page.locator("#livro-select option").count();
  check("v4: 5 livros no seletor", nLivros === 5, "n=" + nLivros);
  check("v4: inicia em AGOT cap 0",
    st.cap === 0 && st.livro === "agot", JSON.stringify(st));
  check("v4: slider limitado a AGOT",
    st.min === 0 && st.max === 72, "min=" + st.min + " max=" + st.max);
  check("v4: 'Anterior' desabilitado no início do livro",
    st.antOff === true);
  check("v4: sem nota de ordem de leitura na UI",
    (await page.locator("#livro-nota").count()) === 0);

  /* escolher ACOK fora do capitulo atual: salta para o INICIO (73),
     nunca para o fim */
  await escolherLivro(page, "acok");
  st = await estado(page);
  check("ACOK: salta para o primeiro capítulo (73)",
    st.cap === 73 && st.livro === "acok", "cap=" + st.cap);
  check("ACOK: slider 73..142",
    st.min === 73 && st.max === 142,
    "min=" + st.min + " max=" + st.max);
  check("ACOK: 'Anterior' travado no início", st.antOff === true);

  /* capitulo dentro do livro: reescolher o MESMO livro nao salta */
  await setCap(page, 100);
  await escolherLivro(page, "acok");
  st = await estado(page);
  check("ACOK: reescolher o mesmo livro não move o capítulo",
    st.cap === 100, "cap=" + st.cap);

  /* 'Ver livro completo' para no fim do LIVRO (142), nao na saga */
  await page.check("#chk-rota-a");
  await page.waitForTimeout(250);
  await page.click("#btn-livro-completo");
  await page.waitForTimeout(300);
  st = await estado(page);
  check("ACOK: 'Ver livro completo' para em 142, não 343",
    st.cap === 142, "cap=" + st.cap);
  check("ACOK: 'Próximo' travado no fim do livro",
    st.proxOff === true);
  /* clique DOM em botao desabilitado: nao passa pela actionability do
     Playwright (que esperaria 30s); prova que o handler nao avanca */
  await page.evaluate(() =>
    document.querySelector("#cap-prox").click());
  await page.waitForTimeout(200);
  st = await estado(page);
  check("ACOK: 'Próximo' nunca passa de 142", st.cap === 142);

  /* storage persiste o cap global; livro deriva dele */
  const capSalvo = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem(
        "gotatlas-estado-atlas-saga-v4") || "{}");
      return s.cap;
    } catch (e) { return null; }
  });
  check("storage: persiste cap global (livro derivável)",
    capSalvo === 142, "cap=" + capSalvo);
  await page.close();
}

/* ---------- hash cap=290 restaura ADWD; popup fecha ao recuar ---------- */
{
  const page = await novaPagina(1366, 900);
  await page.route("**/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(fixtureV4())
    }));
  await carregar(page, BASE + "/atlas/#cap=290");
  let st = await estado(page);
  check("hash cap=290: ADWD derivado, limites 271..343",
    st.livro === "adwd" && st.min === 271 && st.max === 343,
    JSON.stringify(st));
  check("hash cap=290: slider limitado a ADWD 271..343",
    st.min === 271 && st.max === 343);

  /* trecho ADWD (280..300) visivel: clique real na linha abre o
     popup; recuar antes de 280 fecha (spoiler invertido) */
  await page.check("#chk-rota-a");
  await page.waitForTimeout(300);
  const txt = await clicarNaLinha(page);
  check("popup de trecho abre no cap 290",
    !!txt && /Trecho ADWD|Disponível a partir/.test(txt || ""),
    (txt || "sem popup").slice(0, 60));
  await setCap(page, 279);
  await page.waitForTimeout(300);
  const popFechado = await page.evaluate(() =>
    !document.querySelector(".loc-popup-trecho"));
  check("recuar o capítulo fecha o popup de trecho futuro",
    popFechado);

  /* limite duro da saga: 'Ver livro completo' em ADWD para em 343
     e 'Próximo' nunca ultrapassa */
  await page.click("#btn-livro-completo");
  await page.waitForTimeout(300);
  st = await estado(page);
  check("ADWD: 'Ver livro completo' para em 343",
    st.cap === 343 && st.proxOff === true, "cap=" + st.cap);
  await page.evaluate(() =>
    document.querySelector("#cap-prox").click());
  await page.waitForTimeout(200);
  st = await estado(page);
  check("ADWD: 'Próximo' nunca passa de 343", st.cap === 343);
  await page.close();
}

/* ---------- v4 presente mas INVALIDO: falha fechado, sem v3 ---------- */
{
  const page = await novaPagina(1366, 900);
  let pediuAntigo = false;
  page.on("request", (r) => {
    if (/atlas-inventario-v3|atlas-agot-v2|piloto-norte/.test(r.url())) {
      pediuAntigo = true;
    }
  });
  await page.route("**/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 2, datasetId: "atlas-saga-v4",
        mapId: "o-mundo-conhecido",
        tileSetId: "o-mundo-conhecido-recorte-v1",
        sourceSha256: SHA_REAL,
        coordinateSystem: "cropped-native-pixels",
        mapWidth: 21654, mapHeight: 14428,
        cropBoxOriented: [0, 2336, 21654, 16764],
        /* capitulos com lacuna (0..5) -> invalido: falha fechado */
        chapters: [{ index: 0, title: "Capítulo 0" },
                   { index: 5, title: "Capítulo 5" }],
        controlPoints: [{ id: "x", x: 1, y: 1 }]
      })
    }));
  await carregar(page);
  const status = await page.textContent("#localidades-status");
  check("v4 corrompido: falha fechado",
    /indisponíveis/i.test(status || ""), (status || "").slice(0, 80));
  check("v4 corrompido: NUNCA requisita v3/v2/v1",
    pediuAntigo === false);
  check("v4 corrompido: seletor de livro fica oculto",
    await page.evaluate(() =>
      document.querySelector("#livro-select").hidden));
  await page.close();
}

/* ---------- v4 ausente (404 EXPLICITO): cai para o v3 real ----------
   o pino garante o 404 mesmo depois que o v4 real for publicado */
{
  const page = await novaPagina(1366, 900);
  await page.route("**/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await carregar(page);
  const st = await estado(page);
  check("404->v3: seletor de livro oculto (sem books[])",
    st.livroOculto === true);
  check("404->v3: slider legado 0..72",
    st.min === 0 && st.max === 72, "min=" + st.min + " max=" + st.max);
  check("404->v3: inventário v3 carregado",
    await page.locator("#loc-lista li").count() > 0);
  await page.close();
}

/* ---------- mobile 320 + 390: sem overflow, livro-select cabe ---------- */
for (const largura of [390, 320]) {
  const page = await novaPagina(largura, 700);
  await page.route("**/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(fixtureV4())
    }));
  await carregar(page);
  /* abre o painel (mobile nasce recolhido) para medir o conteudo */
  const btn = await page.$("#btn-painel");
  if (btn) { await btn.click(); await page.waitForTimeout(300); }
  const ov = await page.evaluate(() => {
    const de = document.documentElement;
    const sel = document.querySelector("#livro-select");
    const r = sel ? sel.getBoundingClientRect() : null;
    return {
      overflow: de.scrollWidth - de.clientWidth,
      selVisivel: sel ? !sel.hidden && r.width > 0 : false,
      selDentro: r ? r.right <= innerWidth + 1 : false
    };
  });
  check("mobile " + largura + ": sem overflow horizontal",
    ov.overflow <= 1, "overflow=" + ov.overflow);
  check("mobile " + largura + ": livro-select visível e dentro",
    ov.selVisivel && ov.selDentro, JSON.stringify(ov));
  await page.close();
}

await browser.close();

check("sem pageerrors", pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "));

writeFileSync(join(OUT, "livros-v4-resultados.txt"),
  results.join("\n") + "\n");
console.log("— verificar-livros-v4 —");
results.forEach((r) => console.log(r));
const falhas = results.filter((r) => r.startsWith("FAIL"));
console.log(falhas.length
  ? falhas.length + " falha(s)"
  : "0 falhas — " + results.length + " checagens");
process.exit(falhas.length ? 1 : 0);
