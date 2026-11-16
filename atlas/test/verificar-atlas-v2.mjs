// Verificacao do atlas v2 em /atlas/ — dados reais data/atlas-agot-v2.json
// (sem interceptacao no caminho feliz). Uso: node atlas/test/verificar-atlas-v2.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });

const DADOS = JSON.parse(
  readFileSync(join(DIR, "..", "data", "atlas-agot-v2.json"), "utf8")
);
const MANIFESTO = JSON.parse(
  readFileSync(join(DIR, "..", "data", "mapa.json"), "utf8")
);

const N_PONTOS = DADOS.controlPoints.length;          // 32
const N_ROTAS = DADOS.routes.length;                  // 12
const N_NORTE = DADOS.regions.find((r) => r.id === "norte").pointIds.length;
const N_WEST = DADOS.regions.find((r) => r.id === "westeros").pointIds.length;
const N_ESSOS = DADOS.regions.find((r) => r.id === "essos").pointIds.length;

/* centro esperado do enquadramento Norte na previa (1600x1066) */
const _nIds = DADOS.regions.find((r) => r.id === "norte").pointIds;
const _nPts = DADOS.controlPoints.filter((p) => _nIds.includes(p.id));
const _nx = (Math.min(..._nPts.map((p) => p.x)) +
  Math.max(..._nPts.map((p) => p.x))) / 2;
const _ny = (Math.min(..._nPts.map((p) => p.y)) +
  Math.max(..._nPts.map((p) => p.y))) / 2;
const NORTE_LL = {
  lat: 1066 * (1 - _ny / DADOS.mapHeight),
  lng: 1600 * (_nx / DADOS.mapWidth)
};
const STORAGE_KEY = "gotatlas-estado-" + DADOS.datasetId;

const results = [];
const consoleLog = [];
const requests = [];
const tileResponses = [];
const failedReqs = [];

function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : ""));
  return ok;
}

function ligarColetores(page, tag) {
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    if (!f || !/aborted/i.test(f.errorText)) {
      failedReqs.push(tag + " " + r.url() + " " + (f ? f.errorText : "?"));
    }
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/atlas/tiles/")) {
      tileResponses.push(tag + " " + resp.status() + " " + resp.url());
    }
  });
  page.on("pageerror", (e) => consoleLog.push("[pageerror " + tag + "] " + e.message));
}

async function setCapitulo(page, n) {
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, n);
  await page.waitForTimeout(350);
}

function segsNoCapitulo(routeId, cap) {
  const rt = DADOS.routes.find((r) => r.id === routeId);
  return (rt.segments || []).filter(
    (s) => s.startChapter <= cap && cap <= s.endChapter
  ).length;
}

const browser = await chromium.launch();

