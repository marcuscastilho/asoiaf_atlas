// Verificacao de INTEGRACAO do dataset REAL v4 (atlas-saga-v4) em
// /atlas/. SO roda quando atlas/data/atlas-inventario-v4.json estiver
// publicado — SEM interceptacao: prova que o v4 real carrega, sem
// fallback silencioso. As expectativas semanticas (capitulos
// canonicos) vêm do contrato; ids/coords vem do proprio artefato
// (nada de coordenada inventada no teste).
// Uso: node atlas/test/verificar-saga-v4.mjs  (servidor 8080 ativo)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8080";
const DIR = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(DIR, "evidencias");
mkdirSync(OUT, { recursive: true });

const DATA_PATH = join(DIR, "..", "data", "atlas-inventario-v4.json");
if (!existsSync(DATA_PATH)) {
  console.log("SKIP: atlas-inventario-v4.json ainda nao publicado.");
  process.exit(0);
}
const DADOS = JSON.parse(readFileSync(DATA_PATH, "utf8"));
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
    writeFileSync(join(OUT, "saga-v4-resultados.txt"),
      results.join("\n") + "\n# ABORTADO: " + e.message + "\n");
  } catch {}
  throw e;
});

/* ---------- resolucao data-driven a partir do artefato ---------- */
const cps = {};
(DADOS.controlPoints || []).forEach((p) => { cps[p.id] = p; });
function cp(id) { return cps[id]; }
function rotaDe(re) {
  return (DADOS.routes || []).find((r) =>
    re.test(r.character || "") || re.test(r.id || ""));
}
function posicaoEm(rt, cap) {
  return (rt.positions || []).find((p) =>
    cap >= p.startChapter && cap <= p.endChapter) || null;
}
function livroDe(cap) {
  return (DADOS.books || []).find((b) =>
    cap >= b.startChapter && cap <= b.endChapter) || null;
}
function rotulo(cpP) {
  return (cpP && (cpP.label || cpP.english || cpP.id)) || "?";
}

/* ---------- helpers de pagina ---------- */
async function irPara(page, cap) {
  const lv = livroDe(cap);
  if (lv) {
    const atual = await page.evaluate(() =>
      document.querySelector("#livro-select").value);
    if (atual !== lv.id) {
      await page.selectOption("#livro-select", lv.id);
      await page.waitForTimeout(250);
    }
  }
  await page.locator("#cap-slider").evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, cap);
  await page.waitForTimeout(300);
}

/* limpa a selecao e marca um unico personagem — clique DOM no botao
   (desabilitado = no-op, sem espera de actionability) */
async function solo(page, rtId) {
  await page.evaluate(() =>
    document.querySelector("#btn-limpar-sel").click());
  await page.waitForTimeout(250);
  await page.check("#chk-" + rtId);
  await page.waitForTimeout(350);
}

/* pinos de posicao atuais: agrupados por localidade, title traz os
   nomes dos personagens presentes */
function pinos(page) {
  return page.evaluate(() => {
    const out = [];
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Marker &&
          l.options.alt === "Posição de personagem") {
        const ll = l.getLatLng();
        out.push({ t: l.options.title || "", lat: ll.lat, lng: ll.lng });
      }
    });
    return out;
  });
}

/* vertices das polilinhas interativas (cor 4px sobre o contorno) */
function linhas(page) {
  return page.evaluate(() => {
    const out = [];
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.Polyline && !(l instanceof L.Polygon) &&
          l.options.interactive && l.options.weight === 4) {
        out.push(l.getLatLngs().map((p) => [p.lat, p.lng]));
      }
    });
    return out;
  });
}

/* limites do overlay de imagem (previa) para latlng esperado */
function dimsImagem(page) {
  return page.evaluate(() => {
    let b = null;
    window.__atlasMap.eachLayer((l) => {
      if (l instanceof L.ImageOverlay && !b) b = l.getBounds();
    });
    return b ? { n: b.getNorth(), s: b.getSouth(), e: b.getEast() }
      : null;
  });
}
const TOL = 1e-4;
/* interpolacao linear nos limites do overlay — vale nos dois modos:
   previa ([0,0]x[h,w]) e nativo (unproject: norte=0, sul<0) */
