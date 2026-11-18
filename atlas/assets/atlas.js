/* Atlas piloto local — visor Leaflet CRS.Simple.
   Sem manifesto, exibe a previa reduzida upright como imageOverlay.
   data/mapa.json validado ativa a camada de tiles nativos. */
(function () {
  "use strict";

  var OVERVIEW_URL = "assets/o-mundo-conhecido-recorte-v2-preview.webp";
  var MANIFEST_URL = "data/mapa.json";

  var mapEl = document.getElementById("mapa");
  var statusEl = document.getElementById("mapa-status");
  var erroEl = document.getElementById("mapa-erro");
  var avisoTextoEl = document.getElementById("aviso-texto");
  var badgeEstadoEl = document.getElementById("badge-estado");
  var lateralEl = document.getElementById("lateral");
  var lateralCorpo = document.getElementById("lateral-corpo");
  var btnPainel = document.getElementById("btn-painel");

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  var map = L.map("mapa", {
    crs: L.CRS.Simple,
    minZoom: -8,
    maxZoom: 4,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    zoomControl: true,
    attributionControl: false
  });

  var homeBounds = null;
  var tilesLayer = null;
  var overlayLayer = null;
  var nativeBounds = null;
  var previewFailed = false;
  var anyTileLoaded = false;
  var hadTileError = false;
  var nativeFailed = false;

  /* o painel flutuante nao pode arrastar/dar zoom no mapa por baixo */
  if (lateralEl) {
    L.DomEvent.disableClickPropagation(lateralEl);
    L.DomEvent.disableScrollPropagation(lateralEl);
  }

  /* abre/recolhe o painel flutuante; no mobile inicia recolhido */
  function definirPainel(aberto) {
    lateralCorpo.hidden = !aberto;
    lateralEl.classList.toggle("lateral-fechada", !aberto);
    btnPainel.setAttribute("aria-expanded", aberto ? "true" : "false");
    btnPainel.textContent = aberto ? "Recolher" : "Expandir";
    /* nao recentraliza: apenas avisa o Leaflet do novo espaco util */
    map.invalidateSize({ pan: false });
  }
  btnPainel.addEventListener("click", function () {
    definirPainel(lateralCorpo.hidden);
  });
  if (window.matchMedia &&
      window.matchMedia("(max-width: 600px)").matches) {
    definirPainel(false);
  }

  if (window.GOTATLAS) {
    window.GOTATLAS.init({ map: map });
  }
  /* gancho de depuracao/teste */
  window.__atlasMap = map;

  /* ---------- previa reduzida (apoio e reserva) ---------- */

  setStatus("Carregando mapa\u2026");

  /* a previa fica no tilePane com zIndex 0 inline: abaixo da camada
     de tiles (container zIndex 1) quando o nativo ativar por cima.
     setZIndex(0) e chamado a parte porque o Leaflet nao aplica
     zIndex 0 (falso) so pela opcao na criacao */
  function apoioPrevia(bounds) {
    var l = L.imageOverlay(probe.src, bounds,
      { pane: "tilePane", zIndex: 0 }).addTo(map);
    /* se o mapa ainda nao esta 'loaded', addTo apenas enfileira a
       camada: setZIndex corre sem _image e _initImage pula zIndex
       falsy=0 — garante o z inline tambem quando o layer montar */
    l.on("add", function () {
      if (l._image) { l._image.style.zIndex = "0"; }
    });
    l.setZIndex(0);
    return l;
  }

  var probe = new Image();
  probe.onload = function () {
    var w = probe.naturalWidth;
    var h = probe.naturalHeight;
    /* previa tardia: o nativo ja decidiu a vista; a imagem entra so
       como apoio sob os tiles, sem tocar centro/zoom/estado */
    if (tilesLayer) {
      if (!overlayLayer && nativeBounds) {
        overlayLayer = apoioPrevia(nativeBounds);
      }
      return;
    }
    var bounds = L.latLngBounds([[0, 0], [h, w]]);

    overlayLayer = apoioPrevia(bounds);
    map.setMaxBounds(bounds);
    /* cobertura (inside=true): a imagem preenche o quadro; o usuario
       afasta/arrasta para ver a imagem inteira */
    map.setView(bounds.getCenter(),
      map.getBoundsZoom(bounds, true), { animate: false });
    homeBounds = bounds;
    /* um manifesto ja falho nao tem seu aviso apagado pela previa */
    if (!nativeFailed) {
      setStatus("");
    }
    if (window.GOTATLAS) {
      window.GOTATLAS.setView({
        mode: "preview",
        naturalW: w,
        naturalH: h
      });
    }
  };
  probe.onerror = function () {
    previewFailed = true;
    /* fatal so quando o nativo TAMBEM falhou de forma terminal;
       manifesto em voo ou tiles carregando ainda podem salvar */
    if (nativeFailed && !anyTileLoaded) {
      setStatus("");
      erroEl.hidden = false;
    }
  };
  probe.src = OVERVIEW_URL;

  /* ---------- tiles nativos (manifesto validado, carga automatica) ---------- */

  /* valida o essencial do manifesto ANTES de tocar mapa/coords */
  function manifestoValido(m) {
    return !!m && m.nativePixelsValidated === true &&
      Number.isFinite(m.width) && m.width > 0 &&
      Number.isFinite(m.height) && m.height > 0 &&
      Number.isFinite(m.tileSize) && m.tileSize > 0 &&
      typeof m.tileUrl === "string" && m.tileUrl.length > 0 &&
      Number.isFinite(m.minZoom) &&
      Number.isFinite(m.maxNativeZoom) &&
      Number.isFinite(m.maxZoom) &&
      m.minZoom <= m.maxNativeZoom && m.maxNativeZoom <= m.maxZoom;
  }

  /* manifesto ausente/invalido ou fetch falho: o nativo esta
     terminalmente indisponivel — fatal so se a previa tambem falhou */
  function nativoIndisponivel() {
    nativeFailed = true;
    if (previewFailed) {
      erroEl.hidden = false;
      setStatus("");
    } else {
      setStatus("Tiles nativos indispon\u00edveis; mantida a " +
        "pr\u00e9via reduzida.");
    }
  }

  /* selo visual so depois do primeiro pixel nativo confirmado:
     com zero tiles carregados, a interface nao anuncia "nativo" */
  function seloNativo() {
    badgeEstadoEl.textContent = "Resolu\u00e7\u00e3o nativa";
    avisoTextoEl.textContent = "Tiles locais em resolu\u00e7\u00e3o nativa. " +
      "Marca\u00e7\u00f5es e trajetos em revis\u00e3o.";
    mapEl.setAttribute("aria-label",
      "Mapa O Mundo Conhecido, resolu\u00e7\u00e3o nativa");
  }

  function ativarNativo(m) {
    var bounds = L.latLngBounds(
      map.unproject([0, 0], m.maxNativeZoom),
      map.unproject([m.width, m.height], m.maxNativeZoom)
    );
    nativeBounds = bounds;
    /* preserva centro relativo a imagem e escala efetiva de pixels,
       em vez de reenquadrar o mapa inteiro */
    var centroAlvo = null;
    var zoomAlvo = null;
    if (overlayLayer && probe.naturalWidth && probe.naturalHeight) {
      var c0 = map.getCenter();
      var xImg = c0.lng * m.width / probe.naturalWidth;
      var yImg = (1 - c0.lat / probe.naturalHeight) * m.height;
      centroAlvo = map.unproject([xImg, yImg], m.maxNativeZoom);
      zoomAlvo = map.getZoom() +
        Math.log2(probe.naturalWidth * Math.pow(2, m.maxNativeZoom) / m.width);
    }
    /* cache-buster por revisao do tileset: troca de tiles exige URL
       nova para navegadores/CDN nao servirem tiles velhos */
    var rev = m.tileRevision || m.tileSetId ||
      (m.sourceSha256 ? String(m.sourceSha256).slice(0, 12) : "");
    var versao = rev ? "?v=" + encodeURIComponent(rev) : "";
    /* A troca de sistema de coordenadas (latlng da previa -> nativo)
       precisa suspender o clamp de maxBounds e todo zoom animado:
       - qualquer 'moveend' intermediario dispara _panInsideMaxBounds,
         que avalia estado invalido (zoom 0, centro da previa) e cria
         panTos animados que roubam o centro ATE depois do setView;
       - setMinZoom dispara setZoom animado, que agenda
         _onZoomTransitionEnd por setTimeout — ~250ms depois ele
         reescreve _zoom/_animateToZoom capturados (0), revertendo a
         vista final. map.stop() nao cancela esse timeout.
       Por isso: listener desligado, maxBounds null, animacoes mortas
       e _animatingZoom zerado ANTES; min/max aplicados DIRETO nas
       options (sem o setZoom colateral); restauracao sincrona so
       depois da vista final posicionada */
    map.off("moveend", map._panInsideMaxBounds);
    map.options.maxBounds = null;
    if (map.stop) map.stop();
    map._animatingZoom = false;
    /* min/max zoom do manifesto ANTES do setView, para permitir
       alcancar o zoom nativo */
    map.options.minZoom = m.minZoom;
    map.options.maxZoom = m.maxZoom;
    /* mobile (tela pequena ou ponteiro tosco): keepBuffer minimo e
       updateWhenIdle — memoria e CPU escassos; desktop inalterado */
    var ehMovel = window.matchMedia &&
      (window.matchMedia("(max-width: 600px)").matches ||
       window.matchMedia("(pointer: coarse)").matches);
    tilesLayer = L.tileLayer(m.tileUrl + versao, {
      tileSize: m.tileSize,
      minZoom: m.minZoom,
      maxNativeZoom: m.maxNativeZoom,
      maxZoom: m.maxZoom,
      updateWhenIdle: ehMovel,
      keepBuffer: ehMovel ? 0 : 1,
      noWrap: true,
      bounds: bounds
    });
    tilesLayer.on("tileload", function () {
      if (!anyTileLoaded) {
        anyTileLoaded = true;
        nativeFailed = false;
        erroEl.hidden = true;
        seloNativo();
        /* um aviso de falha parcial nao e apagado por sucessos tardios */
        if (!hadTileError) {
          setStatus("Tiles de resolu\u00e7\u00e3o nativa carregados.");
        }
      }
    });
    tilesLayer.on("tileerror", function () {
      /* falha parcial nao e terminal: so o evento 'load' (lote da
         vista encerrado) decide se ZERO pixels chegaram */
      hadTileError = true;
      if (!nativeFailed) {
        setStatus("Falha em parte dos tiles nativos; a pr\u00e9via " +
          "permanece como apoio.");
      }
    });
    tilesLayer.on("load", function () {
      /* 'load' = o lote visivel terminou. Se nenhum pixel chegou ate
         aqui, o nativo falhou de fato: fatal so se a previa tambem
         falhou; se ela existir, aviso honesto de reserva */
      if (!anyTileLoaded) {
        nativeFailed = true;
        if (previewFailed) {
          erroEl.hidden = false;
          setStatus("");
        } else {
          setStatus("Falha nos tiles nativos; a pr\u00e9via " +
            "permanece como reserva.");
        }
      }
    });
    tilesLayer.addTo(map);
    /* a previa vira apoio sob a malha nativa inteira — nao e removida */
    if (overlayLayer) {
      overlayLayer.setBounds(bounds);
    }
    if (centroAlvo && zoomAlvo !== null) {
      zoomAlvo = Math.min(m.maxZoom, Math.max(m.minZoom, zoomAlvo));
      map.setView(centroAlvo, zoomAlvo, { animate: false });
    } else {
      /* sem previa pronta: mesma cobertura inicial */
      map.setView(bounds.getCenter(),
        map.getBoundsZoom(bounds, true), { animate: false });
    }
    /* limites restaurados (propriedade direta: sem clamp imediato do
       setMaxBounds) e o listener religado so com a vista ja valida —
       moveends tardios de animacoes mortas avaliam estado correto */
    map.options.maxBounds = bounds;
    map.on("moveend", map._panInsideMaxBounds);
    homeBounds = bounds;
    if (window.GOTATLAS) {
      window.GOTATLAS.setView({ mode: "native", manifest: m });
    }
  }

  function carregarTiles() {
    fetch(MANIFEST_URL)
      .then(function (resp) {
        if (!resp.ok) {
          throw new Error("manifesto ausente (HTTP " + resp.status + ")");
        }
        return resp.json();
      })
      .then(function (m) {
        if (!manifestoValido(m)) {
          nativoIndisponivel();
          return;
        }
        ativarNativo(m);
      })
      .catch(nativoIndisponivel);
  }

  /* boot: manifesto e previa correm em paralelo — quem chegar
     primeiro monta a sua parte sem esperar o outro */
  carregarTiles();
})();
