// Validador puro (GOTATLAS.pure.validarDados) — casos Node, sem navegador.
// Carrega overlays.js com stubs; so exercita helpers puros.
// Uso: node atlas/test/verificar-validador.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });

const src = readFileSync(join(DIR, "..", "assets", "overlays.js"), "utf8");
const windowStub = {};
new Function(
  "window", "document", "L", "GOTCORE", "fetch",
  "location", "localStorage", "history", "navigator",
  src
)(windowStub, {}, {}, {}, () => Promise.reject(), {}, {}, {}, {});
const pure = windowStub.GOTATLAS.pure;

const MAN = {
  id: "o-mundo-conhecido",
  tileSetId: "o-mundo-conhecido-recorte-v2",
  sourceSha256: "abc",
  width: 21654,
  height: 14428,
  cropBoxOriented: [0, 2336, 21654, 16764]
};

function base() {
  return {
    schemaVersion: 2,
    datasetId: "agot-atlas-v2",
    mapId: "o-mundo-conhecido",
    tileSetId: "o-mundo-conhecido-recorte-v2",
    sourceSha256: "abc",
    coordinateSystem: "cropped-native-pixels",
    mapWidth: 21654,
    mapHeight: 14428,
    cropBoxOriented: [0, 2336, 21654, 16764],
    controlPoints: [
      { id: "Winterfell", x: 100, y: 200 },
      { id: "Castle_Black", x: 300, y: 400 }
    ],
    chapters: Array.from({ length: 73 }, (_, i) => ({
      index: i, title: "cap " + i
    })),
    routes: [{
      id: "jon",
      character: "Jon Snow",
      color: "#805d22",
      status: "approximate",
      book: "livro",
      notice: "nota",
      segments: [{
        startChapter: 19, endChapter: 72,
        points: [[1, 2], [3, 4]]
      }],
      positions: [{ locationId: "Winterfell", startChapter: 0, endChapter: 5 }],
      omittedRecords: [],
      omittedSourceRecordIndices: [1],
      evidence: [{ kind: "livro", label: "x", locator: "y" }]
    }],
    regions: [{ id: "norte", label: "Norte", pointIds: ["Winterfell"] }]
  };
}

const results = [];
function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : ""));
}

function esperaErro(name, mutar) {
  const d = base();
  mutar(d);
  let r;
  try { r = pure.validarDados(d, MAN); } catch (e) { r = "__THROW__ " + e.message; }
  check(name, typeof r === "string" && r.length > 0, String(r));
}

check("base valida retorna null", pure.validarDados(base(), MAN) === null);
check("routes vazio e honesto (null)", (() => {
  const d = base(); d.routes = [];
  return pure.validarDados(d, MAN) === null;
})());
check("v1 route singular valida", (() => {
  const d = base();
  d.schemaVersion = 1;
  delete d.datasetId; delete d.routes; delete d.regions;
  d.route = {
    id: "jon-agot-north", character: "Jon Snow",
    segments: [{ startChapter: 19, endChapter: 72, points: [[1, 2], [3, 4]] }],
    positions: [{ locationId: "Winterfell", startChapter: 0, endChapter: 5 }]
  };
  return pure.validarDados(d, MAN) === null;
})());

