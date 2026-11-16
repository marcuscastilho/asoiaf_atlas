// verificar-nomes-v5.mjs — suite REAL do dataset v5 (nomes finais dos
// simbolos). SO roda quando atlas/data/atlas-inventario-v5.json estiver
// publicado; SEM interceptacao no caminho feliz: prova que o v5 real
// carrega, sem fallback. Expectativas sao os valores acordados do
// contrato (240 pontos, 18 descritos, 5 membros de conjunto, ids fixos)
// mais igualdade mecanica de rotas/posicoes contra o v4 congelado.
// Uso: node atlas/test/verificar-nomes-v5.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080";
const DATA_PATH = join(DIR, "..", "data", "atlas-inventario-v5.json");
const V4_PATH = join(DIR, "..", "data", "atlas-inventario-v4.json");

if (!existsSync(DATA_PATH)) {
  console.log("SKIP: atlas-inventario-v5.json ainda nao publicado.");
  process.exit(0);
}

const DADOS = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const V4 = existsSync(V4_PATH)
  ? JSON.parse(readFileSync(V4_PATH, "utf8"))
  : null;
const MAN = JSON.parse(
  readFileSync(join(DIR, "..", "data", "mapa.json"), "utf8"));

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
process.on("uncaughtException", (e) => {
  try {
    writeFileSync(join(OUT, "nomes-v5-resultados.txt"),
      results.join("\n") + "\n# ABORTADO: " + e.message + "\n");
  } catch {}
  throw e;
});

/* ---------- derivados do artefato publicado ---------- */
const cps = DADOS.controlPoints || [];
const ponto = (id) => cps.find((p) => p.id === id);
const descritos = cps.filter(
  (p) => p.identificationStatus === "geographically-described");
const membros = cps.filter(
  (p) => p.identificationStatus === "named-group-member");
const ID_CENTRAL = "Five_Forts_Central";
const ID_POLEIRO = "scan-site-v4-300";
const ID_GHASTON = "scan-site-v4-475";
const ID_URSO = "scan-site-2870-2880";
const REJEITADOS = ["scan-site-v4-306", "scan-site-v4-478",
  "scan-site-v4-413"];

/* igualdade mecanica de rotas entre v4 e v5: serializacao canonica
   (chaves ordenadas) por rota, comparada por id — nao rederiva dados */