// ---------- desktop: fluxo feliz real ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  ligarColetores(page, "desktop");

  const r1 = await page.goto(BASE + "/");
  check("portal / responde 200", r1.status() === 200, "HTTP " + r1.status());

  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });

  check(N_PONTOS + " entradas na lista",
    (await page.locator("#loc-lista li").count()) === N_PONTOS);
  check(N_ROTAS + " checkboxes de personagem",
    (await page.locator("#lista-personagens input[type=checkbox]").count()) ===
      N_ROTAS);
  check("todos desmarcados por padrao",
    (await page.locator(
      "#lista-personagens input[type=checkbox]:checked"
    ).count()) === 0);

  // limites de capitulo do Jon (fronteira 18/19)
  await page.check("#chk-jon");
  await setCapitulo(page, 18);
  check("jon ch18: posicao em Winterfell, sem linha",
    (await page.locator(".loc-pin-jon").count()) === 1 &&
      (await page.locator(".leaflet-overlay-pane path").count()) ===
        segsNoCapitulo("jon", 18));
  await setCapitulo(page, 19);
  check("jon ch19: Castle_Black + " + segsNoCapitulo("jon", 19) + " linha(s)",
    (await page.locator(".loc-pin-jon").count()) === 1 &&
      (await page.locator(".leaflet-overlay-pane path").count()) ===
        segsNoCapitulo("jon", 19));

  // coincidencia jon+tyrion em Castle_Black no cap 19 -> UM marcador
  await page.check("#chk-tyrion");
  await page.waitForTimeout(400);
  check("jon+tyrion ch19: um marcador agrupado",
    (await page.locator(".loc-pin-personagem").count()) === 1 &&
      (await page.locator(".loc-pin-jon").count()) === 0);
  const nGrupo = await page.locator(".loc-pin-personagem .loc-pin-n").textContent();
  check("agrupado mostra contagem 2", nGrupo.trim() === "2", nGrupo);
  await page.locator(".loc-pin-personagem").first().click({ force: true });
  await page.waitForSelector(".leaflet-popup", { timeout: 8000 });
  const popGrupo = await page.locator(".leaflet-popup").textContent();
  check("popup agrupado lista ambos",
    /Jon Snow/.test(popGrupo) && /Tyrion/.test(popGrupo), popGrupo.trim().slice(0, 90));
  await page.keyboard.press("Escape");
  await page.uncheck("#chk-jon");
  await page.waitForTimeout(400);
  check("desmarcar jon mantem tyrion agrupado",
    (await page.locator(".loc-pin-personagem").count()) === 1);
  await page.uncheck("#chk-tyrion");

  // robb no cap 55 -> Moat_Cailin
  await page.check("#chk-robb");
  await setCapitulo(page, 55);
  const status55 = await page.locator("#status-personagens").textContent();
  check("robb ch55 em Moat_Cailin", /Moat Cailin|Fosso Cailin/i.test(status55),
    status55.trim().slice(0, 90));
  await page.uncheck("#chk-robb");

  // jon ch1: lacuna sem posicao fantasma
  await page.check("#chk-jon");
  await setCapitulo(page, 1);
  check("jon ch1: sem marcador de posicao",
    (await page.locator(".loc-pin-jon, .loc-pin-personagem").count()) === 0);
  const stJon1 = await page.locator("#status-personagens").textContent();
  check("jon ch1: status honesto + omitidos",
    /sem refer/i.test(stJon1) &&
      stJon1.includes(String((DADOS.routes.find(r=>r.id==="jon").omittedSourceRecordIndices||[]).length)),
    stJon1.trim().slice(0, 100));
  await page.uncheck("#chk-jon");

  // filtro de regiao (lista + camada)
  await page.selectOption("#filtro-regiao", "norte");
  await page.waitForTimeout(400);
  check("regiao norte -> " + N_NORTE + " na lista",
    (await page.locator("#loc-lista li:not([hidden])").count()) === N_NORTE);
  await page.selectOption("#filtro-regiao", "westeros");
  await page.waitForTimeout(400);
  check("regiao westeros -> " + N_WEST + " na lista",
    (await page.locator("#loc-lista li:not([hidden])").count()) === N_WEST);
  await page.selectOption("#filtro-regiao", "essos");
  await page.waitForTimeout(400);
  check("regiao essos -> " + N_ESSOS + " na lista",
    (await page.locator("#loc-lista li:not([hidden])").count()) === N_ESSOS);
  await page.selectOption("#filtro-regiao", "todas");

  // busca acento/caixa + estado vazio honesto
  await page.fill("#loc-busca", "CASTELO");
  check("busca 'CASTELO' -> 1",
    (await page.locator("#loc-lista li:not([hidden])").count()) === 1);
  await page.fill("#loc-busca", "zzznada");
  await page.waitForTimeout(300);
  const vazio = await page.locator("#loc-contagem").textContent();
  check("estado vazio honesto", /Nenhuma localidade/i.test(vazio), vazio.trim());
  await page.fill("#loc-busca", "");

  // ---------- switch nativo preservando centro/escala ----------
  await page.check("#chk-jon");
  await page.check("#chk-tyrion");
  await setCapitulo(page, 19);
  await page.check("#cap-somente");
  await page.waitForTimeout(400);
  const antes = await page.evaluate(([W, H]) => {
    const map = window.__atlasMap;
    const img = document.querySelector("img.leaflet-image-layer");
    const c = map.getCenter();
    return {
      x: c.lng * W / img.naturalWidth,
      y: (1 - c.lat / img.naturalHeight) * H,
      zoom: map.getZoom(),
      naturalW: img.naturalWidth
    };
  }, [MANIFESTO.width, MANIFESTO.height]);

  await page.click("#btn-tiles");
  await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(700);

  check("nativo: selecoes/capitulo/markerOnly preservados",
    (await page.locator("#chk-jon").isChecked()) &&
      (await page.locator("#chk-tyrion").isChecked()) &&
      (await page.locator("#cap-slider").inputValue()) === "19" &&
      (await page.locator("#cap-somente").isChecked()));
  check("nativo: marcador agrupado preservado",
    (await page.locator(".loc-pin-personagem").count()) === 1 &&
      (await page.locator(".leaflet-overlay-pane path").count()) === 0);

  // centro nativo em pixels da imagem vs esperado (<2px)
  const depois = await page.evaluate(([x, y, W, naturalW, zoomAnt, maxZ]) => {
    const map = window.__atlasMap;
    const px = map.project(map.getCenter(), maxZ); // pixel coords nativos
    const zoomAlvo = Math.min(maxZ, Math.max(0,
      zoomAnt + Math.log2(naturalW * Math.pow(2, maxZ) / W)));
    const clamp = zoomAlvo !== zoomAnt + Math.log2(naturalW * Math.pow(2, maxZ) / W);
    const escalaAnt = (naturalW * Math.pow(2, zoomAnt)) / W;
    const escalaDep = Math.pow(2, map.getZoom()) / Math.pow(2, maxZ);
    return {
      dx: Math.abs(px.x - x), dy: Math.abs(px.y - y),
      escalaRatio: escalaDep / escalaAnt,
      clampado: clamp
    };
  }, [antes.x, antes.y, MANIFESTO.width, antes.naturalW, antes.zoom, MANIFESTO.maxNativeZoom]);
  check("nativo: centro preservado (<2px imagem)",
    depois.dx < 2 && depois.dy < 2,
    "dx=" + depois.dx.toFixed(1) + " dy=" + depois.dy.toFixed(1));
  check("nativo: escala efetiva preservada (<=2%)",
    depois.clampado || Math.abs(depois.escalaRatio - 1) <= 0.02,
    "ratio=" + depois.escalaRatio.toFixed(3) + (depois.clampado ? " clamp" : ""));

  await page.screenshot({ path: join(OUT, "v2-desktop-nativo.png"), fullPage: true });
  await ctx.close();
}

