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