function esperado(dims, x, y) {
  return [dims.n + (dims.s - dims.n) * (y / MAN.height),
    dims.e * (x / MAN.width)];
}
function temPinEm(ps, nome, x, y, dims) {
  const [la, lo] = esperado(dims, x, y);
  const re = new RegExp(nome, "i");
  return ps.some((p) => re.test(p.t) &&
    Math.abs(p.lat - la) < TOL && Math.abs(p.lng - lo) < TOL);
}
function semPinEm(ps, nome, x, y, dims) {
  return !temPinEm(ps, nome, x, y, dims);
}
function semPin(ps, nome) {
  const re = new RegExp(nome, "i");
  return !ps.some((p) => re.test(p.t));
}
function linhaCasa(ls, points, dims) {
  return ls.some((ln) => ln.length === points.length &&
    points.every((pt, i) => {
      const [la, lo] = esperado(dims, pt[0], pt[1]);
      return Math.abs(ln[i][0] - la) < TOL &&
        Math.abs(ln[i][1] - lo) < TOL;
    }));
}

const browser = await chromium.launch();
async function novaPagina(vp) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  /* fixa a suite no v4 congelado: quando o v5 for publicado, a cascata
     tentaria o arquivo mais novo primeiro */
  await page.route("**/atlas/data/atlas-inventario-v5.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  /* fixa o salto mais novo: sem este pino a suite carregaria
     o v6 publicado em vez do conjunto pretendido */
  await page.route("**/atlas/data/atlas-percursos-v7.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
  await page.route("**/atlas/data/atlas-percursos-v6.json", (route) =>
    route.fulfill({ status: 404, body: "ausente" }));
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
      invResps.push(resp.status() + " " +
        resp.url().split("/").pop());
    }
  });
  await page.goto(BASE + "/atlas/");
  /* dados carregados (qualquer dataset) — tolera fila de sockets após tiles */
  await page.waitForSelector("#lista-personagens input[type=checkbox]",
    { state: "attached", timeout: 45000 });
  try {
    /* attached: em mobile a lateral nasce recolhida (display:none no pai),
       entao o select fica sem caixa mesmo com o atributo removido */
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
  return { ctx, page };
}

/* ---------- contrato do artefato (contagens declaradas) ---------- */
check("v4 real: datasetId atlas-saga-v4",
  DADOS.datasetId === "atlas-saga-v4", DADOS.datasetId);
check("v4 real: schemaVersion 2", DADOS.schemaVersion === 2);
check("v4 real: 5 livros declarados",
  Array.isArray(DADOS.books) && DADOS.books.length === 5,
  "n=" + (DADOS.books || []).length);
check("v4 real: 344 capítulos declarados",
  (DADOS.chapters || []).length === 344,
  "n=" + (DADOS.chapters || []).length);
check("v4 real: 27 rotas selecionáveis",
  (DADOS.routes || []).length === 27,
  "n=" + (DADOS.routes || []).length);
check("v4 real: 242 pontos de controle",
  (DADOS.controlPoints || []).length === 242,
  "n=" + (DADOS.controlPoints || []).length);

const dany = rotaDe(/daenerys|dany/i);
const tyrion = rotaDe(/tyrion/i);
const sam = rotaDe(/samwell|sam/i);
const robb = rotaDe(/robb/i);
const joffrey = rotaDe(/joffrey/i);
const tywin = rotaDe(/tywin/i);