// ---------- restauracao por fragmento (sem auto-fetch de tiles) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  ligarColetores(page, "hash");
  const tilesAntes = requests.length;
  await page.goto(
    BASE + "/atlas/#cap=19&personagens=jon,tyrion&rotulos=1&somente=0&regiao=norte"
  );
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  await page.waitForTimeout(800);
  check("hash: jon+tyrion marcados",
    (await page.locator("#chk-jon").isChecked()) &&
      (await page.locator("#chk-tyrion").isChecked()));
  check("hash: cap 19 + regiao norte + rotulos",
    (await page.locator("#cap-slider").inputValue()) === "19" &&
      (await page.locator("#filtro-regiao").inputValue()) === "norte" &&
      (await page.locator("#loc-rotulos").isChecked()));
  check("hash: marcador agrupado restaurado",
    (await page.locator(".loc-pin-personagem").count()) === 1);
  check("hash: nenhum fetch de tiles automatico",
    !requests.slice(tilesAntes).some((u) => u.includes("/atlas/tiles/")),
    "tiles nunca carregados por estado");
  await ctx.close();
}

// ---------- dados invalidos desabilitam controles ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  ligarColetores(page, "invalido");
  const quebrado = JSON.parse(JSON.stringify(DADOS));
  quebrado.routes[0].segments[0].points = [[1, 1]]; // <2 pontos
  await page.route("**/atlas/data/atlas-agot-v2.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(quebrado) })
  );
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForTimeout(1200);
  check("invalido: sem marcadores nem lista",
    (await page.locator(".loc-pin").count()) === 0 &&
      (await page.locator("#loc-lista li").count()) === 0);
  const stInv = await page.locator("#localidades-status").textContent();
  check("invalido: erro visivel", /indispon|inv.lid/i.test(stInv),
    stInv.trim().slice(0, 90));
  check("invalido: controles travados",
    await page.locator("#cap-slider").isDisabled());
  check("invalido: mapa navegavel",
    (await page.locator("img.leaflet-image-layer").count()) === 1);
  await ctx.close();
}