function canon(o) {
  if (Array.isArray(o)) return "[" + o.map(canon).join(",") + "]";
  if (o && typeof o === "object") {
    return "{" + Object.keys(o).sort().map((k) =>
      JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
  }
  return JSON.stringify(o);
}

/* ---------- contrato do artefato (node, sem navegador) ---------- */
check("v5 real: datasetId atlas-saga-v5",
  DADOS.datasetId === "atlas-saga-v5", DADOS.datasetId);
check("v5 real: schemaVersion 2", DADOS.schemaVersion === 2);
check("v5 real: 240 pontos de controle", cps.length === 240,
  "n=" + cps.length);
check("v5 real: 5 livros declarados",
  Array.isArray(DADOS.books) && DADOS.books.length === 5,
  "n=" + ((DADOS.books || []).length));
check("v5 real: 344 capitulos", (DADOS.chapters || []).length === 344,
  "n=" + ((DADOS.chapters || []).length));
check("v5 real: 27 rotas", (DADOS.routes || []).length === 27,
  "n=" + ((DADOS.routes || []).length));
check("v5 real: 18 entradas geographically-described",
  descritos.length === 18, "n=" + descritos.length);
check("v5 real: 5 membros named-group-member",
  membros.length === 5, "n=" + membros.length);
check("v5 real: membro central Five_Forts_Central em 19586,9116",
  !!ponto(ID_CENTRAL) &&
    ponto(ID_CENTRAL).x === 19586 && ponto(ID_CENTRAL).y === 9116,
  ponto(ID_CENTRAL)
    ? ponto(ID_CENTRAL).x + "," + ponto(ID_CENTRAL).y
    : "ausente");
check("v5 real: nenhum rotulo anonimo 'Simbolo sem nome N'",
  cps.every((p) => !/^s[íi]mbolo sem nome/i.test(p.label || "")),
  (cps.find((p) => /^s[íi]mbolo sem nome/i.test(p.label || "")) || {})
    .id || "ok");
check("v5 real: 3 glifos rejeitados ausentes",
  REJEITADOS.every((id) => !ponto(id)),
  REJEITADOS.filter((id) => ponto(id)).join(",") || "ok");
check("v5 real: ponto corrigido " + ID_POLEIRO + " em 4806,8216",
  !!ponto(ID_POLEIRO) &&
    ponto(ID_POLEIRO).x === 4806 && ponto(ID_POLEIRO).y === 8216,
  ponto(ID_POLEIRO)
    ? ponto(ID_POLEIRO).x + "," + ponto(ID_POLEIRO).y
    : "ausente");

if (V4) {
  const seg5 = (DADOS.routes || []).reduce(
    (n, r) => n + (r.segments || []).length, 0);
  const pos5 = (DADOS.routes || []).reduce(
    (n, r) => n + (r.positions || []).length, 0);
  check("v5 real: 115 segmentos (congelado)", seg5 === 115, "n=" + seg5);
  check("v5 real: 152 posicoes (congelado)", pos5 === 152, "n=" + pos5);
  const r4 = {};
  (V4.routes || []).forEach((r) => { r4[r.id] = canon(r); });
  const difRotas = (DADOS.routes || []).filter(
    (r) => r4[r.id] !== canon(r)).map((r) => r.id);
  check("v5 real: rotas identicas ao v4 congelado (igualdade mecanica)",
    difRotas.length === 0 && Object.keys(r4).length ===
      (DADOS.routes || []).length,
    difRotas.join(",") || "ok");
} else {
  check("v4 congelado disponivel para comparacao mecanica",
    false, "atlas-inventario-v4.json ausente");
}

/* ---------- navegador ---------- */
const browser = await chromium.launch();
async function novaPagina(vp) {
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
  const invResps = [];
  page.on("response", (resp) => {
    if (resp.url().includes("/tiles/")) {
      tileResponses.push(resp.status() + " " + resp.url());
    }
    if (/inventario|piloto|agot/.test(resp.url())) {
      invResps.push(resp.status() + " " + resp.url().split("/").pop());
    }
  });
  /* fixa o salto mais novo: quando o v6 for publicado, esta suite
     continuaria testando o v5 real so com 404 explicito */
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.goto(BASE + "/atlas/");
  /* dados carregados (qualquer dataset) — tolera fila de sockets */
  await page.waitForSelector("#lista-personagens input[type=checkbox]",
    { state: "attached", timeout: 45000 });
  try {
    /* attached: em mobile a lateral nasce recolhida (display:none) */
    await page.waitForSelector("#livro-select:not([hidden])",
      { state: "attached", timeout: 15000 });
  } catch (e) {
    const diag = await page.evaluate(() => ({
      status: (document.querySelector("#localidades-status") || {})
        .textContent,
      livroHidden: document.querySelector("#livro-select") &&
        document.querySelector("#livro-select").hidden,
    })).catch(() => "(evaluate falhou)");
    diag.inventarioResps = invResps;
    diag.failed = failedReqs.slice(-3);
    throw new Error("livro-select não revelou: " +
      JSON.stringify(diag) + " | causa: " + e.message);
  }
  return { ctx, page, invResps };
}

/* itens visiveis da lista de localidades (ids via _ponto) */
function itensVisiveis(page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll("#loc-lista li:not([hidden])"))
      .map((li) => li._ponto && li._ponto.id));
}
async function buscar(page, q) {
  await page.fill("#loc-busca", q);
  await page.waitForTimeout(350);
  return itensVisiveis(page);
}
async function limparBusca(page) {
  await page.fill("#loc-busca", "");
  await page.waitForTimeout(250);
}

