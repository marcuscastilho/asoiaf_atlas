// Verificacao de UI de trajetos (rotas) na interface simplificada:
// selecao desenha linhas automaticamente, casing de linha, tooltip e
// popup compacto de trecho, Centralizar, Limpar e colapso do painel.
// Roda contra dados REAIS (v3) no servidor local — sem interceptacao
// de dados (v6/v5/v4 fixados em 404 para isolar o caminho v3).

import { chromium } from "playwright";
import { pausarTilesAutomaticos, liberarTilesAutomaticos }
  from "./lib-tiles-auto.mjs";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const BASE = "http://127.0.0.1:8080";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "evidencias");
mkdirSync(OUT, { recursive: true });

const DATA = JSON.parse(readFileSync(
  new URL("../data/atlas-inventario-v3.json", import.meta.url), "utf8"));

const results = [];
const pageErrors = [];
function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name +
    (detail ? " — " + detail : ""));
}

const browser = await chromium.launch();

async function novaPagina(vp) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  /* isola a suite nos saltos v6/v5/v4: continua exercitando o
     caminho v3 real */
  await page.route("**/atlas/data/atlas-percursos-v7.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-inventario-v4.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  page.on("pageerror", (e) => pageErrors.push(e.message));
  /* os contextos que nao exercitam a transicao ficam em previa como
     antes; o bloco nativo libera no ponto do antigo clique */
  await pausarTilesAutomaticos(page);
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li",
    { state: "attached", timeout: 20000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}

async function setCap(page, n) {
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, n);
  await page.waitForTimeout(400);
}

async function linhasCor(page) {
  return page.evaluate(() => {
    const out = [];
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Polyline && !(l instanceof L.Polygon)) {
        out.push({
          w: l.options.weight, dash: l.options.dashArray || null,
          cor: l.options.color, inter: !!l.options.interactive,
          lats: l.getLatLngs().map((p) => [p.lat, p.lng])
        });
      }
    });
    return out;
  });
}

/* todos os vertices das linhas interativas dentro dos bounds do mapa */
async function linhasDentroDosBounds(page) {
  return page.evaluate(() => {
    const map = window.__atlasMap;
    const b = map.getBounds();
    let n = 0, fora = 0, completas = 0;
    map.eachLayer((l) => {
      if (l instanceof L.Polyline && !(l instanceof L.Polygon) &&
          l.options.interactive && l.options.weight === 4) {
        let ok = true;
        l.getLatLngs().forEach((p) => {
          n++;
          if (!b.contains(p)) { fora++; ok = false; }
        });
        if (ok) completas++;
      }
    });
    return { n, fora, completas };
  });
}

/* clica sobre o traco de uma linha visivel: amostra getPointAtLength
   (geometria real do path SVG) e so clica onde elementFromPoint acha
   o path — gaps do tracejado e pinos sao pulados */