/* ---------- desktop preview: presenca real + capitulos ---------- */
{
  const { ctx, page } = await novaPagina({ width: 1366, height: 900 });

  const nChk = await page.locator(
    "#lista-personagens input[type=checkbox]").count();
  check("UI: 27 perfis selecionáveis", nChk === 27, "n=" + nChk);
  /* a UI minimalista nao expoe mais contagem textual: a prova de
     "v4 real, sem fallback" e a lista com 242 pontos de controle */
  const nLocs = await page.locator("#loc-lista li").count();
  check("UI: inventário v4 real carregado (sem fallback)",
    nLocs === 242, "n=" + nLocs);
  const nLivros = await page.locator("#livro-select option").count();
  check("UI: 5 livros + Todos no seletor", nLivros === 6, "n=" + nLivros);

  const dims = await dimsImagem(page);
  check("UI: overlay de imagem disponível", !!dims);

  /* ---- sem spoilers automaticos ---- */
  if (check("rota Daenerys presente", !!dany, dany && dany.id)) {
    await solo(page, dany.id);
    const ls0 = await linhas(page);
    check("cap0: seleção não revela linha futura (anti-spoiler)",
      ls0.length === 0, "linhas=" + ls0.length);
    /* posicao herdada 0..10 existe (Pentos): o anti-spoiler vale
       para pinos FUTUROS — o inicial legitimo permanece */
    const pos0 = posicaoEm(dany, 0);
    const pos85 = posicaoEm(dany, 85);
    const ps0 = await pinos(page);
    if (check("cap0: posição inicial herdada registrada",
        !!(pos0 && cp(pos0.locationId)), pos0 && pos0.locationId)) {
      const p0 = cp(pos0.locationId);
      check("cap0: posição inicial é Pentos",
        /pentos/i.test(rotulo(p0)), rotulo(p0));
      check("cap0: pino inicial em Pentos visível",
        temPinEm(ps0, dany.character, p0.x, p0.y, dims));
      if (pos85 && cp(pos85.locationId)) {
        check("cap0: nenhum pino futuro (Vaes Tolorro/Qarth)",
          semPinEm(ps0, dany.character,
            cp(pos85.locationId).x, cp(pos85.locationId).y, dims));
      }
    }

    /* Vaes Tolorro em 85; corredor de Qarth so a partir de 100 */
    check("dany@85: posição registrada",
      !!pos85, pos85 && pos85.locationId);
    if (pos85 && cp(pos85.locationId)) {
      const p = cp(pos85.locationId);
      check("dany@85: local é Vaes Tolorro",
        /vaes tolorro/i.test(rotulo(p)), rotulo(p));
      await irPara(page, 85);
      const ps = await pinos(page);
      check("dany@85: pino em Vaes Tolorro",
        temPinEm(ps, dany.character, p.x, p.y, dims));
    }
    const seg100 = (dany.segments || []).filter((s) =>
      s.startChapter === 100);
    check("dany: corredor de Qarth começa em 100 (seg existe)",
      seg100.length >= 1, "n=" + seg100.length);
    check("dany: nenhum trecho novo entre 86..99",
      (dany.segments || []).every((s) =>
        s.startChapter <= 85 || s.startChapter >= 100));
    await irPara(page, 99);
    const ls99 = await linhas(page);
    check("dany@99: corredor de Qarth ainda ausente",
      !linhaCasa(ls99, seg100[0] ? seg100[0].points : [[0, 0]], dims),
      "linhas=" + ls99.length);
    await irPara(page, 100);
    const ls100 = await linhas(page);
    check("dany@100: corredor de Qarth renderizado",
      seg100.length > 0 &&
        linhaCasa(ls100, seg100[0].points, dims),
      "linhas=" + ls100.length);

    /* Astapor 166, Yunkai 185, Meereen 200 (ASOS) */
    for (const [cap, nome] of [[166, "Astapor"], [185, "Yunkai"],
      [200, "Meereen"]]) {
      const pos = posicaoEm(dany, cap);
      if (check("dany@" + cap + ": posição registrada",
          !!pos, pos && pos.locationId)) {
        const p = cp(pos.locationId);
        check("dany@" + cap + ": local é " + nome,
          new RegExp(nome, "i").test(rotulo(p)), rotulo(p));
        await irPara(page, cap);
        const ps = await pinos(page);
        check("dany@" + cap + ": pino em " + nome,
          temPinEm(ps, dany.character, p.x, p.y, dims));
      }
    }

    /* sem pino de Meereen depois da partida (323) */
    const pos200 = posicaoEm(dany, 200);
    const meereen = pos200 && cp(pos200.locationId);
    await irPara(page, 324);
    const ps324 = await pinos(page);
    check("dany@324: sem pino em Meereen após a partida",
      meereen ? semPinEm(ps324, dany.character, meereen.x, meereen.y, dims)
              : semPin(ps324, dany.character),
      "pinos=" + ps324.length);
  }

  /* ---- Tyrion: Pentos 272 (não 271); Rhoyne 285/289/293/298 ---- */
  if (check("rota Tyrion presente", !!tyrion, tyrion && tyrion.id)) {
    await solo(page, tyrion.id);
    const pos272 = posicaoEm(tyrion, 272);
    check("tyrion@272: posição registrada",
      !!pos272, pos272 && pos272.locationId);
    const pentos = pos272 && cp(pos272.locationId);
    if (pentos) {
      check("tyrion@272: local é Pentos",
        /pentos/i.test(rotulo(pentos)), rotulo(pentos));
      await irPara(page, 271);
      const ps271 = await pinos(page);
      check("tyrion@271: ainda SEM pino em Pentos",
        semPinEm(ps271, tyrion.character, pentos.x, pentos.y, dims));
      await irPara(page, 272);
      const ps272 = await pinos(page);
      check("tyrion@272: pino em Pentos (barco)",
        temPinEm(ps272, tyrion.character, pentos.x, pentos.y, dims));
    }
    for (const cap of [285, 289, 293, 298]) {
      const pos = posicaoEm(tyrion, cap);
      if (check("tyrion@" + cap + ": posição Rhoyne registrada",
          !!pos, pos && pos.locationId)) {
        const p = cp(pos.locationId);
        await irPara(page, cap);
        const ps = await pinos(page);
        check("tyrion@" + cap + ": pino em " + rotulo(p),
          temPinEm(ps, tyrion.character, p.x, p.y, dims));
      }
    }
  }

  /* ---- Sam: Oldtown 270 em AFFC; sem linha Braavos->Oldtown antes ---- */
  if (check("rota Sam presente", !!sam, sam && sam.id)) {
    await solo(page, sam.id);
    const pos270 = posicaoEm(sam, 270);
    check("sam@270: posição registrada",
      !!pos270, pos270 && pos270.locationId);
    const oldtown = pos270 && cp(pos270.locationId);
    check("sam@270: capítulo 270 pertence a AFFC",
      livroDe(270) && livroDe(270).id === "affc",
      livroDe(270) && livroDe(270).id);
    if (oldtown) {
      check("sam@270: local é Oldtown",
        /oldtown|vilavelha/i.test(rotulo(oldtown)), rotulo(oldtown));
      const segMar = (sam.segments || []).find((s) =>
        s.startChapter === 270);
      await irPara(page, 269);
      const ls269 = await linhas(page);
      const ps269 = await pinos(page);
      check("sam@269: sem pino em Oldtown",
        semPinEm(ps269, sam.character, oldtown.x, oldtown.y, dims));
      check("sam@269: sem linha Braavos->Oldtown concluída",
        !segMar || !linhaCasa(ls269, segMar.points, dims),
        "linhas=" + ls269.length);
      await irPara(page, 270);
      const ps270b = await pinos(page);
      check("sam@270: pino em Oldtown",
        temPinEm(ps270b, sam.character, oldtown.x, oldtown.y, dims));
    }
  }

  /* ---- Robb: volta a Riverrun em 157 (não 145); para após 193 ---- */
  if (check("rota Robb presente", !!robb, robb && robb.id)) {
    await solo(page, robb.id);
    const pos157 = posicaoEm(robb, 157);
    check("robb@157: posição registrada",
      !!pos157, pos157 && pos157.locationId);
    const riverrun = pos157 && cp(pos157.locationId);
    if (riverrun) {
      check("robb@157: local é Riverrun",
        /riverrun|correrrio/i.test(rotulo(riverrun)), rotulo(riverrun));
      await irPara(page, 145);
      const ps145 = await pinos(page);
      check("robb@145: ainda SEM pino em Riverrun",
        semPinEm(ps145, robb.character, riverrun.x, riverrun.y, dims));
      await irPara(page, 157);
      const ps157 = await pinos(page);
      check("robb@157: pino em Riverrun (retorno)",
        temPinEm(ps157, robb.character, riverrun.x, riverrun.y, dims));
    }
    await irPara(page, 194);
    const ps194 = await pinos(page);
    check("robb@194: sem pino de posição (fonte encerrada em 193)",
      semPin(ps194, robb.character), "pinos=" + ps194.length);
  }

  /* ---- posições de mortos nunca viram pinos vivos ---- */
  if (joffrey) {
    await solo(page, joffrey.id);
    await irPara(page, 203);
    const ps = await pinos(page);
    check("joffrey@203: sem pino (fonte encerrada em 202)",
      semPin(ps, joffrey.character), "pinos=" + ps.length);
  } else {
    check("rota Joffrey presente", false);
  }
  if (tywin) {
    await solo(page, tywin.id);
    await irPara(page, 220);
    const ps = await pinos(page);
    check("tywin@220: sem pino (fonte encerrada em 219)",
      semPin(ps, tywin.character), "pinos=" + ps.length);
  } else {
    check("rota Tywin presente", false);
  }

  /* ---- troca de livro/solo nunca avança o capitulo ---- */
  if (dany) {
    await solo(page, dany.id);
    await page.selectOption("#livro-select", "adwd");
    await page.waitForTimeout(300);
    const capApos = await page.evaluate(() =>
      Number(document.querySelector("#cap-slider").value));
    check("trocar para ADWD vai ao início do livro (271), não ao fim",
      capApos === 271, "cap=" + capApos);
  }

  /* stress: TODOS os 27 selecionados no capítulo 343 — nenhum erro,
     capitulo e selecao preservados apos Ver percurso */
  for (const rt of DADOS.routes || []) {
    await page.check("#chk-" + rt.id).catch(() => {});
  }
  await irPara(page, 343);
  const nSel343 = await page.evaluate(() =>
    document.querySelectorAll(
      "#lista-personagens input:checked").length);
  check("stress: 27 perfis selecionados no cap 343",
    nSel343 === 27, "n=" + nSel343);
  await page.evaluate(() =>
    document.querySelector("#btn-focus-pers").click());
  await page.waitForTimeout(1200);
  const st343 = await page.evaluate(() => ({
    cap: document.querySelector("#cap-slider").value,
    sel: document.querySelectorAll(
      "#lista-personagens input:checked").length,
    camadas: document.querySelectorAll(
      "path.leaflet-interactive").length
  }));
  check("stress 27@343: capítulo preservado após Ver percurso",
    st343.cap === "343", "cap=" + st343.cap);
  check("stress 27@343: seleção de 27 preservada",
    st343.sel === 27, "sel=" + st343.sel);
  check("stress 27@343: linhas renderizadas",
    st343.camadas > 0, "paths=" + st343.camadas);

  await page.screenshot({ path: join(OUT, "saga-v4-desktop.png"),
    fullPage: true });
  await ctx.close();
}