/* ---------- caminho feliz: v5 real sem interceptacao ---------- */
{
  const { ctx, page, invResps } =
    await novaPagina({ width: 1366, height: 900 });

  check("UI: v5 real carregado sem fallback",
    invResps.length === 1 &&
      /atlas-inventario-v5\.json$/.test(invResps[0]) &&
      invResps[0].startsWith("200"),
    invResps.join(", ") || "nenhum");
  const nota = await page.textContent("#localidades-nota");
  check("UI: nota mostra 240 referências",
    /240 referências/.test(nota || ""), (nota || "").slice(0, 60));
  check("UI: 27 perfis selecionáveis",
    (await page.locator(
      "#lista-personagens input[type=checkbox]").count()) === 27);
  check("UI: 5 livros no seletor",
    (await page.locator("#livro-select option").count()) === 5);

  /* --- buscas que resolvem identidades --- */
  let ids = await buscar(page, "Poleiro do Grifo");
  check("busca 'Poleiro do Grifo' resolve o ponto corrigido",
    ids.includes(ID_POLEIRO), JSON.stringify(ids.slice(0, 4)));
  ids = await buscar(page, "Griffin's Roost");
  check("busca em inglês 'Griffin's Roost' resolve o mesmo ponto",
    ids.includes(ID_POLEIRO), JSON.stringify(ids.slice(0, 4)));
  ids = await buscar(page, "Sinistres Gris");
  check("alias 'Sinistres Gris' resolve Ghaston Grey",
    ids.includes(ID_GHASTON), JSON.stringify(ids.slice(0, 4)));

  /* --- conjunto Cinco Fortes: a busca compartilhada retorna os 5 ---
     o termo e derivado do artefato (cobre pt ou en nos rotulos) */
  const alvo = (p) => [p.label, p.originalKey, p.english]
    .concat(Array.isArray(p.aliases) ? p.aliases : [])
    .filter(Boolean).join(" ").toLowerCase();
  const termos = ["cinco fortes", "five forts", "fortes", "forts"];
  const termo = termos.find((t) =>
    membros.every((m) => alvo(m).includes(t)));
  check("grupo: termo de busca compartilhado derivado do artefato",
    !!termo, termo || "nenhum termo comum aos 5");
  if (termo) {
    ids = await buscar(page, termo);
    const conj = new Set(membros.map((m) => m.id));
    check("grupo: busca retorna exatamente os 5 membros",
      ids.length === 5 && ids.every((id) => conj.has(id)),
      "visiveis=" + ids.length + " " + JSON.stringify(ids));
    check("grupo: inclui o membro central novo",
      ids.includes(ID_CENTRAL));
    check("grupo: membros sem nome próprio individual genérico",
      membros.every((m) =>
        m.identificationStatus === "named-group-member"));
  }

  /* --- rotulos anonimos antigos ausentes na lista renderizada --- */
  await limparBusca(page);
  const todosNomes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#loc-lista li .loc-item-nome"))
      .map((s) => s.textContent));
  check("UI: nenhum item renderiza 'Simbolo sem nome N'",
    todosNomes.length === 240 &&
      todosNomes.every((t) => !/^s[íi]mbolo sem nome/i.test(t)),
    "itens=" + todosNomes.length + " " +
      (todosNomes.find((t) => /^s[íi]mbolo sem nome/i.test(t)) || "ok"));

  /* --- 'Somente identificados' esconde os 18 descritos, mantem os 5 --- */
  await page.check("#loc-identificados");
  await page.waitForTimeout(400);
  ids = await itensVisiveis(page);
  const descIds = new Set(descritos.map((d) => d.id));
  check("filtro 'Somente identificados' esconde os 18 descritos",
    ids.every((id) => !descIds.has(id)),
    "descritos visiveis=" +
      ids.filter((id) => descIds.has(id)).length);
  check("filtro 'Somente identificados' mantém os 5 membros",
    membros.every((m) => ids.includes(m.id)));
  await page.uncheck("#loc-identificados");
  await page.waitForTimeout(300);

  /* --- popup honesto do ponto descrito (Ilha dos Ursos): clica no
     item EXATO cujo _ponto.id confere, nao no primeiro da lista --- */
  if (ponto(ID_URSO)) {
    const li = await buscar(page, ponto(ID_URSO).label);
    if (li.includes(ID_URSO)) {
      const clicou = await page.evaluate((pid) => {
        const item = Array.from(
          document.querySelectorAll("#loc-lista li:not([hidden])"))
          .find((l) => l._ponto && l._ponto.id === pid);
        if (!item) return false;
        item.querySelector(".loc-item").click();
        return true;
      }, ID_URSO);
      try {
        check("popup descrito: item exato clicável", clicou === true);
        await page.waitForSelector(".leaflet-popup", { timeout: 8000 });
        const txt = await page.locator(".leaflet-popup").textContent();
        check("popup descrito: texto honesto de descrição geográfica",
          /Descrição geográfica; a fonte não informa nome próprio/i
            .test(txt || ""), (txt || "").slice(0, 90));
        check("popup descrito: não clama nome impresso",
          !/Nome impresso/.test(txt || ""));
      } catch (e) {
        check("popup descrito: texto honesto de descrição geográfica",
          false, "popup não abriu: " + e.message.slice(0, 60));
      }
    } else {
      check("popup descrito: ponto " + ID_URSO + " encontrado na busca",
        false, JSON.stringify(li.slice(0, 4)));
    }
  }

  await page.screenshot({ path: join(OUT, "nomes-v5-desktop.png") });
  await ctx.close();
}