async function clicarNaLinha(page) {
  const fechar = page.locator(".leaflet-popup-close-button");
  if (await fechar.count()) {
    await fechar.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  const pts = await page.evaluate(() => {
    const map = window.__atlasMap;
    const out = [];
    map.eachLayer((l) => {
      if (l instanceof L.Polyline && !(l instanceof L.Polygon) &&
          l.options.interactive && l.options.weight === 4 && l._path) {
        const path = l._path;
        const total = path.getTotalLength();
        const ctm = path.getScreenCTM();
        for (let d = 12; d < total && out.length < 80; d += 9) {
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
      const t = await page.locator(".leaflet-popup").textContent();
      if (/·/.test(t) && /cap\./.test(t)) return t;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    } catch (e) { /* clique nao abriu popup */ }
  }
  return null;
}

/* popup inteiramente dentro do quadro do mapa (titulo/fechar nao
   ficam clipados acima do mapa) */
async function popupDentroDoMapa(page) {
  return page.evaluate(() => {
    const mapa = document.getElementById("mapa").getBoundingClientRect();
    const pop = document.querySelector(".leaflet-popup");
    if (!pop) return null;
    const r = pop.getBoundingClientRect();
    const fechar = pop.querySelector(".leaflet-popup-close-button");
    const rf = fechar ? fechar.getBoundingClientRect() : r;
    const dentro = (x) =>
      x.left >= mapa.left - 2 && x.right <= mapa.right + 2 &&
      x.top >= mapa.top - 2 && x.bottom <= mapa.bottom + 2;
    return { pop: dentro(r), fechar: dentro(rf) };
  });
}

// ---------- desktop: controles, camadas, popup compacto ----------
{
  const { ctx, page } = await novaPagina({ width: 1366, height: 900 });

  check("controles de trajeto presentes",
    (await page.locator("#btn-focus-pers").count()) === 1 &&
      (await page.locator("#btn-livro-completo").count()) === 1 &&
      (await page.locator("#btn-limpar-sel").count()) === 1);
  check("botoes desabilitados sem selecao",
    (await page.locator("#btn-focus-pers").isDisabled()) &&
      (await page.locator("#btn-livro-completo").isDisabled()) &&
      (await page.locator("#btn-limpar-sel").isDisabled()));
  check("carrega no capitulo 0 (sem salto para o fim)",
    (await page.locator("#cap-slider").inputValue()) === "0");
  check("sem roteiro/ver-percurso/markerOnly na UI",
    (await page.locator(
      "#roteiro-personagens, #btn-ver-percurso, #cap-somente").count())
      === 0);

  // jon + catelyn em ch19: linha + posicao
  await page.check("#chk-jon");
  await page.check("#chk-catelyn");
  await page.waitForTimeout(300);
  check("selecionar nao pula para o capitulo final",
    (await page.locator("#cap-slider").inputValue()) === "0");
  check("ch0 com posicao visivel: Centralizar habilitado",
    !(await page.locator("#btn-focus-pers").isDisabled()),
    "jon pos 0-0@Winterfell");
  check("linha curta do selecionado no cap. 0",
    await page.evaluate(() =>
      [...document.querySelectorAll(".pers-atual-item")]
        .some((e) => /Jon Snow — /.test(e.textContent))));

  await setCap(page, 19);
  check("Ver livro completo habilitado com selecao",
    !(await page.locator("#btn-livro-completo").isDisabled()));

  /* casing: cada perna = contorno escuro solido (8) + linha cor (4) */
  const camadas = await linhasCor(page);
  const contornos = camadas.filter((c) => c.w === 8 && !c.dash && !c.inter);
  const linhas = camadas.filter((c) => c.w === 4 && c.inter);
  check("contorno solido 8px sob cada perna",
    contornos.length > 0 && contornos.length === linhas.length,
    "contornos=" + contornos.length + " linhas=" + linhas.length);
  check("linhas de cor tracejadas (aproximado) e interativas",
    linhas.length > 0 &&
      linhas.every((c) => c.dash === "8 5" || c.dash === "3 7"),
    JSON.stringify(linhas.map((c) => c.dash)));
  const segCat = (DATA.routes.find((r) => r.id === "catelyn").segments)
    .find((s) => s.transportLegs);
  const temMar = segCat.transportLegs.some((l) => l.mode === "sea");
  check("perna maritima usa tracejado 3 7",
    !temMar || linhas.some((c) => c.dash === "3 7"),
    "dashes=" + linhas.map((c) => c.dash).join(","));

  // clique na linha abre popup compacto de trecho
  const txt = await clicarNaLinha(page);
  check("popup de trecho aberto pelo clique na linha", !!txt);
  if (txt) {
    check("popup compacto: personagem · origem → destino",
      /Jon Snow|Catelyn/.test(txt) && /·/.test(txt),
      txt.trim().slice(0, 100));
    check("popup compacto: modo + capitulo",
      /cap\.\s*\d/.test(txt), txt.trim().slice(0, 100));
    check("popup: sem fontes/evidencias/detalhes",
      !/Fontes|evid|proveni|revis|precis/i.test(txt),
      txt.trim().slice(0, 100));
    check("um unico popup",
      (await page.locator(".leaflet-popup").count()) === 1);
    const dentro = await popupDentroDoMapa(page);
    check("popup compacto dentro do mapa (titulo/fechar)",
      !!dentro && dentro.pop && dentro.fechar,
      JSON.stringify(dentro));

    /* recuar o capitulo esconde o trecho -> popup fecha (spoiler) */
    await setCap(page, 0);
    await page.waitForTimeout(300);
    check("recuar capitulo fecha popup de trecho futuro",
      (await page.locator(".leaflet-popup").count()) === 0);
    await setCap(page, 19);
  }

  // tooltip do ponteiro sobre a linha (mouseover no path)
  const dispararHover = () => page.evaluate(() => {
    const map = window.__atlasMap;
    let ok = false;
    map.eachLayer((l) => {
      if (l instanceof L.Polyline && l.options.interactive &&
          l.options.weight === 4 && !ok) {
        l.fire("mouseover", { latlng: l.getLatLngs()[0] });
        ok = true;
      }
    });
    return ok;
  });
  let tipOk = false;
  for (let tent = 0; tent < 3 && !tipOk; tent++) {
    tipOk = await dispararHover();
    try {
      await page.waitForSelector(".leaflet-tooltip", { timeout: 1500 });
      tipOk = true;
    } catch (e) { tipOk = false; }
  }
  check("tooltip de trecho visivel no hover", tipOk &&
    (await page.locator(".leaflet-tooltip").count()) >= 1);
  if (await page.locator(".leaflet-tooltip").count()) {
    const tt = await page.locator(".leaflet-tooltip").first().textContent();
    check("tooltip traz personagem",
      /Jon Snow|Catelyn/.test(tt), tt.trim().slice(0, 60));
  }
  await page.evaluate(() => {
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Polyline && l.options.interactive) {
        l.fire("mouseout");
      }
    });
  });

  // Centralizar enquadra as posicoes visiveis dos selecionados
  await page.evaluate(() =>
    window.__atlasMap.setView(
      window.__atlasMap.unproject([6000, 6000],
        window.__atlasMap.getMaxZoom()), 0, { animate: false }));
  await page.waitForTimeout(300);
  await page.click("#btn-focus-pers");
  await page.waitForTimeout(1600);
  const jonC = await page.evaluate(() => {
    const el = document.querySelector(".loc-pin-jon");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const mb = document.getElementById("mapa").getBoundingClientRect();
    return r.left >= mb.left && r.right <= mb.right &&
      r.top >= mb.top && r.bottom <= mb.bottom;
  });
  check("Centralizar enquadra a posicao do selecionado", !!jonC);

  // Limpar esvazia selecao, linhas e linhas de status
  await page.click("#btn-limpar-sel");
  await page.waitForTimeout(400);
  check("Limpar: sem linhas de trajeto",
    (await page.locator(".leaflet-overlay-pane path").count()) === 0);
  check("Limpar: sem linhas de status",
    (await page.locator(".pers-atual-item").count()) === 0);

  // selecao de volta + Ver livro completo: capitulo final do livro
  await page.check("#chk-jon");
  await page.check("#chk-catelyn");
  await setCap(page, 18);
  await page.click("#btn-livro-completo");
  await page.waitForTimeout(600);
  check("Ver livro completo -> ultimo capitulo do livro (72)",
    (await page.locator("#cap-slider").inputValue()) === "72",
    "slider=" + (await page.locator("#cap-slider").inputValue()));
  check("capitulo persistido no storage",
    JSON.parse(await page.evaluate(() =>
      localStorage.getItem("gotatlas-estado-atlas-inventario-v3") || "{}"
    )).cap === 72);

  await page.screenshot({ path: join(OUT, "rotas-desktop.png"), fullPage: true });
  await ctx.close();
}

// ---------- nativo: popup compacto da Daenerys (rotas reais) ----------
{
  const { ctx, page } = await novaPagina({ width: 1366, height: 900 });
  await page.check("#chk-daenerys");
  await setCap(page, 61);
  /* esconde pinos de localidades para evidenciar as rotas reais */
  await page.uncheck("#loc-mostrar");
  await page.waitForTimeout(400);

  /* popup de trecho aberto em preview NAO sobrevive a troca de modo:
     coordenadas de outro sistema nao fazem sentido */
  const txtPrev = await clicarNaLinha(page);
  check("preview: popup de trecho aberto antes dos tiles",
    !!txtPrev && /Daenerys/.test(txtPrev),
    txtPrev ? txtPrev.trim().slice(0, 60) : "sem popup");

  liberarTilesAutomaticos(page);
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(1400);
  check("preview->nativo: popup do modo anterior fechado",
    (await page.locator(".leaflet-popup").count()) === 0);
  const nLinhas = await page.locator(
    ".leaflet-overlay-pane path[stroke-dasharray]").count();
  check("nativo: pernas tracejadas da Daenerys desenhadas", nLinhas >= 3,
    "paths=" + nLinhas);
  const txt = await clicarNaLinha(page);
  check("nativo: popup de trecho da Daenerys", !!txt && /Daenerys/.test(txt),
    txt ? txt.trim().slice(0, 80) : "sem popup");
  if (txt) {
    check("nativo: um unico popup",
      (await page.locator(".leaflet-popup").count()) === 1);
    const dentro = await popupDentroDoMapa(page);
    check("nativo: popup dentro do mapa", !!dentro && dentro.pop,
      JSON.stringify(dentro));
    check("nativo: popup compacto sem fontes/detalhes",
      !/Fontes|evid|proveni|revis|precis/i.test(txt),
      txt.trim().slice(0, 100));
    await page.screenshot({ path: join(OUT, "rotas-nativo.png"), fullPage: true });
  }
  await ctx.close();
}

// ---------- multi-personagem + mobile ----------
{
  const { ctx, page } = await novaPagina({ width: 390, height: 844 });
  check("mobile 390 sem overflow horizontal",
    (await page.evaluate(() =>
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth)) === 0);
  check("mobile: painel inicia recolhido",
    (await page.locator("#lateral.lateral-fechada").count()) === 1);
  await page.click("#btn-painel");
  await page.waitForTimeout(400);
  await page.check("#chk-jon");
  await page.check("#chk-tyrion");
  await page.check("#chk-catelyn");
  await setCap(page, 19);
  check("mobile: 3 personagens selecionados com linhas",
    (await page.locator("#lista-personagens input:checked").count()) === 3 &&
      (await page.locator(
        ".leaflet-overlay-pane path.leaflet-interactive").count()) > 0);
  check("mobile: botoes de trajeto habilitados",
    !(await page.locator("#btn-livro-completo").isDisabled()) &&
      !(await page.locator("#btn-limpar-sel").isDisabled()));
  await page.screenshot({ path: join(OUT, "rotas-mobile-390.png"), fullPage: true });
  await ctx.close();
}

// ---------- mobile 320 ----------
{
  const { ctx, page } = await novaPagina({ width: 320, height: 568 });
  check("mobile 320 sem overflow horizontal",
    (await page.evaluate(() =>
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth)) === 0);
  await page.click("#btn-painel");
  await page.waitForTimeout(400);
  await page.check("#chk-catelyn");
  await setCap(page, 18);
  check("320: linha de status da personagem",
    await page.evaluate(() =>
      [...document.querySelectorAll(".pers-atual-item")]
        .some((e) => /Catelyn/.test(e.textContent))));
  await page.screenshot({ path: join(OUT, "rotas-mobile-320.png"), fullPage: true });
  await ctx.close();
}

await browser.close();

check("sem pageerrors em toda a suite",
  pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "));

results.forEach((r) => console.log(r));
if (pageErrors.length) {
  console.log("---- pageerrors ----");
  pageErrors.forEach((e) => console.log("PAGEERROR " + e));
}
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log(results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
