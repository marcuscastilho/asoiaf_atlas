// Troca de livro (seam v6) — FIXTURE SINTETICO.
// Serve um conjunto atlas-saga-v6 minimo via interceptacao; nenhum
// dado real de percurso e exercitado. A UI nao exibe mais notas de
// cobertura (.pers-cobertura foi removida); a suite agora verifica a
// mecanica de troca de livro e a ausencia de rotulos/XSS renderizado.
// Uso:
//   node atlas/test/verificar-cobertura-v6.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080";

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

/* notas genericas liquidadas — distintas por livro para provar a troca
   de contexto; sem contagens, destinos ou percentuais */
function cobertura(porLivro) {
  return LIVROS.map((lv) => ({
    bookId: lv.id,
    status: porLivro[lv.id].status,
    notice: porLivro[lv.id].notice,
    segmentsStartingInBook: porLivro[lv.id].segs,
    positionReferencesInBook: porLivro[lv.id].poss,
    reviewedChapters: porLivro[lv.id].caps
  }));
}

const PARCIAL = {};
LIVROS.forEach((lv) => {
  PARCIAL[lv.id] = {
    status: "partial-route",
    notice: "Revisão cartográfica parcial deste livro (" + lv.code + ").",
    segs: 1, poss: 1,
    caps: [lv.startChapter]
  };
});

const MISTA = {};
LIVROS.forEach((lv) => {
  const sem = lv.id === "asos" || lv.id === "affc";
  MISTA[lv.id] = {
    status: sem ? "no-reviewed-records" : "positions-only",
    notice: sem
      ? "Sem registros revisados neste livro; isso não significa " +
        "ausência de deslocamento (" + lv.code + ")."
      : "Apenas localidades revisadas; percurso incompleto (" +
        lv.code + ").",
    segs: 0, poss: sem ? 0 : 1,
    caps: sem ? [] : [lv.startChapter]
  };
});

const XSS = {};
LIVROS.forEach((lv) => {
  XSS[lv.id] = {
    status: "partial-route",
    notice: 'Nota com <img src=x onerror="window.__xss=1"> (' +
      lv.code + ")",
    segs: 0, poss: 0, caps: [lv.startChapter]
  };
});

function fixtureV6(comCobertura) {
  const chapters = [];
  for (const lv of LIVROS) {
    for (let i = lv.startChapter; i <= lv.endChapter; i++) {
      chapters.push({
        index: i, title: "Capítulo " + i,
        bookId: lv.id, localIndex: i - lv.startChapter
      });
    }
  }
  const rotas = [
    {
      id: "rota-coberta", character: "Personagem Coberta",
      color: "#336699", status: "approximate",
      segments: [{
        id: "s-1", startChapter: 10, endChapter: 50,
        points: [[3000, 3000], [5000, 3000]]
      }],
      positions: [{
        id: "p-1", startChapter: 0, endChapter: 9, locationId: "lugar-a"
      }],
      evidence: []
    },
    {
      id: "rota-mista", character: "Personagem Mista",
      color: "#993366", status: "approximate",
      segments: [{
        id: "s-2", startChapter: 100, endChapter: 150,
        points: [[4000, 4000], [6000, 4000]]
      }],
      positions: [],
      evidence: []
    },
    {
      id: "rota-xss", character: "Personagem Injecao",
      color: "#669933", status: "approximate",
      segments: [{
        id: "s-3", startChapter: 200, endChapter: 220,
        points: [[5000, 5000], [7000, 5000]]
      }],
      positions: [],
      evidence: []
    },
    {
      id: "rota-sem-cobertura", character: "Personagem Sem Cobertura",
      color: "#333366", status: "approximate",
      segments: [{
        id: "s-4", startChapter: 20, endChapter: 30,
        points: [[2000, 2000], [2500, 2000]]
      }],
      positions: [],
      evidence: []
    }
  ];
  if (comCobertura) {
    rotas[0].bookCoverage = cobertura(PARCIAL);
    rotas[1].bookCoverage = cobertura(MISTA);
    rotas[2].bookCoverage = cobertura(XSS);
  }
  return {
    schemaVersion: 2, datasetId: "atlas-saga-v6",
    mapId: "o-mundo-conhecido",
    tileSetId: "o-mundo-conhecido-recorte-v1",
    sourceSha256: SHA_REAL,
    coordinateSystem: "cropped-native-pixels",
    mapWidth: 21654, mapHeight: 14428,
    cropBoxOriented: [0, 2336, 21654, 16764],
    books: LIVROS,
    chapters,
    controlPoints: [
      { id: "lugar-a", label: "Lugar A", x: 5000, y: 5000 }
    ],
    routes: rotas
  };
}