// ---------- foco em localidade: fora da vista, camada oculta, cliques rapidos ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  ligarColetores(page, "foco");
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  await setCapitulo(page, 3);
  // aproxima no centro (Vaes Dothrak fica fora da vista) e busca
  await page.click(".leaflet-control-zoom-in");
  await page.click(".leaflet-control-zoom-in");
  await page.waitForTimeout(900);
  await page.fill("#loc-busca", "vaes dothrak");
  await page.waitForTimeout(300);
  await page.locator("#loc-lista li:not([hidden]) .loc-item").first().click();
  await page.waitForSelector(".leaflet-popup", { timeout: 12000 });
  const popVaes = await page.locator(".leaflet-popup").textContent();
  check("foco fora da vista abre popup do alvo",
    /Vaes Dothrak/.test(popVaes), popVaes.trim().slice(0, 60));
  check("foco nao muda capitulo",
    (await page.locator("#cap-slider").inputValue()) === "3");
  // esconde a camada e clica de novo: revela e abre
  await page.keyboard.press("Escape");
  await page.uncheck("#loc-mostrar");
  await page.waitForTimeout(300);
  await page.locator("#loc-lista li:not([hidden]) .loc-item").first().click();
  await page.waitForFunction(() => {
    const p = document.querySelector(".leaflet-popup");
    return p && p.textContent.includes("Vaes Dothrak");
  }, null, { timeout: 12000 });
  check("clique revela camada oculta + popup",
    await page.locator("#loc-mostrar").isChecked());
  // cliques rapidos em dois itens: so o ultimo abre
  await page.keyboard.press("Escape");
  await page.fill("#loc-busca", "");
  await page.waitForTimeout(300);
  const itens = page.locator("#loc-lista li:not([hidden]) .loc-item");
  const nomeA = await itens.nth(0).textContent();
  const nomeB = await itens.nth(1).textContent();
  await itens.nth(0).click();
  await itens.nth(1).click();
  await page.waitForFunction((txt) => {
    const p = document.querySelector(".leaflet-popup");
    return p && p.textContent.includes(txt);
  }, nomeB.trim().slice(0, 10), { timeout: 15000 });
  const popFinal = await page.locator(".leaflet-popup").first().textContent();
  check("cliques rapidos: ultimo alvo no popup",
    !popFinal.includes(nomeA.trim().slice(0, 10)),
    popFinal.trim().slice(0, 60));
  // link gerado inclui local=
  await page.evaluate(() => {
    window.__copiado = "";
    navigator.clipboard.writeText = (t) => {
      window.__copiado = t;
      return Promise.resolve();
    };
  });
  await page.click("#btn-link");
  await page.waitForTimeout(400);
  const linkGerado = await page.evaluate(() => window.__copiado);
  check("link copiado contem local=",
    /local=[^&]+/.test(linkGerado), linkGerado.slice(-80));
  await ctx.close();
}


// ---------- hash local= com previa atrasada (sem timer cego) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  ligarColetores(page, "hashlocal");
  const tilesAntes = requests.length;
  await page.route("**/o-mundo-conhecido-recorte-v1-preview.webp", async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    await r.continue();
  });
  await page.goto(BASE + "/atlas/#cap=19&personagens=jon&local=Castle_Black");
  await page.waitForSelector(".leaflet-popup", { timeout: 20000 });
  const popHash = await page.locator(".leaflet-popup").textContent();
  check("hash local= abre popup apos previa atrasada",
    /Castelo Negro|Castle_Black/.test(popHash), popHash.trim().slice(0, 60));
  check("hash local= restaura jon + cap19",
    (await page.locator("#chk-jon").isChecked()) &&
      (await page.locator("#cap-slider").inputValue()) === "19");
  check("hash local= nenhum tile automatico",
    !requests.slice(tilesAntes).some((u) => u.includes("/atlas/tiles/")));
  await ctx.close();
}

// ---------- dados atrasados: controles nascem travados ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  ligarColetores(page, "atraso");
  await page.route("**/atlas/data/atlas-agot-v2.json", async (route) => {
    await new Promise((res) => setTimeout(res, 1200));
    await route.continue();
  });
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  check("atraso: controles travados antes dos dados",
    await page.locator("#cap-slider").isDisabled());
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  check("atraso: controles destravados apos dados validos",
    !(await page.locator("#cap-slider").isDisabled()));
  await ctx.close();
}

// ---------- conteineres malformados no navegador ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  ligarColetores(page, "malformado");
  const quebrado = JSON.parse(JSON.stringify(DADOS));
  quebrado.routes = {};
  await page.route("**/atlas/data/atlas-agot-v2.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(quebrado) })
  );
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForTimeout(1000);
  const stMal = await page.locator("#localidades-status").textContent();
  check("routes={} erro visivel", /routes|indispon/i.test(stMal),
    stMal.trim().slice(0, 80));
  check("routes={} controles travados, mapa livre",
    (await page.locator("#cap-slider").isDisabled()) &&
      (await page.locator("img.leaflet-image-layer").count()) === 1);
  check("routes={} sem saida velha", (await page.locator("#loc-contagem").textContent()) === "" &&
    (await page.locator("#cap-titulo").textContent()) === "");
  await ctx.close();
}

