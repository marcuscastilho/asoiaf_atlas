// Verificacao mecanica do piloto /atlas/ — Playwright + Chromium local.
// Uso: node atlas/test/verificar.mjs   (servidor http-server na raiz, porta 8080)
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "evidencias");
mkdirSync(OUT, { recursive: true });

const results = [];
const consoleLog = [];
function check(name, ok, detail) {
  results.push((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : ""));
  return ok;
}

const browser = await chromium.launch();

// ---------- desktop: portal + atlas ----------
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const requests = [];
page.on("request", (r) => requests.push(r.url()));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    consoleLog.push("[" + m.type() + "] " + m.text());
  }
});
page.on("pageerror", (e) => consoleLog.push("[pageerror] " + e.message));

const r1 = await page.goto(BASE + "/");
check("portal / carrega", r1.status() === 200, "HTTP " + r1.status());

const r2 = await page.goto(BASE + "/atlas/");
check("atlas /atlas/ carrega", r2.status() === 200, "HTTP " + r2.status());
await page.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
check("previa imageOverlay carrega", true);

await page.waitForTimeout(400);
const boxBefore = await page.locator("img.leaflet-image-layer").boundingBox();
check("previa enquadrada na area do mapa", boxBefore && boxBefore.width > 200,
  boxBefore ? Math.round(boxBefore.width) + "x" + Math.round(boxBefore.height) : "sem box");

// zoom + e reset
await page.click(".leaflet-control-zoom-in");
await page.waitForTimeout(600);
const boxZoom = await page.locator("img.leaflet-image-layer").boundingBox();
check("zoom + amplia a imagem", boxZoom && boxZoom.width > boxBefore.width,
  Math.round(boxBefore.width) + " -> " + Math.round(boxZoom.width));

await page.click(".leaflet-control-zoom-out");
await page.waitForTimeout(1800);
const boxReset = await page.locator("img.leaflet-image-layer").boundingBox();
check("zoom - restaura aproximadamente o enquadramento",
  boxReset && Math.abs(boxReset.width - boxBefore.width) < 15,
  Math.round(boxReset.width) + " vs " + Math.round(boxBefore.width));

// toggle ajuda
const ajudaHidden = await page.locator("#painel-ajuda").isHidden();
await page.click("#btn-ajuda");
const ajudaVisivel = await page.locator("#painel-ajuda").isVisible();
check("toggle Ajuda abre painel", ajudaHidden && ajudaVisivel);
await page.click("#btn-ajuda");

// tela cheia: deve entrar OU avisar com elegancia
await page.click("#btn-tela-cheia");
await page.waitForTimeout(500);
const fsMsg = await page.locator("#mapa-status").textContent();
const fsOn = await page.evaluate(() => !!document.fullscreenElement);
check("tela cheia entra ou avisa sem falhar", fsOn || /tela cheia/i.test(fsMsg || ""),
  fsOn ? "fullscreen ativo" : (fsMsg || "").trim());
if (fsOn) await page.evaluate(() => document.exitFullscreen());

// erros de console antes do clique manual em tiles — o fetch de
// data/mapa.json pode retornar o 404 esperado do manifesto ausente,
// so depois deste ponto.
const errosAntesTiles = consoleLog.filter((l) => l.startsWith("[pageerror") || l.startsWith("[error]"));

// carregar tiles (manifesto ainda nao existe -> mensagem honesta)
await page.click("#btn-tiles");
await page.waitForTimeout(800);
const tilesMsg = await page.locator("#mapa-status").textContent();
check("Carregar tiles degrada com elegancia",
  /n[aã]o gerados|n[aã]o validados|carregados/i.test(tilesMsg || ""),
  (tilesMsg || "").trim());

await page.screenshot({ path: join(OUT, "desktop.png"), fullPage: true });
await ctx.close();

// ---------- fallback de erro de imagem ----------
const ctxErr = await browser.newContext();
const pErr = await ctxErr.newPage();
await pErr.route("**/mundo-conhecido-upright.png", (route) => route.abort());
await pErr.goto(BASE + "/atlas/");
await pErr.waitForTimeout(1200);
const erroVisivel = await pErr.locator("#mapa-erro").isVisible();
check("fallback visivel quando a imagem falha", erroVisivel);
await ctxErr.close();

// ---------- mobile 390x844 ----------
const ctxM = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true
});
const pM = await ctxM.newPage();
pM.on("request", (r) => requests.push(r.url()));
pM.on("pageerror", (e) => consoleLog.push("[pageerror mobile] " + e.message));
await pM.goto(BASE + "/atlas/");
await pM.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });
await pM.waitForTimeout(400);
const overflow = await pM.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
);
check("mobile sem overflow horizontal", overflow <= 1, "overflow=" + overflow);
const mapBoxM = await pM.locator("#mapa").boundingBox();
check("mapa mobile com altura substancial", !!mapBoxM && mapBoxM.height > 250,
  mapBoxM ? Math.round(mapBoxM.height) + "px" : "sem box");
await pM.screenshot({ path: join(OUT, "mobile.png"), fullPage: true });
await ctxM.close();