/* ---------- nativo: popups do ponto corrigido, do grupo e descrito ---
   fluxo de usuario: buscar o rotulo exato congelado e clicar no item
   cujo _ponto.id coincide — o foco voa ate o ponto (cria o marcador na
   area visivel) e abre o popup; no nativo o zoom de busca da o closeup */
{
  const { ctx, page } = await novaPagina({ width: 1366, height: 900 });
  /* nativo sobe sozinho no boot — espera os tiles como ponto de
     sincronia antes das leituras de geometria */
  await page.waitForSelector("img.leaflet-tile-loaded",
    { timeout: 30000 });

  const abrirPopupPonto = async (id) => {
    const lbl = ponto(id) && ponto(id).label;
    if (!lbl) return "sem-label";
    const ids = await buscar(page, lbl);
    if (!ids.includes(id)) {
      return "sem-item:" + JSON.stringify(ids.slice(0, 3));
    }
    const clicou = await page.evaluate((pid) => {
      const li = Array.from(
        document.querySelectorAll("#loc-lista li:not([hidden])"))
        .find((l) => l._ponto && l._ponto.id === pid);
      if (!li) return false;
      li.querySelector(".loc-item").click();
      return true;
    }, id);
    if (!clicou) return "sem-clique";
    try {
      await page.waitForSelector(".leaflet-popup",
        { state: "visible", timeout: 12000 });
      return "popup";
    } catch { return "sem-popup"; }
  };
  const marcadorDe = (id) => page.evaluate((args) => {
    let achou = null;
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Marker && l._ponto &&
          l._ponto.id === args.id) {
        const ll = l.getLatLng();
        /* cls do pino fica no div interno do divIcon
           (wrapper externo e loc-pin-wrap) */
        achou = { lat: ll.lat, lng: ll.lng,
          simbolo: /loc-pin-simbolo/.test(
            l._icon ? l._icon.innerHTML : "") };
      }
    });
    return achou;
  }, { id });

  /* ponto corrigido: foco de busca -> closeup nativo -> marcador */
  const st300 = await abrirPopupPonto(ID_POLEIRO);
  if (st300 === "popup") {
    /* espera o flyTo atingir o zoom alvo de busca (4) — o popup
       abre antes do fim da animacao; sem espera, a leitura cai
       no meio do voo (~2–3.9) */
    await page.waitForFunction(() =>
      window.__atlasMap && window.__atlasMap.getZoom() >= 3.9999,
      null, { timeout: 15000 }).catch(() => {});
    const zoom = await page.evaluate(() => window.__atlasMap.getZoom());
    /* flyTo de busca mira zoom nativo 4; o pouso fracionado pode
       ficar a ~1e-4 abaixo — closeup e ~4, nao zoom mundi */
    check("nativo: foco de busca gera closeup nativo (zoom≈4)",
      zoom >= 3.99, "zoom=" + zoom);
    const esp = await page.evaluate((args) =>
      window.__atlasMap.unproject([args.x, args.y], args.maxZ),
      { x: 4806, y: 8216, maxZ: MAN.maxNativeZoom });
    const ll300 = await marcadorDe(ID_POLEIRO);
    check("nativo: marcador " + ID_POLEIRO + " ancorado em 4806,8216",
      !!ll300 && Math.abs(ll300.lat - esp.lat) < 1e-4 &&
        Math.abs(ll300.lng - esp.lng) < 1e-4,
      ll300 ? "dlat=" + (ll300.lat - esp.lat).toFixed(6)
        : "sem marcador");
    check("nativo: ponto identificado não é pino vazio",
      !!ll300 && ll300.simbolo === false);
    const txt = await page.locator(".leaflet-popup").textContent();
    check("nativo: popup do ponto corrigido mostra o nome próprio",
      /poleiro/i.test(txt || ""), (txt || "").slice(0, 80));
    await page.screenshot(
      { path: join(OUT, "nomes-v5-popup-poleiro.png") });
  } else {
    check("nativo: popup do ponto corrigido abre", false, st300);
  }
  await page.locator(".leaflet-popup-close-button")
    .click().catch(() => {});

  /* membro do conjunto: pino identificado, popup de identificação de
     conjunto */
  const membroAlvo = membros.find((m) => m.id === ID_CENTRAL) ||
    membros[0];
  if (membroAlvo) {
    const stG = await abrirPopupPonto(membroAlvo.id);
    if (stG === "popup") {
      await page.waitForTimeout(500);
      const txt = await page.locator(".leaflet-popup").textContent();
      check("nativo: popup de membro identifica o conjunto",
        /Identificação do conjunto|conjunto/i.test(txt || ""),
        (txt || "").slice(0, 90));
      await page.screenshot(
        { path: join(OUT, "nomes-v5-popup-grupo.png") });
    } else {
      check("nativo: popup de membro abre", false, stG);
    }
    await page.locator(".leaflet-popup-close-button")
      .click().catch(() => {});
  }

  /* ponto descrito: pino vazio (símbolo) + popup honesto */
  if (ponto(ID_URSO)) {
    const stD = await abrirPopupPonto(ID_URSO);
    if (stD === "popup") {
      await page.waitForTimeout(500);
      const simU = await marcadorDe(ID_URSO);
      check("nativo: ponto descrito mantém pino vazio (símbolo)",
        !!simU && simU.simbolo === true,
        simU ? "simbolo=" + simU.simbolo : "sem marcador");
      const txt = await page.locator(".leaflet-popup").textContent();
      check("nativo: popup descrito honesto (sem nome próprio)",
        /Descrição geográfica; a fonte não informa nome próprio/i
          .test(txt || ""), (txt || "").slice(0, 80));
      await page.screenshot(
        { path: join(OUT, "nomes-v5-popup-descricao.png") });
    } else {
      check("nativo: popup descrito abre", false, stD);
    }
  }

  await ctx.close();
}

