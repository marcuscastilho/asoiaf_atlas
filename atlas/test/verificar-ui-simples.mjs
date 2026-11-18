// Verificacao da UI simplificada do atlas:
//   - mapa ocupa 100% da viewport (desktop + mobile 390/320)
//   - sem overflow horizontal
//   - unicos botoes sobre o mapa: zoom do Leaflet + toggle do painel
//   - painel recolhe/expande e o toggle continua visivel
//   - busca -> card curto com resumo + link verificado da wiki
//   - selecao de personagem -> linhas de trajeto
//   - link "Mapa principal" no painel; portal / tem link para atlas/
//   - sem pageerrors; nenhuma requisicao externa (link da wiki
//     nunca e buscado pela pagina)
// Uso: node atlas/test/verificar-ui-simples.mjs

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const BASE = "http://127.0.0.1:8080";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "evidencias");
mkdirSync(OUT, { recursive: true });

const results = [];
const pageErrors = [];
const requests = [];
function check(name, ok, detail) {
  const r = (ok ? "PASS" : "FAIL") + " " + name +
    (detail ? " — " + detail : "");
  results.push(r);
  console.log(r);
}

const browser = await chromium.launch();

async function novaPagina(vp, tag) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(tag + " " + e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(BASE + "/atlas/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#loc-lista li",
    { state: "attached", timeout: 30000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

async function medidas(page) {
  return page.evaluate(() => {
    const mapa = document.getElementById("mapa");
    const r = mapa.getBoundingClientRect();
    const de = document.documentElement;
    return {
      w: r.width, h: r.height,
      vw: de.clientWidth, vh: de.clientHeight,
      overflow: de.scrollWidth - de.clientWidth
    };
  });
}

/* ---------- A: desktop 1366x768 ---------- */
{
  const { ctx, page } = await novaPagina(
    { width: 1366, height: 768 }, "desktop");

  const m = await medidas(page);
  check("desktop: mapa preenche a viewport",
    Math.abs(m.w - m.vw) <= 2 && Math.abs(m.h - m.vh) <= 2,
    m.w + "x" + m.h + " vs " + m.vw + "x" + m.vh);
  check("desktop: sem overflow horizontal",
    m.overflow <= 1, "overflow=" + m.overflow);

  check("desktop: link 'Mapa principal' no painel",
    await page.evaluate(() => {
      const a = document.querySelector("#lateral .topo-link");
      return !!a && /Mapa principal/.test(a.textContent) &&
        a.getAttribute("href") === "../";
    }));
  check("desktop: sem chrome removido no DOM",
    (await page.locator(
      "#btn-link, #btn-ajuda, #painel-ajuda, #btn-tela-cheia, " +
      "#sec-fontes, #fontes-evidencias, #roteiro-personagens, " +
      "#btn-ver-percurso, #cap-somente, #filtro-tipo, #filtro-regiao, " +
      "#loc-identificados, .barra-controles").count()) === 0);

  await page.screenshot(
    { path: join(OUT, "ui-simples-desktop-aberto.png") });

  /* collapse/expand: o toggle continua visivel nas duas fases */
  await page.click("#btn-painel");
  await page.waitForTimeout(300);
  check("desktop: painel recolhe",
    await page.evaluate(() =>
      document.getElementById("lateral-corpo").hidden));
  check("desktop: toggle visivel com painel recolhido",
    await page.locator("#btn-painel").isVisible());

  /* botoes sobre o mapa com o painel recolhido: apenas o zoom do
     Leaflet e o toggle (o corpo do painel esta fora da conta) */
  const botoesMapa = await page.evaluate(() => {
    const mb = document.getElementById("mapa").getBoundingClientRect();
    return [...document.querySelectorAll("button, .leaflet-bar a")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < mb.left || cx > mb.right ||
            cy < mb.top || cy > mb.bottom) return false;
        return !b.closest("#lateral-corpo");
      })
      .map((b) => b.id || b.className || b.textContent.trim());
  });
  check("desktop: so zoom + toggle do painel sobre o mapa",
    botoesMapa.every((b) => /zoom|btn-painel/.test(b)) &&
      botoesMapa.length === 3,
    JSON.stringify(botoesMapa));
  await page.screenshot(
    { path: join(OUT, "ui-simples-desktop-recolhido.png") });
  await page.click("#btn-painel");
  await page.waitForTimeout(300);
  check("desktop: painel reabre",
    await page.evaluate(() =>
      !document.getElementById("lateral-corpo").hidden));

  /* busca -> card curto: rotulo, tipo·regiao, resumo, link wiki */
  await page.fill("#loc-busca", "Winterfell");
  await page.waitForSelector("#loc-lista li:not([hidden])",
    { timeout: 5000 });
  await page.locator("#loc-lista li:not([hidden]) .loc-item")
    .first().click();
  await page.waitForSelector(".leaflet-popup", { timeout: 15000 });
  const card = await page.evaluate(() => {
    const p = document.querySelector(".leaflet-popup");
    const wiki = p.querySelector(".loc-popup-wiki a");
    return {
      txt: p.textContent,
      nome: (p.querySelector("strong") || {}).textContent || "",
      resumo: !!p.querySelector(".loc-popup-resumo"),
      wikiHref: wiki ? wiki.getAttribute("href") : null,
      wikiTarget: wiki ? wiki.getAttribute("target") : null,
      wikiRel: wiki ? wiki.getAttribute("rel") : null
    };
  });
  check("card: nome em destaque",
    card.nome === "Winterfell", card.nome);
  check("card: tipo · regiao + resumo",
    /·/.test(card.txt) && card.resumo, card.txt.slice(0, 100));
  check("card: link wiki verificado (_blank noopener)",
    card.wikiHref ===
      "https://awoiaf.westeros.org/index.php/Winterfell" &&
      card.wikiTarget === "_blank" && card.wikiRel === "noopener",
    String(card.wikiHref));
  check("card: sem proveniencia/evidencia/status",
    !/evid|revis|proveni|precis|Fontes/i.test(card.txt),
    card.txt.slice(0, 120));
  await page.screenshot(
    { path: join(OUT, "ui-simples-desktop-card.png") });
  await page.keyboard.press("Escape");

  /* personagem -> linhas de trajeto no capitulo certo */
  await page.check("#chk-tyrion");
  await page.locator("#cap-slider").evaluate((el) => {
    el.value = "10";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(600);
  check("personagem: linhas de trajeto renderizadas",
    (await page.locator(
      ".leaflet-overlay-pane path.leaflet-interactive").count()) > 0);
  check("personagem: linha curta 'Nome — lugar'",
    await page.evaluate(() =>
      [...document.querySelectorAll(".pers-atual-item")]
        .some((e) => /Tyrion Lannister — /.test(e.textContent))));

  /* menu: rotulo "Livro" visivel na mesma linha do select */
  check("menu: rotulo 'Livro' visivel junto ao select",
    await page.evaluate(() => {
      const l = document.querySelector(".livro-label");
      const r = l ? l.getBoundingClientRect() : null;
      return !!l && l.textContent.trim() === "Livro" && r.width > 0;
    }));

  /* "Todos os livros": slider varre os 344 capitulos globais e o
     titulo ganha a sigla do livro */
  await page.selectOption("#livro-select", "todos");
  await page.waitForTimeout(300);
  check("menu: 'Todos os livros' abrange os capitulos globais",
    await page.evaluate(() =>
      document.getElementById("cap-slider").max === "343"),
    await page.evaluate(() => document.getElementById("cap-slider").max));
  check("menu: titulo mostra sigla do livro no modo todos",
    await page.evaluate(() =>
      /\((AGOT|ACOK|ASOS|AFFC|ADWD)\)/.test(
        document.getElementById("cap-titulo").textContent)),
    await page.evaluate(() =>
      document.getElementById("cap-titulo").textContent));

  /* topo: 'Mapa principal' (<a>) e 'Recolher' (<button>) com
     caixas identicas */
  check("menu: 'Mapa principal' e 'Recolher' mesma altura",
    await page.evaluate(() => {
      const a = document.querySelector(".topo-link")
        .getBoundingClientRect();
      const b = document.getElementById("btn-painel")
        .getBoundingClientRect();
      return Math.abs(a.height - b.height) <= 1;
    }));

  /* ordem das secoes: Regiao vem antes de Personagens */
  check("menu: secao Regiao antes de Personagens",
    await page.evaluate(() =>
      !!(document.getElementById("sec-regiao")
        .compareDocumentPosition(
          document.getElementById("sec-personagens")) &
        Node.DOCUMENT_POSITION_FOLLOWING)));

  /* acoes: 3 botoes de largura igual numa unica linha */
  check("personagens: 3 botoes na mesma linha",
    await page.evaluate(() => {
      const bs = [...document.querySelectorAll(".pers-acoes .botao")];
      return bs.length === 3 &&
        new Set(bs.map((b) => b.offsetTop)).size === 1 &&
        Math.abs(bs[0].offsetWidth - bs[2].offsetWidth) <= 1;
    }));
  check("personagens: botao 'Jornada (spoilers)'",
    await page.evaluate(() =>
      document.getElementById("btn-livro-completo")
        .textContent.trim() === "Jornada (spoilers)"));

  /* lista de personagens em ordem alfabetica pt-BR */
  check("personagens: lista em ordem alfabetica pt-BR",
    await page.evaluate(() => {
      const nomes = [...document.querySelectorAll(
        ".pers-item .pers-nome")].map((e) => e.textContent.trim());
      const ord = [...nomes]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      return nomes.join() === ord.join() && nomes.length === 27;
    }));

  /* rodape do painel com o credito e o link externo do mapa */
  check("rodape: link 'As Terras de Gelo e Fogo' externo noopener",
    await page.evaluate(() => {
      const a = document.querySelector(".painel-rodape a");
      return !!a && a.getAttribute("href") ===
        "https://georgerrmartin.com/grrm_book/the-lands-of-ice-and-fire-map-set/" &&
        a.target === "_blank" && a.rel === "noopener";
    }));
  check("rodape: link 'Código no GitHub' externo noopener",
    await page.evaluate(() => {
      const a = document.querySelector(".painel-rodape a.rodape-github");
      return !!a && a.getAttribute("href") ===
        "https://github.com/marcuscastilho/asoiaf_atlas" &&
        a.target === "_blank" && a.rel === "noopener" &&
        !!a.querySelector("svg");
    }));

  /* seletor de regiao agrupado por continente */
  check("regiao: select presente com optgroups e opcoes",
    await page.evaluate(() => {
      const s = document.getElementById("regiao-select");
      return !!s && !s.hidden &&
        s.querySelectorAll("optgroup").length >= 1 &&
        s.querySelectorAll("optgroup option").length > 0;
    }));

  /* 27 regioes + 51 sub-regioes em 3 optgroups
     (Westeros 11, Essos 13, Outros 3) */
  check("regiao: 27 regioes + 51 sub-regioes nos 3 optgroups",
    await page.evaluate(() => {
      const s = document.getElementById("regiao-select");
      const gs = [...s.querySelectorAll("optgroup")];
      return gs.length === 3 &&
        gs.map((g) => g.label).join() === "Westeros,Essos,Outros" &&
        s.querySelectorAll("optgroup option").length === 78 &&
        s.querySelectorAll("optgroup option[value^='sub:']").length
          === 51;
    }), await page.evaluate(() => {
      const s = document.getElementById("regiao-select");
      return [...s.querySelectorAll("optgroup")]
        .map((g) => g.label + ":" + g.children.length).join();
    }));

  /* selecionar regiao enquadra os pontos dela (flyToBounds animado;
     pinos e rotulos so redesenham no moveend — esperar o centro
     estabilizar, nao um tempo fixo) */
  const esperaMapa = async () => {
    let a = null, b = null, tent = 0;
    do {
      a = b;
      await page.waitForTimeout(250);
      b = await page.evaluate(() => {
        const c = window.__atlasMap.getCenter();
        return [c.lat, c.lng, window.__atlasMap.getZoom()].join();
      });
    } while (a !== b && ++tent < 24);
    await page.waitForTimeout(350);
  };
  const pontoNaVista = (ids) => page.evaluate((ids) => {
    const map = window.__atlasMap;
    const b = map.getBounds();
    const achado = {};
    map.eachLayer((l) => {
      if (l._ponto && ids.includes(l._ponto.id))
        achado[l._ponto.id] = b.contains(l.getLatLng());
    });
    return ids.map((i) => achado[i] === true);
  }, ids);
  await page.selectOption("#regiao-select", "dorne");
  await esperaMapa();
  check("regiao: 'dorne' enquadra Lancassolar+Tombastela, sem Winterfell",
    (await pontoNaVista(
      ["Sunspear", "scan-site-v4-549", "Winterfell"]))
      .join() === "true,true,false",
    (await pontoNaVista(
      ["Sunspear", "scan-site-v4-549", "Winterfell"])).join());
  await page.selectOption("#regiao-select", "norte");
  await esperaMapa();
  check("regiao: 'norte' contem Winterfell",
    (await pontoNaVista(["Winterfell"]))[0] === true);
  /* regiao de um ponto: setView em vez de bounds degenerado */
  await page.selectOption("#regiao-select", "ilhas-ferro");
  await esperaMapa();
  check("regiao: 'ilhas-ferro' (1 ponto) centra Pyke",
    (await pontoNaVista(["Pyke"]))[0] === true);

  /* sub-regioes: enquadram pela caixa center+-span */
  await page.selectOption("#regiao-select", "sub:gargalo");
  await esperaMapa();
  check("regiao: 'sub:gargalo' mostra Fosso Cailin, sem Porto Real",
    (await pontoNaVista(
      ["Moat_Cailin", "King%27s_Landing"]))
      .join() === "true,false",
    (await pontoNaVista(
      ["Moat_Cailin", "King%27s_Landing"])).join());
  await page.selectOption("#regiao-select", "sub:arvore");
  await esperaMapa();
  check("regiao: 'sub:arvore' mostra Castelo do Arbor",
    (await pontoNaVista(["scan-site-v4-606"]))[0] === true);

  /* rotulos ligados por padrao: zoom maximo numa area densa (aglomerado
     Rochedo Casterly/Lannisporto, Terras Ocidentais) mostra mais que o
     antigo teto de 12 e rotula todos os pontos a vista. Os pinos sao
     cullados fora da vista, entao primeiro navega para a regiao para o
     marcador-ancora existir */
  await page.selectOption("#regiao-select", "terras-ocidentais");
  await esperaMapa();
  const temAlvo = await page.evaluate(() => {
    const map = window.__atlasMap;
    let alvo = null;
    map.eachLayer((l) => {
      if (l._ponto && l._ponto.id === "scan-site-2918-6938") alvo = l;
    });
    if (!alvo) return false;
    map.setView(alvo.getLatLng(), map.getMaxZoom());
    return true;
  });
  await esperaMapa();
  check("rotulos: ancora Valecorno encontrada para o zoom", temAlvo);
  const vista = await page.evaluate(() => {
    const map = window.__atlasMap, b = map.getBounds();
    let n = 0;
    map.eachLayer((l) => {
      if (l._ponto && b.contains(l.getLatLng())) n++;
    });
    return { pontos: n, rotulos: document.querySelectorAll(".loc-label").length };
  });
  check("rotulos: visiveis por padrao, sem teto de 12",
    vista.rotulos > 12, "n=" + vista.rotulos);
  check("rotulos: todo ponto a vista ganha rotulo no zoom maximo",
    vista.rotulos >= vista.pontos && vista.pontos > 0,
    vista.rotulos + "/" + vista.pontos);
  await page.screenshot(
    { path: join(OUT, "ui-simples-desktop-rotulos.png") });

  await ctx.close();
}

/* ---------- B: mobile 390x844 + 320x640 ---------- */
for (const vp of [
  { width: 390, height: 844 },
  { width: 320, height: 640 }
]) {
  const tag = "m" + vp.width;
  const { ctx, page } = await novaPagina(vp, tag);
  const m = await medidas(page);
  check(tag + ": mapa preenche a viewport",
    Math.abs(m.w - m.vw) <= 2 && Math.abs(m.h - m.vh) <= 2,
    m.w + "x" + m.h);
  check(tag + ": sem overflow horizontal",
    m.overflow <= 1, "overflow=" + m.overflow);
  check(tag + ": painel inicia recolhido",
    await page.evaluate(() =>
      document.getElementById("lateral-corpo").hidden));
  check(tag + ": toggle visivel com painel recolhido",
    await page.locator("#btn-painel").isVisible());
  await page.screenshot(
    { path: join(OUT, "ui-simples-" + tag + "-recolhido.png") });
  await page.click("#btn-painel");
  await page.waitForTimeout(300);
  check(tag + ": painel expande",
    await page.evaluate(() =>
      !document.getElementById("lateral-corpo").hidden));
  const m2 = await medidas(page);
  check(tag + ": sem overflow com painel aberto",
    m2.overflow <= 1, "overflow=" + m2.overflow);
  await page.screenshot(
    { path: join(OUT, "ui-simples-" + tag + "-aberto.png") });
  await ctx.close();
}

/* ---------- C: portal / tem link visivel para atlas/ ---------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push("[portal] " + e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".leaflet-container", { timeout: 20000 });
  const link = await page.evaluate(() => {
    const a = document.getElementById("atlasLink") ||
      [...document.querySelectorAll("a")]
        .find((x) => /atlas\/?$/.test(x.getAttribute("href") || ""));
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { href: a.getAttribute("href"), w: r.width, h: r.height,
      txt: a.textContent.trim() };
  });
  check("portal: link 'Mapa Atlas' visivel para atlas/",
    !!link && link.href === "atlas/" && link.w > 0 && link.h > 0,
    link ? link.href + " '" + link.txt + "'" : "ausente");
  await ctx.close();
}

await browser.close();

/* ---------- asserts finais ---------- */
check("sem pageerrors", pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "));
const externos = requests.filter((u) => !u.startsWith(BASE));
check("nenhuma requisicao externa (wiki nao e buscada)",
  externos.length === 0, externos.join(", ") || "todas locais");

const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