esperaErro("routes={} rejeitado", (d) => { d.routes = {}; });
esperaErro("segments={} rejeitado", (d) => { d.routes[0].segments = {}; });
esperaErro("positions={} rejeitado", (d) => { d.routes[0].positions = {}; });
esperaErro("controlPoint null rejeitado", (d) => { d.controlPoints[0] = null; });
esperaErro("ponto array rejeitado", (d) => { d.controlPoints[0] = [1, 2]; });
esperaErro("evidence de ponto={} rejeitado", (d) => {
  d.controlPoints[0].evidence = {};
});
esperaErro("evidence de rota={} rejeitado", (d) => {
  d.routes[0].evidence = {};
});
esperaErro("regions={} rejeitado", (d) => { d.regions = {}; });
esperaErro("capitulo index string rejeitado", (d) => {
  d.chapters[5].index = "5";
});
esperaErro("capitulo titulo numero rejeitado", (d) => {
  d.chapters[5].title = 5;
});
esperaErro("capitulo duplicado rejeitado", (d) => {
  d.chapters[10].index = 0;
});
esperaErro("capitulo null rejeitado", (d) => { d.chapters[10] = null; });
esperaErro("rota id maiusculo rejeitado", (d) => { d.routes[0].id = "Jon"; });
esperaErro("rota id __proto__ rejeitado", (d) => {
  d.routes[0].id = "__proto__";
});
esperaErro("rota id com underscore rejeitado", (d) => {
  d.routes[0].id = "jon_snow";
});
esperaErro("rota id duplicado rejeitado", (d) => {
  d.routes.push(d.routes[0]);
});
esperaErro("ponto id vazio rejeitado", (d) => { d.controlPoints[0].id = ""; });
esperaErro("ponto id duplicado rejeitado", (d) => {
  d.controlPoints[1].id = "Winterfell";
});
esperaErro("ponto fora dos limites rejeitado", (d) => {
  d.controlPoints[0].x = -5;
});
esperaErro("coordenada nao finita rejeitada", (d) => {
  d.controlPoints[0].y = NaN;
});
esperaErro("segmento ponto nao-array rejeitado", (d) => {
  d.routes[0].segments[0].points[0] = { x: 1, y: 2 };
});
esperaErro("segmento 3 coords rejeitado", (d) => {
  d.routes[0].segments[0].points[0] = [1, 2, 3];
});
esperaErro("segmento 1 ponto rejeitado", (d) => {
  d.routes[0].segments[0].points = [[1, 2]];
});
esperaErro("posicao localidade desconhecida", (d) => {
  d.routes[0].positions[0].locationId = "Nowhere";
});
esperaErro("posicao null rejeitada", (d) => {
  d.routes[0].positions[0] = null;
});
esperaErro("datasetId ausente rejeitado", (d) => { delete d.datasetId; });
esperaErro("datasetId invalido rejeitado", (d) => { d.datasetId = "Atlas V2"; });
esperaErro("regiao ponto desconhecido", (d) => {
  d.regions[0].pointIds.push("X");
});
esperaErro("regiao sem label rejeitada", (d) => {
  d.regions[0].label = 7;
});
esperaErro("omittedRecords={} rejeitado", (d) => {
  d.routes[0].omittedRecords = {};
});
esperaErro("cor invalida rejeitada", (d) => { d.routes[0].color = "ambar"; });
/* ---------- capitulos estendidos + books[] (v4 multi-livro) ---------- */
function baseV4() {
  const d = base();
  d.datasetId = "atlas-saga-v4";
  const LIVROS = [
    { id: "agot", code: "AGOT", title: "Guerra dos Tronos",
      startChapter: 0, endChapter: 72 },
    { id: "adwd", code: "ADWD", title: "Dança dos Dragões",
      startChapter: 73, endChapter: 80 }
  ];
  d.chapters = [];
  for (const lv of LIVROS) {
    for (let i = lv.startChapter; i <= lv.endChapter; i++) {
      d.chapters.push({
        index: i, title: "cap " + i,
        bookId: lv.id, localIndex: i - lv.startChapter
      });
    }
  }
  d.books = LIVROS;
  return d;
}
function esperaErroV4(name, mutar) {
  const d = baseV4();
  mutar(d);
  let r;
  try { r = pure.validarDados(d, MAN); } catch (e) { r = "__THROW__ " + e.message; }
  check(name, typeof r === "string" && r.length > 0, String(r));
}

check("v4: dois livros contíguos 0..80 válidos",
  pure.validarDados(baseV4(), MAN) === null);
check("capítulos além de 72 aceitos quando declarados",
  (() => {
    const d = base();
    d.chapters.push({ index: 73, title: "cap 73" });
    return pure.validarDados(d, MAN) === null;
  })());
esperaErro("segmento além do capítulo declarado", (d) => {
  d.routes[0].segments[0].endChapter = 100;
});
esperaErro("posição além do capítulo declarado", (d) => {
  d.routes[0].positions[0].endChapter = 99;
});
esperaErro("books={} rejeitado", (d) => { d.books = {}; });
esperaErro("books=[] rejeitado", (d) => { d.books = []; });
esperaErroV4("livro fora de ordem rejeitado", (d) => {
  d.books = [d.books[1], d.books[0]];
});
esperaErroV4("lacuna entre livros rejeitada", (d) => {
  d.books[1].startChapter = 74;
});
esperaErroV4("livro além do capítulo máximo rejeitado", (d) => {
  d.books[1].endChapter = 999;
});
esperaErroV4("livros não cobrem os capítulos", (d) => {
  d.books[1].endChapter = 79;
});
esperaErroV4("capítulo sem bookId rejeitado", (d) => {
  delete d.chapters[10].bookId;
});
esperaErroV4("capítulo com bookId desconhecido", (d) => {
  d.chapters[10].bookId = "twow";
});
esperaErroV4("capítulo fora dos limites do livro", (d) => {
  d.chapters[10].bookId = "adwd";
});
esperaErroV4("localIndex fora do livro rejeitado", (d) => {
  d.chapters[10].localIndex = 999;
});
esperaErroV4("livro sem título rejeitado", (d) => {
  delete d.books[0].title;
});
esperaErroV4("livro code não-string rejeitado", (d) => {
  d.books[0].code = 42;
});
esperaErroV4("livro id duplicado rejeitado", (d) => {
  d.books[1].id = "agot";
});

/* v5: status de identificacao honestos + aliases opcionais */
check("identificationStatus geographically-described aceito",
  (() => {
    const d = base();
    d.controlPoints[0].identificationStatus =
      "geographically-described";
    return pure.validarDados(d, MAN) === null;
  })());
check("identificationStatus named-group-member aceito",
  (() => {
    const d = base();
    d.controlPoints[0].identificationStatus = "named-group-member";
    return pure.validarDados(d, MAN) === null;
  })());