/* ---------- v5 PRESENTE invalido: falha fechado, sem downgrade ------ */
{
  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) =>
    pageErrors.push("[v5-invalido] " + e.message));
  let pediuAntigo = false;
  page.on("request", (r) => {
    if (/atlas-inventario-v4|atlas-inventario-v3|atlas-agot-v2|piloto-norte/
        .test(r.url())) {
      pediuAntigo = true;
    }
  });
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 2, datasetId: "atlas-saga-v5",
        mapId: "o-mundo-conhecido",
        tileSetId: "o-mundo-conhecido-recorte-v1",
        sourceSha256: "0".repeat(64),
        coordinateSystem: "cropped-native-pixels",
        mapWidth: 21654, mapHeight: 14428,
        cropBoxOriented: [0, 2336, 21654, 16764],
        /* capitulos com lacuna -> invalido */
        chapters: [{ index: 0, title: "Capítulo 0" },
                   { index: 5, title: "Capítulo 5" }],
        controlPoints: [{ id: "x", x: 1, y: 1 }]
      })
    }));
  await page.goto(BASE + "/atlas/");
  let st = "";
  try {
    /* espera o status assentar (falha fechada), nao um tempo fixo */
    await page.waitForFunction(() => {
      const s = document.querySelector("#localidades-status");
      return s &&
        /indisponíveis|inválid|erro/i.test(s.textContent);
    }, null, { timeout: 15000 });
  } catch { /* status nunca assentou — capturado abaixo */ }
  st = await page.textContent("#localidades-status");
  check("v5 inválido: status indisponível/inválido",
    /indisponíveis|inválid|erro/i.test(st || ""),
    (st || "(vazio)").slice(0, 80));
  check("v5 inválido: controles travados, livro oculto",
    await page.evaluate(() =>
      document.querySelector("#loc-busca").disabled &&
      document.querySelector("#livro-select").hidden));
  check("v5 inválido: NUNCA requisita v4/v3/v2/v1",
    pediuAntigo === false);
  await ctx.close();
}