const results = [];
const pageErrors = [];
function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name +
    (detail ? " — " + detail : ""));
  console.log(results[results.length - 1]);
}

const browser = await chromium.launch();

async function novaPagina(fixture, url) {
  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.route("**/atlas/data/atlas-percursos-v7.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(fixture)
    }));
  await page.goto(url || BASE + "/atlas/", { waitUntil: "networkidle" });
  await page.waitForSelector("#lista-personagens input[type=checkbox]",
    { state: "attached", timeout: 45000 });
  return { ctx, page };
}

/* ---------- caminho feliz: fixture v6 com bookCoverage ---------- */
{
  const { ctx, page } = await novaPagina(fixtureV6(true));

  check("fixture v6: seletor de livro presente",
    await page.evaluate(() =>
      !document.querySelector("#livro-select").hidden));
  check("fixture v6: 4 checkboxes de personagem",
    await page.locator("#lista-personagens input").count() === 4);
  check("cobertura: UI nao renderiza rotulos de cobertura",
    await page.locator(".pers-cobertura").count() === 0);

  /* selecionar nao muda ao trocar de livro */
  await page.locator("#chk-rota-coberta").check();
  await page.locator("#chk-rota-mista").check();
  const antes = await page.evaluate(() =>
    [...document.querySelectorAll("#lista-personagens input")]
      .filter((c) => c.checked).map((c) => c.id));

  /* troca de livro: vai ao inicio do livro, sem mexer na selecao */
  await page.selectOption("#livro-select", "acok");
  await page.waitForTimeout(400);

  const depois = await page.evaluate(() =>
    [...document.querySelectorAll("#lista-personagens input")]
      .filter((c) => c.checked).map((c) => c.id));
  check("cobertura: selecao preservada na troca de livro",
    JSON.stringify(depois) === JSON.stringify(antes),
    antes.join(",") + " -> " + depois.join(","));
  const cap = await page.evaluate(() =>
    document.querySelector("#cap-slider").value);
  check("cobertura: livro vai ao inicio, nao ao fim — cap=73",
    cap === "73", "cap=" + cap);

  /* nota maliciosa nao e renderizada: nada de HTML injetado */
  check("cobertura: nenhum elemento HTML injetado",
    await page.evaluate(() =>
      !document.querySelector(
        "#lista-personagens img, #lista-personagens script") &&
      window.__xss === undefined));

  await ctx.close();
}

/* ---------- hash restaurado: seletor segue o livro do capitulo ----- */
{
  const { ctx, page } = await novaPagina(
    fixtureV6(true), BASE + "/atlas/#cap=280");
  const sel = await page.evaluate(() =>
    document.querySelector("#livro-select").value);
  check("hash #cap=280: seletor sincronizado em ADWD",
    sel === "adwd", "livro=" + sel);
  const cap = await page.evaluate(() =>
    document.querySelector("#cap-slider").value);
  check("hash #cap=280: slider no capitulo restaurado",
    cap === "280", "cap=" + cap);
  await ctx.close();
}

/* ---------- legado: conjunto sem bookCoverage nao cria rotulos ------ */
{
  const { ctx, page } = await novaPagina(fixtureV6(false));
  check("legado: nenhum rotulo .pers-cobertura sem o campo",
    await page.locator(".pers-cobertura").count() === 0);
  check("legado: checkbox da rota coberta normal",
    await page.locator("#chk-rota-coberta").count() === 1);
  await ctx.close();
}

check("sem pageerrors", pageErrors.length === 0,
  pageErrors.slice(0, 2).join(" | "));

await browser.close();
writeFileSync(join(OUT, "cobertura-v6-resultados.txt"),
  results.join("\n") + "\n");
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