// ---------- armazenamento: tipos invalidos ignorados ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(([k]) => {
    localStorage.setItem(k, JSON.stringify({
      cap: 18.5, personagens: ["naoexiste", "jon2"], busca: 42
    }));
  }, [STORAGE_KEY]);
  const page = await ctx.newPage();
  ligarColetores(page, "storage");
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  check("storage fracionario -> capitulo 0",
    (await page.locator("#cap-slider").inputValue()) === "0");
  check("storage ids desconhecidos -> nenhum marcado",
    (await page.locator(
      "#lista-personagens input[type=checkbox]:checked").count()) === 0);
  await ctx.close();
}
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(([k]) => {
    localStorage.setItem(k, JSON.stringify({ cap: 5 }));
  }, [STORAGE_KEY]);
  const page = await ctx.newPage();
  ligarColetores(page, "storage-prio");
  await page.goto(BASE + "/atlas/#cap=19");
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  check("hash tem prioridade sobre storage (19 > 5)",
    (await page.locator("#cap-slider").inputValue()) === "19");
  await ctx.close();
}
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  ligarColetores(page, "storage-persist");
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  await setCapitulo(page, 9);
  await page.check("#chk-jon");
  await page.reload();
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  check("storage persiste cap9 + jon apos reload",
    (await page.locator("#cap-slider").inputValue()) === "9" &&
      (await page.locator("#chk-jon").isChecked()));
  await ctx.close();
}

// ---------- referencia opcional de nomes (sidecar lazy) ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  ligarColetores(page, "evidencias");
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  check("evidencias: nao carrega antes de abrir fontes",
    !requests.some((u) => u.includes("nomes-agot-v2-evidencias")));
  await page.locator("#sec-fontes summary").click();
  await page.waitForSelector(".evid-item", { timeout: 8000 });
  check("evidencias: " + N_PONTOS + " itens",
    (await page.locator(".evid-item").count()) === N_PONTOS);
  const evTxt = await page.locator("#fontes-evidencias").textContent();
  check("evidencias: texto honesto", /não confirma rota/i.test(evTxt));
  await ctx.close();
}
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  ligarColetores(page, "evid-404");
  await page.route("**/atlas/data/nomes-agot-v2-evidencias.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" })
  );
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("#loc-lista li", { timeout: 15000 });
  await page.locator("#sec-fontes summary").click();
  await page.waitForTimeout(900);
  const ev404 = await page.locator("#fontes-evidencias").textContent();
  check("evidencias 404: aviso honesto", /indispon/i.test(ev404),
    ev404.trim().slice(0, 80));
  check("evidencias 404: controles intactos",
    !(await page.locator("#cap-slider").isDisabled()) &&
      (await page.locator("#loc-lista li").count()) === N_PONTOS);
  await ctx.close();
}

// ---------- mobile 390 e 320 ----------
for (const w of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 } });
  const page = await ctx.newPage();
  ligarColetores(page, "mobile" + w);
  await page.goto(BASE + "/atlas/");
  await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
  await page.waitForSelector("#loc-lista li",
    { timeout: 15000, state: "attached" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check("mobile " + w + " sem overflow horizontal", overflow <= 1,
    "overflow=" + overflow);
  check("mobile " + w + ": lista completa",
    (await page.locator("#loc-lista li").count()) === N_PONTOS);
  if (w === 390) {
    await page.screenshot({ path: join(OUT, "v2-mobile.png"), fullPage: true });
  }
  await ctx.close();
}

await browser.close();

// ---------- asserts de rede ----------
const externos = requests.filter((u) => !u.startsWith(BASE));
check("nenhuma requisicao externa", externos.length === 0,
  externos.join(", ") || "todas locais");
const mestres = requests.filter((u) => /\/mapas\/(jpeg|png|webp\/reduzidos)\//.test(u));
check("nenhum fetch de imagem mestre", mestres.length === 0,
  mestres.join(", ") || "ok");
const reqTiles = requests.filter((u) => u.includes("/atlas/tiles/"));
check("todos tiles do conjunto recorte-v1",
  reqTiles.length === 0 || reqTiles.every((u) => u.includes("recorte-v1")),
  reqTiles.length + " requisicoes");
const tilesRuins = tileResponses.filter((l) => !/ 200 /.test(l));
check("todas respostas de tile HTTP 200", tilesRuins.length === 0,
  tilesRuins.join(" | ") || "ok");
check("nenhuma requisicao falha", failedReqs.length === 0,
  failedReqs.join(" | ") || "ok");
const erros = consoleLog.filter((l) => l.startsWith("[pageerror"));
check("sem pageerrors", erros.length === 0, erros.join(" | ") || "ok");

writeFileSync(join(OUT, "v2-requisicoes.txt"), requests.join("\n") + "\n");
writeFileSync(join(OUT, "v2-resultados.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