check("aliases como array de strings aceito",
  (() => {
    const d = base();
    d.controlPoints[0].aliases = ["Variante", "Outro Nome"];
    return pure.validarDados(d, MAN) === null;
  })());
esperaErro("aliases não-array rejeitado", (d) => {
  d.controlPoints[0].aliases = "texto";
});
esperaErro("aliases com elemento não-string rejeitado", (d) => {
  d.controlPoints[0].aliases = ["ok", 42];
});

/* perna de transporte fluvial: as legs nao tem rol restrito no
   validador (passam pelo render com traco 8 5 / rotulo fluvial) —
   este caso garante que uma perna river continua aceita */
check("transportLeg com mode river aceito",
  (() => {
    const d = base();
    d.routes[0].segments[0].transportLegs =
      [{ startVertex: 0, endVertex: 1, mode: "river" }];
    d.routes[0].segments[0].travelMode = "river";
    return pure.validarDados(d, MAN) === null;
  })());

/* bookCoverage (v6): exige schema 2 com books[]; uma entrada por
   livro com status/nota/contagens/capitulos revisados validos */
function baseComLivros() {
  const d = base();
  d.books = [
    { id: "livro-a", title: "Livro A", startChapter: 0, endChapter: 36 },
    { id: "livro-b", title: "Livro B", startChapter: 37, endChapter: 72 }
  ];
  d.chapters.forEach((c) => {
    c.bookId = c.index <= 36 ? "livro-a" : "livro-b";
  });
  d.routes[0].bookCoverage = [
    { bookId: "livro-a", status: "partial-route",
      notice: "Revisão parcial deste livro.",
      segmentsStartingInBook: 1, positionReferencesInBook: 1,
      reviewedChapters: [0, 5, 36] },
    { bookId: "livro-b", status: "positions-only",
      notice: "Apenas localidades revisadas.",
      segmentsStartingInBook: 0, positionReferencesInBook: 2,
      reviewedChapters: [40, 72] }
  ];
  return d;
}
check("bookCoverage valido retorna null",
  pure.validarDados(baseComLivros(), MAN) === null);
check("bookCoverage no-reviewed-records com capitulos vazios valido",
  (() => {
    const d = baseComLivros();
    d.routes[0].bookCoverage[1].status = "no-reviewed-records";
    d.routes[0].bookCoverage[1].reviewedChapters = [];
    return pure.validarDados(d, MAN) === null;
  })());
check("rota sem bookCoverage preserva comportamento legado",
  (() => {
    const d = baseComLivros();
    delete d.routes[0].bookCoverage;
    return pure.validarDados(d, MAN) === null;
  })());
esperaErro("bookCoverage sem books[] rejeitado", (d) => {
  d.routes[0].bookCoverage = [{ bookId: "livro-a", status: "partial-route",
    notice: "x", segmentsStartingInBook: 0,
    positionReferencesInBook: 0, reviewedChapters: [] }];
});
esperaErro("bookCoverage tamanho diverso de books[] rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage = c.routes[0].bookCoverage.slice(0, 1);
});
esperaErro("bookCoverage bookId duplicado rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[1].bookId = "livro-a";
});
esperaErro("bookCoverage bookId desconhecido rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[1].bookId = "livro-x";
});
esperaErro("bookCoverage status fora do rol rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[0].status = "complete";
});
esperaErro("bookCoverage nota vazia rejeitada", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[0].notice = "  ";
});
esperaErro("bookCoverage contagem negativa rejeitada", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[0].segmentsStartingInBook = -1;
});
esperaErro("bookCoverage contagem fracionaria rejeitada", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[0].positionReferencesInBook = 1.5;
});
esperaErro("bookCoverage capitulo revisado fora do livro rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  /* livro-a vai ate 36: um capitulo do livro-b e cross-book */
  d.routes[0].bookCoverage[0].reviewedChapters = [0, 40];
});
esperaErro("bookCoverage capitulo revisado duplicado rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[0].reviewedChapters = [5, 5];
});
esperaErro("bookCoverage capitulo revisado nao-inteiro rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.routes[0].bookCoverage[0].reviewedChapters = ["5"];
});
esperaErro("bookCoverage em schema 1 rejeitado", (d) => {
  const c = baseComLivros();
  Object.assign(d, c);
  d.schemaVersion = 1;
  /* v1 le route singular — routes[] seria ignorada inteira */
  delete d.routes;
  d.route = c.routes[0];
});

check("dados string -> motivo, sem throw",
  typeof pure.validarDados("lixo", MAN) === "string");
check("dados null -> motivo, sem throw",
  typeof pure.validarDados(null, MAN) === "string");
check("dados array -> motivo, sem throw",
  typeof pure.validarDados([1, 2], MAN) === "string");
check("manifesto nulo -> motivo, sem throw",
  typeof pure.validarDados(base(), null) === "string");

writeFileSync(join(OUT, "validador-resultados.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
