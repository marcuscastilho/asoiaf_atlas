/* Atlas piloto — localidades interativas, multiplos personagens e trajetos
   aproximados (dataset v2, com adaptador v1). Renderer + helpers puros.
   Coordenadas em pixels nativos recortados (origem canto superior
   esquerdo); converte para o modo ativo: previa (imageOverlay) ou nativo
   (tiles unproject). Todo conteudo textual entra no DOM via textContent —
   nada de HTML injetado. */
window.GOTATLAS = (function () {
  "use strict";

  var MANIFEST_URL = "data/mapa.json";
  var RESUMOS_URL = "data/locais-resumos.json";
  var DATA_URL_V7 = "data/atlas-percursos-v7.json";
  var DATA_URL_V6 = "data/atlas-percursos-v6.json";
  var DATA_URL_V5 = "data/atlas-inventario-v5.json";
  var DATA_URL_V4 = "data/atlas-inventario-v4.json";
  var DATA_URL = "data/atlas-inventario-v3.json";
  var DATA_FALLBACK_V2_URL = "data/atlas-agot-v2.json";
  var DATA_FALLBACK_URL = "data/piloto-norte.json";
  var SISTEMA_ESPERADO = "cropped-native-pixels";
  var COR_PADRAO = "#a8741a";
  var COR_REGEX = /^#[0-9a-f]{6}$/i;
  var DATASET_FALLBACK_ID = "piloto-norte-v1";
  var STORAGE_PREFIX = "gotatlas-estado-";
  var CAP_MIN = 0;
  var ROTULO_W = 100;
  var ROTULO_H = 24;
  var ZOOM_BUSCA_NATIVO = 4;
  var MARGEM_CULLING = 0.12;

  /* tipos de localidade (campo opcional `kind` dos pontos) */
  var TIPOS_PONTO = {
    "castle": "Castelos",
    "city": "Cidades",
    "village": "Vilarejos",
    "ruin": "Ruínas",
    "settlement": "Localidades",
    "unknown-settlement": "Símbolos sem identificação"
  };
  /* status de identificacao (campo opcional `identificationStatus`) —
     validacao dos valores conhecidos; a UI nao os expoe mais */
  var ID_STATUS = {
    "printed-name": "Nome impresso",
    "portal-correspondence-review": "Identificação pendente",
    "companion-map-review": "Correspondência cartográfica em revisão",
    "unidentified-symbol": "Símbolo sem identificação",
    "geographically-described":
      "Descrição geográfica; nome próprio não informado",
    "named-group-member":
      "Identificação do conjunto; sem nome próprio individual",
    "wiki-review": "Nome documentado por mapa regional e wiki",
    "companion-map-projected":
      "Localidade projetada do mapa companheiro"
  };
  /* singular honesto para simbolos cuja natureza o glifo indica sem
     nomear a localidade — 'unidentified' nao significa tipo incognito */
  var TIPO_SINGULAR = {
    "castle": "castelo",
    "city": "cidade",
    "village": "vilarejo",
    "ruin": "ruína",
    "settlement": "localidade",
    "unknown-settlement": "símbolo sem identificação"
  };

  var state = {
    map: null,
    viewReady: false,
    mode: "preview",
    naturalW: 0,
    naturalH: 0,
    manifestFetch: null,
    manifestNative: null,
    data: null,              /* dados adaptados p/ forma interna v2 */
    dataRaw: null,           /* dados originais (para revalidacao) */
    dataReady: false,
    datasetId: null,
    /* camadas */
    featureMarkers: [],
    routeLayers: [],
    positionMarkers: [],
    /* estado de UI (persistido/restaurado) */
    locVisible: true,
    labelsVisible: true,
    /* livro explicitamente escolhido no seletor: id de livro ou
       "todos" (slider varre os capitulos globais); null = deriva do
       capitulo corrente (comportamento padrao) */
    livroSel: null,
    selecionados: {},
    chapter: 0,
    markerOnly: false,
    rotaPopup: null,
    rotaPopupRef: null,
    query: "",
    /* resumos curtos + chaves de wiki por localidade (sidecar local,
       carregado preguiçosamente; ausencia nunca quebra o card) */
    resumos: null,
    /* foco em localidade: intencao mais recente vence; o popup so abre
       quando o marcador (re)existir na camada */
    focusLocalId: null,
    pendingFocus: false,
    pendingHashFocusId: null,
    focoPopup: null,
    focoPopupId: null
  };

  var els = {};

  function qs(id) {
    return document.getElementById(id);
  }

  function setStatus(msg) {
    els.status.textContent = msg || "";
  }

  function manifestAtivo() {
    if (state.mode === "native" && state.manifestNative) {
      return state.manifestNative;
    }
    return state.manifestFetch || state.manifestNative;
  }

  function corSegura(cor) {
    return COR_REGEX.test(cor || "") ? cor : COR_PADRAO;
  }

  /* ---------- helpers puros ---------- */

  function mesmoArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function finitoDentro(x, y, W, H) {
    return (
      typeof x === "number" && typeof y === "number" &&
      isFinite(x) && isFinite(y) &&
      x >= 0 && x <= W && y >= 0 && y <= H
    );
  }

  /* inteiro de capitulo dentro de 0..max; sem max declarado o teto
     fica aberto (o indice do proprio capitulo) */
  function intCapitulo(v, max) {
    return typeof v === "number" && isFinite(v) && Math.floor(v) === v &&
      v >= CAP_MIN && (max === undefined || v <= max);
  }

  /* inteiro >= 0 (contagens liquidadas do conjunto) */
  function intNaoNeg(v) {
    return typeof v === "number" && isFinite(v) && Math.floor(v) === v &&
      v >= 0;
  }

  var SLUG_RE = /^[a-z][a-z0-9-]*$/;

  function ehObj(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  /* conteiner opcional: ausente/null ok; quando presente deve ser array */
  function arrOpcional(v) {
    return v === undefined || v === null || Array.isArray(v);
  }

  /* evidencias opcionais: array de objetos (registros) quando presente */
  function evidenciasOk(v) {
    if (!arrOpcional(v)) return false;
    if (!Array.isArray(v)) return true;
    for (var i = 0; i < v.length; i++) {
      if (!ehObj(v[i])) return false;
    }
    return true;
  }

  function adaptarData(d) {
    if (!d || d.schemaVersion === 2) return d;
    if (d.schemaVersion === 1) {
      /* adapta piloto-norte v1 (route singular) para forma interna v2 */
      var routes = [];
      if (d.route && typeof d.route === "object") {
        var r = d.route;
        routes.push({
          /* v1 guarda route.id ("jon-agot-north"); v2 usa characterKey */
          id: String(
            r.characterKey ||
              (r.character
                ? String(r.character).split(" ")[0].toLowerCase()
                : "") ||
              r.id ||
              "personagem"
          ),
          character: r.character || "Personagem",
          color: COR_PADRAO,
          status: r.status || "approximate",
          book: r.book || "",
          notice: r.notice || "",
          segments: r.segments || [],
          positions: r.positions || [],
          omittedRecords: [],
          omittedSourceRecordIndices: r.omittedSourceRecordIndices || [],
          evidence: r.evidence || []
        });
      }
      return Object.assign({}, d, {
        datasetId: d.datasetId || DATASET_FALLBACK_ID,
        routes: routes,
        regions: d.regions || []
      });
    }
    return d;
  }

  /* retorna o motivo (string) ou null; nunca lanca excecao para
     formatos arbitrarios de JSON */
  function puroValidarDados(raw, manifest) {
    try {
      return validarDadosInterno(raw, manifest);
    } catch (e) {
      return "estrutura de dados inesperada";
    }
  }

  function validarDadosInterno(raw, manifest) {
    if (!ehObj(raw)) return "dados ausentes";
    if (!ehObj(manifest)) return "manifesto ausente";
    if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) {
      return "schemaVersion inesperado";
    }
    if (raw.mapId !== manifest.id) return "mapId divergente";
    if (raw.tileSetId !== manifest.tileSetId) {
      return "conjunto de tiles divergente";
    }
    if (raw.sourceSha256 !== manifest.sourceSha256) {
      return "hash da fonte divergente";
    }
    if (raw.coordinateSystem !== SISTEMA_ESPERADO) {
      return "sistema de coordenadas inesperado";
    }
    if (raw.mapWidth !== manifest.width || raw.mapHeight !== manifest.height) {
      return "dimensões divergentes";
    }
    if (!mesmoArray(raw.cropBoxOriented, manifest.cropBoxOriented)) {
      return "recorte divergente";
    }
    if (raw.schemaVersion === 2 &&
        (typeof raw.datasetId !== "string" || !SLUG_RE.test(raw.datasetId))) {
      return "datasetId inválido";
    }
    /* capitulos: objetos com indice inteiro unico, contiguo a partir
       de 0 — o ultimo suportado deriva do maior indice declarado,
       nao de uma constante */
    var caps = raw.chapters;
    if (!Array.isArray(caps) || !caps.length) {
      return "capítulos ausentes";
    }
    var idx = Object.create(null);
    var maxCap = 0;
    for (var ci = 0; ci < caps.length; ci++) {
      var c = caps[ci];
      if (!ehObj(c) || !intCapitulo(c.index)) {
        return "capítulo inválido";
      }
      if (idx[c.index]) return "capítulo duplicado";
      idx[c.index] = true;
      if (c.index > maxCap) maxCap = c.index;
      if (c.title !== undefined && typeof c.title !== "string") {
        return "título de capítulo inválido";
      }
      if (c.originalTitle !== undefined &&
          typeof c.originalTitle !== "string") {
        return "título original de capítulo inválido";
      }
    }
    for (var i = 0; i <= maxCap; i++) {
      if (!idx[i]) return "capítulos não contíguos";
    }
    /* livros opcionais: ids unicos, limites inteiros contiguos sem
       sobreposicao cobrindo exatamente os capitulos declarados; cada
       capitulo entao precisa apontar um livro valido dentro dele */
    if (raw.books !== undefined && raw.books !== null) {
      if (!Array.isArray(raw.books) || !raw.books.length) {
        return "books malformado";
      }
      var livroIds = Object.create(null);
      var esperado = 0;
      for (var bi = 0; bi < raw.books.length; bi++) {
        var lv = raw.books[bi];
        if (!ehObj(lv) || typeof lv.id !== "string" ||
            !SLUG_RE.test(lv.id) || livroIds[lv.id] ||
            typeof lv.title !== "string" || !lv.title.trim() ||
            !intCapitulo(lv.startChapter) ||
            !intCapitulo(lv.endChapter, maxCap) ||
            lv.startChapter > lv.endChapter ||
            lv.startChapter !== esperado) {
          return "livro malformado ou fora de ordem";
        }
        if (lv.code !== undefined && typeof lv.code !== "string") {
          return "código de livro inválido";
        }
        livroIds[lv.id] = lv;
        esperado = lv.endChapter + 1;
      }
      if (esperado !== maxCap + 1) {
        return "books não cobrem os capítulos";
      }
      for (var cb = 0; cb < caps.length; cb++) {
        var cc = caps[cb];
        var lvDo = livroIds[cc.bookId];
        if (!lvDo) return "capítulo sem livro declarado";
        if (cc.index < lvDo.startChapter || cc.index > lvDo.endChapter) {
          return "capítulo fora dos limites do livro";
        }
        if (cc.localIndex !== undefined &&
            !intCapitulo(
              cc.localIndex,
              lvDo.endChapter - lvDo.startChapter + 1)) {
          return "índice local de capítulo inválido";
        }
      }
    }
    /* pontos de controle: objetos, ids string unicos nao vazios,
       coordenadas finitas dentro dos limites */
    var cps = raw.controlPoints;
    if (!Array.isArray(cps) || !cps.length) return "controlPoints ausente";
    var W = manifest.width;
    var H = manifest.height;
    var ids = Object.create(null);
    for (var j = 0; j < cps.length; j++) {
      var p = cps[j];
      if (!ehObj(p) || typeof p.id !== "string" || !p.id || ids[p.id] ||
          !finitoDentro(p.x, p.y, W, H)) {
        return "ponto de controle inválido";
      }
      if (p.kind !== undefined &&
          (typeof p.kind !== "string" ||
            !Object.prototype.hasOwnProperty.call(TIPOS_PONTO, p.kind))) {
        return "tipo de localidade desconhecido";
      }
      if (p.identificationStatus !== undefined &&
          (typeof p.identificationStatus !== "string" ||
            !Object.prototype.hasOwnProperty.call(
              ID_STATUS, p.identificationStatus))) {
        return "status de identificação desconhecido";
      }
      if (p.summary !== undefined && typeof p.summary !== "string") {
        return "resumo de localidade inválido";
      }
      if (p.aliases !== undefined &&
          (!Array.isArray(p.aliases) ||
            p.aliases.some(function (a) {
              return typeof a !== "string";
            }))) {
        return "aliases de localidade inválidos";
      }
      if (!evidenciasOk(p.evidence)) return "evidência de ponto malformada";
      ids[p.id] = true;
    }
    /* rotas: v2 usa routes[], v1 usa route singular; arrays vazios sao
       um estado honesto, objetos soltos nao */
    var routes;
    if (raw.schemaVersion === 2) {
      if (!arrOpcional(raw.routes)) return "routes malformado";
      routes = raw.routes || [];
    } else {
      routes = raw.route ? [raw.route] : [];
      if (raw.route && !ehObj(raw.route)) return "route malformado";
    }
    if (!Array.isArray(routes)) return "routes malformado";
    var rids = Object.create(null);
    for (var k = 0; k < routes.length; k++) {
      var rt = routes[k];
      if (!ehObj(rt) || typeof rt.id !== "string" || !SLUG_RE.test(rt.id) ||
          rids[rt.id]) {
        return "rota sem id único válido";
      }
      rids[rt.id] = true;
      if (typeof rt.character !== "string" || !rt.character.trim()) {
        return "rota sem personagem";
      }
      if (rt.color !== undefined && !COR_REGEX.test(String(rt.color))) {
        return "cor de rota inválida";
      }
      if (rt.status !== undefined && typeof rt.status !== "string") {
        return "status de rota inválido";
      }
      if (rt.book !== undefined && typeof rt.book !== "string") {
        return "livro de rota inválido";
      }
      if (rt.notice !== undefined && typeof rt.notice !== "string") {
        return "aviso de rota inválido";
      }
      if (!arrOpcional(rt.segments)) return "segments malformado";
      var segs = rt.segments || [];
      for (var s = 0; s < segs.length; s++) {
        var seg = segs[s];
        if (!ehObj(seg) || !intCapitulo(seg.startChapter, maxCap) ||
            !intCapitulo(seg.endChapter, maxCap) ||
            seg.startChapter > seg.endChapter) {
          return "intervalo de capítulos inválido em segmento";
        }
        if (!Array.isArray(seg.points) || seg.points.length < 2) {
          return "segmento com menos de 2 pontos";
        }
        for (var q = 0; q < seg.points.length; q++) {
          var pt = seg.points[q];
          if (!Array.isArray(pt) || pt.length !== 2 ||
              !finitoDentro(pt[0], pt[1], W, H)) {
            return "segmento do trajeto fora dos limites";
          }
        }
      }
      if (!arrOpcional(rt.positions)) return "positions malformado";
      var poss = rt.positions || [];
      for (var t = 0; t < poss.length; t++) {
        var pp = poss[t];
        if (!ehObj(pp) || !intCapitulo(pp.startChapter, maxCap) ||
            !intCapitulo(pp.endChapter, maxCap) ||
            pp.startChapter > pp.endChapter) {
          return "intervalo de capítulos inválido em posição";
        }
        /* posicao ou aponta uma localidade conhecida (locationId) ou
           carrega um waypoint embutido com coordenadas proprias */
        if (typeof pp.locationId === "string") {
          if (!ids[pp.locationId]) {
            return "posição com localidade desconhecida";
          }
        } else if (!(typeof pp.label === "string" && pp.label &&
                     finitoDentro(pp.x, pp.y, W, H))) {
          return "posição com waypoint inválido";
        }
      }
      if (rt.omittedRecords !== undefined && rt.omittedRecords !== null) {
        if (!Array.isArray(rt.omittedRecords) ||
            !rt.omittedRecords.every(ehObj)) {
          return "omittedRecords malformado";
        }
      }
      if (rt.omittedSourceRecordIndices !== undefined &&
          rt.omittedSourceRecordIndices !== null) {
        if (!Array.isArray(rt.omittedSourceRecordIndices) ||
            !rt.omittedSourceRecordIndices.every(function (n) {
              return typeof n === "number" && isFinite(n) &&
                Math.floor(n) === n;
            })) {
          return "omittedSourceRecordIndices malformado";
        }
      }
      /* cobertura de revisao por livro (v6): exige schema 2 com
         books[]; uma entrada por livro, ids unicos cobrindo todos,
         status no rol liquidado, nota nao vazia, contagens inteiras
         nao-negativas e capitulos revisados unicos DENTRO dos
         limites daquele livro */
      if (rt.bookCoverage !== undefined && rt.bookCoverage !== null) {
        if (raw.schemaVersion !== 2 || !livroIds ||
            !Array.isArray(rt.bookCoverage) ||
            rt.bookCoverage.length !== raw.books.length) {
          return "cobertura de livro malformada";
        }
        var cobVistos = Object.create(null);
        for (var bci = 0; bci < rt.bookCoverage.length; bci++) {
          var ent = rt.bookCoverage[bci];
          var lvEnt = ehObj(ent) ? livroIds[ent.bookId] : null;
          if (!lvEnt || cobVistos[ent.bookId]) {
            return "cobertura com livro inválido ou duplicado";
          }
          cobVistos[ent.bookId] = true;
          if (ent.status !== "partial-route" &&
              ent.status !== "positions-only" &&
              ent.status !== "no-reviewed-records") {
            return "status de cobertura desconhecido";
          }
          if (typeof ent.notice !== "string" || !ent.notice.trim()) {
            return "aviso de cobertura inválido";
          }
          if (!intNaoNeg(ent.segmentsStartingInBook) ||
              !intNaoNeg(ent.positionReferencesInBook)) {
            return "contagem de cobertura inválida";
          }
          if (!Array.isArray(ent.reviewedChapters)) {
            return "capítulos revisados malformados";
          }
          var capVistos = Object.create(null);
          for (var rci = 0; rci < ent.reviewedChapters.length; rci++) {
            var capRev = ent.reviewedChapters[rci];
            if (!intCapitulo(capRev, maxCap) || capVistos[capRev] ||
                capRev < lvEnt.startChapter || capRev > lvEnt.endChapter) {
              return "capítulo revisado fora do livro";
            }
            capVistos[capRev] = true;
          }
        }
      }
      if (!evidenciasOk(rt.evidence)) return "evidência de rota malformada";
    }
    /* regioes opcionais: array de {id,label,pointIds conhecidos} */
    if (!arrOpcional(raw.regions)) return "regiões malformadas";
    var regs = raw.regions || [];
    var regIds = Object.create(null);
    for (var g = 0; g < regs.length; g++) {
      var reg = regs[g];
      if (!ehObj(reg) || typeof reg.id !== "string" || !reg.id ||
          regIds[reg.id] || typeof reg.label !== "string" ||
          !Array.isArray(reg.pointIds)) {
        return "região malformada";
      }
      for (var ri = 0; ri < reg.pointIds.length; ri++) {
        if (typeof reg.pointIds[ri] !== "string" || !ids[reg.pointIds[ri]]) {
          return "região com ponto desconhecido";
        }
      }
      regIds[reg.id] = true;
    }
    return null;
  }

  function puroPontoPreview(x, y, W, H, naturalW, naturalH) {
    return [naturalH * (1 - y / H), naturalW * (x / W)];
  }

  function puroPosicaoNoCapitulo(route, chapter, markerOnly, CORE) {
    var itens = (route && route.positions) || [];
    for (var i = 0; i < itens.length; i++) {
      var p = itens[i];
      var ranges = CORE.pathRanges({ chapters: [p.startChapter, p.endChapter] });
      if (CORE.pathOverlayVisible(ranges, "marker", "C", chapter, markerOnly)) {
        return p;
      }
    }
    return null;
  }

  function puroSegmentosNoCapitulo(route, chapter, markerOnly, CORE) {
    var segs = (route && route.segments) || [];
    return segs.filter(function (s) {
      var ranges = CORE.pathRanges({ chapters: [s.startChapter, s.endChapter] });
      return CORE.pathOverlayVisible(ranges, "line", "C", chapter, markerOnly);
    });
  }

  /* ---------- transformacoes de coordenadas ---------- */

  function pointToLatLng(x, y) {
    var m = manifestAtivo();
    if (state.mode === "native") {
      return state.map.unproject([x, y], m.maxNativeZoom);
    }
    var pt = puroPontoPreview(
      x, y,
      m.width, m.height,
      state.naturalW, state.naturalH
    );
    return L.latLng(pt[0], pt[1]);
  }

  function cpById(id) {
    var cps = state.data.controlPoints;
    for (var i = 0; i < cps.length; i++) {
      if (cps[i].id === id) return cps[i];
    }
    return null;
  }

  function rotaById(id) {
    var rs = (state.data && state.data.routes) || [];
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].id === id) return rs[i];
    }
    return null;
  }

  function idsSelecionadas() {
    return Object.keys(state.selecionados).filter(function (id) {
      return state.selecionados[id] && rotaById(id);
    });
  }

  function rotasSelecionadas() {
    return idsSelecionadas().map(rotaById);
  }

  /* ---------- regioes ---------- */

  function regioes() {
    return (state.data && state.data.regions) || [];
  }

  function regiaoDo(p) {
    var regs = regioes();
    for (var i = 0; i < regs.length; i++) {
      var ids = regs[i].pointIds || [];
      for (var j = 0; j < ids.length; j++) {
        if (ids[j] === p.id) return regs[i].id;
      }
    }
    return p.region || null;
  }

  /* rotulo pt-BR da regiao para o card da localidade */
  function regiaoLabel(p) {
    var rid = regiaoDo(p);
    var regs = regioes();
    for (var i = 0; i < regs.length; i++) {
      if (regs[i].id === rid) return regs[i].label || rid;
    }
    return rid;
  }

  /* simbolo visivel no mapa sem nome/natureza estabelecidos — nunca
     recebe identidade inventada */
  function ehSimboloNaoIdentificado(p) {
    return p.identificationStatus === "unidentified-symbol" ||
      p.identificationStatus === "geographically-described" ||
      p.kind === "unknown-settlement";
  }

  /* ---------- DOM de popup/tooltip (sempre textContent) ---------- */

  function linhaPopup(pai, cls, texto) {
    var d = document.createElement("div");
    if (cls) d.className = cls;
    d.textContent = texto;
    pai.appendChild(d);
    return d;
  }

  function tooltipNode(texto, cls) {
    var s = document.createElement("span");
    if (cls) s.className = cls;
    s.textContent = texto;
    return s;
  }

  /* primeira letra maiuscula sem mexer no resto do rotulo */
  function inicialMaiuscula(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* card curto da localidade: nome, original, tipo + regiao, resumo
     curto do sidecar e link externo verificado — nada de proveniencia,
     evidencia, notas tecnicas ou status de revisao */
  function preencherCartaoLocal(d, p) {
    var t = document.createElement("strong");
    t.textContent = p.label || p.id;
    d.appendChild(t);
    /* um unico nome original em ingles, se diferente do rotulo */
    var alt = p.english || p.originalKey || "";
    if (alt && alt !== (p.label || p.id)) {
      linhaPopup(d, "loc-popup-orig", alt);
    }
    var tipo = p.kind && TIPO_SINGULAR[p.kind];
    var reg = regiaoLabel(p);
    linhaPopup(d, "loc-popup-tipo",
      inicialMaiuscula(tipo || "localidade") + (reg ? " · " + reg : ""));
    var res = state.resumos && state.resumos[p.id];
    if (res && typeof res.resumo === "string" && res.resumo.trim()) {
      linhaPopup(d, "loc-popup-resumo", res.resumo);
    }
    if (res && typeof res.wiki === "string" && res.wiki) {
      var w = document.createElement("div");
      w.className = "loc-popup-wiki";
      var a = document.createElement("a");
      a.href = "https://awoiaf.westeros.org/index.php/" + res.wiki;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Abrir na wiki ↗";
      w.appendChild(a);
      d.appendChild(w);
    }
    return d;
  }

  function buildPopupPonto(p) {
    var d = document.createElement("div");
    d.className = "loc-popup";
    return preencherCartaoLocal(d, p);
  }

  /* popup de posicao agrupada: mesmo card curto + personagens do grupo */
  function buildPopupGrupo(grupo, cp) {
    var d = document.createElement("div");
    d.className = "loc-popup";
    if (cp) {
      preencherCartaoLocal(d, cp);
    } else {
      var t = document.createElement("strong");
      t.textContent = "Posição";
      d.appendChild(t);
    }
    var ul = document.createElement("ul");
    ul.className = "loc-popup-membros";
    grupo.forEach(function (g) {
      var li = document.createElement("li");
      li.textContent = (g.rota.character || g.rota.id) + " — capítulos " +
        g.pos.startChapter + "–" + g.pos.endChapter;
      ul.appendChild(li);
    });
    d.appendChild(ul);
    return d;
  }

  /* ---------- camadas ---------- */

  function pinIcon(cls, extraHtml) {
    return L.divIcon({
      className: "loc-pin-wrap",
      html: '<div class="' + cls + '">' + (extraHtml || "") + "</div>",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -8]
    });
  }

  function clearLayers() {
    /* popupclose disparado por remocao/reconstrucao nao deve consumir a
       intencao de foco — so fechamento feito pelo usuario consome */
    state._clearing = true;
    state.featureMarkers.forEach(function (r) { r.m.remove(); });
    state.routeLayers.forEach(function (m) { m.remove(); });
    state.positionMarkers.forEach(function (m) { m.remove(); });
    state.featureMarkers = [];
    state.routeLayers = [];
    state.positionMarkers = [];
    state._clearing = false;
  }

  /* culling: desenha so os pinos dentro dos limites visiveis (com margem) */
  function drawFeatures() {
    var bounds = state.map.getBounds().pad(MARGEM_CULLING);
    state.data.controlPoints.forEach(function (p) {
      var ll = pointToLatLng(p.x, p.y);
      if (!bounds.contains(ll)) return;
      var cls = "loc-pin";
      if (ehSimboloNaoIdentificado(p)) cls += " loc-pin-simbolo";
      else if (p.kind) cls += " loc-pin-" + p.kind;
      var m = L.marker(ll, {
        icon: pinIcon(cls),
        title: p.label || p.id,
        alt: p.label || p.id,
        keyboard: true,
        riseOnHover: true
      });
      m._ponto = p;
      m.bindPopup(buildPopupPonto(p));
      m.addTo(state.map);
      state.featureMarkers.push({ m: m, p: p });
    });
  }

  /* ---------- pernas de viagem e popup de trecho ---------- */

  /* divide o segmento pelos transportLegs (faixas inclusivas de
     vertices de seg.points); sem legs validas, uma unica perna */
  function pernasViagem(seg) {
    var pts = (seg && seg.points) || [];
    var legs = Array.isArray(seg && seg.transportLegs)
      ? seg.transportLegs : [];
    var pernas = [];
    legs.forEach(function (leg) {
      if (!leg || typeof leg.startVertex !== "number" ||
          typeof leg.endVertex !== "number") return;
      var a = Math.max(0, Math.floor(leg.startVertex));
      var b = Math.min(pts.length - 1, Math.floor(leg.endVertex));
      if (b - a < 1) return;
      pernas.push({ mode: leg.mode, pontos: pts.slice(a, b + 1) });
    });
    if (!pernas.length && pts.length >= 2) {
      pernas.push({ mode: null, pontos: pts });
    }
    return pernas;
  }

  /* modo de viagem do trecho: travelMode explicito ou derivado dos
     transportLegs (mais de um modo = misto) */
  function modoViagemSeg(seg) {
    var m = seg && seg.travelMode;
    if (m === "land" || m === "sea" || m === "mixed" ||
        m === "river") return m;
    var modos = Object.create(null);
    (Array.isArray(seg && seg.transportLegs) ? seg.transportLegs : [])
      .forEach(function (l) {
        if (l && typeof l.mode === "string") modos[l.mode] = true;
      });
    var ks = Object.keys(modos);
    if (ks.length === 1) return ks[0];
    if (ks.length > 1) return "mixed";
    return null;
  }

  function modoLabel(m) {
    return m === "land" ? "terra" : m === "sea" ? "mar" :
      m === "mixed" ? "misto" : m === "embarkation" ? "embarque" :
      m === "river" ? "fluvial" : null;
  }

  /* rotulo de modo do trecho: segmentos mistos expoem as pernas
     declaradas (ex.: "misto (mar + fluvial + terra)") em vez de
     esconder o modo real atras de um "misto" generico */
  function modoLabelSegmento(seg) {
    var m = modoViagemSeg(seg);
    var t = modoLabel(m);
    if (m !== "mixed") return t;
    var vistos = Object.create(null);
    var nomes = [];
    pernasViagem(seg).forEach(function (p) {
      var lb = modoLabel(p.mode);
      if (lb && !vistos[lb]) {
        vistos[lb] = true;
        nomes.push(lb);
      }
    });
    return nomes.length ? "misto (" + nomes.join(" + ") + ")" : t;
  }

  function tooltipSegmento(rt, seg) {
    var s = rt.character || rt.id;
    if (seg.label) s += " — " + seg.label;
    var modo = modoLabelSegmento(seg);
    if (modo) s += " (" + modo + ")";
    return s;
  }

  /* popup curto de trecho: personagem, origem -> destino, modo e
     capitulo — sem evidencia, precisao ou notas tecnicas */
  function buildPopupSegmento(rt, seg) {
    var d = document.createElement("div");
    d.className = "loc-popup loc-popup-trecho";
    var t = document.createElement("strong");
    var trecho = (seg.label || "Trecho aproximado")
      .replace(/\s*->\s*/g, " → ");
    t.textContent = (rt.character || rt.id) + " · " + trecho;
    d.appendChild(t);
    var modo = modoLabelSegmento(seg);
    var cap = "cap. " + seg.startChapter;
    if (seg.endChapter !== seg.startChapter) {
      cap += "–" + seg.endChapter;
    }
    linhaPopup(d, "loc-popup-tipo",
      (modo ? modo + " · " : "") + cap);
    return d;
  }

  /* popup de trecho no nivel do mapa (nao da camada): sobrevive a
     autoPan e a reconstrucao das linhas; fecha quando o trecho deixa
     de estar visivel (desmarcar, markerOnly ou voltar o capitulo) */
  function abrirPopupTrecho(rt, seg, latlng) {
    fecharPopupTrecho();
    state.rotaPopup = L.popup({
      maxWidth: 320,
      maxHeight: Math.max(150,
        Math.min(300, state.map.getSize().y - 100))
    })
      .setLatLng(latlng)
      .setContent(buildPopupSegmento(rt, seg))
      .openOn(state.map);
    state.rotaPopupRef = { rota: rt, seg: seg };
  }

  function fecharPopupTrecho() {
    if (!state.rotaPopup) return;
    try { state.rotaPopup.remove(); } catch (e) {}
    state.rotaPopup = null;
    state.rotaPopupRef = null;
  }

  /* chamado a cada reconstrucao de rotas: o popup so fica aberto se
     o trecho ainda estiver visivel na situacao atual */
  function validarPopupTrecho() {
    var ref = state.rotaPopupRef;
    if (!state.rotaPopup || !ref) return;
    var visivel = !!state.selecionados[ref.rota.id] &&
      puroSegmentosNoCapitulo(
        ref.rota, state.chapter, state.markerOnly, GOTCORE
      ).indexOf(ref.seg) >= 0;
    if (!visivel) fecharPopupTrecho();
  }

  /* resolve coords + rotulo de uma posicao: localidade por locationId
     ou waypoint embutido {x, y, label} */
  function posInfo(pos) {
    if (pos && typeof pos.locationId === "string") {
      var cp = cpById(pos.locationId);
      return cp ? { x: cp.x, y: cp.y, label: cp.label || cp.id, cp: cp }
                : null;
    }
    if (pos && isFinite(pos.x) && isFinite(pos.y)) {
      return { x: pos.x, y: pos.y, label: pos.label || "Parada",
               english: pos.english || "", cp: null };
    }
    return null;
  }

  /* posicoes agrupadas por localidade: UM marcador por local */
  function drawRoutes() {
    var rotas = rotasSelecionadas();
    rotas.forEach(function (rt) {
      var cor = corSegura(rt.color);
      var segs = puroSegmentosNoCapitulo(
        rt, state.chapter, state.markerOnly, GOTCORE
      );
      segs.forEach(function (seg) {
        /* dados sem status sao tratados como aproximados, nunca certos */
        var aprox = !seg.status || seg.status === "approximate";
        /* v7: "conhecida" desenha solido; "deduzida" ganha sobreposicao
           pontilhada amarela alem do traco na cor do personagem */
        var conhecida = seg.rota === "conhecida";
        var deduzida = seg.rota === "deduzida";
        pernasViagem(seg).forEach(function (perna) {
          var latlngs = perna.pontos.map(function (pt) {
            return pointToLatLng(pt[0], pt[1]);
          });
          if (latlngs.length < 2) return;
          /* contorno escuro SEMPRE solido: evita que a arte do mapa
             esconda a linha por baixo */
          var contorno = L.polyline(latlngs, {
            color: "#2b2118",
            weight: 8,
            opacity: 0.9,
            interactive: false
          });
          contorno.addTo(state.map);
          state.routeLayers.push(contorno);
          var line = L.polyline(latlngs, {
            color: cor,
            weight: 4,
            opacity: 0.95,
            dashArray: !conhecida && aprox
              ? (perna.mode === "sea" ? "3 7" : "8 5")
              : null,
            interactive: true
          });
          var tp = document.createElement("div");
          tp.className = "perna-tooltip";
          tp.textContent = tooltipSegmento(rt, seg);
          line.bindTooltip(tp, { sticky: true });
          line.on("click", function (e) {
            abrirPopupTrecho(rt, seg, e.latlng);
          });
          line.on("mouseover", function () { line.bringToFront(); });
          line.addTo(state.map);
          state.routeLayers.push(line);
          if (deduzida) {
            var traco = L.polyline(latlngs, {
              color: "#ffe600",
              weight: 2,
              opacity: 0.9,
              dashArray: "1 7",
              interactive: false
            });
            traco.addTo(state.map);
            state.routeLayers.push(traco);
          }
        });
      });
    });

    var grupos = Object.create(null);
    rotas.forEach(function (rt) {
      var pos = puroPosicaoNoCapitulo(
        rt, state.chapter, state.markerOnly, GOTCORE
      );
      if (pos) {
        var chave = typeof pos.locationId === "string"
          ? pos.locationId
          : "w:" + pos.x + "," + pos.y;
        (grupos[chave] = grupos[chave] || []).push({
          rota: rt,
          pos: pos
        });
      }
    });
    Object.keys(grupos).forEach(function (loc) {
      var grupo = grupos[loc];
      var info = posInfo(grupo[0].pos);
      if (!info) return;
      var soJon = grupo.length === 1 && grupo[0].rota.id === "jon";
      var cls = soJon ? "loc-pin loc-pin-jon" : "loc-pin loc-pin-personagem";
      var html = grupo.length > 1
        ? '<span class="loc-pin-n">' + grupo.length + "</span>"
        : "";
      var mk = L.marker(pointToLatLng(info.x, info.y), {
        icon: pinIcon(cls, html),
        title: grupo.map(function (g) { return g.rota.character; }).join(", ") +
          " — " + info.label,
        alt: "Posição de personagem",
        keyboard: true,
        zIndexOffset: 1000
      });
      mk.bindPopup(buildPopupGrupo(
        grupo, info.cp ||
          { id: "", label: info.label, english: info.english }));
      mk.addTo(state.map);
      state.positionMarkers.push(mk);
    });
    atualizarPosicoesSel(rotas);
    validarPopupTrecho();
  }

  /* uma linha curta por personagem selecionado: "Nome — lugar atual";
     so aparece quando ha posicao conhecida no capitulo */
  function atualizarPosicoesSel(rotas) {
    if (!els.persAtual) return;
    els.persAtual.innerHTML = "";
    rotas.forEach(function (rt) {
      var pos = puroPosicaoNoCapitulo(
        rt, state.chapter, state.markerOnly, GOTCORE
      );
      var info = pos ? posInfo(pos) : null;
      if (!info) return;
      var linha = document.createElement("div");
      linha.className = "pers-atual-item";
      var sw = document.createElement("span");
      sw.className = "pers-cor";
      sw.style.background = corSegura(rt.color);
      linha.appendChild(sw);
      var txt = document.createElement("span");
      txt.textContent = (rt.character || rt.id) + " — " + info.label;
      linha.appendChild(txt);
      els.persAtual.appendChild(linha);
    });
  }

  /* ---------- rotulos opcionais com evitamento de sobreposicao ---------- */

  /* prioridade de rotulo: tipos mais importantes vencem as colisoes —
     cidade > castelo > vilarejo/localidade > ruina > demais */
  var ROTULO_PRIOR = {
    city: 0,
    castle: 1,
    village: 2,
    settlement: 2,
    ruin: 3
  };

  function priorRotulo(p) {
    var r = ROTULO_PRIOR[p && p.kind];
    return r === undefined ? 4 : r;
  }

  function colide(a, b) {
    return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
  }

  function atualizarRotulos() {
    state.featureMarkers.forEach(function (r) { r.m.unbindTooltip(); });
    state.positionMarkers.forEach(function (m) { m.unbindTooltip(); });
    if (!state.labelsVisible) return;
    var bounds = state.map.getBounds();
    var colocados = [];
    var ordem = state.featureMarkers.slice().sort(function (a, b) {
      return priorRotulo(a.p) - priorRotulo(b.p);
    });
    ordem.forEach(function (r) {
      var ll = r.m.getLatLng();
      if (!bounds.contains(ll)) return;
      var pt = state.map.latLngToContainerPoint(ll);
      var rect = {
        x1: pt.x - ROTULO_W / 2,
        y1: pt.y - 14 - ROTULO_H,
        x2: pt.x + ROTULO_W / 2,
        y2: pt.y - 14
      };
      if (colocados.some(function (c) { return colide(c, rect); })) return;
      colocados.push(rect);
      r.m.bindTooltip(tooltipNode(r.p.label || r.p.id, "loc-label-inner"), {
        permanent: true,
        direction: "top",
        offset: [0, -10],
        className: "loc-label"
      });
    });
    state.positionMarkers.forEach(function (m) {
      m.bindTooltip(tooltipNode(m.options.title || "", "loc-label-inner"), {
        permanent: true,
        direction: "top",
        offset: [0, -10],
        className: "loc-label loc-label-jon"
      });
    });
  }

  function refresh() {
    clearLayers();
    if (!state.map || !state.viewReady || !state.dataReady) return;
    if (state.locVisible) drawFeatures();
    drawRoutes();
    atualizarRotulos();
    tentarAbrirFoco();
  }

  /* ---------- lista + busca + regiao ---------- */

  function alvoBusca(p) {
    var alvo = [p.label, p.originalKey, p.english];
    /* aliases opcionais: variantes do portal, rotulos do mapa e nomes
       em ingles ficam pesquisaveis; so strings contam */
    if (Array.isArray(p.aliases)) {
      alvo = alvo.concat(p.aliases.filter(function (a) {
        return typeof a === "string";
      }));
    }
    return alvo.filter(Boolean).join(" ");
  }

  /* a lista so existe enquanto ha texto na busca — sem resultados a
     mostrar com o campo vazio */
  function applyQuery() {
    var itens = els.lista.querySelectorAll("li");
    var q = state.query.trim();
    els.lista.hidden = !q;
    itens.forEach(function (li) {
      var p = li._ponto;
      li.hidden = !q || !GOTCORE.searchMatches(alvoBusca(p), q);
    });
  }

  function zoomBusca() {
    var max = state.map.getMaxZoom();
    if (state.mode === "native") {
      return Math.min(ZOOM_BUSCA_NATIVO, max);
    }
    var m = manifestAtivo();
    var z = Math.log2((0.25 * m.width) / state.naturalW);
    return GOTCORE.clamp(z, -8, max);
  }

  function acharMarcadorLocal(id) {
    for (var i = 0; i < state.featureMarkers.length; i++) {
      if (state.featureMarkers[i].p.id === id) {
        return state.featureMarkers[i].m;
      }
    }
    return null;
  }

  /* remove o popup de foco anterior mesmo que a remocao normal falhe
     (popup de marcador morto/reconstruido) — sem isso ele ficaria orfao
     no painel de popups */
  function fecharPopupAntigo() {
    var antigo = state.focoPopup;
    state.focoPopup = null;
    state.focoPopupId = null;
    if (!antigo) return;
    try {
      if (antigo.isOpen && antigo.isOpen()) antigo.remove();
    } catch (e) {
      try {
        var el = antigo.getElement && antigo.getElement();
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (e2) {}
    }
  }

  /* abre o popup do alvo quando o marcador (re)existir; o popup fica no
     nivel do mapa, ancorado na latlng do ponto — independe do ciclo de
     vida do marcador e sobrevive a reconstrucoes por culling/refresh */
  function tentarAbrirFoco() {
    if (!state.pendingFocus || !state.focusLocalId ||
        !state.dataReady || !state.viewReady || !state.locVisible) {
      return;
    }
    var p = cpById(state.focusLocalId);
    var m = acharMarcadorLocal(state.focusLocalId);
    if (!p || !m) return;
    if (state.focoPopup && state.focoPopup.isOpen &&
        state.focoPopup.isOpen()) {
      if (state.focoPopupId === state.focusLocalId) {
        /* ja aberto para o alvo atual — atualiza a ancora para a latlng
           do marcador atual so se mudou (troca previa->nativo); sem a
           checagem cada refresh reanimaria o popup */
        var llNova = m.getLatLng();
        var llAtual = state.focoPopup.getLatLng &&
          state.focoPopup.getLatLng();
        if (!llAtual || !llAtual.equals(llNova)) {
          try { state.focoPopup.setLatLng(llNova); } catch (e) {}
        }
        return; /* a intencao segue viva */
      }
      fecharPopupAntigo(); /* alvo mudou: fecha o popup do alvo anterior */
    }
    fecharPopupAntigo();
    try { state.map.closePopup(); } catch (e) {}
    /* popup rastreado, no nivel do mapa: substitui qualquer popup aberto
       e nao depende do ciclo de vida do marcador */
    var fp = L.popup()
      .setLatLng(m.getLatLng())
      .setContent(buildPopupPonto(p));
    state.focoPopup = fp; /* rastreado antes do openOn: o listener ve */
    state.focoPopupId = state.focusLocalId;
    try { fp.openOn(state.map); } catch (e) {}
    state.pendingFocus = true; /* vivo enquanto o popup estiver aberto */
    limparPopupsOrfaos();
  }

  /* varre o painel de popups: elementos .leaflet-popup sem camada viva
     correspondente sao restos de remocoes que falharam no meio —
     remove-os para nunca coexistir duplicata orfa */
  function limparPopupsOrfaos() {
    try {
      var vivos = [];
      state.map.eachLayer(function (l) {
        if (l instanceof L.Popup && l.getElement && l.getElement()) {
          vivos.push(l.getElement());
        }
      });
      var pane = state.map.getPane("popupPane");
      if (!pane) return;
      Array.prototype.forEach.call(
        pane.querySelectorAll(".leaflet-popup"),
        function (el) {
          if (vivos.indexOf(el) < 0 && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
    } catch (e) {}
  }

  /* foco do hash/armazenamento: difere ate dados + vista prontos e e
     consumido uma unica vez — nada de timer cego */
  function tentarFocoPendente() {
    if (!state.pendingHashFocusId || !state.dataReady || !state.viewReady) {
      return;
    }
    var p = cpById(state.pendingHashFocusId);
    state.pendingHashFocusId = null;
    if (p) focusPonto(p);
  }

  /* clique num item (mesmo de marcador oculto): revela camada, foca e
     abre — nunca altera o capitulo */
  function focusPonto(p) {
    if (!p || !state.viewReady || !state.dataReady) return;
    state.focusLocalId = p.id;
    state.pendingFocus = true;
    var mudou = false;
    if (!state.locVisible) {
      state.locVisible = true;
      els.locMostrar.checked = true;
      mudou = true;
    }
    if (mudou) applyQuery();
    refresh(); /* garante o marcador se ja estiver no quadro */
    state.map.flyTo(pointToLatLng(p.x, p.y), zoomBusca());
    salvarEstado(); /* persiste foco + mudancas de camada/filtro */
    tentarAbrirFoco(); /* mesma vista: abre ja, sem esperar moveend */
  }

  function focarPersonagens() {
    var lats = [];
    rotasSelecionadas().forEach(function (rt) {
      var pos = puroPosicaoNoCapitulo(
        rt, state.chapter, state.markerOnly, GOTCORE
      );
      if (pos) {
        var info = posInfo(pos);
        if (info) lats.push(pointToLatLng(info.x, info.y));
      }
    });
    if (!lats.length) return;
    if (lats.length === 1) {
      state.map.flyTo(lats[0], zoomBusca());
    } else {
      state.map.flyToBounds(L.latLngBounds(lats), { padding: [24, 24] });
    }
  }

  /* ---------- UI: listas e controles ---------- */

  function buildLista() {
    els.lista.innerHTML = "";
    state.data.controlPoints.forEach(function (p) {
      var li = document.createElement("li");
      var simb = ehSimboloNaoIdentificado(p);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "loc-item" +
        (simb ? " loc-item-simbolo" : p.kind ? " loc-item-" + p.kind : "");
      var nome = document.createElement("span");
      nome.className = "loc-item-nome";
      nome.textContent = p.label || p.id;
      var orig = document.createElement("span");
      orig.className = "loc-item-orig";
      orig.textContent = p.english || p.originalKey || "";
      b.appendChild(nome);
      if (orig.textContent) b.appendChild(orig);
      b.addEventListener("click", function () { focusPonto(p); });
      li.appendChild(b);
      li._ponto = p;
      els.lista.appendChild(li);
    });
    applyQuery();
  }

  function atualizarSel() {
    var n = idsSelecionadas().length;
    els.limparSel.disabled = n === 0;
    atualizarFocusBtn();
    atualizarNavegacao();
  }

  function atualizarFocusBtn() {
    var rotas = rotasSelecionadas();
    var temPos = rotas.some(function (rt) {
      return !!puroPosicaoNoCapitulo(rt, state.chapter, state.markerOnly, GOTCORE);
    });
    els.focusPers.disabled = !temPos;
    if (els.livroCompleto) els.livroCompleto.disabled = !rotas.length;
  }

  /* consentimento explicito de spoiler: revela o livro SELECIONADO
     ate o fim (sem trocar a selecao); trechos de livros anteriores
     continuam cumulativos, os futuros nao */
  function livroCompleto() {
    if (!rotasSelecionadas().length) return;
    setChapter(limitesCapitulo().fim);
  }

  /* lista de personagens: checkbox + amostra da cor + nome — rotas
     renderizam sozinhas ao marcar ou ao mudar o capitulo */
  function buildPersonagens() {
    els.listaPers.innerHTML = "";
    (state.data.routes || []).slice().sort(function (a, b) {
      return (a.character || a.id)
        .localeCompare(b.character || b.id, "pt-BR");
    }).forEach(function (rt) {
      var cor = corSegura(rt.color);
      var label = document.createElement("label");
      label.className = "pers-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "chk-" + rt.id;
      cb.checked = !!state.selecionados[rt.id];
      var sw = document.createElement("span");
      sw.className = "pers-cor";
      sw.style.background = cor;
      var nm = document.createElement("span");
      nm.className = "pers-nome";
      nm.textContent = rt.character || rt.id;
      cb.addEventListener("change", function () {
        if (cb.checked) state.selecionados[rt.id] = true;
        else delete state.selecionados[rt.id];
        atualizarSel();
        refresh();
        salvarEstado();
      });
      label.appendChild(cb);
      label.appendChild(sw);
      label.appendChild(nm);
      els.listaPers.appendChild(label);
    });
    atualizarSel();
  }

  /* ---------- resumos curtos + chaves de wiki (sidecar) ----------
     Arquivo local opcional por ponto de controle; ausencia do arquivo
     ou de uma entrada apenas omite resumo/link no card — nunca falha. */

  function carregarResumos() {
    fetchJson(RESUMOS_URL).then(function (r) {
      if (r && typeof r === "object" && !Array.isArray(r)) {
        state.resumos = r;
      }
    }).catch(function () {
      /* sidecar ausente/ilegivel: cards seguem sem resumo/link */
    });
  }

  /* ---------- capitulo ---------- */

  function ultimoCapitulo() {
    var caps = (state.data && state.data.chapters) || [];
    var max = 0;
    caps.forEach(function (c) {
      if (typeof c.index === "number" && c.index > max) max = c.index;
    });
    return max;
  }

  function codigoLivroDoCapitulo(c) {
    var ls = livros();
    for (var i = 0; i < ls.length; i++) {
      if (ls[i].id === c.bookId) return ls[i].code || ls[i].id;
    }
    return c.bookId || "";
  }

  function tituloCapitulo(i) {
    var caps = (state.data && state.data.chapters) || [];
    for (var k = 0; k < caps.length; k++) {
      var c = caps[k];
      if (c.index !== i) continue;
      /* "Livro-N: Título" -> "Cap. localIndex+1 · Título"; sem titulo
         curto reconhecivel, cai no numero global */
      var t = typeof c.title === "string" ? c.title : "";
      var dois = t.indexOf(":");
      var curto = dois >= 0 ? t.slice(dois + 1).trim() : t.trim();
      /* modo "todos": numero global + sigla do livro */
      if (state.livroSel === "todos") {
        var cod = codigoLivroDoCapitulo(c);
        return "Cap. " + (i + 1) + " · " + (curto || ("Capítulo " + i)) +
               (cod ? " (" + cod + ")" : "");
      }
      if (typeof c.localIndex === "number" && curto) {
        return "Cap. " + (c.localIndex + 1) + " · " + curto;
      }
      return curto || ("Capítulo " + i);
    }
    return "Capítulo " + i;
  }

  /* ---------- livro (conjunto de capitulos) ---------- */

  function livros() {
    return (state.data && state.data.books) || [];
  }

  /* o livro ativo deriva do capitulo global corrente: os limites sao
     contiguos sem sobreposicao, entao um capitulo pertence a um so
     livro — nada a persistir alem do proprio capitulo */
  function livroAtivo() {
    var ls = livros();
    for (var i = 0; i < ls.length; i++) {
      if (state.chapter >= ls[i].startChapter &&
          state.chapter <= ls[i].endChapter) {
        return ls[i];
      }
    }
    return ls.length ? ls[0] : null;
  }

  /* livro explicitamente escolhido no seletor (null se "todos" ou
     se nunca houve escolha) */
  function livroEscolhido() {
    if (!state.livroSel || state.livroSel === "todos") return null;
    var ls = livros();
    for (var i = 0; i < ls.length; i++) {
      if (ls[i].id === state.livroSel) return ls[i];
    }
    return null;
  }

  function livroSelectValor() {
    if (state.livroSel === "todos") return "todos";
    var lv = livroEscolhido() || livroAtivo();
    return lv ? lv.id : "";
  }

  /* limites navegaveis: "todos" varre o conjunto inteiro; um livro
     escolhido restringe ao seu intervalo; sem escolha, o livro do
     capitulo corrente (comportamento legado) */
  function limitesCapitulo() {
    if (state.livroSel === "todos") {
      return { ini: CAP_MIN, fim: ultimoCapitulo() };
    }
    var lv = livroEscolhido() || livroAtivo();
    if (lv) return { ini: lv.startChapter, fim: lv.endChapter };
    return { ini: CAP_MIN, fim: ultimoCapitulo() };
  }

  function atualizarNavegacao() {
    if (!els.ant || !els.prox) return;
    var lim = limitesCapitulo();
    els.ant.disabled = !state.dataReady || state.chapter <= lim.ini;
    els.prox.disabled = !state.dataReady || state.chapter >= lim.fim;
  }

  /* seletor de livro: visivel so quando o conjunto declara books[];
     primeira opcao "Todos os livros" varre os capitulos globais */
  function buildLivroSelect() {
    if (!els.livroSelect) return;
    var ls = livros();
    els.livroSelect.innerHTML = "";
    var tem = ls.length > 0;
    els.livroSelect.hidden = !tem;
    if (!tem) return;
    var todos = document.createElement("option");
    todos.value = "todos";
    todos.textContent = "Todos os livros";
    els.livroSelect.appendChild(todos);
    ls.forEach(function (lv) {
      var o = document.createElement("option");
      o.value = lv.id;
      o.textContent = lv.title || lv.id;
      els.livroSelect.appendChild(o);
    });
    els.livroSelect.value = livroSelectValor();
  }

  /* reaplica os limites do livro ativo ao slider/dropdown e fixa o
     capitulo corrente (que por construcao ja esta dentro dele:
     quem troca de livro ajusta o capitulo antes, via definirLivro) */
  function aplicarLivro(silencioso) {
    var lim = limitesCapitulo();
    els.slider.min = String(lim.ini);
    els.slider.max = String(lim.fim);
    els.slider.setAttribute("aria-valuemin", String(lim.ini));
    els.slider.setAttribute("aria-valuemax", String(lim.fim));
    setChapter(state.chapter, silencioso);
    if (els.livroSelect) {
      els.livroSelect.value = livroSelectValor();
    }
  }

  /* ---------- regiao (navegacao por conjunto de pontos) ---------- */

  function regioes() {
    return (state.data && state.data.regions) || [];
  }

  function subregioes() {
    return (state.data && state.data.subregions) || [];
  }

  /* agrupa por `group` declarado; sem group cai em "Outros".
     cada regiao e seguida das suas sub-regioes recuadas
     (valor "sub:<id>" para nao colidir com ids de regiao) */
  function buildRegiaoSelect() {
    if (!els.regiaoSelect) return;
    var regs = regioes();
    els.regiaoSelect.innerHTML = "";
    els.regiaoSelect.hidden = !regs.length;
    if (!regs.length) return;
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Ir para região…";
    ph.disabled = true;
    ph.selected = true;
    els.regiaoSelect.appendChild(ph);
    var subsPorRegiao = {};
    subregioes().forEach(function (s) {
      (subsPorRegiao[s.parent] = subsPorRegiao[s.parent] || [])
        .push(s);
    });
    var grupos = { Westeros: [], Essos: [], Outros: [] };
    regs.forEach(function (r) {
      var g = r.group === "Westeros" || r.group === "Essos"
        ? r.group : "Outros";
      grupos[g].push(r);
    });
    ["Westeros", "Essos", "Outros"].forEach(function (g) {
      if (!grupos[g].length) return;
      var og = document.createElement("optgroup");
      og.label = g;
      grupos[g].forEach(function (r) {
        var o = document.createElement("option");
        o.value = r.id;
        o.textContent = r.label || r.id;
        og.appendChild(o);
        (subsPorRegiao[r.id] || []).forEach(function (s) {
          var os = document.createElement("option");
          os.value = "sub:" + s.id;
          os.textContent = "  · " + (s.label || s.id);
          og.appendChild(os);
        });
      });
      els.regiaoSelect.appendChild(og);
    });
  }

  /* enquadra a caixa dos pontos da regiao; em desktop o painel lateral
     flutuante cobre a esquerda, entao o padding empurra o enquadramento */
  function irParaRegiao(id) {
    var lats = [];
    if (id.indexOf("sub:") === 0) {
      var sid = id.slice(4), sub = null;
      subregioes().forEach(function (s) { if (s.id === sid) sub = s; });
      if (!sub || !sub.center || !sub.span) return;
      lats.push(pointToLatLng(sub.center[0] - sub.span[0],
                              sub.center[1] - sub.span[1]));
      lats.push(pointToLatLng(sub.center[0] + sub.span[0],
                              sub.center[1] + sub.span[1]));
    } else {
      var reg = null;
      regioes().forEach(function (r) { if (r.id === id) reg = r; });
      if (!reg || !Array.isArray(reg.pointIds)) return;
      reg.pointIds.forEach(function (pid) {
        var p = cpById(pid);
        if (p) lats.push(pointToLatLng(p.x, p.y));
      });
    }
    if (!lats.length) return;
    if (lats.length === 1) {
      /* regiao de um ponto so (Ilhas de Ferro, Ulthos): bounds
         degenerado; centra num zoom em que o entorno fica visivel */
      state.map.setView(lats[0], Math.max(state.map.getZoom(), 3));
      return;
    }
    var pad = { topLeft: [40, 40], bottomRight: [40, 40] };
    if (els.lateral &&
        !els.lateral.classList.contains("lateral-fechada") &&
        window.innerWidth > 700) {
      pad.topLeft = [els.lateral.offsetWidth + 40, 40];
    }
    state.map.flyToBounds(L.latLngBounds(lats), {
      paddingTopLeft: pad.topLeft,
      paddingBottomRight: pad.bottomRight
    });
  }

  /* troca de livro: um capitulo fora do escolhido salta apenas para
     o INICIO dele — nunca para o fim automaticamente */
  function definirLivro(id) {
    if (id === "todos") {
      state.livroSel = "todos";
      aplicarLivro(false);
      salvarEstado();
      return;
    }
    var ls = livros();
    var alvo = null;
    for (var i = 0; i < ls.length; i++) {
      if (ls[i].id === id) { alvo = ls[i]; break; }
    }
    if (!alvo) {
      /* id desconhecido: ressincroniza o select com o livro real */
      els.livroSelect.value = livroSelectValor();
      return;
    }
    state.livroSel = alvo.id;
    if (state.chapter < alvo.startChapter ||
        state.chapter > alvo.endChapter) {
      state.chapter = alvo.startChapter;
    }
    aplicarLivro(false);
    salvarEstado();
  }

  function setChapter(i, silencioso) {
    var lim = limitesCapitulo();
    i = GOTCORE.clamp(i, lim.ini, lim.fim);
    state.chapter = i;
    els.slider.value = String(i);
    var titulo = tituloCapitulo(i);
    els.capTitulo.textContent = titulo;
    els.slider.setAttribute("aria-valuetext", titulo);
    atualizarNavegacao();
    refresh();
    atualizarFocusBtn();
    if (!silencioso) salvarEstado();
  }

  /* ---------- estado persistido + fragmento ---------- */

  function storageKey() {
    return STORAGE_PREFIX + (state.datasetId || DATASET_FALLBACK_ID);
  }

  function salvarEstado() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        cap: state.chapter,
        personagens: idsSelecionadas(),
        rotulos: state.labelsVisible ? 1 : 0,
        livro: state.livroSel,
        busca: state.query,
        local: state.focusLocalId,
        locais: state.locVisible ? 1 : 0
      }));
    } catch (e) { /* armazenamento indisponivel */ }
  }

  function lerHash() {
    var frag = location.hash || "";
    if (frag.charAt(0) === "#") frag = frag.slice(1);
    if (!frag) return null;
    var p = {};
    var tem = false;
    frag.split("&").forEach(function (par) {
      var kv = par.split("=");
      if (kv.length !== 2) return;
      var k = kv[0];
      var v;
      try { v = decodeURIComponent(kv[1]); } catch (e) { return; }
      /* cap so aceita inteiro puro: '19x'/'18.5' sao ignorados */
      if (k === "cap") {
        if (/^\d+$/.test(v)) { p.cap = parseInt(v, 10); tem = true; }
      }
      else if (k === "personagens") {
        p.personagens = v.split(",").filter(Boolean); tem = true;
      }
      else if (k === "local") { p.local = v; tem = true; }
      else if (k === "rotulos") { p.rotulos = v === "1" ? 1 : 0; tem = true; }
      else if (k === "busca") { p.busca = v.slice(0, 80); tem = true; }
      else if (k === "locais") { p.locais = v === "1" ? 1 : 0; tem = true; }
    });
    return tem ? p : null;
  }

  function lerEstado() {
    var h = lerHash();
    if (h) return h;
    try {
      var s = JSON.parse(localStorage.getItem(storageKey()));
      if (s && typeof s === "object") return s;
    } catch (e) { /* ignora valor invalido */ }
    return null;
  }

  function aplicarEstado(s) {
    if (!s || typeof s !== "object") return null;
    var local = null;
    /* capitulo precisa ser inteiro finito; fracionarios sao ignorados */
    if (typeof s.cap === "number" && isFinite(s.cap) &&
        Math.floor(s.cap) === s.cap) {
      state.chapter = GOTCORE.clamp(s.cap, CAP_MIN, ultimoCapitulo());
    }
    if (Array.isArray(s.personagens)) {
      s.personagens.forEach(function (id) {
        if (typeof id === "string" && rotaById(id)) {
          state.selecionados[id] = true;
        }
      });
    }
    if (s.rotulos === 1 || s.rotulos === 0) {
      state.labelsVisible = s.rotulos === 1;
    }
    if (s.livro === "todos") {
      state.livroSel = "todos";
    } else if (typeof s.livro === "string") {
      var lvs = livros();
      for (var li = 0; li < lvs.length; li++) {
        if (lvs[li].id === s.livro) { state.livroSel = s.livro; break; }
      }
    }
    if (s.locais === 1 || s.locais === 0) {
      state.locVisible = s.locais === 1;
    }
    if (typeof s.busca === "string") state.query = s.busca.slice(0, 80);
    if (typeof s.local === "string" && cpById(s.local)) {
      local = s.local;
      state.focusLocalId = s.local;
    }
    return local;
  }

  function syncControles() {
    els.locMostrar.checked = state.locVisible;
    els.locRotulos.checked = state.labelsVisible;
    els.busca.value = state.query;
    els.slider.value = String(state.chapter);
    if (els.livroSelect) {
      els.livroSelect.value = livroSelectValor();
    }
    els.capTitulo.textContent = tituloCapitulo(state.chapter);
    (state.data.routes || []).forEach(function (rt) {
      var cb = qs("chk-" + rt.id);
      if (cb) cb.checked = !!state.selecionados[rt.id];
    });
    atualizarSel();
    applyQuery();
  }

  /* ---------- invalidacao / travamento ---------- */

  var CONTROLES_DADOS = [
    "locMostrar", "locRotulos", "busca",
    "focusPers", "limparSel", "slider", "ant",
    "prox", "livroSelect", "livroCompleto"
  ];

  /* trava os controles que dependem de dados; o mapa base segue livre */
  function lockDown() {
    CONTROLES_DADOS.forEach(function (k) {
      if (els[k]) els[k].disabled = true;
    });
    refresh();
  }

  function destravar() {
    CONTROLES_DADOS.forEach(function (k) {
      if (els[k]) els[k].disabled = false;
    });
  }

  function invalidar(motivo) {
    state.dataReady = false;
    state.data = null;
    state.dataRaw = null;
    state.focusLocalId = null;
    state.pendingFocus = false;
    state.pendingHashFocusId = null;
    fecharPopupAntigo();
    fecharPopupTrecho();
    clearLayers();
    els.lista.innerHTML = "";
    els.lista.hidden = true;
    els.listaPers.innerHTML = "";
    if (els.persAtual) els.persAtual.innerHTML = "";
    if (els.livroSelect) {
      els.livroSelect.innerHTML = "";
      els.livroSelect.hidden = true;
    }
    els.capTitulo.textContent = "";
    lockDown();
    setStatus("Localidades e trajetos indisponíveis: " + motivo +
      ". O mapa continua navegável.");
  }

  /* ---------- boot ---------- */

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) {
        var err = new Error(url + " HTTP " + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  }

  /* fallback so quando o arquivo nao existe (404): dados malformados,
     erro 5xx ou falha de rede NAO fazem downgrade silencioso */
  function soSe404(promise, proximo) {
    return promise.catch(function (err) {
      if (err && err.status === 404) return proximo();
      throw err;
    });
  }

  function init(opts) {
    state.map = opts.map;
    [
      ["status", "localidades-status"],
      ["lista", "loc-lista"], ["busca", "loc-busca"],
      ["locMostrar", "loc-mostrar"], ["locRotulos", "loc-rotulos"],
      ["listaPers", "lista-personagens"], ["persAtual", "pers-atual"],
      ["limparSel", "btn-limpar-sel"], ["focusPers", "btn-focus-pers"],
      ["slider", "cap-slider"],
      ["livroSelect", "livro-select"],
      ["ant", "cap-ant"], ["prox", "cap-prox"],
      ["capTitulo", "cap-titulo"],
      ["livroCompleto", "btn-livro-completo"],
      ["regiaoSelect", "regiao-select"],
      ["lateral", "lateral"]
    ].forEach(function (par) { els[par[0]] = qs(par[1]); });

    els.locMostrar.addEventListener("change", function () {
      state.locVisible = els.locMostrar.checked;
      refresh();
      salvarEstado();
    });
    els.locRotulos.addEventListener("change", function () {
      state.labelsVisible = els.locRotulos.checked;
      atualizarRotulos();
      salvarEstado();
    });
    els.busca.addEventListener("input", function () {
      state.query = els.busca.value;
      applyQuery();
      salvarEstado();
    });
    els.focusPers.addEventListener("click", focarPersonagens);
    els.limparSel.addEventListener("click", function () {
      state.selecionados = {};
      syncControles();
      refresh();
      salvarEstado();
    });
    els.slider.addEventListener("input", function () {
      setChapter(Number(els.slider.value));
    });
    if (els.livroSelect) {
      els.livroSelect.addEventListener("change", function () {
        definirLivro(els.livroSelect.value);
      });
    }
    if (els.regiaoSelect) {
      els.regiaoSelect.addEventListener("change", function () {
        irParaRegiao(els.regiaoSelect.value);
        els.regiaoSelect.value = "";
      });
    }
    els.ant.addEventListener("click", function () {
      setChapter(state.chapter - 1);
    });
    els.prox.addEventListener("click", function () {
      setChapter(state.chapter + 1);
    });
    els.livroCompleto.addEventListener("click", livroCompleto);
    state.map.on("zoomend moveend", function () {
      if (!state.dataReady || !state.viewReady) return;
      refresh();
    });
    state.map.on("popupclose", function () {
      /* fechamento pelo usuario consome a intencao; o fechamento causado
         pela remocao/reconstrucao das camadas nao (_clearing) */
      if (!state._clearing) state.pendingFocus = false;
    });
    state.map.on("popupopen", function (e) {
      if (e.popup === state.focoPopup) return;
      /* um popup diferente substitui o de foco: remove o rastreado
         anterior mesmo que a remocao falhe (evita orfaos no DOM) */
      fecharPopupAntigo();
      var src = e.popup && e.popup._source;
      var p = src && src._ponto;
      if (p) {
        /* popup de localidade aberto no pino vira a intencao de foco e
           sobrevive a reconstrucoes de camada (culling/refresh) */
        state.focusLocalId = p.id;
        state.focoPopup = e.popup;
        state.focoPopupId = p.id;
        state.pendingFocus = true;
        salvarEstado();
      } else {
        state.pendingFocus = false;
      }
    });

    /* controles de dados nascem travados ate a carga validar; os do
       mapa base (tiles, enquadrar, tela cheia) seguem livres */
    lockDown();

    setStatus("Carregando dados do piloto…");
    /* manifesto uma vez; dados em cascata: v6 -> v5 -> v4 -> v3 -> v2
    /* manifesto uma vez; dados em cascata: v7 -> v6 -> v5 -> v4 -> v3 -> v2
       um conjunto mais novo PRESENTE mas invalido falha fechado, sem
       downgrade */
    fetchJson(MANIFEST_URL).then(function (m) {
      return soSe404(fetchJson(DATA_URL_V7), function () {
        return soSe404(fetchJson(DATA_URL_V6), function () {
          return soSe404(fetchJson(DATA_URL_V5), function () {
            return soSe404(fetchJson(DATA_URL_V4), function () {
              return soSe404(fetchJson(DATA_URL), function () {
                return soSe404(
                  fetchJson(DATA_FALLBACK_V2_URL), function () {
                    return fetchJson(DATA_FALLBACK_URL);
                  });
              });
            });
          });
        });
      }).then(function (d) { return [m, d]; });
    })
      .then(function (res) {
        state.manifestFetch = res[0];
        var motivo = puroValidarDados(res[1], manifestAtivo());
        if (motivo) {
          invalidar(motivo);
          return;
        }
        var data = adaptarData(res[1]);
        state.dataRaw = res[1];
        state.data = data;
        state.datasetId = data.datasetId || DATASET_FALLBACK_ID;
        state.dataReady = true;
        buildLivroSelect();
        buildLista();
        buildPersonagens();
        buildRegiaoSelect();
        /* fragmento tem prioridade sobre armazenamento; nunca ativa tiles */
        var focoLocal = aplicarEstado(lerEstado());
        /* o livro ativo deriva do capitulo global restaurado: primeiro
           os limites do livro, depois o capitulo dentro deles */
        aplicarLivro(true);
        syncControles();
        setChapter(state.chapter, true);
        destravar();
        /* destravar liga tudo; atualizarSel re-desabilita os botoes que
           dependem de selecao/posicao atual */
        atualizarSel();
        refresh();
        carregarResumos();
        setStatus("");
        if (focoLocal) {
          /* sem timer cego: executa quando dados + vista estiverem ok */
          state.pendingHashFocusId = focoLocal;
          tentarFocoPendente();
        }
      })
      .catch(function (err) {
        /* qualquer falha de boot/render invalida de forma consistente,
           mesmo que parte dos dados ja tenha sido aplicada */
        invalidar(err && err.message ? err.message : "erro");
      });
  }

  /* atlas.js informa o modo ativo e as dimensoes da camada base */
  function setView(v) {
    if (!v || !v.mode) return;
    /* preview/native usam sistemas de coordenadas diferentes: o popup
       de trecho ancorado no latlng antigo nao faria sentido no novo
       modo — fecha antes de trocar (abre de novo ao clicar na linha) */
    if (state.mode !== v.mode) fecharPopupTrecho();
    state.mode = v.mode;
    if (v.mode === "preview") {
      state.naturalW = v.naturalW;
      state.naturalH = v.naturalH;
      state.viewReady = true;
    } else if (v.mode === "native") {
      state.manifestNative = v.manifest || state.manifestNative;
      state.viewReady = true;
      if (state.dataReady) {
        var motivo = puroValidarDados(state.dataRaw, manifestAtivo());
        if (motivo) {
          invalidar(motivo);
          return;
        }
      }
    }
    refresh();
    tentarFocoPendente();
  }

  return {
    init: init,
    setView: setView,
    refresh: refresh,
    pure: {
      validarDados: puroValidarDados,
      adaptarData: adaptarData,
      pontoPreview: puroPontoPreview,
      posicaoNoCapitulo: puroPosicaoNoCapitulo,
      segmentosNoCapitulo: puroSegmentosNoCapitulo
    }
  };
})();