// ---------- sucesso nativo (fixture sintetico) ----------
// Manifesto: primeiro fetch 404 (overview mantida, retentativa possivel),
// segundo fetch retorna manifesto validado; tiles servidos como PNG real.
const manifesto = {
  nativePixelsValidated: true,
  width: 1024,
  height: 512,
  tileSize: 512,
  minZoom: 0,
  maxNativeZoom: 6,
  maxZoom: 6,
  tileUrl: "test-tiles/{z}/{x}/{y}.png",
  sourceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
};

const png = new PNG({ width: 512, height: 512 });
for (let y = 0; y < 512; y++) {
  for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) << 2;
    png.data[i] = 190;
    png.data[i + 1] = 170;
    png.data[i + 2] = 130;
    png.data[i + 3] = 255;
  }
}
const tileBuf = PNG.sync.write(png);

const ctxN = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const pN = await ctxN.newPage();
const tileReqs = [];
let manifestoCalls = 0;
pN.on("pageerror", (e) => consoleLog.push("[pageerror nativo] " + e.message));
await pN.route("**/atlas/data/mapa.json", (route) => {
  manifestoCalls++;
  if (manifestoCalls === 1) {
    return route.fulfill({ status: 404, body: "ausente" });
  }
  route.fulfill({ contentType: "application/json", body: JSON.stringify(manifesto) });
});
await pN.route("**/atlas/test-tiles/**", (route) => {
  tileReqs.push(route.request().url());
  route.fulfill({ contentType: "image/png", body: tileBuf });
});
await pN.goto(BASE + "/atlas/");
await pN.waitForSelector("img.leaflet-image-layer", { timeout: 20000 });

// clique 1: manifesto 404 -> mantem previa e botao pode retentar
await pN.click("#btn-tiles");
await pN.waitForTimeout(600);
check("falha de manifesto mantem overlay",
  (await pN.locator("img.leaflet-image-layer").count()) === 1);
check("botao tiles liberado para retentativa",
  await pN.locator("#btn-tiles").isEnabled());

// clique 2: sucesso nativo
await pN.click("#btn-tiles");
await pN.waitForSelector("img.leaflet-tile-loaded", { timeout: 10000 });
await pN.waitForTimeout(500);
check("tiles nativos presentes",
  (await pN.locator("img.leaflet-tile-loaded").count()) > 0);
check("overlay de previa removido apos switch",
  (await pN.locator("img.leaflet-image-layer").count()) === 0);
const avisoTxt = await pN.locator("#aviso-texto").textContent();
check("aviso atualizado para nativo",
  /nativa/.test(avisoTxt) && !/ainda n.o foram gerados/i.test(avisoTxt),
  avisoTxt.slice(0, 60));
const badgeTxt = await pN.locator("#badge-estado").textContent();
check("badge atualizado", /nativa/i.test(badgeTxt), badgeTxt.trim());
const ariaNativa = await pN.locator("#mapa").getAttribute("aria-label");
check("aria-label atualizado", /nativa/.test(ariaNativa), ariaNativa);

// zoom ate o maximo nativo (para quando o controle desabilita)
for (let i = 0; i < 16; i++) {
  const desabilitado = await pN.evaluate(() =>
    document
      .querySelector(".leaflet-control-zoom-in")
      .classList.contains("leaflet-disabled")
  );
  if (desabilitado) break;
  /* force: o controle pode desabilitar entre a checagem e o clique
     quando o zoom maximo e alcancado; clique no-op nesse ponto. */
  await pN.click(".leaflet-control-zoom-in", { force: true });
  await pN.waitForTimeout(250);
}
check("algum tile requisitado em /6/ (zoom nativo)",
  tileReqs.some((u) => u.includes("/6/")),
  tileReqs.length + " requisicoes de tile");
await pN.screenshot({ path: join(OUT, "nativo.png"), fullPage: true });
await ctxN.close();

await browser.close();

// ---------- asserts de rede ----------
const externos = requests.filter((u) => !u.startsWith(BASE));
check("nenhuma requisicao externa", externos.length === 0, externos.join(", ") || "todas locais");
const mestres = requests.filter((u) => /\/mapas\/(jpeg|png|webp\/reduzidos)\//.test(u));
check("nenhum fetch de imagem mestre", mestres.length === 0, mestres.join(", ") || "ok");

const errosDepoisTiles = consoleLog
  .filter((l) => l.startsWith("[pageerror") || l.startsWith("[error]"))
  .slice(errosAntesTiles.length);
check("sem erros de console/pagina", errosAntesTiles.length === 0,
  errosAntesTiles.join(" | ") || "ok");
check("erros pos-clique so sao o 404 esperado do manifesto",
  errosDepoisTiles.every((l) => l.includes("Failed to load resource")),
  errosDepoisTiles.join(" | ") || "nenhum");

writeFileSync(join(OUT, "requisicoes.txt"), requests.join("\n") + "\n");
writeFileSync(join(OUT, "console.txt"), consoleLog.join("\n") + "\n");
writeFileSync(join(OUT, "resultados.txt"), results.join("\n") + "\n");
console.log(results.join("\n"));
const falhas = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + results.length + " checagens, " + falhas + " falhas");
process.exit(falhas ? 1 : 0);