/* ---------- nativo: vértices de um rio e de uma perna marítima ---------- */
{
  const { ctx, page } = await novaPagina({ width: 1366, height: 900 });
  if (tyrion) await solo(page, tyrion.id);
  /* nativo sobe sozinho no boot — espera os tiles como ponto de
     sincronia antes das leituras de geometria */
  await page.waitForSelector("img.leaflet-tile-loaded",
    { timeout: 30000 });
  await page.waitForTimeout(400);

  /* rio: primeiro trecho FLUVIAL de Tyrion (travelMode 'river'),
     esperado em 285 — um find generico >=271 pegaria a perna
     maritima de Pentos (272), nao o Rhoyne */
  const segRio = tyrion &&
    (tyrion.segments || []).find((s) => s.travelMode === "river");
  if (check("nativo: trecho fluvial de Tyrion no dataset",
      !!segRio, segRio && segRio.id)) {
    check("nativo: trecho fluvial começa em 285 (Rhoyne)",
      segRio.startChapter === 285, "start=" + segRio.startChapter);
    await irPara(page, segRio.startChapter);
    const casa = await page.evaluate((args) => {
      const pts = args.points.map((p) =>
        window.__atlasMap.unproject(p, args.maxZ));
      let achou = false;
      window.__atlasMap.eachLayer((l) => {
        if (!(l instanceof L.Polyline) || l instanceof L.Polygon ||
            !l.options.interactive) return;
        const ll = l.getLatLngs();
        if (ll.length === pts.length &&
            pts.every((q, i) =>
              Math.abs(ll[i].lat - q.lat) < 1e-4 &&
              Math.abs(ll[i].lng - q.lng) < 1e-4)) achou = true;
      });
      return achou;
    }, { points: segRio.points, maxZ: MAN.maxNativeZoom });
    check("nativo: rio (Rhoyne) renderiza vértices do dataset", casa);

    /* popup do trecho fluvial: o modo precisa aparecer como
       'fluvial' (travelMode 'river' do v4) */
    const clicouRio = await page.evaluate((args) => {
      const pts = args.points.map((p) =>
        window.__atlasMap.unproject(p, args.maxZ));
      let alvo = null;
      window.__atlasMap.eachLayer((l) => {
        if (!(l instanceof L.Polyline) || l instanceof L.Polygon ||
            !l.options.interactive || alvo) return;
        const ll = l.getLatLngs();
        if (ll.length === pts.length &&
            pts.every((q, i) =>
              Math.abs(ll[i].lat - q.lat) < 1e-4 &&
              Math.abs(ll[i].lng - q.lng) < 1e-4)) alvo = l;
      });
      if (!alvo) return false;
      alvo.fire("click", { latlng: pts[Math.floor(pts.length / 2)] });
      return true;
    }, { points: segRio.points, maxZ: MAN.maxNativeZoom });
    if (clicouRio) {
      try {
        await page.waitForSelector(".leaflet-popup", { timeout: 1500 });
        const txt = await page.locator(".leaflet-popup").textContent();
        check("nativo: popup do rio identifica modo 'fluvial'",
          /fluvial/i.test(txt || ""), (txt || "").slice(0, 80));
      } catch (e) {
        check("nativo: popup do rio identifica modo 'fluvial'",
          false, "popup não abriu");
      }
    } else {
      check("nativo: popup do rio identifica modo 'fluvial'",
        false, "linha do rio não encontrada para clique");
    }
  }

  /* mar: trecho MISTO NOVO do v4 com perna mode 'sea' (Theon84 ou
     Stannis219): startChapter>=73 evita pegar o trecho AGOT antigo
     da Catelyn. Cada perna vira uma polilinha propria — compara a
     FATIA points[startVertex..endVertex] da perna maritima */
  let segMar = null, rtMar = null, pernaMar = null;
  for (const rt of DADOS.routes || []) {
    for (const s of rt.segments || []) {
      if (s.startChapter < 73) continue;
      const legs = s.transportLegs || [];
      const perna = legs.find((l) => l.mode === "sea");
      if (perna && legs.length > 1) {
        segMar = s; rtMar = rt; pernaMar = perna; break;
      }
    }
    if (segMar) break;
  }
  if (check("nativo: trecho misto com perna marítima no dataset",
      !!(segMar && pernaMar), rtMar && rtMar.id)) {
    const fatia = segMar.points.slice(
      pernaMar.startVertex, pernaMar.endVertex + 1);
    await solo(page, rtMar.id);
    await irPara(page, segMar.startChapter);
    const casa = await page.evaluate((args) => {
      const pts = args.points.map((p) =>
        window.__atlasMap.unproject(p, args.maxZ));
      let achou = false;
      window.__atlasMap.eachLayer((l) => {
        if (!(l instanceof L.Polyline) || l instanceof L.Polygon ||
            !l.options.interactive) return;
        const ll = l.getLatLngs();
        if (ll.length === pts.length &&
            pts.every((q, i) =>
              Math.abs(ll[i].lat - q.lat) < 1e-4 &&
              Math.abs(ll[i].lng - q.lng) < 1e-4)) achou = true;
      });
      return achou;
    }, { points: fatia, maxZ: MAN.maxNativeZoom });
    check("nativo: perna marítima renderiza a fatia de vértices",
      casa, rtMar.id + " " + fatia.length + "pt");
  }
  await page.screenshot({ path: join(OUT, "saga-v4-nativo.png") });
  await ctx.close();
}

