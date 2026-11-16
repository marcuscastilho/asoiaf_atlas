// Verificacao de UI de trajetos (rotas): Ver percurso, Ver livro
// completo, roteiro clicavel, "Ver so este", casing de linha e
// popup/tooltip de trecho no nivel do mapa.
// Roda contra dados REAIS (v3) no servidor local — sem interceptacao.

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
  /* isola a suite nos saltos v5/v4: quando os dados mais novos forem
     publicados esta suite continua exercitando o caminho v3 real */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
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
  /* fecha popup aberto antes: senao waitForSelector resolve contra o
     elemento antigo enquanto o novo ainda esta abrindo */
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
      if (/Corredor|Trecho|Disponível a partir/.test(t)) return t;
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

// ---------- desktop: controles, camadas, popup, roteiro ----------
{
  const { ctx, page } = await novaPagina({ width: 1366, height: 900 });

  check("controles de trajeto presentes",
    (await page.locator("#btn-ver-percurso").count()) === 1 &&
      (await page.locator("#btn-livro-completo").count()) === 1 &&
      (await page.locator("#roteiro-personagens").count()) === 1);
  check("botoes desabilitados sem selecao",
    (await page.locator("#btn-ver-percurso").isDisabled()) &&
      (await page.locator("#btn-livro-completo").isDisabled()));
  check("carrega no capitulo 0 (sem salto para o fim)",
    (await page.locator("#cap-slider").inputValue()) === "0");

  // jon + catelyn em ch19: linha + posicao
  await page.check("#chk-jon");
  await page.check("#chk-catelyn");
  await page.waitForTimeout(300);
  check("selecionar nao pula para o capitulo final",
    (await page.locator("#cap-slider").inputValue()) === "0");
  check("ch0 com posicao visivel: Ver percurso habilitado",
    !(await page.locator("#btn-ver-percurso").isDisabled()),
    "jon pos 0-0@Winterfell");

  await setCap(page, 19);
  check("Ver percurso habilitado com geometria visivel",
    !(await page.locator("#btn-ver-percurso").isDisabled()));
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

  // clique na linha abre popup de trecho (popup no nivel do mapa)
  const txt = await clicarNaLinha(page);
  check("popup de trecho aberto pelo clique na linha", !!txt);
  if (txt) {
    check("popup: personagem + disponibilidade + modo",
      /Jon Snow|Catelyn/.test(txt) &&
        /Disponível a partir do cap\.\s*\d/.test(txt),
      txt.trim().slice(0, 100));
    check("popup: nao sugere duracao de viagem",
      !/Capítulos\s+\d+–\d+/.test(txt));
    check("popup: fontes/detalhes recolhidos em <details>",
      /Fontes e detalhes técnicos/.test(txt) &&
        (await page.locator(
          ".leaflet-popup details summary").count()) >= 1);
    check("popup de trecho nao afirma medicao",
      /não é posição exata/i.test(txt), txt.trim().slice(0, 100));
    check("um unico popup",
      (await page.locator(".leaflet-popup").count()) === 1);

    /* sobrevive a autoPan/moveend (rebuild das linhas nao fecha) */
    const moveu = page.waitForEvent("requestfinished",
      { timeout: 1500 }).catch(() => null);
    await page.waitForTimeout(1200);
    await moveu;
    const dentro = await popupDentroDoMapa(page);
    check("popup compacto dentro do mapa (titulo/fechar)",
      !!dentro && dentro.pop && dentro.fechar,
      JSON.stringify(dentro));
    check("popup sobrevive a moveend/rebuild das linhas",
      (await page.locator(".leaflet-popup").count()) === 1);

    /* recuar o capitulo esconde o trecho -> popup fecha (spoiler) */
    await setCap(page, 0);
    await page.waitForTimeout(300);
    check("recuar capitulo fecha popup de trecho futuro",
      (await page.locator(".leaflet-popup").count()) === 0);
    await setCap(page, 19);
  }

  /* expandir <details> com ancora perto do topo DO MAPA: update()
     refaz o autoPan e o popup inteiro fica dentro do mapa. Enquadra
     as rotas antes para ganhar espaco de pan (perto da borda norte
     da imagem, setMaxBounds impediria o pan necessario) */
  await page.click("#btn-ver-percurso");
  await page.waitForTimeout(1400);
  const ancTopo = await page.evaluate(() => {
    const map = window.__atlasMap;
    const topoMapa = document.getElementById("mapa")
      .getBoundingClientRect().top;
    function amostras(limiteAcima) {
      const out = [];
      map.eachLayer((l) => {
        if (!(l instanceof L.Polyline) || l instanceof L.Polygon ||
            !l.options.interactive || l.options.weight !== 4 ||
            !l._path) return;
        const path = l._path;
        const total = path.getTotalLength();
        const ctm = path.getScreenCTM();
        for (let d = 12; d < total; d += 4) {
          const pt = path.getPointAtLength(d);
          const x = pt.x * ctm.a + ctm.e, y = pt.y * ctm.d + ctm.f;
          if (y > topoMapa + limiteAcima) continue;
          const el = document.elementFromPoint(x, y);
          if (el && /path/i.test(el.tagName)) out.push({ x, y });
        }
      });
      return out;
    }
    /* abre folga norte ANTES: sobe o conteudo (vista vai para o sul
       da imagem) — assim o autoPan/correcao tem espaco para revelar
       o popup expandido que transborda o topo do mapa */
    map.panBy([0, 400], { animate: false });
    return amostras(170).sort((a, b) => a.y - b.y).slice(0, 12);
  });
  check("linha posicionada perto do topo do mapa",
    Array.isArray(ancTopo) && ancTopo.length > 0,
    Array.isArray(ancTopo) ? "amostras=" + ancTopo.length :
      JSON.stringify(ancTopo));
  let popupTopo = false;
  if (Array.isArray(ancTopo)) {
    for (const p of ancTopo) {
      await page.mouse.click(p.x, p.y);
      try {
        await page.waitForSelector(".leaflet-popup", { timeout: 500 });
        const t = await page.locator(".leaflet-popup").textContent();
        if (/Disponível a partir|Corredor|Trecho/.test(t)) {
          popupTopo = true;
          break;
        }
      } catch (e) { /* amostra nao clicavel — tenta a proxima */ }
      await page.evaluate(() => {
        try { window.__atlasMap.closePopup(); } catch (e) {}
      });
      await page.waitForTimeout(150);
    }
    check("popup aberto por clique real perto do topo",
      popupTopo);
    if (!popupTopo) { /* sem popup — pula a expansao */ }
    await page.waitForTimeout(1000);
    const sum = page.locator(".leaflet-popup details summary").first();
    if (await sum.count()) {
      await sum.click();
      await page.waitForTimeout(1000);
      const dentro = await popupDentroDoMapa(page);
      check("expandir detalhes: popup inteiro segue dentro do mapa",
        !!dentro && dentro.pop && dentro.fechar,
        JSON.stringify(dentro));
    }
    /* ancora perto da borda pode deixar o botao clipado — fecha via
       mapa para nao depender do alvo clicavel */
    await page.evaluate(() => {
      try { window.__atlasMap.closePopup(); } catch (e) {}
    });
    await page.waitForTimeout(400);
  }
  /* o Ver percurso recolheu o painel — reabre para o restante */
  await page.click("#btn-painel");
  await page.waitForTimeout(400);

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
      break;
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

  // Ver percurso: recolhe painel e enquadra TODAS as linhas visiveis
  const painelAntes = await page.locator("#lateral.lateral-fechada").count();
  await page.click("#btn-ver-percurso");
  await page.waitForTimeout(1400);
  check("Ver percurso recolhe o painel aberto",
    painelAntes === 0 &&
      (await page.locator("#lateral.lateral-fechada").count()) === 1);
  const encaixe = await linhasDentroDosBounds(page);
  check("Ver percurso enquadra todos os vertices das linhas",
    encaixe.n > 0 && encaixe.fora === 0,
    "vertices=" + encaixe.n + " fora=" + encaixe.fora);

  // reabrir o painel para seguir operando os controles
  await page.click("#btn-painel");
  await page.waitForTimeout(400);

  // markerOnly -> Ver percurso: habilita via trechos e desliga
  await page.check("#cap-somente");
  await page.waitForTimeout(300);
  check("markerOnly: Ver percurso segue habilitado (ha trechos)",
    !(await page.locator("#btn-ver-percurso").isDisabled()));
  check("markerOnly esconde linhas de trajeto",
    (await page.locator(".leaflet-overlay-pane path").count()) === 0);
  const rotMo = await page.locator("#roteiro-personagens").textContent();
  check("roteiro lista trecho mesmo em markerOnly",
    /a partir do cap\.\s*18/.test(rotMo), rotMo.trim().slice(0, 90));
  await page.click("#btn-ver-percurso");
  await page.waitForTimeout(1400);
  check("Ver percurso desliga markerOnly",
    !(await page.locator("#cap-somente").isChecked()));
  const encaixe2 = await linhasDentroDosBounds(page);
  check("apos markerOnly: linhas reveladas e enquadradas",
    encaixe2.n > 0 && encaixe2.fora === 0,
    "vertices=" + encaixe2.n + " fora=" + encaixe2.fora);
  check("capitulo nao mudou no Ver percurso",
    (await page.locator("#cap-slider").inputValue()) === "19");
  await page.click("#btn-painel");
  await page.waitForTimeout(400);

  // roteiro clicavel: botao "Ver trecho" enquadra so aquele trecho
  const nTrecho = await page.locator(
    "#roteiro-personagens .rot-ver-trecho").count();
  check("roteiro: botoes 'Ver trecho' por segmento", nTrecho >= 2,
    "botoes=" + nTrecho);
  if (nTrecho) {
    await page.locator("#roteiro-personagens .rot-ver-trecho")
      .first().click();
    await page.waitForTimeout(1400);
    check("clicar trecho nao muda o capitulo",
      (await page.locator("#cap-slider").inputValue()) === "19");
    check("clicar trecho recolhe o painel",
      (await page.locator("#lateral.lateral-fechada").count()) === 1);
    /* enquadra SO o trecho clicado: a linha dele inteira cabe nos
       bounds (as de outros personagens podem ficar fora — correto) */
    const encaixe3 = await linhasDentroDosBounds(page);
    check("trecho clicado fica dentro dos bounds",
      encaixe3.completas >= 1,
      "linhas-completas=" + encaixe3.completas);
    await page.click("#btn-painel");
    await page.waitForTimeout(400);
  }

  // "Ver so este": isola o personagem e enquadra seu percurso
  await page.locator("#roteiro-personagens .rot-so").first().click();
  await page.waitForTimeout(1400);
  const selecionados = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      ".pers-item input:checked")).map((c) => c.id));
  check("'Ver so este' deixa um unico personagem",
    selecionados.length === 1, JSON.stringify(selecionados));
  check("'Ver so este' nao muda o capitulo",
    (await page.locator("#cap-slider").inputValue()) === "19");
  const rotSolo = await page.locator("#roteiro-personagens").textContent();
  check("roteiro solo mostra so o personagem isolado",
    selecionados.length === 1 &&
      !/Jon Snow[\s\S]*Catelyn|Catelyn[\s\S]*Jon Snow/.test(rotSolo));
  await page.click("#btn-painel");
  await page.waitForTimeout(400);
  /* volta a selecao dupla para o restante do bloco (selecionados
     traz ids de elemento, ex. "chk-jon") */
  await page.check(
    "#chk-" + (selecionados[0] === "chk-jon" ? "catelyn" : "jon"));
  await page.waitForTimeout(300);

  // Ver livro completo: capitulo final + markerOnly off
  await setCap(page, 18);
  await page.check("#cap-somente");
  await page.waitForTimeout(300);
  await page.click("#btn-livro-completo");
  await page.waitForTimeout(600);
  check("Ver livro completo -> ultimo capitulo (72)",
    (await page.locator("#cap-slider").inputValue()) === "72",
    "slider=" + (await page.locator("#cap-slider").inputValue()));
  check("markerOnly desligado pelo botao",
    !(await page.locator("#cap-somente").isChecked()));
  check("capitulo persistido no storage",
    JSON.parse(await page.evaluate(() =>
      localStorage.getItem("gotatlas-estado-atlas-inventario-v3") || "{}"
    )).cap === 72);
  const rot72 = await page.locator("#roteiro-personagens").textContent();
  check("roteiro lista personagens selecionados",
    /Jon Snow/.test(rot72) && /Catelyn/.test(rot72),
    rot72.trim().slice(0, 80));
  check("roteiro mostra capitulo de revelacao",
    /a partir do cap\.\s*\d/.test(rot72));
  check("roteiro: precisao do trecho em <details>",
    (await page.locator(
      "#roteiro-personagens .rot-precisao").count()) >= 1);

  // roteiro em ch0: sem trechos -> mensagem honesta, nada futuro
  await setCap(page, 0);
  const rot0 = await page.locator("#roteiro-personagens").textContent();
  check("roteiro ch0: explica ausencia de trechos",
    /sem trecho|calibra/i.test(rot0), rot0.trim().slice(0, 90));
  check("roteiro ch0 nao vaza capitulos futuros",
    !/cap\.\s*(1[89]|2\d|3\d)/.test(rot0));

  await setCap(page, 19);
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
    /* fontes expandiveis e rolaveis dentro do maxHeight */
    await page.locator(".leaflet-popup details summary").first().click();
    await page.waitForTimeout(300);
    const fontes = await page.locator(".leaflet-popup").textContent();
    check("nativo: fontes/detalhes expandem com evidencias",
      /Corredor|Fonte|Comparacao|mapas\//i.test(fontes),
      fontes.trim().slice(0, 120));
    check("nativo: conteudo respeita maxHeight",
      await page.evaluate(() => {
        const c = document.querySelector(".leaflet-popup-content");
        return c && c.scrollHeight > 0 &&
          c.getBoundingClientRect().height <=
            parseFloat(c.style.maxHeight || "9999") + 4;
      }));
  }
  /* recolhe painel e enquadra o percurso dela para a evidencia;
     Escape NAO fecha popup do mapa — usa o botao de fechar */
  const fecharNat = page.locator(".leaflet-popup-close-button");
  if (await fecharNat.count()) await fecharNat.first().click();
  await page.waitForTimeout(300);
  await page.click("#btn-ver-percurso");
  await page.waitForTimeout(1400);
  const encaixe = await linhasDentroDosBounds(page);
  check("nativo: Ver percurso enquadra rotas da Daenerys",
    encaixe.n > 0 && encaixe.fora === 0,
    "vertices=" + encaixe.n);
  const txt2 = await clicarNaLinha(page);
  check("nativo: popup compacto apos enquadrar", !!txt2,
    txt2 ? txt2.trim().slice(0, 60) : "sem popup");
  /* espera o autoPan estabilizar e confirma o popup aberto antes da
     captura — a evidencia precisa mostrar o popup compacto */
  await page.waitForTimeout(1000);
  await page.waitForSelector(".leaflet-popup",
    { state: "visible", timeout: 4000 }).catch(() => {});
  check("nativo: popup permanece aberto para a captura",
    (await page.locator(".leaflet-popup:visible").count()) === 1);
  await page.screenshot({ path: join(OUT, "rotas-nativo.png"), fullPage: true });
  await ctx.close();
}