/* ---------- v5 HTTP 500 (nao-404): falha fechado, sem fallback ------ */
{
  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) =>
    pageErrors.push("[v5-500] " + e.message));
  let pediuAntigo = false;
  page.on("request", (r) => {
    if (/atlas-inventario-v4|atlas-inventario-v3|atlas-agot-v2|piloto-norte/
        .test(r.url())) {
      pediuAntigo = true;
    }
  });
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 500, body: "erro" }));
  await page.goto(BASE + "/atlas/");
  let st = "";
  try {
    await page.waitForFunction(() => {
      const s = document.querySelector("#localidades-status");
      return s &&
        /indisponíveis|inválid|erro/i.test(s.textContent);
    }, null, { timeout: 15000 });
  } catch { /* status nunca assentou — capturado abaixo */ }
  st = await page.textContent("#localidades-status");
  check("v5 HTTP 500: status indisponível/erro",
    /indisponíveis|inválid|erro/i.test(st || ""),
    (st || "(vazio)").slice(0, 80));
  check("v5 HTTP 500: controles travados, livro oculto",
    await page.evaluate(() =>
      document.querySelector("#loc-busca").disabled &&
      document.querySelector("#livro-select").hidden));
  check("v5 HTTP 500: NUNCA requisita v4/v3/v2/v1",
    pediuAntigo === false);
  await ctx.close();
}

/* ---------- v5 404 explicito: cai para o v4 real (242) -------------- */
{
  const ctx = await browser.newContext(
    { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const invResps = [];
  page.on("response", (r) => {
    if (/inventario|piloto|agot/.test(r.url())) {
      invResps.push(r.status() + " " + r.url().split("/").pop());
    }
  });
  await page.route("**/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#lista-personagens input[type=checkbox]",
    { state: "attached", timeout: 45000 });
  const nota = await page.textContent("#localidades-nota");
  check("v5 404: fallback carrega v4 real (242 referências)",
    /242 referências/.test(nota || ""), (nota || "").slice(0, 60));
  check("v5 404: resposta foi 404 do v5 + 200 do v4",
    invResps.some((s) => /^404 atlas-inventario-v5/.test(s)) &&
      invResps.some((s) => /^200 atlas-inventario-v4/.test(s)),
    invResps.join(", "));
  check("v5 404: livro-select funciona no fallback v4",
    await page.evaluate(() =>
      !document.querySelector("#livro-select").hidden));
  await ctx.close();
}

/* ---------- mobile 390 + 320: sem overflow; seletor acessivel ------- */
for (const largura of [390, 320]) {
  const { ctx, page } =
    await novaPagina({ width: largura, height: 844 });
  const ov = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth);
  check("mobile " + largura + ": sem overflow horizontal",
    ov <= 1, "overflow=" + ov);
  /* o painel nasce recolhido; o seletor de livro fica acessivel apos
     expandir */
  await page.click("#btn-painel");
  await page.waitForTimeout(400);
  const vis = await page.evaluate(() => {
    const s = document.querySelector("#livro-select");
    const r = s.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  check("mobile " + largura + ": livro-select acessível após expandir",
    vis === true);
  if (vis) {
    await page.selectOption("#livro-select", "adwd");
    await page.waitForTimeout(400);
    const cap = await page.inputValue("#cap-select");
    check("mobile " + largura + ": ADWD vai ao cap. 271",
      cap === "271", "cap=" + cap);
  }
  await page.screenshot(
    { path: join(OUT, "nomes-v5-mobile-" + largura + ".png") });
  await ctx.close();
}

/* ---------- higiene de rede/erros ---------- */
const ext = requests.filter((u) => !u.startsWith(BASE));
check("nenhuma requisição externa", ext.length === 0,
  ext.slice(0, 3).join(" | ") || "todas locais");
const mestres = requests.filter((u) => /mapas\/jpeg|master|original/i.test(u));
check("nenhum fetch de imagem mestre", mestres.length === 0,
  mestres.join(", ") || "ok");
const tilesRuins = tileResponses.filter((s) => !/^200 /.test(s));
check("tiles realmente requisitados no nativo",
  tileResponses.length > 0, "n=" + tileResponses.length);
check("todas respostas de tile HTTP 200", tilesRuins.length === 0,
  tilesRuins.join(", ") || "ok");
check("nenhuma requisição falha", failedReqs.length === 0,
  failedReqs.join(" | ") || "ok");
check("sem pageerrors", pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "));

await browser.close();

writeFileSync(join(OUT, "nomes-v5-resultados.txt"),
  results.join("\n") + "\n");
console.log("— verificar-nomes-v5 —");
results.forEach((r) => console.log(r));
const falhas = results.filter((r) => r.startsWith("FAIL"));
console.log(falhas.length
  ? falhas.length + " falha(s)"
  : "0 falhas — " + results.length + " checagens");
process.exit(falhas.length ? 1 : 0);