/* ---------- mobile 390 + 320: sem overflow ---------- */
for (const largura of [390, 320]) {
  const { ctx, page } = await novaPagina({ width: largura, height: 844 });
  const btn = await page.$("#btn-painel");
  if (btn) { await btn.click(); await page.waitForTimeout(300); }
  const ov = await page.evaluate(() =>
    document.documentElement.scrollWidth -
    document.documentElement.clientWidth);
  check("mobile " + largura + ": sem overflow horizontal",
    ov <= 1, "overflow=" + ov);
  await ctx.close();
}

await browser.close();

const externos = requests.filter((u) => !u.startsWith(BASE));
check("nenhuma requisição externa", externos.length === 0,
  externos.join(", ") || "todas locais");
const mestres = requests.filter((u) =>
  /\/mapas\/(jpeg|png|webp\/reduzidos)\//.test(u));
check("nenhum fetch de imagem mestre", mestres.length === 0,
  mestres.join(", ") || "ok");
check("tiles realmente requisitados no nativo",
  tileResponses.length > 0, "n=" + tileResponses.length);
const tilesRuins = tileResponses.filter((t) => !t.startsWith("200"));
check("todas respostas de tile HTTP 200", tilesRuins.length === 0,
  tilesRuins.join(", ") || "ok");
check("nenhuma requisição falha", failedReqs.length === 0,
  failedReqs.join(" | ") || "ok");
check("sem pageerrors", pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "));

writeFileSync(join(OUT, "saga-v4-resultados.txt"),
  results.join("\n") + "\n");
console.log("— verificar-saga-v4 —");
results.forEach((r) => console.log(r));
const falhas = results.filter((r) => r.startsWith("FAIL"));
console.log(falhas.length
  ? falhas.length + " falha(s)"
  : "0 falhas — " + results.length + " checagens");
process.exit(falhas.length ? 1 : 0);