// ---------- multi-personagem sobreposto + mobile ----------
{
  const { ctx, page } = await novaPagina({ width: 390, height: 844 });
  check("mobile 390 sem overflow horizontal",
    (await page.evaluate(() =>
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth)) === 0);
  await page.click("#btn-painel");
  await page.waitForTimeout(400);
  await page.check("#chk-jon");
  await page.check("#chk-tyrion");
  await page.check("#chk-catelyn");
  await setCap(page, 19);
  const rot = await page.locator("#roteiro-personagens").textContent();
  check("mobile: roteiro com 3 personagens",
    /Jon Snow/.test(rot) && /Tyrion/.test(rot) && /Catelyn/.test(rot));
  check("mobile: botoes de trajeto habilitados",
    !(await page.locator("#btn-ver-percurso").isDisabled()) &&
      !(await page.locator("#btn-livro-completo").isDisabled()));
  check("mobile: botoes 'Ver so este' por personagem",
    (await page.locator("#roteiro-personagens .rot-so").count()) === 3);
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
  check("320: roteiro lista a personagem",
    /Catelyn/.test(
      await page.locator("#roteiro-personagens").textContent()));
  check("320: botoes habilitados com geometria",
    !(await page.locator("#btn-ver-percurso").isDisabled()) &&
      !(await page.locator("#btn-livro-completo").isDisabled()));
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
